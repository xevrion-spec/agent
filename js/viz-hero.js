// The website's one example workspace (xw/hero_app.py, the homepage's #workspace): the REAL agent app on the invented
// company (portal-embed.js). Cycle 23: /customer-portal is gone; this window has every page, a "Look for" line that follows
// the page, and Full screen (core.js), which is also how a phone opens the working app. Cycle 20 (Henry: "get rid of [the animation] and just show the example
// workplace"): nothing plays by itself. The app is laid out at its own size (no zoom, no transform, so it stays sharp at
// every pixel ratio), its own menu stays visible, and the frame's tabs open Home or an agent's page in it.
// On a phone the window is a still, inert view of Home until the visitor opens it full screen.
import { bootPortal } from "./portal-embed.js";

export const PHONE_MAX = 600;            // at or under this width the window is a still preview, not a working app
const PAGE_ID = /^[a-z][a-z0-9_-]{0,40}$/;

/** The tabs' app pages, read from the buttons (data-hx-tab), keeping only well-formed page ids. */
export function readTabs(buttons) {
  return [...(buttons || [])].map((button) => String(button?.dataset?.hxTab || "")).filter((page) => PAGE_ID.test(page));
}

/** Which tab to mark for an app page: the tab with that page, else none (the app may be on a page no tab names). */
export function tabFor(pages, page) {
  const index = pages.indexOf(String(page || ""));
  return index >= 0 ? index : -1;
}

/** True when the window should be a still preview: a narrow viewport. */
export function isPhone(width) {
  const value = Number(width);
  return Number.isFinite(value) && value > 0 && value <= PHONE_MAX;
}

/** True when the app must be inert (a still picture): on a phone, unless the window is open full screen. */
export function isStill(width, full) {
  return isPhone(width) && !full;
}

/** The "Look for" line for an app page: the tab's own line, else the first tab's (the app may be on a page no tab names). */
export function lookFor(looks, pages, page) {
  const index = tabFor(pages, page);
  return String((index >= 0 ? looks[index] : "") || "");
}

export function mount(host, { track } = {}) {
  const appHost = host.querySelector("[data-hx-app]");
  const screen = host.querySelector("[data-hx-screen]");
  if (!appHost || !screen) return { visible() {} };
  const figure = host.closest("figure") || host;
  const buttons = [...figure.querySelectorAll("[data-hx-tab]")];
  const pages = readTabs(buttons);
  if (!pages.length) return { visible() {} };
  const looks = buttons.filter((button) => PAGE_ID.test(String(button?.dataset?.hxTab || ""))).map((button) => String(button.dataset.hxLook || ""));
  const lookNow = figure.querySelector("[data-hx-look-now]");
  let app = null, turn = 0;

  const mark = (page) => {
    const index = tabFor(pages, page);
    buttons.forEach((button, i) => { const on = String(i === index); if (button.getAttribute("aria-selected") !== on) button.setAttribute("aria-selected", on); });
    const line = lookFor(looks, pages, page);
    if (lookNow && line && lookNow.textContent !== line) lookNow.textContent = line;
  };
  // a phone gets a still view: the app cannot be focused or clicked inside it, and the button below opens it full screen
  const applyPhone = () => {
    const full = figure.classList.contains("is-full");
    const still = isStill(globalThis.innerWidth, full);
    figure.toggleAttribute("data-still", still);
    if (still) screen.setAttribute("inert", ""); else screen.removeAttribute("inert");
    if (full) boot().catch(() => {});
  };
  applyPhone();
  // core.js fires a resize when Full screen opens or closes, so the phone's still view follows it
  globalThis.addEventListener?.("resize", applyPhone, { passive: true });
  // a phone's "Open the example workspace": the working app, full screen
  figure.querySelector("[data-hx-open]")?.addEventListener("click", () => {
    const full = figure.querySelector("[data-portal-full]");
    if (full && !figure.classList.contains("is-full")) full.click();
    track?.("hero_open_full", true);
  });

  const open = async (page, byTab) => {
    const mine = ++turn;
    mark(page);
    try {
      await (app || boot());
      if (mine !== turn) return;
      // opening a page never scrolls the website page and never takes focus away from the tab the visitor pressed
      const x = scrollX, y = scrollY, before = document.activeElement;
      await window.XevrionPortal.go(page);
      if (scrollX !== x || scrollY !== y) scrollTo(x, y);
      if (byTab && before && document.activeElement !== before && typeof before.focus === "function") before.focus({ preventScroll: true });
    } catch {
      figure.classList.add("is-failed");
    }
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    const page = String(button.dataset.hxTab || "");
    if (!PAGE_ID.test(page)) return;
    open(page, true);
    track?.("hero_tab:" + page, true);
  }));
  // the app's own menu moves the tabs too
  appHost.addEventListener("click", (event) => {
    const go = event.target?.closest?.("[data-go]");
    if (go && PAGE_ID.test(String(go.dataset.go || ""))) mark(go.dataset.go);
  }, { capture: true });
  // keyboard: arrows move along the tab strip, as in any tab list
  figure.querySelector("[role=tablist]")?.addEventListener("keydown", (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (index < 0 || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
    event.preventDefault();
    const next = buttons[(index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
    next.focus();
    next.click();
  });

  function boot() {
    if (app) return app;
    host.setAttribute("aria-busy", "true");
    const x = scrollX, y = scrollY;
    app = bootPortal(appHost, { page: pages[0] }).then((portal) => {
      host.removeAttribute("aria-busy");
      figure.classList.add("is-ready");
      if (scrollX !== x || scrollY !== y) scrollTo(x, y);
      if (screen.contains(document.activeElement)) document.activeElement.blur?.();   // booting never takes focus
      return portal;
    });
    app.catch(() => { host.removeAttribute("aria-busy"); figure.classList.add("is-failed"); app = null; });
    return app;
  }
  return { visible(onScreen) { if (onScreen) boot().catch(() => {}); } };
}
