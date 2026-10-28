# @dzgrid/core

The model of [DzGrid](https://github.com/plinthworks/dzgrid), a data grid written from scratch: typed row
identities, calendar days kept apart from instants, sorting, filtering, quick search, selection, paging, server
rows. No DOM, no framework, no `Date`, no dependency: the same results in Node and in the browser.

Most applications install it beside [`@dzgrid/dom`](https://www.npmjs.com/package/@dzgrid/dom), which draws the
grid; the core alone serves a server, a test or another renderer.

## Install

```sh
npm install @dzgrid/core
```

## A first use

```ts
import { parseDay, zoneDayBounds } from '@dzgrid/core';

const day = parseDay('2026-03-05');               // a calendar day, never a Date
if (day) {
  const { from, to } = zoneDayBounds(day, 'Africa/Algiers'); // that day in that zone, half-open, in ms
  console.log(from, to);
}
```

Rows from a server, with a request gate that shows only the answer to the last request:

```ts
import { sourceRows } from '@dzgrid/core/server';

const source = sourceRows({ fetch: (req) => api.patients(req) }); // req: filters, sort, page, abort signal
```

## Documentation

- [The project's README](https://github.com/plinthworks/dzgrid#readme): what DzGrid is, every entry and its size.
- [Behaviour sheets](https://github.com/plinthworks/dzgrid/tree/main/docs/behaviors): one per behaviour, with its tests.
- [Changelog](https://github.com/plinthworks/dzgrid/blob/main/CHANGELOG.md).

MIT licence.
