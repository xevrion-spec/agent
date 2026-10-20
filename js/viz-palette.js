// Command palette: instant search across every Xevrion page, capability, use case and glossary term, on all three
// sites, with the Xevrion assistant as the fallback. Keyboard-first (arrows, Enter, Escape), screen-reader labelled.
const API = "https://api.xevrion.co.uk";
const LIVE = /(^|\.)xevrion\.co\.uk$/.test(location.hostname);   // local and preview builds never call the API
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s£%-]/g, " ");

let root, input, list, foot, index = null, results = [], active = 0, lastFocus = null, track = () => {}, indexUrl = "";
const SUGGEST = ["Get started", "See Xevrion in action", "Pricing", "Capability index", "Learning and memory", "Use-case library", "Glossary"];

function score(e, words) {
  let s = 0;
  const t = e._t || (e._t = norm(e.t)), d = e._d || (e._d = norm(`${e.d} ${e.h || ""} ${e.g}`));
  for (const w of words) {
    if (t.startsWith(w)) s += 14;
    else if (t.includes(" " + w)) s += 10;
    else if (t.includes(w)) s += 7;
    else if (d.includes(w)) s += 2;
    else return 0;                       // every word must match somewhere
  }
  return s + (e.k === "page" ? 3 : 0);
}

function render() {
  const q = input.value.trim();
  if (!index) { list.innerHTML = '<li class="pal__empty">Loading…</li>'; return; }
  if (!q) results = SUGGEST.map((t) => index.find((e) => e.t === t && e.k === "page")).filter(Boolean);
  else {
    const words = norm(q).split(/\s+/).filter(Boolean);
    results = index.map((e) => [score(e, words), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, e]) => e);
  }
  const rows = results.map((e, i) => `<li role="option" id="pal-o${i}" class="pal__opt" data-i="${i}" aria-selected="${i === active}">
    <span class="pal__k">${esc(e.g)}</span><span class="pal__t">${esc(e.t)}</span><span class="pal__d">${esc(e.d)}</span></li>`);
  if (q) rows.push(`<li role="option" id="pal-o${results.length}" class="pal__opt pal__ask" data-i="${results.length}" aria-selected="${active === results.length}">
    <span class="pal__k">Ask</span><span class="pal__t">“${esc(q)}”</span><span class="pal__d">An automated answer from published information only. Press Enter to ask.</span></li>`);
  list.innerHTML = rows.join("") || `<li class="pal__empty">Type to search every page, capability and term.</li>`;
  input.setAttribute("aria-activedescendant", rows.length ? `pal-o${active}` : "");
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

async function askQuestion(q) {
  if (!LIVE) { foot.textContent = "Preview: not sent. The assistant answers only on the live Xevrion websites."; return; }
  foot.innerHTML = '<span class="spinner" aria-hidden="true"></span> Asking the Xevrion assistant…';
  track("palette_ask");
  try {
    const res = await fetch(`${API}/v1/public/guide`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ question: q, ai_consent: true }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(res.status));
    foot.innerHTML = `<div class="pal__answer"><span class="label">${body.fallback ? "No reliable answer" : "Automated answer"} · published information only</span><p>${esc(body.answer || "")}</p></div>`;
  } catch {
    foot.innerHTML = 'The assistant is not available just now. <a class="link" href="/contact">Send a written question</a> instead.';
  }
}

function choose(i) {
  if (i === results.length) {
    askQuestion(input.value.trim()); return;
  }
  const e = results[i];
  if (!e) return;
  track(`palette_go:${e.k}`);
  close();
  const here = document.documentElement.dataset.site;          // same site: relative link; other sites: absolute
  location.href = e.s === here ? e.u : index.origins[e.s] + e.u;
}

function onKey(ev) {
  const n = results.length + (input.value.trim() ? 1 : 0);
  if (ev.key === "ArrowDown") { ev.preventDefault(); active = (active + 1) % Math.max(n, 1); render(); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); active = (active - 1 + Math.max(n, 1)) % Math.max(n, 1); render(); }
  else if (ev.key === "Enter") { ev.preventDefault(); choose(active); }
  else if (ev.key === "Escape") { ev.preventDefault(); close(); }
  else if (ev.key === "Tab") { ev.preventDefault(); input.focus(); }       // focus stays in the dialog
}

function build() {
  root = document.createElement("div");
  root.className = "pal";
  root.hidden = true;
  root.innerHTML = `<div class="pal__scrim" data-close></div>
  <div class="pal__panel glass glass--elevated" role="dialog" aria-modal="true" aria-label="Search Xevrion">
    <div class="pal__bar"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/></svg>
      <input class="pal__input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="Search pages, capabilities, terms… or ask a question" autocomplete="off" spellcheck="false">
      <kbd>Esc</kbd></div>
    <ul class="pal__list" id="pal-list" role="listbox" aria-label="Results"></ul>
    <div class="pal__foot" aria-live="polite"><span><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</span></div>
  </div>`;
  document.body.append(root);
  input = root.querySelector(".pal__input");
  list = root.querySelector(".pal__list");
  foot = root.querySelector(".pal__foot");
  input.addEventListener("input", () => { active = 0; render(); });
  input.addEventListener("keydown", onKey);
  list.addEventListener("click", (e) => { const o = e.target.closest("[data-i]"); if (o) choose(+o.dataset.i); });
  list.addEventListener("mousemove", (e) => { const o = e.target.closest("[data-i]"); if (o && +o.dataset.i !== active) { active = +o.dataset.i; render(); } });
  root.querySelector("[data-close]").addEventListener("click", close);
}

export function open() {
  if (!root) build();
  lastFocus = document.activeElement;
  root.hidden = false;
  document.documentElement.style.overflow = "hidden";
  input.value = ""; active = 0;
  foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</span>';
  render();
  requestAnimationFrame(() => input.focus());
  if (!index) fetch(indexUrl, { credentials: "omit" }).then((r) => r.json()).then((d) => { index = Object.assign(d.items, { origins: d.origins }); render(); })
    .catch(() => { list.innerHTML = '<li class="pal__empty">Search is unavailable. Use the menu instead.</li>'; });
  track("palette_open");
}

export function close() {
  if (!root || root.hidden) return;
  root.hidden = true;
  document.documentElement.style.overflow = "";
  lastFocus?.focus?.();
}

export function mount(_host, opts) {
  track = opts.track || track;
  indexUrl = opts.indexUrl;
  return { open, close, visible() {} };
}
