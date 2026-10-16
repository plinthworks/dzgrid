# DzGrid

A data grid written from scratch in TypeScript: a pure core with no DOM and no
dependency, a DOM layer, a theme, and an Angular wrapper. Right-to-left,
Arabic and screen readers are designed in from the start.

**Status: Phase 0 (scaffolding and spikes).** Nothing to install yet.

- `ARCHITECTURE.md` — the plan, with the owner's decisions on top.
- `ROADMAP.md` — what is done, what is next, what the spikes measured.
- `CLEANROOM.md` — DzGrid borrows *behaviour* from other grids, never code.

Sister projects: [tzslot](../tzslot) (date and time pickers on Temporal) and
[DzCalendar](../dzcalendar) (calendar and scheduler).

## Developing

```bash
npm install            # legacy-peer-deps is set in .npmrc
npm test               # core and conformance, in node
npm run test:tz        # the same in Auckland and Los Angeles
npm run typecheck
npm run build
npm run check:size     # minified + gzipped, against size-budget.json
npm run bench          # minified, against perf/budgets.json
npm run spike          # Phase 0 spikes in Chrome, Firefox and WebKit, one at a time
npm start              # playground on http://localhost:4700
```

MIT — see `LICENSE`.
