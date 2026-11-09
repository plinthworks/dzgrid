// @vitest-environment node
// `<dz-grid>` on a server (web-component.md 2): no DOM, importing either entry never throws, defining does nothing.
import { it, expect } from 'vitest';

it('imported on a server (no DOM): nothing throws, defining does nothing', async () => {
  const m = await import('../src/define.js');
  expect([typeof m.DzGridElement, typeof HTMLElement, (() => (m.defineDzGrid('dz-grid-x'), 'ok'))()]).toEqual(['function', 'undefined', 'ok']);
});
