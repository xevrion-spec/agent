// viz-agent-lab.js: the agent pages' "See it work" section (cycle 19, phase 2; xw/agent_lab.py draws it).
//
// Henry (cycle 19): "every visual needs to be advanced way further, higher resolution and quality and more intuitive";
// the last attempt failed because its interactions were too subtle to notice. Each agent page shows its own screens
// working on the example company, and every one of them answers at once: hover lifts and shows a glass card, click
// opens, toggles move needles and lines, a dry run sends a packet through a rule. The page kinds, one call each:
//
//   inbox(root)     emails: hover previews, open one to read its drafted reply with the record each phrase came from,
//                   Approve (demo only, nothing is sent), Edit and Undo
//   gantt(root)     roadmap: hover a milestone for its card, open it to see its tasks as bars, a line for today
//   kanban(root)    task board: hover a card for its detail, pin it, show the rest of the done column
//   remind(root)    reminder timeline: hover a reminder to read the email it sent, a paid mark for when it landed
//   contract(root)  contract viewer: clauses highlighted by risk, hover for the risk card, click for safer wording
//   donut(root)     risk summary: hover a level, click it to filter the contract next to it
//   gauge(root)     cash cover: choose a moment and the needle swings to its days of spending
//   advice(root)    advice list: open one to read it with its numbers and its source
//   rules(root)     rule builder: the sentence's trigger, conditions and actions light their nodes; Dry run plays it
//   runs(root)      run history: hover a run for what it did, step by step
//
// The charts the shared system already draws (line, bars, flow, table, KPI tiles) are wired by viz-ix.js, which core.js
// loads for their own data-viz="ix" roots. Everything here is complete without this script: the first email, the first
// clause, every figure and a hidden data table are in the page. Every JSON read is guarded; a visual whose data or DOM is
// broken stays static with data-ix-failed. Nothing animates with reduced motion. The module builds no HTML strings.
import { countUp, coarsePointer, hintLabel, keyStep, prefersReduced, rafThrottle, readJson } from "./viz-ix.js";

const clamp = (value, lowest, highest) => Math.max(lowest, Math.min(highest, value));
export const DRY_STEP_MS = 1100;

// ================================================================================================ pure helpers
/** A glass card's model from a data attribute: {title, kicker?, state?, tone?, text?, rows: [[term, value]]}. Null when
 * the attribute is missing or not JSON, so a broken card is simply not shown. */
export function parseCard(text) {
  const model = readJson(text, null);
  if (!model || typeof model !== "object" || Array.isArray(model)) return null;
  const rows = Array.isArray(model.rows) ? model.rows.filter((rowItem) => Array.isArray(rowItem) && rowItem.length === 2).map((rowItem) => [String(rowItem[0]), String(rowItem[1])]) : [];
  return { title: String(model.title ?? ""), kicker: String(model.kicker ?? model.project ?? ""), state: String(model.state ?? ""), tone: String(model.tone ?? "neutral"),
    text: String(model.text ?? ""), rows };
}

/** Where a card of size (width, height) goes for an anchor box, inside a root box: centred above the anchor, flipped below
 * when there is no room above, kept inside the root's width. Boxes are {left, top, width, height} in page pixels. */
export function placeCard(anchor, rootBox, width, height, spacing = 10) {
  const centre = anchor.left - rootBox.left + anchor.width / 2;
  const left = clamp(centre - width / 2, 4, Math.max(4, rootBox.width - width - 4));
  const above = anchor.top - rootBox.top - height - spacing;
  const below = above < 0;
  const cardTop = below ? anchor.top - rootBox.top + anchor.height + spacing : above;
  return { left: Math.round(left), top: Math.round(cardTop), below };
}

/** The needle's share of the dial (0..1) for days on a scale of `scale` days. */
export function dialShare(days, scale) {
  if (!(scale > 0) || !Number.isFinite(Number(days))) return 0;
  return clamp(Number(days) / scale, 0, 1);
}

/** The filled arc's dash for the same share (the arc's path length is 100). */
export function dialDash(days, scale) {
  return `${(dialShare(days, scale) * 100).toFixed(3)} 200`;
}

/** The next filter when a risk level is chosen: choosing the current one clears it. */
export function nextFilter(current, risk) {
  return current === risk ? null : risk;
}

/** Whether a clause with `risk` stays bright under `filter` (no filter: every clause does). */
export function filterMatch(risk, filter) {
  return !filter || risk === filter;
}

/**
 * The dry run's script for one rule: which node lights at each step and what the status line says. `nodes` are
 * [{title, kind}] in graph order; `dry` is the rule's dry run from the app ([{name, would}]). An approval step ("A person
 * approves: X") is said on the node it guards; each node gets its own matching line, or a plain one.
 */
export function dryRunPlan(nodes, dryRunSteps) {
  const lines = Array.isArray(dryRunSteps) ? dryRunSteps.filter((step) => step && typeof step.name === "string") : [];
  return nodes.map((node, index) => {
    const title = String(node.title || "").toLowerCase();
    if (node.kind === "trigger") return { node: index, say: `${node.title}: the example event arrives.` };
    const gate = lines.find((step) => step.name.toLowerCase() === `a person approves: ${title}`);
    const ownLine = lines.find((step) => step.name.toLowerCase() === title) || lines.find((step) => node.kind === "log" && /audit|log/i.test(step.name))
      || lines.find((step) => node.kind === "condition" && /^only if/i.test(step.name));
    const parts = [gate ? gate.would : "", ownLine ? ownLine.would : ""].filter(Boolean);
    return { node: index, say: parts.length ? parts.join(" ") : `${node.title}.` };
  });
}

/** An email entry's words for the reminder panel: {kicker, subject, body, sign}. */
export function mailModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  const dayNumber = Number(entry.day);
  const when = Number.isFinite(dayNumber) ? `day ${dayNumber} after the due date` : "";
  if (entry.kind === "paid") return { kicker: `${entry.customer} · ${entry.ref} · ${when}`, subject: String(entry.subject || ""), body: String(entry.body || ""), sign: "" };
  return { kicker: `To ${entry.customer} · ${entry.ref} · ${when}`, subject: String(entry.subject || ""), body: String(entry.body || ""), sign: String(entry.sign || "") };
}

// ================================================================================================ DOM helpers
function make(owner, tagName, className = "", text = "") {
  const element = owner.createElement(tagName);
  if (className) element.setAttribute("class", className);
  if (text !== "") element.textContent = text;
  return element;
}

const ownerOf = (root) => root.ownerDocument || globalThis.document;
const boxOf = (element) => {
  try { return element.getBoundingClientRect(); } catch { return { left: 0, top: 0, width: 0, height: 0 }; }
};
const selectAll = (root, selector) => [...root.querySelectorAll(selector)];
const isTouch = (event) => event?.pointerType === "touch";

function label(owner, text, tone = "neutral") {
  const chip = make(owner, "span", "xl", text);
  chip.setAttribute("data-t", tone);
  return chip;
}

/** The polite live region that reads what changed (visually hidden). */
function liveRegion(root) {
  let region = root.querySelector(":scope > [data-lab-say]");
  if (!region) {
    region = make(ownerOf(root), "span", "sr-only");
    region.setAttribute("data-lab-say", "");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    root.appendChild(region);
  }
  return (text) => { region.textContent = text; };
}

/** The glass card (the root's [data-lab-card]): show(model, anchor) fills it and places it by the anchor; hide(). */
function glassCard(root) {
  const card = root.querySelector("[data-lab-card]");
  const owner = ownerOf(root);
  if (!card) return { show() {}, hide() {} };
  return {
    show(model, anchor, side = "above") {
      if (!model) return;
      card.textContent = "";
      const head = make(owner, "span", "alab-card__k");
      head.appendChild(make(owner, "span", "", model.kicker || ""));
      if (model.state) head.appendChild(label(owner, model.state, model.tone || "neutral"));
      if (model.kicker || model.state) card.appendChild(head);
      if (model.title) card.appendChild(make(owner, "b", "alab-card__t", model.title));
      if (model.text) card.appendChild(make(owner, "p", "alab-card__p", model.text));
      if (model.rows?.length) {
        const list = make(owner, "dl");
        model.rows.forEach(([term, value]) => { list.appendChild(make(owner, "dt", "", term)); list.appendChild(make(owner, "dd", "", value)); });
        card.appendChild(list);
      }
      card.setAttribute("data-show", "");
      const rootBox = boxOf(root), anchorBox = boxOf(anchor);
      const spot = side === "right" && rootBox.width - (anchorBox.right - rootBox.left) > (card.offsetWidth || 280) + 16
        ? { left: Math.round(anchorBox.right - rootBox.left + 12), top: Math.round(anchorBox.top - rootBox.top) }
        : placeCard(anchorBox, rootBox, card.offsetWidth || 280, card.offsetHeight || 120);
      card.style.transform = `translate3d(${spot.left}px, ${spot.top}px, 0)`;
    },
    hide() { card.removeAttribute("data-show"); },
  };
}

/** The "Hover to explore" chip (the shared .ix-hint look), until the first interaction. */
function affordance(root) {
  if (root.querySelector(":scope > [data-ix-hint]")) return;
  const chip = make(ownerOf(root), "span", "ix-hint", hintLabel(coarsePointer()));
  chip.setAttribute("data-ix-hint", "");
  chip.setAttribute("aria-hidden", "true");
  root.appendChild(chip);
  const used = () => root.setAttribute("data-ix-used", "");
  ["pointerdown", "keydown", "focusin"].forEach((type) => root.addEventListener(type, used));
  root.addEventListener("pointermove", (event) => { if (!isTouch(event)) used(); });
}

/** Mark the root live now, and "in" the first time a third of it is on screen (the draw-ins key off both). */
function onEnter(root, callback = () => {}) {
  root.setAttribute("data-ix-live", "");
  const runDry = () => { root.setAttribute("data-ix-in", ""); callback(); };
  const Observer = globalThis.IntersectionObserver;
  if (typeof Observer !== "function") { runDry(); return; }
  try {
    const watcher = new Observer((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      runDry();
    }, { threshold: 0.3 });
    watcher.observe(root);
  } catch { runDry(); }
}

/** Roving focus over items: one tab stop, arrows move it, Home and End jump. Returns move(index, focus). */
function roving(items, onMove) {
  let current = Math.max(0, items.findIndex((item) => item.getAttribute("tabindex") === "0"));
  const move = (index, focus = true) => {
    if (!items.length) return;
    current = clamp(index, 0, items.length - 1);
    items.forEach((item, k) => item.setAttribute("tabindex", k === current ? "0" : "-1"));
    if (focus) items[current].focus?.({ preventScroll: true });
    onMove?.(current);
  };
  items.forEach((item, k) => item.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = keyStep(k, event.key, items.length);
    if (next === null) return;
    event.preventDefault?.();
    move(next);
  }));
  return { move, get index() { return current; } };
}

/** Root-level keyboard for visuals that are one tab stop: arrows move the active item, Enter acts, Escape clears. */
function rootKeys(root, { count, active, moveTo, activate, clear }) {
  root.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== root && event.target?.closest?.("button,a,input,[contenteditable=true]") && event.key !== "Escape") return;
    if (event.key === "Escape") { clear(); event.preventDefault?.(); return; }
    if (event.key === "Enter" || event.key === " ") { activate(Math.max(0, active())); event.preventDefault?.(); return; }
    const next = keyStep(active(), event.key, count());
    if (next === null) return;
    event.preventDefault?.();
    moveTo(next);
  });
}

// ================================================================================================ inbox
export function inbox(root) {
  const threads = selectAll(root, ".ibx-th");
  const panes = selectAll(root, "[data-pane]");
  if (!threads.length || threads.length !== panes.length) return null;
  const card = glassCard(root);
  const announce = liveRegion(root);
  const owner = ownerOf(root);
  let chosen = Math.max(0, threads.findIndex((thread) => thread.getAttribute("aria-pressed") === "true"));

  const open = (index) => {
    chosen = clamp(index, 0, threads.length - 1);
    threads.forEach((thread, k) => thread.setAttribute("aria-pressed", String(k === chosen)));
    panes.forEach((pane, k) => { pane.hidden = k !== chosen; });
    card.hide();
    announce(`${threads[chosen].querySelector("b")?.textContent || ""}: ${threads[chosen].querySelector(".ibx-th__s")?.textContent || ""}. Opened.`);
  };
  const navState = roving(threads, (index) => open(index));
  threads.forEach((thread, index) => {
    thread.addEventListener("click", () => navState.move(index, false));
    thread.addEventListener("pointerenter", (event) => {
      if (isTouch(event) || index === chosen) { card.hide(); return; }
      const peek = readJson(thread.getAttribute("data-peek"), null);
      if (!peek) return;
      const rows = [];
      if (peek.confidence) rows.push(["How sure", `${Math.round(peek.confidence * 100)}%`]);
      rows.push(["Status", peek.status]);
      card.show({ kicker: peek.from, state: peek.kind, tone: "purple", title: "", text: peek.text, rows }, thread, "right");
    });
  });
  root.querySelector(".ibx-list")?.addEventListener("pointerleave", () => card.hide());

  panes.forEach((pane, index) => {
    const marks = selectAll(pane, "mark[data-src]");
    const chips = selectAll(pane, ".ibx-src[data-src]");
    const heat = (keyButton, isOn) => [...marks, ...chips].forEach((element) => element.toggleAttribute("data-hot", isOn && element.getAttribute("data-src") === keyButton));
    [...marks, ...chips].forEach((element) => {
      const keyButton = element.getAttribute("data-src");
      element.addEventListener("pointerenter", () => heat(keyButton, true));
      element.addEventListener("pointerleave", () => heat(keyButton, false));
      element.addEventListener("focus", () => heat(keyButton, true));
      element.addEventListener("blur", () => heat(keyButton, false));
    });
    const draft = pane.querySelector(".ibx-draft");
    if (!draft) return;
    const text = draft.querySelector("[data-draft-text]");
    const approve = draft.querySelector('[data-act="approve"]');
    const edit = draft.querySelector('[data-act="edit"]');
    const undo = draft.querySelector('[data-act="undo"]');
    const done = draft.querySelector("[data-done]");
    const status = threads[index].querySelector(".ibx-th__st");
    const original = status?.textContent || "";
    const stopEditing = () => {
      if (text?.getAttribute("contenteditable") !== "true") return;
      text.setAttribute("contenteditable", "false");
      if (edit) edit.lastChild.textContent = "Edit";
    };
    approve?.addEventListener("click", () => {
      stopEditing();
      draft.setAttribute("data-state", "approved");
      approve.disabled = true;
      if (edit) edit.disabled = true;
      if (undo) undo.hidden = false;
      if (done) done.textContent = "Approved. In the app it sends now. This is a demo: nothing was sent.";
      threads[index].setAttribute("data-approved", "");
      if (status) status.textContent = "Approved";
      undo?.focus?.({ preventScroll: true });
    });
    undo?.addEventListener("click", () => {
      draft.setAttribute("data-state", "draft");
      if (approve) approve.disabled = false;
      if (edit) edit.disabled = false;
      undo.hidden = true;
      if (done) done.textContent = "Back to draft.";
      threads[index].removeAttribute("data-approved");
      if (status) status.textContent = original;
      approve?.focus?.({ preventScroll: true });
    });
    edit?.addEventListener("click", () => {
      if (!text) return;
      const editing = text.getAttribute("contenteditable") === "true";
      if (editing) { stopEditing(); if (done) done.textContent = "Edits kept in this page only."; return; }
      text.setAttribute("contenteditable", "true");
      text.setAttribute("spellcheck", "true");
      edit.lastChild.textContent = "Done";
      if (done) done.textContent = "Editing. Type to change the reply.";
      try {
        text.focus({ preventScroll: true });
        const range = owner.createRange();
        range.selectNodeContents(text);
        range.collapse(false);
        const picked = globalThis.getSelection?.();
        picked?.removeAllRanges();
        picked?.addRange(range);
      } catch { text.focus?.(); }
    });
    text?.addEventListener("keydown", (event) => { if (event.key === "Escape") { stopEditing(); edit?.focus?.(); } });
  });
  affordance(root);
  onEnter(root);
  return { open, get chosen() { return chosen; } };
}

// ================================================================================================ gantt
export function gantt(root) {
  const rows = selectAll(root, ".gnt-row");
  const bars = rows.map((rowItem) => rowItem.querySelector(".gnt-bar"));
  if (!rows.length || bars.some((barElement) => !barElement)) return null;
  const card = glassCard(root);
  const announce = liveRegion(root);
  let active = -1;
  rows.forEach((rowItem, index) => rowItem.style.setProperty("--i", String(index)));

  const show = (index) => {
    active = index;
    rows.forEach((rowItem, k) => rowItem.toggleAttribute("data-active", k === index));
    if (index < 0) { card.hide(); return; }
    const model = parseCard(bars[index].getAttribute("data-card"));
    if (!model) return;
    card.show(model, bars[index]);
    announce(`${model.title}, ${model.kicker}: ${model.state}. ${model.rows.map((rowItem) => rowItem.join(" ")).join(", ")}.`);
  };
  const toggle = (index) => {
    const rowItem = rows[index];
    const tasks = rowItem.querySelector(".gnt-tasks");
    if (!tasks) return;
    const opening = tasks.hidden;
    rows.forEach((other) => { other.removeAttribute("data-open"); const list = other.querySelector(".gnt-tasks"); if (list) list.hidden = true; other.querySelector(".gnt-bar")?.setAttribute("aria-expanded", "false"); });
    if (opening) {
      tasks.hidden = false;
      rowItem.setAttribute("data-open", "");
      bars[index].setAttribute("aria-expanded", "true");
      announce(`${rowItem.querySelector(".gnt-lab")?.textContent || ""}: ${tasks.children.length} tasks shown.`);
      active = index;
      rows.forEach((other, k) => other.toggleAttribute("data-active", k === index));
      card.hide();
      return;
    }
    show(index);
  };
  bars.forEach((barElement, index) => {
    barElement.addEventListener("pointerenter", (event) => { if (!isTouch(event)) show(index); });
    barElement.addEventListener("click", () => toggle(index));
  });
  root.querySelector(".gnt-rows")?.addEventListener("pointerleave", () => { if (active >= 0) show(-1); });
  rootKeys(root, { count: () => rows.length, active: () => active, moveTo: show, activate: toggle,
    clear: () => { rows.forEach((rowItem) => { rowItem.removeAttribute("data-open"); const list = rowItem.querySelector(".gnt-tasks"); if (list) list.hidden = true; }); show(-1); } });
  affordance(root);
  onEnter(root);
  return { show, toggle };
}

// ================================================================================================ kanban
export function kanban(root) {
  const cards = selectAll(root, ".kbn-card");
  if (!cards.length) return null;
  const glass = glassCard(root);
  const announce = liveRegion(root);
  let active = -1, pinned = -1;
  const visible = () => cards.filter((item) => item.offsetParent !== null || !item.classList.contains("is-more"));

  const show = (index, item = visible()[index]) => {
    cards.forEach((other) => other.toggleAttribute("data-active", other === item));
    active = item ? visible().indexOf(item) : -1;
    if (!item) { if (pinned < 0) glass.hide(); return; }
    const model = parseCard(item.getAttribute("data-card"));
    if (!model) return;
    glass.show({ ...model, kicker: model.state, state: "" }, item);
    announce(`${model.title}: ${model.state}. ${model.rows.map((rowItem) => rowItem.join(" ")).join(", ")}.`);
  };
  const pinCard = (index) => {
    const item = visible()[index];
    if (!item) return;
    const already = item.hasAttribute("data-sel");
    cards.forEach((other) => other.removeAttribute("data-sel"));
    pinned = already ? -1 : index;
    if (!already) item.setAttribute("data-sel", "");
    show(index, item);
  };
  cards.forEach((item) => {
    item.addEventListener("pointerenter", (event) => { if (!isTouch(event)) show(-1, item); });
    item.addEventListener("click", () => pinCard(visible().indexOf(item)));
  });
  root.querySelector(".kbn")?.addEventListener("pointerleave", () => {
    if (pinned >= 0) { show(pinned); return; }
    cards.forEach((other) => other.removeAttribute("data-active"));
    glass.hide();
  });
  selectAll(root, "[data-more]").forEach((button) => button.addEventListener("click", () => {
    const column = button.closest(".kbn-col");
    const opening = !column.hasAttribute("data-open");
    column.toggleAttribute("data-open", opening);
    button.setAttribute("aria-expanded", String(opening));
    const hiddenCount = column.querySelectorAll(".kbn-card.is-more").length;
    button.textContent = opening ? "Show fewer" : `Show ${hiddenCount} more`;
  }));
  rootKeys(root, { count: () => visible().length, active: () => active, moveTo: (index) => show(index), activate: pinCard,
    clear: () => { pinned = -1; cards.forEach((other) => other.removeAttribute("data-sel")); show(-1, null); glass.hide(); } });
  affordance(root);
  onEnter(root);
  return { show, pinCard };
}

// ================================================================================================ reminders
export function remind(root) {
  const entries = readJson(root.querySelector("script[data-lab-data]")?.textContent, null);
  const dots = selectAll(root, ".rmd-dot");
  const panel = root.querySelector("[data-mail]");
  if (!Array.isArray(entries) || !dots.length || !panel) return null;
  const owner = ownerOf(root);
  const idle = panel.innerHTML ? [...panel.childNodes].map((node) => node.cloneNode(true)) : [];
  let active = -1;
  const render = (entry) => {
    const model = mailModel(entry);
    panel.textContent = "";
    if (!model) { idle.forEach((node) => panel.appendChild(node.cloneNode(true))); panel.removeAttribute("data-show"); return; }
    const head = make(owner, "p", "rmd-mail__k");
    head.appendChild(make(owner, "b", "", entry.kind === "paid" ? "Payment matched" : "Reminder sent"));
    head.appendChild(make(owner, "span", "", model.kicker));
    panel.appendChild(head);
    panel.appendChild(make(owner, "b", "rmd-mail__s", model.subject));
    panel.appendChild(make(owner, "p", "rmd-mail__b", model.body));
    if (model.sign) panel.appendChild(make(owner, "p", "ibx-sign", model.sign));
    panel.setAttribute("data-show", "");
  };
  const show = (index) => {
    active = index;
    dots.forEach((dotElement, k) => dotElement.toggleAttribute("data-active", k === index));
    render(index >= 0 ? entries[Number(dots[index].getAttribute("data-entry"))] : null);
  };
  dots.forEach((dotElement, index) => {
    dotElement.addEventListener("pointerenter", (event) => { if (!isTouch(event)) show(index); });
    dotElement.addEventListener("click", () => show(index));
  });
  selectAll(root, ".rmd-paid[data-entry]").forEach((mark) => mark.addEventListener("pointerenter", () => {
    dots.forEach((dotElement) => dotElement.removeAttribute("data-active"));
    active = -1;
    render(entries[Number(mark.getAttribute("data-entry"))]);
  }));
  rootKeys(root, { count: () => dots.length, active: () => active, moveTo: show, activate: show, clear: () => show(-1) });
  affordance(root);
  onEnter(root, () => { if (active < 0) { show(dots.length - 1); dots[dots.length - 1].removeAttribute("data-active"); active = -1; } });
  return { show };
}

// ================================================================================================ contract and donut
export function contract(root) {
  const payload = readJson(root.querySelector("script[data-lab-data]")?.textContent, null);
  const marks = selectAll(root, ".ctr-mark[data-f]");
  const compare = root.querySelector("[data-compare]");
  if (!payload || !Array.isArray(payload.findings) || !marks.length || !compare) return null;
  const findings = payload.findings;
  const owner = ownerOf(root);
  const glass = glassCard(root);
  const announce = liveRegion(root);
  const field = (name) => compare.querySelector(`[data-cmp-${name}]`);
  let active = -1, filter = null;

  const visibleMarks = () => marks.filter((mark) => filterMatch(mark.closest(".ctr-cl")?.getAttribute("data-risk"), filter));
  const choose = (finding) => {
    const item = findings[finding];
    if (!item) return;
    marks.forEach((mark) => mark.setAttribute("aria-pressed", String(Number(mark.getAttribute("data-f")) === finding)));
    field("title").textContent = item.n === "Missing" ? `Missing clause · ${item.heading}: ${item.title}` : `${item.n} ${item.heading}: ${item.title}`;
    const chip = field("label");
    chip.textContent = "";
    chip.appendChild(label(owner, item.words, item.tone));
    field("why").textContent = item.why;
    field("old").textContent = item.text;
    field("new").textContent = item.fallback || "No change needed.";
    compare.toggleAttribute("data-none", !item.fallback);
    compare.removeAttribute("data-swap");
    void compare.offsetWidth;
    compare.setAttribute("data-swap", "");
    announce(`${item.title}. ${item.words}. ${item.fallback ? "Safer wording shown." : "No change needed."}`);
  };
  const hover = (index) => {
    const list = visibleMarks();
    active = index;
    marks.forEach((mark) => mark.toggleAttribute("data-active", mark === list[index]));
    if (index < 0 || !list[index]) { glass.hide(); return; }
    const item = findings[Number(list[index].getAttribute("data-f"))];
    glass.show({ kicker: `Clause ${item.n} · ${item.heading}`, state: item.words, tone: item.tone, title: item.title, text: item.why,
      rows: [["Click", item.fallback ? "to compare safer wording" : "to see it in full"]] }, list[index]);
  };
  marks.forEach((mark) => {
    mark.addEventListener("pointerenter", (event) => { if (!isTouch(event)) hover(visibleMarks().indexOf(mark)); });
    mark.addEventListener("pointerleave", () => hover(-1));
    mark.addEventListener("click", () => { choose(Number(mark.getAttribute("data-f"))); glass.hide(); });
  });
  rootKeys(root, { count: () => visibleMarks().length, active: () => active, moveTo: hover,
    activate: (index) => { const mark = visibleMarks()[index]; if (mark) { choose(Number(mark.getAttribute("data-f"))); glass.hide(); } }, clear: () => hover(-1) });
  const controller = {
    choose,
    filter(risk) {
      filter = risk || null;
      root.toggleAttribute("data-filter", !!filter);
      selectAll(root, ".ctr-cl[data-risk]").forEach((clause) => clause.toggleAttribute("data-match", !!filter && clause.getAttribute("data-risk") === filter));
      const first = filter ? findings.findIndex((item) => item.risk === filter) : -1;
      if (first >= 0) choose(first);
      return filter;
    },
  };
  root._lab = controller;
  affordance(root);
  onEnter(root);
  return controller;
}

export function donut(root, context = {}) {
  const host = context.host;
  const keys = selectAll(root, ".dnt-key[data-risk]");
  const arcs = selectAll(root, ".dnt-arc[data-risk]");
  if (!keys.length) return null;
  const count = root.querySelector("[data-dnt-n]");
  const words = root.querySelector("[data-dnt-l]");
  const total = count?.textContent || "";
  const announce = liveRegion(root);
  let filter = null, active = -1;
  const heat = (risk) => {
    [...keys, ...arcs].forEach((element) => element.toggleAttribute("data-hot", !!risk && element.getAttribute("data-risk") === risk));
    const keyButton = keys.find((item) => item.getAttribute("data-risk") === risk);
    if (count) count.textContent = keyButton ? keyButton.querySelector("b")?.textContent || total : total;
    if (words) words.textContent = keyButton ? keyButton.querySelector(".xl")?.textContent || "" : "findings";
  };
  const apply = (risk) => {
    filter = nextFilter(filter, risk);
    keys.forEach((keyButton) => keyButton.setAttribute("aria-pressed", String(keyButton.getAttribute("data-risk") === filter)));
    root.toggleAttribute("data-filter", !!filter);
    heat(filter);
    const target = host?.querySelector?.('[data-lab="contract"]');
    target?._lab?.filter(filter);
    announce(filter ? `Showing ${keys.find((keyButton) => keyButton.getAttribute("data-risk") === filter)?.querySelector(".xl")?.textContent} findings in the contract.` : "Showing every clause.");
  };
  keys.forEach((keyButton, index) => {
    keyButton.addEventListener("pointerenter", () => { active = index; heat(keyButton.getAttribute("data-risk")); });
    keyButton.addEventListener("pointerleave", () => heat(filter));
    keyButton.addEventListener("click", () => apply(keyButton.getAttribute("data-risk")));
  });
  arcs.forEach((arcElement) => {
    arcElement.addEventListener("pointerenter", () => heat(arcElement.getAttribute("data-risk")));
    arcElement.addEventListener("pointerleave", () => heat(filter));
    arcElement.addEventListener("click", () => apply(arcElement.getAttribute("data-risk")));
  });
  rootKeys(root, { count: () => keys.length, active: () => active, moveTo: (index) => { active = index; heat(keys[index].getAttribute("data-risk")); },
    activate: (index) => apply(keys[index].getAttribute("data-risk")), clear: () => { if (filter) apply(filter); heat(null); active = -1; } });
  affordance(root);
  onEnter(root);
  return { apply, get filter() { return filter; } };
}

// ================================================================================================ gauge
export function gauge(root, context = {}) {
  const payload = readJson(root.querySelector("script[data-lab-data]")?.textContent, null);
  const buttons = selectAll(root, "[data-moment]");
  const needle = root.querySelector("[data-gge-needle]");
  const fill = root.querySelector("[data-gge-fill]");
  const days = root.querySelector("[data-gge-days]");
  const cash = root.querySelector("[data-gge-cash]");
  if (!payload || !Array.isArray(payload.states) || !buttons.length || !needle) return null;
  const reduced = context.reduced ?? prefersReduced();
  const glass = glassCard(root);
  const announce = liveRegion(root);
  let current = 0, stop = () => {};
  const scaleLabels = selectAll(root, ".gge-sc");
  scaleLabels.forEach((label) => { label.style.transition = "opacity .35s ease"; });
  const setMoment = (index, animate = true) => {
    const state = payload.states[index];
    if (!state) return;
    const from = payload.states[current]?.days ?? 0;
    current = index;
    buttons.forEach((button, k) => button.setAttribute("aria-pressed", String(k === index)));
    const share = dialShare(state.days, payload.scale);
    needle.style.setProperty("--a", share.toFixed(4));
    // the needle is longer than the scale's radius: a scale number it would cross steps aside for it (fades), so the two
    // never collide (cycle 19 fix)
    scaleLabels.forEach((label) => label.toggleAttribute("data-under", Math.abs(dialShare(Number(label.textContent) || 0, payload.scale) - share) < 0.07));
    fill?.setAttribute("stroke-dasharray", dialDash(state.days, payload.scale));
    stop();
    stop = countUp(days, state.days, { from: animate ? from : state.days, duration: 900, reduced });
    if (cash) cash.textContent = `${state.cash} ${index === 0 ? "in the bank" : "at that point"}`;
    announce(`${state.label}: ${state.cash}, ${state.days} days of spending covered.`);
  };
  buttons.forEach((button, index) => button.addEventListener("click", () => setMoment(index)));
  const startShare = dialShare(payload.states[0]?.days ?? 0, payload.scale);
  scaleLabels.forEach((label) => label.toggleAttribute("data-under", Math.abs(dialShare(Number(label.textContent) || 0, payload.scale) - startShare) < 0.07));
  const ticks = selectAll(root, ".gge-tick");
  ticks.forEach((tick) => {
    const open = () => { tick.setAttribute("data-active", ""); glass.show({ title: tick.getAttribute("data-tip") || "", kicker: "Small UK and US firms", rows: [] }, tick); };
    const close = () => { tick.removeAttribute("data-active"); glass.hide(); };
    tick.addEventListener("pointerenter", open);
    tick.addEventListener("pointerleave", close);
    tick.addEventListener("click", open);
  });
  rootKeys(root, { count: () => buttons.length, active: () => current, moveTo: (index) => setMoment(index), activate: (index) => setMoment(index), clear: () => setMoment(0) });
  affordance(root);
  onEnter(root, () => {
    if (days && !reduced) countUp(days, payload.states[0].days, { from: 0, duration: 1100, reduced });
  });
  return { setMoment, get current() { return current; } };
}

// ================================================================================================ advice
export function advice(root) {
  const items = selectAll(root, ".adv-i[data-adv]");
  const panes = selectAll(root, "[data-adv-pane]");
  if (!items.length || items.length !== panes.length) return null;
  const announce = liveRegion(root);
  const open = (index) => {
    items.forEach((item, k) => item.setAttribute("aria-pressed", String(k === index)));
    panes.forEach((pane, k) => { pane.hidden = k !== index; });
    announce(`${items[index].querySelector("b")?.textContent || ""}. Opened.`);
  };
  const navState = roving(items, open);
  items.forEach((item, index) => item.addEventListener("click", () => navState.move(index, false)));
  affordance(root);
  onEnter(root);
  return { open };
}

// ================================================================================================ rule builder
export function rules(root, context = {}) {
  const tabs = selectAll(root, ".rb-tab[data-tab]");
  const bodies = selectAll(root, ".rb-rule[data-rule]");
  const button = root.querySelector("[data-dry]");
  const status = root.querySelector("[data-rb-say]");
  if (!tabs.length || tabs.length !== bodies.length) return null;
  const reduced = context.reduced ?? prefersReduced();
  const owner = ownerOf(root);
  const idle = status?.textContent || "";
  let current = 0, timers = [], ran = false, onScreen = true;

  const cancel = () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
    root.removeAttribute("data-running");
    bodies.forEach((body) => selectAll(body, ".rb-node").forEach((node) => { node.removeAttribute("data-pkt"); node.removeAttribute("data-hot"); node.removeAttribute("data-done"); }));
  };
  const write = (title, text) => {
    if (!status) return;
    status.textContent = "";
    if (title) status.appendChild(make(owner, "b", "", `${title}. `));
    status.appendChild(owner.createTextNode(text));
  };
  const runDry = () => {
    cancel();
    const body = bodies[current];
    const nodes = selectAll(body, ".rb-node");
    const plan = dryRunPlan(nodes.map((node) => ({ title: node.querySelector("b")?.textContent || "", kind: node.getAttribute("data-kind") })),
      readJson(body.querySelector("script[data-rb-dry]")?.textContent, []));
    root.setAttribute("data-running", "");
    const step = reduced ? 0 : DRY_STEP_MS;
    plan.forEach((item, index) => {
      timers.push(setTimeout(() => {
        nodes.forEach((node, k) => {
          node.toggleAttribute("data-hot", k === item.node);
          if (k < item.node) node.setAttribute("data-done", "");
        });
        const node = nodes[item.node];
        node.removeAttribute("data-pkt");
        void node.offsetWidth;
        node.setAttribute("data-pkt", "");
        write(`Step ${index + 1} of ${plan.length}`, item.say);
      }, index * step));
    });
    timers.push(setTimeout(() => {
      nodes.forEach((node) => { node.removeAttribute("data-hot"); node.setAttribute("data-done", ""); });
      root.removeAttribute("data-running");
      write("Dry run finished", "Nothing was sent or changed. Switch the rule on to run it for real.");
    }, plan.length * step + (reduced ? 0 : 300)));
  };
  const open = (index) => {
    cancel();
    current = clamp(index, 0, tabs.length - 1);
    tabs.forEach((tabButton, k) => tabButton.setAttribute("aria-pressed", String(k === current)));
    bodies.forEach((body, k) => { body.hidden = k !== current; });
    write("", idle);
  };
  const navState = roving(tabs, open);
  tabs.forEach((tabButton, index) => tabButton.addEventListener("click", () => navState.move(index, false)));
  button?.addEventListener("click", runDry);
  bodies.forEach((body) => {
    const tokens = selectAll(body, ".rb-tok[data-kind]");
    const nodes = selectAll(body, ".rb-node[data-kind]");
    const heat = (kind) => {
      tokens.forEach((token) => token.toggleAttribute("data-hot", !!kind && token.getAttribute("data-kind") === kind));
      if (!root.hasAttribute("data-running")) nodes.forEach((node) => node.toggleAttribute("data-hot", !!kind && node.getAttribute("data-kind") === kind));
    };
    [...tokens, ...nodes].forEach((element) => {
      element.addEventListener("pointerenter", () => heat(element.getAttribute("data-kind")));
      element.addEventListener("pointerleave", () => heat(null));
    });
  });
  affordance(root);
  onEnter(root, () => { if (!reduced && !ran && onScreen) { ran = true; timers.push(setTimeout(runDry, 600)); } });
  return {
    open, runDry, cancel,
    visible(isOn) { onScreen = isOn; if (!isOn && root.hasAttribute("data-running")) { cancel(); write("", idle); } },
  };
}

// ================================================================================================ run history
export function runs(root) {
  const entries = readJson(root.querySelector("script[data-lab-data]")?.textContent, null);
  const dots = selectAll(root, ".run-dot[data-entry]");
  if (!Array.isArray(entries) || !dots.length) return null;
  const glass = glassCard(root);
  const announce = liveRegion(root);
  let active = -1;
  const show = (index) => {
    active = index;
    dots.forEach((dotElement, k) => dotElement.toggleAttribute("data-active", k === index));
    if (index < 0) { glass.hide(); return; }
    const entry = entries[Number(dots[index].getAttribute("data-entry"))];
    if (!entry) return;
    const steps = (entry.trace || []).map((step) => `${step[0]}: ${step[1]}`).join(" ");
    glass.show({ kicker: `${entry.day} · ${entry.time}`, state: entry.status, tone: entry.waiting ? "amber" : "green", title: entry.rule, text: steps, rows: entry.facts || [] }, dots[index]);
    announce(`${entry.rule}, ${entry.day} at ${entry.time}: ${entry.status}.`);
  };
  const move = rafThrottle(show);
  dots.forEach((dotElement, index) => {
    dotElement.addEventListener("pointerenter", (event) => { if (!isTouch(event)) move(index); });
    dotElement.addEventListener("click", () => show(index));
  });
  root.querySelector(".run-rows")?.addEventListener("pointerleave", () => show(-1));
  rootKeys(root, { count: () => dots.length, active: () => active, moveTo: show, activate: show, clear: () => show(-1) });
  affordance(root);
  onEnter(root);
  return { show };
}

// ================================================================================================ binding
const KINDS = { inbox, gantt, kanban, remind, contract, donut, gauge, advice, rules, runs };
const ORDER = ["contract"];                     // bound first: the donut drives the contract next to it

/** Wire one page-kind visual. Returns its controller, or null (the visual then stays as drawn, marked data-ix-failed). */
export function bindLab(root, context = {}) {
  if (!root || root._labBound) return root?._labBound || null;
  const binder = KINDS[root.getAttribute("data-lab")];
  if (!binder) return null;
  try {
    const controller = binder(root, context) ?? null;
    if (!controller) { root.setAttribute("data-ix-failed", ""); return null; }
    root._labBound = controller;
    return controller;
  } catch (error) {
    root.setAttribute("data-ix-failed", "");
    globalThis.console?.info?.("[xevrion] lab visual stayed static", root.getAttribute("data-lab"), error?.message || error);
    return null;
  }
}

/** core.js entry: the section came near the screen. */
export function mount(host, { reduced = prefersReduced() } = {}) {
  const roots = selectAll(host, "[data-lab]").sort((first, second) => Number(ORDER.includes(second.getAttribute("data-lab"))) - Number(ORDER.includes(first.getAttribute("data-lab"))));
  const bound = roots.map((root) => {
    if (reduced) root.setAttribute("data-reduced", "");
    return bindLab(root, { host, reduced });
  }).filter(Boolean);
  return { visible(isOn) { bound.forEach((controller) => controller.visible?.(isOn)); } };
}
