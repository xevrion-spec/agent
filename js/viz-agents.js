// The agent app pictures (cycle 17, xw/agent_ui.py). The pictures are complete without this script; it only adds life
// the first time a picture comes on screen: the home page's "What your agents did today" list plays in, newest entry
// last, one row at a time, the way work arrives in the real app. It never repeats or invents entries, does nothing with
// reduced motion, and never moves focus or scrolls the page.
export const STEP_MS = 420;

export function playIn(list, { step = STEP_MS, schedule = setTimeout } = {}) {
  const rows = list ? [...list.children] : [];
  rows.forEach((li, i) => {
    li.classList.remove("is-new");
    li.style.opacity = "0";
    schedule(() => { li.style.opacity = ""; li.classList.add("is-new"); }, i * step);
  });
  return rows.length;
}

export function mount(host, { reduced = false } = {}) {
  const list = host.querySelector("[data-feed]");
  let played = false;
  return {
    visible(on) {
      if (!on || played || reduced || !list) return;
      played = true;
      playIn(list);
    },
  };
}
