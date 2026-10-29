# DzGrid conformance suite

Language-independent cases: an input, and the output any implementation of
DzGrid's core must produce. The TypeScript core runs them today
(`runner/runner.test.ts`); another implementation would read the same files.

## Format

One case per file, `cases/<suite>/<id>.json`, validated by `schema/case.schema.json`:

```json
{ "id": "…", "suite": "zone-day-bounds", "description": "…", "refs": ["AGG#1234"],
  "input": { … }, "expected": { … } }
```

- Values are ISO 8601 strings, numbers, booleans or null — nothing specific to one language.
- Expected values are written **by hand**, from the published zone rules or the
  calendar's arithmetic, never generated from an implementation's output.
- `refs` cites the public issue whose symptom a case covers.

## Suites

| Suite | Input | Expected |
|---|---|---|
| `zone-day-bounds` | `{day, zone}` | `{from, to}` — start inclusive, end exclusive, ISO UTC |
| `day-arith` | `{op: 'toEpochDay' \| 'fromEpochDay' \| 'parse' \| 'add', …}` | `{epochDay}` or `{day}` (null when refused or out of range) |
| `instant-parse` | `{text, assumeZone?, disambiguation?}` | `{instant}` (ISO UTC) with an optional `warning`, or `{instant: null, code}` |
| `row-key` | `{ids}` | `{accepted[], problems: [code, path][]}` |
| `server-gate` | `{steps: (begin \| settle \| reject \| cancel \| newEpoch \| destroy)[]}` | `{outcomes, aborted: [ticket, reason][], diagnostics}` |
| `source-model` | `{columns, operations, pagination, options?, steps: (query \| go \| size \| refresh \| purge \| swap \| ctx \| destroy \| answer \| fail)[]}`, calls named `c1`, `c2`… | `{calls, aborted: [call, reason][], changes: kind[], final: {status, displayed, page, counts}, problems, failures}` |
| `wire` | `{locale, timeZone, columns, filter, kinds?}` (`kinds` from the suite's fixture table: `between`, `throws`, `bad-json`) | `{filter, problems?: [code, path][]}`: the filter as the server receives it, through JSON |
| `spans` | `{columns, rows, order?, state?, fullWidth?}` (rules by fixture name from `runner/spans-fixtures.ts`) | `{cells: {row, col, rows, cols}[], fullWidth?: rows[], problems}`: every span, in reading order |
| `header-bands` | `{columns (a tree of groups), state?}` | `{depth, levels: {group, first, count, label}[][], problems}` |
| `keyboard-move` | `{rows, cols, page?, cells?, fullWidth?, start, keys: Intent[]}` | `{moves: ({to, goal} \| null)[]}`, each key from where the last one went |
| `tree` | `{rows: {id, p?, n, t?}[], tree?: {filter?, initial?}, fixed?: ids (`fixedOpen`, 1.1.0), page?, steps?: ({expand, expanded?} \| {expandAll, depth?} \| {sort} \| {filter} \| {quick} \| {tx})[]}` or `{conflicts}` | `{shown: ". . id pos/size [muted]"[], expansion: ids[], counts, problems}` (Phase 4 step 3), or `{problems}` |
| `detail` | `{rows: {id, n, t?}[], detail?: {height?, initial?}, page?, csv?, steps?: ({expand, expanded?} \| {expandAll} \| {sort} \| {filter} \| {page} \| {select: 'all'} \| {toggle} \| {range} \| {tx})[]}` (`height` a number or `"n*k"`; `>id` a detail's key) or `{conflicts}` | `{shown: ("id" \| "> id")[], expansion, counts, heights, page, problems, refused?, selection?, csv?}` (Phase 4 step 8), or `{problems}` |
| `edit-order` | `{columns, rows, shape?: 'tree' \| 'path' \| 'detail', tree?, detail?, page?, query?, steps: ({edit: [id, column, value]} \| {reapply: source} \| {sort} \| {filter} \| {quick} \| {resize: [column, width]} \| {state} \| {tx} \| {expand: ids})[]}`, edits through a test overlay (a version per edit, `edits.reader` with the column) | `{shown, stale: orderStale after each step, changes: [kind, source][]}` (Phase 5 step 2, edit-reapply.md) |
| `editable` | `{columns (editable true, false, any value, or `{rule}` from the runner's table: `context-allows`, `row-ok`, `says-yes`, `throws`), rows, shape?, steps: ({ask: [key, column]} \| {app} \| {lock: ids} \| {expand: ids})[]}`; keys `id`, `>id` (detail), `/a/b` (filler), `~id` (loading row) | `{answers: boolean[], problems}` (Phase 5 step 2, editing.md 1–2) |
| `edit-input` | `{locale, timeZone?, numerals?, columns (`validate` / `edit.options` as `{fn}` from the runner's table: `negative`, `empty-string`, `not-string`, `throws`, `context-says`, `context-options`, `row-options`; `editable` `{fn: 'row-ok'}`; `edit.pattern` as `{regex, flags}` for a RegExp), rows, app?, steps: ({check: [id, column, input]} \| {app} \| {lock: ids} \| {columns: defs})[]}`; an input `{text}` is typed, anything else a value given; `>id` a detail row | `{results: ({value} \| {code})[], problems}`; an instant as ISO UTC (Phase 5 step 3, edit-validation.md 1, 8–11) |
| `edit-saves`, `undo` | `{columns, rows, model?: 'source' (a fake source, pages of 2), save?: 'held' \| 'none' \| 'void' \| 'throw', query?, watch: ['id.column'], events?: prefixes, steps: ({commit: [[id, column, input]], origin?, source?} \| {ok: g} \| {fail: g, error} \| {undo} \| {redo} \| {tx} \| {load} \| {answer: {call, rows, total}} \| {page} \| {sort} \| {reapply} \| {setSave} \| {destroy})[]}`; a held save answers when a step settles its generation, in any order | the keys the case states, among `{results, requests, after, final, events, shown, intact, dirty, canUndo, canRedo, calls}` (Phase 5 step 3, edit-save.md, edit-undo.md) |
| `range-box` | `{shown (row tokens: `a`, `(a)` muted, `> a` a detail, `/x` a filler, `~a` a loading row), columns, state?, range: {anchor: [row, column], focus: [row, column]}}` | `{box: {top, bottom, start, end} \| null, rows, columns, size}` (Phase 5 step 10, range-selection.md 1–6) |
| `clipboard-tsv` | `{encode: string[][]}` or `{decode: text, pad?}` | `{text}` or `{rows}` (Phase 5 step 10, clipboard.md 10–11; spike S7's 14 decoding cases) |
| `paste-plan` | `{shown, columns, state?, src: (text \| {value})[][], at: box, max?}` | `{cells: [row, column, {text} \| {value}][], outside, tooBig, box}` (Phase 5 step 10, clipboard.md 14–21) |
| `fill-plan` | `{shown, rows: {id: fields}, columns, edits?: {"id.column": value}, src: box, to: {row, col}, along?: 'row' \| 'column' (1.1.0, fill.md 26), mode?, swap?, only?: 'target'}` | `{target: {box, way} \| null, cells: [row, column, {value}][]}` (instants ISO; Phase 5 step 10, fill.md 3–8) |

Later phases add `sort`, `filter-*`, `server-gate`, …
