# Xevrion visuals: the v2 interaction API

For the agents applying v2 to the agent pages (cycle 19, phase 2). The build draws every visual as HTML and SVG
(`xw/ix.py`); `src/js/viz-ix.js` adds the interaction. Never draw a visual by hand. Call the Python helper; it writes the
markup the script expects, the hidden data table and the labels.

## Rules every visual keeps

- **Colour.** Use only greys and the purple ramp: `#5d3fe0`, `#6b4ff0`, `#a796f8`, `#8b74f5`, `#b9adfa` and `#ddd7fd`.
  Green, amber and red appear only on labels (`UI.lab`). Show direction with ▲ and ▼ and a sign, never with colour.
  Purple buttons are outlines.
- **Resolution.** Text is never inside a stretched SVG. Axis labels, values and cards are HTML at fixed sizes. Plot
  lines use `vector-effect: non-scaling-stroke`, and grid lines are 1px HTML rules.
- **Labelling.** Each visual is one tab stop (`tabindex="0" role="group"`) with an `aria-label` that says what it shows.
  The keyboard hint is added by `IX.root()`.
- **Data.** The numbers are always present without the script, in a hidden table or in the table itself.
- **Loading.** `data-viz="ix"` makes `core.js` load `viz-ix.js` lazily (IntersectionObserver). Nothing to do.
- **Copy.** Words a visual adds are hidden from the page's word count only if they repeat something: the hidden tables,
  `data-step-detail`, the records, `aria-hidden` previews. Prose still counts (the homepage limit is 650 words).

## Python helpers (`from .. import ix as IX`)

| Kind | Call | What the visitor gets |
|---|---|---|
| Line or area | `IX.line_chart(label=, caption=, x=, series=, lo=, hi=, ticks=, tick_fmt=, x_ticks=, mark_at=, mark_text=, note=, states=[(key, text, overrides)], state_label=)` | A crosshair that snaps to the nearest point, with a dot on each line. A glass tooltip gives the label, each value and its change since the previous point (▲/▼, the amount and the %). Hovering a line dims the others. Clicking a legend key isolates it. The chart draws in from left to right and its soft gradient fades up. Segmented toggles morph the paths between states. On touch screens, dragging scrubs along the line. |
| Sparkline | `IX.spark(label=, values=, days=, unit=)` | The line chart's behaviour at a small size. |
| Bars | `IX.bar_list(label=, caption=, rows=[(name, value, of, extra, [(part, value), ...]?)], unit=)` | The bars grow in. Hovering lifts a bar and shows a value chip. Clicking or pressing Enter on a bar that has a breakdown opens a breakdown card; Escape closes it. |
| Flow | `IX.flow(label=, steps=[{title, text, chip, out, lane?, you?, detail, record=[(term, value)], record_title?}], idle=, lanes=[(key, name, sub)]?, title_tag="h3"|"h4"|"b")` | Numbered cards joined by SVG edges with moving dashes. A glowing packet travels each edge in turn, and a Pause/Play button controls it. A progress rail runs across the top. Clicking a card opens its example record under the diagram. With `lanes`, the cards sit in swimlanes. On phones the cards stack one per line. |
| Box flow | `UI.boxes(steps, label=, agent=, records=?, idle=?)` | A flow built from the agent pages' `(title, what, who, out)` steps. |
| Table | `IX.data_table(caption=, heads=, rows=, sortable=(cols), numeric=(cols), details=[text or None], raw=False, center=(cols), label=)` | Row hover and column hover. Sortable headers with an arrow and `aria-sort`. A row with a detail expands on click or Enter. The header is sticky on wide screens. |
| KPI tile | `IX.kpi_tile(label=, value=, unit=, series=, days=, versus=, passive=False)` | The value counts up when the tile comes into view. The sparkline answers on hover. A delta chip (▲/▼) shows the change. Use `passive=True` inside a link: the tile is then a picture for pointer users, not a tab stop. |
| Marks / steps | `IX.root("marks"|"steps", ...)` with `IX.mark(tip)`, `IX.steps_attrs(i, detail)`, `IX.lights(*steps)`, `IX.detail_panel(idle)` | The cycle 18 kinds, kept for roadmaps, clause lists and timelines. |

The formats are the same in Python (`IX.money(value, unit)`) and in JS (`formatValue`). The units are `gbp`, `gbp2`, `h`,
`pct`, `days` and plain.

## JS (`viz-ix.js`)

Each kind has one call. Each call takes the root and returns a controller. `bind(root)` picks the call from the root's
`data-ix`, and `mount(host)` is what `core.js` calls.

```js
line(root)  -> { hover(i), press(key), select(i), legend(key), clear(), state(), refresh(), setState(key) }
bars(root)  -> { ...controller, open(i), close() }
flow(root)  -> { ...controller, play(), pause(), visible(on), layout(), clock }
table(root) -> { sort(column, "ascending" | "descending"), toggle(row) }
kpiTile(root) -> { run() }
marks(root), steps(root) -> controller
```

The pure helpers are exported and tested (`tools/test_viz_v2.mjs`, `tools/test_viz_ix.mjs`):

- **Points and keys:** `nearestIndex`, `keyStep`.
- **Text and numbers:** `formatValue`, `lineTip`, `changeOf`, `changeText`.
- **Series:** `isolate`, `hiddenFor`, `resample`, `blendPoints`.
- **Paths:** `smoothPath`, `areaPath`, `bandPath`. They draw a monotone cubic identical to `xw/ix.py`.
- **Tables and flows:** `sortOrder`, `edgeGeometry`, `createFlowClock`.
- **Pointer and motion:** `rafThrottle`, `hintLabel`, `countUp`, `ease`, `prefersReduced`, `coarsePointer`.
- **Data:** `readJson`.

## Behaviour every visual gets from `bind()`

- **Affordance.** Until the first interaction a "Hover to explore" chip shows ("Tap to explore" on touch screens).
- **Keyboard.** The arrow keys move, Home and End jump, Enter pins, and Escape clears. A polite live region reads each
  value.
- **Motion.** Pointer work is throttled to one update per animation frame. With reduced motion nothing animates: the
  flow does not auto-play, and count-ups show their final value.
- **Errors.** If the JSON or the DOM is broken, the visual stays static and gets `data-ix-failed`. The page never breaks.

## Applying v2 to an agent page: checklist

1. Replace any hand-drawn chart with the helper above. Keep the label honest and specific.
2. Give every flow step a `record` taken from `xw/agent_scenes.json` or `tools/portal_demo_fixtures.py`. Never type
   figures in by hand.
3. Give a bar a breakdown only when the example data has one.
4. Run `python build.py --strict`, `node tools/test_viz_ix.mjs` and `node tools/test_viz_v2.mjs`, and then look at the
   page at 1440 px and at 390 px with DPR 2.
