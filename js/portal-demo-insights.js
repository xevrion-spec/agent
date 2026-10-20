// Ask Xevrion's analysis answers for the customer portal presentation (/customer-portal), in the shape 12B's
// ask_insights.py gives the real app (cycle 12): a headline and answer, the period and the one before, up to four
// figures, one chart (bars, line, barh or scatter), the rows behind it, and the sources every figure is read from.
// assist.js draws the new parts only when they are present, so the answers here only add to the records answers in
// portal-demo-ask.js.
//
// The figures are worked out from the example company's own customers (the Customers page: each one's usual gap
// between orders, days since their last order, a year's revenue over its invoices, median days late) and its unpaid
// invoices (Invoice follow-up), so a figure here agrees with the page it links to. Nothing is random: the same day
// gives the same answer, and nothing is sent anywhere.

const DAY = 86400000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole pounds without pence, pounds and pence otherwise: "£4,776", "£1,240.50" (ask_insights.gbp). */
export function gbp(pounds) {
  const v = Math.round((Number(pounds) || 0) * 100) / 100;
  const whole = Math.abs(v - Math.round(v)) < 1e-9;
  const s = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return (v < 0 ? "-£" : "£") + s;
}
const plural = (n, one, many = one + "s") => n + " " + (n === 1 ? one : many);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms) => Math.floor(ms / DAY) * DAY;
const dateWords = (ms) => { const d = new Date(ms); return d.getUTCDate() + " " + SHORT[d.getUTCMonth()]; };
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// a small stable hash, so an amount varies by customer and order but never between visits
function unit(key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Every example sale (an invoice raised) in the last `back` days: each customer orders at their usual gap, the last
 * one `days_since_last` days ago, each order near their typical size (a year's revenue over a year's invoices).
 */
export function salesEvents(customers, now, back = 200) {
  const out = [];
  for (const c of customers || []) {
    const since = Number(c.days_since_last), gap = Number(c.usual_gap_days), n = Number(c.invoices_12m) || 0;
    const typical = n ? Number(c.revenue_12m) / n : Number(c.revenue_12m) || 0;
    if (!Number.isFinite(since) || !typical) continue;
    for (let k = 0, ago = since; ago <= back; k += 1, ago += gap) {
      const pounds = Math.max(5, Math.round((typical * (0.85 + 0.3 * unit(c.id + ":" + k))) / 5) * 5);
      out.push({ at: dayStart(now) - ago * DAY, pounds, customer: String(c.name || "").replace(/ Ltd$/, "") });
      if (!(gap > 0)) break;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const sum = (events) => events.reduce((a, e) => a + e.pounds, 0);
const between = (events, a, b) => events.filter((e) => e.at >= a && e.at < b);

/** Signed change words and tone, the way ask_insights.change_words says them (sales: up is good). */
export function changeWords(cur, prev) {
  if (!prev && !cur) return ["the same as none", ""];
  if (!prev) return ["up from none", "green"];
  if (!cur) return ["none, down from " + gbp(prev), "red"];
  if (cur === prev) return ["the same as " + gbp(prev), ""];
  const pct = Math.round((Math.abs(cur - prev) / prev) * 100), up = cur > prev;
  return [(up ? "up " : "down ") + pct + "% from " + gbp(prev), up ? "green" : "red"];
}
const signed = (d) => (d > 0 ? "+" : d < 0 ? "-" : "") + gbp(Math.abs(d));

// the rows, figures and sources of one answer: every figure shown is in a source's text
function collector() {
  const sources = [], items = [];
  const fact = (text, page) => { const id = "F" + (sources.length + 1); sources.push({ id, text, page }); return id; };
  const row = (label, value, sub, page, text, tone = "") => { fact(text, page); items.push({ label, value, sub, page, tone }); };
  return { sources, items, fact, row };
}
function result(intent, headline, answer, f, open, follow, extra) {
  return { intent, headline, answer, items: f.items.slice(0, 8), total: f.items.length, sources: f.sources, open,
    actions: [{ label: "Open " + (PAGES[open] || "the page"), go: open }], follow_ups: follow.slice(0, 3), mode: "records", checked: true, ai_unavailable: false,
    note: "Example workspace: worked out from its records. In your own workspace the same answer comes from yours.", ...extra };
}
const PAGES = { customers: "Customers", collections: "Invoice follow-up", value: "Results" };
const SALES = { key: "sales", label: "Sales", unit: "gbp", better: "up" };
const SALES_BASIS = "Invoices raised to customers, by the day raised, before VAT. Credit notes and drafts are not counted.";

/** "Show sales week by week": the last 8 weeks (Monday to Sunday), the shape, the highest and lowest week. */
export function salesByWeek({ customers, now }) {
  const ev = salesEvents(customers, now), today = dayStart(now);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const starts = Array.from({ length: 8 }, (_, i) => monday - (7 - i) * 7 * DAY);
  const series = starts.map((s) => sum(between(ev, s, s + 7 * DAY)));
  const f = collector(), name = (i) => "week of " + dateWords(starts[i]);
  const a2 = series.slice(4).reduce((a, v) => a + v, 0), a1 = series.slice(0, 4).reduce((a, v) => a + v, 0), total = a1 + a2;
  const [words, tone] = changeWords(a2, a1);
  const hi = series.indexOf(Math.max(...series)), lo = series.indexOf(Math.min(...series));
  const shape = a2 > a1 * 1.05 ? "Rising" : a2 < a1 * 0.95 ? "Falling" : "Steady";
  const range = dateWords(starts[0]) + " to " + dateWords(Math.min(today, starts[7] + 6 * DAY));
  f.fact("Sales by week, the last 8 weeks (" + range + "): " + series.map((v, i) => name(i) + " " + gbp(v)).join(", ") + ".", "customers");
  f.row("The last 4 weeks", gbp(a2), "the 4 weeks before: " + gbp(a1), "customers", "Sales: " + gbp(a2) + " in the last 4 weeks, " + gbp(a1) + " in the 4 weeks before.", tone);
  f.row("Highest week", gbp(series[hi]), name(hi), "customers", "Highest week: " + name(hi) + ", " + gbp(series[hi]) + ".");
  f.row("Lowest week", gbp(series[lo]), name(lo), "customers", "Lowest week: " + name(lo) + ", " + gbp(series[lo]) + ".");
  f.row("In all", gbp(total), plural(between(ev, starts[0], today + DAY).length, "invoice"), "customers", "Sales, the last 8 weeks: " + gbp(total) + ".");
  f.fact("Change, the last 4 weeks against the 4 weeks before: " + signed(a2 - a1) + ", " + words + ".", "customers");
  return result("insight", "Sales by week, the last 8 weeks: " + shape.toLowerCase(),
    shape + ". The last 4 weeks came to " + gbp(a2) + ", against " + gbp(a1) + " in the 4 weeks before (" + words + ").", f, "customers",
    ["Why did sales change this month?", "Which customers pay late?", "How old are our unpaid invoices?"], {
      period: { label: "the last 8 weeks", range },
      metrics: [{ label: "The last 4 weeks", value: gbp(a2), sub: dateWords(starts[4]) + " to " + dateWords(today) },
        { label: "The 4 weeks before", value: gbp(a1), sub: dateWords(starts[0]) + " to " + dateWords(starts[4] - DAY) },
        { label: "Change", value: signed(a2 - a1), sub: words, tone }],
      chart: { kind: "bars", label: "Sales by week, the last 8 weeks", labels: starts.map(isoDay), weekly: true, fmt: "money", unit: "",
        series: [{ name: "Sales", color: "x", values: series }], prev: null, prevName: "" },
      basis: SALES_BASIS, method: "Each invoice is counted in the week (Monday to Sunday) it was raised.", metric: SALES,
    });
}

/** "Why did sales change this month?": this month so far against the same days of last month, and who moved it. */
export function salesWhy({ customers, now }) {
  const ev = salesEvents(customers, now), today = dayStart(now), d = new Date(today);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), pStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  const days = Math.round((today - start) / DAY) + 1;
  const pEnd = Math.min(pStart + days * DAY, start);
  const cur = between(ev, start, today + DAY), prev = between(ev, pStart, pEnd);
  const c = sum(cur), p = sum(prev), [words, tone] = changeWords(c, p);
  const month = MONTHS[d.getUTCMonth()], pMonth = MONTHS[new Date(pStart).getUTCMonth()];
  const range = "1 " + SHORT[d.getUTCMonth()] + " to " + dateWords(today), vsRange = "1 " + SHORT[new Date(pStart).getUTCMonth()] + " to " + dateWords(pEnd - DAY);
  const by = new Map();
  for (const e of cur) (by.get(e.customer) || by.set(e.customer, { cur: 0, prev: 0 }).get(e.customer)).cur += e.pounds;
  for (const e of prev) (by.get(e.customer) || by.set(e.customer, { cur: 0, prev: 0 }).get(e.customer)).prev += e.pounds;
  const movers = [...by.entries()].map(([name, v]) => ({ name, ...v, d: v.cur - v.prev })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.name.localeCompare(b.name));
  const f = collector();
  f.fact("Sales this month so far (" + range + "): " + gbp(c) + " from " + plural(cur.length, "invoice") + ".", "customers");
  f.fact("Sales the same days of " + pMonth + " (" + vsRange + "): " + gbp(p) + " from " + plural(prev.length, "invoice") + ".", "customers");
  f.fact("Change: " + signed(c - p) + ", " + words + ".", "customers");
  movers.forEach((m) => f.row(m.name, signed(m.d), gbp(m.cur) + " this month · " + gbp(m.prev) + " the same days of " + pMonth, "customers",
    m.name + ": " + gbp(m.cur) + " this month so far; " + gbp(m.prev) + " the same days of " + pMonth + " (" + signed(m.d) + ").", m.d > 0 ? "green" : m.d < 0 ? "red" : ""));
  const top = movers.filter((m) => m.d !== 0).slice(0, 2);
  const why = top.length ? " Most of the change: " + top.map((m) => m.name + " (" + signed(m.d) + (m.cur === 0 ? ", nothing ordered yet this month" : "") + ")").join(" and ") + "."
    : " No customer's orders moved between the two periods.";
  return result("insight", "Sales: " + gbp(c) + " this month so far", "That is " + words + " the same days of " + pMonth + "." + why, f, "customers",
    ["Show sales week by week", "Which customers pay late?", "How old are our unpaid invoices?"], {
      period: { label: "this month so far", range, vs_label: "the same days of " + pMonth, vs_range: vsRange },
      metrics: [{ label: "This month so far", value: gbp(c), sub: plural(cur.length, "invoice") + " · " + range },
        { label: "The same days of " + pMonth, value: gbp(p), sub: plural(prev.length, "invoice") + " · " + vsRange },
        { label: "Change", value: signed(c - p), sub: words, tone }],
      chart: { kind: "barh", label: "Sales by customer, " + month + " so far against the same days of " + pMonth, fmt: "money", unit: "",
        rowName: "Customer", valueName: "This month so far", refName: "The same days of " + pMonth, noteName: "Change",
        max: Math.max(1, ...movers.map((m) => Math.max(m.cur, m.prev))),
        rows: movers.map((m) => ({ label: m.name, value: m.cur, ref: m.prev, note: signed(m.d), color: m.d > 0 ? "ok" : m.d < 0 ? "bad" : "p2" })) },
      basis: SALES_BASIS, method: "This month from the 1st to today, set against the same number of days from the 1st of " + pMonth + ". Each customer's change is their sales this month minus theirs then.",
      metric: SALES,
    });
}

/** "Which customers pay late?": each customer's median days late on their paid invoices, latest payers first. */
export function payLate({ customers }) {
  const rows = (customers || []).filter((c) => c.median_days_late != null).map((c) => ({ name: String(c.name).replace(/ Ltd$/, ""), late: Number(c.median_days_late), n: Number(c.invoices_12m) || 0, gap: c.usual_gap_days }))
    .sort((a, b) => b.late - a.late || a.name.localeCompare(b.name));
  if (!rows.length) return null;
  const f = collector(), late = rows.filter((r) => r.late > 7);
  rows.forEach((r) => f.row(r.name, plural(r.late, "day"), plural(r.n, "invoice") + " paid in the last 12 months", "customers",
    r.name + ": paid a median of " + plural(r.late, "day") + " late over " + plural(r.n, "invoice") + " in the last 12 months.", r.late > 14 ? "red" : r.late > 7 ? "amber" : ""));
  const head = late.length ? plural(late.length, "customer pays", "customers pay") + " more than a week late" : "Every customer pays within a week of the due date";
  const text = late.length ? late.map((r) => r.name + " (" + plural(r.late, "day") + ")").join(" and ") + (late.length === 1 ? " pays" : " pay") +
    " late as a habit. Asking for a deposit, or shorter terms, brings the money in sooner." : "No one is late as a habit.";
  return result("insight", head, text, f, "customers", ["How old are our unpaid invoices?", "Who owes us money?", "Show sales week by week"], {
    period: { label: "the last 12 months", range: "paid invoices" },
    chart: { kind: "barh", label: "Median days late, by customer", fmt: "n", unit: "days", rowName: "Customer", valueName: "Median days late",
      max: Math.max(1, ...rows.map((r) => r.late)), rows: rows.map((r) => ({ label: r.name, value: r.late, color: r.late > 14 ? "bad" : r.late > 7 ? "amber" : "ok" })) },
    metrics: [], basis: "Paid invoices from your accounts software, the last 12 months: days from the due date to the day paid. The middle value is shown, so one very late invoice does not decide it.",
    method: "", metric: { key: "days_late", label: "Days late", unit: "days", better: "down" },
  });
}

/** "How old are our unpaid invoices?": the unpaid invoices in bands of days past due today (ask_insights.ageing). */
export function ageing({ invoices, now }) {
  const unpaid = (invoices || []).filter((x) => Number(x.remaining_pence) > 0);
  if (!unpaid.length) return null;
  const lateDays = (x) => Math.round((dayStart(now) - Date.parse(String(x.due_on).slice(0, 10) + "T00:00:00Z")) / DAY);
  const bands = [["Not due yet", null, 0], ["1 to 30 days late", 1, 30], ["31 to 60 days late", 31, 60], ["61 to 90 days late", 61, 90], ["Over 90 days late", 91, 1e6]];
  const f = collector(), rows = bands.map(([label, lo, hi]) => {
    const inside = unpaid.filter((x) => (lo == null ? lateDays(x) <= 0 : lateDays(x) >= lo && lateDays(x) <= hi));
    return { label, inside, pounds: inside.reduce((a, x) => a + Number(x.remaining_pence), 0) / 100 };
  });
  const tone = (l) => (/^(61|Over)/.test(l) ? "red" : /^\d/.test(l) ? "amber" : "");
  rows.filter((r) => r.inside.length).forEach((r) => {
    const big = r.inside.reduce((a, x) => (Number(x.remaining_pence) > Number(a.remaining_pence) ? x : a));
    f.row(r.label, gbp(r.pounds), plural(r.inside.length, "invoice") + " · largest " + big.customer, "collections",
      r.label + ": " + gbp(r.pounds) + " on " + plural(r.inside.length, "invoice") + "; the largest is " + big.customer + " (" + gbp(Number(big.remaining_pence) / 100) + ").", tone(r.label));
  });
  rows.filter((r) => !r.inside.length).forEach((r) => f.fact(r.label + ": " + gbp(0) + ", no invoices.", "collections"));
  const total = rows.reduce((a, r) => a + r.pounds, 0), late = rows.slice(1).reduce((a, r) => a + r.pounds, 0), old = rows.slice(3).reduce((a, r) => a + r.pounds, 0);
  f.fact("Unpaid in all: " + gbp(total) + " on " + plural(unpaid.length, "invoice") + "; " + gbp(late) + " of it late" + (old ? ", " + gbp(old) + " over 60 days." : ", none of it over 60 days."), "collections");
  const head = late ? gbp(late) + " is late, " + (old ? gbp(old) + " of it over 60 days" : "none of it over 60 days") : "Nothing is late. " + gbp(total) + " is not due yet";
  return result("ageing", head, gbp(total) + " is unpaid in all, on " + plural(unpaid.length, "invoice") + ". The older a debt, the harder it is to collect: chase the oldest bands first.", f, "collections",
    ["Who owes us money?", "Which customers pay late?", "Show sales week by week"], {
      period: { label: "as of today", range: dateWords(now) },
      chart: { kind: "barh", label: "Unpaid invoices by how late they are", fmt: "money", unit: "", rowName: "How late", valueName: "Unpaid",
        rows: rows.map((r) => ({ label: r.label, value: r.pounds, color: tone(r.label) === "red" ? "bad" : tone(r.label) ? "amber" : "p2" })) },
      metrics: [], basis: "Unpaid invoices from your accounts software, banded by days past their due date today.", method: "",
    });
}

// which analysis a question asks for; checked before the records answers, so "unpaid invoices" by age is not "who owes"
export const INSIGHTS = [
  ["weekly", /\b(week by week|each week|by week|weekly|per week|every week)\b/],
  ["why", /\bwhy\b.*\b(sales|revenue|takings|income|turnover)\b|\b(sales|revenue|takings|income|turnover)\b.*\b(chang|drop|fell|fall|down|up|rise|rose)/],
  ["ageing", /\bhow old\b|\bage(ing|d)?\b.*\b(invoice|debt|unpaid)|\baging\b|\b(invoice|debt|unpaid)s?\b.*\b(old|age)\b/],
  ["late", /\b(pay|pays|paying|payer|payers)\b.*\blate\b|\blate (payer|payers|paying)\b|\bslow (payer|payers|to pay)\b|\bpay slow/],
];

/** The analysis a question asks for ("" when none), the answer for it, or null when there is nothing to show. */
export function insightKind(question) {
  const q = String(question || "").toLowerCase();
  const hit = INSIGHTS.find(([k, re]) => re.test(q) && (k !== "weekly" || /\b(sales|revenue|takings|income|turnover|invoic)/.test(q) || !/\b(lead|repl|task|work|run)/.test(q)));
  return hit ? hit[0] : "";
}
export function insightAnswer(question, ctx) {
  const kind = insightKind(question);
  if (kind === "weekly") return salesByWeek(ctx);
  if (kind === "why") return salesWhy(ctx);
  if (kind === "late") return payLate(ctx);
  if (kind === "ageing") return ageing(ctx);
  return null;
}
