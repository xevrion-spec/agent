// /start: the one-click free trial from a reply to Xevrion's outreach. Loaded only on that page (core.js imports it
// when it finds [data-invite], and the page preloads it, xw/shell.py).
// The link is https://xevrion.co.uk/start#<token>. The token stays after "#", so it never reaches a server log or the
// site's measurement; it is read here, kept for this tab only (sessionStorage, so a reload still works) and removed
// from the address bar. Then:
//   POST /v1/public/invite/peek    {token}                   -> the business name, a masked email and the plan
//   POST /v1/public/invite/accept  {token, password, name?}  -> the account, the organisation and the trial
//   POST /v1/public/invite/renew   {token}                   -> an expired link: a new one by email
// Preview builds (not xevrion.co.uk) never call the API: they show the form for an example business.

const KEY = "xev_invite";
const TOKEN = /^[A-Za-z0-9_-]{20,300}\.[A-Za-z0-9_-]{22}$/;
const APP_NEXT = "https://api.xevrion.co.uk/app?trial=1#signin";

// The token in an address's fragment ("#abc.def" or "#token=abc.def"), or "" when there is none or it cannot be one.
// A hand-edited or half-copied link can hold a lone "%" that decodeURIComponent throws on (URIError): that is "".
export function tokenFrom(hash) {
  let raw = "";
  try { raw = decodeURIComponent(String(hash || "").replace(/^#/, "")); } catch { return ""; }
  raw = raw.replace(/^token=/, "").trim();
  return TOKEN.test(raw) ? raw : "";
}

// Where to go after the trial starts: only the Xevrion app, never an address the API answer could point elsewhere.
export function safeNext(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && u.hostname === "api.xevrion.co.uk" && u.pathname === "/app" ? u.toString() : APP_NEXT;
  } catch { return APP_NEXT; }
}

// Which step to show for an API answer: ok, expired, used or invalid (a network failure is "error").
export function stateFor(status, body) {
  if (status === 200) return "ready";
  const state = body && typeof body.state === "string" ? body.state : "";
  if (status === 410 || state === "expired") return "expired";
  if (status === 409 && state === "used") return "used";
  if (status === 404 || status === 422 || state === "invalid") return "invalid";
  return "error";
}

function remember(token) {
  try { if (token) sessionStorage.setItem(KEY, token); } catch { /* storage blocked: the token stays in memory only */ }
}
function recall() {
  try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; }
}
function forget() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function init({ API, Analytics, LIVE, escapeHtml, $, $$ }) {
  const box = $("[data-invite]");
  if (!box) return;
  const status = $(".form__status", box);
  const title = $("[data-inv-title]", box);
  const form = $("form[data-inv-step=ready]", box);
  const track = (name) => { try { Analytics?.track?.(name); } catch { /* measurement never breaks the page */ } };
  const show = (step) => {
    box.dataset.state = step;
    $$("[data-inv-step]", box).forEach((s) => { s.hidden = s.dataset.invStep !== step; });
  };
  const say = (cls, html) => { status.className = `form__status form__status--${cls}`; status.innerHTML = html; status.hidden = !html; };

  let token = tokenFrom(location.hash);
  if (token) {
    remember(token);
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch { /* keep the address as it is */ }
  } else {
    token = recall();
  }

  const call = async (path, data) => {
    const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "omit" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  const fill = (info) => {
    const name = String(info.business_name || "your business");
    title.textContent = `Start your free trial, ${name}`;
    form.elements.business.value = name;
    form.elements.email.value = String(info.email_masked || "");
    if (info.existing_account) {
      $("[data-inv-password-label]", box).textContent = "Your Xevrion password";
      $("[data-inv-password-hint]", box).textContent = "This email already has a Xevrion account. Use its password, or Recover in the app if you have forgotten it.";
      form.elements.password.setAttribute("autocomplete", "current-password");
      const extra = $("[data-inv-new]", box);
      if (extra) extra.hidden = true;
    }
  };

  const start = async () => {
    if (!LIVE) {                                   // preview: the page for an example business, nothing is sent
      fill({ business_name: "Example Ltd", email_masked: "i***@example.co.uk" });
      show("ready");
      return;
    }
    if (!token) { show("invalid"); return; }
    try {
      const { status: code, body } = await call("/v1/public/invite/peek", { token });
      const step = stateFor(code, body);
      if (step === "ready") { fill(body); track("invite_view"); show("ready"); return; }
      if (step === "error") {
        show("loading");
        say("error", code === 429 ? "There have been a lot of attempts from your network. Please wait a few minutes and reload this page."
          : "We could not check your link just now. Please reload this page in a minute.");
        return;
      }
      if (step !== "expired") forget();
      title.textContent = step === "expired" ? "This link has run out" : step === "used" ? "Your account is ready" : "This link is not valid";
      show(step);
    } catch {
      say("error", "We could not reach Xevrion just now. Check your connection and reload this page.");
    }
  };

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = form.elements.password;
    const ok = pw.value.length >= 12 && pw.value.length <= 256;
    pw.closest(".field").dataset.invalid = String(!ok);
    pw.setAttribute("aria-invalid", String(!ok));
    if (!ok) { pw.focus(); return; }
    if (!LIVE) { say("error", "Preview: no account was created. Trials start only on xevrion.co.uk."); return; }
    const button = $("button[type=submit]", form);
    const label = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Starting your trial';
    try {
      const name = form.elements.name && !form.elements.name.closest("[hidden]") ? form.elements.name.value.trim() : "";
      const { status: code, body } = await call("/v1/public/invite/accept", { token, password: pw.value, ...(name ? { name } : {}) });
      if (code === 200) {
        pw.value = "";
        forget();
        $("[data-inv-next]", box).href = safeNext(body.next);
        title.textContent = body.trial_started ? "Your free trial has started" : "Your account is ready";
        say("", "");
        show("done");
        title.focus?.();
        track("invite_accept");
        return;
      }
      if (code === 401) { say("error", escapeHtml(body.detail || "That password is not right for this account.")); pw.focus(); return; }
      const step = stateFor(code, body);
      if (["expired", "used", "invalid"].includes(step)) { show(step); return; }
      say("error", code === 429 ? "There have been a lot of attempts from your network. Please wait a few minutes and try again."
        : code === 422 ? "Please use a password of at least 12 characters." : "We could not start your trial just now. Please try again in a minute.");
    } catch {
      say("error", "We could not reach Xevrion just now. Check your connection and try again.");
    } finally { button.disabled = false; button.textContent = label; }
  });

  $("[data-inv-renew]", box)?.addEventListener("click", async (e) => {
    const button = e.currentTarget;
    if (!LIVE) { say("error", "Preview: no email was sent."); return; }
    button.disabled = true;
    try {
      await call("/v1/public/invite/renew", { token });
      say("ok", "If this link was yours, a new one is on its way to the same email address. Use the newest email from us.");
      track("invite_renew_sent");
    } catch {
      button.disabled = false;
      say("error", "We could not send a new link just now. Please try again in a minute.");
    }
  });

  start();
}
