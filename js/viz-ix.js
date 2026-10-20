// viz-ix.js: the website's one interaction system for charts and diagrams (v2, cycle 19).
//
// Henry (cycle 19): "every visual needs to be advanced way further, higher resolution and quality and more intuitive".
// The build draws every visual as DOM and SVG (xw/ix.py), complete and readable without this script: exact values sit
// in a JSON block and in a visually hidden table. This module adds the interaction, the same way on every page.
// src/js/VIZ-API.md documents the markup and the calls. One call per visual type:
//
//   line(root)   line and area charts: a crosshair that snaps to the nearest point, a glass tooltip (value, change since
//                the previous point, label), hover a line to dim the others, click a legend key to isolate it, a draw-in
//                on entering view, segmented toggles that morph the paths between states, and touch scrubbing
//   bars(root)   bar lists: grow-in, a hover lift with a value chip, click (or Enter) to drill into a breakdown card
//   flow(root)   diagrams: cards joined by SVG edges with moving dashes, a glowing packet that travels edge to edge
//                (with a pause button), a numbered progress rail, and click a card to open its real example record
//   table(root)  tables: row hover, column hover, sortable headers with arrows, click a row to expand its detail
//   kpiTile(root) KPI tiles: a count-up on entering view, a sparkline that answers on hover, a delta chip
//   marks(root), steps(root): the cycle 18 kinds, kept for pictures that are neither (roadmaps, clause lists, timelines)
//
// Every visual is one tab stop: arrows move, Enter pins, Escape clears; a polite live region reads each value. Until
// the first interaction it is marked data-ix-used (cycle 24: no "Hover to explore" chip is drawn). Pointer work is
// throttled to one update per animation frame. Nothing animates with reduced motion. Every JSON read is guarded: a visual
// whose data cannot be read keeps its static drawing and table. The module has no imports and builds no HTML strings.

const SVG_NS = "http://www.w3.org/2000/svg";
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const isNumber = (value) => value !== null && value !== undefined && value !== "" && !Array.isArray(value) && Number.isFinite(Number(value));

// ================================================================================================ pure helpers
/** Index of the value in a sorted list closest to target (binary search, O(log n)); -1 for an empty list. */
export function nearestIndex(points, target) {
  const count = points?.length || 0;
  if (!count || !Number.isFinite(target)) return count ? 0 : -1;
  let lowIndex = 0, high = count - 1;
  while (high - lowIndex > 1) {
    const middle = (lowIndex + high) >> 1;
    if (points[middle] <= target) lowIndex = middle; else high = middle;
  }
  return Math.abs(points[high] - target) < Math.abs(target - points[lowIndex]) ? high : lowIndex;
}

/** The index a key moves to, or null when the key is not a navigation key. -1 means "nothing active yet". */
export function keyStep(index, key, count) {
  if (!(count > 0)) return null;
  const current = index < 0 ? -1 : clamp(index, 0, count - 1);
  switch (key) {
    case "ArrowRight": case "ArrowDown": return current < 0 ? 0 : Math.min(count - 1, current + 1);
    case "ArrowLeft": case "ArrowUp": return current < 0 ? count - 1 : Math.max(0, current - 1);
    case "Home": return 0;
    case "End": return count - 1;
    case "PageDown": return current < 0 ? 0 : Math.min(count - 1, current + 5);
    case "PageUp": return current < 0 ? 0 : Math.max(0, current - 5);
    default: return null;
  }
}

const NUMBER_FORMATS = new Map();
const grouped = (digits) => {
  if (!NUMBER_FORMATS.has(digits)) NUMBER_FORMATS.set(digits, new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return NUMBER_FORMATS.get(digits);
};

/** A value as the site writes it: units "gbp" (£48,200), "gbp2" (£2,400.00), "h" (6.5 h), "pct" (62%), "days" (12 days)
 * or plain. Non-numbers come back as an en dash, so a tooltip never reads "NaN". xw/ix.py money() writes the same. */
export function formatValue(value, unit = "") {
  if (!isNumber(value)) return "–";
  const number = Number(value);
  const sign = number < 0 ? "−" : "";
  const size = Math.abs(number);
  switch (unit) {
    case "gbp": return sign + "£" + grouped(0).format(Math.round(size));
    case "gbp2": return sign + "£" + grouped(2).format(size);
    case "h": return sign + grouped(size % 1 ? 1 : 0).format(size) + " h";
    case "pct": return sign + grouped(0).format(size) + "%";
    case "days": return sign + grouped(0).format(size) + (size === 1 ? " day" : " days");
    default: return sign + grouped(size % 1 ? 1 : 0).format(size);
  }
}

/** The plain sentence for point index of a line chart: its label, then each visible series' exact value. A band's
 * values are [low, high] pairs; gaps (null) are left out. This is what the live region reads. */
export function lineTip(spec, index, hidden = new Set()) {
  const label = spec?.x?.[index] ?? "";
  const parts = [];
  for (const series of spec?.series || []) {
    if (hidden.has(series.key)) continue;
    const value = series.values?.[index];
    if (value === null || value === undefined) continue;
    parts.push(Array.isArray(value) ? `${series.name} ${formatValue(value[0], series.unit)} to ${formatValue(value[1], series.unit)}` : `${series.name} ${formatValue(value, series.unit)}`);
  }
  return parts.length ? `${label}: ${parts.join(" · ")}` : String(label);
}

/** The change at index against the nearest earlier point that has a value: { diff, pct, direction }, or null. */
export function changeOf(values, index) {
  const latest = values?.[index];
  if (!isNumber(latest)) return null;
  for (let j = index - 1; j >= 0; j--) {
    if (!isNumber(values[j])) continue;
    const before = Number(values[j]);
    const diff = Number(latest) - before;
    return { diff, pct: before ? (diff / Math.abs(before)) * 100 : null, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
  }
  return null;
}

/** A change as the delta chip writes it: direction by arrow and sign, never by colour (Henry's colour rule). */
export function changeText(change, unit = "") {
  if (!change) return "";
  if (change.direction === "flat") return "No change";
  const arrow = change.direction === "up" ? "▲" : "▼";
  const amount = (change.diff > 0 ? "+" : "") + formatValue(change.diff, unit);
  const share = change.pct === null || !Number.isFinite(change.pct) ? "" : ` (${change.pct > 0 ? "+" : "−"}${grouped(1).format(Math.abs(change.pct))}%)`;
  return `${arrow} ${amount}${share}`;
}

/** Legend isolation: choosing a series shows only it; choosing the isolated one again shows every series. */
export function isolate(keys, current, key) {
  if (!keys.includes(key)) return current;
  return current === key ? null : key;
}

/** Hidden series for an isolation state. */
export function hiddenFor(keys, isolated) {
  return new Set(isolated ? keys.filter((each) => each !== isolated) : []);
}

/** Whether an element whose data-on lists steps ("0 1 2") belongs to the path of step index. */
export function onPath(tokens, index) {
  return String(tokens || "").split(/\s+/).filter(Boolean).includes(String(index));
}

/** Easing curves, shared by every animation here. */
export const ease = {
  out: (time) => 1 - Math.pow(1 - clamp(time, 0, 1), 3),
  inOut: (time) => { const part = clamp(time, 0, 1); return part < 0.5 ? 4 * part * part * part : 1 - Math.pow(-2 * part + 2, 3) / 2; },
  /** a damped spring's step response at time seconds (0 to about 1.02, settling at 1) */
  spring: (time, zeta = 0.72, omega = 14) => {
    if (time <= 0) return 0;
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * time) * (Math.cos(damped * time) + ((zeta * omega) / damped) * Math.sin(damped * time));
  },
};

/** The value a count-up shows at progress time (0..1). Reduced motion always shows the final value. */
export function countAt(from, target, time, reduced = false) {
  return reduced ? target : from + (target - from) * ease.out(time);
}

/** Animate element's text from `from` to `target` (formatted with unit) on animation frames. With reduced motion, or
 * without requestAnimationFrame, the final value is written at once. Returns a cancel function. */
export function countUp(element, target, { from = 0, duration = 900, unit = "", reduced = false, schedule = globalThis.requestAnimationFrame, clock = () => performance.now() } = {}) {
  if (!element) return () => {};
  if (reduced || typeof schedule !== "function" || duration <= 0) { element.textContent = formatValue(target, unit); return () => {}; }
  let stopped = false;
  const start = clock();
  const frame = () => {
    if (stopped) return;
    const time = clamp((clock() - start) / duration, 0, 1);
    element.textContent = formatValue(countAt(from, target, time), unit);
    if (time < 1) schedule(frame);
  };
  schedule(frame);
  return () => { stopped = true; };
}

/** prefers-reduced-motion, read safely (false where matchMedia is missing or throws). */
export function prefersReduced() {
  try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Whether the main pointer is coarse (a touch screen), read safely. */
export function coarsePointer() {
  try { return !!globalThis.matchMedia?.("(hover: none)").matches; } catch { return false; }
}

/** The affordance chip's words. */
export function hintLabel(coarse) {
  return coarse ? "Tap to explore" : "Hover to explore";
}

/** Wrap callback so it runs at most once per animation frame with the latest arguments (pointer moves come faster than
 * frames). Without requestAnimationFrame it runs at once. */
export function rafThrottle(callback, schedule = globalThis.requestAnimationFrame) {
  let queued = false, latest = [];
  return (...args) => {
    latest = args;
    if (typeof schedule !== "function") { callback(...latest); return; }
    if (queued) return;
    queued = true;
    schedule(() => { queued = false; callback(...latest); });
  };
}

/** values resampled to count points by linear interpolation along the index, so two states of different lengths can
 * morph into each other. A gap (null) stays a gap. */
export function resample(values, count) {
  const list = Array.isArray(values) ? values : [];
  if (!(count > 0)) return [];
  if (!list.length) return Array(count).fill(null);
  if (list.length === count) return list.slice();
  if (list.length === 1) return Array(count).fill(list[0]);
  const result = [];
  for (let k = 0; k < count; k++) {
    const position = count === 1 ? 0 : (k * (list.length - 1)) / (count - 1);
    const lower = Math.floor(position), upper = Math.min(list.length - 1, lower + 1), part = position - lower;
    const first = list[lower], second = list[upper];
    if (!isNumber(first) || !isNumber(second)) result.push(part < 0.5 ? first ?? null : second ?? null);
    else result.push(Number(first) + (Number(second) - Number(first)) * part);
  }
  return result;
}

/** Point-by-point blend of two equal-length lists at progress (0..1); gaps switch over halfway. */
export function blendPoints(from, target, progress) {
  return target.map((value, k) => {
    const start = from[k];
    if (!isNumber(start) || !isNumber(value)) return progress < 0.5 ? start ?? null : value;
    return Number(start) + (Number(value) - Number(start)) * progress;
  });
}

const round2 = (value) => Math.round(value * 100) / 100;

// the runs of consecutive points that have values (a gap splits a line)
function runsOf(xs, ys) {
  const runs = [];
  let current = [];
  for (let k = 0; k < xs.length; k++) {
    if (isNumber(ys[k]) && isNumber(xs[k])) current.push([Number(xs[k]), Number(ys[k])]);
    else if (current.length) { runs.push(current); current = []; }
  }
  if (current.length) runs.push(current);
  return runs;
}

// monotone cubic (Fritsch and Carlson) through one run: smooth, and never overshoots a point, so a peak in the line is a
// real peak in the data. xw/ix.py smooth_path() draws the same curve for the static picture.
function monotone(run, moveTo = true) {
  const count = run.length;
  if (!count) return "";
  let path = (moveTo ? "M" : "L") + round2(run[0][0]) + " " + round2(run[0][1]);
  if (count === 1) return path;
  const slopes = [], tangents = [];
  for (let k = 0; k < count - 1; k++) {
    const width = run[k + 1][0] - run[k][0];
    slopes.push(width ? (run[k + 1][1] - run[k][1]) / width : 0);
  }
  tangents.push(slopes[0]);
  for (let k = 1; k < count - 1; k++) tangents.push(slopes[k - 1] * slopes[k] <= 0 ? 0 : (slopes[k - 1] + slopes[k]) / 2);
  tangents.push(slopes[count - 2]);
  for (let k = 0; k < count - 1; k++) {
    if (slopes[k] === 0) { tangents[k] = 0; tangents[k + 1] = 0; continue; }
    const alpha = tangents[k] / slopes[k], beta = tangents[k + 1] / slopes[k];
    const size = alpha * alpha + beta * beta;
    if (size > 9) { const scaleBack = 3 / Math.sqrt(size); tangents[k] = scaleBack * alpha * slopes[k]; tangents[k + 1] = scaleBack * beta * slopes[k]; }
  }
  for (let k = 0; k < count - 1; k++) {
    const [startX, startY] = run[k], [endX, endY] = run[k + 1];
    const third = (endX - startX) / 3;
    path += ` C${round2(startX + third)} ${round2(startY + tangents[k] * third)} ${round2(endX - third)} ${round2(endY - tangents[k + 1] * third)} ${round2(endX)} ${round2(endY)}`;
  }
  return path;
}

/** A smooth line through the points (x, y), with a gap wherever a y is null. */
export function smoothPath(xs, ys) {
  return runsOf(xs, ys).map((run) => monotone(run)).join(" ");
}

/** The area under a smooth line down to baseline (the soft purple gradient under each line). */
export function areaPath(xs, ys, baseline) {
  return runsOf(xs, ys).filter((run) => run.length > 1)
    .map((run) => `${monotone(run)} L${round2(run.at(-1)[0])} ${round2(baseline)} L${round2(run[0][0])} ${round2(baseline)} Z`).join(" ");
}

/** A range band between two smooth edges (lows and highs, in drawing units). */
export function bandPath(xs, lows, highs) {
  const both = xs.map((_, k) => (isNumber(lows[k]) && isNumber(highs[k]) ? k : -1));
  const parts = [];
  let start = -1;
  for (let k = 0; k <= both.length; k++) {
    const inside = k < both.length && both[k] >= 0;
    if (inside && start < 0) start = k;
    if (!inside && start >= 0) {
      const topEdge = [], bottom = [];
      for (let m = start; m < k; m++) { topEdge.push([Number(xs[m]), Number(highs[m])]); bottom.unshift([Number(xs[m]), Number(lows[m])]); }
      if (topEdge.length > 1) parts.push(`${monotone(topEdge)} ${monotone(bottom, false)} Z`);
      start = -1;
    }
  }
  return parts.join(" ");
}

/** The order rows take when sorted by one column: a stable sort, numbers by value, words by en-GB collation, blanks last. */
export function sortOrder(values, type = "text", direction = "ascending") {
  const sign = direction === "descending" ? -1 : 1;
  const collator = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" });
  const parsed = values.map((value) => {
    if (type !== "num") return value === null || value === undefined || String(value).trim() === "" ? null : String(value);
    const number = Number(String(value ?? "").replace(/[^0-9.\-−]/g, "").replace("−", "-"));
    return String(value ?? "").trim() === "" || !Number.isFinite(number) ? null : number;
  });
  return parsed.map((value, index) => ({ value, index })).sort((first, second) => {
    if (first.value === null && second.value === null) return first.index - second.index;
    if (first.value === null) return 1;
    if (second.value === null) return -1;
    const order = type === "num" ? first.value - second.value : collator.compare(first.value, second.value);
    return order ? order * sign : first.index - second.index;
  }).map((entry) => entry.index);
}

/** The edge between two cards (boxes in the same pixel space): left to right when the next card is beside, top to
 * bottom when it is below. Returns the path, its end point and its direction, on half pixels so a 1px line is crisp. */
export function edgeGeometry(from, target, gap = 6) {
  const half = (value) => Math.round(value - 0.5) + 0.5;
  const below = target.y >= from.y + from.h - 2 && target.x < from.x + from.w && target.x + target.w > from.x;
  if (below) {
    const startX = half(from.x + Math.min(from.w, target.w) / 2), startY = from.y + from.h + gap;
    const endX = half(target.x + Math.min(from.w, target.w) / 2), endY = target.y - gap;
    const middle = (startY + endY) / 2;
    const path = startX === endX ? `M${startX} ${round2(startY)} L${endX} ${round2(endY)}`
      : `M${startX} ${round2(startY)} C${startX} ${round2(middle)} ${endX} ${round2(middle)} ${endX} ${round2(endY)}`;
    return { path, end: { x: endX, y: endY }, direction: "down" };
  }
  const startX = from.x + from.w + gap, startY = half(from.y + from.h / 2);
  const endX = target.x - gap, endY = half(target.y + target.h / 2);
  const middle = (startX + endX) / 2;
  const path = startY === endY ? `M${round2(startX)} ${startY} L${round2(endX)} ${endY}`
    : `M${round2(startX)} ${startY} C${round2(middle)} ${startY} ${round2(middle)} ${endY} ${round2(endX)} ${endY}`;
  return { path, end: { x: endX, y: endY }, direction: "right" };
}

/**
 * The flow's auto-play clock, without the DOM. The packet rests on card 0, travels edge 0 to card 1, rests, travels on,
 * and after the last card rests longer and starts again. state(): { phase: "dwell" | "travel" | "rest", edge, progress,
 * reached } where reached is the last card the packet has arrived at.
 */
export function createFlowClock({ edges, travelMs = 1100, dwellMs = 650, restMs = 1800 }) {
  const total = Math.max(0, Math.floor(edges));
  const state = { phase: "dwell", edge: 0, progress: 0, reached: 0, elapsed: 0 };
  const snapshot = () => ({ phase: state.phase, edge: state.edge, progress: state.progress, reached: state.reached });
  return {
    state: snapshot,
    reset() { Object.assign(state, { phase: "dwell", edge: 0, progress: 0, reached: 0, elapsed: 0 }); return snapshot(); },
    /** jump so card index is the one just reached (a click on the progress rail) */
    seek(index) { const card = clamp(Math.round(Number(index) || 0), 0, total); Object.assign(state, { phase: card >= total ? "rest" : "dwell", edge: Math.min(card, Math.max(0, total - 1)), progress: 0, reached: card, elapsed: 0 }); return snapshot(); },
    tick(delta) {
      if (!(delta > 0) || !total) return snapshot();
      state.elapsed += Math.min(delta, 250);
      if (state.phase === "dwell" && state.elapsed >= dwellMs) { state.phase = "travel"; state.edge = state.reached; state.elapsed = 0; state.progress = 0; }
      else if (state.phase === "travel") {
        state.progress = clamp(state.elapsed / travelMs, 0, 1);
        if (state.progress >= 1) { state.reached = state.edge + 1; state.elapsed = 0; state.phase = state.reached >= total ? "rest" : "dwell"; }
      } else if (state.phase === "rest" && state.elapsed >= restMs) { this.reset(); }
      return snapshot();
    },
  };
}

// ================================================================================================ the controller
/**
 * The keyboard and pointer state of one visual, without the DOM: which item is active (hovered, or moved to with the
 * arrows), which is selected (pinned with Enter or a click) and which series is isolated. render(state) runs on change.
 */
export function createNav({ count, keys = [], render = () => {} }) {
  const total = () => Math.max(0, typeof count === "function" ? count() : count);   // a function when the points can change (a toggle)
  const state = { active: -1, selected: -1, isolated: null };
  const snapshot = () => ({ ...state, hidden: hiddenFor(keys, state.isolated), shown: state.selected >= 0 ? state.selected : state.active });
  const emit = () => render(snapshot());
  return {
    state: snapshot,
    hover(index) { const next = index === null || index < 0 ? -1 : clamp(index, 0, total() - 1); if (next !== state.active) { state.active = next; emit(); } },
    /** a key press; true when the key was used (the caller then stops the page scrolling) */
    press(key) {
      if (key === "Escape") { const anything = state.selected >= 0 || state.active >= 0 || state.isolated; state.selected = -1; state.active = -1; state.isolated = null; emit(); return !!anything; }
      if (key === "Enter" || key === " ") {
        const index = state.active >= 0 ? state.active : 0;
        state.active = index; state.selected = state.selected === index ? -1 : index; emit(); return true;
      }
      const from = state.selected >= 0 ? state.selected : state.active;
      const next = keyStep(from, key, total());
      if (next === null) return false;
      state.active = next;
      if (state.selected >= 0) state.selected = next;
      emit();
      return true;
    },
    select(index) { const next = clamp(index, 0, total() - 1); state.active = next; state.selected = state.selected === next ? -1 : next; emit(); },
    legend(key) { state.isolated = isolate(keys, state.isolated, key); emit(); },
    clear() { state.active = -1; state.selected = -1; emit(); },
    /** draw again with the same state (the values behind it changed, as in the pricing calculator) */
    refresh() { emit(); },
  };
}

// ================================================================================================ DOM helpers
/** Parse JSON safely: the fallback when it is missing or broken (the static picture then stays as it is). */
export function readJson(text, fallback = null) {
  if (typeof text !== "string" || !text.trim()) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function specOf(root) {
  const block = root.querySelector("script[data-ix-data]");
  return block ? readJson(block.textContent, null) : null;
}

function make(owner, tag, className = "", text = "") {
  const element = owner.createElement(tag);
  if (className) element.setAttribute("class", className);
  if (text !== "") element.textContent = text;
  return element;
}

function makeSvg(owner, tag, attributes = {}) {
  const element = owner.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

const ownerOf = (root) => root.ownerDocument || globalThis.document;
const boxOf = (element) => {
  try { return element.getBoundingClientRect(); } catch { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
};
const removeNode = (element) => { if (element?.parentNode) element.parentNode.removeChild(element); else if (element?.parent) element.parent.children = element.parent.children.filter((child) => child !== element); };
const clearNode = (element) => { if (element) element.textContent = ""; };

/** The polite live region that reads each value to screen readers (visually hidden). */
function liveRegion(root) {
  let region = root.querySelector("[data-ix-say]");
  if (!region) {
    region = make(ownerOf(root), "span", "sr-only");
    region.setAttribute("data-ix-say", "");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    root.appendChild(region);
  }
  return region;
}

/**
 * The glass tooltip: a heading, then rows of swatch, name, value and an optional change chip. Purely visual
 * (aria-hidden); the live region says the same in words. show(model, x, y) places it above the point, inside the root,
 * and flips it below when there is no room above.
 */
function glassTip(root) {
  const owner = ownerOf(root);
  let card = root.querySelector("[data-ix-tip]");
  if (!card) {
    card = make(owner, "div", "ix-tip");
    card.setAttribute("data-ix-tip", "");
    card.setAttribute("aria-hidden", "true");
    root.appendChild(card);
  }
  return {
    element: card,
    show(model, pointX, pointY) {
      clearNode(card);
      if (model.title) card.appendChild(make(owner, "b", "ix-tip__h", model.title));
      for (const tipRow of model.rows || []) {
        const line = make(owner, "span", "ix-tip__r");
        const swatch = make(owner, "i", "ix-tip__sw" + (tipRow.kind ? ` ix-tip__sw--${tipRow.kind}` : ""));
        line.appendChild(swatch);
        if (tipRow.name) line.appendChild(make(owner, "span", "ix-tip__n", tipRow.name));
        line.appendChild(make(owner, "b", "ix-tip__v", tipRow.value));
        if (tipRow.change) line.appendChild(make(owner, "em", "ix-tip__d", tipRow.change));
        card.appendChild(line);
      }
      if (model.note) card.appendChild(make(owner, "span", "ix-tip__f", model.note));
      card.setAttribute("data-show", "");
      const width = root.clientWidth || 0, cardWidth = card.offsetWidth || 180, cardHeight = card.offsetHeight || 48;
      const left = clamp(pointX - cardWidth / 2, 4, Math.max(4, width - cardWidth - 4));
      const above = pointY - cardHeight - 14;
      const topOffset = above >= 0 ? above : pointY + 18;
      card.toggleAttribute("data-below", above < 0);
      card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(topOffset)}px, 0)`;
    },
    hide() { card.removeAttribute("data-show"); },
  };
}

// "name: value" (a mark's data-tip) as a tooltip model
function modelOfTip(text) {
  const whole = String(text || "");
  const split = whole.indexOf(": ");
  return split > 0 ? { title: whole.slice(0, split), rows: [{ value: whole.slice(split + 2) }] } : { title: "", rows: [{ value: whole }] };
}

/** Marks root as used after the first interaction. Cycle 24 (Henry, 17 Oct: "get rid of the tacky tech AI look"): no
  "Hover to explore" chip is drawn any more; a visual's caption says what it does, and data-ix-used stays for styling. */
function trackUse(root) {
  const used = () => root.setAttribute("data-ix-used", "");
  ["pointerdown", "keydown", "focusin"].forEach((type) => root.addEventListener(type, used));
  root.addEventListener("pointermove", (event) => { if (event.pointerType !== "touch") used(); });
}

/** Calls onEnter once, the first time at least a third of root is on screen (at once without IntersectionObserver). */
function onEnter(root, callback) {
  const enter = () => { root.setAttribute("data-ix-in", ""); callback(); };
  const Observer = globalThis.IntersectionObserver;
  if (typeof Observer !== "function") { enter(); return; }
  try {
    const watcher = new Observer((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      enter();
    }, { threshold: 0.3 });
    watcher.observe(root);
  } catch { enter(); }
}

/** Keyboard for a visual: the arrow keys and Enter go to its controller; legend keys, toggles and buttons keep their own. */
function keyboard(root, controller) {
  root.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target !== root && event.target?.closest?.("button,a,input,select,textarea,[data-legend]")) {
      if (event.key !== "Escape") return;
    }
    if (controller.press(event.key)) event.preventDefault?.();
  });
  root.addEventListener("focusout", (event) => {
    if (root.contains?.(event.relatedTarget)) return;
    if (controller.state().selected < 0) controller.hover(-1);
  });
}

// pointer position inside element, as a fraction of its box
function fractionIn(element, event) {
  const bounds = boxOf(element);
  return { across: (event.clientX - bounds.left) / (bounds.width || 1), down: (event.clientY - bounds.top) / (bounds.height || 1), box: bounds };
}

/** The legend keys' look for a state: aria-pressed on the isolated series, the others dimmed. */
function legendPainter(root) {
  const keys = [...root.querySelectorAll("[data-legend]")];
  return (state) => keys.forEach((button) => {
    const seriesKey = button.getAttribute("data-legend");
    button.setAttribute("aria-pressed", String(!state.hidden.has(seriesKey) && state.isolated === seriesKey));
    button.toggleAttribute("data-dim", state.hidden.has(seriesKey));
  });
}

function legendClicks(root, controller, onHot = () => {}) {
  [...root.querySelectorAll("[data-legend]")].forEach((button) => {
    if (button._ixBound) return;
    button._ixBound = true;
    button.addEventListener("click", () => controller.legend(button.getAttribute("data-legend")));
    button.addEventListener("pointerenter", () => onHot(button.getAttribute("data-legend")));
    button.addEventListener("pointerleave", () => onHot(null));
  });
}

// ================================================================================================ line and area charts
/**
 * line(root): a line chart drawn by xw/ix.py line_chart(). The spec (script[data-ix-data]) holds the drawing units
 * (vb), the x labels, each point's x, and per series its values and drawn y (or a band's lows and highs). Optional
 * spec.states are the segmented toggles' other views, each with its own x, series, y ticks and x ticks.
 * Returns the controller: hover(i), press(key), select(i), legend(key), clear(), state(), setState(key).
 */
export function line(root, options = {}) {
  const spec = options.spec || specOf(root);
  const area = root.querySelector("[data-ix-area]");
  if (!spec?.xs?.length || !area || !Array.isArray(spec.series)) return null;
  const owner = ownerOf(root);
  const reduced = options.reduced ?? root.hasAttribute("data-reduced");
  const [unitsWide, unitsHigh] = spec.vb || [100, 100];
  const keys = spec.series.map((series) => series.key);
  const tooltip = glassTip(root), speak = liveRegion(root), paintLegend = legendPainter(root);
  // the live drawing: the current x, the drawn positions and the values (they change when a toggle morphs the chart)
  let view = { x: spec.x, xs: spec.xs, series: spec.series };
  const parts = (key, part) => [...root.querySelectorAll(`[data-series="${key}"][data-part="${part}"]`)];
  let cross = area.querySelector(".ix-cross");
  if (!cross) { cross = make(owner, "span", "ix-cross"); cross.setAttribute("aria-hidden", "true"); area.appendChild(cross); }
  const dots = new Map();
  for (const series of spec.series) {
    if (series.kind === "band") continue;
    const marker = make(owner, "span", "ix-pt" + (series.kind ? ` ix-pt--${series.kind}` : ""));
    marker.setAttribute("aria-hidden", "true");
    marker.setAttribute("data-series", series.key);
    area.appendChild(marker);
    dots.set(series.key, marker);
  }
  let hotSeries = null;
  const markHot = (key) => {
    hotSeries = key;
    root.toggleAttribute("data-hot", !!key);
    for (const each of keys) for (const element of root.querySelectorAll(`[data-series="${each}"]`)) element.toggleAttribute("data-cold", !!key && each !== key);
  };
  const draw = () => {
    for (const series of view.series) {
      if (series.kind === "band") { parts(series.key, "band").forEach((element) => element.setAttribute("d", bandPath(view.xs, series.lows || [], series.highs || []))); continue; }
      parts(series.key, "line").forEach((element) => element.setAttribute("d", smoothPath(view.xs, series.ys || [])));
      parts(series.key, "area").forEach((element) => element.setAttribute("d", areaPath(view.xs, series.ys || [], unitsHigh)));
    }
  };
  const render = (state) => {
    const index = state.shown;
    root.toggleAttribute("data-on", index >= 0);
    for (const series of spec.series) for (const element of root.querySelectorAll(`[data-series="${series.key}"]`)) element.toggleAttribute("data-dim", state.hidden.has(series.key));
    paintLegend(state);
    if (index < 0) { tooltip.hide(); speak.textContent = ""; return; }
    const across = (view.xs[index] / unitsWide) * 100;
    cross.style.left = `${across.toFixed(3)}%`;
    const rows = [];
    let topmost = unitsHigh;
    for (const series of view.series) {
      const meta = spec.series.find((each) => each.key === series.key) || series;
      const value = series.values?.[index];
      const marker = dots.get(series.key);
      const isOff = value === null || value === undefined || state.hidden.has(series.key);
      if (marker) {
        marker.toggleAttribute("data-off", isOff || !isNumber(series.ys?.[index]));
        if (!isOff && isNumber(series.ys?.[index])) {
          marker.style.left = `${across.toFixed(3)}%`;
          marker.style.top = `${((series.ys[index] / unitsHigh) * 100).toFixed(3)}%`;
          topmost = Math.min(topmost, series.ys[index]);
        }
      }
      if (isOff) continue;
      if (meta.kind === "band") {
        rows.push({ kind: "band", name: meta.name, value: `${formatValue(value[0], meta.unit)} to ${formatValue(value[1], meta.unit)}` });
        if (isNumber(series.highs?.[index])) topmost = Math.min(topmost, series.highs[index]);
      } else rows.push({ kind: meta.kind || "line", name: view.series.length > 1 ? meta.name : "", value: formatValue(value, meta.unit), change: changeText(changeOf(series.values, index), meta.unit) });
    }
    const label = view.x[index] ?? "";
    speak.textContent = lineTip({ x: view.x, series: view.series.map((series) => ({ ...(spec.series.find((each) => each.key === series.key) || {}), values: series.values })) }, index, state.hidden);
    const plot = boxOf(area), frame = boxOf(root);
    tooltip.show({ title: String(label), rows }, plot.left - frame.left + (across / 100) * plot.width, plot.top - frame.top + (topmost / unitsHigh) * plot.height);
  };
  const controller = createNav({ count: () => view.xs.length, keys, render });
  legendClicks(root, controller, markHot);
  const indexAt = (event) => nearestIndex(view.xs, fractionIn(area, event).across * unitsWide);
  const nearestSeries = (event, index) => {
    const position = fractionIn(area, event).down * unitsHigh;
    let best = null, distance = unitsHigh * 0.12;
    for (const series of view.series) {
      if (controller.state().hidden.has(series.key)) continue;
      const level = series.kind === "band" ? (isNumber(series.lows?.[index]) ? (series.lows[index] + series.highs[index]) / 2 : null) : series.ys?.[index];
      if (!isNumber(level)) continue;
      const distanceAway = Math.abs(level - position) + (series.kind === "band" ? unitsHigh * 0.06 : 0);   // a line wins over a band
      if (distanceAway < distance) { distance = distanceAway; best = series.key; }
    }
    return best;
  };
  const follow = rafThrottle((event) => {
    const index = indexAt(event);
    controller.hover(index);
    if (view.series.length > 1) { const closestKey = nearestSeries(event, index); if (closestKey !== hotSeries) markHot(closestKey); }
  });
  area.addEventListener("pointermove", follow);
  area.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") { root.setAttribute("data-scrub", ""); follow(event); } });
  area.addEventListener("pointerup", () => root.removeAttribute("data-scrub"));
  area.addEventListener("pointerleave", () => { root.removeAttribute("data-scrub"); markHot(null); if (controller.state().selected < 0) controller.hover(-1); });
  area.addEventListener("click", (event) => controller.select(indexAt(event)));
  keyboard(root, controller);

  // segmented toggles: morph every path from the current view to the chosen state's
  const states = Array.isArray(spec.states) ? spec.states.filter((each) => each && Array.isArray(each.xs) && Array.isArray(each.series)) : [];
  const toggles = [...root.querySelectorAll("[data-ix-state]")];
  let morphing = 0;
  const ticks = (holder, list, axis) => {
    if (!holder || !Array.isArray(list)) return;
    clearNode(holder);
    for (const [position, text, anchor] of list) {
      const tick = make(owner, "span", "", String(text));
      tick.style[axis === "y" ? "top" : "left"] = `${Number(position).toFixed(3)}%`;
      if (anchor) tick.setAttribute("data-anchor", anchor);
      holder.appendChild(tick);
    }
  };
  const setState = (key) => {
    const target = states.find((each) => each.key === key);
    if (!target) return false;
    toggles.forEach((button) => button.setAttribute("aria-pressed", String(button.getAttribute("data-ix-state") === key)));
    root.querySelectorAll("[data-ix-state-table]").forEach((table) => table.toggleAttribute("hidden", table.getAttribute("data-ix-state-table") !== key));
    const count = Math.max(view.xs.length, target.xs.length);
    const from = { xs: resample(view.xs, count), series: view.series.map((series) => ({ ...series, ys: resample(series.ys || [], count), lows: resample(series.lows || [], count), highs: resample(series.highs || [], count) })) };
    const goal = { xs: resample(target.xs, count), series: target.series.map((series) => ({ ...series, ys: resample(series.ys || [], count), lows: resample(series.lows || [], count), highs: resample(series.highs || [], count) })) };
    const finish = () => {
      view = { x: target.x, xs: target.xs, series: target.series };
      draw();
      ticks(root.querySelector("[data-ix-yticks]"), target.yticks, "y");
      ticks(root.querySelector("[data-ix-xticks]"), target.xticks, "x");
      const today = root.querySelector(".ix-today");
      if (today && isNumber(target.mark)) { today.style.left = `${Number(target.mark).toFixed(3)}%`; today.toggleAttribute("data-end", Number(target.mark) > 60); }
      root.removeAttribute("data-morph");
      controller.clear();
    };
    controller.clear();
    const schedule = globalThis.requestAnimationFrame;
    if (reduced || typeof schedule !== "function") { finish(); return true; }
    const token = ++morphing, start = performance.now(), duration = 620;
    root.setAttribute("data-morph", "");
    const frame = (now) => {
      if (token !== morphing) return;
      const progress = ease.inOut((now - start) / duration);
      const xValues = blendPoints(from.xs, goal.xs, progress);
      view = { x: target.x, xs: xValues, series: goal.series.map((series, k) => {
        const before = from.series.find((each) => each.key === series.key) || from.series[k] || series;
        return { ...series, ys: blendPoints(before.ys, series.ys, progress), lows: blendPoints(before.lows, series.lows, progress), highs: blendPoints(before.highs, series.highs, progress) };
      }) };
      draw();
      if (progress < 1) schedule(frame); else finish();
    };
    schedule(frame);
    return true;
  };
  toggles.forEach((button) => button.addEventListener("click", () => setState(button.getAttribute("data-ix-state"))));
  draw();
  onEnter(root, () => {});
  return Object.assign(controller, { setState, spec });
}

// ================================================================================================ bars
/**
 * bars(root): a bar list drawn by xw/ix.py bar_list(). Each [data-mark] row has data-tip (its exact value) and may have
 * data-break, a JSON list of [label, value] pairs: clicking the row (or Enter) opens that breakdown in a card under the
 * list. The bars grow in when the list enters view. Returns the controller, plus open(i) and close().
 */
export function bars(root) {
  const rows = [...root.querySelectorAll("[data-mark]")];
  if (!rows.length) return null;
  const owner = ownerOf(root);
  const tooltip = glassTip(root), speak = liveRegion(root);
  let drill = root.querySelector("[data-ix-drill]");
  if (!drill) {
    drill = make(owner, "div", "ix-drill");
    drill.setAttribute("data-ix-drill", "");
    drill.setAttribute("aria-live", "polite");
    root.appendChild(drill);
  }
  rows.forEach((row, index) => {
    row.style.setProperty("--k", String(index));
    if (row.querySelector(".ix-bar__chip")) return;
    const barTrack = row.querySelector(".ix-bar");
    if (!barTrack) return;
    const chip = make(owner, "span", "ix-bar__chip", modelOfTip(row.getAttribute("data-tip")).rows[0].value);
    chip.setAttribute("aria-hidden", "true");
    barTrack.appendChild(chip);
  });
  let opened = -1;
  const close = () => { opened = -1; clearNode(drill); drill.removeAttribute("data-show"); rows.forEach((row) => row.removeAttribute("aria-expanded")); };
  const open = (index) => {
    const barRow = rows[index];
    const parts = readJson(barRow?.getAttribute("data-break"), null);
    if (!Array.isArray(parts) || !parts.length) { close(); return false; }
    opened = index;
    const unit = barRow.getAttribute("data-unit") || "";
    const head = modelOfTip(barRow.getAttribute("data-tip"));
    clearNode(drill);
    const heading = make(owner, "div", "ix-drill__h");
    heading.appendChild(make(owner, "b", "", head.title || "Breakdown"));
    heading.appendChild(make(owner, "span", "num", head.rows[0].value));
    const shut = make(owner, "button", "ix-drill__x", "Close");
    shut.setAttribute("type", "button");
    shut.addEventListener("click", () => { controller.clear(); close(); });
    heading.appendChild(shut);
    drill.appendChild(heading);
    const most = Math.max(...parts.map((part) => Math.abs(Number(part[1]) || 0)), 1);
    const list = make(owner, "ul", "ix-drill__l");
    parts.forEach(([label, value], k) => {
      const item = make(owner, "li");
      item.style.setProperty("--k", String(k));
      item.appendChild(make(owner, "span", "", String(label)));
      const track = make(owner, "span", "ix-bar");
      const fill = make(owner, "i");
      fill.style.setProperty("--s", ((Math.abs(Number(value) || 0) / most)).toFixed(4));
      track.appendChild(fill);
      item.appendChild(track);
      item.appendChild(make(owner, "b", "num", formatValue(value, unit)));
      list.appendChild(item);
    });
    drill.appendChild(list);
    drill.setAttribute("data-show", "");
    rows.forEach((each, k) => each.toggleAttribute("aria-expanded", k === index));
    return true;
  };
  const render = (state) => {
    const index = state.shown;
    root.toggleAttribute("data-on", index >= 0);
    rows.forEach((row, k) => row.toggleAttribute("data-active", k === index));
    if (index < 0) { tooltip.hide(); speak.textContent = ""; if (opened >= 0 && state.selected < 0) close(); return; }
    speak.textContent = rows[index].getAttribute("data-tip") || "";
    if (state.selected === index && opened !== index) open(index);
    if (state.selected < 0 && opened >= 0) close();
  };
  const controller = createNav({ count: rows.length, render });
  rows.forEach((row, index) => {
    row.addEventListener("pointerenter", () => { if (controller.state().selected < 0) controller.hover(index); });
    row.addEventListener("pointerleave", () => { if (controller.state().selected < 0) controller.hover(-1); });
    row.addEventListener("click", () => controller.select(index));
  });
  keyboard(root, controller);
  onEnter(root, () => {});
  return Object.assign(controller, { open, close });
}

// ================================================================================================ marks (cycle 18)
/** marks(root): bars, segments, nodes or rows ([data-mark] with data-tip) that answer with their exact value. */
export function marks(root) {
  const items = [...root.querySelectorAll("[data-mark]")];
  if (!items.length) return null;
  const tooltip = glassTip(root), speak = liveRegion(root);
  const keys = [...new Set(items.map((item) => item.getAttribute("data-series")).filter(Boolean))];
  const paintLegend = legendPainter(root);
  const controller = createNav({ count: items.length, keys, render: (state) => {
    const index = state.shown;
    root.toggleAttribute("data-on", index >= 0);
    paintLegend(state);
    items.forEach((item, k) => {
      item.toggleAttribute("data-active", k === index);
      item.toggleAttribute("data-dim", state.hidden.has(item.getAttribute("data-series")) || (index >= 0 && k !== index && root.hasAttribute("data-ix-focus-dim")));
    });
    if (index < 0) { tooltip.hide(); speak.textContent = ""; return; }
    const text = items[index].getAttribute("data-tip") || "";
    speak.textContent = text;
    const mark = boxOf(items[index]), frame = boxOf(root);
    tooltip.show(modelOfTip(text), mark.left - frame.left + mark.width / 2, mark.top - frame.top);
  } });
  legendClicks(root, controller);
  items.forEach((item, index) => {
    item.addEventListener("pointerenter", () => controller.hover(index));
    item.addEventListener("pointerleave", () => { if (controller.state().selected < 0) controller.hover(-1); });
    item.addEventListener("click", () => controller.select(index));
  });
  keyboard(root, controller);
  return controller;
}

// ================================================================================================ steps (cycle 18)
// shared by steps() and flow(): elements with data-step="i" (one step may be drawn twice, in a card and on the rail),
// data-detail on the first is its sentence, and elements with data-on="0 1" light up with those steps
function stepParts(root) {
  const candidates = [...root.querySelectorAll("[data-step]")];
  const stepOf = (element) => Number(element.getAttribute("data-step"));
  const valid = candidates.filter((element) => Number.isInteger(stepOf(element)) && stepOf(element) >= 0);
  const count = valid.length ? Math.max(...valid.map(stepOf)) + 1 : 0;
  const detail = root.querySelector("[data-step-detail]");
  return { valid, count, stepOf, detail, idle: detail ? detail.textContent : "", lit: [...root.querySelectorAll("[data-on]")],
    sentence: (index) => valid.find((element) => stepOf(element) === index && element.hasAttribute("data-detail"))?.getAttribute("data-detail") || "" };
}

/** steps(root): a step-through diagram; choosing a step lights its path and shows its detail. */
export function steps(root) {
  const parts = stepParts(root);
  if (!parts.count) return null;
  const controller = createNav({ count: parts.count, render: (state) => {
    const index = state.shown;
    root.toggleAttribute("data-on", index >= 0);
    parts.valid.forEach((element) => {
      element.toggleAttribute("data-active", parts.stepOf(element) === index);
      element.toggleAttribute("data-sel", parts.stepOf(element) === state.selected);
    });
    parts.lit.forEach((element) => element.toggleAttribute("data-hl", index >= 0 && onPath(element.getAttribute("data-on"), index)));
    if (!parts.detail) return;
    if (index < 0) { parts.detail.textContent = parts.idle; parts.detail.removeAttribute("data-show"); return; }
    parts.detail.textContent = parts.sentence(index);
    parts.detail.setAttribute("data-show", "");
  } });
  parts.valid.forEach((element) => {
    const index = parts.stepOf(element);
    element.addEventListener("pointerenter", () => { if (controller.state().selected < 0) controller.hover(index); });
    element.addEventListener("pointerleave", () => { if (controller.state().selected < 0) controller.hover(-1); });
    element.addEventListener("click", () => controller.select(index));
  });
  keyboard(root, controller);
  return controller;
}

// ================================================================================================ flows
/**
 * flow(root): a diagram drawn by xw/ix.py flow(). Cards ([data-step] inside .ixf-stage) are joined by SVG edges drawn
 * here in pixels (crisp at any width, recomputed when the layout changes). Auto-play moves a glowing packet along each
 * edge in turn and lights the cards it reaches; the progress rail fills as it goes. Hovering or choosing a card pauses it;
 * choosing a card opens its record ([data-rec="i"]) under the diagram. The pause button stops it for good until Play.
 * Returns the controller plus play(), pause() and visible(on).
 */
export function flow(root, options = {}) {
  const parts = stepParts(root);
  const stage = root.querySelector(".ixf-stage");
  if (!parts.count || !stage) return null;
  const owner = ownerOf(root);
  const reduced = options.reduced ?? root.hasAttribute("data-reduced");
  const cards = [...stage.querySelectorAll("[data-step]")].sort((first, second) => parts.stepOf(first) - parts.stepOf(second));
  const railSteps = [...root.querySelectorAll(".ixf-rail [data-step]")];
  const records = [...root.querySelectorAll("[data-rec]")];
  const speak = liveRegion(root);
  // the edge layer: one SVG in the stage's own pixels, so every line is a real 1px hairline
  let layer = stage.querySelector(".ixf-edges");
  if (!layer) { layer = makeSvg(owner, "svg", { class: "ixf-edges", "aria-hidden": "true", focusable: "false" }); stage.insertBefore ? stage.insertBefore(layer, stage.firstChild) : stage.appendChild(layer); }
  const packet = makeSvg(owner, "g", { class: "ixf-packet", "aria-hidden": "true" });
  packet.appendChild(makeSvg(owner, "circle", { r: 12, class: "ixf-packet__glow" }));
  packet.appendChild(makeSvg(owner, "circle", { r: 4.5, class: "ixf-packet__dot" }));
  let edges = [];
  const layout = () => {
    const frame = boxOf(stage);
    if (!frame.width) return;
    layer.setAttribute("width", String(Math.round(frame.width)));
    layer.setAttribute("height", String(Math.round(frame.height)));
    layer.setAttribute("viewBox", `0 0 ${Math.round(frame.width)} ${Math.round(frame.height)}`);
    clearNode(layer);
    edges = [];
    for (let k = 0; k < cards.length - 1; k++) {
      const first = boxOf(cards[k]), second = boxOf(cards[k + 1]);
      const shape = edgeGeometry({ x: first.left - frame.left, y: first.top - frame.top, w: first.width, h: first.height },
        { x: second.left - frame.left, y: second.top - frame.top, w: second.width, h: second.height });
      const lights = Array.from({ length: parts.count - k - 1 }, (_, m) => k + 1 + m).join(" ");
      const track = makeSvg(owner, "path", { d: shape.path, class: "ixf-edge__track" });
      const dash = makeSvg(owner, "path", { d: shape.path, class: "ixf-edge", "data-on": lights, "data-edge": k });
      const head = makeSvg(owner, "path", { class: "ixf-head", "data-on": lights, "data-edge": k,
        d: shape.direction === "down" ? `M${shape.end.x - 4} ${shape.end.y - 5} L${shape.end.x} ${shape.end.y} L${shape.end.x + 4} ${shape.end.y - 5}`
          : `M${shape.end.x - 5} ${shape.end.y - 4} L${shape.end.x} ${shape.end.y} L${shape.end.x - 5} ${shape.end.y + 4}` });
      layer.appendChild(track); layer.appendChild(dash); layer.appendChild(head);
      edges.push({ element: dash, shape });
    }
    layer.appendChild(packet);
    parts.lit = [...root.querySelectorAll("[data-on]")];
    paintClock();
  };
  const pointOn = (edge, progress) => {
    const element = edge.element;
    try {
      if (typeof element.getTotalLength === "function") {
        const length = element.getTotalLength();
        const point = element.getPointAtLength(length * progress);
        return { x: point.x, y: point.y };
      }
    } catch { /* fall through to the straight line */ }
    const numbers = (element.getAttribute("d") || "").match(/-?\d+(\.\d+)?/g)?.map(Number) || [0, 0];
    const startX = numbers[0], startY = numbers[1], endX = numbers.at(-2), endY = numbers.at(-1);
    return { x: startX + (endX - startX) * progress, y: startY + (endY - startY) * progress };
  };
  // ---------------------------------------------------------------- auto-play
  const clock = createFlowClock({ edges: parts.count - 1 });
  const holds = new Set(reduced ? ["reduced"] : []);
  holds.add("offscreen");
  let frameId = 0, last = 0;
  const playButton = make(owner, "button", "ixf-play");
  playButton.setAttribute("type", "button");
  playButton.setAttribute("data-ixf-play", "");
  const playIcon = make(owner, "i", "ixf-play__i");
  playIcon.setAttribute("aria-hidden", "true");
  const playText = make(owner, "span", "", "Pause");
  playButton.appendChild(playIcon);
  playButton.appendChild(playText);
  const topBar = root.querySelector(".ixf-top") || root;
  topBar.appendChild(playButton);
  const playing = () => holds.size === 0;
  function paintClock() {
    const clockNow = clock.state();
    const showPacket = playing() || holds.has("hover") || holds.has("chosen") ? clockNow.phase === "travel" : false;
    root.toggleAttribute("data-auto", playing());
    cards.forEach((card, k) => {
      card.toggleAttribute("data-reached", k <= clockNow.reached && !root.hasAttribute("data-on"));
      card.toggleAttribute("data-now", k === clockNow.reached && clockNow.phase !== "travel" && !root.hasAttribute("data-on"));
    });
    railSteps.forEach((step) => step.toggleAttribute("data-done", parts.stepOf(step) <= clockNow.reached));
    const share = parts.count > 1 ? (clockNow.reached + (clockNow.phase === "travel" ? clockNow.progress : 0)) / (parts.count - 1) : 1;
    root.style.setProperty("--ixf-progress", clamp(share, 0, 1).toFixed(4));
    const edge = edges[clockNow.edge];
    packet.toggleAttribute("data-show", !!edge && showPacket && clockNow.phase === "travel");
    if (edge && clockNow.phase === "travel") {
      const point = pointOn(edge, ease.inOut(clockNow.progress));
      packet.setAttribute("transform", `translate(${round2(point.x)} ${round2(point.y)})`);
    }
    edges.forEach((each, k) => each.element.toggleAttribute("data-run", k === clockNow.edge && clockNow.phase === "travel"));
    const paused = holds.has("user") || holds.has("reduced");
    playButton.setAttribute("aria-pressed", String(paused));
    playButton.setAttribute("aria-label", paused ? "Play the flow" : "Pause the flow");
    if (playText.textContent !== (paused ? "Play" : "Pause")) playText.textContent = paused ? "Play" : "Pause";
  }
  const tick = (now) => {
    frameId = 0;
    clock.tick(now - last);
    last = now;
    paintClock();
    if (playing()) frameId = globalThis.requestAnimationFrame(tick);
  };
  const resume = () => {
    paintClock();
    if (playing() && !frameId && typeof globalThis.requestAnimationFrame === "function") { last = performance.now(); frameId = globalThis.requestAnimationFrame(tick); }
  };
  const hold = (reason) => { holds.add(reason); paintClock(); };
  const release = (reason) => { holds.delete(reason); resume(); };
  playButton.addEventListener("click", (event) => {
    event.stopPropagation?.();
    if (holds.has("user") || holds.has("reduced")) { holds.delete("user"); holds.delete("reduced"); controller.clear(); if (clock.state().phase === "rest") clock.reset(); }
    else holds.add("user");
    resume();
  });
  // ---------------------------------------------------------------- choosing a card
  const render = (state) => {
    const index = state.shown;
    root.toggleAttribute("data-on", index >= 0);
    parts.valid.forEach((element) => {
      element.toggleAttribute("data-active", parts.stepOf(element) === index);
      element.toggleAttribute("data-sel", parts.stepOf(element) === state.selected);
    });
    parts.lit.forEach((element) => element.toggleAttribute("data-hl", index >= 0 && onPath(element.getAttribute("data-on"), index)));
    records.forEach((record) => record.toggleAttribute("hidden", Number(record.getAttribute("data-rec")) !== index));
    root.toggleAttribute("data-rec-open", index >= 0 && records.some((record) => Number(record.getAttribute("data-rec")) === index));
    if (state.selected >= 0) holds.add("chosen"); else holds.delete("chosen");
    if (parts.detail) {
      if (index < 0) { parts.detail.textContent = parts.idle; parts.detail.removeAttribute("data-show"); }
      else { parts.detail.textContent = parts.sentence(index); parts.detail.setAttribute("data-show", ""); }
    }
    speak.textContent = index >= 0 ? parts.sentence(index) : "";
    if (index >= 0) { clock.seek(index); }
    resume();
  };
  const controller = createNav({ count: parts.count, render });
  parts.valid.forEach((element) => {
    const index = parts.stepOf(element);
    element.addEventListener("pointerenter", (event) => { if (event.pointerType === "touch") return; hold("hover"); if (controller.state().selected < 0) controller.hover(index); });
    element.addEventListener("pointerleave", (event) => { if (event.pointerType === "touch") return; if (controller.state().selected < 0) controller.hover(-1); release("hover"); });
    element.addEventListener("click", () => controller.select(index));
  });
  keyboard(root, controller);
  // ---------------------------------------------------------------- layout and life
  const relayout = rafThrottle(layout);
  try { if (typeof globalThis.ResizeObserver === "function") new globalThis.ResizeObserver(() => relayout()).observe(stage); } catch { /* the first layout stays */ }
  layout();
  onEnter(root, () => { layout(); release("offscreen"); });
  return Object.assign(controller, {
    play() { holds.delete("user"); holds.delete("reduced"); resume(); },
    pause() { hold("user"); },
    visible(on) { if (on) { if (root.hasAttribute("data-ix-in")) release("offscreen"); } else hold("offscreen"); },
    layout,
    clock,
  });
}

// ================================================================================================ tables
/**
 * table(root): a table drawn by xw/ix.py data_table(). Header buttons ([data-sort]) sort by their column (aria-sort,
 * with an arrow); a row with a detail row after it ([data-row] then [data-row-detail]) expands on click or Enter;
 * hovering a cell lights its column. Returns { sort(column, direction), toggle(row) }.
 */
export function table(root) {
  const body = root.querySelector("tbody");
  if (!body) return null;
  const owner = ownerOf(root);
  const rowsNow = () => [...body.querySelectorAll("tr[data-row]")];
  const headers = [...root.querySelectorAll("[data-sort]")];
  const sort = (column, direction) => {
    const header = headers.find((button) => Number(button.getAttribute("data-sort")) === column);
    if (!header) return false;
    const type = header.getAttribute("data-sort-type") || "text";
    const rows = rowsNow();
    const values = rows.map((row) => {
      const cell = row.querySelector(`[data-c="${column}"]`);
      return cell ? (cell.getAttribute("data-v") ?? cell.textContent.trim()) : "";
    });
    const order = sortOrder(values, type, direction);
    for (const index of order) {
      const tableRow = rows[index];
      const detail = tableRow.nextElementSibling?.hasAttribute?.("data-row-detail") ? tableRow.nextElementSibling : null;
      body.appendChild(tableRow);
      if (detail) body.appendChild(detail);
    }
    headers.forEach((button) => {
      const cell = button.closest("th") || button;
      const mine = button === header;
      cell.setAttribute("aria-sort", mine ? direction : "none");
      button.setAttribute("data-dir", mine ? direction : "");
    });
    return true;
  };
  headers.forEach((button) => button.addEventListener("click", () => {
    const currentDirection = button.getAttribute("data-dir");
    sort(Number(button.getAttribute("data-sort")), currentDirection === "ascending" ? "descending" : "ascending");
  }));
  const toggle = (row) => {
    const detail = row?.nextElementSibling;
    if (!detail?.hasAttribute?.("data-row-detail")) return false;
    const open = row.getAttribute("aria-expanded") !== "true";
    row.setAttribute("aria-expanded", String(open));
    detail.toggleAttribute("hidden", !open);
    const control = row.querySelector("[data-row-toggle]");
    control?.setAttribute("aria-expanded", String(open));
    return open;
  };
  body.addEventListener("click", (event) => {
    if (event.target?.closest?.("a")) return;
    const clickedRow = event.target?.closest?.("tr[data-row]");
    if (clickedRow && clickedRow.nextElementSibling?.hasAttribute?.("data-row-detail")) toggle(clickedRow);
  });
  root.addEventListener("keydown", (event) => {
    const focusedRow = event.target?.closest?.("tr[data-row]");
    if (focusedRow && (event.key === "Enter" || event.key === " ") && event.target === focusedRow) { event.preventDefault?.(); toggle(focusedRow); }
  });
  const column = rafThrottle((event) => {
    const cell = event.target?.closest?.("[data-c]");
    const index = cell ? cell.getAttribute("data-c") : null;
    if (root.getAttribute("data-col") === index) return;
    if (index === null) root.removeAttribute("data-col"); else root.setAttribute("data-col", index);
    root.querySelectorAll("[data-c]").forEach((each) => each.toggleAttribute("data-col-on", index !== null && each.getAttribute("data-c") === index && index !== "0"));
  });
  root.addEventListener("pointerover", column);
  root.addEventListener("pointerleave", () => { root.removeAttribute("data-col"); root.querySelectorAll("[data-col-on]").forEach((each) => each.removeAttribute("data-col-on")); });
  headers.forEach((button) => {
    if (button.querySelector(".ixt-arrow")) return;
    const arrow = make(owner, "i", "ixt-arrow");
    arrow.setAttribute("aria-hidden", "true");
    button.appendChild(arrow);
  });
  return { sort, toggle };
}

// ================================================================================================ KPI tiles
/**
 * kpiTile(root): KPI tiles drawn by xw/ix.py kpi_tile(). Each [data-count] value counts up from data-from (default 0) to
 * data-to in its unit the first time the tile enters view; the sparkline inside is its own line() chart; the delta chip
 * is drawn by the build. Returns { run() } (count up now).
 */
export function kpiTile(root, options = {}) {
  const values = [...root.querySelectorAll("[data-count]")];
  if (!values.length) return null;
  // cycle 24: figures arrive already counted; a count-up only plays when a caller asks for it ({ reduced: false })
  const reduced = options.reduced ?? true;
  let started = false;
  const runCountUp = () => {
    if (started) return;
    started = true;
    values.forEach((element, k) => {
      const target = Number(element.getAttribute("data-to"));
      if (!Number.isFinite(target)) return;
      const from = Number(element.getAttribute("data-from") || 0);
      const unit = element.getAttribute("data-unit") || "";
      const start = () => countUp(element, target, { from, unit, reduced, duration: 1100 });
      if (reduced || k === 0) start(); else setTimeout(start, k * 90);
    });
  };
  onEnter(root, runCountUp);
  return { run: runCountUp };
}

// ================================================================================================ binding
const KINDS = { line, bars, marks, steps, flow, table, kpi: kpiTile };

/** Wire one visual by its data-ix kind. Returns its controller, or null if it has nothing to wire. */
export function bind(root, options = {}) {
  if (!root || root._ixNav) return root?._ixNav || null;
  const kind = root.getAttribute("data-ix");
  const binder = KINDS[kind];
  if (!binder) return null;
  let controller = null;
  try { controller = binder(root, options); } catch (error) {
    root.setAttribute("data-ix-failed", "");
    globalThis.console?.warn?.("[xevrion] visual stayed static", kind, error);
    return null;
  }
  if (controller) {
    root._ixNav = controller;
    root.setAttribute("data-ix-live", "");
    if (root.getAttribute("tabindex") === "0") trackUse(root);
  }
  return controller;
}

/** core.js entry: the visual came near the screen. A host may hold several visuals ([data-ix] inside it). */
export function mount(host, { reduced = prefersReduced() } = {}) {
  const roots = host.hasAttribute("data-ix") ? [host, ...host.querySelectorAll("[data-ix]")] : [...host.querySelectorAll("[data-ix]")];
  const bound = roots.map((root) => { if (reduced) root.setAttribute("data-reduced", ""); return bind(root, { reduced }); }).filter(Boolean);
  return { visible(on) { bound.forEach((controller) => controller.visible?.(on)); } };
}
