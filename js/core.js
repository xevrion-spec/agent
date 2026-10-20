// Xevrion site runtime. Progressive enhancement only: every page is complete HTML without this file.
const API = "https://api.xevrion.co.uk";
// Only the production sites talk to the API. Local and preview builds (127.0.0.1, workers.dev) serve the same files, and
// their calls would be refused by the API anyway: they measure nothing and show "preview" instead of sending.
const LIVE = /(^|\.)xevrion\.co\.uk$/.test(location.hostname);
window.xevLive = LIVE;
const ASSETS = JSON.parse(document.getElementById("xw-assets")?.textContent || "{}");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// On very large screens the page is zoomed (xevrion.css). Pointer positions arrive in screen pixels; K converts them to
// the page's own pixels for anything positioned from them. It only changes when the window does.
let K = 1;
const measureK = () => { const w = document.body?.getBoundingClientRect().width; K = w ? document.body.clientWidth / w : 1; };
addEventListener("resize", measureK, { passive: true });
addEventListener("DOMContentLoaded", measureK);
measureK();

// ------------------------------------------------------------------------------------------------ analytics
// Cookieless and first-party. No identifier is stored: events are counted, and only the first-touch source of this
// browser session (UTM or referring site) is kept in sessionStorage so sign-ups and enquiries can be counted by channel.
// The first payload of a new visit says so (start: true), so a visit is counted once. Moving to another Xevrion site
// carries the same source in the link (xs=source|medium|campaign, removed from the address on arrival), so the hop
// continues the visit instead of starting a new one. Global Privacy Control, Do Not Track and the opt-out on
// /legal/cookies all switch it off entirely; so does any host other than the production sites.
const Analytics = (() => {
  const off = () => {
    if (!LIVE) return true;
    try { if (localStorage.getItem("xev_analytics_off") === "1") return true; } catch { /* storage blocked */ }
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  };
  const site = document.documentElement.dataset.site;
  const clean = (v, n) => String(v || "").replace(/[^A-Za-z0-9 _./:+@-]/g, "").slice(0, n).trim();
  const q = new URLSearchParams(location.search);
  const carried = q.get("xs");
  if (carried !== null) {                  // never leave attribution in an address that can be bookmarked or shared
    q.delete("xs");
    const rest = q.toString();
    try { history.replaceState(history.state, "", location.pathname + (rest ? `?${rest}` : "") + location.hash); } catch { /* ignore */ }
  }
  let queue = [];
  let start = false;                       // true until the first payload of a new visit has been sent; never stored
  const source = (() => {
    try {
      const saved = sessionStorage.getItem("xev_src");
      if (saved) return JSON.parse(saved);
      const ref = document.referrer ? new URL(document.referrer).hostname : "";
      const internal = /(^|\.)xevrion\.co\.uk$/.test(ref);
      const utm = q.get("utm_source");
      const parts = internal && !utm && carried ? carried.split("|") : [];
      let src, fresh = false;
      if (parts.length === 3 && clean(parts[0], 80)) {      // arrived from another Xevrion site: same visit, same source
        src = { source: clean(parts[0], 80).toLowerCase(), medium: clean(parts[1], 40).toLowerCase(), campaign: clean(parts[2], 80), landing: location.pathname };
      } else if (internal && !utm) {                        // e.g. a new tab opened from a Xevrion page: not a new visit
        src = { source: "internal", medium: "none", campaign: "", landing: location.pathname };
      } else {                                              // a new arrival: search, another site, a campaign or direct
        src = {
          source: utm || (ref && !internal ? ref : "direct"),
          medium: q.get("utm_medium") || (ref && !internal ? "referral" : "none"),
          campaign: q.get("utm_campaign") || "",
          landing: location.pathname,
        };
        fresh = true;
      }
      if (!off()) { sessionStorage.setItem("xev_src", JSON.stringify(src)); start = fresh; }
      return src;
    } catch { return { source: "unknown", medium: "", campaign: "", landing: location.pathname }; }
  })();
  const seen = new Set();
  function track(name, once = false) {
    if (off()) return;
    if (once) { if (seen.has(name)) return; seen.add(name); }
    queue.push({ n: String(name).slice(0, 80), p: location.pathname, s: site });
    if (queue.length >= 12) flush();
  }
  function flush() {
    // A page prerendered on hover (speculation rules) is not a visit until it is shown: hold its events till then.
    if (document.prerendering) return;
    if (!queue.length || off()) { queue = []; return; }
    const body = JSON.stringify({ v: 1, events: queue.splice(0, 20), source: { ...source, start } });
    start = false;
    // text/plain keeps this a CORS "simple" request: no preflight, and keepalive lets it outlive the page.
    fetch(`${API}/v1/public/events`, { method: "POST", body, keepalive: true, mode: "cors", credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {});
  }
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  document.addEventListener("prerenderingchange", () => flush(), { once: true });
  setInterval(flush, 8000);
  // Links to another Xevrion website carry this visit's source (never an identifier). Added at click time, so the
  // built pages stay clean; the API host (the app) does not measure, so its links are left alone.
  const XEV = /^((www|ops|portal\.ops)\.)?xevrion\.co\.uk$/;
  const carry = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || off() || ["internal", "unknown", ""].includes(source.source || "")) return;
    let u;
    try { u = new URL(a.href, location.href); } catch { return; }
    if (u.protocol !== "https:" || u.host === location.host || !XEV.test(u.hostname)) return;
    u.searchParams.set("xs", [clean(source.source, 80), clean(source.medium, 40), clean(source.campaign, 80)].join("|"));
    a.href = u.toString();
  };
  document.addEventListener("click", carry, true);
  document.addEventListener("auxclick", carry, true);
  return { track, flush, source, off };
})();
window.xevTrack = Analytics.track;

Analytics.track(`page_view:${document.documentElement.dataset.env}`);
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-event]");
  if (el) Analytics.track(el.dataset.event);
});
{
  let marks = [50, 90];
  addEventListener("scroll", () => {
    const depth = (scrollY + innerHeight) / document.documentElement.scrollHeight * 100;
    marks = marks.filter((m) => { if (depth >= m) { Analytics.track(`scroll_${m}`, true); return false; } return true; });
  }, { passive: true });
}

// ------------------------------------------------------------------------------------------------ sign-up funnel
// The steps from a page view to a free trial, counted per day on the platform (POST /v1/public/site-events,
// platform_gateway/site_funnel.py) by where the visitor came from. Each step is one small text/plain request (a CORS
// "simple" request: no preflight) with the step, the page path and a source class worked out here: an AI assistant,
// a search engine, our outreach emails, a link from another site, or direct. Never a cookie or an identifier. It is off
// whenever the measurement above is off: Do Not Track, Global Privacy Control, the opt-out on /legal/cookies, or any
// host but the production site. The class is kept for this tab's visit in sessionStorage, beside the arrival channel.
const FUNNEL_EVENTS = new Set(["view", "cta_trial", "cta_check", "signup_started", "check_started", "check_done", "pricing_view"]);
const FUNNEL_SOURCES = new Set(["chatgpt", "perplexity", "claude", "gemini", "copilot", "google", "bing", "other_search", "outreach", "referral", "direct", "other"]);
const FUNNEL_HOSTS = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/^(gemini|bard)\.google\.com$/, "gemini"],
  [/(^|\.)copilot\.microsoft\.com$|^copilot\.cloud\.microsoft$/, "copilot"],
  [/(^|\.)google(\.[a-z]{2,3}){1,2}$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)(duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|yandex\.[a-z]{2,3}|baidu\.com|startpage\.com|qwant\.com)$/, "other_search"],
];
// utm_source written as a name rather than a host (utm_source=chatgpt, =google, =duckduckgo)
const FUNNEL_UTM = { chatgpt: "chatgpt", openai: "chatgpt", perplexity: "perplexity", claude: "claude", gemini: "gemini", copilot: "copilot",
  google: "google", bing: "bing", duckduckgo: "other_search", yahoo: "other_search", ecosia: "other_search", brave: "other_search", outreach: "outreach" };
// arrival: Analytics.source on the landing page ({source: utm_source | referring host | "direct" | "internal", medium});
// ref: the landing address's ref code, if any. Returns one of FUNNEL_SOURCES.
function funnelSource(arrival, ref) {
  const raw = String((arrival && arrival.source) || "").trim().toLowerCase();
  if (raw === "outreach") return "outreach";
  if (ref) return "referral";
  if (!raw || ["direct", "internal", "unknown", "none"].includes(raw)) return "direct";
  for (const [re, name] of FUNNEL_HOSTS) if (re.test(raw)) return name;
  const named = FUNNEL_UTM[raw.split(".")[0]];
  if (named) return named;
  return String((arrival && arrival.medium) || "") === "referral" ? "referral" : "other";
}
const Funnel = (() => {
  const q = new URLSearchParams(location.search);
  // a ref in the address is a customer's referral link: it makes the visit a referral even after an earlier page this tab
  const ref = /^[A-Za-z0-9_-]{1,40}$/.test(q.get("ref") || "") ? q.get("ref") : "";
  const source = (() => {
    if (!ref) { try { const saved = sessionStorage.getItem("xev_fsrc"); if (saved && FUNNEL_SOURCES.has(saved)) return saved; } catch { /* storage blocked */ } }
    const s = funnelSource(Analytics.source, ref);
    if (!Analytics.off()) { try { sessionStorage.setItem("xev_fsrc", s); } catch { /* storage blocked */ } }
    return s;
  })();
  // utm_campaign in the API's form (lower case letters, digits, '_', '.', '-', at most 40), or nothing
  const campaign = String((Analytics.source && Analytics.source.campaign) || "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 40);
  const path = () => {
    const p = location.pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
    return /^\/[a-z0-9/_.-]{0,119}$/.test(p) ? p : "";
  };
  const held = [];
  function send(event) {
    if (!FUNNEL_EVENTS.has(event) || Analytics.off()) return;
    if (document.prerendering) { held.push(event); return; }      // a page prerendered on hover is not a visit until shown
    const p = path();
    if (!p) return;
    const body = JSON.stringify(campaign ? { e: event, p, s: source, c: campaign } : { e: event, p, s: source });
    try {
      fetch(`${API}/v1/public/site-events`, { method: "POST", body, keepalive: true, mode: "cors", credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {});
    } catch { /* never let measurement break the page */ }
  }
  document.addEventListener("prerenderingchange", () => held.splice(0).forEach(send), { once: true });
  // which clicks are steps: a link to /get-started or to the app's sign-up is a trial click, a link to the free check is
  // a check click, and anything marked data-funnel="cta_trial" or "cta_check" says so itself
  const onClick = (e) => {
    const marked = e.target.closest?.("[data-funnel]");
    if (marked && ["cta_trial", "cta_check"].includes(marked.dataset.funnel)) { send(marked.dataset.funnel); return; }
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    let u;
    try { u = new URL(a.href, location.href); } catch { return; }
    const here = u.host === location.host, page = u.pathname.replace(/\/$/, "") || "/";
    if ((here && page === "/get-started") || (u.hostname === "api.xevrion.co.uk" && page === "/app" && !u.searchParams.has("trial") && (u.hash === "#signup" || u.searchParams.has("plan")))) send("cta_trial");
    else if (here && (page === "/check" || u.hash === "#check")) send("cta_check");
  };
  document.addEventListener("click", onClick);
  return { send, source };
})();
window.xevFunnel = Funnel.send;
Funnel.send("view");
if (/^\/pricing\/?$/i.test(location.pathname)) Funnel.send("pricing_view");

// ------------------------------------------------------------------------------------------------ navigation
const navEl = $("[data-nav]");
const onScroll = () => navEl?.setAttribute("data-scrolled", String(scrollY > 8));
addEventListener("scroll", onScroll, { passive: true });
onScroll();

function closeMenus(except) {
  $$("[data-menu]").forEach((b) => {
    if (b === except) return;
    b.setAttribute("aria-expanded", "false");
    $(`#${b.getAttribute("aria-controls")}`)?.setAttribute("data-open", "false");
  });
}
$$("[data-menu]").forEach((btn) => {
  const panel = $(`#${btn.getAttribute("aria-controls")}`);
  // A click or key opens the menu on purpose (menu_open); a pointer passing over it is counted apart, once a page.
  const set = (open, how) => {
    closeMenus(btn);
    btn.setAttribute("aria-expanded", String(open));
    panel.setAttribute("data-open", String(open));
    if (open && how === "hover") Analytics.track(`menu_hover:${btn.textContent.trim()}`, true);
    else if (open && how) Analytics.track(`menu_open:${btn.textContent.trim()}`);
  };
  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true", "click"));
  // Hover intent for pointer users; keyboard and touch use click.
  let timer;
  const item = btn.parentElement;
  item.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { clearTimeout(timer); timer = setTimeout(() => set(true, "hover"), 90); } });
  item.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { clearTimeout(timer); timer = setTimeout(() => set(false), 160); } });
  panel.addEventListener("keydown", (e) => {
    const links = $$("a", panel);
    const i = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); links[(i + 1) % links.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
  });
  btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); set(true, "key"); $("a", panel)?.focus(); } });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = $("[data-menu][aria-expanded=true]");
  if (open) { closeMenus(); open.focus(); }
  if ($("[data-drawer]")?.dataset.open === "true") closeDrawer();
});
document.addEventListener("click", (e) => { if (!e.target.closest(".nav__item")) closeMenus(); });
// Menus open under their item; one near the right edge is moved left just enough to stay 16px inside the window (even
// closed, a menu past the edge would widen the page).
const fitMenus = () => $$(".mega").forEach((m) => {
  m.style.left = "";
  const over = m.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
  if (over > 0) m.style.left = `${parseFloat(getComputedStyle(m).left) - over * K}px`;
});
let fitting = 0;
addEventListener("resize", () => { cancelAnimationFrame(fitting); fitting = requestAnimationFrame(fitMenus); }, { passive: true });
fitMenus();
document.fonts?.ready.then(fitMenus);
document.addEventListener("focusin", (e) => { if (!e.target.closest(".nav__item")) closeMenus(); });

// mobile drawer: modal dialog with focus trap and scroll lock
const drawerEl = $("[data-drawer]");
const openBtn = $("[data-drawer-open]");
function openDrawer() {
  drawerEl.dataset.open = "true";
  openBtn.setAttribute("aria-expanded", "true");
  document.documentElement.style.overflow = "hidden";
  setTimeout(() => $("[data-drawer-close]", drawerEl)?.focus(), 30);
}
function closeDrawer() {
  drawerEl.dataset.open = "false";
  openBtn.setAttribute("aria-expanded", "false");
  document.documentElement.style.overflow = "";
  openBtn.focus();
}
openBtn?.addEventListener("click", openDrawer);
$("[data-drawer-close]")?.addEventListener("click", closeDrawer);
drawerEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const f = $$("a,button", drawerEl).filter((x) => x.offsetParent !== null);
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
});
$$("[data-drawer-group]").forEach((b) => b.addEventListener("click", () => {
  const open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open));
  $(`#${b.getAttribute("aria-controls")}`).hidden = !open;
}));

// ------------------------------------------------------------------------------------------------ spotlight
// Rows and link cards light up where the pointer is (CSS reads --mx/--my). Pointer-only; nothing depends on it.
const SPOT = ".rel__item,.mega__item,.index-list a,.cx__item,.capi__row,.lib__row";
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest?.(SPOT);
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${(e.clientX - r.left) * K}px`);
  el.style.setProperty("--my", `${(e.clientY - r.top) * K}px`);
}, { passive: true });

// ------------------------------------------------------------------------------------------------ ambient light
// The environment's violet light leans a little toward the pointer: the page notices you. Mouse only, never with
// reduced motion, at most once per frame, and only by moving the light's own layer (a transform), so nothing repaints.
{
  const light = $(".env__light");
  if (light && !reduced.matches) {
    let pending = false, px = 0.5, py = 0.5;
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX / innerWidth; py = e.clientY / innerHeight;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        light.style.transform = `translate3d(${((px - 0.5) * 0.14 * innerWidth * K).toFixed(1)}px,${((py - 0.5) * 0.08 * innerHeight * K).toFixed(1)}px,0)`;
      });
    }, { passive: true });
  }
}
// ------------------------------------------------------------------------------------------------ chart readouts
// Build-time SVG charts mark their rows and bars with data-tip; pointing at one shows its exact value. The same values
// are already in each chart's description and the page's tables, so nothing depends on this.
{
  let tipEl = null;
  const show = (g, x, y) => {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "chart-tip"; tipEl.setAttribute("role", "status"); document.body.append(tipEl); }
    tipEl.textContent = g.getAttribute("data-tip");
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    x *= K; y *= K;
    tipEl.style.left = `${Math.min(innerWidth * K - w - 12, Math.max(12, x + 14))}px`;
    tipEl.style.top = `${Math.max(12, y - h - 12)}px`;
    tipEl.dataset.show = "true";
  };
  document.addEventListener("pointermove", (e) => {
    const g = e.target.closest?.("svg.chart [data-tip]");
    if (g) show(g, e.clientX, e.clientY);
    else if (tipEl?.dataset.show === "true") tipEl.dataset.show = "false";
  }, { passive: true });
  addEventListener("scroll", () => { if (tipEl) tipEl.dataset.show = "false"; }, { passive: true });
}

// ------------------------------------------------------------------------------------------------ reveal + counters
// Only elements that start below the fold are hidden (data-pending), so nothing above the fold ever flickers.
const counters = new WeakSet();
function countUp(el) {
  if (counters.has(el) || reduced.matches) return;
  counters.add(el);
  const final = el.textContent;
  const target = parseFloat(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const decimals = (el.dataset.count.split(".")[1] || "").length;
  const t0 = performance.now();
  const dur = 1100;
  const step = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / dur));
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = final.replace(/[\d,]+(\.\d+)?/, (target * eased).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
    if (k < 1) requestAnimationFrame(step); else el.textContent = final;
  };
  requestAnimationFrame(step);
}
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.removeAttribute("data-pending");
    $$("[data-count]", en.target).forEach(countUp);
    if (en.target.matches("[data-count]")) countUp(en.target);
    revealIO.unobserve(en.target);
  });
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
$$("[data-reveal]").forEach((el) => {
  if (!reduced.matches && el.getBoundingClientRect().top > innerHeight * 0.92) el.setAttribute("data-pending", "");
  revealIO.observe(el);
});
$$("[data-count]").forEach((el) => { if (!el.closest("[data-reveal]")) revealIO.observe(el); });

// ------------------------------------------------------------------------------------------------ flow stages (tabs)
$$("[data-flow]").forEach((block) => {
  const tabs = $$("[role=tab]", block);
  const panels = $$("[role=tabpanel]", block);
  panels.forEach((p, i) => { p.hidden = i !== 0; p.removeAttribute("data-flow-hidden"); });
  const select = (i, focus) => {
    tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(i === j)); t.tabIndex = i === j ? 0 : -1; });
    panels.forEach((p, j) => { p.hidden = i !== j; });
    if (focus) tabs[i].focus();
    block.dispatchEvent(new CustomEvent("flowchange", { detail: { index: i }, bubbles: true }));
    Analytics.track(`flow_stage:${tabs[i].textContent.trim().slice(2)}`);
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(i));
    t.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select((next + tabs.length) % tabs.length, true);
    });
  });
});

// ------------------------------------------------------------------------------------------------ section rail
const rail = $("[data-rail]");
if (rail) {
  const links = $$("a", rail);
  const targets = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  const railIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.setAttribute("aria-current", String(a.getAttribute("href") === `#${en.target.id}`)));
    });
  }, { rootMargin: "-35% 0px -60% 0px" });
  targets.forEach((t) => railIO.observe(t));
}

// ------------------------------------------------------------------------------------------------ lazy visualisations
// Each explanatory visual loads only when it approaches the viewport, pauses offscreen and in hidden tabs, and falls
// back to its HTML description (already in the page) if the module or canvas is unavailable.
async function mountViz(el) {
  if (el.dataset.loaded) return;
  el.dataset.loaded = "1";
  const file = ASSETS[`viz-${el.dataset.viz}.js`];
  if (!file) return;
  try {
    const mod = await import(file);
    el._viz = mod.mount(el, { reduced: reduced.matches, track: Analytics.track });
    el.classList.add("is-live");
    const hint = $("[data-viz-hint]", el);
    if (hint) el.addEventListener("pointerdown", () => hint.setAttribute("data-used", ""), { once: true });
  } catch (err) {
    el.dataset.failed = "1";
  }
}
const vizIO = new IntersectionObserver((entries) => {
  entries.forEach(async (en) => {
    const el = en.target;
    if (en.isIntersecting) await mountViz(el);
    el._viz?.visible?.(en.isIntersecting);
  });
}, { rootMargin: "300px 0px" });
$$("[data-viz]").forEach((el) => vizIO.observe(el));
document.addEventListener("visibilitychange", () => {
  // same 300 px margin as vizIO above: a stricter test would pause a visual the observer still counts as intersecting,
  // and it would never fire again to restart it
  $$("[data-viz]").forEach((el) => { const r = el.getBoundingClientRect(); el._viz?.visible?.(document.visibilityState === "visible" && r.bottom > -300 && r.top < innerHeight + 300); });
});


// ------------------------------------------------------------------------------------------------ hover prefetch (same-origin HTML)
// Speculation Rules already cover many navigations; this fills older browsers and careful eagerness=conservative gaps.
(function hoverPrefetch() {
  const seen = new Set();
  const ok = (a) => {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
    let u;
    try { u = new URL(a.href, location.href); } catch { return null; }
    if (u.origin !== location.origin) return null;
    if (u.pathname.startsWith("/shared/")) return null;
    if (u.pathname === location.pathname && u.search === location.search) return null;
    return u.href.split("#")[0];
  };
  const go = (href) => {
    if (!href || seen.has(href) || seen.size > 24) return;
    seen.add(href);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.as = "document";
    document.head.appendChild(link);
  };
  document.addEventListener("pointerover", (e) => {
    const a = e.target?.closest?.("a[href]");
    const href = ok(a);
    if (href) go(href);
  }, { passive: true });
})();

// ------------------------------------------------------------------------------------------------ enquiry form
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// Written enquiries go to the Xevrion backend (POST /v1/public/briefs on api.xevrion.co.uk). The endpoint accepts
// exactly these fields and nothing else, is idempotent on submission_id, rate-limited and returns a reference.
$$("[data-brief-form]").forEach((form) => {
  const status = $(".form__status", form);
  const submit = $("button[type=submit]", form);
  let submissionId = uuid();
  let started = false;
  form.addEventListener("focusin", () => { if (!started) { started = true; Analytics.track(`form_start:${form.dataset.source}`); } });
  const rules = {
    name: (v) => v.trim().length >= 2,
    email: (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v.trim()),
    company: (v) => v.trim().length >= 2,
    service: (v) => v !== "",
    brief: (v) => v.trim().length >= 20,
  };
  const validate = (input) => {
    const rule = rules[input.name];
    if (!rule) return true;
    const ok = rule(input.value);
    const field = input.closest(".field");
    field.dataset.invalid = String(!ok);
    input.setAttribute("aria-invalid", String(!ok));
    const err = $(".error", field);
    if (err) { err.id ||= `${input.id}-err`; input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), err.id].filter(Boolean).join(" ")); }
    return ok;
  };
  Object.keys(rules).forEach((n) => {
    const input = form.elements[n];
    input?.addEventListener("blur", () => { if (input.value) validate(input); });
    input?.addEventListener("input", () => { if (input.closest(".field").dataset.invalid === "true") validate(input); });
  });
  // An unchanged retry keeps its id, so a request that did reach us cannot be recorded twice; an edit after an
  // attempt is a different request and gets a new id (the server refuses one id with two different payloads).
  let attempted = false;
  form.addEventListener("input", () => { if (attempted) { submissionId = uuid(); attempted = false; } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inputs = Object.keys(rules).map((n) => form.elements[n]);
    const bad = inputs.filter((i) => !validate(i));
    const consent = form.elements.consent;
    $("[data-consent-error]", form).hidden = consent.checked;
    if (bad.length || !consent.checked) {
      (bad[0] || consent).focus();
      Analytics.track(`form_error:${form.dataset.source}`);
      return;
    }
    if (!LIVE) {
      status.className = "form__status form__status--error";
      status.textContent = "Preview: not sent. Enquiries are sent only from the live Xevrion websites.";
      status.hidden = false;
      return;
    }
    submit.disabled = true;
    attempted = true;
    const label = submit.textContent;
    submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending';
    const val = (n) => (form.elements[n]?.value || "").trim();
    const data = {
      submission_id: submissionId, name: val("name"), email: val("email"), company: val("company"),
      service: val("service"), brief: val("brief"), outcome: val("outcome"), consent: true, website: form.elements.website.value,
    };
    try {
      const res = await fetch(`${API}/v1/public/briefs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "omit" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(typeof body.detail === "string" ? body.detail : "unavailable"), { status: res.status });
      status.className = "form__status form__status--ok";
      status.innerHTML = `<strong>Thank you, ${escapeHtml(data.name.split(" ")[0])}.</strong> Your reference is <span class="mono">${escapeHtml(body.reference || "received")}</span>. We reply in writing to ${escapeHtml(data.email)}, from outreach@ops.xevrion.co.uk.`;
      status.hidden = false;
      $$(".field, .check, button[type=submit]", form).forEach((el) => { el.hidden = true; });
      Analytics.track(`form_complete:${form.dataset.source}`);
      Analytics.flush();
      status.focus?.();
    } catch (err) {
      submit.disabled = false;
      submit.textContent = label;
      const busy = err.status === 429;
      const msg = busy ? "We have received a lot of requests from your network. Please try again in a few minutes." :
        "We could not send your request just now.";
      status.className = "form__status form__status--error";
      status.innerHTML = `${msg} You can also email <a class="link" href="mailto:outreach@ops.xevrion.co.uk?subject=${encodeURIComponent("Enquiry: " + data.company)}">outreach@ops.xevrion.co.uk</a> and we will reply in writing.`;
      status.hidden = false;
      Analytics.track(`form_failure:${err.status || "network"}`);
    }
  });
});
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ------------------------------------------------------------------------------------------------ create an account
// /get-started opens on the account form: name, work email and password (POST /v1/public/saas/signup on
// api.xevrion.co.uk, the same call the app makes), then the emailed code (POST /v1/public/saas/verify-email/{code}).
// The plan is not asked for: every job is in the trial and the plan is chosen later, before the first invoice. A plan
// picked on the pricing page (?plan=growth&cycle=annual) is carried to the app as a preference only. Once the email is
// checked, "Sign in and start my trial" opens the app's sign-in (/app?trial=1#signin), and the trial starts as soon as
// the business is named. Nothing typed is kept in the browser; the password is sent once, over HTTPS, to the API.
const SIGNUP_PLANS = { start: "Start", growth: "Growth", scale: "Scale" };
// Another customer's referral link (/get-started?ref=CODE): the code as the platform stores it (10 characters, A-Z and
// 2-7; spaces, dashes and lower case are tidied), or "" when it cannot be one. The platform checks it again and ignores
// an unknown code, so a bad link never stops a sign-up. Who sent the link is never shown here.
function referralCode(search) {
  const raw = String(new URLSearchParams(search || "").get("ref") || "");
  const code = raw.length <= 40 ? raw.replace(/[\s-]+/g, "").toUpperCase() : "";
  return /^[A-Z2-7]{10}$/.test(code) ? code : "";
}
// The free-check report a visitor came from: /get-started?source=check#report=CODE ("Start free trial to fix these" on
// /check). Read from after "#", so it never reaches a server log; sent once with the sign-up so the new workspace's
// setup starts from that report's fixes. "" when there is none or it cannot be a report code.
function reportCode(hash) {
  let raw = "";
  try { raw = decodeURIComponent(String(hash || "").replace(/^#/, "")); } catch { return ""; }
  const m = /^report=([A-Za-z0-9_-]{32})$/.exec(raw);
  return m ? m[1] : "";
}
function signupAppLink(search) {
  const q = new URLSearchParams(search || "");
  const plan = String(q.get("plan") || "").toLowerCase(), cycle = String(q.get("cycle") || "").toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(SIGNUP_PLANS, plan);
  const parts = [known ? `plan=${plan}` : "", known && (cycle === "annual" || cycle === "monthly") ? `cycle=${cycle}` : "", "trial=1"].filter(Boolean);
  return { href: `${API}/app?${parts.join("&")}#signin`, plan: known ? SIGNUP_PLANS[plan] : "" };
}
$$("[data-signup-form]").forEach((form) => {
  const status = $(".form__status", form);
  const step = (name) => $$("[data-step]", form).forEach((s) => { s.hidden = s.dataset.step !== name; });
  const say = (cls, html) => { status.className = `form__status form__status--${cls}`; status.innerHTML = html; status.hidden = !html; };
  const link = signupAppLink(location.search);
  $$("[data-signin]", form).forEach((a) => { a.href = link.href; });
  const pref = $("[data-plan-pref]", form);
  if (pref && link.plan) { pref.textContent = `You looked at the ${link.plan} plan. You can choose any plan later, before your first invoice.`; pref.hidden = false; }
  $("[data-password-toggle]", form)?.addEventListener("click", (event) => {
    const button=event.currentTarget, input=form.elements.password;
    const show=input.type === "password";input.type=show?"text":"password";
    button.textContent=show?"Hide password":"Show password";button.setAttribute("aria-pressed",String(show));
  });
  let started=false;
  form.addEventListener("input",()=>{if(!started){started=true;Analytics.track("signup_started");}});
  const ref = referralCode(location.search);
  if (ref && form.elements.ref) {
    form.elements.ref.value = ref;                                // kept in the form until the account is created
    const note = $("[data-ref-note]", form);
    if (note) note.hidden = false;
  }
  const rules = {
    name: (v) => v.trim().length >= 2 && v.trim().length <= 160,
    email: (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v.trim()) && v.trim().length <= 320,
    password: (v) => v.length >= 12 && v.length <= 256,
    code: (v) => v.trim().length >= 4 && v.trim().length <= 200,
  };
  const mark = (input) => {
    const ok = rules[input.name](input.value);
    const field = input.closest(".field");
    field.dataset.invalid = String(!ok);
    input.setAttribute("aria-invalid", String(!ok));
    const err = $(".error", field);
    if (err) { err.id ||= `${input.id}-err`; input.setAttribute("aria-describedby", [field.querySelector(".hint")?.id, !ok?err.id:null].filter(Boolean).join(" ")); }
    return ok;
  };
  Object.keys(rules).forEach((n) => form.elements[n]?.addEventListener("blur", () => { if (form.elements[n].value) mark(form.elements[n]); }));
  const busy = (button, text) => { const label = button.textContent; button.disabled = true; button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(text)}`; return () => { button.disabled = false; button.textContent = label; }; };
  const call = async (path, data) => {
    const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), credentials: "omit" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(typeof body.detail === "string" ? body.detail : "unavailable"), { status: res.status });
    return body;
  };
  const failure = (err, what) => (err.status === 429 ? "There have been a lot of attempts from your network. Please wait a few minutes and try again."
    : err.status === 404 && what === "code" ? "That code is not right or has run out. Check the newest email from us, or send a new code."
    : err.status === 422 ? "Please check each box: your name, a work email and a password of at least 12 characters."
    : `We could not ${what === "code" ? "check your code" : "create your account"} just now. Please try again in a minute.`);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const now = $$("[data-step]", form).find((s) => !s.hidden)?.dataset.step || "account";
    if (now === "account") {
      const inputs = ["name", "email", "password"].map((n) => form.elements[n]);
      const bad = inputs.filter((i) => !mark(i));
      if (bad.length) { bad[0].focus(); Analytics.track("signup_error:invalid"); return; }
      Funnel.send("signup_started");
      if (!LIVE) { say("error", "Preview: no account was created. Accounts are created only on xevrion.co.uk."); return; }
      const done = busy($("[data-step=account] button[type=submit]", form), "Creating your account");
      try {
        const refCode = form.elements.ref ? String(form.elements.ref.value || "") : "";
        const report = reportCode(location.hash);
        await call("/v1/public/saas/signup", { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), password: form.elements.password.value,
          source: refCode ? "referral" : Funnel.source, ...(refCode ? { ref: refCode } : {}), ...(report ? { report_code: report } : {}) });
        form.elements.password.value = "";
        $$("[data-email]", form).forEach((x) => { x.textContent = form.elements.email.value.trim(); });
        say("", ""); step("code"); form.elements.code.focus();
        Analytics.track("signup_sent");
      } catch (err) { say("error", escapeHtml(failure(err, "account"))); Analytics.track(`signup_failure:${err.status || "network"}`); }
      finally { done(); }
      return;
    }
    if (now === "code") {
      const code = form.elements.code;
      if (!mark(code)) { code.focus(); return; }
      if (!LIVE) { say("error", "Preview: codes are checked only on xevrion.co.uk."); return; }
      const done = busy($("[data-step=code] button[type=submit]", form), "Checking");
      try {
        await call(`/v1/public/saas/verify-email/${encodeURIComponent(code.value.trim())}`);
        say("", ""); step("done"); $("[data-signin]", form)?.focus();
        Analytics.track("signup_verified");
      } catch (err) { say("error", escapeHtml(failure(err, "code"))); }
      finally { done(); }
    }
  });
  $("[data-resend]", form)?.addEventListener("click", async () => {
    if (!LIVE) { say("error", "Preview: no code was sent."); return; }
    try {
      await call("/v1/public/saas/verify-email/resend", { email: form.elements.email.value.trim() });
      say("ok", "If your account is waiting for its code, a new one is on its way. Use the newest email.");
    } catch (err) { say("error", escapeHtml(failure(err, "code"))); }
  });
});

// ------------------------------------------------------------------------------------------------ waiting lists
// POST /v1/public/waitlist: one place per email and list. Joining again keeps the first place and says so.
$$("[data-waitlist]").forEach((form) => {
  const status = $(".form__status", form);
  const submit = $("button[type=submit]", form);
  const product = form.dataset.waitlist;
  const email = form.elements.email;
  const okEmail = () => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email.value.trim());
  const mark = (input, ok) => { const f = input.closest(".field"); f.dataset.invalid = String(!ok); input.setAttribute("aria-invalid", String(!ok)); };
  email.addEventListener("blur", () => { if (email.value) mark(email, okEmail()); });
  const say = (cls, html) => { status.className = `form__status form__status--${cls}`; status.innerHTML = html; status.hidden = false; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const detail = form.elements.detail;
    const bad = [!okEmail() && email, detail && !detail.value.trim() && detail].filter(Boolean);
    bad.forEach((i) => mark(i, false));
    $("[data-consent-error]", form).hidden = form.elements.consent.checked;
    if (bad.length || !form.elements.consent.checked) { (bad[0] || form.elements.consent).focus(); return; }
    if (!LIVE) { say("error", "Preview: not sent. The waiting list is joined only from the live Xevrion websites."); return; }
    const v = (n) => (form.elements[n]?.value || "").trim();
    const data = { product, email: v("email"), name: v("name"), company: v("company"), size: v("size"), interest: v("interest"), detail: v("detail"), consent: true, website: form.elements.website.value };
    submit.disabled = true;
    const label = submit.textContent;
    submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Joining';
    try {
      const res = await fetch(`${API}/v1/public/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "omit" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error("unavailable"), { status: res.status });
      const again = body.status === "already_on_the_list";
      say("ok", `<strong>${again ? "You are already on the list" : "You are on the list"}: number ${escapeHtml(body.position)}.</strong> We write once to ${escapeHtml(data.email)} when it opens.`);
      $$(".field, .form__row, .check, button[type=submit]", form).forEach((el) => { el.hidden = true; });
      Analytics.track(`waitlist_join:${product}`);
      status.focus?.();
    } catch (err) {
      submit.disabled = false; submit.textContent = label;
      say("error", err.status === 429 ? "A lot of requests came from your network. Please try again in a few minutes." : "We could not add you just now. Please try again in a minute.");
    }
  });
});

// ------------------------------------------------------------------------------------------------ free checks
// The workplace check (/check, /check/r) and the email domain check live in check.js: only pages that show one load it,
// and they preload it (xw/shell.py), so it arrives with this file. If it cannot load, the page keeps its plain HTML.
if (ASSETS["check.js"] && $("[data-workplace-check], [data-wk-report], [data-domain-check]")) {
  import(ASSETS["check.js"]).then((mod) => mod.init({ API, Analytics, Funnel, LIVE, escapeHtml, $, $$ })).catch(() => {});
}
// /start (the one-click trial link from an outreach reply) lives in start.js, loaded and preloaded only there.
if (ASSETS["start.js"] && $("[data-invite]")) {
  import(ASSETS["start.js"]).then((mod) => mod.init({ API, Analytics, LIVE, escapeHtml, $, $$ })).catch(() => {
    const box = $("[data-invite]"), status = box && $(".form__status", box);
    if (!box || !status) return;
    box.dataset.state = "failed";
    status.className = "form__status form__status--error";
    status.innerHTML = 'This page could not load. Reload it, or <a class="link" href="/get-started">create your account here</a>.';
    status.hidden = false;
  });
}
// Arrivals from an outreach email (/start, /check/r): arrive.js shows the header and steps for the service the email
// was about (utm_content). If it cannot load, the page simply keeps its general copy.
if (ASSETS["arrive.js"] && $("[data-arrival]")) {
  import(ASSETS["arrive.js"]).then((mod) => mod.init({ Analytics, $, $$ })).catch(() => {});
}
// The free tools (/tools/...): the late payment interest calculator and the template copy buttons. Without the module
// the calculator's method and every template stay on the page as plain text.
if (ASSETS["freetools.js"] && $("[data-late-calc], [data-copy-group]")) {
  import(ASSETS["freetools.js"]).then((mod) => mod.init({ Analytics, $, $$ })).catch(() => {});
}
// What customers say (proof.js): asks GET /v1/public/proof on the production site and fills the hidden [data-proof]
// boxes only with real, permitted quotes. A failure, a 2.5-second timeout or no quotes leave them hidden and empty.
if (ASSETS["proof.js"] && $("[data-proof]")) {
  import(ASSETS["proof.js"]).then((mod) => mod.init({ API, LIVE, $$ })).catch(() => {});
}

// ------------------------------------------------------------------------------------------------ founding customers
// The offer line (xw/conversion.py) prints the offer but never the number of places left: that comes from
// GET /v1/public/founding -> {places_total, places_left, ends_after_invoices}. The count shows only for a valid answer
// on the production site; a failure, a timeout or a preview build leaves the line without a count, and an offer with no
// places left hides the line. A guessed number is never shown.
{
  const bands = $$("[data-founding]");
  const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (bands.length && LIVE) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : 0;
    fetch(`${API}/v1/public/founding`, { method: "GET", mode: "cors", credentials: "omit", ...(ctl ? { signal: ctl.signal } : {}) })
      .then((res) => (res && res.ok ? res.json() : null))
      .then((f) => {
        if (!f || !whole(f.places_total, 1, 1000) || !whole(f.places_left, 0, f.places_total)) return;
        bands.forEach((band) => {
          if (f.places_left === 0) { band.hidden = true; return; }
          const total = $("[data-founding-total]", band), invoices = $("[data-founding-invoices]", band);
          if (total) total.textContent = String(f.places_total);
          if (invoices && whole(f.ends_after_invoices, 1, 120)) invoices.textContent = String(f.ends_after_invoices);
          const n = $("[data-founding-n]", band), word = $("[data-founding-word]", band), left = $("[data-founding-left]", band);
          if (!n || !left) return;
          n.textContent = String(f.places_left);
          if (word) word.textContent = f.places_left === 1 ? "place" : "places";
          left.hidden = false;
        });
      })
      .catch(() => { /* no count: the offer line stays as printed */ })
      .finally(() => clearTimeout(timer));
  }
}

// ------------------------------------------------------------------------------------------------ app directory
// The status buttons light up the apps with that status; pressing the same one again shows them all.
$$("[data-apps]").forEach((box) => {
  const keys = $$("[data-ad-filter]", box);
  keys.forEach((k) => k.addEventListener("click", () => {
    const on = box.dataset.filter !== k.dataset.adFilter;
    if (on) box.dataset.filter = k.dataset.adFilter; else delete box.dataset.filter;
    keys.forEach((x) => x.setAttribute("aria-pressed", String(on && x === k)));
    if (on) Analytics.track(`apps_filter:${k.dataset.adFilter}`);
  }));
});

// ------------------------------------------------------------------------------------------------ security posture map
// Hover, focus or click a node to read the question it answers; until someone does, the map walks through them.
$$("[data-posture]").forEach((fig) => {
  const nodes = $$("[data-pm]", fig), panels = $$("[data-pm-panel]", fig);
  let cur = 0, timer = null;
  const show = (i) => {
    cur = i;
    nodes.forEach((n) => n.classList.toggle("is-on", +n.dataset.pm === i));
    panels.forEach((p) => { p.hidden = +p.dataset.pmPanel !== i; });
  };
  const stop = () => { clearInterval(timer); timer = null; };
  nodes.forEach((n) => {
    const go = () => { stop(); show(+n.dataset.pm); };
    n.addEventListener("mouseenter", go); n.addEventListener("focus", go); n.addEventListener("click", go);
    n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  show(0);
  if (!reduced.matches) {
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !timer && !fig.dataset.touched) timer = setInterval(() => show((cur + 1) % nodes.length), 3200);
      else if (!en.isIntersecting) stop();
    });
    io.observe(fig);
    fig.addEventListener("pointerenter", () => { fig.dataset.touched = "1"; stop(); });
  }
  document.addEventListener("xev:domain", (e) => {
    const r = e.detail, p = panels[0];
    if (!p || !r.exists) return;
    $(".pm__you", p)?.remove();
    p.insertAdjacentHTML("beforeend", `<p class="pm__you"><b>${escapeHtml(r.domain)}</b>: grade ${escapeHtml(r.grade)}, ${r.score} out of 100.</p>`);
    stop(); show(0);
  });
});

// ------------------------------------------------------------------------------------------------ price view (monthly / yearly)
// Pricing and Get started print both views of every plan; this switch shows one and points each plan's button at the
// matching sign-up link (the yearly one carries cycle=annual, which the app preselects in Billing).
$$("[data-billing-toggle]").forEach((bar) => {
  const scope = bar.closest("[data-billing]");
  if (!scope) return;
  bar.hidden = false;
  const set = (cycle) => {
    scope.dataset.billing = cycle;
    $$("[data-cycle-set]", bar).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cycleSet === cycle)));
    $$("[data-href-annual]", scope).forEach((a) => { a.href = cycle === "annual" ? a.dataset.hrefAnnual : a.dataset.hrefMonthly; });
  };
  // the visitor's choice carries to the next price page in this visit (sessionStorage: kept until the tab closes, never sent)
  let saved = ""; try { saved = sessionStorage.getItem("xw.cycle") || ""; } catch (e) { /* storage blocked */ }
  if (saved === "annual" || saved === "monthly") set(saved);
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-cycle-set]"); if (!b) return; set(b.dataset.cycleSet); try { sessionStorage.setItem("xw.cycle", b.dataset.cycleSet); } catch (err) { /* storage blocked */ } });
});

// ------------------------------------------------------------------------------------------------ sticky start button (phones)
// Appears once the page's own first buttons have scrolled out of view; steps aside while a closing call to action or
// the footer is on screen, while the menu is open and while someone is typing in a form. The x closes it for this page.
// CSS shows it only on narrow screens; off screen it is inert, so it is never reached by the keyboard while unseen.
{
  const bar = $("[data-sticky-cta]");
  if (bar && "IntersectionObserver" in window) {
    bar.hidden = false;
    let closed = false, past = false, atEnd = false, typing = false;
    const render = () => {
      const show = !closed && past && !atEnd && !typing && drawerEl?.dataset.open !== "true";
      bar.dataset.show = String(show);
      bar.inert = !show;
      if (show && getComputedStyle(bar).display !== "none") Analytics.track("sticky_shown", true);
    };
    const first = $("main .hero__cta") || $("main .btn--primary");
    if (first) {
      new IntersectionObserver((entries) => {           // the newest entry wins when a fast scroll batches several
        const en = entries[entries.length - 1];
        past = !en.isIntersecting && en.boundingClientRect.top < 0; render();
      }).observe(first);
    } else {
      const check = () => { const p = scrollY > innerHeight * 0.8; if (p !== past) { past = p; render(); } };
      addEventListener("scroll", check, { passive: true });
    }
    const seen = new Set();
    const endIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
      atEnd = seen.size > 0; render();
    });
    $$("[data-cta-end], .footer").forEach((el) => endIO.observe(el));
    document.addEventListener("focusin", (e) => { if (e.target.closest("input,textarea,select")) { typing = true; render(); } });
    document.addEventListener("focusout", (e) => { if (e.target.closest("input,textarea,select")) { typing = false; render(); } });
    $("[data-sticky-close]", bar)?.addEventListener("click", () => { closed = true; render(); Analytics.track("sticky_close"); });
    openBtn?.addEventListener("click", () => setTimeout(render, 0));
    $("[data-drawer-close]")?.addEventListener("click", () => setTimeout(render, 0));
    render();
  }
}

// ------------------------------------------------------------------------------------------------ page speed, as visitors see it
// The largest paint, layout shift and slowest response to a tap or click, each sent once per page as a band (good,
// ok or poor, by Google's Core Web Vitals thresholds), so speed can be read against the start rate. Bands only: no
// timings, nothing per visitor. Browsers without these measurements send nothing.
{
  const band = (v, good, poor) => (v <= good ? "good" : v <= poor ? "ok" : "poor");
  let lcp = 0, cls = 0, inp = 0, sent = false;
  const watch = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { /* unsupported */ } };
  watch("largest-contentful-paint", (e) => { lcp = e.startTime; });
  watch("layout-shift", (e) => { if (!e.hadRecentInput) cls += e.value; });
  watch("event", (e) => { if (e.interactionId) inp = Math.max(inp, e.duration); }, { durationThreshold: 40 });
  addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || sent) return;
    sent = true;
    if (lcp) Analytics.track(`vital:lcp ${band(lcp, 2500, 4000)}`);
    Analytics.track(`vital:cls ${band(cls, 0.1, 0.25)}`);
    if (inp) Analytics.track(`vital:inp ${band(inp, 200, 500)}`);
    Analytics.flush();
  });
}

// ------------------------------------------------------------------------------------------------ analytics opt-out control (cookies page)
$$("[data-analytics-toggle]").forEach((btn) => {
  const render = () => {
    let off = false;
    try { off = localStorage.getItem("xev_analytics_off") === "1"; } catch { /* storage blocked */ }
    btn.textContent = off ? "Turn usage measurement back on" : "Turn off usage measurement";
    $("[data-analytics-state]").textContent = off || Analytics.off() ? "Off in this browser." : "On (cookieless, no identifiers).";
  };
  btn.addEventListener("click", () => {
    try {
      const off = localStorage.getItem("xev_analytics_off") === "1";
      if (off) localStorage.removeItem("xev_analytics_off"); else { localStorage.setItem("xev_analytics_off", "1"); sessionStorage.removeItem("xev_src"); }
    } catch { /* storage blocked: measurement cannot persist either */ }
    render();
  });
  render();
});

// ------------------------------------------------------------------------------------------------ live status (status page)
// GET /ready on the API: the gateway probes every service behind it (the platform services, the four product engines
// and its database) and answers 200 "ready" or 503 "degraded" with each dependency's state. Only plain names are shown.
const SERVICE_NAMES = {
  bdk: "Business data", aac: "Automation control", csm: "Customer service", iac: "Integrations and email", gsr: "Security and reliability",
  fp: "Finance and billing", qao: "Quality and analytics", exec: "Executive control", customer_operations: "Customers",
  business_operations: "Automations", business_intelligence: "Insights", database: "Platform database",
};
$$("[data-live-status]").forEach(async (el) => {
  const set = (state, text) => { el.dataset.state = state; $("[data-status-text]", el).textContent = text; };
  if (!LIVE) { set("unknown", "Preview build: the live check runs on xevrion.co.uk."); return; }
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${API}/ready`, { credentials: "omit", cache: "no-store", signal: ctl.signal });
    const ms = Math.round(performance.now() - t0);
    const body = await res.json().catch(() => ({}));
    const deps = body && body.dependencies && typeof body.dependencies === "object" ? body.dependencies : {};
    const total = Object.keys(deps).length;
    const down = [...new Set(Object.entries(deps).filter(([, v]) => v !== "ok").map(([k]) => SERVICE_NAMES[k] || "An internal service"))];
    if (res.ok && body.status === "ready") set("ok", `Operational. All ${total} platform services answered, checked from your browser in ${ms} ms.`);
    else if (body.status === "degraded" && down.length) set("risk", `Degraded. Not answering right now: ${down.join(", ")}. We are looking at it.`);
    else set("risk", "The platform responded but reported a problem. We are looking at it.");
  } catch {
    set("unknown", "We could not reach the platform from your browser. This can be your network; the check runs again when you reload.");
  } finally {
    clearTimeout(timer);
  }
});

// ------------------------------------------------------------------------------------------------ product tour (tabs over screenshots)
$$("[data-tour]").forEach((tour) => {
  const tabs = $$("[data-tour-i]", tour), panes = $$("[data-tour-p]", tour);
  const show = (i, focus) => { tabs.forEach((t, k) => t.setAttribute("aria-selected", String(k === i))); panes.forEach((p, k) => { p.hidden = k !== i; });
    if (focus) tabs[i].focus(); track("tour_tab:" + i); };
  tour.addEventListener("click", (e) => { const b = e.target.closest("[data-tour-i]"); if (b) show(+b.dataset.tourI); });
  tour.addEventListener("keydown", (e) => { const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show((i + 1) % tabs.length, true); } if (e.key === "ArrowLeft") { e.preventDefault(); show((i - 1 + tabs.length) % tabs.length, true); } });
});

// ------------------------------------------------------------------------------------------------ status in the footer
// The footer's "System status" link shows the platform's state with a dot: checked once, only when the footer comes
// into view and only on the production sites (the same GET /ready as the status page). Without it, it stays a link.
$$("[data-status-pill]").forEach((el) => {
  if (!LIVE || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(async (es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const show = (ok) => { el.dataset.state = ok ? "ok" : "risk"; $("[data-status-pill-text]", el).textContent = ok ? "All systems working" : "Some services degraded"; };
    // one check per five minutes of a visit, however many pages are opened (each check probes every service)
    let seen = null; try { seen = JSON.parse(sessionStorage.getItem("xw.ready") || "null"); } catch { /* storage blocked */ }
    if (seen && Date.now() - seen.t < 300000) return show(seen.ok);
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(`${API}/ready`, { credentials: "omit", cache: "no-store", signal: ctl.signal });
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body.status === "ready";
      show(ok); try { sessionStorage.setItem("xw.ready", JSON.stringify({ t: Date.now(), ok })); } catch { /* storage blocked */ }
    } catch { /* unreachable from here: the link still leads to the status page */ } finally { clearTimeout(timer); }
  }, { rootMargin: "200px" });
  io.observe(el);
});

// ------------------------------------------------------------------------------------------------ command palette
// Ctrl/Cmd+K, "/" or any [data-palette-open] button. The module and its search index load only on first use.
let palette = null;
async function openPalette() {
  if (!palette) {
    const mod = await import(ASSETS["viz-palette.js"]);
    // Xevrion Ops and the portal share one index
    palette = mod.mount(null, { track: Analytics.track, indexUrl: ASSETS["search.json"] });
  }
  $("[data-drawer-close]")?.closest("[data-open=true]") && $("[data-drawer-close]").click();
  palette.open();
}
document.addEventListener("keydown", (e) => {
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openPalette(); }
  else if (e.key === "/" && !e.target.closest("input,textarea,select,[contenteditable=true]")) { e.preventDefault(); openPalette(); }
});
$$("[data-palette-open]").forEach((b) => b.addEventListener("click", openPalette));

// ------------------------------------------------------------------------------------------------ portal example, full screen
// The browser's own full screen where it is allowed; otherwise the frame fills the window. Esc (or the button) returns.
$$("[data-portal-frame]").forEach((fig) => {
  const btn = $("[data-portal-full]", fig);
  if (!btn) return;
  const label = $("span", btn);
  // A transformed ancestor would trap position:fixed, so the frame moves to <body> while it is full and back after.
  const spot = document.createComment("portal-frame");
  const set = (on) => {
    if (on && fig.parentNode !== document.body) { fig.parentNode.insertBefore(spot, fig); document.body.appendChild(fig); }
    if (on) $$("[data-viz]", fig).forEach((el) => mountViz(el).then(() => el._viz?.visible?.(true)));   // full screen before it scrolled into view
    if (!on && spot.parentNode) spot.parentNode.replaceChild(fig, spot);
    fig.classList.toggle("is-full", on);
    document.documentElement.classList.toggle("portal-full-open", on);
    btn.setAttribute("aria-pressed", String(on));
    label.textContent = on ? "Exit full screen" : "Full screen";
    dispatchEvent(new Event("resize"));
  };
  const native = () => document.fullscreenElement === fig;
  btn.addEventListener("click", async () => {
    const on = !fig.classList.contains("is-full");
    if (on) {
      set(true);   // move first: moving an element out of the page would end its full screen
      try { if (fig.requestFullscreen) await fig.requestFullscreen({ navigationUI: "hide" }); } catch { /* not allowed: it already fills the window */ }
    } else {
      if (native()) await document.exitFullscreen().catch(() => {});
      set(false);
    }
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && fig.classList.contains("is-full")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && fig.classList.contains("is-full") && !native()) set(false); });
});

// ------------------------------------------------------------------------------------------------ mission objectives
// The ring and the ledger are one control: selecting either opens the same objective. Until someone does, it walks.
$$("[data-mission]").forEach((box) => {
  const segs = $$("[data-ms]", box), rows = $$("[data-ms-row]", box);
  let cur = 0, timer = null;
  const show = (i) => { cur = i; segs.forEach((s) => s.classList.toggle("is-on", +s.dataset.ms === i)); rows.forEach((r) => r.classList.toggle("is-on", +r.dataset.msRow === i)); };
  const hold = (i) => { clearInterval(timer); timer = null; show(i); };
  segs.forEach((s) => { const go = () => hold(+s.dataset.ms); s.addEventListener("click", go); s.addEventListener("mouseenter", go); s.addEventListener("focus", go);
    s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }); });
  rows.forEach((r) => r.addEventListener("mouseenter", () => hold(+r.dataset.msRow)));
  show(0);
  if (!reduced.matches) new IntersectionObserver(([en]) => { if (en.isIntersecting && !timer && !box.dataset.held) timer = setInterval(() => show((cur + 1) % segs.length), 2800); else if (!en.isIntersecting) { clearInterval(timer); timer = null; } }).observe(box);
  box.addEventListener("pointerenter", () => { box.dataset.held = "1"; });
});

// ------------------------------------------------------------------------------------------------ pointer-lit edges (v3)
// Framed surfaces catch the light where the pointer is: an <i class="edge"> ring masked by a radial gradient at the
// pointer (refine.css). One listener for the page, one write of two custom properties per frame, mouse only.
if (matchMedia("(hover:hover) and (pointer:fine)").matches && !reduced.matches) {
  const EDGE = ".xh,.oz-win,.price-card,.plan,.orient a,.ctrl li,.figs li,.clog li,.glass,.sw__kpi,.xw,.xcd,.xbn__c";
  const lit = new Set();
  const prep = (el) => {
    if (el._edge) return el._edge;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const i = document.createElement("i"); i.className = "edge"; i.setAttribute("aria-hidden", "true"); el.append(i); el._edge = i; return i;
  };
  let pending = null;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    if (!pending) requestAnimationFrame(() => {
      const ev = pending; pending = null;
      const hit = ev.target.closest?.(EDGE);
      lit.forEach((el) => { if (el !== hit) { el.removeAttribute("data-lit"); lit.delete(el); } });
      if (!hit) return;
      prep(hit);
      const r = hit.getBoundingClientRect();
      hit.style.setProperty("--ex", `${((ev.clientX - r.left) / r.width) * 100}%`);
      hit.style.setProperty("--ey", `${((ev.clientY - r.top) / r.height) * 100}%`);
      if (!lit.has(hit)) { hit.setAttribute("data-lit", ""); lit.add(hit); }
    });
    pending = e;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { lit.forEach((el) => el.removeAttribute("data-lit")); lit.clear(); });
}

// Explore each service without leaving the illustrative record.
$$('[data-service-preview]').forEach((preview) => {
  const tabs = $$('[data-service-step]', preview);
  const panels = $$('[data-service-panel]', preview);
  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(next, true); }
    });
  });
});

// ------------------------------------------------------------------------------------------------ technical figures (v3)
// FIG 0.1 – 0.3 draw their hairlines once they come into view, edge by edge, back to front.
$$(".figs li").forEach((li) => { $$(".iso polygon,.iso ellipse", li).forEach((p, k) => p.style.setProperty("--k", k)); });
if ("IntersectionObserver" in window && !reduced.matches) {
  $$(".figs").forEach((f) => { if (f.getBoundingClientRect().top > innerHeight * 0.9) f.setAttribute("data-armed", ""); });
  const figIO = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); figIO.unobserve(en.target); } }), { threshold: 0.35 });
  $$(".figs li").forEach((li) => figIO.observe(li));
}
