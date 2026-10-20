// Interaction for the cycle 21 pages (xw/visuals21.py), loaded by core.js only when a picture scrolls near:
//   mode "links"   point at (or focus) a node and the nodes it links to light up, the rest dim: the system map on
//                  /how-it-works and /integrations (a tool lights the agents that use it, an agent lights its tools);
//   mode "filter"  chips and an optional search box narrow a list: the release notes by agent, the help articles and
//                  the integrations by words. The count line says how many are shown; an empty result says so.
// Without this script every item stays visible and nothing is lost. The pure helpers are exported for tools/test_explore.mjs.

/** The words a search matches against: lower case, accents removed, runs of space folded. */
export function normalise(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** True when every word of the query is in the text (so "xero invoice" finds "Draft invoices in Xero"). */
export function matches(text, query) {
  const haystack = normalise(text), words = normalise(query).split(" ").filter(Boolean);
  return words.every((word) => haystack.includes(word));
}

/** True when an item's tags pass the chosen chip ("all" passes everything). */
export function tagged(tags, filter) {
  if (!filter || filter === "all") return true;
  return String(tags || "").split(/\s+/).includes(filter);
}

export function countText(shown, total, noun = "changes") {
  const single = noun.replace(/s$/, "");
  return shown === total ? `${total} ${total === 1 ? single : noun}` : `${shown} of ${total} ${noun}`;
}

function links(host) {
  const nodes = [...host.querySelectorAll("[data-node]")];
  const byId = new Map(nodes.map((node) => [node.dataset.node, node]));
  const clear = () => { host.removeAttribute("data-hot"); nodes.forEach((node) => node.removeAttribute("data-lit")); };
  const light = (node) => {
    host.setAttribute("data-hot", "");
    nodes.forEach((each) => each.removeAttribute("data-lit"));
    node.setAttribute("data-lit", "");
    for (const id of String(node.dataset.links || "").split(/\s+/).filter(Boolean)) byId.get(id)?.setAttribute("data-lit", "");
  };
  nodes.forEach((node) => {
    node.addEventListener("pointerenter", () => light(node));
    node.addEventListener("focus", () => light(node));
    node.addEventListener("click", () => light(node));
  });
  host.addEventListener("pointerleave", clear);
  host.addEventListener("focusout", (event) => { if (!host.contains(event.relatedTarget)) clear(); });
  return { clear, light };
}

function filter(host) {
  const chips = [...host.querySelectorAll("[data-filter]")];
  const items = [...host.querySelectorAll("[data-tags]")];
  const search = host.querySelector("[data-search]");
  const count = host.querySelector("[data-count]");
  const empty = host.querySelector("[data-empty]");
  const groups = [...host.querySelectorAll("[data-group]")];
  const noun = host.dataset.noun || "changes";
  let chosen = "all";
  const apply = () => {
    const query = search ? search.value : "";
    let shown = 0;
    for (const item of items) {
      const pass = tagged(item.dataset.tags, chosen) && matches(item.dataset.text || item.textContent, query);
      item.hidden = !pass;
      if (pass) shown += 1;
    }
    // a day (or a topic) with nothing left in it hides too
    for (const group of groups) group.hidden = ![...group.querySelectorAll("[data-tags]")].some((item) => !item.hidden);
    host.querySelectorAll(".h21-day").forEach((day) => { day.hidden = ![...day.querySelectorAll("[data-tags]")].some((item) => !item.hidden); });
    if (count) count.textContent = countText(shown, items.length, noun);
    if (empty) empty.hidden = shown !== 0;
  };
  chips.forEach((chip) => chip.addEventListener("click", () => {
    chosen = chip.dataset.filter;
    chips.forEach((each) => each.setAttribute("aria-pressed", String(each === chip)));
    apply();
  }));
  search?.addEventListener("input", apply);
  return { apply, choose(value) { chosen = value; apply(); } };
}

export function mount(host) {
  try {
    if (host.dataset.mode === "links") return { ...links(host), visible() {} };
    if (host.dataset.mode === "filter") return { ...filter(host), visible() {} };
  } catch {
    host.setAttribute("data-explore-failed", "");
  }
  return { visible() {} };
}
