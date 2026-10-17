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

Later phases add `sort`, `filter-*`, `server-gate`, `edit-saves`, `paste-plan`, …
