// The /roi savings calculator (cycle 21). estimate() mirrors xw/roi.py estimate() exactly (tools/test_roi.mjs checks
// both against tools/roi_cases.json): hours back by job from your counts and minutes, their value at your hourly cost,
// the cheapest plan for that month of work (recommend() from the pricing calculator, the same code), the difference,
// and what late money can earn by law: interest at 8% for the days late plus GOV.UK's fixed sum for each late invoice.
// The page's picture moves with the sliders: the hours bar splits by job, and the value bar stands against the cost.
import { recommend } from "./viz-credits.js";
import { bind, countUp } from "./viz-ix.js";

const DEFAULTS = { emails: 300, reply_minutes: 3, tasks: 80, task_minutes: 10, invoices: 30, invoice_minutes: 15, reminders: 40,
  reminder_minutes: 5, hourly: 40, overdue: 7470, late_invoices: 4, days_late: 30 };
const formatGbp = (value) => (value < 0 ? "−£" : "£") + Math.abs(Math.round(value)).toLocaleString("en-GB");
const formatHours = (value) => `${(Math.round(value * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 })} h`;
// Python's round() rounds halves to even; Math.round rounds them up. Both sides use this for parity.
export function roundHalfEven(value, places = 0) {
  const scale = 10 ** places, scaled = value * scale, floor = Math.floor(scaled), diff = scaled - floor;
  const epsilon = 1e-9;
  let whole;
  if (diff > 0.5 + epsilon) whole = floor + 1;
  else if (diff < 0.5 - epsilon) whole = floor;
  else whole = floor % 2 === 0 ? floor : floor + 1;
  return whole / scale;
}

export function fixedSum(config, invoicePence) {
  for (const [below, pounds] of config.fixed) if (invoicePence < below) return pounds;
  return config.fixedTop;
}

function whole(values, key) {
  const value = values[key] ?? DEFAULTS[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(`${key} must be a number, 0 or more`);
  return roundHalfEven(value);
}

export function estimate(config, values = {}) {
  const v = {};
  for (const key of Object.keys(DEFAULTS)) v[key] = whole(values, key);
  const minutes = config.jobs.map(([count, per, label]) => [label, v[count] * v[per]]);
  const total = minutes.reduce((sum, [, m]) => sum + m, 0);
  const plan = recommend(config.price, { emails: v.emails, tasks: v.tasks, invoices: v.invoices, reminders: v.reminders }, []);
  const timeValue = roundHalfEven((total / 60) * v.hourly);
  const interest = roundHalfEven((v.overdue * config.statutory / 100) * v.days_late / 365);
  const averagePence = v.late_invoices ? roundHalfEven((v.overdue * 100) / v.late_invoices) : 0;
  const fixed = v.late_invoices && v.overdue ? fixedSum(config, averagePence) * v.late_invoices : 0;
  return { hours: roundHalfEven(total / 60, 1), jobs: minutes.map(([label, m]) => [label, roundHalfEven(m / 60, 1)]), time_value: timeValue,
    plan: plan.plan, cost: plan.total, actions: plan.actions, net: timeValue - plan.total, interest, fixed, claim: interest + fixed,
    breakeven_hours: v.hourly ? roundHalfEven(plan.total / v.hourly, 1) : 0 };
}

/** The value bar against the cost bar: each one's width as a share of the larger, so the gap between them is the net. */
export function compareWidths(result) {
  const top = Math.max(result.time_value, result.cost, 1);
  return { value: Math.round((result.time_value / top) * 10000) / 10000, cost: Math.round((result.cost / top) * 10000) / 10000 };
}

/** The hours bar's segments: [label, hours, start share, share], left to right, as roi_parts() in ops_roi.py. */
export function jobParts(result) {
  const total = result.jobs.reduce((sum, [, h]) => sum + h, 0) || 1;
  let start = 0;
  return result.jobs.map(([label, hours]) => {
    const share = hours / total;
    const part = [label, hours, Math.round(start * 10000) / 10000, Math.round(share * 10000) / 10000];
    start += share;
    return part;
  });
}

export function mount(host, { track, reduced = false } = {}) {
  let config;
  try { config = JSON.parse(host.dataset.roi || "{}"); } catch { return { visible() {} }; }
  if (!config.price || !config.jobs) return { visible() {} };
  const resultBox = (key) => host.querySelector(`[data-r="${key}"]`);
  const inputs = [...host.querySelectorAll("[data-in]")];
  const names = { starter: "Starter", growth: "Growth" };
  const shown = new Map(), stops = new Map();
  let used = false;
  const paint = (element, value, format, unit) => {
    if (!element) return;
    const before = shown.get(element);
    shown.set(element, value);
    stops.get(element)?.();
    if (before === undefined || before === value || reduced || typeof globalThis.requestAnimationFrame !== "function") { element.textContent = format(value); return; }
    stops.set(element, countUp(element, value, { from: before, unit, duration: 380 }));
  };
  const calc = () => {
    const values = {};
    for (const input of inputs) {
      const value = Math.max(0, Number(input.value) || 0);
      values[input.dataset.in] = value;
      const low = Number(input.min) || 0, high = Number(input.max) || 1;
      input.style.setProperty("--v", (((value - low) / (high - low || 1)) * 100).toFixed(1) + "%");
      const shownValue = host.querySelector(`[data-out="${input.dataset.in}"]`);
      if (shownValue) shownValue.textContent = input.dataset.unit === "gbp" ? formatGbp(value) : value.toLocaleString("en-GB");
    }
    let result;
    try { result = estimate(config, values); } catch { return; }
    paint(resultBox("hours"), result.hours, formatHours, "h");
    paint(resultBox("time_value"), result.time_value, formatGbp, "gbp");
    paint(resultBox("cost"), result.cost, formatGbp, "gbp");
    const net = resultBox("net");
    if (net) { net.textContent = formatGbp(result.net); net.toggleAttribute("data-neg", result.net < 0); }
    const verdict = resultBox("verdict");
    if (verdict) verdict.textContent = result.net >= 0 ? "more than the plan costs" : "less than the plan costs";
    paint(resultBox("claim"), result.claim, formatGbp, "gbp");
    const lines = { time_value_line: formatGbp(result.time_value), interest: formatGbp(result.interest), fixed: formatGbp(result.fixed), plan_name: names[result.plan] || result.plan,
      breakeven: formatHours(result.breakeven_hours), actions: result.actions.toLocaleString("en-GB") };
    for (const [key, text] of Object.entries(lines)) { const el = resultBox(key); if (el) el.textContent = text; }
    const widths = compareWidths(result);
    resultBox("bar_value")?.style.setProperty("--w", String(widths.value));
    resultBox("bar_cost")?.style.setProperty("--w", String(widths.cost));
    resultBox("bar_value")?.setAttribute("data-tip", `Value of the hours: ${formatGbp(result.time_value)}`);
    resultBox("bar_cost")?.setAttribute("data-tip", `${names[result.plan] || result.plan} plan: ${formatGbp(result.cost)}`);
    for (const [label, hours, start, share] of jobParts(result)) {
      const seg = host.querySelector(`[data-job="${CSS.escape(label)}"]`);
      if (!seg) continue;
      seg.style.setProperty("--x", String(start * 100));
      seg.style.setProperty("--w", String(share));
      seg.setAttribute("data-tip", `${label}: ${formatHours(hours)}`);
      const value = host.querySelector(`[data-jobv="${CSS.escape(label)}"]`);
      if (value) value.textContent = formatHours(hours);
    }
    host.querySelector(".ix")?._ixNav?.refresh?.();
  };
  const touched = () => { calc(); if (!used) { used = true; track?.("roi_used", true); } };
  inputs.forEach((input) => input.addEventListener("input", touched));
  host.querySelector("[data-roi-reset]")?.addEventListener("click", () => {
    for (const input of inputs) if (input.dataset.default !== undefined) input.value = input.dataset.default;
    calc();
  });
  const picture = host.querySelector(".ix");
  if (picture) bind(picture);
  calc();
  return { visible() {} };
}
