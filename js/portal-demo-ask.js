// Ask Xevrion for the customer portal presentation (/customer-portal): the questions an owner and their team ask most,
// answered from the example company's own records, the way portal_assistant.py answers without the AI ("your records
// word for word"): each answer names the records it used, links to the page that shows each one, offers questions to
// ask next, and says plainly when the records do not hold the answer. Nothing is sent anywhere.
//
// Why these questions (evidence): NN/g 2023 ("new AI users") found broad starter prompts invite use, so every page
// offers the questions its records can answer; NN/g 2024 ("explainable AI in chat interfaces") found people rarely open
// citations, so the records sit under the answer with a link each. The intents below are the owner's and the team's
// common questions in Henry's brief (who owes me, what is due today, how is a customer, what did the automations do
// this week, how many leads, what needs approval, how do I do something in Xevrion).

const STOP = new Set(("a an and are as at be by can do does for from has have how i in is it its me my of on or our so the this that to was we were what " +
  "when where which who why will with you your xevrion there any us s").split(" "));
const words = (s) => (String(s || "").toLowerCase().match(/[a-z0-9£]+/g) || []).filter((w) => !STOP.has(w));

// what each question is about, with the words that point to it (the first that matches best wins)
export const INTENTS = [
  ["howto", /\bhow (do|can|should) (i|we)\b|\bhow to\b|\bwhere (do|can) (i|we)\b|\bcan i\b.*\b(change|add|invite|connect|pause|turn|stop|export|set)\b/],
  ["security", /secur|phish|password|dmarc|two[- ]step|\bmfa\b|breach/],
  ["team", /\bteam\b|workload|too much work|too busy|room for more|who is (busy|free|doing)|capacity|\bstaff\b|\btasks?\b/],
  ["money", /\bowe|\bowed|\bowing|unpaid|overdue|late (invoice|payment|pay)|\bchase|\bdebt|money (in|owed)|\bpaid\b|\binvoices?\b|\bbill(ed|ing)?\b|\bon hold\b/],
  ["approvals", /approv|sign[- ]off|waiting (for|on) me|need(s)? (my|a) (ok|decision)|\bdecide|to check\b/],
  ["today", /\btoday\b|\bdue\b|need(s)? me|my (day|list|work)|\bto do\b|\bthis morning\b/],
  ["automations", /automat|routine|workflow|\bruns?\b|what did .* do|\bxevrion did\b|time saved|hours saved/],
  ["leads", /\bleads?\b|enquir|new business|prospect|\bquotes?\b|pipeline|opportunit|sales/],
  ["customer", /\bcustomers?\b|\bclients?\b|\bhow is\b|\bhow are\b|health|at risk|leaving/],
];

/** The intent of a question: the first INTENTS entry that matches; a question naming a customer is about that customer
 * unless it is plainly about money, approvals, automations, leads, security or how to do something. "" when none fits. */
export function intentOf(question, customerNames = []) {
  const q = String(question || "").toLowerCase();
  const named = customerNames.some((n) => n && q.includes(String(n).toLowerCase().split(/\s+/)[0]));
  const hit = INTENTS.find(([, re]) => re.test(q));
  const key = hit ? hit[0] : "";
  return named && ["", "customer", "today", "team"].includes(key) ? "customer" : key;
}

// a short how-to for the most common "how do I" questions: the steps, and the page that does it
export const HOW_TO = [
  [["connect", "xero", "gmail", "outlook", "tool", "link"], "Connect a tool such as Xero or Gmail", "connections",
    ["Open Connections in the menu.", "Pick the tool and press Connect.", "Sign in to the tool and allow access. Xevrion checks it works and shows Connected."]],
  [["invite", "add", "teammate", "person", "staff", "member", "role"], "Add a teammate", "team",
    ["Open Settings, then Team.", "Press Invite and type their email.", "Pick their role. They get an email to join; you can change the role later."]],
  [["pause", "stop", "turn", "off", "switch"], "Pause everything Xevrion does by itself", "controls",
    ["Open Settings, then Controls.", "Press Pause all and say briefly why.", "Nothing runs or sends until you press Resume. Drafts still wait for you."]],
  [["reply", "replies", "wording", "signature", "facts", "answer"], "Change how replies are written", "enquiries",
    ["Open Customer replies, then Reply settings.", "Edit your facts, such as opening hours and prices.", "Edit the signature. New drafts use the new words at once."]],
  [["reminder", "remind", "chase", "invoice"], "Send a payment reminder", "collections",
    ["Open Invoice follow-up.", "Pick the late invoice. The amount is checked in your accounts first.", "Read the reminder and press Approve. It goes on the next weekday morning."]],
  [["export", "download", "csv", "spreadsheet"], "Download a list as a spreadsheet", "attention",
    ["Open the list you want, such as Inbox or Customers.", "Press the download button at the top right.", "A CSV file saves to your computer. It opens in Excel or Google Sheets."]],
  [["chat", "message", "group", "talk"], "Message your team", "chats",
    ["Open Chats in the menu.", "Pick a chat, or press New to start a group or a one-to-one.", "Type @ and a name to bring someone in. Link a job or an invoice so everyone sees it."]],
  [["automation", "automate", "workflow", "routine"], "Set up a new automation", "automations",
    ["Open Automations, then Library.", "Pick one that fits, or press Design my automation and say what you want.", "Try it on your own records first. It only runs once a person approves it."]],
];

function howTo(question) {
  const q = new Set(words(question).map((w) => w.replace(/s$/, "")));
  let best = null, top = 0;
  for (const h of HOW_TO) {
    const score = h[0].filter((k) => q.has(k.replace(/s$/, ""))).length;
    if (score > top) { top = score; best = h; }
  }
  return best;
}

// questions offered per page (portal_assistant.SUGGEST's idea: only questions the records can answer), then the general ones
export const SUGGEST = {
  // the common ones: two from the records, two of 12B's analysis questions (a chart with the period before)
  "": ["What needs me today?", "Who owes us money?", "Why did sales change this month?", "How old are our unpaid invoices?"],
  attention: ["What needs my approval?", "What is due today?"],
  home: ["What needs me today?", "What needs my approval?"],
  enquiries: ["How many new leads came in?", "Which replies are waiting for me?"],
  customer_operations: ["Which customers may be leaving?", "How is Ashworth Foods?"],
  customers: ["Which customers pay late?", "Which customers may be leaving?", "How is Pennine Plastics?"],
  collections: ["Who owes us money?", "How old are our unpaid invoices?", "Which invoices are on hold?"],
  ask: ["Show sales week by week", "Why did sales change this month?", "Which customers pay late?", "How old are our unpaid invoices?"],
  insights: ["Show sales week by week", "Why did sales change this month?"],
  job_billing: ["Which jobs are not billed yet?", "Who owes us money?"],
  automations: ["What did the automations do this week?", "How do I set up a new automation?"],
  team_work: ["Who has too much work?", "Which tasks are late?"],
  chats: ["How do I message my team?", "What is due today?"],
  dashboard: ["Show sales week by week", "Why did sales change this month?", "What did the automations do this week?"],
  value: ["Why did sales change this month?", "What did the automations do this week?", "Who owes us money?"],
  security_center: ["What should I fix first in security?", "What needs me today?"],
  connections: ["How do I connect Xero?", "What needs me today?"],
};

/** Up to n questions for a page: its own first, then the general list, never twice. */
export function suggestionsFor(page, n = 4) {
  const out = [];
  for (const q of [...(SUGGEST[page] || []), ...SUGGEST[""]]) { if (!out.includes(q)) out.push(q); if (out.length >= n) break; }
  return out;
}

/**
 * The Ask engine. facts(): the example's records as facts, each { id, text, page, topic } (topic: money, today, approvals,
 * automations, leads, team, security, customer:<name>, general), worked out fresh for every question so an approval the
 * visitor just gave is reflected. customerNames: the example's customers, so "How is Ashworth?" finds them.
 */
export function createAsk({ facts, customerNames = [], clock = () => new Date(), rnd = Math.random, insights = null }) {
  const conversations = new Map();         // id -> { id, title, at, page, turns: [{ q, a, mode, note, open, sources, at }] }
  const NOTE = "Example workspace: answered from its records, word for word. In your own workspace Xevrion's AI writes the answer from yours.";
  const pick = (fs, topic) => fs.filter((f) => f.topic === topic || String(f.topic).startsWith(topic + ":"));

  // the answer card's fields (portal_assistant.py, cycle 11): intent, a one-line headline, the rows behind the answer and
  // where to act. Intents use the gateway's names.
  const INTENT_NAME = { money: "owed", today: "due", customer: "customer", customers: "at_risk", automations: "automations_week", leads: "leads",
    approvals: "approvals", team: "team", security: "security", howto: "howto" };
  const PAGE_WORDS = { collections: "Invoice follow-up", job_billing: "Completed work", enquiries: "Customer replies", attention: "Inbox", customers: "Customers",
    automations: "Automations", team_work: "Team", security_center: "Security", opportunities: "Opportunities", connections: "Connections", team: "Team",
    controls: "Controls", chats: "Chats", home: "Home", customer_operations: "Customers" };
  const toneOf = (t) => (/days late|over the limit|watch|may be leaving|failed|asked for a person|needs a fact/i.test(t) ? "warn" : /went well|healthy|paid|on time/i.test(t) ? "ok" : "");
  // the card (portal_assistant_answers.result): a one-line headline (the answer's first sentence), the rest of the summary
  // as the answer, and one row per record (its own label, figure, line and tone). With rows on show, the list lines leave
  // the answer text, so nothing is said twice.
  function card(result, intent) {
    const lines = String(result.answer || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const lead = (lines[0] || "").replace(/^-\s+/, ""), cut = lead.search(/[.!?]\s/);
    const rows = (result.facts || []).filter((f) => f.row);
    const items = rows.map((f) => ({ label: f.row.label, value: f.row.value || "", sub: f.row.sub || "", page: f.page, tone: f.row.tone || "" })).slice(0, 8);
    const text = items.length ? [cut > 0 ? lead.slice(cut + 1).trim() : ""].concat(lines.slice(1).filter((x) => !/^-\s/.test(x))).filter(Boolean).join("\n")
      || (rows.length === 1 ? "The record is below." : (rows.length > items.length ? "The first " + items.length + " of " + rows.length : "The " + items.length) + " records are below, most urgent first. Open one to act on it.") : lines.join("\n");
    const go = result.open, { facts, ...rest } = result;
    return { ...rest, intent: result.unknown ? "unknown" : INTENT_NAME[intent] || "records", headline: cut > 0 ? lead.slice(0, cut + 1) : lead,
      answer: text || (cut > 0 ? lead.slice(0, cut + 1) : lead), items, total: rows.length,
      actions: go ? [{ label: "Open " + (PAGE_WORDS[go] || "the page"), go }] : [], ai_unavailable: false, checked: true };
  }

  async function answer(question) {
    // an analysis question (a figure against the period before, week by week, who pays late, how old the debts are) gets
    // 12B's insight answer: period, figures, chart and the rows and sources behind them (portal-demo-insights.js)
    const insight = insights ? await insights(question) : null;
    if (insight) return insight;
    const intent = intentOf(question, customerNames), q = String(question).toLowerCase();
    const named = customerNames.some((n) => q.includes(String(n).toLowerCase().split(/\s+/)[0]));
    return card(await answerOf(question, intent), intent === "customer" && !named ? "customers" : intent);
  }

  async function answerOf(question, intentKnown) {
    const fs = await facts(), intent = intentKnown;
    const lines = [], used = [];
    const use = (f) => { if (f && !used.includes(f)) used.push(f); return f; };
    let open = "", follow = [];
    if (intent === "howto") {
      const h = howTo(question);
      if (h) {
        lines.push(h[1] + ":", ...h[3].map((s, i) => "- " + (i + 1) + ". " + s));
        open = h[2]; follow = ["What needs me today?", "Who owes us money?"];
        return { answer: lines.join("\n"), sources: [], open, follow_ups: follow, mode: "records", note: "Steps from Xevrion's own guide. " + NOTE };
      }
    }
    if (intent === "money") {
      // a narrower money question gets only its part: holds, or work not billed yet
      const ql = String(question).toLowerCase();
      const part = /\bon hold\b|\bheld\b|\bquer(y|ied)\b|\bpromis/.test(ql) ? "hold" : /\bjobs?\b|not billed|unbilled|\bbill(ed|ing)?\b|xero drafts?/.test(ql) ? "job" : "";
      // the whole question: the total and every row; a narrower one: its own summary and its rows
      const owed = pick(fs, "money").filter((f) => (part ? f.part === part : f.row || f.id === "TOTAL"));
      const head = owed.find((f) => !f.row);
      if (head) lines.push(use(head).text);
      owed.filter((f) => f !== head).forEach((f) => { lines.push("- " + use(f).text); });
      open = part === "job" ? "job_billing" : "collections"; follow = ["Which invoices are on hold?", "Which jobs are not billed yet?", "What needs my approval?"];
    } else if (intent === "approvals") {
      pick(fs, "approvals").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "attention"; follow = ["Who owes us money?", "What is due today?"];
    } else if (intent === "today") {
      pick(fs, "today").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "attention"; follow = ["What needs my approval?", "Who has too much work?"];
    } else if (intent === "automations") {
      pick(fs, "automations").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "automations"; follow = ["How do I set up a new automation?", "What needs my approval?"];
    } else if (intent === "leads") {
      pick(fs, "leads").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "enquiries"; follow = ["Which replies are waiting for me?", "Which customers may be leaving?"];
    } else if (intent === "team") {
      pick(fs, "team").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "team_work"; follow = ["What is overdue?", "How do I message my team?"];
    } else if (intent === "security") {
      pick(fs, "security").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = "security_center"; follow = ["What needs me today?"];
    } else if (intent === "customer") {
      const q = String(question).toLowerCase();
      const name = customerNames.find((n) => q.includes(String(n).toLowerCase().split(/\s+/)[0]));
      if (name) {
        pick(fs, "customer:" + name).forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
        open = "customers"; follow = ["Which customers may be leaving?", "Who owes us money?"];
      } else {
        pick(fs, "customers").forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
        open = "customers"; follow = customerNames.slice(0, 2).map((n) => "How is " + n.replace(/ Ltd$/, "") + "?");
      }
    }
    if (!lines.length) {
      // no intent, or nothing on file for it: the facts that share the most words with the question (portal_assistant's
      // records answer), or a plain "I don't know" with what it can answer instead
      const q = words(question);
      const hits = fs.map((f, i) => [q.filter((w) => words(f.text).includes(w)).length, i, f]).filter((x) => x[0] >= Math.min(2, q.length) && x[0] > 0)
        .sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]).filter((f, i, all) => !f.ref || all.findIndex((g) => g.ref === f.ref) === i).slice(0, 3);
      if (!hits.length) {
        return { answer: "I could not find that in this workspace's records, so I will not guess.\nI can answer questions about money owed, what is due today, your customers, your automations, new leads, your team and how to do things in Xevrion.",
          sources: [], open: "", follow_ups: SUGGEST[""].slice(0, 3), mode: "records", note: NOTE, unknown: true };
      }
      hits.forEach((f, i) => lines.push((i ? "- " : "") + use(f).text));
      open = hits[0].page; follow = SUGGEST[""].slice(0, 2);
    }
    return { answer: lines.join("\n"), facts: used, sources: used.map((f) => ({ id: f.ref || f.id, text: f.text, page: f.page })), open: open || (used[0] || {}).page || "",
      follow_ups: follow.filter((x) => x.toLowerCase() !== String(question).trim().toLowerCase()).slice(0, 3), mode: "records", note: NOTE };
  }

  const newId = () => "q_" + Array.from({ length: 12 }, () => Math.floor(rnd() * 16).toString(16)).join("");
  function keep(cid, question, result, page) {
    let c = cid && conversations.get(cid);
    if (!c) { c = { id: newId(), title: String(question).slice(0, 80), at: clock().toISOString(), page: page || "", turns: [] }; conversations.set(c.id, c); }
    c.turns = c.turns.concat([{ q: question, a: result.answer, mode: result.mode, note: result.note, open: result.open, sources: result.sources, at: clock().toISOString() }]).slice(-20);
    c.at = clock().toISOString();
    return c.id;
  }

  /** The routes of portal_assistant.py and ask_files.py: ask, the longer chat question, suggestions, history (list,
   * one, rename, delete one, delete all), files and feedback. */
  async function handle(method, p, q, body) {
    const chat = p === "/O/assistant/chat";
    if ((p === "/O/assistant" || chat) && method === "POST") {
      const question = String(body.question || "").trim();
      if (question.length < 2) throw Error("Ask a question of at least two characters.");
      if (question.length > (chat ? 2000 : 500)) throw Error(chat ? "Keep the question under 2,000 characters." : "Keep the question under 500 characters.");
      const result = await answer(question);
      // files are read only in a real workspace: the example says so plainly instead of pretending to have read one
      if (chat && Array.isArray(body.files) && body.files.length) result.note = "Example only: files are read in your own workspace, not in this example. " + (result.note || "");
      if (body.keep !== false) result.conversation = keep(body.conversation, question, result, body.page);
      return result;
    }
    if (p === "/O/assistant/files" && method === "POST") throw Error("Files are read in your own workspace, not in this example.");
    if (p === "/O/assistant/suggestions" && method === "GET") return { items: suggestionsFor(q.get("page") || "") };
    if (p === "/O/assistant/history" && method === "GET") return { items: [...conversations.values()].sort((a, b) => b.at.localeCompare(a.at)).map((c) => ({ id: c.id, title: c.title, at: c.at, turns: c.turns.length })), keep_days: 90 };
    if (p === "/O/assistant/history" && method === "DELETE") { const n = conversations.size; conversations.clear(); return { deleted: n }; }
    const m = /^\/O\/assistant\/history\/(q_[0-9a-f]{12})$/.exec(p);
    if (m && method === "GET") { const c = conversations.get(m[1]); if (!c) throw Error("That conversation was not found. It may have been deleted."); return JSON.parse(JSON.stringify(c)); }
    if (m && method === "DELETE") return { deleted: conversations.delete(m[1]) ? 1 : 0 };
    if (m && method === "PATCH") {
      const c = conversations.get(m[1]); if (!c) throw Error("That conversation was not found. It may have been deleted.");
      const title = String((body && body.title) || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (title.length < 1) throw Error("Give the conversation a name.");
      c.title = title;
      return { id: c.id, title: c.title };
    }
    if (p === "/O/assistant/feedback" && method === "POST") return { thanks: true };
    return undefined;
  }
  return { handle, answer };
}
