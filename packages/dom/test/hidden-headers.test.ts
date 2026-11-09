// A grid without column headers on screen (docs/behaviors/hidden-headers.md, 1.9.0). jsdom checks the attribute, the
// structure kept and the injected rules; the screen itself is checked in Chrome (scripts/browser-headers.mjs).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, emake } from './support-edit.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { preparePrint } from '../src/print.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { EN } from '../src/locales/en.js';

afterEach(cleanup);

describe('headers: hidden', () => {
  it('marks the root, live both ways; absent or shown: no mark', () => {
    const m = emake({ settings: { headers: 'hidden' } });
    expect(m.host.querySelector('.dzg')!.getAttribute('data-headers')).toBe('hidden');
    m.g.update({ headers: 'shown' });
    expect(m.host.querySelector('.dzg')!.hasAttribute('data-headers')).toBe(false);
    m.g.update({ headers: 'hidden' });
    expect(m.host.querySelector('.dzg')!.getAttribute('data-headers')).toBe('hidden');
    expect(emake().host.querySelectorAll('[data-headers]')).toHaveLength(0);
  });

  it('keeps the header rows, their roles, names and indexes (2)', () => {
    const shown = emake();
    const hidden = emake({ settings: { headers: 'hidden' } });
    const shape = (h: HTMLElement) => [...h.querySelectorAll('.dzg-header [role]')].map((e) => [e.getAttribute('role'), e.getAttribute('aria-label'), e.getAttribute('aria-rowindex'), e.getAttribute('aria-colindex')]);
    expect(shape(hidden.host)).toEqual(shape(shown.host));
    expect(hidden.vp.getAttribute('aria-rowcount')).toBe(shown.vp.getAttribute('aria-rowcount'));
  });

  it('hides every header row from the eyes only, written on the rows, and shows them while the focus is in the header (1, 4)', () => {
    const m = emake({ settings: { headers: 'hidden' } });
    const rows = () => [...m.host.querySelectorAll<HTMLElement>('.dzg-header > .dzg-hrow')].map((r) => [r.style.position, r.style.clipPath]);
    expect(rows()).toEqual([['absolute', 'inset(50%)']]);
    m.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'n' } }, 'api');
    m.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.focus();
    m.g.update({});
    expect(rows()).toEqual([['', '']]);
    m.g.update({ headers: 'shown' });
    m.vp.focus();
    m.g.update({});
    expect(rows()).toEqual([['', '']]);
    // Nothing in the layout sheet: the rule is the paint's (no public stylesheet changed).
    expect(LAYOUT_CSS).not.toContain('data-headers');
  });

  it('prints its header row unless told not to (6)', async () => {
    const m = emake({ settings: { headers: 'hidden', messages: { locale: 'en', text: { ...EN.text, ...EN_PRINT.text } } } });
    const done = await preparePrint(m.g);
    expect(document.querySelectorAll('.dzg-print thead th')).toHaveLength(m.g.kernel.columns.visible().length);
    done!();
    const off = await preparePrint(m.g, { header: false });
    expect(document.querySelector('.dzg-print thead')).toBeNull();
    expect(document.querySelectorAll('.dzg-print tbody tr').length).toBeGreaterThan(0);
    off!();
  });
});
