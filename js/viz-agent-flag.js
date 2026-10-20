// viz-agent-flag.js: the flagship visual on each agent page (cycle 20; xw/agent_flag.py draws the markup).
//
// Henry (16 Oct): "the main visuals on each page arent interactive ... have the step by step and one very advanced
// interactive visual showing its value". One visual per agent, each ending in a value figure:
//
//   billing(root)     late money recovery: sliders drive an invoice from milestone to paid, a race of days and the fee
//   inbox(root)       a live inbox: choose an email, the reply writes itself with its facts lit, approve; hours saved
//   pm(root)          drag the client's change onto a milestone: hours booked to free people, dates move, priced
//   compliance(root)  contract scanner: sample or pasted clauses checked here, a risk strip, safer wording and a score
//   cfo(root)         13-week cash planner: a late payer, a hire and collecting overdue money redraw the forecast
//   operations(root)  rule builder: chips form a sentence, the graph draws itself, a dry run sends a packet through
//
// Each visual can play a short demo when the visitor asks for it (cycle 24: never by itself) and stops for good once they touch it (Play
// starts it again). The page already holds every control and the first figures, so nothing is lost without this
// script. Every JSON read is guarded. Nothing moves with reduced motion. The pure functions below are the same
// formulas as xw/agent_flag.py and are tested in tools/test_agent_flag.mjs.
import { readJson, prefersReduced } from "./viz-ix.js";

const clamp = (value, lowest, highest) => Math.max(lowest, Math.min(highest, value));
export const DEMO_STEP_MS = 2600;

// ================================================================================================ pure helpers
/** Pounds, rounded (£1,234) or to the penny (£12.34). */
export function pounds(value, pennies = false) {
  const amount = Number(value) || 0;
  const sign = amount < 0 ? "−" : "";
  const text = Math.abs(amount).toLocaleString("en-GB", pennies ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  return `${sign}£${text}`;
}

const round1 = (value) => Math.round(value * 10) / 10;

/** Late money in a month, the days sooner it lands and the success fee (xw/agent_flag.py billing_model). */
export function billingModel({ invoices, value, daysLate, agentDays, lateShare = 0.49, feeRate = 0.01 }) {
  const late = Math.round(Math.max(0, Number(invoices) || 0) * lateShare);   // a whole number of invoices; the money follows it
  const recovered = late * Math.max(0, Number(value) || 0);
  const sooner = Math.max(0, (Number(daysLate) || 0) - agentDays);
  return { late, recovered: Math.round(recovered), sooner: Math.round(sooner), fee: Math.round(recovered * feeRate * 100) / 100,
    cashDays: Math.round(recovered * sooner) };
}

/** Hours saved a month from replies a week and minutes saved on each (xw/agent_flag.py inbox_hours). */
export function inboxHours(repliesAWeek, minutes, weeksAMonth = 52 / 12) {
  return round1(Math.max(0, repliesAWeek) * Math.max(0, minutes) * weeksAMonth / 60);
}

/** The draft cut into runs of plain text and marked phrases: [{text, source}] where source is the fact's index or -1. */
export function draftSegments(draft, sources) {
  const marks = [];
  (sources || []).forEach((source, index) => {
    const where = String(draft).indexOf(source.phrase);
    if (where >= 0 && source.phrase) marks.push({ start: where, end: where + source.phrase.length, source: index });
  });
  marks.sort((first, second) => first.start - second.start);
  const runs = [];
  let cursor = 0;
  marks.forEach((mark) => {
    if (mark.start < cursor) return;
    if (mark.start > cursor) runs.push({ text: draft.slice(cursor, mark.start), source: -1 });
    runs.push({ text: draft.slice(mark.start, mark.end), source: mark.source });
    cursor = mark.end;
  });
  if (cursor < draft.length) runs.push({ text: draft.slice(cursor), source: -1 });
  return runs;
}

/** Working days the dates move, tasks made and the change's price (xw/agent_flag.py pm_impact). */
export function pmImpact(hours, freePerDay, rate) {
  const size = Math.max(0, Number(hours) || 0);
  return { days: size > 0 && freePerDay > 0 ? Math.ceil(size / freePerDay) : 0, tasks: Math.max(1, Math.ceil(size / 4)), price: Math.round(size * rate) };
}

/** Calendar days for working days (5 working days to a week). */
export function calendarDays(workingDays) {
  return workingDays <= 0 ? 0 : Math.floor((workingDays - 1) / 5) * 7 + ((workingDays - 1) % 5) + 1;
}

/** Hours booked to whoever has most free hours first, in whole half-hours: [{name, hours}]. Hours nobody has room
 * for go to "Next week". */
export function bookHours(team, hours) {
  const people = (team || []).map((person) => ({ name: person.name, free: Math.max(0, Number(person.free) || 0) })).sort((first, second) => second.free - first.free);
  let left = Math.round(Math.max(0, hours) * 2) / 2;
  const booked = [];
  for (const person of people) {
    if (left <= 0) break;
    const take = Math.min(left, Math.floor(person.free * 2) / 2);
    if (take > 0) { booked.push({ name: person.name, hours: take }); left = Math.round((left - take) * 2) / 2; }
  }
  if (left > 0) booked.push({ name: "Next week", hours: left });
  return booked;
}

const SAFER = {
  pay: "The Client will pay each invoice within 30 days of the invoice date.",
  ip: "The Supplier assigns to the Client the intellectual property in the deliverables once they are paid for in full. The Supplier keeps the tools and know-how it owned before, and the Client may use them in the deliverables.",
  indemnity: "The Supplier will indemnify the Client against claims from others caused by its breach of this agreement, up to the liability cap in this agreement.",
  renew: "This agreement ends after 12 months unless both parties agree in writing to renew it.",
  secret: "Each party will keep the other's confidential information secret for 2 years after this agreement ends.",
  unpaid: "The Supplier may suspend the services, or end this agreement with 7 days' written notice, if an invoice is more than 30 days overdue.",
};

/** One clause checked with simplified versions of the Compliance Agent's rules: {risk, title, why, safer} or null. */
export function clauseRisk(text, saferLiability = "") {
  const words = String(text || "");
  if (/unlimited liability|liability (?:is|shall be) unlimited|without (?:any )?limit/i.test(words)) {
    return { risk: "high", title: "No limit on liability", why: "If something goes wrong, you could owe far more than the job is worth.", safer: saferLiability };
  }
  if (/assigns? all intellectual property|all intellectual property[^.]*to the client/i.test(words)) {
    const before = /owned before|existing|pre-existing/i.test(words);
    return { risk: "high", title: "You give away all your IP", why: before ? "This includes tools you owned before the job, so you could lose the right to reuse them." : "Everything you make passes to them, even work you reuse.", safer: SAFER.ip };
  }
  const paid = words.match(/(?:pay|paid)[^.]*?within (\d+) days/i);
  if (paid) {
    const days = Number(paid[1]) + (/end of the month/i.test(words) ? 30 : 0);
    if (days <= 30) return { risk: "low", title: `Paid within ${days} days`, why: `The payment date is within 30 days.`, safer: "" };
    return { risk: days > 60 ? "high" : "medium", title: `Slow payment: up to ${days} days`, why: `You could wait ${days} days for your money. 30 days is the usual term.`, safer: SAFER.pay };
  }
  if (/indemnif/i.test(words) && /\b(?:all|any kind|unlimited|any and all)\b/i.test(words)) {
    return { risk: "medium", title: "Open-ended indemnity", why: "You would pay for the other side's claims, with no cap.", safer: SAFER.indemnity };
  }
  if (/renews? automatically|automatic(?:ally)? renew|auto-renew/i.test(words)) {
    return { risk: "medium", title: "Renews by itself", why: "It rolls on unless you remember to give notice in time.", safer: SAFER.renew };
  }
  if (/secret|confidential/i.test(words)) {
    if (/forever|perpetu|indefinitely|for all time/i.test(words)) return { risk: "medium", title: "Secret forever", why: "A duty with no end date is hard to keep and to prove.", safer: SAFER.secret };
    const years = words.match(/for (\d+) years?/i);
    if (years) return { risk: "low", title: `Secret for ${years[1]} years`, why: "A fixed time limit is normal.", safer: "" };
  }
  if (/governed by the law of england/i.test(words)) return { risk: "low", title: "UK law: England", why: "Disputes are handled under the law of England and Wales.", safer: "" };
  return null;
}

/** Every clause checked, plus a finding for a protection that is missing. clauses: [[number, heading, text]]. */
export function scanContract(clauses, saferLiability = "", known = {}) {
  const rows = (clauses || []).map(([number, heading, text]) => {
    const found = clauseRisk(text, saferLiability);
    if (found && known[found.title]) Object.assign(found, known[found.title]);
    return { number: String(number), heading: String(heading), text: String(text), finding: found };
  });
  const canStop = rows.some((entryRow) => /(?:terminate|end this agreement|suspend)/i.test(entryRow.text) && /unpaid|non-?payment|not paid|overdue/i.test(entryRow.text));
  const missing = canStop ? null : { risk: "medium", title: "No way out if unpaid", why: "Nothing lets you stop work if invoices go unpaid.", safer: SAFER.unpaid, ...(known["No way out if unpaid"] || {}) };
  const risks = rows.map((entryRow) => entryRow.finding?.risk).filter(Boolean).concat(missing ? [missing.risk] : []);
  return { rows, missing, score: contractScore(risks), high: risks.filter((risk) => risk === "high").length, medium: risks.filter((risk) => risk === "medium").length };
}

/** 100, less 35 for each high risk and 15 for each to check, never under 0 (xw/agent_flag.py contract_score). */
export function contractScore(risks) {
  const high = risks.filter((risk) => risk === "high").length;
  const medium = risks.filter((risk) => risk === "medium").length;
  return Math.max(0, 100 - 35 * high - 15 * medium);
}

/** Pasted text as clauses: one per non-empty line, numbered, at most 40. */
export function pastedClauses(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40)
    .map((line, index) => [String(index + 1), `Clause ${index + 1}`, line.slice(0, 1200)]);
}

/** The cash forecast after the visitor's changes: weeks are [start, worst, likely, best] in pounds. */
export function cashPlan(spec, { late = 0, hire = 0, salary = 0, recover = false } = {}) {
  const weeks = spec.weeks || [];
  const delta = weeks.map(() => 0);
  const shift = Math.ceil(Math.max(0, late) / 7);
  for (let w = spec.bigWeek; w < Math.min(weeks.length, spec.bigWeek + shift); w += 1) delta[w] -= spec.bigAmount;
  if (hire > 0) {
    const weekly = salary * 12 / 52;
    for (let w = hire - 1; w < weeks.length; w += 1) delta[w] -= weekly * (w - (hire - 1) + 1);
  }
  if (recover) for (let w = 1; w < weeks.length; w += 1) delta[w] += spec.overdue;
  const worst = weeks.map((week, w) => week[1] + delta[w]);
  const likely = weeks.map((week, w) => week[2] + delta[w]);
  const best = weeks.map((week, w) => week[3] + delta[w]);
  let lowestIndex = 0;
  likely.forEach((amount, w) => { if (amount < likely[lowestIndex]) lowestIndex = w; });
  const lowest = likely[lowestIndex] ?? 0;
  return { worst, likely, best, lowestIndex, lowest, cover: spec.weeklyOut > 0 ? round1(lowest / spec.weeklyOut) : 0, below: lowest < spec.buffer };
}

/** Hours saved a month by a rule (xw/agent_flag.py ops_hours). */
export function opsHours(runs, steps, minutes) {
  return round1(Math.max(0, runs) * Math.max(0, steps) * Math.max(0, minutes) / 60);
}

/** The rule as one sentence. */
export function ruleSentence(trigger, condition, actions) {
  const when = String(trigger || "").replace(/^./, (first) => first.toLowerCase());
  const only = condition && condition !== "Every time" ? `, if ${condition.replace(/^./, (first) => first.toLowerCase())}` : "";
  const doing = actions.length ? actions.join(" and ") : "do nothing yet";
  return `When ${when}${only}, ${doing}.`;
}

// ================================================================================================ DOM helpers
const pick = (root, selector) => root.querySelector(selector);
const pickAll = (root, selector) => Array.from(root.querySelectorAll(selector));
function make(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function setOut(root, name, text) {
  const node = pick(root, `[data-out="${name}"]`);
  if (node && node.textContent !== text) {
    node.textContent = text;
    node.classList.remove("is-pulse");
    void node.offsetWidth;
    node.classList.add("is-pulse");
  }
}
function setVal(root, name, text) {
  const node = pick(root, `[data-val="${name}"]`);
  if (node) node.textContent = text;
  const input = pick(root, `input[name="${name}"]`);
  if (input) input.setAttribute("aria-valuetext", text);
}
const numberOf = (root, name) => Number(pick(root, `input[name="${name}"]`)?.value || 0);
function setRange(root, name, value) {
  const input = pick(root, `input[name="${name}"]`);
  if (input) input.value = String(value);
}
/** Each range's filled share for the CSS track (purple up to the thumb). */
function paintRanges(root) {
  pickAll(root, 'input[type="range"]').forEach((input) => {
    const lowest = Number(input.min) || 0;
    const span = (Number(input.max) || 1) - lowest;
    input.style.setProperty("--fill", `${span > 0 ? ((Number(input.value) - lowest) / span) * 100 : 0}%`);
  });
}

/** A number that eases from its last value to the next (text is set in full when motion is reduced). */
function tweenNumber(state, target, onFrame, reduced, duration = 520) {
  if (state.frameId) cancelAnimationFrame(state.frameId);
  const from = state.value ?? target;
  state.value = target;
  if (reduced || from === target || typeof requestAnimationFrame !== "function") { onFrame(target); return; }
  const start = performance.now();
  const frame = (stamp) => {
    const time = clamp((stamp - start) / duration, 0, 1);
    const eased = 1 - (1 - time) ** 3;
    onFrame(from + (target - from) * eased);
    if (time < 1) state.frameId = requestAnimationFrame(frame);
  };
  state.frameId = requestAnimationFrame(frame);
}

// ================================================================================================ the demo
/** Plays `steps` in turn every DEMO_STEP_MS while the visual is on screen, until the visitor touches it. */
function createDemo(root, steps, reduced) {
  let timer = 0;
  let index = 0;
  let onScreen = false;
  // cycle 24 (Henry, 17 Oct: no "motion that doesn't answer a user action"): the demo never starts by itself; it plays
  // only when the visitor presses "Play the example", and stops for good once they touch the visual.
  let running = false;
  root.dataset.demo = running ? "on" : "off";
  const tick = () => {
    if (!running || !onScreen) return;
    steps[index % steps.length]();
    index += 1;
    timer = setTimeout(tick, DEMO_STEP_MS);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    root.dataset.demo = "off";
  };
  const touched = (event) => {
    if (!event.isTrusted || event.target.closest?.("[data-replay]")) return;
    stop();
  };
  ["pointerdown", "keydown", "input", "wheel"].forEach((type) => root.addEventListener(type, touched, { passive: true }));
  pick(root, "[data-replay]")?.addEventListener("click", () => {
    if (reduced) return;
    clearTimeout(timer);
    running = true;
    index = 0;
    root.dataset.demo = "on";
    if (onScreen) tick();
  });
  return {
    visible(isOn) {
      const wasOn = onScreen;
      onScreen = isOn;
      if (isOn && !wasOn && running) { clearTimeout(timer); timer = setTimeout(tick, 500); }
      if (!isOn) clearTimeout(timer);
    },
    stop,
    get running() { return running; },
  };
}

// ================================================================================================ billing
function billingFlag(root, spec, reduced) {
  const token = pick(root, "[data-token]");
  const stages = pickAll(root, ".afx-st");
  const tokenDay = make("small", "num");
  token?.append(tokenDay);
  const recoveredState = {};
  let frameId = 0;
  // cycle 24 (24A2): the invoice only travels when the visitor changes a number or plays the example; on load it is
  // drawn at its end state (paid), so nothing moves by itself
  const playInvoice = (instant = false) => {
    if (!token) return;
    cancelAnimationFrame(frameId);
    const paidDay = spec.terms + Math.round(spec.agentDays);
    const days = [0, 0, 0, spec.terms, spec.reminderDay, paidDay];
    if (reduced || instant) { token.style.setProperty("--p", "1"); stages.forEach((stage) => stage.classList.add("is-on")); tokenDay.textContent = `Paid day ${paidDay}`; return; }
    const start = performance.now();
    const length = 2600;
    const frame = (stamp) => {
      const progress = clamp((stamp - start) / length, 0, 1);
      const position = progress * (stages.length - 1);
      const stageIndex = Math.floor(position);
      const nextDay = days[Math.min(days.length - 1, stageIndex + 1)];
      const dayNow = Math.round(days[stageIndex] + (nextDay - days[stageIndex]) * (position - stageIndex));
      token.style.setProperty("--p", String(progress));
      stages.forEach((stage, i) => stage.classList.toggle("is-on", i <= position + 0.001));
      tokenDay.textContent = progress >= 1 ? `Paid day ${paidDay}` : `Day ${dayNow}`;
      if (progress < 1) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
  };
  const update = (replay = true) => {
    const invoices = numberOf(root, "invoices");
    const value = numberOf(root, "value");
    const daysLate = numberOf(root, "late");
    setVal(root, "invoices", String(invoices));
    setVal(root, "value", pounds(value));
    setVal(root, "late", `${daysLate} days`);
    const model = billingModel({ invoices, value, daysLate, agentDays: spec.agentDays, lateShare: spec.lateShare, feeRate: spec.feeRate });
    tweenNumber(recoveredState, model.recovered, (amount) => setOut(root, "recovered", pounds(amount)), reduced);
    setOut(root, "sooner", `${model.sooner} days`);
    setOut(root, "fee", pounds(model.fee, true));
    const small = pick(root, '[data-out="recovered"] + small');
    if (small) small.textContent = `${model.late} late invoice${model.late === 1 ? "" : "s"}`;
    const slowDay = spec.terms + daysLate;
    const fastDay = spec.terms + Math.min(daysLate, spec.agentDays);
    setOut(root, "slowday", `Day ${slowDay}`);
    setOut(root, "fastday", `Day ${Math.round(fastDay)}`);
    pick(root, '[data-bar="slow"]')?.style.setProperty("--w", "1");
    pick(root, '[data-bar="fast"]')?.style.setProperty("--w", (slowDay > 0 ? fastDay / slowDay : 1).toFixed(3));
    paintRanges(root);
    if (replay) playInvoice();
  };
  let pending = 0;
  root.addEventListener("input", () => { update(false); clearTimeout(pending); pending = setTimeout(playInvoice, 260); });
  update(false);
  playInvoice(true);
  const demo = createDemo(root, spec.demo.map(([invoices, value, late]) => () => {
    setRange(root, "invoices", invoices); setRange(root, "value", value); setRange(root, "late", late); update();
  }), reduced);
  return demo;
}

// ================================================================================================ inbox
function inboxFlag(root, spec, reduced) {
  const buttons = pickAll(root, "[data-th]");
  const draftNode = pick(root, "[data-draft]");
  const sourceList = pick(root, "[data-srcs]");
  const done = pick(root, "[data-done]");
  const approve = pick(root, "[data-approve]");
  const hoursState = {};
  let typing = 0;
  let current = 0;
  const renderDraft = (thread, shown) => {
    const runs = draftSegments(thread.draft, thread.sources);
    draftNode.replaceChildren();
    let left = shown;
    const litSet = new Set();
    for (const segment of runs) {
      if (left <= 0) break;
      const part = segment.text.slice(0, left);
      left -= part.length;
      if (segment.source >= 0) {
        const mark = make("mark", "", part);
        mark.dataset.src = String(segment.source);
        draftNode.append(mark);
        if (part.length === segment.text.length) litSet.add(segment.source);
      } else draftNode.append(document.createTextNode(part));
    }
    pickAll(sourceList, "li").forEach((item) => item.classList.toggle("is-lit", litSet.has(Number(item.dataset.src))));
    root.classList.toggle("is-typing", shown < thread.draft.length);
  };
  const open = (index) => {
    const thread = spec.threads[index];
    if (!thread) return;
    current = index;
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    pick(root, "[data-mail-from]").textContent = `${thread.name}, ${thread.company}`;
    pick(root, "[data-mail-text]").textContent = thread.text;
    sourceList.replaceChildren(...thread.sources.map((source, i) => {
      const item = make("li");
      item.dataset.src = String(i);
      item.append(make("small", "", source.kind), document.createTextNode(source.fact));
      return item;
    }));
    done.textContent = "";
    approve.disabled = false;
    approve.classList.remove("is-done");
    clearInterval(typing);
    if (reduced) { renderDraft(thread, thread.draft.length); return; }
    let shown = 0;
    renderDraft(thread, 0);
    typing = setInterval(() => {
      shown = Math.min(thread.draft.length, shown + 3);
      renderDraft(thread, shown);
      if (shown >= thread.draft.length) clearInterval(typing);
    }, 28);
  };
  const doApprove = () => {
    clearInterval(typing);
    renderDraft(spec.threads[current], spec.threads[current].draft.length);
    approve.disabled = true;
    approve.classList.add("is-done");
    done.textContent = "Approved. In the app it sends from your address. Nothing was sent here.";
  };
  buttons.forEach((button, index) => button.addEventListener("click", () => open(index)));
  pick(root, ".ibf-list")?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const next = (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    open(next);
  });
  approve?.addEventListener("click", doApprove);
  const update = () => {
    const replies = numberOf(root, "replies");
    const minutes = numberOf(root, "minutes");
    setVal(root, "replies", String(replies));
    setVal(root, "minutes", `${minutes} min`);
    const hours = inboxHours(replies, minutes, spec.weeks);
    tweenNumber(hoursState, hours, (amount) => setOut(root, "hours", `${round1(amount)} h`), reduced);
    setOut(root, "days", String(Math.round(hours * 12 / spec.day)));
    paintRanges(root);
  };
  root.addEventListener("input", update);
  update();
  let step = 0;
  return createDemo(root, [
    () => open(step++ % spec.threads.length),
    () => doApprove(),
  ], reduced);
}

// ================================================================================================ AI PM
function pmFlag(root, spec, reduced) {
  const rows = pickAll(root, ".pmf-row");
  const card = pick(root, "[data-change]");
  const stage = pick(root, ".pmf-stage");
  let applied = -1;
  const base = spec.rows.map((item) => ({ ...item }));
  const dueText = (offset) => {
    const when = new Date(`${spec.start}T12:00:00Z`);
    when.setUTCDate(when.getUTCDate() + offset);
    return when.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const layout = (target, shiftDays, hours) => {
    rows.forEach((entryRow, i) => {
      const item = base[i];
      const later = target >= 0 && item.project === base[target].project && item.start > base[target].start;
      const moved = target >= 0 && (i === target || later) ? shiftDays : 0;
      const begin = clamp(item.start + (later ? shiftDays : 0), 0, spec.days);
      const finish = clamp(item.due + 1 + moved, 0, spec.days);
      const barNode = pick(entryRow, ".pmf-bar");
      barNode.style.setProperty("--a", (begin / spec.days).toFixed(4));
      barNode.style.setProperty("--b", (Math.max(1, finish - begin) / spec.days).toFixed(4));
      pick(entryRow, ".pmf-due").textContent = moved ? `Due ${dueText(item.due + moved)}, ${moved} days later` : `Due ${dueText(item.due)}`;
      entryRow.classList.toggle("is-moved", moved > 0);
      entryRow.classList.toggle("is-target", i === target);
      let piece = pick(entryRow, ".pmf-new");
      if (i === target) {
        if (!piece) { piece = make("i", "pmf-new"); pick(entryRow, ".pmf-lane").append(piece); }
        const width = Math.max(1, Math.ceil(hours / spec.free));
        piece.style.setProperty("--a", (clamp(finish - width, 0, spec.days - 1) / spec.days).toFixed(4));
        piece.style.setProperty("--b", (width / spec.days).toFixed(4));
        piece.title = `${spec.title}: ${hours} h`;
      } else piece?.remove();
    });
  };
  const update = () => {
    const hours = numberOf(root, "hours");
    setVal(root, "hours", `${hours} h`);
    paintRanges(root);
    const impact = pmImpact(hours, spec.free, spec.rate);
    setOut(root, "price", pounds(impact.price));
    setOut(root, "tasks", String(impact.tasks));
    setOut(root, "days", `${impact.days} working day${impact.days === 1 ? "" : "s"}`);
    if (applied < 0) return;
    layout(applied, calendarDays(impact.days), hours);
    const list = pick(root, "[data-booked]");
    list.replaceChildren(...bookHours(spec.team, hours).map((entry) => {
      const item = make("li");
      item.append(make("b", "", entry.name), make("span", "num", `${entry.hours} h`));
      return item;
    }));
    pick(root, "[data-invoice]").textContent = `Invoice line for the Billing Agent: ${spec.title}, ${hours} h × ${pounds(spec.rate)} = ${pounds(impact.price)}`;
  };
  const apply = (target) => {
    applied = clamp(target, 0, rows.length - 1);
    root.classList.add("is-applied");
    card.classList.add("is-used");
    update();
  };
  // drag the card onto a row: pointer events, with the card following the pointer inside the visual
  let drag = null;
  const rowAt = (pointX, pointY) => rows.findIndex((entryRow) => { const bounds = entryRow.getBoundingClientRect(); return pointY >= bounds.top && pointY <= bounds.bottom && pointX >= bounds.left && pointX <= bounds.right; });
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { startX: event.clientX, startY: event.clientY, moved: false };
    card.setPointerCapture?.(event.pointerId);
  });
  card.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const moveX = event.clientX - drag.startX;
    const moveY = event.clientY - drag.startY;
    if (Math.abs(moveX) + Math.abs(moveY) > 4) drag.moved = true;
    card.style.transform = `translate(${moveX}px, ${moveY}px)`;
    card.classList.add("is-drag");
    const over = rowAt(event.clientX, event.clientY);
    rows.forEach((entryRow, i) => entryRow.classList.toggle("is-over", i === over));
  });
  const endDrag = (event) => {
    if (!drag) return;
    const over = rowAt(event.clientX, event.clientY);
    const wasMoved = drag.moved;
    drag = null;
    card.style.transform = "";
    card.classList.remove("is-drag");
    rows.forEach((entryRow) => entryRow.classList.remove("is-over"));
    if (over >= 0) apply(over);
    else if (!wasMoved) apply(spec.target);
  };
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", () => { drag = null; card.style.transform = ""; card.classList.remove("is-drag"); });
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); apply(spec.target); } });
  rows.forEach((entryRow, i) => entryRow.addEventListener("click", () => { if (root.classList.contains("is-applied")) apply(i); }));
  pick(root, "[data-apply]")?.addEventListener("click", () => apply(spec.target));
  root.addEventListener("input", update);
  update();
  const glide = () => {
    // the demo carries the card to its milestone, then drops it
    const target = rows[spec.target];
    if (!target || reduced) { apply(spec.target); return; }
    const from = card.getBoundingClientRect();
    const into = target.getBoundingClientRect();
    card.classList.add("is-drag");
    card.style.transition = "transform .9s cubic-bezier(.2,.7,.2,1)";
    card.style.transform = `translate(${into.left + into.width * 0.55 - from.left - from.width / 2}px, ${into.top + into.height / 2 - from.top - from.height / 2}px) scale(.92)`;
    target.classList.add("is-over");
    setTimeout(() => { card.style.transition = ""; card.style.transform = ""; card.classList.remove("is-drag"); target.classList.remove("is-over"); apply(spec.target); }, 950);
  };
  void stage;
  return createDemo(root, [
    () => { applied = -1; root.classList.remove("is-applied"); card.classList.remove("is-used"); setRange(root, "hours", 5); layout(-1, 0, 0); update(); },
    glide,
    () => { setRange(root, "hours", 14); update(); },
    () => { setRange(root, "hours", 26); update(); },
  ], reduced);
}

// ================================================================================================ compliance
const RISK_WORDS = { high: ["High risk", "red"], medium: ["Check", "amber"], low: ["Fine", "green"] };
function complianceFlag(root, spec, reduced) {
  const list = pick(root, "[data-clauses]");
  const heat = pick(root, "[data-heat]");
  const detail = pick(root, "[data-detail]");
  const paste = pick(root, ".cmf-paste");
  const known = { ...(spec.known || {}) };
  let scan = null;
  let chosen = 0;
  const label = (risk) => {
    const [words, tone] = RISK_WORDS[risk] || ["No issue found", "neutral"];
    const chip = make("span", "xl", words);
    chip.dataset.t = tone;
    return chip;
  };
  const show = (index) => {
    const items = scan.rows.map((entryRow) => ({ number: entryRow.number, heading: entryRow.heading, finding: entryRow.finding })).concat(scan.missing ? [{ number: "Missing", heading: "Not in the contract", finding: scan.missing }] : []);
    const item = items[clamp(index, 0, items.length - 1)];
    if (!item) return;
    chosen = index;
    pickAll(list, "button").forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    pickAll(heat, "button").forEach((button, i) => button.classList.toggle("is-on", i === index));
    const finding = item.finding;
    const parts = [make("p", "afx-k", `${item.number === "Missing" ? "Missing clause" : `Clause ${item.number}`}: ${item.heading}`), label(finding?.risk)];
    parts.push(make("b", "", finding ? finding.title : "Nothing to flag"));
    parts.push(make("p", "", finding ? finding.why : "This clause reads as normal for this kind of contract."));
    if (finding?.safer) parts.push(make("p", "afx-k", "Safer wording"), make("p", "cmf-safe", finding.safer));
    detail.replaceChildren(...parts);
  };
  const render = (clauses) => {
    scan = scanContract(clauses, spec.safer?.liability || "", known);
    const items = scan.rows.map((entryRow) => ({ number: entryRow.number, heading: entryRow.heading, text: entryRow.text, risk: entryRow.finding?.risk || "none" }))
      .concat(scan.missing ? [{ number: "Missing", heading: scan.missing.title, text: "No clause lets you stop work if you are not paid.", risk: scan.missing.risk }] : []);
    list.replaceChildren(...items.map((item, i) => {
      const entry = make("li", `cmf-cl${item.number === "Missing" ? " cmf-cl--miss" : ""}`);
      entry.dataset.risk = item.risk;
      const button = make("button");
      button.type = "button";
      button.append(make("span", "num", item.number), make("b", "", item.heading), make("span", "", item.text));
      button.addEventListener("click", () => show(i));
      entry.append(button);
      if (!reduced) entry.style.animationDelay = `${i * 70}ms`;
      return entry;
    }));
    heat.replaceChildren(...items.map((item, i) => {
      const cell = make("button", "cmf-hc");
      cell.type = "button";
      cell.tabIndex = -1;
      cell.dataset.risk = item.risk;
      cell.style.flexGrow = String(Math.max(1, Math.round(item.text.length / 40)));
      cell.setAttribute("aria-label", `${item.number}: ${(RISK_WORDS[item.risk] || ["No issue"])[0]}`);
      cell.addEventListener("click", () => show(i));
      return cell;
    }));
    heat.removeAttribute("aria-hidden");
    setOut(root, "score", `${scan.score} / 100`);
    setOut(root, "high", String(scan.high));
    setOut(root, "check", String(scan.medium));
    const first = items.findIndex((item) => item.risk === "high");
    show(first >= 0 ? first : Math.max(0, items.findIndex((item) => item.risk !== "none")));
  };
  const chooseDoc = (which) => {
    pickAll(root, "[data-doc]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.doc === which)));
    paste.hidden = which !== "paste";
    if (which === "paste") { pick(root, "[data-paste]").focus({ preventScroll: true }); return; }
    render(spec.docs[Number(which)]?.clauses || []);
  };
  pickAll(root, "[data-doc]").forEach((button) => button.addEventListener("click", () => chooseDoc(button.dataset.doc)));
  pick(root, "[data-scan]")?.addEventListener("click", () => {
    const clauses = pastedClauses(pick(root, "[data-paste]").value);
    if (clauses.length) render(clauses);
  });
  list.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const buttons = pickAll(list, "button");
    const next = clamp(chosen + (event.key === "ArrowDown" ? 1 : -1), 0, buttons.length - 1);
    buttons[next].focus();
    show(next);
  });
  chooseDoc("0");
  const risky = () => pickAll(list, ".cmf-cl").map((entry, i) => (entry.dataset.risk !== "none" ? i : -1)).filter((i) => i >= 0);
  let step = 0;
  return createDemo(root, [
    () => { const order = risky(); show(order[step++ % order.length] ?? 0); },
    () => { const order = risky(); show(order[step++ % order.length] ?? 0); },
    () => chooseDoc(step % 2 ? "1" : "0"),
  ], reduced);
}

// ================================================================================================ AI CFO
function cfoFlag(root, spec, reduced) {
  const plot = pick(root, ".cff-plot");
  const width = 640;
  const height = 260;
  const base = cashPlan(spec);
  const extremes = [cashPlan(spec, { late: 60, hire: 1, salary: 6000 }), cashPlan(spec, { recover: true })];
  const allValues = [base, ...extremes].flatMap((plan) => [...plan.worst, ...plan.best]).concat([spec.buffer, 0]);
  const ceiling = Math.max(...allValues) * 1.04;
  const bottom = Math.min(...allValues);
  const xFor = (w) => (w / Math.max(1, spec.weeks.length - 1)) * width;
  const yFor = (amount) => height - ((amount - bottom) / Math.max(1, ceiling - bottom)) * height;
  const linePath = (series) => series.map((amount, w) => `${w ? "L" : "M"}${xFor(w).toFixed(1)} ${yFor(amount).toFixed(1)}`).join(" ");
  const bandPath = (lows, highs) => `${linePath(highs)} ${lows.map((amount, w) => `L${xFor(lows.length - 1 - w).toFixed(1)} ${yFor(lows[lows.length - 1 - w]).toFixed(1)}`).join(" ")} Z`;
  pick(root, "[data-base]").setAttribute("d", linePath(base.likely));
  pick(root, "[data-buffer]").setAttribute("d", `M0 ${yFor(spec.buffer).toFixed(1)} L${width} ${yFor(spec.buffer).toFixed(1)}`);
  pickAll(root, "svg path").forEach((path) => path.setAttribute("vector-effect", "non-scaling-stroke"));
  let shown = base;
  let frameId = 0;
  const draw = (plan) => {
    pick(root, "[data-line]").setAttribute("d", linePath(plan.likely));
    pick(root, "[data-band]").setAttribute("d", bandPath(plan.worst, plan.best));
    const lowDot = pick(root, "[data-low]");
    lowDot.style.left = `${(xFor(plan.lowestIndex) / width) * 100}%`;
    lowDot.style.top = `${(yFor(plan.lowest) / height) * 100}%`;
  };
  const morph = (target) => {
    cancelAnimationFrame(frameId);
    const from = shown;
    shown = target;
    if (reduced) { draw(target); return; }
    const start = performance.now();
    const frame = (stamp) => {
      const time = clamp((stamp - start) / 480, 0, 1);
      const eased = 1 - (1 - time) ** 3;
      const blend = (first, second) => first.map((amount, w) => amount + (second[w] - amount) * eased);
      const mixed = { worst: blend(from.worst, target.worst), likely: blend(from.likely, target.likely), best: blend(from.best, target.best) };
      let lowestIndex = 0;
      mixed.likely.forEach((amount, w) => { if (amount < mixed.likely[lowestIndex]) lowestIndex = w; });
      draw({ ...mixed, lowestIndex, lowest: mixed.likely[lowestIndex] });
      if (time < 1) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
  };
  const update = () => {
    const late = numberOf(root, "late");
    const hire = numberOf(root, "hire");
    const salary = numberOf(root, "salary");
    const recover = Boolean(pick(root, 'input[name="recover"]')?.checked);
    setVal(root, "late", late ? `${late} days late` : "On time");
    setVal(root, "hire", hire ? `Week ${hire}` : "No hire");
    setVal(root, "salary", pounds(salary));
    pick(root, 'input[name="salary"]')?.closest(".afx-sl")?.classList.toggle("is-off", !hire);
    paintRanges(root);
    const plan = cashPlan(spec, { late, hire, salary, recover });
    morph(plan);
    setOut(root, "lowest", pounds(plan.lowest));
    const note = pick(root, '[data-out="lowest"] + small');
    if (note) note.textContent = `Week of ${new Date(`${spec.weeks[plan.lowestIndex][0]}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    setOut(root, "cover", String(plan.cover));
    setOut(root, "buffer", plan.below ? "Below" : "Above");
    root.classList.toggle("is-below", plan.below);
  };
  const tipNode = pick(root, "[data-tipNode]");
  const hover = (event) => {
    const bounds = plot.getBoundingClientRect();
    const w = clamp(Math.round(((event.clientX - bounds.left) / bounds.width) * (spec.weeks.length - 1)), 0, spec.weeks.length - 1);
    const when = new Date(`${spec.weeks[w][0]}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    tipNode.textContent = `Week of ${when}: likely ${pounds(shown.likely[w])}, worst ${pounds(shown.worst[w])}, best ${pounds(shown.best[w])}`;
    tipNode.style.setProperty("--a", String(w / (spec.weeks.length - 1)));
    tipNode.classList.add("is-on");
  };
  plot.addEventListener("pointermove", hover);
  plot.addEventListener("pointerdown", hover);
  plot.addEventListener("pointerleave", () => tipNode.classList.remove("is-on"));
  root.addEventListener("input", update);
  root.addEventListener("change", update);
  update();
  const preset = (late, hire, recover) => () => {
    setRange(root, "late", late); setRange(root, "hire", hire);
    const bounds = pick(root, 'input[name="recover"]');
    if (bounds) bounds.checked = recover;
    update();
  };
  return createDemo(root, [preset(30, 0, false), preset(30, 6, false), preset(30, 6, true), preset(0, 0, false)], reduced);
}

// ================================================================================================ Operations
function operationsFlag(root, spec, reduced) {
  const graph = pick(root, "[data-graph]");
  const sentence = pick(root, "[data-sentence]");
  const dryOut = pick(root, "[data-dryout]");
  let trigger = Number(pick(root, '[data-when][aria-pressed="true"]')?.dataset.when || 0);
  let condition = "always";
  let actions = pickAll(root, '[data-then][aria-pressed="true"]').map((button) => Number(button.dataset.then));
  let timers = [];
  const clearRun = () => { timers.forEach(clearTimeout); timers = []; pickAll(graph, ".opf-n").forEach((node) => node.classList.remove("is-hot", "is-done")); };
  const conditionWords = () => (spec.conditions.find(([code]) => code === condition) || ["always", "Every time"])[1];
  const build = () => {
    clearRun();
    const chosen = actions.map((index) => spec.actions[index]);
    sentence.textContent = ruleSentence(spec.triggers[trigger].says, conditionWords(), chosen);
    const nodes = [["When", spec.triggers[trigger].says, "opf-n opf-n--t"]];
    if (condition !== "always") nodes.push(["Only if", conditionWords(), "opf-n opf-n--c"]);
    chosen.forEach((action) => nodes.push(["Then", action.replace(/^./, (first) => first.toUpperCase()), "opf-n"]));
    nodes.push(["Finally", "Write it to the log", "opf-n opf-n--l"]);
    graph.replaceChildren(...nodes.map(([kicker, words, className], i) => {
      const node = make("li", className);
      node.append(make("small", "", kicker), make("b", "", words));
      if (!reduced) node.style.animationDelay = `${i * 110}ms`;
      return node;
    }));
    pickAll(root, "[data-when]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.when) === trigger)));
    pickAll(root, "[data-cond]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.cond === condition)));
    pickAll(root, "[data-then]").forEach((button) => button.setAttribute("aria-pressed", String(actions.includes(Number(button.dataset.then)))));
    const minutes = numberOf(root, "minutes");
    setVal(root, "minutes", `${minutes} min`);
    paintRanges(root);
    const runs = spec.triggers[trigger].runs;
    setOut(root, "runs", condition === "always" ? String(runs) : `Up to ${runs}`);
    setOut(root, "hours", `${opsHours(runs, actions.length, minutes)} h`);
    setOut(root, "success", `${spec.success}%`);
    dryOut.textContent = "";
  };
  const dryRun = () => {
    clearRun();
    const nodes = pickAll(graph, ".opf-n");
    if (reduced) { nodes.forEach((node) => node.classList.add("is-done")); dryOut.textContent = `Dry run: ${nodes.length} steps would run. Nothing was changed.`; return; }
    nodes.forEach((node, i) => {
      timers.push(setTimeout(() => {
        nodes.forEach((other, j) => { other.classList.toggle("is-hot", j === i); if (j < i) other.classList.add("is-done"); });
        dryOut.textContent = `Step ${i + 1} of ${nodes.length}: ${pick(node, "b").textContent}`;
      }, i * 520));
    });
    timers.push(setTimeout(() => {
      nodes.forEach((node) => { node.classList.remove("is-hot"); node.classList.add("is-done"); });
      dryOut.textContent = `Dry run done: ${nodes.length} steps would run. Nothing was changed.`;
    }, nodes.length * 520));
  };
  pickAll(root, "[data-when]").forEach((button) => button.addEventListener("click", () => { trigger = Number(button.dataset.when); build(); }));
  pickAll(root, "[data-cond]").forEach((button) => button.addEventListener("click", () => { condition = button.dataset.cond; build(); }));
  pickAll(root, "[data-then]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.then);
    actions = actions.includes(index) ? actions.filter((other) => other !== index) : [...actions, index].slice(-2);
    build();
  }));
  pick(root, "[data-dry]")?.addEventListener("click", dryRun);
  root.addEventListener("input", build);
  build();
  let step = 0;
  return createDemo(root, [
    () => { trigger = step % spec.triggers.length; actions = (spec.triggers[trigger].actions || [0]).slice(0, 2); condition = trigger === 3 ? "late" : "always"; step += 1; build(); },
    dryRun,
  ], reduced);
}

// ================================================================================================ mount
const KINDS = { billing: billingFlag, inbox: inboxFlag, pm: pmFlag, compliance: complianceFlag, cfo: cfoFlag, operations: operationsFlag };

export function mount(root, { reduced = prefersReduced() } = {}) {
  const kind = KINDS[root?.dataset?.flag];
  const spec = readJson(root?.querySelector("script[data-flag-data]")?.textContent, null);
  if (!kind || !spec || typeof spec !== "object") {
    if (root) root.dataset.flagFailed = "1";
    return { visible() {} };
  }
  try {
    const demo = kind(root, spec, reduced);
    root.classList.add("is-live");
    return { visible: (isOn) => demo?.visible?.(isOn) };
  } catch (error) {
    root.dataset.flagFailed = "1";
    return { visible() {} };
  }
}
