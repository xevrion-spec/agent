// Arrivals from an outreach email: /start and /check/r. Loaded only on pages with [data-arrival] (core.js imports it,
// and the page preloads it, xw/shell.py).
// The links in a reply to Xevrion's outreach carry utm_source=outreach and utm_content=<agent> (cycle 17: inbox, pm,
// billing, operations, compliance or cfo). When utm_content names one of them, the page shows the matching one-line
// header and the three steps for that agent (xw/conversion.py prints every variant, hidden). Links sent before cycle 17
// named the old services (customer_replies, invoice_follow_up, completed_work): ALIASES maps each to the agent that
// does that work now. Nothing from the address is ever written into the page:
// the value only chooses between fixed variants, and anything outside the allow-list shows nothing.

export const FAMILIES = Object.freeze(["inbox", "pm", "billing", "operations", "compliance", "cfo"]);
export const ALIASES = Object.freeze({ customer_replies: "inbox", invoice_follow_up: "billing", completed_work: "billing" });

// The agent in a query string ("?utm_source=outreach&utm_content=billing"), or "" when there is none or it is not one of
// FAMILIES (an old service name gives its agent, through ALIASES). Never throws, whatever the address holds.
export function familyFrom(search) {
  try {
    const raw = new URLSearchParams(String(search ?? "")).get("utm_content");
    const raw2 = String(raw ?? "").trim().toLowerCase().replace(/-/g, "_");
    const key = Object.hasOwn(ALIASES, raw2) ? ALIASES[raw2] : raw2;
    return FAMILIES.includes(key) ? key : "";
  } catch { return ""; }
}

// Show the variant for `family` in every [data-arrival] box, and hide the rest. Returns how many boxes were shown.
export function show(family, boxes, pick) {
  if (!FAMILIES.includes(family)) return 0;
  let shown = 0;
  for (const box of boxes) {
    let match = false;
    for (const el of pick(box)) {
      const on = el.dataset.arrivalFor === family;
      el.hidden = !on;
      match = match || on;
    }
    box.hidden = !match;
    if (match) shown += 1;
  }
  return shown;
}

export function init({ Analytics, $$ }) {
  let family = "";
  try { family = familyFrom(location.search); } catch { family = ""; }
  if (!family) return;
  const shown = show(family, $$("[data-arrival]"), (box) => $$("[data-arrival-for]", box));
  if (shown) { try { Analytics?.track?.(`arrival:${family}`, true); } catch { /* measurement never breaks the page */ } }
}
