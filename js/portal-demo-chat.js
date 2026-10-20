// Team chats for the customer portal presentation (/customer-portal): the gateway's team_chat.py, worked through in the
// visitor's browser on the example company, so Chats in the real app opens, sends, edits, deletes, starts groups and
// one-to-ones, and marks messages read exactly as it does when signed in. It starts from the records team_chat.py itself
// wrote (portal-demo-data.js CHAT, made by tools/portal_demo_fixtures.py) and gives the same views for them (CHAT_VIEW;
// tools/test_portal_demo.mjs compares the two). Nothing leaves the page: every message is held in memory and is gone on reload.
// A teammate answers the visitor's first few messages after a short pause, so the chat is seen working both ways; those
// answers are plain, fixed sentences and say nothing about real people.

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const CHAT_ID = /^[cd]_[0-9a-f]{16}$/;
const clean = (text, limit) => String(text ?? "").replace(CONTROL, "").trim().slice(0, limit);
const oneLine = (text, limit) => clean(text, limit * 2).replace(/\s+/g, " ").trim().slice(0, limit);
const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const hex = (n, rnd) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");

// a stable one-to-one id for a pair (the gateway hashes org|pair with SHA-256; any stable 16-hex id has the same shape)
function pairId(a, b) {
  const s = [a, b].sort().join("|");
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0; }
  return "d_" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// what a teammate says back to the visitor (the first REPLIES_MAX messages only, one answer each)
const ANSWERS = ["Thanks, I will look at it now.", "Got it. I will update the job when it is done.", "Yes, I can do that today.",
  "Seen. I will reply on the record so it is all in one place.", "OK. I will let you know if anything changes."];
const REPLIES_MAX = 5;
const REPLY_DELAY_MS = 2600;

/**
 * The chat engine. seed: portal-demo-data.js CHAT (chats, messages, inbox, me, limits, link_kinds); people: [{id, name, role}];
 * findRecord(kind, id) gives { label } for a record a message may link to, or null; records(q, kind) lists linkable records.
 * clock() gives the time (tests pass a fixed one); later(fn, ms) schedules a teammate's answer (tests run it at once).
 */
export function createChat(seed, people, { findRecord = () => null, records = () => [], clock = () => new Date(), later = (fn, ms) => setTimeout(fn, ms), rnd = Math.random } = {}) {
  const L = seed.limits || {};
  const LIMIT = { text: L.text || 4000, members: L.members || 50, links: L.links || 5, page: L.page || 50, maxPage: L.max_page || 100, newerMax: L.newer_max || 100,
    preview: L.preview || 120, edits: L.max_edits || 50, hits: L.search_hits || 30 };
  const KINDS = seed.link_kinds || {};
  const me = seed.me;
  const chats = new Map((seed.chats || []).map((c) => [c.id, copy(c)]));
  const msgs = new Map(Object.entries(seed.messages || {}).map(([k, v]) => [k, copy(v).sort((a, b) => a.seq - b.seq)]));
  const inbox = new Map(Object.entries(seed.inbox || {}).map(([k, v]) => [k, copy(v)]));
  const byId = new Map((people || []).map((p) => [p.id, p]));
  let answered = 0;
  const now = () => clock().toISOString();

  // ---------------------------------------------------------------- views (team_chat.py: _entry, inbox_view, public_chat, page_of)
  const entry = (c) => ({ name: c.name || "", kind: c.kind, members: [...(c.members || [])], seq: c.seq | 0, rev: c.rev | 0, at: c.last_at || c.created_at,
    preview: c.last_preview || "", by: c.last_by || "", last_kind: c.last_kind || "text", archived: !!c.archived });
  function touch(account, chat, { mentionSeq = null, readTo = null, remove = false } = {}) {
    const row = inbox.get(account) || { id: account, version: 0, chats: {} };
    const list = { ...(row.chats || {}) };
    if (remove) { if (!(chat.id in list)) return; delete list[chat.id]; }
    else {
      const prev = list[chat.id] || { read: readTo == null ? Math.max(0, (chat.seq | 0) - 1) : 0, mentions: [] };
      const e = { ...prev, ...entry(chat) };
      if (readTo != null) e.read = Math.max(prev.read | 0, readTo | 0);
      let ments = (prev.mentions || []).filter((m) => m > (e.read | 0));
      if (mentionSeq != null && mentionSeq > (e.read | 0)) ments = ments.concat([mentionSeq]).slice(-LIMIT.edits);
      e.mentions = ments;
      list[chat.id] = e;
    }
    inbox.set(account, { ...row, chats: list, version: (row.version | 0) + 1, updated_at: now() });
  }
  function inboxView(account, withPeople = false) {
    const row = inbox.get(account) || { version: 0, chats: {} };
    let unread = 0, mentions = 0;
    const items = Object.entries(row.chats || {}).map(([cid, e]) => {
      const n = Math.max(0, (e.seq | 0) - (e.read | 0)), m = (e.mentions || []).filter((x) => x > (e.read | 0)).length;
      if (!e.archived) { unread += n; mentions += m; }
      return { id: cid, kind: e.kind, name: e.name || "", members: e.members || [], seq: e.seq | 0, read: e.read | 0, unread: n, mentions: m, at: e.at,
        preview: e.preview || "", by: e.by || "", last_kind: e.last_kind || "text", archived: !!e.archived, rev: e.rev | 0 };
    });
    items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    items.sort((a, b) => Number(a.archived) - Number(b.archived));
    const out = { version: row.version | 0, chats: items, unread, mentions, me: account };
    if (withPeople) out.people = [...byId.values()].map((p) => ({ id: p.id, name: p.name, role: p.role }));
    return out;
  }
  const publicChat = (c) => ({ id: c.id, kind: c.kind, name: c.name || "", topic: c.topic || "", members: c.members || [], created_by: c.created_by, created_at: c.created_at,
    archived: !!c.archived, seq: c.seq | 0, rev: c.rev | 0,
    reads: Object.fromEntries(Object.entries(c.reads || {}).filter(([k]) => (c.members || []).includes(k)).map(([k, v]) => [k, v | 0])),
    names: Object.fromEntries((c.members || []).map((a) => [a, byId.get(a)?.name || "A former member"])) });
  const publicMsg = (m) => (m.deleted
    ? { seq: m.seq, kind: m.kind || "text", author: m.author, at: m.at, deleted: true, text: "", mentions: [], links: [], edited_at: m.edited_at ?? null }
    : { seq: m.seq, kind: m.kind, author: m.author, text: m.text, mentions: m.mentions, links: m.links, at: m.at, edited_at: m.edited_at ?? null, deleted: m.deleted });
  function pageOf(chat, before = 0, after = 0, limit = LIMIT.page, changedSince = -1) {
    limit = Math.max(1, Math.min(limit | 0 || LIMIT.page, LIMIT.maxPage));
    const all = msgs.get(chat.id) || [];
    const newest = [...all].reverse();
    let items, gap = false;
    if (after) {
      const rows = newest.slice(0, LIMIT.newerMax), newer = rows.filter((r) => r.seq > after);
      gap = newer.length === rows.length && rows.length === LIMIT.newerMax && rows[rows.length - 1].seq > after + 1;
      items = newer;
    } else items = newest.filter((r) => !before || r.seq < before).slice(0, limit);
    const changed = [];
    if (changedSince >= 0) {
      const shown = new Set(items.map((m) => m.seq));
      const seqs = [...new Set((chat.edits || []).filter(([, r]) => (r | 0) > changedSince).map(([s]) => s | 0))].sort((a, b) => a - b).slice(-LIMIT.edits);
      seqs.forEach((s) => { if (!shown.has(s)) { const m = all.find((x) => x.seq === s); if (m) changed.push(m); } });
    }
    const oldest = items.length ? items[items.length - 1].seq : 0;
    return { items: items.map(publicMsg), changed: changed.map(publicMsg), gap, more: !!items.length && !after && oldest > 1,
      next_before: items.length && !after ? oldest : null, seq: chat.seq | 0, rev: chat.rev | 0 };
  }

  // ---------------------------------------------------------------- changes (team_chat.py: _post, _event, _changed)
  function chatOf(cid, account) {
    const c = CHAT_ID.test(cid || "") ? chats.get(cid) : null;
    if (!c || !(c.members || []).includes(account)) throw Error("That chat was not found.");
    return c;
  }
  function post(cid, author, text, { kind = "text", mentions = [], links = [] } = {}) {
    const old = chats.get(cid);
    if (!old) throw Error("That chat was not found.");
    if (old.archived && kind === "text") throw Error("This chat is archived. Unarchive it to send messages.");
    if (kind === "text" && !(old.members || []).includes(author)) throw Error("That chat was not found.");
    const seq = (old.seq | 0) + 1, moment = now(), reads = { ...(old.reads || {}) };
    if (kind === "text") reads[author] = seq;
    const chat = { ...old, seq, rev: (old.rev | 0) + 1, last_at: moment, last_by: author, last_preview: oneLine(text, LIMIT.preview), last_kind: kind, reads };
    chats.set(cid, chat);
    const msg = { id: String(1e12 - seq).padStart(12, "0"), seq, kind, author, text, mentions, links, at: moment, edited_at: null, deleted: false };
    msgs.set(cid, (msgs.get(cid) || []).concat([msg]));
    (chat.members || []).forEach((m) => touch(m, chat, { mentionSeq: mentions.includes(m) ? seq : null, readTo: m === author ? seq : null }));
    return [chat, msg];
  }
  const event = (cid, actor, words) => post(cid, actor, words, { kind: "event" });
  function changeMessage(cid, seq, fn) {
    const list = msgs.get(cid) || [], i = list.findIndex((m) => m.seq === seq);
    const next = fn(i < 0 ? null : list[i]);
    if (next == null) return list[i];
    list[i] = next;
    const old = chats.get(cid), rev = (old.rev | 0) + 1;
    const edits = (old.edits || []).filter((e) => (e[0] | 0) !== seq).concat([[seq, rev]]).slice(-LIMIT.edits);
    const chat = { ...old, rev, edits };
    if (seq === (old.seq | 0)) chat.last_preview = next.deleted ? "Message deleted" : oneLine(next.text, LIMIT.preview);
    chats.set(cid, chat);
    (chat.members || []).forEach((m) => touch(m, chat));
    return next;
  }
  const realMentions = (text, wanted, chat) => {
    const low = text.toLowerCase();
    return [...new Set(wanted || [])].filter((a) => (chat.members || []).includes(a) && byId.has(a) && low.includes("@" + byId.get(a).name.toLowerCase())).slice(0, 20);
  };
  function realLinks(wanted) {
    const out = [], seen = new Set();
    (wanted || []).slice(0, LIMIT.links).forEach((l) => {
      const kind = String(l?.kind || ""), id = String(l?.id || ""), key = kind + ":" + id;
      if (seen.has(key)) return; seen.add(key);
      if (!KINDS[kind]) throw Error("That kind of record cannot be linked.");
      const rec = findRecord(kind, id);
      if (!rec) throw Error("That " + KINDS[kind].word.toLowerCase() + " was not found in this workspace.");
      out.push({ kind, id, label: oneLine(rec.label, 120), page: KINDS[kind].page, word: KINDS[kind].word });
    });
    return out;
  }
  // a teammate's short answer to the visitor, a moment later (never to an event line, never more than REPLIES_MAX)
  function answer(cid) {
    const c = chats.get(cid), others = (c?.members || []).filter((a) => a !== me && byId.has(a));
    if (!others.length || answered >= REPLIES_MAX || c.archived) return;
    const who = others[answered % others.length], text = ANSWERS[answered % ANSWERS.length];
    answered += 1;
    later(() => { try { const cur = chats.get(cid); if (cur && !cur.archived && (cur.members || []).includes(who)) { post(cid, who, text); readUpTo(cid, who, null); } } catch (e) { /* the chat changed meanwhile */ } }, REPLY_DELAY_MS);
  }
  function readUpTo(cid, account, upto) {
    let chat = chats.get(cid);
    const to = upto == null ? chat.seq | 0 : Math.min(upto | 0, chat.seq | 0);
    if (((chat.reads || {})[account] | 0) < to) { chat = { ...chat, reads: { ...(chat.reads || {}), [account]: to } }; chats.set(cid, chat); }
    touch(account, chat, { readTo: to });
  }

  // ---------------------------------------------------------------- the routes (team_chat.register)
  function handle(method, path, q, body) {
    const p = path.replace(/^\/O\/team\/chat/, "");
    let m;
    if (method === "GET" && p === "") {
      const out = { ...inboxView(me, q.get("people") === "true" || q.get("people") === "1"), can_start_group: true,
        limits: { text: LIMIT.text, members: LIMIT.members, links: LIMIT.links, per_minute: L.per_minute || 30 } };
      return out;
    }
    if (method === "POST" && p === "/groups") {
      const name = oneLine(body.name, 60), topic = oneLine(body.topic, 200);
      if (!name) throw Error("Give the chat a name.");
      const wanted = [...new Set(body.members || [])];
      if (wanted.some((a) => !byId.has(a))) throw Error("Everyone in a chat must be an active member of this workspace.");
      const members = [...new Set([me, ...wanted])].slice(0, LIMIT.members);
      const cid = "c_" + hex(16, rnd), moment = now();
      chats.set(cid, { id: cid, kind: "group", name, topic, members, created_by: me, created_at: moment, seq: 0, rev: 0, edits: [], reads: {}, archived: false });
      const names = members.filter((a) => a !== me).map((a) => byId.get(a).name).join(", ");
      event(cid, me, byId.get(me).name + " started " + name + (names ? " with " + names : ""));
      return { ...publicChat(chats.get(cid)) };
    }
    if (method === "POST" && p === "/dms") {
      if (body.account === me) throw Error("Pick a teammate to message.");
      if (!byId.has(body.account)) throw Error("You can only message active members of this workspace.");
      const cid = pairId(me, body.account);
      if (!chats.has(cid)) {
        const fresh = { id: cid, kind: "dm", name: "", topic: "", members: [me, body.account].sort(), created_by: me, created_at: now(), seq: 0, rev: 0, edits: [], reads: {}, archived: false };
        chats.set(cid, fresh);
        fresh.members.forEach((a) => touch(a, fresh, { readTo: 0 }));
      }
      return publicChat(chats.get(cid));
    }
    if ((m = /^\/channels\/([^/]+)$/.exec(p))) {
      const chat = chatOf(m[1], me);
      if (method === "GET") return { ...publicChat(chat), can_manage: chat.kind === "group" };
      if (method === "PATCH") {
        if (chat.kind !== "group") throw Error("One-to-one chats cannot be renamed or archived.");
        const next = { ...chat }, name = byId.get(me).name;
        if (body.name != null) { next.name = oneLine(body.name, 60); if (!next.name) throw Error("Give the chat a name."); }
        if (body.topic != null) next.topic = oneLine(body.topic, 200);
        if (body.archived != null) next.archived = !!body.archived;
        chats.set(chat.id, next);
        if (body.name != null && next.name !== chat.name) event(chat.id, me, name + " renamed the chat to " + next.name);
        if (body.archived != null && !!body.archived !== !!chat.archived) event(chat.id, me, name + " " + (body.archived ? "archived" : "unarchived") + " the chat");
        const saved = chats.get(chat.id);
        (saved.members || []).forEach((a) => touch(a, saved));
        return publicChat(saved);
      }
    }
    if ((m = /^\/channels\/([^/]+)\/members$/.exec(p)) && method === "POST") {
      const chat = chatOf(m[1], me);
      if (chat.kind !== "group") throw Error("People cannot be added to a one-to-one chat. Start a group instead.");
      const toAdd = [...new Set(body.add || [])], remove = [...new Set(body.remove || [])];
      if (toAdd.some((a) => !byId.has(a))) throw Error("Everyone in a chat must be an active member of this workspace.");
      const cur = [...(chat.members || [])], added = toAdd.filter((a) => !cur.includes(a)), removed = remove.filter((a) => cur.includes(a));
      const members = cur.filter((a) => !removed.includes(a)).concat(added);
      if (members.length > LIMIT.members) throw Error("A chat can have up to " + LIMIT.members + " people.");
      if (!members.length) throw Error("A chat needs at least one person. Archive it instead.");
      const saved = { ...chat, members, rev: (chat.rev | 0) + 1, reads: Object.fromEntries(Object.entries(chat.reads || {}).filter(([k]) => members.includes(k))) };
      chats.set(chat.id, saved);
      removed.forEach((a) => touch(a, saved, { remove: true }));
      added.forEach((a) => touch(a, saved, { readTo: saved.seq | 0 }));
      const name = byId.get(me).name, label = (ids) => ids.map((a) => byId.get(a)?.name || "a former member").join(", ");
      if (added.length) event(chat.id, me, name + " added " + label(added));
      if (removed.length) event(chat.id, me, removed.length === 1 && removed[0] === me ? name + " left the chat" : name + " removed " + label(removed));
      const final = chats.get(chat.id);
      return (final.members || []).includes(me) ? publicChat(final) : { id: chat.id, left: true };
    }
    if ((m = /^\/channels\/([^/]+)\/messages$/.exec(p))) {
      const chat = chatOf(m[1], me);
      if (method === "GET") {
        const before = Number(q.get("before") || 0), after = Number(q.get("after") || 0);
        if (before < 0 || after < 0) throw Error("That place in the chat does not exist.");
        return { ...pageOf(chat, before, after, Number(q.get("limit") || LIMIT.page), Number(q.get("changed_since") ?? -1)),
          reads: Object.fromEntries(Object.entries(chat.reads || {}).filter(([k]) => (chat.members || []).includes(k)).map(([k, v]) => [k, v | 0])) };
      }
      if (method === "POST") {
        const text = clean(body.text, LIMIT.text);
        if (!text) throw Error("Write a message first.");
        const [, msg] = post(chat.id, me, text, { mentions: realMentions(text, body.mentions, chat), links: realLinks(body.links) });
        answer(chat.id);
        return publicMsg(msg);
      }
    }
    if ((m = /^\/channels\/([^/]+)\/messages\/(\d+)$/.exec(p))) {
      const chat = chatOf(m[1], me), seq = Number(m[2]);
      if (method === "PATCH") {
        if (chat.archived) throw Error("This chat is archived. Unarchive it to edit messages.");
        const text = clean(body.text, LIMIT.text);
        if (!text) throw Error("Write a message first.");
        const mentions = realMentions(text, body.mentions, chat);
        return publicMsg(changeMessage(chat.id, seq, (old) => {
          if (!old) throw Error("That message was not found.");
          if (old.author !== me || old.kind !== "text") throw Error("You can only edit your own messages.");
          if (old.deleted) throw Error("That message was deleted.");
          if (old.text === text && JSON.stringify(old.mentions) === JSON.stringify(mentions)) return null;
          return { ...old, text, mentions, edited_at: now() };
        }));
      }
      if (method === "DELETE") {
        return publicMsg(changeMessage(chat.id, seq, (old) => {
          if (!old) throw Error("That message was not found.");
          if (old.kind !== "text") throw Error("You can only delete your own messages.");
          if (old.deleted) return null;
          return { ...old, text: "", mentions: [], links: [], deleted: true, deleted_by: me, deleted_at: now() };
        }));
      }
    }
    if ((m = /^\/channels\/([^/]+)\/read$/.exec(p)) && method === "POST") {
      chatOf(m[1], me);
      readUpTo(m[1], me, Number(body.seq) || 0);
      return inboxView(me);
    }
    if (p === "/search" && method === "GET") {
      const words = oneLine(q.get("q"), 100).toLowerCase(), only = q.get("chat") || "";
      if (words.length < 2) throw Error("Search for at least 2 letters.");
      const mine = inboxView(me).chats.filter((c) => !only || c.id === only);
      if (only && !mine.length) throw Error("That chat was not found.");
      const hits = [];
      mine.slice(0, 20).forEach((c) => (msgs.get(c.id) || []).slice().reverse().forEach((x) => {
        if (!x.deleted && x.kind === "text" && String(x.text || "").toLowerCase().includes(words)) hits.push({ chat: c.id, chat_name: c.name, kind: c.kind, members: c.members, ...publicMsg(x) });
      }));
      hits.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return { items: hits.slice(0, LIMIT.hits), q: words };
    }
    if (p === "/records" && method === "GET") {
      const kind = q.get("kind") || "";
      if (kind && !["invoice", "job", "reply", "task"].includes(kind)) throw Error("Pick invoices, jobs, replies or tasks.");
      const words = oneLine(q.get("q"), 80).toLowerCase();
      return { items: records(words, kind).slice(0, 20).map((r) => ({ kind: r.kind, id: r.id, label: oneLine(r.label, 120), word: KINDS[r.kind]?.word || "", page: KINDS[r.kind]?.page || "" })) };
    }
    return undefined;
  }

  return { handle, inboxView, publicChat, pageOf, chat: (cid) => chats.get(cid), me };
}
