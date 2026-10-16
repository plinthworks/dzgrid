# Reading a date-time

## What the user does
Types or pastes a date with a time into an instant column or filter, or the
host loads rows whose timestamps are text.

## What they observe elsewhere
Most tools read a date-time without an offset in the machine's zone, so the
same file shows different moments on two computers, and a log entry can sit
an hour away from where it happened. Around a clock change, a time that never
existed (02:30 on the spring change in Paris) is silently moved, and a time
that existed twice (02:30 in autumn) silently picks one of the two.

## What DzGrid does
- A text with an offset (`Z`, `+01:00`, `+0100`) is that instant. The offset
  always wins over any zone the column assumes.
- A text without an offset is refused as `ambiguous-instant` unless the
  column (or the host) says which zone it was written in (`assumeZone`).
  The machine's zone is never used.
- Inside a clock change, the reading follows `disambiguation`, with Temporal's
  names: `compatible` (default) reads a skipped time as if the clock had not
  changed yet — 02:30 becomes 03:30 — and a repeated time as its first
  occurrence; `earlier` and `later` choose the other ways; `reject` refuses.
  Every chosen reading carries a warning (`wall-time-skipped`,
  `wall-time-ambiguous`), so the interface can say "this time did not exist,
  read as 03:30".
- A zone the engine does not know is `unknown-zone`, not the machine's zone.
- Out of range (beyond ±8.64e15 ms), hour 24, minute or second 60: `invalid-instant`.

## Tests
`conformance/cases/instant-parse/*` (Paris, Los Angeles, São Paulo 2018,
Samoa 2011, Lord Howe), `packages/core/test/instant.test.ts`.
