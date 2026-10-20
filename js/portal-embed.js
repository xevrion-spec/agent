// The real portal app inside a website page: /customer-portal (viz-portal.js) shows the app (portal-app.js and portal.css, copied from the gateway by tools/sync_portal.py) on the same
// invented company (portal-demo.js). Nothing here draws the app: it loads it, boots it on the example API and opens
// its screens, so a visitor sees exactly what their team would sign in to.
//
// The app and its example data are large, so they load only when a page asks (bootPortal), never on first load.

// The portal is a whole app shown inside a page. Its own main, nav and h1 would compete with the page's (two mains,
// two h1s), so for assistive technology its landmarks become plain groups and its headings sit under the page's
// section heading (h1 to level 3, h2 and h3 to 4, the rest to 5). Nothing changes visually; it re-applies as screens change.
export function embed(root) {
  const lvl = { H1: 3, H2: 4, H3: 4, H4: 5, H5: 5, H6: 5 };
  let queued = false;
  const fixRoles = () => {
    queued = false;
    root.querySelectorAll("main,nav,header,footer,aside").forEach((e) => { if (e.getAttribute("role") !== "group") e.setAttribute("role", "group"); });
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => { if (!h.hasAttribute("aria-level")) { h.setAttribute("role", "heading"); h.setAttribute("aria-level", String(lvl[h.tagName])); } });
  };
  fixRoles();
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(fixRoles); } }).observe(root, { childList: true, subtree: true });
}

/** What a stop's "open" token asks for: { kind: "row" | "design" | "ask" | "chat" | "", value }. Unknown tokens do nothing. */
export function parseOpen(token) {
  const m = /^(row|design|ask|chat):(.+)$/.exec(String(token || "").trim());
  return m ? { kind: m[1], value: m[2].trim().slice(0, 200) } : { kind: "", value: "" };
}

/** Tour stops from a page's JSON, keeping only well-formed ones (a key, a label, a portal page). */
export function readStops(json) {
  let list = [];
  try { list = JSON.parse(json || "[]"); } catch (e) { list = []; }
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.key === "string" && typeof x.page === "string" && typeof x.label === "string" && x.key && x.page)
    .map((x) => ({ key: x.key, label: x.label, page: x.page, look: String(x.look || ""), open: String(x.open || "") }));
}

// waits for an element in the app (it renders after its data arrives), up to a limit; null if it never comes
export function waitFor(root, sel, ms = 3000) {
  return new Promise((res) => {
    const t0 = Date.now();
    const look = () => { const el = root.querySelector(sel); if (el) return res(el); if (Date.now() - t0 > ms) return res(null); setTimeout(look, 80); };
    look();
  });
}
const cssId = (v) => (globalThis.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&"));

/** Opens what a stop's token names on the current screen: a record beside the list, an automation's diagram, an Ask
 * question or a chat. True when it was found. */
export async function openOn(root, token) {
  const { kind, value } = parseOpen(token);
  if (kind === "row") { const r = await waitFor(root, `.lx-row[data-id="${cssId(value)}"]`); r?.click(); return !!r; }
  if (kind === "design") {
    // Automations' overview (cycle 15) has a "Workflow" button for each running design: the shortest way to its diagram
    const direct = await waitFor(root, `[data-act="au-goto"][data-id="${cssId(value)}"]`, 2500);
    if (direct) { direct.click(); return true; }
    const tab = [...root.querySelectorAll("button,a")].find((b) => /^Your designs/.test((b.textContent || "").trim()));
    tab?.click();
    const r = await waitFor(root, `.lx-row[data-id="${cssId(value)}"]`); if (!r) return false; r.click();
    const go = await waitFor(root, `[data-act="au-goto"][data-id="${cssId(value)}"]`); go?.click(); return !!go;
  }
  if (kind === "ask") {
    // on the Ask page its own box; anywhere else the Ask side panel
    const page = await waitFor(root, "#xaPageQ", 1500);
    let input = page;
    if (!input) { const b = await waitFor(root, ".xp-ask, [data-act='ask-open']"); if (!b) return false; b.click(); input = await waitFor(root, "#xpAsk input[name=q]"); }
    const form = input?.closest("form"); if (!form) return false;
    input.value = value; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  }
  if (kind === "chat") {
    const r = await waitFor(root, `[data-act="tc-open"][data-id="${cssId(value)}"], [data-chat="${cssId(value)}"]`); r?.click(); return !!r;
  }
  return false;
}

let booted = null;
/** Loads portal.css, the app and the example API (once per page), boots the app into `host` and opens `page`. */
export function bootPortal(host, { page = "enquiries" } = {}) {
  return (booted ||= (async () => {
    let assets;
    try { assets = JSON.parse(document.getElementById("xw-assets")?.textContent || "{}"); } catch { assets = {}; }
    if (!assets["portal-app.js"]) throw new Error("portal assets are missing from the page");
    if (assets["portal.css"] && !document.querySelector("link[data-portal-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = assets["portal.css"]; link.dataset.portalCss = "";
      const loaded = new Promise((res) => { link.onload = res; link.onerror = res; });
      document.head.append(link);
      await loaded;                                   // the app never paints unstyled
    }
    const [{ demoApi }] = await Promise.all([import("./portal-demo.js"), import(assets["portal-app.js"])]);
    host.replaceChildren();
    await window.XevrionPortal.boot(host, { api: demoApi(), demo: true });
    embed(host);
    await window.XevrionPortal.go(page);
    return window.XevrionPortal;
  })().catch((err) => {
    booted = null;                                    // a failed load (offline, blocked script) can be tried again
    console.warn("[xevrion] example app could not load", err);
    throw err;
  }));
}
