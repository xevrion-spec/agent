// The pricing page's credits calculator (cycle 17). Mirrors xw/agents.py recommend() exactly: Starter has only the
// Billing agent and follows up at most config.starter[2] invoices a month, so client emails, project tasks or more invoices
// need Growth; an invoice is drafted and sent (config.perInvoice actions), a reminder is one; add-on agents cost the same
// on either plan and their work counts as actions; packs of 1,000 actions cover anything over the plan's allowance; the
// cheapest plan that covers the month wins (Growth on a tie). tools/test_credits.mjs checks it against the Python cases.
// Cycle 18: the calculator's picture (xw/pages/ops_pricing.py cost_visual) updates live: the month's cost split into
// plan (solid), add-ons (hatched) and packs (outlined), placed by percent, and the actions used against the allowance; each
// part's tooltip and the hidden table give the exact new value (the shared module viz-ix.js shows them).
// Cycle 19: every figure counts from its old value to its new one as a slider moves, the bar's parts glide to their new
// widths, and hovering (or tapping) a part opens its breakdown card (partDetail): what is behind its pounds and its share.
import { bind, countUp } from "./viz-ix.js";

const formatGbp = (value) => "£" + Math.round(value).toLocaleString("en-GB");
const toNumber = (value) => Math.round(value).toLocaleString("en-GB");

export function cost(config, plan, addons, actions) {
  const [price, allowance] = config[plan];
  const over = Math.max(0, actions - allowance);
  const packs = Math.ceil(over / config.pack[1]);
  return { plan_price: price, addons: addons * config.addon, packs, packs_cost: packs * config.pack[0], total: price + addons * config.addon + packs * config.pack[0], allowance };
}

export function recommend(config, volumes, addons) {
  for (const field of ["emails", "tasks", "invoices", "reminders", "runs", "contracts"]) {
    const amount = volumes[field] ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError("every amount must be a whole number, 0 or more");
  }
  const hired = new Set(addons);
  for (const agent of hired) if (!["operations", "compliance", "cfo"].includes(agent)) throw new RangeError("unknown add-on agent " + agent);
  const actions = (volumes.emails ?? 0) + (volumes.tasks ?? 0) + (volumes.invoices ?? 0) * config.perInvoice + (volumes.reminders ?? 0)
    + (hired.has("operations") ? volumes.runs ?? 0 : 0) + (hired.has("compliance") ? volumes.contracts ?? 0 : 0) + (hired.has("cfo") ? config.cfo : 0);
  const starterOk = !volumes.emails && !volumes.tasks && (volumes.invoices ?? 0) <= config.starter[2];
  const eligible = starterOk ? ["starter", "growth"] : ["growth"];
  let best = null;
  for (const plan of eligible) {
    const month = cost(config, plan, hired.size, actions);
    if (!best || month.total < best.total || (month.total === best.total && plan === "growth")) best = { ...month, plan };
  }
  return { ...best, actions };
}

export const SEGMENTS = [["plan", "Plan", "plan_price"], ["addons", "Add-on agents", "addons"], ["packs", "Credit packs", "packs_cost"]];

/** The stacked bar's segments for a result: [key, name, pounds, start %, share], as cost_parts() in ops_pricing.py. */
export function costParts(result) {
  const total = result.total || 1;
  let start = 0;
  return SEGMENTS.map(([segment, name, field]) => {
    const pounds = result[field] || 0, share = pounds / total;
    const part = [segment, name, pounds, Math.round(start * 10000) / 100, Math.round(share * 10000) / 10000];
    start += share;
    return part;
  });
}

/** A part's breakdown card for the cost bar: the lines behind its pounds, and its share of the month. */
export function partDetail(config, result, key, addons = []) {
  const total = result.total || 0;
  const share = (value) => (total ? `${Math.round((value / total) * 100)}% of ${formatGbp(total)}` : "");
  const names = { operations: "Operations", compliance: "Compliance", cfo: "AI CFO" };
  if (key === "plan") return { title: `Plan · ${result.plan === "growth" ? "Growth" : "Starter"}`, value: formatGbp(result.plan_price), lines: [`${toNumber(result.allowance)} actions a month included`, share(result.plan_price)] };
  if (key === "addons") return { title: "Add-on agents", value: formatGbp(result.addons),
    lines: [addons.length ? `${addons.map((each) => names[each] || each).join(", ")} × ${formatGbp(config.addon)}` : "None hired", share(result.addons)] };
  return { title: "Credit packs", value: formatGbp(result.packs_cost),
    lines: [result.packs ? `${result.packs} × ${toNumber(config.pack[1])} actions at ${formatGbp(config.pack[0])}` : "Not needed this month", share(result.packs_cost)] };
}

export function mount(host, { track, reduced = false } = {}) {
  let config;
  try { config = JSON.parse(host.dataset.calc || "{}"); } catch { return { visible() {} }; }
  if (!config.starter || !config.growth) return { visible() {} };
  const result = (key) => host.querySelector(`[data-r="${key}"]`);
  const inputs = [...host.querySelectorAll("[data-in]")];
  const boxes = [...host.querySelectorAll("[data-addon]")];
  const names = { starter: "Starter", growth: "Growth" };
  let used = false, latest = null, hired = [];
  // each figure counts from what it showed to its new value, so a slider's effect is seen, not just read
  const shown = new Map(), stops = new Map();
  const animate = (element, value) => {
    if (!element) return;
    const before = shown.get(element);
    shown.set(element, value);
    stops.get(element)?.();
    if (before === undefined || before === value || reduced || typeof globalThis.requestAnimationFrame !== "function") { element.textContent = formatGbp(value); return; }
    stops.set(element, countUp(element, value, { from: before, unit: "gbp", duration: 420 }));
  };
  const calc = () => {
    const values = {};
    for (const input of inputs) {
      values[input.dataset.in] = Math.max(0, Math.round(Number(input.value) || 0));
      const minimum = Number(input.min) || 0, high = Number(input.max) || 1;
      input.style.setProperty("--v", (((values[input.dataset.in] - minimum) / (high - minimum || 1)) * 100).toFixed(1) + "%");
      const outputEl = host.querySelector(`[data-out="${input.dataset.in}"]`);
      if (outputEl) outputEl.textContent = toNumber(values[input.dataset.in]);
    }
    hired = boxes.filter((box) => box.checked).map((box) => box.dataset.addon);
    host.querySelectorAll("[data-needs]").forEach((row) => row.toggleAttribute("data-off", !hired.includes(row.dataset.needs)));
    const month = recommend(config, values, hired);
    latest = month;
    animate(result("total"), month.total);
    const reason = month.plan !== "growth" ? "" : (values.emails || values.tasks) ? ": client emails and projects need the Inbox and AI PM agents"
      : values.invoices > config.starter[2] ? `: Starter follows up ${toNumber(config.starter[2])} invoices a month` : "";
    result("plan_name").textContent = names[month.plan];
    result("plan_why").textContent = ` covers this work${reason}.`;
    animate(result("plan_price"), month.plan_price);
    animate(result("addons"), month.addons);
    result("packs").textContent = `${month.packs}, ${formatGbp(month.packs_cost)}`;
    const usage = `${toNumber(month.actions)} of ${toNumber(month.allowance)} actions in the plan${month.packs ? `, plus ${toNumber(month.packs * config.pack[1])} from packs` : ""}`;
    result("use").textContent = usage;
    const meterBar = result("bar");
    meterBar.style.setProperty("--u", Math.min(1, month.actions / (month.allowance || 1)).toFixed(4));
    meterBar.setAttribute("data-tip", usage);
    const parts = costParts(month);
    for (const [key, name, value, start, width] of parts) {
      const segmentEl = host.querySelector(`[data-seg="${key}"]`);
      if (!segmentEl) continue;
      segmentEl.style.setProperty("--x", String(start));
      segmentEl.style.setProperty("--w", String(width));
      segmentEl.setAttribute("data-tip", `${name}: ${formatGbp(value)}`);
    }
    const table = result("table");
    if (table) {
      const cells = [...parts.map(([, name, value]) => [name, formatGbp(value)]), ["Actions", usage]];
      table.querySelectorAll("tbody tr").forEach((row, index) => { const cell = row.querySelector("td"); if (cell && cells[index]) cell.textContent = cells[index][1]; });
    }
    const picture = host.querySelector(".a17-viz");
    picture?._ixNav?.refresh();
    if (card?.part) paintCard(card.part);
    const startLink = result("go");
    startLink.textContent = `Start with ${names[month.plan]}`;
    if (config.signup && config.signup[month.plan]) startLink.href = config.signup[month.plan];
  };
  // the breakdown card: hovering (or tapping) a part of the cost bar opens what is behind its pounds
  let card = null;
  function paintCard(part) {
    if (!latest || !card) return;
    const detail = partDetail(config, latest, part, hired);
    const owner = card.element.ownerDocument;
    const heading = owner.createElement("b"); heading.className = "ix-tip__h"; heading.textContent = detail.title;
    const amount = owner.createElement("span"); amount.className = "ix-tip__r";
    const value = owner.createElement("b"); value.className = "ix-tip__v"; value.textContent = detail.value;
    amount.append(value);
    const lines = detail.lines.filter(Boolean).map((text) => { const line = owner.createElement("span"); line.className = "ix-tip__f"; line.textContent = text; return line; });
    card.element.replaceChildren(heading, amount, ...lines);
    card.part = part;
  }
  const stack = host.querySelector(".a17-stack");
  const segments = [...host.querySelectorAll("[data-seg]")];
  if (stack && typeof stack.addEventListener === "function") {
    const picture = host.querySelector(".a17-viz") || stack.parentElement;
    const element = host.ownerDocument.createElement("div");
    element.className = "ix-tip a17-card";
    element.setAttribute("aria-hidden", "true");
    picture.appendChild(element);
    card = { element, part: "" };
    const open = (segmentEl) => {
      paintCard(segmentEl.dataset.seg);
      const frame = picture.getBoundingClientRect(), box = segmentEl.getBoundingClientRect();
      element.setAttribute("data-show", "");
      const width = element.offsetWidth || 220;
      const left = Math.max(0, Math.min(frame.width - width, box.left - frame.left + box.width / 2 - width / 2));
      element.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(box.bottom - frame.top + 10)}px, 0)`;
      segments.forEach((each) => each.toggleAttribute("data-lift", each === segmentEl));
      picture.setAttribute("data-card", "");                       // the breakdown card replaces the part's plain tooltip
    };
    const close = () => { element.removeAttribute("data-show"); card.part = ""; picture.removeAttribute("data-card"); segments.forEach((each) => each.removeAttribute("data-lift")); };
    segments.forEach((segmentEl) => {
      segmentEl.addEventListener("pointerenter", () => open(segmentEl));
      segmentEl.addEventListener("click", () => open(segmentEl));
    });
    stack.addEventListener("pointerleave", close);
  }
  const touched = () => { calc(); if (!used) { used = true; track?.("calc_used", true); } };
  inputs.forEach((input) => input.addEventListener("input", touched));
  boxes.forEach((box) => box.addEventListener("change", touched));
  const picture = host.querySelector(".a17-viz");
  if (picture) bind(picture);
  calc();
  return { visible() {} };
}
