// Feedback pass D (docs/phase-6-steps/feedback-plan.md item 5, owner Q3): `ui.data` is the open bag, kept by reference on the
// resolved column (`column.def.ui.data`). The unknown keys are told by the DOM layer at setup (packages/dom/test/feedback-parts.test.ts):
// the core ships no byte for it (`unknown-ui-key` is a `ProblemCode` by type).
import { describe, it, expect } from 'vitest';
import { resolveColumns, PROBLEM_CODES, type ProblemCode } from '@dzgrid/core';

describe('ui: the data bag', () => {
  it('ui.data is kept by reference on the resolved column; the core says nothing of ui keys', () => {
    const data = { pillOptions: [{ value: 'a', tone: 'green' }] };
    const { columns, problems } = resolveColumns([{ id: 'a', ui: { cell: 'x', data } }, { id: 'b', ui: { tone: 1 } as never }]);
    expect(problems).toEqual([]);
    expect(columns[0]!.def.ui!.data).toBe(data);
  });

  it('unknown-ui-key is a problem code by type, not in the core\'s runtime list', () => {
    const code: ProblemCode = 'unknown-ui-key';
    expect((PROBLEM_CODES as readonly string[]).includes(code)).toBe(false);
  });
});
