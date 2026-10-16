import { describe, it, expect, expectTypeOf } from 'vitest';
import { INTENT_OWNERS, intentFor, type Intent, type KeyOwner } from '@dzgrid/core';

const k = (key: string, m: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...m });

describe('keyboard intents', () => {
  it('list an owner for every intent kind', () => {
    expectTypeOf<keyof typeof INTENT_OWNERS>().toEqualTypeOf<Intent['kind']>();
  });

  it('give no intent to owners that are not the grid, whatever the key', () => {
    const keys = ['ArrowDown', 'ArrowRight', 'Home', 'End', 'PageDown', ' ', 'Enter', 'a'];
    for (const owner of ['editor', 'filter-input', 'popup', 'outside'] as KeyOwner[])
      for (const key of keys) for (const ctrlKey of [false, true])
        expect(intentFor(k(key, { ctrlKey }), { dir: 'ltr', owner, mac: false }), `${owner} ${key}`).toBeNull();
  });

  it('mirror every inline intent in RTL and nothing else', () => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', ' ', 'a'];
    const flip = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' } as Record<string, string>;
    for (const key of keys) for (const ctrlKey of [false, true]) {
      const ltr = intentFor(k(key, { ctrlKey }), { dir: 'ltr', owner: 'cell', mac: false });
      const rtl = intentFor(k(flip[key] ?? key, { ctrlKey }), { dir: 'rtl', owner: 'cell', mac: false });
      expect(rtl, `${key} ctrl=${ctrlKey}`).toEqual(ltr);
    }
  });
});
