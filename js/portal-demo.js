// Illustrative data for the customer portal presentation (/customer-portal). A fictional company, generated
// deterministically so every visitor sees the same example; times are relative to now. Shapes match the real API
// (platform-gateway saas.py), so the presentation runs the real portal code unchanged. Nothing is sent anywhere:
// harmless actions update this in-memory example, anything that would move money, send email or delete data is
// declined with an explanation.
import { outcomeExample } from "./portal-outcome-example.js";
import { serviceExample } from "./portal-service-example.js";
import { createChat } from "./portal-demo-chat.js";
import { createAsk } from "./portal-demo-ask.js";
import { insightAnswer } from "./portal-demo-insights.js";
const MODS = ["customer_operations", "business_operations", "business_intelligence"];
const DAY = 86400000;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The generated example (portal-demo-data.js) is written at one moment; every time in it moves by the same amount, so it
// reads as if it happened just now. Dates without a time (a day's score) move by whole days.
function shifted(value, ms) {
  const days = Math.round(ms / DAY);
  if (typeof value === "string") {
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) return new Date(Date.parse(value) + ms).toISOString();
    if (/^\d{4}-\d\d-\d\d$/.test(value)) return new Date(Date.parse(value + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
    return value;
  }
  if (Array.isArray(value)) return value.map((x) => shifted(x, ms));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, shifted(x, ms)]));
  return value;
}

// Requests the example does not answer are noted (bounded) so tools/test_portal_demo_coverage can list them; a visitor
// sees the app's own error state for that one part, never a broken page.
const MISSES = [];
export function demoMisses() { return MISSES.slice(); }
function missed(method, p) {
  if (MISSES.length < 200 && !MISSES.includes(method + " " + p)) MISSES.push(method + " " + p);
  return Error("Not part of this presentation");
}

export function demoApi() {
  const r = rng(20260925), now = Date.now();
  const at = (days, hours = 0) => new Date(now - days * DAY - hours * 3600000).toISOString();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const id = (p) => p + "_" + Math.floor(r() * 36 ** 6).toString(36).padStart(6, "0");
  const ORG = "hv-logistics";

  // ---------------------------------------------------------------- service activity, last 30 days
  const cases = [];
  const ACTIONS = {
    customer_operations: [["health", 5], ["support_intake", 4], ["resolve", 5], ["churn", 2], ["customer_360", 3], ["feedback", 1], ["expansion", 1]],
    business_operations: [["work", 4], ["opportunity", 2], ["discover", 2], ["workflow", 2]],
    business_intelligence: [["kpi", 5], ["analyze", 2], ["forecast", 2], ["recommend", 2], ["decision", 1], ["diagnose", 1]],
  };
  const ops = [], openCases = [];
  for (let d = 29; d >= 0; d--) {
    MODS.forEach((m) => {
      const n = Math.floor(r() * (m === "customer_operations" ? 4 : 3) + (d < 10 ? 1 : 0));
      for (let k = 0; k < n; k++) {
        const w = ACTIONS[m], total = w.reduce((a, x) => a + x[1], 0); let x = r() * total, action = w[0][0];
        for (const [a, weight] of w) { if ((x -= weight) <= 0) { action = a; break; } }
        const roll = r(), status = roll < 0.9 ? "completed" : roll < 0.97 ? "failed" : "reconciliation_required";
        const receipt = { summary: "Recorded by the " + m.replace(/_/g, " ") + " service", at: at(d, k) };
        if (action === "support_intake") { const c = { id: id("case"), customer_id: pick(["CUS-1042", "CUS-2210", "CUS-3187", "CUS-0918"]), message: pick(["Invoice query on the last delivery", "Portal access for a new site manager", "Change of delivery address"]) }; cases.push(c); Object.assign(receipt, c); }
        if (action === "health") Object.assign(receipt, { customer_id: pick(["CUS-1042", "CUS-2210", "CUS-3187"]), health_score: Math.round(55 + r() * 40) });
        if (action === "decision") Object.assign(receipt, { decision: pick(["Move Salford drops to the early slot", "Add a second Leeds route", "Renegotiate the fuel card", "Pilot weekend deliveries", "Consolidate Manchester depots"]), evidence: "Recorded with its options and evidence" });
        if (action === "kpi") Object.assign(receipt, { metric: pick(["On-time delivery", "Cost per drop", "Fleet utilisation"]), value: Math.round(70 + r() * 25) });
        ops.push({ id: id("op"), module: m, action, status, completed_at: at(d, 2 + k * 2 + r() * 3), receipt, request_id: id("req") });
      }
    });
  }
  // a healthy support desk: every case is resolved 3 to 20 hours after it arrives, except the two newest (still inside
  // the 24 h target) and one kept overdue, so the response clock shows a realistic mix
  const intakes = ops.filter((x) => x.action === "support_intake" && x.status === "completed").sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  intakes.forEach((c, i) => {
    if (i >= intakes.length - 2 || i === intakes.length - 4 || ops.some((x) => x.action === "resolve" && x.receipt.case_id === c.receipt.id)) return;
    const when = new Date(new Date(c.completed_at).getTime() + (3 + r() * 17) * 3600000);
    if (when.getTime() < now) ops.push({ id: id("op"), module: "customer_operations", action: "resolve", status: "completed", completed_at: when.toISOString(), receipt: { summary: "Recorded by the customer operations service", case_id: c.receipt.id, customer_id: c.receipt.customer_id, resolution: "Resolved and confirmed in writing" }, request_id: id("req") });
  });
  ops.sort((a, b) => a.completed_at.localeCompare(b.completed_at));

  // ---------------------------------------------------------------- value ledger
  // title, service, proof, expected, actual, recorded cost, confidence, attribution, created (days ago), outcome (days ago), evidence
  const VAL = [
    ["Renewal kept at Northgate Freight", "customer_operations", "verified", 3650, 3650, 310, 0.82, "customer confirmation", 112, 96, "Signed renewal from Northgate Freight"],
    ["Approval process automated", "business_operations", "verified", 2400, 2410, 580, 0.9, "before and after measurement", 104, 82, "Approval times, six weeks before against six weeks after"],
    ["Delivery exception routine", "business_operations", "verified", 2600, 2800, 300, 0.74, "before and after measurement", 95, 61, "Exception handling hours from the rota"],
    ["Supplier bills captured and coded", "business_operations", "verified", 1600, 1820, 120, 0.86, "before and after measurement", 88, 47, "Bookkeeper hours on bills, before and after"],
    ["Fuel cost forecast adopted", "business_intelligence", "verified", 1300, 1450, 90, 0.77, "forecast against actual", 80, 40, "Fuel card statement against the forecast"],
    ["Faster first replies on weekend emails", "customer_operations", "verified", 900, 1080, null, 0.71, "before and after measurement", 60, 25, "Weekend reply times and two orders kept"],
    ["Repeat order nudge for Ashworth Foods", "customer_operations", "verified", 850, 860, 40, 0.8, "customer confirmation", 45, 12, "Ashworth Foods order confirmation"],
    ["Churn risk caught early at Clearline", "customer_operations", "observed", 2700, 2550, null, 0.64, "health trend", 70, 30, "Clearline order volume, three months"],
    ["Second depot contract kept", "customer_operations", "observed", 4800, 4400, null, 0.58, "customer confirmation", 58, 18, "Email from the depot manager"],
    ["Supplier invoice matching", "business_operations", "observed", 950, 1020, null, 0.69, "ledger comparison", 40, 9, "Matched invoices against the ledger"],
    ["Proof of delivery filing", "business_operations", "observed", 600, 490, null, 0.62, "before and after measurement", 30, 4, "Filing time from the routine's runs"],
    ["Route planning review", "business_intelligence", "estimated", 2050, null, null, 0.45, null, 21, null, "Route sheets for the Salford run"],
    ["Onboarding time reduced", "customer_operations", "estimated", 1100, null, null, 0.52, "unspecified", 14, null, "Onboarding checklist timings"],
    ["Pallet damage claims routine", "business_operations", "estimated", 800, null, null, 0.4, "before and after measurement", 6, null, "Claims log, last quarter"],
  ];
  const VAL_PROBLEM = ["Northgate Freight had not renewed and had asked two rivals for prices.", "Approvals waited in inboxes for days; drivers were held at the gate.",
    "Delivery exceptions were chased by phone, one at a time, after the customer called.", "Supplier bills were keyed in by hand at the end of each month.",
    "Fuel was bought at the pump price with no view of the next month.", "Weekend emails waited until Monday; two orders went elsewhere last quarter.",
    "Ashworth Foods usually orders every 30 days and had gone quiet.", "Clearline's orders had halved over three months with no word why.",
    "The second depot contract was up for renewal with a cheaper offer on the table.", "Supplier invoices were matched to deliveries by hand.",
    "Proof of delivery photos sat in drivers' phones for days.", "Routes are planned from memory; the Salford run doubles back twice a day.",
    "New customers wait a week for their account to be set up.", "Pallet damage claims take a month to file and half are never sent."];
  const value_items = VAL.map((v, i) => ({ id: "val_" + (i + 1), version: 3, title: v[0], service: v[1], status: v[2], expected_value: String(v[3]), actual_value: v[4] === null ? null : String(v[4]), costs: v[5] === null ? null : { other: String(v[5]) },
    currency: "GBP", confidence: v[6], attribution_method: v[7], created_at: at(v[8]), updated_at: at(v[9] === null ? v[8] : v[9]), verified_at: v[2] === "verified" ? at(v[9]) : null, executed_at: v[9] === null ? null : at(v[9] + 3),
    problem: VAL_PROBLEM[i], baseline: "Measured over the six weeks before the change, from your own records.", evidence_refs: [v[10]],
    execution_receipts: v[9] === null ? [] : ["XEV-RUN-" + (4100 + i * 37)], action: v[9] === null ? null : "Switched on and checked for two weeks by the team.", outcome: v[4] === null ? null : "Recorded " + (v[2] === "verified" ? "and verified " : "") + "against the baseline." }));
  const sumBy = (s) => value_items.filter((x) => x.status === s).reduce((a, x) => a + Number(s === "estimated" ? x.expected_value : x.actual_value), 0);
  const verified = value_items.filter((x) => x.status === "verified"), costed = verified.filter((x) => x.costs);
  const costs = costed.reduce((a, x) => a + Number(x.costs.other), 0);
  const valueSummary = () => ({ items: value_items.length, estimated_value_gbp: String(sumBy("estimated")), observed_value_gbp: String(sumBy("observed")), verified_value_gbp: String(sumBy("verified")),
    by_currency: { GBP: { estimated: String(sumBy("estimated")), observed: String(sumBy("observed")), verified: String(sumBy("verified")), verified_costs: String(costs), net_verified_with_recorded_costs: String(sumBy("verified") - costs), verified_items: verified.length, costed_verified_items: costed.length } },
    verified_items: verified.length, costed_verified_items: costed.length, cost_coverage: verified.length ? costed.length / verified.length : null,
    basis: "Currencies are never combined. Verified means recorded outcome evidence, not proven causation. Net value includes only verified entries with explicitly recorded costs; missing costs are unknown, not zero." });

  // ---------------------------------------------------------------- everything else
  const approvals = [
    { id: "apr_1", module: "business_operations", action: "approve_work", summary: "Switch on the approved design: Capture and code supplier bills", status: "pending", requested_at: at(0, 3), expires_at: new Date(now + 2 * DAY).toISOString() },
    { id: "apr_2", module: "business_operations", action: "approve_work", summary: "Pay supplier invoice INV-7741 matched to delivery", status: "pending", requested_at: at(0, 7), expires_at: new Date(now + DAY).toISOString() },
  ];
  const EVENTS = ["operations.completed", "operations.completed", "approval.requested", "approval.approved", "support.reply", "billing.payment_succeeded", "integration.verified", "operations.completed"];
  const notifications = Array.from({ length: 26 }, (_, i) => { const e = pick(EVENTS); return { id: "ntf_" + i, event: e, priority: e.startsWith("approval.requested") ? "high" : e.startsWith("billing") ? "normal" : pick(["normal", "normal", "low"]), status: "sent", at: at(i * 0.45, r() * 5) }; }).reverse();
  const members = [["acc_owner", "Sarah Vale", "OWNER", 120], ["acc_admin", "Tom Harbour", "ADMIN", 110], ["acc_ops1", "Dev Patel", "OPERATOR", 90], ["acc_ops2", "Dan Okafor", "OPERATOR", 60], ["acc_appr", "Grace Lin", "APPROVER", 58], ["acc_fin", "Mark Ellis", "BILLING", 40], ["acc_ana", "Zoe Clarke", "ANALYST", 21]]
    .map(([a, n, role, d]) => ({ id: a, account_id: a, display_name: n, role, status: "active", joined_at: at(d) }));
  const invitations = [{ id: "inv_1", email: "operations.lead@hv-logistics.example", role: "OPERATOR", status: "pending", expires_at: new Date(now + 5 * DAY).toISOString() }];
  // Connections, with what the gateway adds from the audit trail (connections_hub.connection_details): name, category,
  // access, who connected it and when, 14 days of recorded events (succeeded and failed apart) and the last events
  const cnr = rng(4417), cnDays = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * DAY).toISOString().slice(0, 10));
  const cnAct = (base, spread, fails = []) => ({ labels: cnDays, ok: cnDays.map((_, i) => Math.max(0, Math.round(base + spread * Math.sin(i * 0.9 + base) + cnr() * spread - spread / 2))), failed: cnDays.map((_, i) => (fails.includes(i) ? 1 : 0)) });
  const CN_WORDS = { "integration.authorised": "connected it", "integration.verified": "verified access", "integration.credential_saved": "saved its credential", "integration.disconnected": "disconnected it", "integration.disconnect_failed": "tried to disconnect it; the provider did not confirm" };
  const cnHist = (rows) => rows.map(([d, action, by]) => ({ at: at(d), action, words: CN_WORDS[action], ok: action !== "integration.disconnect_failed", by }));
  const cn = (key, name, category, status, health, sync, permissions, made, by, activity, history) => ({ key, name, category, status, health, last_sync_at: sync, disconnect_receipt: null, permissions, connected_at: at(made), connected_by: by, activity, history });
  const integrations = [
    cn("gmail", "Gmail", "Email and calendar", "connected", "healthy", at(0, 0.4), ["read", "send"], 96, "Sarah Vale", cnAct(6, 3), cnHist([[0.02, "integration.verified", "Tom Harbour"], [7, "integration.verified", "Tom Harbour"], [96, "integration.authorised", "Sarah Vale"]])),
    cn("hubspot", "HubSpot", "CRM and sales", "connected", "healthy", at(0, 1.2), ["read", "write"], 80, "Tom Harbour", cnAct(4, 2), cnHist([[1, "integration.verified", "Tom Harbour"], [80, "integration.authorised", "Tom Harbour"]])),
    cn("xero", "Xero", "Accounting and payments", "connected", "healthy", at(0, 2.5), ["read"], 64, "Mark Ellis", cnAct(3, 2), cnHist([[5.1, "integration.verified", "Tom Harbour"], [6.2, "integration.authorised", "Mark Ellis"]])),
    cn("zendesk", "Zendesk", "Customer service", "connected", "healthy", at(0, 5), ["read", "write"], 41, "Dan Okafor", cnAct(2, 2, [9]), cnHist([[2, "integration.verified", "Dan Okafor"], [4, "integration.disconnect_failed", "Dan Okafor"], [41, "integration.authorised", "Dan Okafor"]])),
    cn("slack", "Slack", "Team chat", "authorised", "pending_verification", null, ["read", "send"], 2, "Tom Harbour", cnAct(0.4, 1), cnHist([[2, "integration.authorised", "Tom Harbour"]])),
    cn("quickbooks", "QuickBooks Online", "Accounting and payments", "disconnected", "revoked", at(30), ["read"], 150, "Mark Ellis", cnAct(0, 0), cnHist([[30, "integration.disconnected", "Mark Ellis"], [150, "integration.authorised", "Mark Ellis"]])),
  ];
  const CATALOG = [["gmail", "Gmail", "email"], ["microsoft", "Microsoft 365", "email"], ["hubspot", "HubSpot", "crm"], ["salesforce", "Salesforce", "crm"], ["xero", "Xero", "accounting"], ["quickbooks", "QuickBooks Online", "accounting"],
    ["slack", "Slack", "messaging"], ["zendesk", "Zendesk", "support"], ["intercom", "Intercom", "support"], ["notion", "Notion", "knowledge"], ["segment", "Segment", "analytics"], ["website", "Website", "web"]]
    .map(([key, name, category]) => ({ key, name, category, connects_with: key === "segment" ? "api_key" : "sign_in", permissions: ["read"], options: [], available: !["salesforce", "notion"].includes(key), own_app: key === "microsoft", supports_own_app: ["microsoft", "salesforce", "slack", "zendesk", "intercom", "notion", "xero", "quickbooks"].includes(key) }));
  const support = [
    { id: "sup_1", subject: "Xero connection shows pending", message: "Our Xero connection has said pending for two days. Is there anything we need to do on our side?", priority: "normal", status: "resolved", created_by: "acc_admin", created_at: at(6), response_due_hours: 24,
      messages: [{ id: "m1", by: "operator", message: "Thanks, Tom. Xero asks the organisation's adviser to approve new apps; we have sent the steps to your inbox. Once approved, verify access from Connections.", at: at(5.8) }, { id: "m2", by: "acc_admin", message: "Approved on our side now, thank you.", at: at(5.1) }],
      history: [{ at: at(5.9), by: "operator", status: "in_progress", note: "Checking the provider's approval state" }, { at: at(5), by: "operator", status: "resolved", note: "Connection verified with the provider" }] },
    { id: "sup_2", subject: "Add a second approver for supplier payments", message: "We would like both Grace and Sarah to be able to approve supplier payments over £5,000.", priority: "high", status: "in_progress", created_by: "acc_owner", created_at: at(1.2), response_due_hours: 4,
      messages: [{ id: "m3", by: "operator", message: "Understood. The approval policy can require a named approver per amount band. We are preparing the change and will confirm before it takes effect.", at: at(1.1) }], history: [{ at: at(1.15), by: "operator", status: "in_progress", note: "Drafting the policy change" }] },
    { id: "sup_3", subject: "Weekly value report format", message: "Could the weekly value summary show each depot separately?", priority: "low", status: "open", created_by: "acc_fin", created_at: at(0, 5), response_due_hours: 24, messages: [], history: [] },
  ];
  const sessions = [{ id: "ses_1", created_at: at(0, 0.3), expires_at: new Date(now + 11.7 * 3600000).toISOString(), revoked: false }, { id: "ses_2", created_at: at(1, 4), expires_at: new Date(now + 3600000).toISOString(), revoked: false }, { id: "ses_3", created_at: at(4), expires_at: at(3.5), revoked: true, revoked_at: at(3.6) }];
  const invoices = [0, 1, 2].map((i) => ({ id: "inv_" + (i + 1), reference: "XEV-HV-" + (1043 - i), kind: "subscription", amount_pence: 49900, currency: "GBP", status: "paid", period_end: new Date(now + (30 - i * 30) * DAY).toISOString(), plan: { plan: "GROWTH" }, commercial_document: { number: "XEV-" + (2026091 - i * 31) } }));
  const processes = [
    { id: "proc_1", name: "Supplier invoice approval", department: "finance", description: "Match, approve and pay supplier invoices", version: 3, active: true, required_fields: ["supplier", "amount", "invoice_number"],
      steps: [{ name: "Validate invoice", type: "validate", required_fields: ["supplier", "amount"] }, { name: "Match to delivery", type: "decision", rules: [] }, { name: "Approval over £5,000", type: "approval", approval_reason: "Amount above threshold" }, { name: "Record in Xero", type: "action", connector: "xero", operation: "create_bill" }, { name: "Notify finance", type: "notify", connector: "slack" }, { name: "Close run", type: "close" }] },
    { id: "proc_2", name: "New customer onboarding", department: "operations", description: "From signed order to first delivery", version: 2, active: true, required_fields: ["customer", "first_delivery_date"],
      steps: [{ name: "Validate order", type: "validate" }, { name: "Create account", type: "action", connector: "hubspot", operation: "create_company" }, { name: "Welcome email", type: "notify", connector: "gmail" }, { name: "Record completion", type: "record" }, { name: "Close run", type: "close" }] },
  ];
  const WORK = ["completed", "completed", "completed", "completed", "awaiting_approval", "in_progress", "in_progress", "exception"];
  const work = WORK.map((s, i) => ({ id: "run_" + (201 + i), process_id: i % 3 ? "proc_1" : "proc_2", process_version: i % 3 ? 3 : 2, status: s, current_step: s === "completed" ? "Close run" : s === "awaiting_approval" ? "Approval over £5,000" : "Match to delivery", approval_required: s === "awaiting_approval", approval_status: s === "awaiting_approval" ? "pending" : null, missing_fields: s === "exception" ? ["invoice_number"] : [], result: { steps_completed: s === "completed" ? 6 : 2 }, decision: null }));
  const exceptions = [{ id: "exc_1", work_item_id: "run_208", kind: "missing_data", status: "open", reason: "The invoice number is missing from the supplier email", details: { supplier: "Pennine Fuel Ltd", amount: "2,140.00" } }, { id: "exc_2", work_item_id: "run_199", kind: "provider_timeout", status: "resolved", reason: "Xero took too long to respond; retried successfully", details: {} }];
  const usageRows = Array.from({ length: 50 }, (_, i) => ({ id: "use_" + i, service: pick(MODS), metric: pick(["workflow_executions", "agent_actions", "ai_tokens"]), quantity: 1 + Math.floor(r() * 40), source: "runtime", at: at(i * 0.5) }));
  const done = ops.filter((x) => x.status === "completed");
  const sub = { id: ORG, plan: "GROWTH", status: "active", modules: MODS.slice(), billing_cycle: "monthly", paid_through: new Date(now + 26 * DAY).toISOString(), entitlements: { modules: 4, team: 1e9, integrations: 1e9, workflows: 5000, ai_tokens: 100000000, ai_calls_per_day: 5000, decision_scenarios: false, priority_onboarding: false } };
  const onboarding = { status: "ready", completed_steps: ["approvals", "automation", "business", "goals", "integrations", "metrics", "permissions", "services"], data: { business: { legal_name: "Harbour & Vale Logistics Ltd", industry: "Transport and storage" }, goals: { primary_outcome: "Keep every customer through renewal" }, metrics: { primary_metric: "Net revenue retention" }, integrations: { selected: ["gmail", "hubspot", "xero"] }, permissions: { confirmed: true }, services: { modules: MODS }, automation: { schedule: "Weekdays 08:00–18:00" }, approvals: { policy: "Every outbound message and any payment over £5,000" } } };
  const health = () => ({ score: 82, drivers: { subscription_active: true, onboarding_progress: 1, healthy_integrations: integrations.filter((x) => x.health === "healthy").length, workflow_success_rate: done.length / ops.length, recorded_value_items: value_items.length, actual_service_usage: usageRows.reduce((a, x) => a + x.quantity, 0), open_support: support.filter((x) => !["resolved", "confirmed", "closed"].includes(x.status)).length, verified_value_items: verified.length, notification_events: notifications.length }, churn_risk: "low", expansion_potential: "not_ready", calibration: "operational health indicator; not a calibrated probability" });
  const usageTotals = () => { const totals = {}, by = {}; usageRows.forEach((u) => { totals[u.metric] = (totals[u.metric] || 0) + u.quantity; (by[u.service] = by[u.service] || {})[u.metric] = ((by[u.service] || {})[u.metric] || 0) + u.quantity; }); totals.ai_tokens = (totals.ai_tokens || 0) * 1850; return { totals, by_service: by, tasks: { used: 12840, limit: 40000, period: new Date(now).toISOString().slice(0, 7) }, reconciliation_pending: 0, basis: "Totals include only recorded measured quantities. Missing nested provider/token evidence remains unknown, not zero." }; };
  const pairs = [["dec_1", 4200, 3900, "business_intelligence"], ["dec_2", 2600, 2900, "business_intelligence"], ["dec_3", 9000, 8800, "customer_operations"], ["dec_4", 5000, 5400, "customer_operations"], ["dec_5", 1800, 2050, "business_operations"]].map(([d, e, a, s]) => ({ decision_id: d, expected: String(e), actual: String(a), error: String(a - e), abs_error: String(Math.abs(a - e)), service: s, attribution_method: "forecast against actual" }));
  const optimization = () => ({ generated_at: new Date(now).toISOString(), learning_calibration: { pairs: pairs.length, mean_absolute_error: String(pairs.reduce((a, p) => a + Number(p.abs_error), 0) / pairs.length), bias: String(pairs.reduce((a, p) => a + Number(p.error), 0) / pairs.length), items: pairs },
    attribution_quality: { by_method: value_items.reduce((m, x) => ((m[x.attribution_method || "unspecified"] = (m[x.attribution_method || "unspecified"] || 0) + 1), m), {}), verified_items: verified.length, costed_verified_items: costed.length, cost_coverage: costed.length / verified.length, unspecified_share: value_items.filter((x) => !x.attribution_method || x.attribution_method === "unspecified").length / value_items.length, basis: "Attribution methods are labels from recorded evidence. Unspecified share should fall as operators complete outcomes." },
    contribution: { plan: "GROWTH", active_modules: MODS, verified_value_summary: valueSummary(), usage_totals: usageTotals().totals, net_verified_available: true, basis: "Contribution uses only verified ledger entries with recorded costs. Platform subscription price and live provider invoices are external; this endpoint does not invent COGS or ROI." },
    cross_service: { entitled_modules: MODS, modules_with_completed_work: MODS, unused_entitled: [], cross_service: true, completion_counts: MODS.reduce((m, k) => ((m[k] = done.filter((x) => x.module === k).length), m), {}), basis: "Adoption counts completed operation receipts, not logins. Expansion suggestions require unused entitled modules plus separate value evidence." },
    health: { score: 85, priority_band: "healthy", drivers: [{ driver: "subscription", state: "active", effect: "+25" }, { driver: "onboarding", state: "8_steps", effect: "+15" }, { driver: "integrations", state: "4_verified", effect: "+15" }, { driver: "workflows", state: "high_success", effect: "+20" }, { driver: "value", state: "verified_outcomes", effect: "+10" }, { driver: "support", state: "one_open", effect: "+0" }] },
    complete_erasure_claim: false, causal_roi_claim: false });

  // Customers inbox: new customer emails with a reply written from the company's facts, waiting to be checked.
  const SIGN = "\n\nSarah, Harbour & Vale";
  const care = { settings: { version: 3, enabled: true, inbox: "gmail", mailbox: "hello@harbourvale.example", signature: "Sarah, Harbour & Vale", auto_send: false, minutes_saved: 4, hourly_cost: 24,
      facts: "Harbour & Vale Logistics Ltd delivers pallets and parcels across the North West, Monday to Saturday. Collections booked by 2pm go the same day. Drivers text customers 30 minutes before arriving.",
      enabled_at: new Date(now - 60 * DAY).toISOString(), last_checked_at: new Date(now - 40000).toISOString(), last_error: null },
    drafts: [{ id: "care_4", from: "dave@pennineplant.example", subject: "Damaged pallet on Tuesday", received_at: new Date(now - 26 * 60000).toISOString(), status: "needs_you", category: "complaint", handoff: true,
        reason: "They asked to speak to a person. Reply yourself, or call them if they gave a number.", text: "Hi, one of our pallets arrived damaged on Tuesday. I'd like to speak to someone about it please, 0161 496 0000.",
        draft: "Hi Dave, I am sorry the pallet arrived damaged. Someone from our team will call you today to sort it out." + SIGN },
      { id: "care_1", from: "priya@bristolkitchens.example", subject: "Saturday deliveries?", received_at: new Date(now - 11 * 60000).toISOString(), status: "ready", category: "question", confidence: 0.92,
        text: "Hi, do you deliver on Saturdays? We have a pallet going to Preston.", draft: "Hi Priya, yes, we deliver pallets across the North West on Saturdays too, Preston included. The driver will text you 30 minutes before arriving." + SIGN },
      { id: "care_2", from: "tom@beckbuilders.example", subject: "Price for 4 pallets to Leeds", received_at: new Date(now - 38 * 60000).toISOString(), status: "needs_you", category: "sales", lead: true, acknowledged_at: new Date(now - 37 * 60000).toISOString(),
        reason: "It asks for a price that is not in your facts.", text: "Hello, what would you charge to take 4 pallets from Bolton to Leeds next Tuesday?", draft: "Hi Tom, thanks for asking. We will send you the price for 4 pallets from Bolton to Leeds on Tuesday by the end of today." + SIGN },
      { id: "care_3", from: "sara@mossretail.example", subject: "Can you collect at 3pm instead?", received_at: new Date(now - 64 * 60000).toISOString(), status: "ready", category: "request", confidence: 0.88,
        text: "Hi, could your driver collect at 3pm today instead of 11am?", draft: "Hi Sara, collections booked after 2pm go the next working day, so your driver can collect at 3pm today and it will be delivered tomorrow." + SIGN }],
    sent: 46 };
  const careView = () => { const open = care.drafts.filter((d) => ["ready", "needs_you", "unconfirmed"].includes(d.status)), hours = Math.round(care.sent * care.settings.minutes_saved / 6) / 10;
    return { settings: care.settings, inboxes: ["gmail"], entitled: true, drafts: open, recent: care.drafts.filter((d) => !open.includes(d)),
      stats: { ready: open.filter((d) => d.status === "ready").length, needs_you: open.filter((d) => d.status === "needs_you").length, unconfirmed: 0, sent_7d: care.sent, auto_7d: 0,
        median_minutes_to_reply_7d: 7, hours_saved_7d: hours, value_7d_gbp: (hours * care.settings.hourly_cost).toFixed(2),
        for_a_person: open.filter((d) => d.handoff).length, new_business_waiting: open.filter((d) => d.lead).length, new_business_answered_7d: 9, new_business_within_target_7d: 8, lead_target_minutes: 5 },
      learning: { last_30_days: { sent: 41, unchanged: 29, unchanged_share: 0.707, kept_when_edited: 0.86 }, previous_30_days: { sent: 38, unchanged: 20, unchanged_share: 0.526, kept_when_edited: 0.79 }, examples: 112,
        how: "Each reply your team sends is kept as an example; new replies are written with your most similar past replies beside them." } }; };

  // Dates for the examples below
  const dayOf = (days) => new Date(now - days * DAY).toISOString().slice(0, 10);
  const longDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  // Ask for reviews: customers who paid in full this week, each with a thank-you asking for an honest review.
  const REVIEW_LINK = "https://harbourvale.example/review";
  const reviewWording = { subject: "Thank you from {business}", message: "Hello {customer},\n\nThank you for choosing {business}. We hope everything went well.\n\nWould you take a minute to leave an honest review? It helps other people find us:\n{review_link}\n\nThank you,\n{signature}" };
  const reviewRow = (id, number, customer, email, amount, days) => ({ id, number, customer, email, amount, currency: "GBP", paid_on: dayOf(days), status: "ready", subject: "Thank you from Harbour & Vale",
    text: "Hello " + customer + ",\n\nThank you for choosing Harbour & Vale. We hope everything went well.\n\nWould you take a minute to leave an honest review? It helps other people find us:\n" + REVIEW_LINK + "\n\nThank you,\nSarah, Harbour & Vale" });
  const reviews = { settings: { version: 1, enabled: true, source: "xero", inbox: "gmail", review_link: REVIEW_LINK, signature: "Sarah, Harbour & Vale", wording: reviewWording, auto_send: false, delay_days: 1,
      minimum_amount: 0, minutes_saved: 2, hourly_cost: 24, last_scan_at: new Date(now - 34 * 60000).toISOString(), last_error: null },
    requests: [reviewRow("rev_1", "INV-2186", "Northwind Garden Ltd", "accounts@northwindgarden.example", "920.00", 1), reviewRow("rev_2", "INV-2195", "Beck Builders Ltd", "finance@beckbuilders.example", "1460.00", 2)],
    sent: 19, asked: 64, noEmail: 2 };
  // Ready-made routines: business maps for common trades, with the templates' own starting estimates.
  const routine = (name, description, runs, minutes, rate, steps) => ({ name, description, steps: steps.map(([n, t]) => ({ name: n, type: t })),
    estimate: { runs_per_month: runs, minutes_each: minutes, hours_per_month: Math.round(runs * minutes / 6) / 10, cost_per_month_gbp: Math.round(runs * minutes / 60 * rate) } });
  const routineSets = [
    { name: "logistics", label: "Logistics", department: "operations", fits_you: true, installed: false, processes: [
      routine("Delivery exception handling", "Log a failed or late delivery, tell the customer, rebook and record the outcome.", 120, 15, 24, [["Check the details", "validate"], ["Decide the fix", "decision"], ["Tell the customer", "notify"], ["Record", "record"], ["Close", "close"]]),
      routine("Proof of delivery filing", "Match each proof of delivery to its job and invoice.", 600, 3, 24, [["Check the details", "validate"], ["Record", "record"], ["Close", "close"]])] },
    { name: "accounting", label: "Accounting", department: "finance", fits_you: false, installed: true, processes: [
      routine("Accounts Payable Invoice Processing", "Validate supplier invoices, route exceptions, post approved invoices.", 250, 12, 28, [["Validate invoice", "validate"], ["Determine approval", "decision"], ["Financial approval", "approval"], ["Post invoice", "action"], ["Close", "close"]])] },
    { name: "core_operations", label: "Core operations", department: "operations", fits_you: false, installed: false, processes: [
      routine("New starter set-up", "Accounts, equipment and first-week tasks for a new team member.", 4, 90, 30, [["Check the details", "validate"], ["Manager approval", "approval"], ["Tell IT", "notify"], ["Record", "record"], ["Close", "close"]])] }];
  routineSets.forEach((x) => (x.hours_per_month = Math.round(x.processes.reduce((a, p) => a + p.estimate.hours_per_month, 0) * 10) / 10));
  // Automations from their own work: repeat jobs with no routine yet, and a routine whose approvals are always given.
  const proposals = { how: "Found in your own work: jobs Xevrion was given with no routine for, the requests your customers email about most, and how your routines actually run.", done: [], open: [
    { id: "new-pod", kind: "new_routine", status: "open", title: "Proof of delivery for last week's consignment", why: "9 times in 90 days (about 3 a month), and no routine handles it yet.",
      change: "Save it as a routine: new ones like it are routed to it, a person approves before anything acts, and every step can be edited.",
      evidence: { count: 9, per_month: 3, examples: ["Proof of delivery for consignment HV-20931", "POD needed for Tuesday's pallets", "Signed POD for order 7741 please"], template: "Proof of delivery request", sources: { email: 9 }, estimate_hours_per_month: 0.8 },
      steps: [{ name: "Check the consignment number", type: "validate" }, { name: "A person approves", type: "approval" }, { name: "Send the signed POD", type: "action" }, { name: "Record", type: "record" }, { name: "Close", type: "close" }], keywords: ["consignment", "delivery", "pod", "proof", "signed"] },
    { id: "new-rebook", kind: "new_routine", status: "open", title: "Change of collection time", why: "6 times in 90 days (about 2 a month), and no routine handles it yet.",
      change: "Save it as a routine: new ones like it are routed to it, a person approves before anything acts, and every step can be edited.",
      evidence: { count: 6, per_month: 2, examples: ["Can we move Thursday's collection to 2pm?", "Collection time change for PO 5512"], template: null, sources: { work: 2, email: 4 } },
      steps: [{ name: "Check the details", type: "validate" }, { name: "A person approves", type: "approval" }, { name: "Tell the team", type: "notify" }, { name: "Record it", type: "record" }, { name: "Close", type: "close" }], keywords: ["collection", "move", "time"] },
    { id: "approve-fuel", kind: "auto_approve", status: "open", title: "Supplier bill check: let small amounts through without a person", why: "38 of 38 approvals in 90 days were given. Amounts approved ran up to £480.",
      change: "Approval is skipped for amounts under £400 with no conflicting details; anything else, or with no clear amount, still asks.", evidence: { decisions: 38, approved: 38, largest_approved: 480, declined_amounts: [] }, process_id: "p_bills", step: "Check the bill", limit: 400 }] };
  // Each person's own page layouts (none until they customise a page), and the organisation's sign-in rules.
  const pageLayouts = {};
  const securityPolicy = { version: 2, require_mfa: false, session_hours: 12, updated_at: new Date(now - 9 * DAY).toISOString() };
  // Your customers: each customer's buying and paying pattern from the accounts, and the best next step for each.
  const cust = (id, name, email, segment, revenue, invoices, gap, since, late, overdue, step, extra = {}) => ({ id, name, email, segment, revenue_12m: String(revenue), invoices_12m: invoices, usual_gap_days: gap,
    days_since_last: since, median_days_late: late, overdue_now: String(overdue), oldest_overdue_days: overdue ? 19 : 0, first_invoice: dayOf(700), last_invoice: dayOf(since), emails_90d: 4, last_email: new Date(now - 2 * DAY).toISOString(),
    complaints: [], open_quotes: [], rfm: null, next_step: step, ...extra });
  const customers = [
    cust("c1", "Pennine Plastics Ltd", "buying@pennineplastics.example", "Top customer", 61400, 26, 14, 6, 0, 0, { kind: "thank", title: "Thank a top customer", why: "£61,400 in the last 12 months across 26 invoices, paid on time. A review request goes after their next payment.", value: "0" }, { rfm: { recency: 3, frequency: 3, value: 3 } }),
    cust("c2", "Ashworth Foods Ltd", "orders@ashworthfoods.example", "At risk", 18900, 11, 30, 71, 2, 0, { kind: "check_in", title: "Check in: they are later than usual", why: "They usually order every 30 days; it has been 71 days. A typical order is £1,718.", value: "1718", draft: true }, { rfm: { recency: 1, frequency: 3, value: 2 } }),
    cust("c3", "Beck Builders Ltd", "finance@beckbuilders.example", "Regular", 14200, 5, 38, 12, 21, 0, { kind: "none", title: "Nothing needed now", why: "", value: "0" }, { rfm: { recency: 3, frequency: 2, value: 2 } }),
    cust("c4", "Moss Retail Ltd", "hello@mossretail.example", "Regular", 7600, 6, 45, 20, 3, 0, { kind: "complaint", title: "Answer their complaint personally", why: "They complained on " + longDate(dayOf(3)) + ": \"Pallet arrived damaged\". They are worth £7,600 a year to you.", value: "7600", go: "customer_operations" },
      { complaints: [{ subject: "Pallet arrived damaged", at: new Date(now - 3 * DAY).toISOString() }], rfm: { recency: 2, frequency: 2, value: 2 } }),
    cust("c5", "Northwind Garden Ltd", "accounts@northwindgarden.example", "Regular", 9200, 8, 42, 30, 16, 0, { kind: "terms", title: "Change their payment terms", why: "Their last 7 paid invoices were paid a median of 16 days late.", do: "Ask for a deposit, shorter terms or payment on order.", value: "1150" }, { rfm: { recency: 2, frequency: 2, value: 2 } }),
    cust("c6", "Kirkby Joinery Ltd", "", "New", 1180, 1, null, 40, null, 0, { kind: "none", title: "Nothing needed now", why: "", value: "0" }, { rfm: { recency: 2, frequency: 1, value: 1 } })];
  const customerView = () => ({ settings: { version: 1, enabled: true, source: "xero", inbox: "gmail", signature: "Sarah, Harbour & Vale", last_scan_at: new Date(now - 5 * 3600000).toISOString(), last_error: null },
    sources: ["xero"], inboxes: ["gmail"], entitled: true, customers, next_steps: customers.filter((c) => c.next_step.kind !== "none").sort((a, b) => Number(b.next_step.value) - Number(a.next_step.value)),
    summary: { customers: 6, revenue_12m: "112480", overdue_now: "0", segments: { "Top customer": 1, "At risk": 1, Regular: 3, New: 1 }, steps: 5, largest_customer: { name: "Pennine Plastics Ltd", share: 0.546 }, concentration_risk: true },
    method: "RFM scores are thirds within your own customers; a check-in is suggested when the usual gap between orders (the median of their past gaps) has run 1.5 times over; payment habit is the median days late on paid invoices." });
  // Always improving: what Xevrion found to automate or grow next, from the company's own records.
  const imp = (id, service, kind, title, why, change, extra = {}) => ({ id, service, kind, title, why, change, status: "open", first_seen: new Date(now - 3 * DAY).toISOString(), can_apply: false, can_undo: false, safe: false, ...extra });
  const improvements = { settings: { version: 1, auto_apply: true, last_run_at: new Date(now - 12 * 60000).toISOString() }, rows: [
    imp("care_facts", "customer_operations", "attention", "Teach replies the answers customers keep asking for", "7 customer emails in the last 30 days could not be answered from your facts alone: \"Price for 4 pallets to Leeds\"; \"Do you take hazardous goods?\"; \"Weekend collections\".", "Each answer you add to your facts lets later replies be written in full, with nothing for you to fill in.", { go: "customer_operations", needs: "the missing answers, in Settings" }),
    imp("hourly_cost", "business_intelligence", "setting", "Show the time saved in pounds", "Xevrion wrote 88 messages for you in the last 30 days, about 5.3 hours of work.", "Every message sent is added to your Ledger in pounds.", { status: "applied", applied_at: new Date(now - 9 * DAY).toISOString() }),
    imp("connect_accounts", "business_operations", "connect", "Connect Xero or QuickBooks", "Customer profiles and review requests start from your accounts.", "Unlocks both.", { status: "done", done_at: new Date(now - 20 * DAY).toISOString() })] };
  const improvementView = () => { const rows = improvements.rows, by = (s) => rows.filter((r) => r.status === s);
    return { settings: improvements.settings, open: by("open"), made: rows.filter((r) => ["applied", "done"].includes(r.status)), dismissed: by("dismissed"),
      counts: { open: by("open").length, applied: by("applied").length, done: by("done").length, automatic: by("applied").filter((r) => r.automatic).length } }; };
  const reviewView = () => { const open = reviews.requests.filter((r) => ["ready", "needs_you", "unconfirmed"].includes(r.status));
    return { settings: reviews.settings, sources: ["xero"], inboxes: ["gmail"], entitled: true, requests: open, recent: reviews.requests.filter((r) => !open.includes(r)), quiet_days: 180,
      stats: { to_check: open.length, needs_you: 0, sent_30d: reviews.sent, customers_asked_180d: reviews.asked, no_email: reviews.noEmail } }; };

  const dashboard = () => ({ organization: { id: ORG, name: "Harbour & Vale (example)", status: "active" }, subscription: sub, usage: usageRows, value_items, operation_results: ops.slice(-100), pending_approvals: approvals.filter((a) => a.status === "pending"), notifications: notifications.slice(-50), onboarding });
  const refuse = (what) => { throw Error("This is a presentation with illustrative data, so " + what + " is not sent anywhere. In your own portal it works exactly as shown."); };

  // ---------------------------------------------------------------- Security, Business map and Automations
  // (security_center.py, business_map.py, automation_library.py, automation_designer.py): worked out by the gateway's own
  // modules into portal-demo-data.js (tools/portal_demo_fixtures.py), loaded the first time one of these screens opens.
  let fx = null;
  const fixtures = () => (fx ||= import("./portal-demo-data.js").then((d) => { const ms = Date.now() - Date.parse(d.REF), D = {};
    Object.entries(d).forEach(([k, v]) => { if (k !== "REF") D[k] = k === "RESEARCH" ? v : shifted(v, ms); });   // a source's date is a fact: never moved
    D.designs = D.AUTO_DESIGNS.items.map((x) => D.AUTO_DETAILS[x.id]); return D; }));
  const still = (what) => { throw Error("In this presentation " + what + ". In your own portal it works exactly as shown."); };
  // ---------------------------------------------------------------- the six agents (cycle 17, agents_hub.py)
  // The Agents home, each agent's activity log and the marketplace, from portal-demo-data.js (tools/portal_demo_fixtures.py
  // makes each entry with agents_hub.entry()). An agent's switch works on the example (it is harmless and can be put
  // back) and writes its own activity entry, as the real app does; hiring an agent would bill, so it is declined.
  let agentState = null;
  const agentsOf = async () => {
    const D = await fixtures();
    if (!D.AGENT_HUB) return null;
    agentState ||= { hub: structuredClone(D.AGENT_HUB), log: structuredClone(D.AGENT_ACTIVITY || []), market: structuredClone(D.AGENT_MARKET || { items: [], core: [] }) };
    return agentState;
  };
  const agentApi = async (method, p, q, body) => {
    const st = await agentsOf();
    if (!st) throw missed(method, p);
    if (method === "GET" && p === "/O/agent-hub") return structuredClone(st.hub);
    if (method === "GET" && p === "/O/agent-hub/marketplace") return structuredClone(st.market);
    if (method === "GET" && p === "/O/agent-hub/activity") {
      const agent = q.get("agent") || "", before = q.get("before") || "";
      const limit = Math.max(1, Math.min(Number(q.get("limit")) || 50, 100));
      const items = st.log.filter((e) => (!agent || e.agent === agent) && (!before || e.id < before)).slice(0, limit);
      return { items: structuredClone(items), next: items.length === limit ? items[items.length - 1].id : "" };
    }
    let m;
    if (method === "POST" && (m = /^\/O\/agent-hub\/([a-z]+)\/state$/.exec(p))) {
      const a = st.hub.agents.find((x) => x.id === m[1]);
      if (!a) throw Error("That agent is not part of Xevrion.");
      if (!a.owned) throw Error("Hire the " + a.name + " before switching it on.");
      const on = Boolean(body && body.on), when = new Date().toISOString();
      a.on = on; a.working = on && !st.hub.paused_all; a.why_off = on ? "" : "Switched off"; a.switched_at = when; a.switched_by = "You (example)";
      const e = { id: when.replace(/[-:.]/g, "").slice(0, 15) + "000000Z" + Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0"),
        agent: a.id, org: ORG, action: on ? "Switched on" : "Switched off", ref: { kind: "agent", id: a.id, page: a.page, label: a.name }, outcome: "done",
        by: "You (example)", by_kind: "person", detail: String((body && body.reason) || ""), at: when };
      st.log.unshift(e); a.last = e; a.today += 1; a.week += 1;
      return { agent: structuredClone(a) };
    }
    if (method === "POST" && p.startsWith("/O/agent-hub/marketplace/")) refuse("hiring or removing an agent");
    // 21C: the workspace across the agents (workspace_hub.py), from portal-demo-data.js's AGENT_WORKSPACE; nothing is saved
    if (p === "/O/agent-hub/workspace" || p.startsWith("/O/agent-hub/workspace/")) {
      if (method === "GET") {
        // 24B3: a record panel's Activity (one agent's entries naming that record), from the same example log
        if (p === "/O/agent-hub/workspace/timeline" && !(((await fixtures()).AGENT_WORKSPACE || {})[p + (q.get("agent") ? ":" + q.get("agent") : "")])) {
          const agent = q.get("agent") || "", words = String(q.get("q") || "").toLowerCase().slice(0, 80);
          const limit = Math.max(1, Math.min(Number(q.get("limit")) || 25, 100));
          const items = st.log.filter((e) => (!agent || e.agent === agent) && (!words || (String(e.action || "") + " " + String(e.detail || "") + " " + String((e.ref && e.ref.label) || "")).toLowerCase().includes(words))).slice(0, limit);
          return { items: structuredClone(items), total: items.length };
        }
        const W = (await fixtures()).AGENT_WORKSPACE || {}, key = p + (q.get("agent") ? ":" + q.get("agent") : "");
        if (W[key]) return structuredClone(W[key]);
        throw missed(method, p);
      }
      refuse("changing workspace settings, views or templates");
    }
    throw missed(method, p);
  };
  // the Operations Agent (17G, operations_agent.py): its overview and the dry runs of its example rules, from
  // portal-demo-data.js; its rule designs join the Automations lists. Any change is declined: it is an example.
  const opsApi = async (method, p, q, body) => {
    const D = await fixtures();
    const O = D.OPS_AGENT;
    if (!O) throw missed(method, p);
    if (method === "GET" && p === "/O/automations/ops") return structuredClone(O.overview);
    if (method === "POST" && p === "/O/automations/ops/understand") {
      const hit = O.previews[String((body && body.text) || "").trim()];
      if (hit) return structuredClone(hit);
      throw Error("In this example, try one of the example rules.");
    }
    throw Error("Example only: nothing was changed.");
  };
  const withOpsDesigns = async (method, p, q, body) => {
    const D = await fixtures(), O = D.OPS_AGENT;
    const m = /^\/O\/automations\/designs\/(des_\w+)$/.exec(p);
    if (O && m && O.designs[m[1]]) return structuredClone(O.designs[m[1]]);
    const base = await extraApi(method, p, q, body);
    if (!O) return base;
    if (p === "/O/automations/designs") return { ...base, items: structuredClone(O.list).concat(base.items || []) };
    if (p === "/O/automations/runs") return { ...base, designs: { ...(base.designs || {}), ...structuredClone(O.runs) } };
    return base;
  };
  const exampleView = async (key, method, p) => {
    const D = await fixtures();
    if (method !== "GET" || !D[key]) throw missed(method, p);
    return structuredClone(D[key]);
  };
  const stem = (w) => w.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
  // the library automation closest to a description (automation_library.best_match: a key word counts three, other words one)
  const libraryMatch = (D, brief) => { const words = new Set(((String(brief.description || "") + " " + String(brief.role || "")).toLowerCase().match(/[a-z]+/g) || []).map(stem));
    let best = null, top = 0;
    D.AUTO_LIBRARY.items.forEach((t) => { const keys = new Set(t.keywords.map(stem)), hay = new Set(((t.name + " " + t.does + " " + t.for_whom).toLowerCase().match(/[a-z]+/g) || []).map(stem));
      let score = 0; words.forEach((w) => { if (keys.has(w)) score += 3; else if (w.length > 3 && hay.has(w)) score += 1; });
      if (score > top) { top = score; best = t; } });
    return top >= 3 ? D.AUTO_TEMPLATES[best.id] : null; };
  const designFrom = (D, t, brief, note) => { const stamp = new Date().toISOString(), ident = "des_" + Math.floor(r() * 16 ** 12).toString(16).padStart(12, "0");
    const x = { id: ident, name: t.workflow.name || t.name, status: "draft", version: 1, design_version: 1, source: "library", template_id: t.id, problems: [],
      notes: note ? [note].concat(t.notes) : t.notes.slice(), created_by: "acc_owner", created_at: stamp, updated_at: stamp, approved_by: null, approved_at: null,
      installed_ref: null, reason: null, summary: t.workflow.summary, source_words: "Built from the library", trigger: t.workflow.trigger, approvable: true,
      estimate: t.workflow.estimate, steps: t.steps, readiness: t.readiness, workflow: t.workflow, brief,
      versions: [{ n: 1, source: "library", change: note ? "Designed from your description" : "Installed from the library", by: "acc_owner", at: stamp, problems: 0 }] };
    D.designs.unshift(x); const { versions, ...out } = x; return out; };
  // a what-if: every single change the map offers (stopping an automation, removing a tool, automating an opportunity,
  // adding a check to a hotspot) comes from business_map.simulate itself; brand-new automations are added to the map's
  // own totals. The "before" is the map's summary, kept once in the data.
  const mapWhatIf = (D, changes) => { const c = changes[0] || {}, one = changes.length === 1 && D.MAP_WHAT_IF[c.op + ":" + (c.edge_id || c.node_id)];
    if (one) { const r = JSON.parse(JSON.stringify(one)); r.before = D.BUSINESS_MAP.summary;
      if (c.op === "add_control" && c.label) { const swap = (t) => String(t).split("A new check").join(c.label);
        r.effects = r.effects.map(swap); r.ghost.nodes.forEach((n) => { n.label = swap(n.label); }); }
      return r; }
    if (!changes.length || changes.some((x) => x.op !== "add_automation" || x.edge_id)) still("a what-if tries one change the map suggests at a time, or adds a new automation you describe");
    const map = D.BUSINESS_MAP, before = map.summary, ids = new Set(map.nodes.map((n) => n.id)), sum = (xs) => xs.reduce((a, x) => a + x, 0);
    const links = sum(changes.map((x) => (x.links || []).filter((l) => ids.has(l)).length)), owners = changes.filter((x) => ids.has(x.owner)).length;
    const costs = changes.map((x) => Number(x.cost_gbp_month) || 0).filter(Boolean), risks = map.nodes.map((n) => n.health.risk).filter((x) => x != null).concat(changes.map(() => 10));
    const after = { ...before, nodes: before.nodes + changes.length, edges: before.edges + links + owners, lanes: { ...before.lanes, work: before.lanes.work + changes.length },
      flows: { ...before.flows, work: before.flows.work + links, approval: before.flows.approval + owners },
      hours_saved_week: Math.round((before.hours_saved_week + sum(changes.map((x) => Number(x.hours_week) || 0))) * 10) / 10,
      cost_gbp_month: Math.round((before.cost_gbp_month + sum(costs)) * 100) / 100, cost_known_for: before.cost_known_for + costs.length, risk_avg: Math.round(sum(risks) / risks.length) };
    const delta = Object.fromEntries(["hours_saved_week", "cost_gbp_month", "risk_avg", "bottlenecks", "needs_person", "failing", "single_points", "wait_item_hours_week", "automation_coverage", "opportunity_gbp_week"]
      .map((k) => [k, typeof after[k] === "number" && typeof before[k] === "number" ? Math.round((after[k] - before[k]) * 100) / 100 : null]));
    const ghostNodes = changes.map((x, i) => ({ id: "a:proc:sim-" + (i + 1), kind: "process", lane: "work", label: x.label || "New automation", detail: "Proposed", owner: x.owner || "", source: "auto", acting: "xevrion",
      page: "", health: { risk: 10, cost_gbp_month: Number(x.cost_gbp_month) || null, hours_week: Number(x.hours_week) || 0 }, flags: [], note: "", bottleneck: false, auto: null, last_activity: null, count: null, type: "automation",
      metrics: { state: "ok", flows_in: 0, flows_out: (x.links || []).length } }));
    const ghostEdges = changes.flatMap((x, i) => (x.links || []).filter((l) => ids.has(l)).map((l) => ({ id: "ae:a:proc:sim-" + (i + 1) + ">" + l + ":work", from: "a:proc:sim-" + (i + 1), to: l, kind: "work",
      label: "Would work on", automation_pct: 100, health: "ok" })));
    return { before, after, delta, broken_edges: [], touched: ghostNodes.map((n) => n.id), ghost: { nodes: ghostNodes, edges: ghostEdges }, removed_nodes: [], removed_edges: [], changed_edges: [],
      effects: changes.map((x) => 'Adding "' + (x.label || "New automation") + '" saves about ' + (Number(x.hours_week) || 0) + " hours a week" +
        (Number(x.cost_gbp_month) ? " for £" + Math.round(x.cost_gbp_month).toLocaleString("en-GB") + " a month." : ".")),
      basis: "An estimate from the map's own numbers (hours and costs where they are known). Nothing has been changed." }; };
  // ---------------------------------------------------------------- Team (team_work.py)
  // The example's work, people and conversations come from portal-demo-data.js (worked out by team_work.py). Giving work
  // out, due dates, priorities, starting and finishing tasks, new tasks and comments change this in-memory example only,
  // and each person's open work and the overdue list follow; the finished-work figures stay as generated.
  const TEAM_ME = "acc_owner", TEAM_OPEN = ["todo", "in_progress"], TEAM_WORKED = ["created", "edited", "started", "approved", "declined", "sent", "status", "recorded", "closed", "skipped"];
  const teamState = (D) => {
    const today = new Date(now), mon = new Date(today); mon.setUTCHours(12, 0, 0, 0); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
    const weeks = Array.from({ length: 12 }, (_, i) => new Date(mon.getTime() - (11 - i) * 7 * DAY).toISOString().slice(0, 10));   // Mondays again after the shift
    return { items: D.TEAM_ITEMS, comments: D.TEAM_COMMENTS, inbox: D.TEAM_INBOX, settings: { ...D.TEAM_SETTINGS }, people: D.TEAM_PEOPLE, weeks, n: 0 };
  };
  const teamDay = () => new Date(now).toISOString().slice(0, 10);
  const teamFresh = (T, x) => { x.overdue = !!(x.due_on && TEAM_OPEN.includes(x.status) && x.due_on < teamDay()); return x; };
  const teamPublic = (x) => { const { events, body, ...rest } = x; return rest; };
  const teamFind = (T, key) => { const x = T.items.find((y) => y.key === key); if (!x) throw Error("That piece of work was not found. It may have been removed; refresh the list."); return teamFresh(T, x); };
  const teamEvent = (x, action, note) => { x.events = (x.events || []).concat([{ who: TEAM_ME, action, at: new Date().toISOString(), ...(note ? { note } : {}) }]);
    if (TEAM_WORKED.includes(action) && !(x.contributors || []).includes(TEAM_ME)) x.contributors = (x.contributors || []).concat(TEAM_ME); };
  const teamPeopleRows = (D, T) => { const limit = T.settings.wip_limit || 6;
    return D.TEAM_OVERVIEW.people.map((p) => { const mine = T.items.filter((x) => x.assignee === p.id && TEAM_OPEN.includes(x.status)).map((x) => teamFresh(T, x));
      const todo = mine.filter((x) => x.status === "todo").length, ip = mine.length - todo;
      return { ...p, todo, in_progress: ip, load: mine.length, limit, over_limit: mine.length > limit, overdue: mine.filter((x) => x.overdue).length }; }); };
  const teamOverview = (D, T) => { const people = teamPeopleRows(D, T), open = T.items.filter((x) => TEAM_OPEN.includes(x.status)).map((x) => teamFresh(T, x));
    const compact = (x) => ({ key: x.key, kind: x.kind, kind_label: x.kind_label, id: x.id, title: x.title, status: x.status, priority: x.priority, assignee: x.assignee, due_on: x.due_on,
      age_hours: x.age_hours, sla_hours: x.sla_hours, page: x.page, overdue: x.overdue });
    return { ...D.TEAM_OVERVIEW, weeks: T.weeks, people, wip_limit: T.settings.wip_limit, settings: T.settings,
      team: { ...D.TEAM_OVERVIEW.team, open: open.length, todo: open.filter((x) => x.status === "todo").length, in_progress: open.filter((x) => x.status === "in_progress").length,
        unassigned: open.filter((x) => !x.assignee).length, overdue: open.filter((x) => x.overdue).length, sla_breached_open: open.filter((x) => x.sla_breached).length,
        over_limit: people.filter((p) => p.over_limit).length },
      overdue: open.filter((x) => x.overdue).map(compact), sla: open.filter((x) => x.sla_breached).map(compact) }; };
  // Chats (team_chat.py) run in the browser on the records the gateway wrote for the example (portal-demo-chat.js); a
  // message can link to the example's own tasks, customer replies, invoices and jobs
  const chatRecords = (D) => {
    const sv = serviceState();
    return [...D.TEAM_ITEMS.filter((x) => x.kind === "task").map((x) => ({ kind: "task", id: x.id, label: x.title })),
      ...care.drafts.map((x) => ({ kind: "reply", id: x.id, label: x.subject })),
      ...sv.invoices.map((x) => ({ kind: "invoice", id: x.id, label: x.reference + " · " + x.customer })),
      ...sv.jobs.map((x) => ({ kind: "job", id: x.id, label: (x.title || "Job") + " · " + (x.customer_name || "Kirkby Joinery") }))];
  };
  const chatOf = (D) => (D.chat ||= createChat(D.CHAT, D.TEAM_PEOPLE, {
    findRecord: (kind, ident) => chatRecords(D).find((x) => x.kind === kind && x.id === ident) || null,
    records: (words, kind) => chatRecords(D).filter((x) => (!kind || x.kind === kind) && (!words || x.label.toLowerCase().includes(words))) }));
  const teamApi = (D, method, p, q, body) => {
    if (p === "/O/team/chat" || p.startsWith("/O/team/chat/")) { const out = chatOf(D).handle(method, p, q, body); if (out === undefined) throw missed(method, p); return out; }
    const T = (D.team ||= teamState(D)); let m;
    const can = { me: TEAM_ME, can_assign: true, can_manage: true };
    if (method === "GET") {
      if (p === "/O/team/overview") return teamOverview(D, T);
      if (p === "/O/team/settings") return { ...T.settings, can_manage: true };
      if (p === "/O/team/digest") return D.TEAM_DIGEST;
      if (p === "/O/team/inbox") return { items: T.inbox.items, unread: T.inbox.items.filter((x) => !x.read).length, people: T.people, ...can };
      if (p === "/O/team/work") {
        const st = q.get("status") || "", who = q.get("assignee") || "", kind = q.get("kind") || "", pri = q.get("priority") || "", due = q.get("due") || "", text = (q.get("q") || "").toLowerCase();
        const week = new Date(now + 7 * DAY).toISOString().slice(0, 10), person = who === "me" ? TEAM_ME : who;
        const all = T.items.map((x) => teamFresh(T, x)), shown = all.filter((x) => (!st || (st === "open" ? TEAM_OPEN.includes(x.status) : x.status === st)) &&
          (!who || (who === "none" ? !x.assignee : x.assignee === person)) && (!kind || x.kind === kind) && (!pri || x.priority === pri) &&
          (!due || (due === "overdue" ? x.overdue : due === "none" ? !x.due_on : !!x.due_on && x.due_on <= week && TEAM_OPEN.includes(x.status))) && (!text || (x.title + " " + (x.sub || "")).toLowerCase().includes(text)));
        const count = (s) => all.filter((x) => x.status === s).length;
        return { items: shown.slice(0, Number(q.get("limit")) || 300).map(teamPublic), total: shown.length, people: T.people, kinds: { task: "Task", reply: "Reply", automation: "Automation", finding: "Security", approval: "Approval", value: "Ledger" },
          counts: { todo: count("todo"), in_progress: count("in_progress"), done: count("done"), cancelled: count("cancelled"), mine: all.filter((x) => x.assignee === TEAM_ME && TEAM_OPEN.includes(x.status)).length,
            unassigned: all.filter((x) => !x.assignee && TEAM_OPEN.includes(x.status)).length }, settings: T.settings, ...can };
      }
      if ((m = /^\/O\/team\/work\/(\w+)\/(.+)$/.exec(p))) { const key = m[1] + ":" + decodeURIComponent(m[2]), x = teamFind(T, key);
        return { item: { ...x, comments: (T.comments[key] || []).length }, comments: T.comments[key] || [], people: T.people, me: TEAM_ME, can_assign: true }; }
      if ((m = /^\/O\/team\/people\/(\w+)$/.exec(p))) { const v = D.TEAM_PERSON[m[1]]; if (!v) throw Error("That person is not an active member of this workspace.");
        const row = teamPeopleRows(D, T).find((r) => r.id === m[1]);
        // what this person did lately, newest first, from the work items' own histories (team.js draws it as a timeline)
        const WORDS = { created: "Created", assigned: "Gave out", started: "Started", closed: "Finished", done: "Finished", edited: "Changed", approved: "Approved", declined: "Declined",
          sent: "Sent", recorded: "Recorded", commented: "Commented on", skipped: "Skipped", status: "Moved" };
        const timeline = T.items.flatMap((x) => (x.events || []).filter((e) => e.who === m[1] && WORDS[e.action]).map((e) => ({ at: e.at, kind: x.kind, key: x.key,
          text: WORDS[e.action] + " " + x.title + (e.action === "assigned" && e.note ? " to " + e.note : "") }))).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
        return { ...v, person: { ...v.person, ...row }, current: T.items.filter((x) => x.assignee === m[1] && TEAM_OPEN.includes(x.status)).map((x) => teamPublic(teamFresh(T, x))), timeline }; }
      throw missed(method, p);
    }
    if (p === "/O/team/assign") {
      const who = body.assignee || null, person = who ? T.people.find((x) => x.id === who) : null;
      if (who && (!person || !person.assignable)) throw Error(person ? "Read-only members can comment, but work cannot be given to them." : "Work can only be given to an active member of this workspace.");
      const assigned = [], skipped = [];
      (body.keys || []).forEach((key) => { const x = T.items.find((y) => y.key === key); if (!x) { skipped.push({ key, reason: "That piece of work was not found." }); return; }
        if ((x.assignee || null) === who) { skipped.push({ key, reason: who ? "Already given to them." : "Already given to nobody." }); return; }
        x.assignee = who; x.version = (x.version || 0) + 1; teamEvent(x, "assigned", person ? person.name : "nobody"); assigned.push(key); });
      return { assigned, skipped, assignee: who };
    }
    if (p === "/O/team/tasks") {
      const ident = "tsk_demo" + ++T.n, stamp = new Date().toISOString(), who = body.assignee || null;
      const x = { key: "task:" + ident, kind: "task", id: ident, kind_label: "Task", page: "team_work", title: String(body.title || "").trim(), sub: String(body.body || "").slice(0, 140), body: String(body.body || ""),
        status: "todo", source_status: "todo", resolution: "", priority: body.priority || "none", assignee: who, due_on: body.due_on || null, estimate_hours: body.estimate_hours ?? null,
        created_at: stamp, started_at: null, done_at: null, done_by: null, created_by: TEAM_ME, updated_at: stamp, hours_saved: 0, value_gbp: 0, expected_hours_month: 0, version: 1,
        events: [{ who: TEAM_ME, action: "created", at: stamp }], contributors: [TEAM_ME], age_hours: 0, cycle_hours: null, overdue: false, sla_hours: null, sla_breached: false, comments: 0 };
      if (x.title.length < 3) throw Error("Give the task a title of at least three letters.");
      if (who) teamEvent(x, "assigned", (T.people.find((y) => y.id === who) || {}).name || "");
      T.items.unshift(x); return { item: x };
    }
    if ((m = /^\/O\/team\/work\/(\w+)\/(.+)\/comments$/.exec(p))) {
      const key = m[1] + ":" + decodeURIComponent(m[2]), x = teamFind(T, key), text = String(body.text || "").trim();
      if (!text) throw Error("Write something first.");
      const told = (body.mentions || []).filter((id) => id !== TEAM_ME && T.people.some((y) => y.id === id));
      const c = { id: "c_demo" + ++T.n, who: TEAM_ME, text, mentions: told, at: new Date().toISOString() };
      T.comments[key] = (T.comments[key] || []).concat([c]); x.comments = T.comments[key].length; teamEvent(x, "commented");
      return { comment: c, mentioned: told };
    }
    if ((m = /^\/O\/team\/work\/(\w+)\/(.+)$/.exec(p)) && method === "PATCH") {
      const key = m[1] + ":" + decodeURIComponent(m[2]), x = teamFind(T, key), task = x.kind === "task", stamp = new Date().toISOString();
      if ((body.version ?? -1) !== (x.version || 0)) throw Error("Someone else changed this. Refresh to see the latest.");
      if (!task && (body.status || body.title)) throw Error("Change this on its own page, where its checks and approvals apply.");
      ["priority", "due_on", "estimate_hours", "title", "body", "hours_saved"].forEach((k) => { if (k in body && (k !== "priority" || body[k])) x[k] = body[k]; });
      if ("title" in body || "body" in body || "priority" in body || "due_on" in body) teamEvent(x, "edited");
      const target = body.status || (body.started && x.status === "todo" ? "in_progress" : "");
      if (target && target !== x.status) {
        if (target === "in_progress") { x.started_at = x.started_at || stamp; teamEvent(x, "started"); }
        if (target === "done") { x.done_at = stamp; x.done_by = x.assignee || TEAM_ME; teamEvent(x, "closed", "done"); }
        if (target === "todo") { x.done_at = null; x.done_by = null; teamEvent(x, "reopened"); }
        x.status = target;
      }
      x.version = (x.version || 0) + 1; x.updated_at = stamp;
      return { item: teamFresh(T, x), comments: T.comments[key] || [], version: x.version };
    }
    if (p === "/O/team/settings") { Object.assign(T.settings, { wip_limit: body.wip_limit, hide_comparisons: !!body.hide_comparisons, digest: !!body.digest, sla_hours: { ...T.settings.sla_hours, ...(body.sla_hours || {}) }, version: (T.settings.version || 0) + 1 }); return T.settings; }
    if (p === "/O/team/inbox/read") { T.inbox.items.forEach((x) => { if (body.everything || (body.ids || []).includes(x.id)) x.read = true; }); return { items: T.inbox.items, unread: T.inbox.items.filter((x) => !x.read).length }; }
    throw missed(method, p);
  };

  // ---- Batch 1 demo: Work board, Opportunities, Customers advanced (example data, clearly labelled)
  const WK_DEMO = () => {
    const people = [
      { id: "acc_owner", name: "Sarah Vale", role: "Owner" },
      { id: "acc_ops1", name: "Dev Patel", role: "Ops" },
      { id: "acc_ops2", name: "Dan Okafor", role: "Sales" },
      { id: "acc_fin", name: "Mark Ellis", role: "Finance" },
    ];
    const WK_BRIEFS = {
      "security:high": { brief: "Schedule within your Security SLA this week; fix, then prove it.", advice: "High severity compounds: schedule before medium/low batch work.",
        steps: ["Confirm severity and asset on Security → Fixes.", "Follow the remediation guide; assign to the suggested role if you lack access.", "Verify (scan, dig, or login test) and attach a one-line note of what changed.", "Mark Fixed or Accept risk with a written reason if you consciously defer."],
        outcome: "High finding closed or consciously accepted with an owner and review date.", risk: "Left open for weeks, high findings become the next incident's entry point.",
        role_why: "Security leads; Ops or Engineer executes when the control sits in their system.", hours_rationale: "~4h is a typical implement + verify cycle for a single high control." },
      "security:critical": { brief: "Treat as incident-grade: contain, fix, verify, then re-scan.", advice: "Critical findings are the shortest path to a real incident.",
        steps: ["Open Security → Fixes and confirm the affected asset.", "Apply the listed remediation exactly.", "Record evidence and set Being fixed while it propagates.", "Re-run the check; mark Fixed only when the scan passes."],
        outcome: "Critical exposure closed.", risk: "Unpatched critical issues are a usual root cause in small-business breaches.",
        role_why: "Security (or Owner if sole trader) owns containment.", hours_rationale: "~8h covers investigation, change, wait, and re-scan." },
      "security:dmarc": { brief: "Publish DMARC at p=none, monitor 2 weeks, then quarantine → reject.", advice: "Start monitoring-only so legitimate mail is not blocked.",
        steps: ["Add TXT on `_dmarc.YOURDOMAIN`: `v=DMARC1; p=none; rua=mailto:dmarc@YOURDOMAIN; fo=1`.", "Confirm SPF and DKIM pass for every real sender.", "Monitor aggregate reports ~2 weeks; fix unexpected sources.", "Tighten to p=quarantine then p=reject once clean.", "Re-scan on Security → Email security."],
        outcome: "Spoofed mail rejected; real mail deliverability improves.", risk: "Without DMARC anyone can send as you@yourdomain.",
        role_why: "Security owns policy; Ops applies DNS.", hours_rationale: "~2h setup + light monitoring over 2 weeks." },
      "customer:chase": { brief: "Run a polite chase sequence tied to the overdue amount and age.", advice: "Use their figures — never invent balances. Drafts only until you approve send.",
        steps: ["Confirm overdue amount, invoice numbers, and days late on the profile.", "Day 0 draft: short reminder with amount, invoice refs, pay link.", "Day 7 draft: firmer tone, offer a call.", "Day 14: escalate to Owner/Finance.", "Log each touch; mark Work done when paid or plan agreed."],
        outcome: "Cash collected or a written payment plan.", risk: "Silence trains late pay.",
        role_why: "Finance owns the chase; Owner joins on day-14 escalation.", hours_rationale: "~2h across the sequence (drafts + logging)." },
      "customer:complaint": { brief: "Personal reply from the complaint thread; do not auto-send.", advice: "Complaints need a named person.",
        steps: ["Read the full thread; summarise the ask in one sentence.", "Draft apology + concrete fix + timeline.", "Offer make-good only if deliverable; Owner approves material cost.", "Send after review; follow up on the promised date."],
        outcome: "Customer feels heard; issue resolved.", risk: "Ignored complaints become public reviews.",
        role_why: "Support owns tone; Owner for goodwill spend.", hours_rationale: "~4h includes investigation and one reply cycle." },
      "automation:failed": { brief: "Fix the failing step, dry-run, then re-enable live carefully.", advice: "Do not flip live until a dry-run passes.",
        steps: ["Open the failed run; note the exact step and error.", "Fix credentials, mapping, or logic.", "Dry-run against a safe fixture.", "Re-run live once; watch the next scheduled execution."],
        outcome: "Automation green with known root cause.", risk: "Repeated failures → people bypass the bot.",
        role_why: "Engineer for connectors; Ops for config.", hours_rationale: "~4h typical for diagnose + fix + dry-run." },
      "opportunity:map": { brief: "Install or design the automation that removes the hand work on the Map.", advice: "Map hours still done by hand are your clearest savings — labelled estimates.",
        steps: ["Open Map peek; note hours/week and systems.", "Prefer a library automation if one matches.", "Dry-run; assign an owner.", "After live, confirm Ledger records hours when measured."],
        outcome: "Hand-off removed or sharply reduced.", risk: "Hours stay manual.",
        role_why: "Ops owns Map opportunities.", hours_rationale: "~4h for install/design pass." },
      "approval:pending": { brief: "Decide: approve, decline, or ask for more detail.", advice: "Approvals block downstream Work.",
        steps: ["Open the approval peek; read summary and risk.", "Approve, decline with reason, or request specifics.", "Confirm the blocked Work item unblocks."],
        outcome: "Downstream work continues or stops with a clear reason.", risk: "Invisible queues.",
        role_why: "Owner (or named approver).", hours_rationale: "~1.5–2h including reading evidence." },
      "team:overdue": { brief: "Re-prioritise or reassign the overdue team item today.", advice: "Overdue work compounds.",
        steps: ["Confirm due date and blocker on Team.", "Finish a thin slice, slip with reason, or reassign.", "Update status on Work."],
        outcome: "Item moving again with an honest date.", risk: "Culture of missed dates.",
        role_why: "Ops balances load.", hours_rationale: "~1.5–4h." },
      "data_quality:gap": { brief: "Fix the missing email, duplicate, or incomplete record.", advice: "Bad data breaks Care drafts and automations.",
        steps: ["Open the flagged record.", "Merge duplicates carefully; fill required fields.", "Re-run the check that raised the gap."],
        outcome: "Clean record; automations can run.", risk: "Wrong-person emails and failed automations.",
        role_why: "Ops cleans.", hours_rationale: "~1.5–4h." },
    };
    const mk = (i, source, kind, title, detail, role, impact, urgency, effort, status="open") => {
      const effort_factor = Math.round((1.2 - (effort - 1) * 0.15) * 100) / 100;
      const score = Math.round(impact * urgency * effort_factor * 100) / 100;
      const tip = (title || "").toLowerCase();
      let key = source + ":" + kind;
      if (source === "security" && tip.includes("dmarc")) key = "security:dmarc";
      const rich = WK_BRIEFS[key] || WK_BRIEFS[source + ":" + kind] || {
        brief: "Open the linked surface and act with the evidence on the record.",
        advice: "Use the score to prioritise; hours are labelled estimates (example data).",
        steps: ["Open the linked page and read the evidence.", "Complete the concrete next action for this kind of issue.", "Update status on Work when done."],
        outcome: "Issue progressed or closed with a note.", risk: "Left open, it continues to cost time or raise risk.",
        role_why: role + " is the default owner for this source.", hours_rationale: "Estimate from difficulty band (example data).",
      };
      return {
        id: "wi_demo_" + i, source, kind, ref: "demo-" + i, title, detail, link: source === "security" ? "security_center" : source === "customer" ? "customers" : source === "opportunity" ? "business_map" : source === "approval" ? "attention" : source === "team" ? "team_work" : "automations",
        role, brief: rich.brief, advice: rich.advice, steps: rich.steps, outcome: rich.outcome, risk_if_ignored: rich.risk, role_why: rich.role_why, hours_rationale: rich.hours_rationale,
        difficulty: { rating: effort, label: effort <= 2 ? "Easy" : effort === 3 ? "Medium" : "Hard", hours_estimate: [0,0.5,1.5,4,8,16][effort], hours_note: rich.hours_rationale },
        score: { impact, urgency, effort, effort_factor, score, formula: `impact(${impact}) × urgency(${urgency}) × effort_factor(${effort_factor})` },
        status, assignee: i % 3 === 0 ? people[i % people.length].id : null, due_on: null, blocked_reason: null, depends_on: [], labels: [], note: "",
        evidence: { example: true }, updated_at: new Date().toISOString(),
        why_rank: `impact(${impact}) × urgency(${urgency}) × effort_factor(${effort_factor}) = ${score}. ${rich.advice}`,
      };
    };
    const items = [
      mk(1,"customer","chase","Chase £2,400 overdue: Northgate Freight","Oldest invoice 18 days late","Finance",5,5,2),
      mk(2,"security","high","DMARC not enforced on hv-logistics.example","Email spoofing risk on the customer domain","Security",4,4,3),
      mk(3,"automation","failed","Failed automation run: delivery exception","Last run reconciliation_required","Engineer",4,5,3,"in_progress"),
      mk(4,"opportunity","map","Automate proof-of-delivery filing","Map shows ~6h/week hand work","Ops",4,3,3),
      mk(5,"approval","pending","Approval waiting: discount above limit","Sales discount needs owner decision","Owner",4,4,2),
      mk(6,"customer","check_in","Check in: Clearline going quiet","Usual gap exceeded; health low","Sales",4,4,2),
      mk(7,"team","overdue","Overdue team work: weekend reply SLA","Past due on Team board","Ops",3,4,2),
      mk(8,"improvement","attention","Switch on review requests","Safe draft-only improvement","Ops",4,3,2),
      mk(9,"data_quality","gap","Missing emails on 4 paying customers","Blocks care automations","Ops",3,3,2),
      mk(10,"security","medium","TLS certificate renews in 21 days","Plan renewal before expiry","Security",3,3,2),
    ];
    return { items, people, me: "acc_owner", roles: ["Owner","Ops","Engineer","Sales","Finance","Support","Security"], sources: ["security","customer","automation","opportunity","approval","team","improvement","data_quality"],
      counts: { open: 8, in_progress: 1, blocked: 0, done: 0, open_total: 9, mine: 2 },
      by_source: { customer: 2, security: 2, automation: 1, opportunity: 1, approval: 1, team: 1, improvement: 1, data_quality: 1 },
      can_edit: true, glossary: { score: "impact × urgency × effort_factor", difficulty: "1–5 with labelled hours estimate", today: "Capacity-aware daily plan" },
      note: "Example company / demo data — not a live tenant." };
  };
  const customersAdvancedView = () => {
    const base = customerView();
    const rows = (base.customers || []).map((c, i) => {
      const areas = {
        value: Math.min(100, Math.round(Number(c.revenue_12m || 0) / 80)),
        engagement: Math.max(5, 100 - Number(c.days_since_last || 30)),
        health: c.segment === "At risk" ? 32 : c.p_alive != null ? Math.round(c.p_alive * 100) : 70,
        growth: Math.min(100, Number(c.invoices_12m || 0) * 8),
        support_load: Math.min(100, (c.complaints || []).length * 30 + Number(c.emails_90d || 0)),
        payment: c.median_days_late == null ? 50 : c.median_days_late <= 0 ? 95 : c.median_days_late <= 7 ? 70 : 30,
      };
      const score = Math.round(0.25*areas.value + 0.15*areas.engagement + 0.25*areas.health + 0.15*areas.growth - 0.05*areas.support_load + 0.25*areas.payment);
      const labels = [];
      if (c.segment === "Top customer" || (areas.value >= 80 && areas.health >= 70)) labels.push("Champion");
      if (c.segment === "At risk" || areas.health < 40) labels.push("At risk");
      if (areas.engagement < 25) labels.push("Dormant");
      if (c.segment === "New") labels.push("New");
      if (areas.payment >= 85) labels.push("Reliable payer");
      return { ...c, areas, composite: { score, areas, formula: "0.25·value + 0.15·engagement + 0.25·health + 0.15·growth − 0.05·support_load + 0.25·payment", weights: {} },
        labels, auto_labels: labels, custom_labels: [], advice: [c.next_step && c.next_step.kind !== "none" ? c.next_step.title : "Keep monitoring"],
        nba: (c.next_step && c.next_step.title) || "Keep monitoring",
        journey: { stages: [
          { stage: "won", at: c.first_invoice, days_until_next: 14 },
          { stage: "onboarding", at: c.first_invoice, days_until_next: 30 },
          { stage: "active", at: c.last_invoice, days_until_next: null },
        ].filter(s => s.at), note: "Example journey from invoice dates (demo data)." } };
    }).sort((a,b) => b.composite.score - a.composite.score);
    const cohorts = {};
    rows.forEach(r => r.labels.forEach(l => cohorts[l] = (cohorts[l]||0)+1));
    return { customers: rows, total: rows.length, cohorts, glossary: { composite: "Weighted blend of six areas from example invoices/emails.", writeup: "Drafts only — never sent." }, note: "Example company / demo data." };
  };
  const oppsDemo = () => {
    const items = [
      { id: "op_demo_1", source: "map", title: "Automate POD filing", detail: "Drivers still file photos by hand.", stage: "propose", score: 78, score_reasons: ["6 hours/week hand work (Map).","Has an owner."], size_gbp: 420, size_is_estimate: true, weighted_value: 189, owner: "Dev Patel", next_step: "Install library automation", stalled: false, link: "business_map", hours_saved_week: 6 },
      { id: "op_demo_2", source: "library", title: "Weekly CRM hygiene", detail: "Stale deals without close dates.", stage: "qualify", score: 64, score_reasons: ["Ready-made library.","No owner yet."], size_gbp: 180, size_is_estimate: true, weighted_value: 36, owner: null, next_step: "Install from library", stalled: false, link: "automations" },
      { id: "op_demo_3", source: "customer", title: "Retain: Clearline", detail: "At-risk from buying pattern.", stage: "negotiate", score: 71, score_reasons: ["Aging 21 days.","Next step set."], size_gbp: 900, size_is_estimate: true, weighted_value: 630, owner: "Dan Okafor", next_step: "Personal check-in", stalled: true, age_days: 21, link: "customers", customer_id: "CUS-2210" },
      { id: "op_demo_4", source: "customer", title: "Open quote: Ashworth Foods", detail: "Quote Q-1842 £3,200", stage: "propose", score: 69, score_reasons: ["Real open quote amount.","Has an owner."], size_gbp: 3200, size_is_estimate: false, weighted_value: 1440, owner: "Dan Okafor", next_step: "Follow up quote", stalled: false, link: "customers" },
      { id: "op_demo_5", source: "map", title: "Supplier bill capture", detail: "Month-end keying still manual.", stage: "qualify", score: 58, score_reasons: ["3 hours/week hand work."], size_gbp: 220, size_is_estimate: true, weighted_value: 44, owner: null, next_step: "Design automation", stalled: false, link: "business_map", hours_saved_week: 3 },
    ];
    const stages = ["qualify","propose","negotiate","won","lost"];
    const weights = { qualify: 0.2, propose: 0.45, negotiate: 0.7, won: 1, lost: 0 };
    const pipeline = stages.map(s => {
      const xs = items.filter(i => i.stage === s);
      return { stage: s, count: xs.length, value_gbp: xs.reduce((a,x)=>a+(x.size_gbp||0),0), weighted_gbp: xs.reduce((a,x)=>a+(x.weighted_value||0),0), weight: weights[s], items: xs };
    });
    return { items, total: items.length, pipeline, forecast: { weighted_pipeline_gbp: items.filter(i=>["qualify","propose","negotiate"].includes(i.stage)).reduce((a,x)=>a+x.weighted_value,0), open_count: 5, stalled_count: 1, won_30d: 0, lost_30d: 0, note: "Example data. Weighted by stage probabilities. Size labelled estimate unless from a real quote." }, stages, can_edit: true, glossary: { score: "0–100 from hours, £, aging, owner, next step", stalled: "14+ days without movement" } };
  };

  // Run history for Automations (the workflow diagram's "Runs at this step" and the 30-day bars): the approved design has
  // run for a month, about 3 a working day, with a few waiting for a person and one stopped at the Xero step; drafts have
  // not run. Deterministic, so every visitor sees the same example.
  const automationRuns = (D) => {
    const rr = rng(7719), out = {};
    for (const x of D.designs || []) {
      if (x.status !== "approved") { out[x.id] = { stage: "not_live", words: "Runs start once a person approves it and it is created in Routines." }; continue; }
      const steps = ((x.workflow || {}).stages || []).flatMap((g) => g.steps || []).filter((st) => !st.branch_only);
      const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(now - (29 - i) * DAY), wk = d.getUTCDay() % 6 !== 0;
        const n = wk ? 2 + Math.floor(rr() * 3) : 0; const failed = i === 17 ? 1 : 0, waiting = i >= 28 && wk ? 1 : 0;
        return { day: d.toISOString().slice(0, 10), succeeded: Math.max(0, n - failed - waiting), failed, waiting, running: 0 }; });
      const c = days.reduce((a, d) => ({ succeeded: a.succeeded + d.succeeded, failed: a.failed + d.failed, waiting: a.waiting + d.waiting }), { succeeded: 0, failed: 0, waiting: 0 });
      const finished = c.succeeded + c.failed, total = finished + c.waiting, mins = Number((x.estimate || {}).minutes_saved_per_run) || 8;
      // example step timings (16C's workflow canvas shows the average time at each step): a step a person approves takes
      // tens of minutes, an automatic step seconds. Labelled as example data with the rest of this read.
      const waitsForPerson = (st) => ["approval", "human", "review"].includes(String(st.type || ""));
      const secs = steps.map((st) => (waitsForPerson(st) ? 1500 + Math.round(rr() * 2400) : 3 + Math.round(rr() * 37)));
      const per = {}; steps.forEach((st, i) => { const last = i === steps.length - 1;
        per[String(st.name).slice(0, 200)] = { passed: total - (i >= 1 ? c.failed : 0) - (last ? c.waiting : 0), waiting: last ? c.waiting : 0, failed: i === 1 ? c.failed : 0, running: 0,
          avg_seconds: secs[i], example: true }; });
      const took = secs.reduce((a, s) => a + s, 0) * 1000, failedAfter = (secs[0] + (secs[1] || 0)) * 1000;
      const doneAt = (ago) => new Date(now - ago + took).toISOString();
      const names = steps.map((st) => st.name);
      out[x.id] = { stage: "live", total, finished, counts: { ...c, running: 0 }, success_rate: finished ? Math.round((100 * c.succeeded) / finished) : null,
        last_run_at: new Date(now - 2.4 * 3600000).toISOString(), minutes_per_run_estimate: mins, hours_saved_estimate: Math.round((c.succeeded * mins) / 6) / 10, days, steps: per,
        runs: [{ id: "RUN-4412", state: "waiting", step: names[names.length - 1], received_at: new Date(now - 2.4 * 3600000).toISOString() },
          { id: "RUN-4409", state: "succeeded", received_at: new Date(now - 26 * 3600000).toISOString(), completed_at: doneAt(26 * 3600000) },
          { id: "RUN-4401", state: "succeeded", received_at: new Date(now - 50 * 3600000).toISOString(), completed_at: doneAt(50 * 3600000) },
          { id: "RUN-4377", state: "failed", step: names[1], missing: ["supplier VAT number"], received_at: new Date(now - 12 * DAY).toISOString(), completed_at: new Date(now - 12 * DAY + failedAfter).toISOString() }] };
    }
    return { available: true, how: "Counted from the runs of the routine made from each approved design. Example data.", designs: out };
  };
  const extraApi = async (method, p, q, body) => {
    const D = await fixtures(); let m;
    if (p === "/O/work" || p.startsWith("/O/work/")) {
      const board = WK_DEMO();
      if (p === "/O/work/today") {
        const items = board.items.filter(x => x.status === "open" || x.status === "in_progress").slice(0, 6).map(x => ({ ...x, plan_hours: x.difficulty.hours_estimate, plan_reason: "Fits role capacity (example data)." }));
        return { date: new Date().toISOString().slice(0,10), items, deferred: board.items.slice(6), capacity: { by_person: [], by_role: [] }, note: "Example capacity plan — labelled estimates." };
      }
      if (p === "/O/work/workload") {
        const by = {};
        board.items.forEach(it => { const k = it.assignee || ""; (by[k]=by[k]||[]).push(it); });
        return { people: Object.entries(by).map(([id, its]) => ({ person: board.people.find(p=>p.id===id) || { id: id||null, name: id?"Someone":"Unassigned", role: null }, open: its.length, hours_estimate: its.reduce((a,x)=>a+x.difficulty.hours_estimate,0), by_status: {}, top: its.slice(0,3).map(x=>({id:x.id,title:x.title,score:x.score.score})) })), note: "Example data." };
      }
      if (p === "/O/work/charts") {
        const points = Array.from({length:14}, (_,i) => ({ date: new Date(Date.now()-(13-i)*86400000).toISOString().slice(0,10), done: (i%3), opened: (i%4) }));
        return { burndown: { days:14, points, note: "Example burndown." }, throughput: { weeks:6, points: Array.from({length:6},(_,i)=>({ week_starting: new Date(Date.now()-(6-i)*7*86400000).toISOString().slice(0,10), done: 2+i%3 })) } };
      }
      if (method === "GET" && p.startsWith("/O/work/wi_")) {
        const it = board.items.find(x => p.endsWith(x.id));
        if (!it) throw Error("That work item was not found.");
        return it;
      }
      if (method === "PATCH" || method === "POST") return { ok: true, example: true };
      // filters
      let items = board.items.slice();
      const st = q.get("status") || "", src = q.get("source") || "", role = q.get("role") || "", text = (q.get("q")||"").toLowerCase();
      if (st) items = items.filter(x => x.status === st);
      if (src) items = items.filter(x => x.source === src);
      if (role) items = items.filter(x => x.role === role);
      if (text) items = items.filter(x => (x.title+" "+x.detail).toLowerCase().includes(text));
      return { ...board, items, total: items.length };
    }

    if (p === "/O/insights/advanced" || p.startsWith("/O/insights/")) {
      if (p.startsWith("/O/insights/drill/")) {
        return { metric: p.split("/").pop(), items: [{ id: "ex1", title: "Example record behind this metric", kind: "example", example: true }], example: true,
          means: { label: "Drill-down", what: "Records behind the metric.", why: "So every chart has a receipt.", good: "Rows match the chart.", next: "Open the linked page." } };
      }
      return {
        version: 1, days: Number(q.get("days") || 30), example: true,
        dictionary: { version: 2, rule: "No invented customer ROI. Measured vs estimated always labelled.", metrics: [] },
        kpis: [
          { key: "needs_you", label: "Needs you", value: 7, example: true, means: { label: "Needs you", what: "Open items needing a person.", why: "Queue health.", good: "Falling or stable.", next: "Open Work / Inbox." } },
          { key: "hours_saved", label: "Hours saved", unit: "hours", value: 12.5, example: true, means: { label: "Hours saved", what: "Minutes removed.", why: "Time back to the team.", good: "Rising measured hours.", next: "Open Work for blockers." } },
          { key: "value_gbp", label: "Value recorded", unit: "GBP", value: 480, example: true, means: { label: "Value", what: "Ledger outcomes.", why: "Proof of value.", good: "Measured growing.", next: "Open Ledger." } },
          { key: "reply_time", label: "Median reply (min)", value: 42, example: true, means: { label: "Reply time", what: "Median minutes to reply.", why: "Care quality.", good: "Under your target.", next: "Clear Care drafts." } },
          { key: "funnel_lead_paid", label: "Lead → paid %", value: 18, example: true, means: { label: "Funnel", what: "Lead to paid.", why: "Growth health.", good: "Steady conversion.", next: "Clear stalled leads." } },
          { key: "retention_cohort", label: "Retention M3 %", value: 74, example: true, means: { label: "Retention", what: "Cohort retained.", why: "Stickiness.", good: "Stable M3.", next: "Check at-risk." } },
          { key: "automation_hours", label: "Automation hours", value: 12.5, example: true, means: { label: "Automation hours", what: "Hours from designs.", why: "Leverage.", good: "Rising.", next: "Open Automations." } },
          { key: "automation_cost", label: "Cost avoided £", value: 438, example: true, means: { label: "Cost avoided", what: "Hours × hourly cost.", why: "Estimated until Ledger measures.", good: "Tracked honestly.", next: "Set hourly cost." } },
          { key: "revenue_segment", label: "Paid revenue £", value: 2400, example: true, means: { label: "Revenue", what: "Paid invoices.", why: "Cash.", good: "Up or stable.", next: "Drill segment." } },
          { key: "forecast_revenue", label: "Forecast £", value: 2592, example: true, means: { label: "Forecast", what: "Projection.", why: "Planning only — not a promise.", good: "Band understood.", next: "Compare to actuals." } },
          { key: "security_score", label: "Security posture", value: 72, example: true, means: { label: "Posture", what: "Security score.", why: "Risk trend.", good: "Rising toward 85+.", next: "Open Fixes." } },
          { key: "cycle_time", label: "Cycle days", value: 3.2, example: true, means: { label: "Cycle time", what: "Created→done median.", why: "Team speed.", good: "Falling carefully.", next: "Open Team." } },
          { key: "open_work", label: "Open Work", value: 11, example: true, means: { label: "Open Work", what: "Open board items.", why: "Load.", good: "Within capacity.", next: "Balance on Team." } },
          { key: "overdue_invoices", label: "Overdue invoices", value: 3, example: true, means: { label: "Overdue", what: "Past-due invoices.", why: "Cash risk.", good: "Falling.", next: "Chase on Work." } },
          { key: "active_customers", label: "Active customers", value: 14, example: true, means: { label: "Customers", what: "Active profiles.", why: "Base size.", good: "Steady growth.", next: "Open Customers." } },
          { key: "nps_proxy", label: "NPS proxy", value: 48, example: true, means: { label: "NPS proxy", what: "Example satisfaction proxy.", why: "Relationship signal.", good: "Rising.", next: "Check complaints." } },
          { key: "anomaly_delta", label: "Movers", value: 2, example: true, means: { label: "Movers", what: "Callouts this period.", why: "What changed.", good: "Explained.", next: "What changed tab." } },
          { key: "goal_progress", label: "Goals %", value: 62, example: true, means: { label: "Goals", what: "Average goal progress.", why: "Focus.", good: "On track.", next: "Goals tab." } },
        ],
        trends: Object.fromEntries(["revenue","revenue_segment","hours_saved","value_gbp","reply_time","security_score","needs_you","cycle_time","open_work","active_customers","overdue_invoices","goal_progress","nps_proxy","funnel_lead_paid","retention_cohort","automation_hours","automation_cost","forecast_revenue","anomaly_delta"].map((k) => [k, { label: k, points: Array.from({length:14},(_,i)=>({date:new Date(Date.now()-(13-i)*864e5).toISOString().slice(0,10),value:10+((i*3+k.length)%9)})), example: true }])),
        comparison: { current_label: "Last 30 days", prior_label: "Prior 30 days", metrics: [
          { key: "needs_you", label: "Needs you", current: 7, prior: 9, example: true },
          { key: "hours_saved", label: "Hours saved", current: 12.5, prior: 11.2, example: true },
          { key: "value_gbp", label: "Value recorded", current: 480, prior: 410, example: true },
          { key: "reply_time", label: "Reply min", current: 42, prior: 50, example: true },
          { key: "funnel_lead_paid", label: "Lead→paid", current: 18, prior: 16, example: true },
          { key: "retention_cohort", label: "Retention", current: 74, prior: 71, example: true },
          { key: "automation_hours", label: "Auto hours", current: 12.5, prior: 14.9, example: true },
          { key: "automation_cost", label: "Cost avoided", current: 438, prior: 520, example: true },
          { key: "revenue_segment", label: "Revenue", current: 2400, prior: 2100, example: true },
          { key: "forecast_revenue", label: "Forecast", current: 2592, prior: 2400, example: true },
          { key: "security_score", label: "Posture", current: 72, prior: 75, example: true },
          { key: "cycle_time", label: "Cycle days", current: 3.2, prior: 3.6, example: true },
          { key: "open_work", label: "Open Work", current: 11, prior: 13, example: true },
          { key: "overdue_invoices", label: "Overdue", current: 3, prior: 2, example: true },
          { key: "active_customers", label: "Customers", current: 14, prior: 13, example: true },
          { key: "nps_proxy", label: "NPS proxy", current: 48, prior: 45, example: true },
          { key: "anomaly_delta", label: "Movers", current: 2, prior: 1, example: true },
          { key: "goal_progress", label: "Goals %", current: 62, prior: 55, example: true },
        ] },
        funnel: { stages: [{ key:"lead",label:"Leads",count:12 },{ key:"qualified",label:"Qualified",count:7 },{ key:"paid",label:"Paid",count:3 },{ key:"retained",label:"Retained 90d",count:2 }], example: true, note: "Example funnel shape when history is thin." },
        cohorts: { rows: [{ cohort:"2026-01", m0:100, m1:82, m2:74, m3:68 },{ cohort:"2026-02", m0:100, m1:80, m2:71, m3:null },{ cohort:"2026-03", m0:100, m1:85, m2:null, m3:null }], example: true, note: "Example cohort %.", means: { label: "Cohort", what: "Retention.", why: "Stickiness.", good: "Stable M3.", next: "Open at-risk." } },
        forecast: { label: "Revenue forecast (projection)", points: Array.from({length:7},(_,i)=>{ const mid=22+i*0.8; return { date:new Date(Date.now()+(i+1)*864e5).toISOString().slice(0,10), mid, low:mid*0.85, high:mid*1.15, projection:true }; }), note: "PROJECTION with confidence band — not a promise.", example: true, means: { label: "Forecast", what: "Projection.", why: "Planning.", good: "Band clear.", next: "Compare actuals." } },
        anomalies: [
          { id: "an1", metric: "reply_time", title: "Time to reply rose vs prior week", delta: "+18%", why: "Fewer approved drafts cleared Thu–Fri (example).", link: "customer_operations", example: true },
          { id: "an2", metric: "automation_hours", title: "Automation hours saved dipped", delta: "−2.4h", why: "One design paused; hours from designs/Ledger only.", link: "automations", example: true },
          { id: "an3", metric: "security_score", title: "Posture dipped after new open Fixes", delta: "−3", why: "Two high Fixes opened this week.", link: "security", example: true },
          { id: "an4", metric: "overdue_invoices", title: "Overdue invoice count ticked up", delta: "+1", why: "One retain customer passed terms.", link: "work", example: true },
          { id: "an5", metric: "cycle_time", title: "Work cycle time improved", delta: "−0.4d", why: "More items assigned with due dates.", link: "work", example: true },
        ],
        goals: [
          { id: "g1", metric: "hours_saved", label: "Hours saved this month", target: 40, current: 12.5, unit: "hours", progress: 31, example: true },
          { id: "g2", metric: "value_gbp", label: "Measured ledger value", target: 2000, current: 480, unit: "GBP", progress: 24, example: true },
          { id: "g3", metric: "security_score", label: "Security posture", target: 85, current: 72, unit: "score", progress: 85, example: true },
          { id: "g4", metric: "reply_time", label: "Median reply under 60 min", target: 60, current: 42, unit: "minutes", progress: 100, example: true },
          { id: "g5", metric: "active_customers", label: "Active customers", target: 25, current: 14, unit: "customers", progress: 56, example: true },
        ],
        revenue: { by_segment: [{ key:"retain",label:"Retain",gbp:1320,example:true},{key:"expand",label:"Expand",gbp:720,example:true},{key:"new",label:"New",gbp:360,example:true}],
          by_service: [{key:"care",label:"Customers",gbp:960,example:true},{key:"ops",label:"Automations",gbp:840,example:true},{key:"security",label:"Security",gbp:600,example:true}],
          means: { label: "Revenue", what: "Paid invoices.", why: "Cash by segment.", good: "Diversified.", next: "Drill." }, note: "Example mix." },
        automation: { hours_saved: 12.5, cost_avoided_gbp: 438, hourly_cost_gbp: 35, example: true, note: "Cost avoided = hours × £35 example default." },
      };
    }
    if (p === "/O/activity/unified") {
      const base = await (async () => {
        // reuse activity items if available via fixtures path
        return [];
      })();
      const items = Array.from({ length: 24 }, (_, i) => ({
        id: "act_" + i, at: new Date(Date.now() - i * 3600e3 * 5).toISOString(),
        action: ["care.reply","automation.run","security.check","team.task","billing.paid","work.patch"][i % 6],
        what: ["Reply sent to Northgate","Automation completed: POD filing","Security check passed","Team task done","Payment recorded","Work status updated"][i % 6],
        actor: i % 3 === 0 ? "Sarah Vale" : "Xevrion (automatic)",
        area: ["Customers","Automations","Security","Team","Money","Work"][i % 6],
        details: i % 4 === 0 ? { hours_saved: 0.5 } : (i % 5 === 0 ? { value_gbp: 120 } : {}),
        impact: { tags: i % 4 === 0 ? [{ kind:"time_saved", label:"0.5h saved", value:0.5 }] : (i % 5 === 0 ? [{ kind:"gbp", label:"£120", value:120 }] : []) },
      }));
      return { items, total: items.length, digest: { today_count: 4, week_count: 24, week_hours_saved: 2.5, week_gbp: 360, today_summary: "4 events today", week_summary: "24 events this week · ~2.5h tagged · £360 tagged", note: "Example digest — impact tags only from records." }, group: "day", views: [{id:"today",label:"Today",days:1}], areas: ["Customers","Automations","Security","Team","Money","Work"], note: "Example unified timeline." };
    }
    if (p === "/O/ledger/advanced") {
      return {
        version: 1, example: true,
        entries: [
          { id:"ex1", title:"Invoice chase automation", category:"time_saved", category_label:"Time saved", hours:3.5, gbp:122.5, confidence:{level:"estimated",label:"Estimated"}, proof:{type:"design_estimate",ref:"auto:invoice-chase",note:"estimate"}, at:new Date().toISOString().slice(0,10), example:true },
          { id:"ex2", title:"Overdue invoice recovered", category:"revenue_protected", category_label:"Revenue protected", hours:0, gbp:840, confidence:{level:"measured",label:"Measured"}, proof:{type:"invoice",ref:"INV-1042",note:"Paid after chase"}, at:new Date(Date.now()-3*864e5).toISOString().slice(0,10), example:true },
          { id:"ex3", title:"Security finding closed", category:"risk_reduced", category_label:"Risk reduced", hours:0, gbp:0, confidence:{level:"measured",label:"Measured"}, proof:{type:"finding",ref:"SEC-12",note:"Closed"}, at:new Date(Date.now()-5*864e5).toISOString().slice(0,10), example:true },
        ],
        totals: { measured_gbp:840, measured_hours:0, estimated_gbp:122.5, estimated_hours:3.5, count:3 },
        by_category: [{key:"time_saved",label:"Time saved",hours:0,gbp:0,n:1},{key:"revenue_protected",label:"Revenue protected",hours:0,gbp:840,n:1},{key:"risk_reduced",label:"Risk reduced",hours:0,gbp:0,n:1},{key:"revenue_won",label:"Revenue won",hours:0,gbp:0,n:0},{key:"cost_avoided",label:"Cost avoided",hours:0,gbp:0,n:0}],
        waterfall: [{key:"start",label:"Start",gbp:0},{key:"revenue_protected",label:"Revenue protected",gbp:840,running:840},{key:"end",label:"Measured total",gbp:840}],
        statement: { month: new Date().toISOString().slice(0,7), entries:3, measured_gbp:840, estimated_gbp:122.5, measured_hours:0, note:"Example statement." },
        reconciliation: { available:false, matched:0, unmatched_ledger:0, unmatched_payments:0, note:"No Monzo/payments in example.", example:true },
        categories: [], rule: "Measured vs estimated always labelled. No invented ROI.",
      };
    }

    if (p === "/O/opportunities" || p.startsWith("/O/opportunities/")) {
      const data = oppsDemo();
      if (method === "PATCH") return { ok: true, example: true };
      let items = data.items.slice();
      if (q.get("stalled") === "1") items = items.filter(x => x.stalled);
      if (q.get("stage")) items = items.filter(x => x.stage === q.get("stage"));
      return { ...data, items, total: items.length };
    }
    if (p.startsWith("/O/team/")) return teamApi(D, method, p, q, body);
    const design_ = (ident) => { const x = D.designs.find((y) => y.id === ident); if (!x) throw Error("That design was not found."); return x; };
    if (p === "/O/automations/runs" && method === "GET") return automationRuns(D);
    if (method === "GET") {
      // every service's state, key number, sparkline and needs-you count (service_overview.py), for the command centre and
      // every service page's header
      if (p === "/O/services") return D.SERVICES;
      // the evidence registry (research.py): every published statistic, the value model and the breach-cost baseline
      if (p === "/O/research") return D.RESEARCH;
      // the board as automation_designer.opportunities_answer gives it (the map's hand work first, then the library), with
      // each row's state following the visitor's own installs and approvals in this example
      if (p === "/O/automations/opportunities") {
        const of = (tid) => { const ds = D.designs.filter((x) => tid && x.template_id === tid); const run = ds.find((x) => x.status === "approved"), dr = ds.find((x) => x.status === "draft");
          return run ? ["running", run.id] : dr ? ["draft", dr.id] : ["new", ""]; };
        const WORDS = { running: "Running", draft: "Draft ready to check", new: "Not started" };
        const items = D.AUTO_OPPORTUNITIES.items.map((x) => { const [st, did] = of(x.template_id); const status = st === "new" && x.status !== "new" && !x.template_id ? x.status : st;
          return { ...x, status, status_words: x.status === status ? x.status_words : WORDS[status] || x.status_words, design_id: did || x.design_id, installed: status !== "new", quick_win: x.quick_win && status === "new" }; });
        const open = items.filter((i) => i.status !== "running");
        return { ...D.AUTO_OPPORTUNITIES, items, totals: { ...D.AUTO_OPPORTUNITIES.totals, running: items.filter((i) => i.status === "running").length,
          drafts: items.filter((i) => i.status === "draft").length, quick_wins: items.filter((i) => i.quick_win).length, top_count: Math.min(5, open.length) } }; }
      if (p === "/O/security/overview") return D.SECURITY;
      if (p === "/O/security/history") { const days = Math.max(1, Math.min(Number(q.get("days")) || 90, 365)), from = new Date(now - (days - 1) * DAY).toISOString().slice(0, 10);
        return { days, items: D.SECURITY_HISTORY.filter((x) => x.id >= from) }; }
      if (p === "/O/security/controls") return D.SECURITY_CONTROLS;
      // Security's eight views (security/ package): the summary, monitoring, identity, incidents, policies and the evidence pack
      if (p === "/O/security/summary") return D.SECURITY_SUMMARY;
      if (p === "/O/security/frameworks") return { items: D.SECURITY_SUMMARY.frameworks, coverage: D.SECURITY_SUMMARY.coverage };
      if (p === "/O/security/monitoring") return D.SECURITY_MONITORING;
      if (p === "/O/security/identity") return { ...D.SECURITY_IDENTITY, policy: { require_mfa: securityPolicy.require_mfa, session_hours: securityPolicy.session_hours, version: securityPolicy.version } };
      if (p === "/O/security/incidents") return D.SECURITY_INCIDENTS;
      if (p === "/O/security/incidents/report") { const r = D.INCIDENT_REPORTS[q.get("id") || "all"]; if (!r) throw Error("That incident was not found."); return r; }
      if ((m = /^\/O\/security\/incidents\/(inc_\w+)$/.exec(p))) { const x = D.INCIDENT_DETAILS[m[1]]; if (!x) throw Error("That incident was not found."); return x; }
      if (p === "/O/security/policies") return D.SECURITY_POLICIES;
      if ((m = /^\/O\/security\/policies\/(\w+)$/.exec(p))) { const x = D.POLICY_DETAILS[m[1]]; if (!x) throw Error("That policy is not one of the four kinds."); return x; }
      if (p === "/O/security/evidence-pack") return D.EVIDENCE;
      if (p === "/O/business-map") return D.BUSINESS_MAP;
      if (p === "/O/business-map/changes") return { items: D.MAP_CHANGES.slice(0, Math.max(1, Math.min(Number(q.get("limit")) || 100, 300))) };
      if (p === "/O/business-map/analysis") return D.MAP_ANALYSIS;
      if (p === "/O/business-map/snapshots") return D.MAP_SNAPSHOTS;
      if (p === "/O/business-map/snapshots/compare") { const pair = D.MAP_COMPARE[(q.get("a") || "") + "|" + (q.get("b") || "")];
        if (!pair) still("two weeks are compared with the latest week, or with the week straight after"); return pair; }
      if (p === "/O/automations/options") return D.AUTO_OPTIONS;
      if (p === "/O/automations/library") { const fn = q.get("function") || "", risk = q.get("risk") || "", sys = q.get("system") || "";
        const words = ((q.get("q") || "").toLowerCase().match(/[a-z0-9]+/g) || []).map(stem);
        let items = D.AUTO_LIBRARY.items.filter((t) => (!fn || t.function === fn) && (!risk || t.risk === risk) && (!sys || t.systems.some((s) => s.id === sys)));
        if (words.length) items = items.map((t, i) => { const hay = (t.name + " " + t.does + " " + t.for_whom + " " + t.keywords.join(" ")).toLowerCase();
          return [words.filter((w) => hay.includes(w)).length, i, t]; }).filter((x) => x[0]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
        return { ...D.AUTO_LIBRARY, items }; }
      if (p.startsWith("/O/automations/library/")) { const t = D.AUTO_TEMPLATES[decodeURIComponent(p.slice(23))]; if (!t) throw Error("That automation is not in the library."); return t; }
      if (p === "/O/automations/designs") return { items: D.designs.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(({ workflow, brief, versions, ...x }) => x),
        max: D.AUTO_DESIGNS.max, counts: Object.fromEntries(Object.keys(D.AUTO_DESIGNS.counts).map((s) => [s, D.designs.filter((x) => x.status === s).length])) };
      if ((m = /^\/O\/automations\/designs\/(\w+)\/versions\/(\d+)$/.exec(p))) { const x = design_(m[1]), v = x.versions.find((y) => y.n === Number(m[2]));
        if (!v) throw Error("That version was not found.");
        return { n: v.n, workflow: x.workflow, brief: x.brief, problems: x.problems, notes: x.notes, source: v.source, change: v.change, by: v.by, at: v.at }; }
      if ((m = /^\/O\/automations\/designs\/(\w+)$/.exec(p))) return design_(m[1]);
      throw missed(method, p);
    }
    if (p === "/O/security/sign-out-everyone") refuse("signing everyone out");
    if ((m = /^\/O\/security\/findings\/([\w.%]+)$/.exec(p))) { const key = decodeURIComponent(m[1]), g = D.SECURITY_SUMMARY.findings.find((x) => x.key === key);
      const person = body.owner ? D.SECURITY_SUMMARY.members.find((x) => x.id === body.owner) : null;
      if (g) Object.assign(g, { status: body.status, note: body.note || "", status_by: "Sarah Vale", status_at: new Date().toISOString(), version: g.version + 1 },
        body.owner !== undefined ? { owner: body.owner || "", owner_name: person ? person.name : "" } : {});
      const f = D.SECURITY.findings.find((x) => x.key === key) || (g && { ...g, version: g.version - 1 });
      if (!f) throw Error("That finding is not part of the security checks.");
      if (!D.SECURITY.findings.includes(f)) return { state: { id: g.key, status: g.status, note: g.note, by_name: g.status_by, at: g.status_at, version: g.version, owner: g.owner, owner_name: g.owner_name }, overview: D.SECURITY };
      Object.assign(f, { status: body.status, note: body.note || "", status_by: "Sarah Vale", status_at: new Date().toISOString(), version: f.version + 1 });
      return { state: { id: f.key, status: f.status, note: f.note, by_name: f.status_by, at: f.status_at, version: f.version }, overview: D.SECURITY }; }
    if (p === "/O/security/controls") still("your answers stay as they are, so the score does not move");
    if (p === "/O/security/monitoring/run") still("no real domain is checked. Monitoring reads public DNS, your home page, six admin addresses, the registry's record and lookalike domains by DNS, and changes nothing");
    if (p === "/O/security/monitoring/settings") still("monitoring stays as it is for the example domain");
    if (p === "/O/security/exposure/check") still("breach checks are not set up for the example. In your own portal they use Have I Been Pwned once Xevrion has a key");
    if (p === "/O/security/exposure/password-range") still("no password is checked. In your own portal only the first 5 characters of its SHA-1 fingerprint leave your browser");
    if (p === "/O/security/incidents") still("new incidents are not added to the example. Log one and the playbook's steps are added for you");
    if ((m = /^\/O\/security\/incidents\/(inc_\w+)\/steps\/(\d+)$/.exec(p))) { const x = D.INCIDENT_DETAILS[m[1]], st = x && x.steps.find((y) => y.n === Number(m[2])); if (!st) throw Error("That step is not part of this incident.");
      Object.assign(st, { done: !!body.done, by_name: body.done ? "Sarah Vale" : "", at: body.done ? new Date().toISOString() : null }); x.steps_done = x.steps.filter((y) => y.done).length; x.version += 1;
      x.timeline.push({ at: new Date().toISOString(), by_name: "Sarah Vale", text: (body.done ? "Done: " : "Not done after all: ") + st.title });
      const row = D.SECURITY_INCIDENTS.items.find((y) => y.id === x.id); if (row) Object.assign(row, { steps_done: x.steps_done, version: x.version, steps: x.steps }); return x; }
    if ((m = /^\/O\/security\/incidents\/(inc_\w+)$/.exec(p)) && method === "PATCH") { const x = D.INCIDENT_DETAILS[m[1]]; if (!x) throw Error("That incident was not found.");
      const person = body.owner ? D.SECURITY_INCIDENTS.members.find((y) => y.id === body.owner) : null;
      if (body.status) Object.assign(x, { status: body.status, status_words: body.status.charAt(0).toUpperCase() + body.status.slice(1) });
      if (body.owner !== undefined && body.owner !== null) Object.assign(x, { owner: body.owner, owner_name: person ? person.name : "" });
      if (body.personal_data !== undefined) x.personal_data = body.personal_data;
      x.version += 1; x.timeline.push({ at: new Date().toISOString(), by_name: "Sarah Vale", text: "Changed it" });
      const row = D.SECURITY_INCIDENTS.items.find((y) => y.id === x.id); if (row) Object.assign(row, { status: x.status, owner: x.owner, owner_name: x.owner_name, personal_data: x.personal_data, version: x.version });
      D.SECURITY_INCIDENTS.counts = Object.fromEntries(["open", "contained", "resolved", "closed"].map((k) => [k, D.SECURITY_INCIDENTS.items.filter((y) => y.status === k).length])); return x; }
    if (/^\/O\/security\/incidents\/inc_\w+\/notes$/.test(p)) still("notes are not added to the example");
    if ((m = /^\/O\/security\/policies\/(\w+)\/acknowledge$/.exec(p))) { const x = D.POLICY_DETAILS[m[1]], row = D.SECURITY_POLICIES.items.find((y) => y.kind === m[1]);
      if (!x || !x.published) throw Error("This policy is not published yet.");
      if (!x.my_ack) { x.my_ack = true; x.acks.done += 1; x.acks.missing = x.acks.missing.filter((n) => n !== "Sarah Vale"); if (row) { row.my_ack = true; row.acks = x.acks; } }
      return x; }
    if (/^\/O\/security\/policies\//.test(p)) still("policies stay as they are. In your own portal Xevrion AI (or the standard wording) writes the draft, and you read, change and publish it");
    if (p === "/O/security/scan") still("no real domain is checked. A check reads your domain's public email records and your website's home page once, and changes nothing");
    if (p === "/O/business-map/simulate") return mapWhatIf(D, body.changes || []);
    if (p.startsWith("/O/business-map/")) still("the map stays as it is, and nothing is added to the change log");
    if ((m = /^\/O\/automations\/library\/(\w+)\/install$/.exec(p))) { const t = D.AUTO_TEMPLATES[m[1]]; if (!t) throw Error("That automation is not in the library.");
      return designFrom(D, t, { approval_policy: t.policy }, ""); }
    if (p === "/O/automations/designs") { const t = libraryMatch(D, body);
      if (!t) still("designs come from the library, and nothing in it is close to that description. Try words such as refund, expenses, new starter or enquiry");
      return designFrom(D, t, body, "In this presentation the design comes from the library, matched to your words. In your own portal Xevrion AI designs it from your description and your choices."); }
    if ((m = /^\/O\/automations\/designs\/(\w+)\/(approve|reject|archive)$/.exec(p))) { const x = design_(m[1]), stamp = new Date().toISOString(), why = String(body.reason || "").trim();
      if (body.version != null && body.version !== x.version) throw Error("This design changed. Refresh and try again.");
      if (m[2] !== "archive" && x.status !== "draft") throw Error("Only a draft design can be " + (m[2] === "approve" ? "approved." : "rejected."));
      if (m[2] === "approve" && x.problems.length) throw Error(x.problems[0]);
      if (m[2] === "reject" && why.length < 3) throw Error("Say briefly why (at least three characters).");
      if (m[2] === "archive" && x.status === "archived") throw Error("This design is already archived.");
      Object.assign(x, m[2] === "approve" ? { status: "approved", approved_by: "acc_owner", approved_at: stamp, installed_ref: "design-" + x.id } : { status: m[2] === "reject" ? "rejected" : "archived", reason: why },
        { approvable: false, version: x.version + 1, updated_at: stamp });
      const { versions, ...out } = x; return out; }
    if ((m = /^\/O\/automations\/designs\/(\w+)\/simulate$/.exec(p))) { design_(m[1]); const runs = D.AUTO_DRY_RUNS[m[1]];
      if (!runs) still("a dry run works on the three example designs");
      return body.approve === false ? runs.decline : runs.approve; }
    if (/^\/O\/automations\/designs\/\w+\/(revise|restore)$/.test(p)) still("a design is not changed. In your own portal every change is a new version you can go back to");
    throw missed(method, p);
  };

  // ---------------------------------------------------------------- Preferences and Controls (portal_prefs.py)
  let prefs = { version: 0 }, pause = { paused: false, reason: "", paused_at: null };
  const automations = () => [["care", care.settings, "Customer replies", "Writes a reply to each new customer email", "customer_operations", care.drafts, "auto_send"],
    ["records", null, "Client record requests", "Asks clients for the records their work needs", "business_operations", [], "auto_send"],
    ["reviews", reviews.settings, "Review requests", "Asks paying customers for an honest review", "customer_operations", reviews.requests, "auto_send"],
    ["clients", { enabled: true }, "Customer profiles", "Builds a picture of each customer from your accounts", "customers", null, null],
    ["improvements", improvements.settings, "Growth advisor", "Finds the next thing to automate or grow", "improvements", null, "auto_apply"]];
  const controlsView = () => ({ ...pause, items: automations().map(([key, cfg, name, what, page, queue, flag]) => ({ key, name, what, page, set_up: !!cfg || key === "improvements", enabled: key === "improvements" || !!(cfg && cfg.enabled),
    auto: flag ? !!(cfg && cfg[flag]) : null, can_auto: !!flag, last_run: cfg ? new Date(now - (key.length % 5 + 1) * 3600e3).toISOString() : null, last_error: null,
    waiting: queue ? queue.filter((x) => ["ready", "needs_you", "unconfirmed"].includes(x.status)).length : 0 })) });
  // Dashboard (portal_analytics.py): the example's numbers over 7, 30 or 90 days, steady with a gentle rise
  const wave = (i, a, b) => Math.max(0, Math.round(a + b * Math.sin(i * 0.9) + (i % 5 === 0 ? 1 : 0)));
  const analyticsDemo = (days) => { const weekly = days > 31, n = weekly ? Math.ceil(days / 7) : days, step = weekly ? 7 : 1, k = weekly ? 6 : 1, labels = [];
    for (let i = n - 1; i >= 0; i--) labels.push(new Date(now - i * step * DAY).toISOString().slice(0, 10));
    const ser = (a, b) => labels.map((_, i) => wave(i + n, a * k, b * k) + Math.round((i / n) * a * k * 0.4));
    const by_job = { customer_operations: ser(4, 2), business_operations: ser(2, 1) };
    const total = Object.values(by_job).flat().reduce((a, x) => a + x, 0), tot = labels.map((_, i) => by_job.customer_operations[i] + by_job.business_operations[i]);
    const autoS = tot.map((t, i) => Math.round(t * (0.36 + 0.04 * (i % 4)))), personS = tot.map((t, i) => t - autoS[i]), auto = autoS.reduce((a, x) => a + x, 0);
    const before = (a, b) => labels.map((_, i) => wave(i, a * k, b * k) + Math.round((i / n) * a * k * 0.2)), prevS = before(4, 2).map((x, i) => Math.round((x + before(2, 1)[i]) * 0.86));
    const prevTotal = prevS.reduce((a, x) => a + x, 0), hoursOf = (x) => Math.round((x * 4) / 6) / 10;
    const value = labels.map((_, i) => (i % (weekly ? 1 : 5) === 3 ? 380 + (i * 53) % 420 : 0)), prevValue = labels.map((_, i) => (i % (weekly ? 2 : 6) === 1 ? 300 + (i * 41) % 380 : 0));
    const sum = (xs) => xs.reduce((a, x) => a + x, 0), money = (x) => x.toFixed(2);
    return { days, weekly, labels, start: new Date(now - days * DAY).toISOString(), end: new Date(now).toISOString(),
      work: { by_job, auto: autoS, person: personS, hours: tot.map(hoursOf), total, auto_total: auto, hours_total: hoursOf(total), prev_total: prevTotal, prev_hours: hoursOf(prevTotal), prev_series: prevS, prev_hours_series: prevS.map(hoursOf) },
      money: { series: { value }, totals: { value: money(sum(value)), prev_value: money(sum(prevValue)) }, prev_series: { value: prevValue } },
      care: { buckets: [{ label: "Under 5 minutes", count: 14 }, { label: "5 to 60 minutes", count: 19 }, { label: "1 to 4 hours", count: 7 }, { label: "4 to 24 hours", count: 3 }, { label: "Over a day", count: 1 }], median_minutes: 22, answered: 44, waiting: care.drafts.filter((x) => ["ready", "needs_you"].includes(x.status)).length },
      customers: { segments: [{ segment: "Top customer", count: 1, revenue: 61400 }, { segment: "Regular", count: 3, revenue: 38200 }, { segment: "New", count: 1, revenue: 4100 }, { segment: "At risk", count: 1, revenue: 8780 }, { segment: "Lapsed", count: 0, revenue: 0 }],
        total: 6, at_risk: customers.filter((c) => c.segment === "At risk").map((c) => ({ name: c.name, revenue_12m: c.revenue_12m })) },
      usage: (() => { const day = new Date(now).getDate(), used = Math.round(390 * day); return { used, allowance: 40000, day, days_in_month: 31, projected: day >= 4 ? Math.round((used / (day - 0.5)) * 31) : null }; })() }; };
  // App directory (connections_hub.py)
  const APP_CATALOG = [["gmail", "Gmail", "Email and calendar", "available", "Reads new customer emails and sends the replies you approve from your own address."], ["microsoft", "Microsoft 365", "Email and calendar", "available", "Outlook mail through your own Entra app: the replies you approve, from your address."], ["imap", "Other email (IMAP/SMTP)", "Email and calendar", "available", "Any mailbox that speaks IMAP and SMTP."], ["google_calendar", "Google Calendar", "Email and calendar", "roadmap", "Bookings in your calendar; free slots offered in replies."], ["outlook_calendar", "Outlook Calendar", "Email and calendar", "roadmap", "The same for Microsoft 365 calendars."], ["calendly", "Calendly", "Email and calendar", "roadmap", "Bookings linked to the customer record."], ["xero", "Xero", "Accounting and payments", "available", "Invoices, customers and what they are worth, for your customer profiles."], ["quickbooks", "QuickBooks Online", "Accounting and payments", "available", "The same from QuickBooks."], ["sage", "Sage Accounting", "Accounting and payments", "available", "The same from Sage (read only)."], ["freeagent", "FreeAgent", "Accounting and payments", "roadmap", "Invoices and bills for sole traders and small companies."], ["stripe", "Stripe", "Accounting and payments", "roadmap", "Payments, failed charges and churn signals."], ["gocardless", "GoCardless", "Accounting and payments", "roadmap", "Direct Debit payments and failures."], ["dext", "Dext", "Accounting and payments", "roadmap", "Receipts and bills collected for client records."], ["open_banking", "Open Banking (UK banks)", "Accounting and payments", "roadmap", "Payments matched to invoices from your bank feed."], ["hubspot", "HubSpot", "CRM and sales", "available", "Contacts, companies and deals kept in step with what Xevrion finds and sends."], ["salesforce", "Salesforce", "CRM and sales", "available", "Leads, accounts and opportunities."], ["pipedrive", "Pipedrive", "CRM and sales", "roadmap", "Deals and follow-ups."], ["zoho_crm", "Zoho CRM", "CRM and sales", "roadmap", "Leads and deals."], ["dynamics", "Microsoft Dynamics 365", "CRM and sales", "roadmap", "Accounts and opportunities."], ["attio", "Attio", "CRM and sales", "roadmap", "Records and lists."], ["zendesk", "Zendesk", "Support and messaging", "available", "Tickets read and answered with your approved answers."], ["intercom", "Intercom", "Support and messaging", "available", "Conversations and customer data."], ["slack", "Slack", "Support and messaging", "available", "What needs a person, posted to your channel."], ["teams", "Microsoft Teams", "Support and messaging", "roadmap", "The same for Teams."], ["whatsapp", "WhatsApp Business", "Support and messaging", "roadmap", "Customer messages answered and routed like email."], ["sms", "SMS (Twilio)", "Support and messaging", "roadmap", "Texts in and out, with opt-out handled."], ["freshdesk", "Freshdesk", "Support and messaging", "roadmap", "Tickets and answers."], ["helpscout", "Help Scout", "Support and messaging", "roadmap", "Conversations and answers."], ["webchat", "Website chat", "Support and messaging", "roadmap", "A chat box on your site answered from your facts, handed to a person when needed."], ["google_business", "Google Business Profile", "Reviews and email marketing", "awaiting_platform", "Replies to reviews, for you to approve."], ["klaviyo", "Klaviyo", "Reviews and email marketing", "roadmap", "Email flows for online shops."], ["shopify", "Shopify", "Commerce and websites", "roadmap", "Orders, customers and abandoned carts."], ["woocommerce", "WooCommerce", "Commerce and websites", "roadmap", "The same for WooCommerce."], ["squarespace", "Squarespace", "Commerce and websites", "roadmap", "Form entries and orders."], ["wix", "Wix", "Commerce and websites", "roadmap", "Form entries and orders."], ["website", "Your website forms", "Commerce and websites", "available", "Enquiries from your site answered like emails."], ["google_drive", "Google Drive", "Files and documents", "roadmap", "Client records filed and found."], ["onedrive", "OneDrive and SharePoint", "Files and documents", "roadmap", "The same for Microsoft 365."], ["dropbox", "Dropbox", "Files and documents", "roadmap", "Files for client records."], ["notion", "Notion", "Files and documents", "available", "Pages and databases read as your approved knowledge."], ["segment", "Segment", "Data and analytics", "available", "Events about your customers, for health scores."], ["ga4", "Google Analytics 4", "Data and analytics", "roadmap", "Visits and conversions beside the work done."], ["search_console", "Google Search Console", "Data and analytics", "roadmap", "Search queries and pages, for articles and local SEO."], ["bigquery", "BigQuery", "Data and analytics", "roadmap", "Your Xevrion data synced to your warehouse."], ["snowflake", "Snowflake", "Data and analytics", "roadmap", "The same for Snowflake."], ["powerbi", "Power BI", "Data and analytics", "roadmap", "Xevrion figures in your reports."], ["github", "GitHub", "Engineering and code", "roadmap", "Repositories, issues and pull requests: summaries, release notes and code review with Xevrion AI."], ["gitlab", "GitLab", "Engineering and code", "roadmap", "The same for GitLab."], ["jira", "Jira", "Engineering and code", "roadmap", "Issues created from customer requests."], ["linear", "Linear", "Engineering and code", "roadmap", "The same for Linear."], ["sentry", "Sentry", "Engineering and code", "roadmap", "Errors linked to the customers they affect."], ["cloudflare", "Cloudflare", "Cloud, hosting and domains", "roadmap", "Domains, DNS and email records checked and set up."], ["docker", "Docker and your servers", "Cloud, hosting and domains", "roadmap", "Your apps deployed and watched on servers you connect."], ["aws", "Amazon Web Services", "Cloud, hosting and domains", "roadmap", "Costs and health of what you run."], ["azure", "Microsoft Azure", "Cloud, hosting and domains", "roadmap", "The same for Azure."], ["gcp", "Google Cloud", "Cloud, hosting and domains", "roadmap", "The same for Google Cloud."], ["vercel", "Vercel", "Cloud, hosting and domains", "roadmap", "Sites deployed from your repositories."], ["entra", "Microsoft Entra ID", "Security and identity", "roadmap", "Sign-ins, risky users and app grants, watched by Secure Xevrion."], ["google_admin", "Google Workspace admin", "Security and identity", "roadmap", "The same for Google Workspace."], ["okta", "Okta", "Security and identity", "roadmap", "Single sign-on for your team."], ["defender", "Microsoft Defender", "Security and identity", "roadmap", "Alerts explained in plain words, with what to do."], ["1password", "1Password", "Security and identity", "roadmap", "Shared logins kept out of email."], ["brighthr", "BrightHR", "People and payroll", "roadmap", "Holidays and absence beside the work."], ["breathe", "Breathe", "People and payroll", "roadmap", "The same for Breathe."], ["iris", "IRIS", "Industry tools", "roadmap", "Practice management for accountants: clients and their work."], ["taxcalc", "TaxCalc", "Industry tools", "roadmap", "The same for TaxCalc."], ["reapit", "Reapit", "Industry tools", "roadmap", "Property: landlords, tenants and viewings."], ["alto", "Alto", "Industry tools", "roadmap", "The same for Alto."], ["bullhorn", "Bullhorn", "Industry tools", "roadmap", "Recruitment: candidates, clients and placements."]];
  const appRequests = new Set(["github", "cloudflare"]);
  const directoryView = () => { const cats = [...new Set(APP_CATALOG.map((x) => x[2]))], words = { available: "Connect now", import: "Import reports", early_access: "Early access", awaiting_platform: "Waiting for platform approval", roadmap: "Request it" };
    const counts = {}; APP_CATALOG.forEach((x) => (counts[x[3]] = (counts[x[3]] || 0) + 1));
    return { categories: cats, counts, items: APP_CATALOG.map(([key, name, category, status, does]) => ({ key, name, category, status, status_words: words[status], does, requested: appRequests.has(key), requests: { github: 7, cloudflare: 5, whatsapp: 9, shopify: 6, stripe: 4, twilio_voice: 11 }[key] || 0 })) }; };
  // Triage Intelligence, Loops and Code Intelligence (triage_intel.py, loops.py, code_intel.py)
  const ago_ = (h) => new Date(now - h * 3600e3).toISOString();
  const triItems = [
    { id: "t1", channel: "email", from: "Lena Weiss <lena@weisspartners.co.uk>", subject: "Damaged delivery: pallet 4471", category: "complaint", priority: "P1", score: 85, reasons: ["a person should answer", "a complaint", "waiting 5 hours"], customer: { returning: true, earlier: 3, colleagues: 1 }, duplicate_of: null, suggested_owner: "owner", why_owner: "rule “Complaints and sensitive messages”", sla_minutes: 120, received_at: ago_(5), overdue: true },
    { id: "t2", channel: "email", from: "Owen Hale <owen@haleinteriors.co.uk>", subject: "Invoice INV-2189 still due?", category: "question", priority: "P2", score: 45, reasons: ["about money", "waiting 6 hours"], customer: { returning: true, earlier: 2, colleagues: 0 }, duplicate_of: null, suggested_owner: "queue:accounts", why_owner: "rule “Money questions”", sla_minutes: 240, received_at: ago_(6), overdue: false },
    { id: "t3", channel: "email", from: "owen@haleinteriors.co.uk", subject: "Re: Invoice INV-2189 still due?", category: "question", priority: "P2", score: 53, reasons: ["about money", "marked urgent"], customer: { returning: true, earlier: 3, colleagues: 0 }, duplicate_of: { id: "t2", subject: "Invoice INV-2189 still due?", received_at: ago_(6) }, suggested_owner: "queue:accounts", why_owner: "rule “Money questions”", sla_minutes: 240, received_at: ago_(1), overdue: false },
    { id: "t4", channel: "email", from: "Sam Okafor <sam@okaforbuilders.co.uk>", subject: "Quote for 12 pallets to Glasgow", category: "sales", priority: "P2", score: 38, reasons: ["new business"], customer: { returning: false, earlier: 0, colleagues: 0 }, duplicate_of: null, suggested_owner: "queue:sales", why_owner: "rule “New business”", sla_minutes: 60, received_at: ago_(0.5), overdue: false },
    { id: "t5", channel: "email", from: "Grace Hill <grace@hillflorists.co.uk>", subject: "Do you deliver on Saturdays?", category: "question", priority: "P3", score: 10, reasons: [], customer: { returning: true, earlier: 5, colleagues: 2 }, duplicate_of: null, suggested_owner: "member:acc_jo", why_owner: "usually handled by this person (14 replies like it)", sla_minutes: 240, received_at: ago_(2), overdue: false }];
  const triAssigned = {};
  const triText = { t1: "Our pallet 4471 arrived this morning with the shrink wrap torn and two boxes crushed. This is the second time this month. I would like someone to call me today about a credit.", t2: "Hi, your statement shows INV-2189 as open but I think we paid it on Friday by bank transfer. Could you check and let me know?", t3: "Following up on INV-2189, we need this sorted today please as our accounts close tomorrow.", t4: "Could you quote for 12 pallets from Leeds to Glasgow, collection next Tuesday? Standard size, about 400kg each.", t5: "Do you deliver on Saturdays? We have a shop opening on the 18th." };
  const triView = () => { const items = triItems.map((i) => ({ ...i, excerpt: triText[i.id] || "", has_draft: i.id !== "t1", assigned: triAssigned[i.id] || null, due_at: new Date(Date.parse(i.received_at) + i.sla_minutes * 60e3).toISOString() }));
    const taken = Object.values(triAssigned);
    return { items, people: { acc_jo: "Grace Lin", acc_sam: "Dan Okafor", acc_ria: "Zoe Clarke" }, rules_version: 0, rules_custom: false,
      rules: [{ name: "Complaints and sensitive messages", to: "owner", sla_minutes: 120, when: { category: ["complaint"] } }, { name: "New business", to: "queue:sales", sla_minutes: 60, when: { category: ["sales"] } }, { name: "Money questions", to: "queue:accounts", sla_minutes: 240, when: { words: ["invoice", "payment", "refund", "overdue"] } }],
      channels: [{ key: "email", label: "Email", status: "live", open: items.length }, { key: "website", label: "Website form", status: "planned", open: 0 }, { key: "social", label: "Social messages", status: "planned", open: 0 }],
      queues: {}, summary: { open: items.length, p1: items.filter((i) => i.priority === "P1").length, overdue: items.filter((i) => i.overdue).length, duplicates: 1, returning: 4, acceptance_percent: taken.length ? Math.round(100 * taken.filter((t) => t.accepted_suggestion).length / taken.length) : 86 } }; };
  const loopRows = [
    { id: "lp1", version: 2, name: "Monday customer brief", instruction: "Sum up last week's customer emails: what people asked about most, any complaints still open and anyone still waiting for a reply.", schedule: { freq: "weekly", day: 0, date: 1, time: "08:00" }, sources: ["customers"], enabled: true, when: "Every Monday at 08:00", next_run_at: new Date(now + 3 * 864e5).toISOString() },
    { id: "lp2", version: 1, name: "Daily customer care summary", instruction: "Summarise yesterday's customer emails: what was asked most, what is still waiting and anything a person should answer.", schedule: { freq: "weekdays", day: 0, date: 1, time: "08:30" }, sources: ["inbox", "customers"], enabled: true, when: "Weekdays at 08:30", next_run_at: new Date(now + 864e5).toISOString() },
    { id: "lp3", version: 1, name: "Weekly code changes", instruction: "Summarise what changed in our code this week, in plain English: features, fixes, risky changes and anything without tests.", schedule: { freq: "weekly", day: 4, date: 1, time: "17:00" }, sources: ["code"], enabled: true, when: "Every Friday at 17:00", next_run_at: new Date(now + 2 * 864e5).toISOString() }];
  const loopRuns = [
    { id: "lr1", loop_id: "lp1", loop: "Monday customer brief", at: ago_(52), mode: "ai", note: "", sources: [{ id: "F1" }, { id: "F2" }, { id: "F3" }], report: { title: "38 customer emails last week, 2 complaints open", summary: "Most questions were about Saturday deliveries. Two complaints are still open and one customer has waited more than a day for a reply.", points: ["Saturday deliveries: 11 questions, all answered from your facts.", "Pennine Plastics: damaged pallet complaint, open 3 days, a person is replying.", "Moss Retail: asked to move a collection, waiting 26 hours."], next: [{ text: "Open Customers", open: "customer_operations" }] } },
    { id: "lr2", loop_id: "lp2", loop: "Daily customer care summary", at: ago_(4), mode: "ai", note: "", sources: [{ id: "F1" }, { id: "F2" }], report: { title: "11 customer emails, two need a person", summary: "Xevrion wrote replies to 11 emails yesterday. Nine are sent; two need a person: a damaged pallet and a price for four pallets to Leeds.", points: ["Asked most: Saturday deliveries (3 emails).", "Waiting for a person: Dave at Pennine Plant about a damaged pallet, and Tom at Beck Builders about a price."], next: [{ text: "Open Customers", open: "customer_operations" }] } },
    { id: "lr3", loop_id: "lp3", loop: "Weekly code changes", at: ago_(24 * 5), mode: "ai", note: "", sources: [{ id: "F1" }, { id: "F2" }, { id: "F3" }, { id: "F4" }], report: { title: "11 changes, one without tests", summary: "The team shipped online booking for pallet collections and fixed VAT rounding on invoices. The new booking form has no automated tests yet.", points: ["Booking form for collections (5 commits by Dev One).", "VAT rounding fixed on invoices over £10,000.", "Dependency updates for the website build.", "No tests were added for the booking form."], next: [{ text: "Add tests for the booking form before the next release", open: "" }] } }];
  const codeIdx = { repo: "harbour-vale/website", branch: "main", private: true, commits: [["Booking form for pallet collections", "Dev One", 1], ["Fix VAT rounding on large invoices", "Dev Two", 2], ["Show tracking link in confirmation email", "Dev One", 3], ["Update website dependencies", "dependabot", 4], ["Add collection time slots", "Dev One", 6], ["Tidy invoice PDF layout", "Dev Two", 9], ["Cloudflare cache rules for images", "Dev One", 12], ["Postcode lookup for delivery areas", "Dev Two", 15], ["Fix mobile menu", "Dev One", 19], ["Add sitemap", "Dev Two", 23]].map(([m, a, d], i) => ({ sha: (0xa13f2c + i * 977).toString(16).slice(0, 7), message: m, author: a, date: (() => { const t = new Date(now - d * 864e5); t.setHours([10, 14, 11, 16, 9, 15, 13, 17, 12, 20][i], (i * 17) % 60, 0, 0); return t.toISOString(); })() })) };
  const codeView = () => { const days = {}; codeIdx.commits.forEach((c) => { const d = c.date.slice(0, 10); days[d] = (days[d] || 0) + 1; });
    return { connected: true, repo: codeIdx.repo, private: true, connected_at: ago_(24 * 20), files: 412, index: { repo: codeIdx.repo, branch: "main", private: true, commits: codeIdx.commits, indexed_at: ago_(3),
      summary: { description: "Xevrion's website and booking system.", languages: [{ name: "TypeScript", files: 148, percent: 52 }, { name: "Python", files: 71, percent: 25 }, { name: "CSS", files: 38, percent: 13 }, { name: "HTML", files: 21, percent: 7 }, { name: "Shell", files: 8, percent: 3 }],
        frameworks: ["Cloudflare Workers", "Docker", "Next.js", "Node.js", "Python project"], score: 75, files: 412, code_files: 286, test_files: 34,
        health: [["tests", "Automated tests", "tests/test_invoices.py"], ["ci", "CI workflows", ".github/workflows/ci.yml"], ["docker", "Container build", "Dockerfile"], ["readme", "README", "README.md"], ["license", "Licence", ""], ["deps", "Dependency updates", ".github/dependabot.yml"], ["security", "Security policy", ""], ["cloudflare", "Cloudflare configuration", "wrangler.toml"]].map(([key, label, where]) => ({ key, label, ok: !!where, where })),
        timeline: Object.entries(days).map(([day, commits]) => ({ day, commits })), authors: [{ name: "Dev One", commits: 5 }, { name: "Dev Two", commits: 4 }, { name: "dependabot", commits: 1 }] } } }; };
  // Ask (portal_assistant.py): the example workspace answers from its own records, as the real one does without AI
  const pounds = (v) => "£" + Number(v || 0).toLocaleString("en-GB", { maximumFractionDigits: Number(v) >= 100 ? 0 : 2 });
  // ---------------------------------------------------------------- the three services, kept as one example state
  const penceGbp = (pence) => "£" + (Number(pence || 0) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let svc = null;
  function serviceState() {
    if (svc) return svc;
    const x = serviceExample(careView(), now);
    svc = { invoices: x.invoices, jobs: x.jobs, reminders: x.reminders };
    return svc;
  }
  function serviceView() {
    const x = serviceExample(careView(), now), st = serviceState();
    const overdue = st.invoices.filter((i) => i.status === "overdue").reduce((a, i) => a + Number(i.remaining_pence || 0), 0);
    return { ...x, invoices: st.invoices, jobs: st.jobs, reminders: st.reminders,
      metrics: { ...x.metrics, overdue_pence: overdue, jobs_to_invoice: st.jobs.filter((j) => j.status === "draft").length, accounting_drafts: st.jobs.filter((j) => j.status === "created").length } };
  }
  function servicePrepare(invoiceId) {
    const st = serviceState(), inv = st.invoices.find((i) => i.id === invoiceId);
    if (!inv || !(inv.decision || {}).eligible) throw Error("This invoice cannot have a reminder now: it is paid, on hold or not due yet.");
    const open_ = st.reminders.find((r) => r.invoice_id === invoiceId && r.status === "ready");
    if (open_) return open_;
    const r = { id: "rem_" + (st.reminders.length + 1), invoice_id: inv.id, status: "ready", version: 1, tone: "standard", payment_url: null, statutory: null, email: inv.email,
      subject: "Invoice " + inv.reference + ": " + penceGbp(inv.remaining_pence) + " is now overdue",
      text: "Hi Jo,\n\nA quick reminder that invoice " + inv.reference + " for " + penceGbp(inv.remaining_pence) + " was due on " + new Date(inv.due_on + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" }) +
        ". If you have already paid, please ignore this. If something is wrong, just reply and we will check.\n\nThanks,\nSarah, Harbour & Vale", created_at: new Date().toISOString() };
    st.reminders.push(r); return r;
  }
  function serviceSend(id, body) {
    const st = serviceState(), r = st.reminders.find((x) => x.id === id);
    if (!r) throw Error("This reminder is no longer here. Refresh the page.");
    if (r.status !== "ready") return r;
    if (Number(body.version) !== r.version) throw Error("This reminder changed. Refresh the page and check it again.");
    Object.assign(r, { status: "sent", version: r.version + 1, sent_at: new Date().toISOString(), note: "Example only: no email left this page." });
    return r;
  }
  function serviceBill(id, body) {
    const st = serviceState(), j = st.jobs.find((x) => x.id === id);
    if (!j) throw Error("This job is no longer here. Refresh the page.");
    if (j.status === "created") return j;
    if (j.status !== "draft") throw Error("Check this job in Xero before approving it again.");
    if (Number(body.version) !== j.version) throw Error("This job changed. Refresh the page and check it again.");
    Object.assign(j, { status: "created", version: j.version + 1, approved_by: "Sarah Vale", invoice_id: "DEMO-XERO-" + String(j.job_reference || "").replace(/\D/g, ""),
      attachments: (j.attachments || []).map((f) => ({ ...f, upload_status: "uploaded" })) });
    return j;
  }
  // ---------------------------------------------------------------- Ask Xevrion (portal-demo-ask.js answers; these are its records)
  // Every fact is worked out from the same example records the pages show, fresh for each question, so an approval the
  // visitor just gave changes the answer. Each fact names the page that shows it and a reference where one exists.
  const gbp0 = (v) => "£" + Math.round(Number(v) || 0).toLocaleString("en-GB");
  const ageDays = (iso) => Math.max(0, Math.round((now - Date.parse(String(iso).length === 10 ? iso + "T12:00:00Z" : iso)) / DAY));
  const PERSON = { acc_owner: "Sarah Vale", acc_admin: "Tom Harbour", acc_ops1: "Dev Patel", acc_ops2: "Dan Okafor", acc_appr: "Grace Lin", acc_fin: "Mark Ellis", acc_ana: "Zoe Clarke" };
  const askFacts = async () => {
    const D = await fixtures(), f = [];
    const addFact = (topic, text, page, ref, part, row) => f.push({ id: "F" + (f.length + 1), ref: ref || "", topic, text, page, part: part || "", row: row || null });
    const n = (k, one, many) => k + " " + (k === 1 ? one : many);
    const sv = serviceState(), owing = sv.invoices.filter((x) => Number(x.remaining_pence) > 0);
    const late = owing.filter((x) => x.status === "overdue"), held = owing.filter((x) => ["disputed", "promised"].includes(x.status)), notDue = owing.filter((x) => x.status === "not_due");
    const total = owing.reduce((a, x) => a + Number(x.remaining_pence), 0), lateTotal = late.reduce((a, x) => a + Number(x.remaining_pence), 0);
    addFact("money", "Customers owe you " + penceGbp(total) + " across " + owing.length + " invoices. " + penceGbp(lateTotal) + " of it is late.", "collections", "TOTAL");
    f[f.length - 1].id = "TOTAL";
    late.forEach((x) => { const r = sv.reminders.find((y) => y.invoice_id === x.id);
      addFact("money", x.customer + " owes " + penceGbp(x.remaining_pence) + " on " + x.reference + ", " + ageDays(x.due_on) + " days late. " +
        (r && r.status === "sent" ? "A reminder went on " + new Date(r.sent_at || now).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) + "." : r ? "A polite reminder is ready for you to approve." : "No reminder is ready yet."), "collections", x.reference, "",
        { label: x.customer, value: penceGbp(x.remaining_pence), sub: x.reference + " · " + ageDays(x.due_on) + " days late", tone: ageDays(x.due_on) > 30 ? "red" : "amber" }); });
    if (held.length) addFact("money", n(held.length, "invoice is", "invoices are") + " on hold: " + penceGbp(held.reduce((a, x) => a + Number(x.remaining_pence), 0)) + ". No reminder goes while a hold stands.", "collections", "", "hold");
    held.forEach((x) => addFact("money", x.customer + " owes " + penceGbp(x.remaining_pence) + " on " + x.reference + ". It is on hold (" + (x.status === "disputed" ? "they queried a charge" : "they promised to pay") + "), so no reminder goes.", "collections", x.reference, "hold",
      { label: x.customer, value: penceGbp(x.remaining_pence), sub: x.reference + " · on hold: " + (x.status === "disputed" ? "a query" : "a promise to pay"), tone: "" }));
    notDue.forEach((x) => addFact("money", x.customer + " owes " + penceGbp(x.remaining_pence) + " on " + x.reference + ". It is due in " + n(Math.max(1, Math.round((Date.parse(x.due_on + "T12:00:00Z") - now) / DAY)), "day", "days") + ".", "collections", x.reference, "",
      { label: x.customer, value: penceGbp(x.remaining_pence), sub: x.reference + " · not due yet", tone: "" }));
    const unbilled = sv.jobs.filter((j) => j.status === "draft");
    if (unbilled.length) addFact("money", n(unbilled.length, "job is", "jobs are") + " not billed yet: " + penceGbp(unbilled.reduce((a, j) => a + Number(j.net_pence || 62500), 0)) + " before VAT. Each one waits for you to approve its Xero draft.", "job_billing", "", "job");
    sv.jobs.filter((j) => j.status === "draft").forEach((j) => addFact("money", "Not billed yet: " + j.job_reference + " for " + (j.customer_name || "Kirkby Joinery") + ", " + penceGbp(j.net_pence || 62500) + " before VAT. It is ready for you to approve as a Xero draft.", "job_billing", j.job_reference, "job",
      { label: j.customer_name || "Kirkby Joinery", value: penceGbp(j.net_pence || 62500), sub: j.job_reference + " · not billed yet", tone: "" }));
    // approvals: everything that waits for a person's yes
    const openCare = care.drafts.filter((x) => ["ready", "needs_you", "unconfirmed"].includes(x.status)), pending = approvals.filter((x) => x.status === "pending");
    const remReady = sv.reminders.filter((x) => x.status === "ready"), jobsReady = sv.jobs.filter((x) => x.status === "draft");
    addFact("approvals", (openCare.length + pending.length + remReady.length + jobsReady.length) + " things wait for your yes: " + openCare.length + " customer replies, " + remReady.length + " payment reminder" + (remReady.length === 1 ? "" : "s") + ", " + jobsReady.length + " Xero draft" + (jobsReady.length === 1 ? "" : "s") + " and " + pending.length + " other approvals.", "attention");
    openCare.forEach((x) => addFact("approvals", "Reply to " + x.from.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()) + ": \"" + x.subject + "\". " + (x.status === "needs_you" ? (x.handoff ? "They asked for a person." : "It needs a fact the draft does not have.") : "The draft is ready to check.") + " Waiting " + Math.max(1, Math.round((now - Date.parse(x.received_at)) / 60000)) + " minutes.", "enquiries", x.id, "",
      { label: x.subject, value: Math.max(1, Math.round((now - Date.parse(x.received_at)) / 60000)) + " min", sub: "Customer reply · " + x.from, tone: x.status === "needs_you" ? "amber" : "" }));
    remReady.forEach((x) => { const inv = sv.invoices.find((y) => y.id === x.invoice_id); addFact("approvals", "Payment reminder for " + (inv ? inv.reference + " (" + inv.customer + ", " + penceGbp(inv.remaining_pence) + ")" : "an invoice") + ". The balance was checked in Xero.", "collections", inv && inv.reference, "",
      { label: "Reminder: " + (inv ? inv.customer : "an invoice"), value: inv ? penceGbp(inv.remaining_pence) : "", sub: (inv ? inv.reference + " · " : "") + "balance checked in Xero", tone: "" }); });
    jobsReady.forEach((j) => addFact("approvals", "Xero draft for " + j.job_reference + ", " + penceGbp(j.net_pence || 62500) + " before VAT. The signed sheet matches the quote.", "job_billing", j.job_reference, "",
      { label: "Xero draft: " + (j.customer_name || "Kirkby Joinery"), value: penceGbp(j.net_pence || 62500), sub: j.job_reference + " · sheet matches the quote", tone: "" }));
    pending.forEach((x) => addFact("approvals", x.summary + ". It ends in " + Math.max(1, Math.round((Date.parse(x.expires_at) - now) / 3600000)) + " hours if nobody decides.", "attention", x.id, "",
      { label: x.summary, value: "", sub: "Approval · ends in " + Math.max(1, Math.round((Date.parse(x.expires_at) - now) / 3600000)) + " hours", tone: "" }));
    // today: what is due or late for the owner, then what is waiting
    const T = D.team || D.TEAM_ITEMS && { items: D.TEAM_ITEMS }, today = new Date(now).toISOString().slice(0, 10);
    const open = (T.items || []).filter((x) => ["todo", "in_progress"].includes(x.status));
    const mineDue = open.filter((x) => x.assignee === "acc_owner" && x.due_on && x.due_on <= today);
    const allDue = open.filter((x) => x.due_on && x.due_on <= today);
    addFact("today", "Today: " + n(mineDue.length, "of your own tasks is", "of your own tasks are") + " due or late, " + n(openCare.length, "customer reply waits", "customer replies wait") + " for you, and the team has " + n(allDue.length, "piece", "pieces") + " of work due or late.", "attention");
    mineDue.forEach((x) => addFact("today", "Your task: " + x.title + ". " + (x.due_on < today ? "It was due on " + new Date(x.due_on + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" }) + "." : "It is due today."), "team_work", x.id, "",
      { label: x.title, value: "", sub: x.due_on < today ? "Your task · late" : "Your task · due today", tone: x.due_on < today ? "amber" : "" }));
    if (late.length) addFact("today", "Late money: " + late.map((x) => x.customer + " " + penceGbp(x.remaining_pence)).join(", ") + ". A reminder is ready.", "collections", late[0].reference, "",
      { label: "Late money", value: penceGbp(lateTotal), sub: late.map((x) => x.customer).join(", "), tone: "amber" });
    const hurry = openCare.filter((x) => now - Date.parse(x.received_at) > 30 * 60000);
    if (hurry.length) addFact("today", hurry.length + " customer repl" + (hurry.length === 1 ? "y has" : "ies have") + " waited over 30 minutes. Your target is the first reply within the hour.", "enquiries", hurry[0].id, "",
      { label: "Customer replies waiting", value: String(hurry.length), sub: "over 30 minutes · target 1 hour", tone: "amber" });
    // automations: what ran this week
    const runs = automationRuns(D), week = new Date(now - 7 * DAY).toISOString().slice(0, 10);
    let ok = 0, bad = 0, wait = 0;
    const live = (D.designs || []).filter((x) => x.status === "approved");
    live.forEach((x) => (runs.designs?.[x.id]?.days || []).filter((d) => d.day >= week).forEach((d) => { ok += d.succeeded; bad += d.failed; wait += d.waiting; }));
    const done7 = ops.filter((o) => o.status === "completed" && o.completed_at >= new Date(now - 7 * DAY).toISOString()).length;
    addFact("automations", "This week Xevrion finished " + done7 + " pieces of work for you. Your live automations ran " + (ok + bad + wait) + " times: " + ok + " went well, " + bad + " failed and " + wait + " " + (wait === 1 ? "waits" : "wait") + " for a person.", "automations");
    live.forEach((x) => { const r = runs.designs?.[x.id] || {}; addFact("automations", x.name + ": live. " + (r.success_rate != null ? r.success_rate + "% of its last 30 days' runs went well" : "No runs yet") + (r.hours_saved_estimate ? ", about " + r.hours_saved_estimate + " hours saved (an estimate)" : "") + ".", "automations", x.id, "",
      { label: x.name, value: r.success_rate != null ? r.success_rate + "%" : "", sub: "Live · " + (r.hours_saved_estimate ? "about " + r.hours_saved_estimate + " h saved, estimate" : "no runs yet"), tone: "" }); });
    (D.designs || []).filter((x) => x.status === "draft").slice(0, 2).forEach((x) => addFact("automations", x.name + ": a draft. It runs only after a person approves it.", "automations", x.id, "",
      { label: x.name, value: "", sub: "Draft · waits for a person's approval", tone: "" }));
    addFact("automations", "Sent this month: " + care.sent + " customer replies and " + (sv.reminders.filter((x) => x.status === "sent").length) + " payment reminders, each approved by a person.", "home");
    // leads: new business from the inbox and the pipeline
    const leadsOpen = openCare.filter((x) => x.lead), opp = oppsDemo();
    addFact("leads", "New business this week: 9 enquiries answered, 8 of them within your target. " + leadsOpen.length + " new enquir" + (leadsOpen.length === 1 ? "y waits" : "ies wait") + " for a price now.", "enquiries");
    leadsOpen.forEach((x) => addFact("leads", "\"" + x.subject + "\" from " + x.from + ". " + (x.reason || "It waits for you."), "enquiries", x.id, "",
      { label: x.subject, value: "", sub: "New enquiry · " + x.from, tone: "amber" }));
    addFact("leads", "Pipeline: " + opp.items.length + " open opportunities worth " + gbp0(opp.items.reduce((a, x) => a + (x.size_gbp || 0), 0)) + " (" + gbp0(opp.items.reduce((a, x) => a + (x.weighted_value || 0), 0)) + " weighted by stage). " + opp.items.filter((x) => x.stalled).length + " has stalled.", "opportunities", "", "",
      { label: "Pipeline", value: gbp0(opp.items.reduce((a, x) => a + (x.size_gbp || 0), 0)), sub: opp.items.length + " open opportunities", tone: "" });
    // team: who has room and who has too much
    const limit = (D.TEAM_SETTINGS || {}).wip_limit || 6, load = {};
    open.forEach((x) => { if (x.assignee) { const l = (load[x.assignee] ||= { open: 0, late: 0 }); l.open += 1; if (x.overdue) l.late += 1; } });
    const rows = Object.entries(load).sort((a, b) => b[1].open - a[1].open);
    addFact("team", "The team has " + open.length + " open pieces of work, " + open.filter((x) => !x.assignee).length + " with nobody on them. The limit is " + limit + " each.", "team_work");
    rows.forEach(([who, l]) => addFact("team", (PERSON[who] || "Someone") + ": " + l.open + " open" + (l.late ? ", " + l.late + " late" : "") + (l.open > limit ? ". Over the limit: give some to someone with room." : l.open <= 2 ? ". Has room for more." : "."), "team_work", "", "",
      { label: PERSON[who] || "Someone", value: l.open + " open", sub: l.open > limit ? "over the limit of " + limit : l.late ? l.late + " late" : l.open <= 2 ? "has room for more" : "within the limit", tone: l.open > limit ? "amber" : "" }));
    // customers: each one, and the ones to watch
    customers.forEach((c) => {
      const slow = c.usual_gap_days && c.days_since_last > c.usual_gap_days * 1.5, words = c.segment === "At risk" || slow ? "Watch" : "Healthy";
      addFact("customer:" + c.name, c.name + ": " + words + ". " + gbp0(c.revenue_12m) + " in the last 12 months over " + c.invoices_12m + " invoices.", "customers", c.id, "", { label: "Last 12 months", value: gbp0(c.revenue_12m), sub: c.invoices_12m + " invoices · " + c.segment, tone: "" });
      addFact("customer:" + c.name, "Last order " + c.days_since_last + " days ago; they usually order every " + c.usual_gap_days + " days." + (c.median_days_late ? " They pay about " + c.median_days_late + " days late." : " They pay on time."), "customers", c.id, "",
        { label: "Last order", value: c.days_since_last + " days", sub: "usually every " + c.usual_gap_days + " days", tone: slow ? "amber" : "" });
      if (c.next_step && c.next_step.kind !== "none") addFact("customer:" + c.name, "Next step: " + c.next_step.title + ". " + (c.next_step.why || ""), "customers", c.id, "", { label: "Next step", value: "", sub: c.next_step.title, tone: "" });
    });
    const risk = customers.filter((c) => c.segment === "At risk" || (c.usual_gap_days && c.days_since_last > c.usual_gap_days * 1.5));
    addFact("customers", risk.length ? n(risk.length, "customer may be leaving.", "customers may be leaving.") + " They are ordering less often than usual." : "No customer looks at risk right now.", "customers");
    risk.forEach((c) => addFact("customers", c.name + " last ordered " + c.days_since_last + " days ago; they usually order every " + c.usual_gap_days + " days.", "customers", c.id, "",
      { label: c.name, value: c.days_since_last + " days", sub: "since the last order · usually " + c.usual_gap_days, tone: "amber" }));
    const top = customers.slice().sort((a, b) => Number(b.revenue_12m) - Number(a.revenue_12m))[0], all = customers.reduce((a, c) => a + Number(c.revenue_12m), 0);
    if (top && all) addFact("customers", "Your biggest customer is " + top.name + ": " + Math.round(Number(top.revenue_12m) / all * 100) + "% of the last 12 months' sales. Losing them would hurt, so keep in touch.", "customers", top.id, "",
      { label: top.name, value: Math.round(Number(top.revenue_12m) / all * 100) + "%", sub: "of the last 12 months' sales · your biggest customer", tone: "" });
    // security: the score and the first fix
    const security = D.SECURITY || {}, first = (security.plan || []).find((x) => x.status === "open");
    if (security.score != null) addFact("security", "Your security score is " + security.score + " out of 100 (" + String(security.grade || "").toLowerCase() + ")." + (first ? " Fix first: " + first.title.toLowerCase() + ". It takes " + String(first.effort_words || "a short while").toLowerCase() + " and adds about " + Math.round(first.score_impact) + " points." : ""), "security_center", "", "",
      { label: "Security score", value: security.score + "/100", sub: first ? "Fix first: " + first.title : String(security.grade || ""), tone: security.score < 60 ? "amber" : "" });
    return f;
  };
  // the advice agent (agent_advice.py): advice written from the facts above, every figure quoted from the fact it comes
  // from (check_items keeps only those), so the "where does this come from" buttons work. Rule-based, as without the AI.
  const advice = async (period) => {
    const fs = await askFacts(), find = (re) => fs.find((x) => re.test(x.text));
    const fig = (f, re) => { const m = f && re.exec(f.text); return m ? [{ fact_id: f.id, quoted: m[0], fact_text: f.text, page: f.page }] : []; };
    const items = [];
    const late = find(/owes £[\d,.]+ on INV-\d+, \d+ days late/);
    if (late) items.push({ title: "Approve the reminder for " + late.text.split(" owes")[0], why: "Their invoice is " + /\d+ days late/.exec(late.text)[0] + " and nothing is on hold, so a polite reminder is the next step.",
      figures: fig(late, /£[\d,.]+/).concat(fig(late, /\d+ days late/)), action: "Read the reminder in Invoice follow-up and approve it.", page: "collections", impact: "money", confidence: 0.9, source: "from your records, no AI" });
    const slow = find(/^Last order (\d+) days ago; they usually order every 30 days/);
    if (slow) items.push({ title: "Check in with Ashworth Foods", why: "They have not ordered for a while, much longer than usual for them.", figures: fig(slow, /\d+ days ago/),
      action: "Send the check-in draft from Customers, or give them a call.", page: "customers", impact: "growth", confidence: 0.75, source: "from your records, no AI" });
    const lead = find(/asks for a price that is not in your facts/);
    if (lead) items.push({ title: "Add your Leeds pallet price to your reply facts", why: "A new customer asked for a price your facts do not hold, so the reply had to wait for you.",
      figures: fig(lead, /4 pallets to Leeds/), action: "Add the price under Reply settings. Later replies then go out complete.", page: "enquiries", impact: "growth", confidence: 0.8, source: "from your records, no AI" });
    const busy = find(/Over the limit/);
    if (busy) items.push({ title: "Share out " + busy.text.split(":")[0] + "'s work", why: "They have more open work than the team's limit, so some of it may slip.", figures: fig(busy, /\d+ open/),
      action: "Open Team and give two items to someone with room.", page: "team_work", impact: "risk", confidence: 0.7, source: "from your records, no AI" });
    return { id: "adv_example", period: period || 30, items, dropped: 0, model: "none", source: "rules", facts_used: [...new Set(items.flatMap((x) => x.figures.map((f) => f.fact_id)))],
      at: new Date(now - 26 * 3600000).toISOString(), by: "agents" };
  };
  let guidance = null, adviceRun = null;
  const accountApi = async (method, p, q, body) => {
    const D = await fixtures();
    if (p === "/O/referrals" && method === "GET") return structuredClone(D.REFERRALS);
    if (p === "/O/referrals/ask/dismiss" && method === "POST") return { ask: null };
    if (p === "/O/workspace-setup" && method === "GET") return structuredClone(D.WORKSPACE_SETUP);
    if (p === "/O/guidance" && method === "GET") return structuredClone(guidance || D.GUIDANCE);
    if (p === "/O/guidance" && method === "PUT") { guidance = { show: body.show !== false, hidden: [...new Set((body.hidden || []).filter((h) => /^[a-z_]{1,40}$/.test(h)))].slice(0, 80), updated_at: new Date().toISOString() }; return guidance; }
    if (p === "/O/autopilot" && method === "GET") return structuredClone(D.AUTOPILOT);
    if (p === "/O/xevrion-ai" && method === "GET") return structuredClone(D.XEVRION_AI);
    if (p === "/O/addons" && method === "GET") return structuredClone(D.ADDONS);
    if (p.startsWith("/O/addons/")) refuse("adding or removing an add-on");
    if (p === "/O/agents/automations" && method === "GET") return structuredClone(D.AGENT_AUTOMATIONS);
    if (p.startsWith("/O/agents/automations")) refuse("an automation made by the agent");
    if (p === "/O/export") refuse("a data export");
    if (p === "/O/autopilot/dismiss" && method === "POST") return { dismissed: true };
    if (p === "/O/autopilot/ask-a-person" && method === "POST") refuse("a message to a person at Xevrion");
    if (p === "/O/agents/advice" && method === "GET") { const r = adviceRun || (await advice(Number(q.get("period")) || 30)); return Number(q.get("period") || r.period) === r.period ? r : await advice(Number(q.get("period"))); }
    if (p === "/O/agents/advice/run" && method === "POST") { if (![7, 30, 90].includes(Number(body.period))) throw Error("Choose 7, 30 or 90 days.");
      adviceRun = { ...(await advice(Number(body.period))), id: "adv_example_" + Date.now(), at: new Date().toISOString(), by: "acc_owner" }; return adviceRun; }
    throw missed(method, p);
  };
  let askEngine = null;
  const askEngineOf = () => (askEngine ||= createAsk({ insights: async (question) => insightAnswer(question, { customers, invoices: serviceState().invoices, now }), facts: askFacts, customerNames: customers.map((c) => c.name).concat(["Northgate Freight", "Bristol Kitchens", "Maple Office Services", "Westbank Studio", "Oakbridge Workshop"]) }));
  const ACT_WHAT = { customer_operations: "Customer reply", business_operations: "Automated work", business_intelligence: "Insight" };

  // ---------------------------------------------------------------- the API
  return async function api(path, options = {}) {
    await new Promise((res) => setTimeout(res, 90 + Math.random() * 120));
    const method = (options.method || "GET").toUpperCase(), body = options.body ? JSON.parse(options.body) : {};
    const p = path.replace("/v1/customer/saas/" + ORG, "/O").split("?")[0], q = new URLSearchParams(path.split("?")[1] || "");
    if (p === "/O/service-workflows" && method === "GET") return structuredClone(serviceView());
    if (p === "/O/service-workflows/billing/contacts" && method === "GET") return {items:[{id:'demo-contact',name:'Northgate Freight'}]};
    let sm;
    // the three services' approvals play out on the example (after the app's own Undo window), so the whole story can be
    // clicked through; nothing leaves this page: no email is sent and nothing is created in Xero
    if ((sm = /^\/O\/service-workflows\/reminders\/([\w-]+)\/send$/.exec(p)) && method === "POST") return serviceSend(sm[1], body);
    if ((sm = /^\/O\/service-workflows\/billing\/jobs\/([\w-]+)\/approve$/.exec(p)) && method === "POST") return serviceBill(sm[1], body);
    if ((sm = /^\/O\/service-workflows\/collections\/([\w-]+)\/prepare$/.exec(p)) && method === "POST") return servicePrepare(sm[1]);
    if (p.startsWith("/O/service-workflows/")) throw Error("Example only: sign in to your workspace to save evidence, refresh accounts or approve a provider action. Nothing has been sent or created.");
    if (/^\/O\/(referrals|workspace-setup|guidance|autopilot|agents\/(advice|automations)|xevrion-ai|addons|export)(\/|$)/.test(p)) return accountApi(method, p, q, body);
    if (p === "/O/agent-hub" || p.startsWith("/O/agent-hub/")) return agentApi(method, p, q, body);
    if (p === "/O/automations/ops" || p.startsWith("/O/automations/ops/")) return opsApi(method, p, q, body);
    if (method === "GET" && (p === "/O/automations/designs" || p === "/O/automations/runs" || /^\/O\/automations\/designs\/des_\w+$/.test(p))) return withOpsDesigns(method, p, q, body);
    if (p === "/O/cfo") return exampleView("CFO_VIEW", method, p);
    // the AI PM Agent (17C): its overview reads; changes, plans and time are not saved in the example
    if (p === "/O/pm") return exampleView("PM_VIEW", method, p);
    if (p.startsWith("/O/pm/")) throw Error("Example only: nothing was changed. Sign in to your workspace to plan, log time or apply a change.");
    // 21B: each core agent's workbench, report and history (agent_workbench.example via portal-demo-data.js WORKBENCH); nothing is saved
    { const wbm = /^\/O\/agent-workbench\/(inbox|pm|billing)(?:\/(report|history))?$/.exec(p);
      if (wbm && method === "GET") { const W = (await fixtures()).WORKBENCH; if (W && W[wbm[1]] && W[wbm[1]][wbm[2] || "workbench"]) return structuredClone(W[wbm[1]][wbm[2] || "workbench"]); throw missed(method, p); }
      if (p.startsWith("/O/agent-workbench/")) throw Error("Example only: nothing was saved. Sign in to your workspace to change settings, templates or views."); }
    // 22B: the core agents' controls (agent_controls.example via portal-demo-data.js AGENT_CONTROLS, synced by 22C); nothing is saved.
    // Until the synced data carries AGENT_CONTROLS, a read is a recorded miss and the app shows its own error state for that tab.
    if (p === "/O/agent-controls" || p.startsWith("/O/agent-controls/")) {
      if (method === "GET") { const C = (await fixtures()).AGENT_CONTROLS; if (C && Object.prototype.hasOwnProperty.call(C, p)) return structuredClone(C[p]); throw missed(method, p); }
      throw Error("Example only: nothing was saved. Sign in to your workspace to change rules, clients or approvals.");
    }
    // 23B: the core agents' insight panels (agent_insights.example via portal-demo-data.js AGENT_INSIGHTS, synced by 23C);
    // read-only on the example, like the controls above.
    // 24B3 (cycle 24): every agent's outcome metrics, each figure and its targets (agent_metrics.example and
    // core_agent_metrics.example via portal-demo-data.js AGENT_METRICS); read-only on the example.
    if (p === "/O/agent-metrics" || p.startsWith("/O/agent-metrics/")) {
      if (method === "GET") { const C = (await fixtures()).AGENT_METRICS; if (C && Object.prototype.hasOwnProperty.call(C, p)) return structuredClone(C[p]); throw missed(method, p); }
      throw Error("Example only: nothing was saved.");
    }
    if (p === "/O/agent-insights" || p.startsWith("/O/agent-insights/")) {
      if (method === "GET") { const C = (await fixtures()).AGENT_INSIGHTS; if (C && Object.prototype.hasOwnProperty.call(C, p)) return structuredClone(C[p]); throw missed(method, p); }
      throw Error("Example only: nothing was saved.");
    }
    // 23C (cycle 23): the Compliance Agent is hired in the example; its page, playbook and three example reviews come from
    // COMPLIANCE_AGENT (compliance_agent's own rules over the example contracts); nothing can be uploaded or decided.
    if (p === "/O/agents/compliance" || p.startsWith("/O/agents/compliance/")) {
      if (method === "GET") { const C = (await fixtures()).COMPLIANCE_AGENT; if (C && Object.prototype.hasOwnProperty.call(C, p)) return structuredClone(C[p]); throw missed(method, p); }
      throw Error("Example only: nothing was uploaded or changed. Sign in to your workspace to review your own contracts.");
    }
    if (p === "/O/billing/overview") return exampleView("BILLING_OVERVIEW", method, p);
    if (p === "/O/assistant" || p.startsWith("/O/assistant/")) { const out = await askEngineOf().handle(method, p, q, body); if (out === undefined) throw missed(method, p); return out; }
    if (p === "/O/outcome-workbench" && method === "GET") return structuredClone(outcomeExample);
    if (p.startsWith("/O/outcome-workbench/")) throw Error("This is an illustrative preview. Sign in to your live workspace to save records or run a workflow.");
    if (/^\/O\/(services$|research$|security\/|business-map|automations\/|team\/|work|opportunities|insights\/|activity\/unified|ledger\/)/.test(p)) return extraApi(method, p, q, body);
    if (method === "GET") {
      if (path === "/v1/customer/saas/organizations") return { items: [{ id: ORG, name: "Harbour & Vale (example)", role: "OWNER" }] };
      if (path === "/v1/customer/saas/sessions") return { items: sessions };
      const GET = { "/O/capabilities": () => ({ role: "OWNER", permissions: ["*"] }), "/O/dashboard": dashboard, "/O/health": health, "/O/ai-usage": () => ({ day: new Date(now).toISOString().slice(0, 10), used: 184, allowance: 3000, remaining: 2816, resets_at: new Date(Math.ceil(now / DAY) * DAY).toISOString() }),
        "/O/value-summary": valueSummary, "/O/integrations/health": () => ({ items: integrations, healthy: false }), "/O/integrations/catalog": () => ({ allowance: 50, connected: integrations.filter((x) => x.status !== "disconnected").length, items: CATALOG }),
        "/O/care/inbox": careView, "/O/reviews": reviewView, "/O/improvements": improvementView, "/O/customers": customerView, "/O/customers/advanced": customersAdvancedView, "/O/layout": () => ({ pages: pageLayouts }), "/O/routines/proposals": () => proposals, "/O/routines/library": () => ({ sets: routineSets.slice().sort((a, b) => a.installed - b.installed || b.fits_you - a.fits_you), fit: "logistics", note: "Time figures are each routine's starting estimates; your own runs replace them once they happen." }),
        "/O/security-policy": () => ({ policy: securityPolicy, my_two_step: true, can_manage: true, members: members.map((m, i) => ({ name: m.display_name, email: m.display_name.split(" ")[0].toLowerCase() + "@hv-logistics.example", role: m.role, two_step: i % 3 !== 2 })) }), "/O/support": () => ({ items: support }), "/O/notifications": () => ({ items: notifications }), "/O/notification-preferences": () => ({ email: true, in_app: true, minimum_priority: "normal" }),
        "/O/product-analytics": () => ({ events: { "organization.created": 1, "subscription.checkout_created": 1, "billing.webhook": 3, "onboarding.updated": 8, "integration.verified": 4, "services.activated": 1, "operations.executed": done.length, "subscription.cancelled": 0 }, activation_rate: 1, module_adoption: 4, time_to_first_value_seconds: 9 * 86400 + 5 * 3600, time_to_first_value_available: true, basis: "Organisation creation to first currently verified ledger outcome with an explicit verification timestamp; execution alone is not customer value." }),
        "/O/optimization": optimization, "/O/usage-metering": usageTotals, "/O/analytics": () => ({ usage_totals: usageTotals().totals, audit_events: 1284, integrations: integrations.length, active_modules: MODS }),
        "/O/team": () => ({ members, invitations }), "/O/invoices": () => ({ items: invoices, provider: "monzo", standing_order_control: "payer" }),
        // proof of value this month, from the same example figures as the pages (4 minutes a reply)
        "/O/outcomes": () => { const hours = Math.round((care.sent * 4) / 6) / 10, last = Number(valueSummary().verified_value_gbp) || 0, month = new Date(now).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          return { month, last_month_name: new Date(now - 31 * DAY).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), plan_price_gbp: "1995.00", value_to_price: last > 0 ? Math.round(last / 1995 * 10) / 10 : null,
            how: "Counted from what Xevrion did in your workspace. Hours use your own minutes-per-task settings; pounds appear only where your Ledger records them.",
            this_month: { replies_sent: care.sent, review_requests_sent: 9, record_requests_sent: 0, clients_records_complete: 0, hours_saved: hours,
              value_recorded_gbp: "0", actions: care.sent + 23, without_a_person: 21 },
            last_month: { value_recorded_gbp: String(last) } }; },
        "/O/readiness": () => ({ open: 0, checks: [{ id: "inbox", title: "Connect your email inbox", why: "", page: "connections", done: true }] }),
        "/O/activity": () => ({ total: 1284, items: ops.slice(-120).reverse().map((o, i) => ({ at: o.completed_at, action: o.module.replace(/_/g, " ") + "." + o.action,
          what: (ACT_WHAT[o.module] || "Work") + ": " + String(o.action || "").replace(/_/g, " "), actor: i % 3 ? "system" : ["Grace Lin", "Dan Okafor", "Zoe Clarke"][i % 9 / 3 | 0], details: {} })) }),
        "/O/preferences": () => ({ ...prefs }), "/O/controls": controlsView, "/O/connections/directory": directoryView, "/O/triage": triView, "/O/loops": () => ({ loops: loopRows, runs: loopRuns, templates: [], max: 25, code_connected: true }), "/O/code": codeView,
        "/O/trial": () => ({ on_trial: false, can_start: false, days: 14, tasks: 1000, ai_calls_per_day: 300 }),
        "/O/retention-policy": () => ({ financial_years: 6, operational_recovery_days: 30, backup_max_days: 35, approved: true, backup_erasure_verified: false, complete_erasure_claim: false }),
        "/O/privacy-inventory": () => ({ account_data: ["name", "email", "role"], operational_records: ["operation receipts", "approvals", "support conversations"], financial_records: ["invoices", "payments"], connection_references: ["opaque credential references"], tombstones: [] }) };
      if (p === "/O/dashboard-summary") return analyticsDemo(Number(q.get("days")) || 30);
      if (/^\/O\/customers\/[\w-]+\/writeup$/.test(p)) {
        const id = p.split("/")[3];
        const c = (customerView().customers || []).find((x) => x.id === id) || { name: "Customer", email: "" };
        return { to: c.email || "", subject: "Checking in — " + (c.name || "there"), text: "Hi,\n\nI wanted to check in briefly. (Example draft — not sent.)\n\nBest regards", note: "Draft only — copy and edit. Example data; nothing is sent." };
      }
      if (GET[p]) return GET[p]();
      if (p === "/O/operations") { const m = q.get("module"), s = q.get("status"); return { items: ops.filter((x) => (!m || x.module === m) && (!s || x.status === s)).slice(-Number(q.get("limit") || 50)), filters: { module: m, status: s } }; }
      if (p.startsWith("/O/operations/")) { const x = ops.find((o) => o.id === decodeURIComponent(p.slice(14))); if (!x) throw Error("operation receipt unavailable"); return x; }
      if (p.startsWith("/O/business-workspace/")) return { items: { processes, work, exceptions }[p.slice(22)] || [] };
      const ci = /^\/O\/customers\/(\w+)\/check-in$/.exec(p), who_ = ci && customers.find((x) => x.id === ci[1]);
      if (who_) return { to: who_.email, subject: "Checking in from Harbour & Vale", text: "Hello " + who_.name + ",\n\nIt has been a little while since we last worked together, so I wanted to check in. Is there anything coming up that we can help with?\n\nAnd if anything about our last job could have been better, I would like to hear that too.\n\nSarah, Harbour & Vale" };
      if (p.startsWith("/O/integrations/") && p.endsWith("/own-app")) return { key: p.split("/")[3], configured: false, required_options: p.includes("microsoft") ? ["tenant"] : [], redirect_uri: "https://api.xevrion.co.uk/v1/public/saas/integrations/callback", steps: ["Open your provider's developer settings and create an app.", "Add the redirect URI shown below.", "Copy the client ID and secret into this form."] };
      throw missed(method, p);
    }
    // ---------------------------------------------------------------- actions the example can show safely
    let m;
    if ((m = /^\/O\/operations\/(\w+)\/authorize$/.exec(p))) {
      const row = { id: id("op"), module: m[1], action: body.action, status: "completed", completed_at: new Date().toISOString(), receipt: { summary: "Illustrative receipt: in your portal this holds the service's real result", request: body.payload } };
      if (body.action === "support_intake") { const c = { id: id("case"), customer_id: body.payload.customer_id, message: body.payload.message }; row.receipt = c; }
      ops.push(row); return row;
    }
    if ((m = /^\/O\/approvals\/(\w+)$/.exec(p))) { const a = approvals.find((x) => x.id === m[1]); if (a) { a.status = body.approved ? "approved" : "rejected"; notifications.push({ id: id("ntf"), event: "approval." + a.status, priority: "normal", status: "sent", at: new Date().toISOString() }); } return a; }
    if (p === "/O/support" && method === "POST") { const s = { id: id("sup"), subject: body.subject, message: body.message, priority: body.priority || "normal", status: "open", created_by: "acc_owner", created_at: new Date().toISOString(), response_due_hours: ["high", "urgent"].includes(body.priority) ? 4 : 24, messages: [], history: [] }; support.unshift(s); return s; }
    if ((m = /^\/O\/support\/(\w+)\/messages$/.exec(p))) { const s = support.find((x) => x.id === m[1]); s.messages.push({ id: id("m"), by: "acc_owner", message: body.message, at: new Date().toISOString() }); return s; }
    if ((m = /^\/O\/support\/(\w+)$/.exec(p))) { const s = support.find((x) => x.id === m[1]); s.status = body.status; (s.history = s.history || []).push({ at: new Date().toISOString(), by: "acc_owner", status: body.status, note: body.note }); return s; }
    if ((m = /^\/O\/care\/drafts\/(\w+)\/(send|skip)$/.exec(p))) { const d = care.drafts.find((x) => x.id === m[1]); if (!d) throw Error("This reply was already dealt with.");
      Object.assign(d, m[2] === "send" ? { status: "sent", draft: body.text, sent_at: new Date().toISOString() } : { status: "skipped" }); if (m[2] === "send") care.sent += 1; return d; }
    if (p === "/O/care/settings") { Object.assign(care.settings, body, { version: care.settings.version + 1 }); return care.settings; }
    if ((m = /^\/O\/reviews\/requests\/(\w+)\/(send|skip)$/.exec(p))) { const r = reviews.requests.find((x) => x.id === m[1]); if (!r) throw Error("This request was already dealt with.");
      Object.assign(r, m[2] === "send" ? { status: "sent", subject: body.subject, text: body.text, sent_at: new Date().toISOString() } : { status: "skipped" }); if (m[2] === "send") reviews.sent += 1; return r; }
    if ((m = /^\/O\/improvements\/(\w+)\/(apply|undo|dismiss)$/.exec(p))) { const r = improvements.rows.find((x) => x.id === m[1]); if (!r) throw Error("Refresh the page: this improvement changed.");
      Object.assign(r, m[2] === "apply" ? { status: "applied", applied_at: new Date().toISOString(), automatic: false, can_undo: true } : m[2] === "undo" ? { status: "dismissed", dismissed_until: new Date(now + 90 * DAY).toISOString(), can_undo: false }
        : { status: "dismissed", dismissed_until: new Date(now + 30 * DAY).toISOString() }); return r; }
    if (/^\/O\/customers\/(\w+)\/check-in$/.test(p)) refuse("a check-in");
    if (p === "/O/routines/proposals/refresh") return proposals;
    if ((m = /^\/O\/routines\/proposals\/([\w-]+)\/(create|apply|dismiss)$/.exec(p))) { const i = proposals.open.findIndex((y) => y.id === m[1]); if (i < 0) throw Error("This suggestion was already dealt with. Refresh the page.");
      const [x] = proposals.open.splice(i, 1); if (m[2] !== "dismiss") proposals.done.push({ ...x, status: m[2] === "create" ? "created" : "applied" }); return x; }
    if ((m = /^\/O\/triage\/(\w+)\/assign$/.exec(p))) { triAssigned[m[1]] = { id: m[1], to: body.to, accepted_suggestion: !!body.accepted_suggestion, at: new Date().toISOString() }; return triAssigned[m[1]]; }
    if (p === "/O/triage/rules") refuse("changing routing rules");
    if ((m = /^\/O\/loops\/(\w+)\/run$/.exec(p))) { const lp = loopRows.find((x) => x.id === m[1]), old = loopRuns.find((r) => r.loop_id === m[1]); const run = { ...(old || loopRuns[0]), id: id("lr"), loop_id: m[1], loop: lp.name, at: new Date().toISOString() }; loopRuns.unshift(run); return { run }; }
    if (p === "/O/loops" || /^\/O\/loops\/\w+\/delete$/.test(p)) refuse("changing loops");
    if (p === "/O/code/ask") return { mode: "ai", answer: "Invoices are built in src/invoices/build.py, which totals the lines and rounds VAT per invoice (fixed last week for amounts over £10,000), and sent by src/invoices/send.py through your email connection after a person approves. Changing the price table in src/pricing/rates.ts changes every new quote and invoice, so the booking form and invoice tests should be run after any change.", files: ["src/invoices/build.py", "src/invoices/send.py", "src/pricing/rates.ts"], follow_ups: ["Which tests cover VAT?", "Who changed pricing last?"] };
    if (p.startsWith("/O/code/")) refuse("changing the repository connection");
    if (p === "/O/connections/requests") { appRequests.add(body.key); return { requested: true, key: body.key }; }

    if (p === "/O/preferences") { if ((prefs.version || 0) !== body.version) throw Error("Your preferences changed on another device. Refresh and try again."); prefs = { ...body, version: body.version + 1, updated_at: new Date().toISOString() }; return prefs; }
    if (p === "/O/automation-pause") { if (body.paused && String(body.reason || "").trim().length < 3) throw Error("Say briefly why, so your team knows (at least three characters).");
      pause = { paused: !!body.paused, reason: body.reason || "", paused_at: new Date().toISOString() }; return controlsView(); }
    if ((m = /^\/O\/controls\/(\w+)\/(auto|enabled)$/.exec(p))) { const a = automations().find((x) => x[0] === m[1]); if (!a || !a[1]) throw Error("Set this up on its own page first.");
      if (m[2] === "enabled") { if (body.on || m[1] === "improvements") throw Error("Switch it on from its own page, where its settings are checked."); a[1].enabled = false; }
      else { if (!a[6]) throw Error("This one always asks first."); a[1][a[6]] = !!body.on; } return controlsView(); }
    if (p === "/O/layout") { if (body.reset || !((body.order || []).length || (body.hidden || []).length)) delete pageLayouts[body.page]; else pageLayouts[body.page] = { order: body.order || [], hidden: body.hidden || [] }; return { page: body.page, layout: pageLayouts[body.page] || null }; }
    if (p === "/O/security-policy") { Object.assign(securityPolicy, { require_mfa: !!body.require_mfa, session_hours: body.session_hours || 12, version: securityPolicy.version + 1 }); return securityPolicy; }
    if (p === "/O/security/sign-out-everyone") refuse("signing everyone out");
    if ((m = /^\/O\/routines\/library\/(\w+)\/install$/.exec(p))) { const x = routineSets.find((y) => y.name === m[1]); if (!x) throw Error("Unknown routine set"); x.installed = true; return { set: x.name, installed: x.processes.length }; }
    if (p === "/O/customers/settings") return customerView().settings;
    if (p === "/O/improvements/settings") { Object.assign(improvements.settings, { auto_apply: !!body.auto_apply, version: improvements.settings.version + 1 }); return improvements.settings; }
    if (p === "/O/reviews/settings") { Object.assign(reviews.settings, body, { version: reviews.settings.version + 1 }); return reviews.settings; }
    if (p === "/O/notification-preferences") return body;
    if (p === "/O/integrations/begin") return { provider: body.key, authorization_url: "#", status: "awaiting_authorization" };
    if ((m = /^\/O\/integrations\/(\w+)\/verify$/.exec(p))) { const x = integrations.find((i) => i.key === m[1]); if (x) { Object.assign(x, { status: "connected", health: "healthy", last_sync_at: new Date().toISOString() }); x.history = [{ at: new Date().toISOString(), action: "integration.verified", words: "verified access", ok: true, by: "Sarah Vale" }].concat(x.history || []).slice(0, 8); if (x.activity) x.activity.ok[x.activity.ok.length - 1] += 1; } return x; }
    if (p === "/O/value-ledger") { const v = { id: id("val"), version: 1, status: "estimated", title: body.title, service: body.service, expected_value: String(body.expected_value || 0), actual_value: null, costs: null, currency: body.currency || "GBP", confidence: Number(body.confidence) || 0.5, attribution_method: body.attribution_method, created_at: new Date().toISOString() }; value_items.push(v); return v; }
    if (p === "/O/team/invitations") { invitations.push({ id: id("inv"), email: body.email, role: body.role, status: "pending", expires_at: new Date(now + 7 * DAY).toISOString() }); return { invite_id: "demo", expires_in_days: 7 }; }
    if (p.endsWith("/resend")) return { resent: true };
    if (p === "/O/onboarding") return onboarding;
    if (p === "/v1/customer/saas/logout") return { logged_out: true };
    if (/cancel|offboarding|deletion|transfer-ownership|subscription/.test(p) || method === "DELETE") refuse("a change to billing, ownership or your data");
    if (/credential|own-app|mfa|password|sessions/.test(p)) refuse("a credential");
    refuse("this action");
  };
}

