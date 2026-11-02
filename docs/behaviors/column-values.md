# Reading a cell's value

## What the user does

The application gives columns and rows. A column reads its value with `value(row)`, or from `field`, or from its
`id`. `field` and an `id` read as a path: `address.city` reads `row.address.city`, own properties only.

## What they observe

- A column with `value` shows what it returns; with `field`, what the path reaches; with neither, what its `id`
  reaches. Nothing reached: an empty cell.
- **Ids with a dot (1.2.0, found in an Angular app 2026-10-30).** An id built from data, such as an ISO instant
  (`s2026-10-30T10:15:00.000Z`), holds « . ». Read as a path it reached nothing and the column stayed empty, without a
  word. Now, with no `field` and no `value`, such an id reads the row's **own property of that exact name first**,
  then the path: `{ 's2026-10-30T10:15:00.000Z': 4 }` shows 4, and `address.city` over `{ address: { city } }` still
  reads the city. When a row has both (`{ 'a.b': 1, a: { b: 2 } }`), the exact name wins: it is the id as written.
  An inherited property is never read. An explicit `field` is a path only, as before.
- An id that is no valid path (an empty segment, `__proto__`, `constructor`, `prototype`) is still refused
  (`invalid-field-path`), the column dropped.

## What DzGrid does

Every reading goes through the column's one reader (`ResolvedColumn.read`): the screen, sort, filters, export,
print, the clipboard and merges read the same value. The server wire sends column ids, never values: a server reads
its rows itself.

## Tests

`packages/core/test/columns-dotted-id.test.ts`; `packages/core/test/columns.test.ts` (paths).
