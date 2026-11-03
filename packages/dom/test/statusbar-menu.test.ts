// « Read the totals » in the cell menu (Phase 9 SB2, status-bar.md 8, context-menu.md « Read the totals »; owner Q-SB3):
// with `use: { status }`, a last item on a cell inside the block; it says the strip's figures once, the focus back on
// the cell. Absent outside a block or without `use.status`. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { statusBar } from '../src/statusbar.js';
import { EN_STATUS } from '../src/locales/en-status.js';
import { AR_STATUS } from '../src/locales/ar-status.js';
import { cleanup, cmake, CMSG, R_ } from './support-context-menu.js';

afterEach(cleanup);

const withStatus = (lang: 'en' | 'ar', use = true) => {
  const sb = statusBar();
  const b = CMSG[lang];
  const t = cmake({ lang, messages: { ...b, text: { ...b.text, ...(lang === 'ar' ? AR_STATUS : EN_STATUS).text } }, more: [sb], menu: ({ range }) => ({ use: { range, ...(use && { status: sb }) } }) });
  t.focusAt('r2', 'n');
  // r2–r4 × n, s, q: n 2 3 4, q 74 10 47.
  t.api().set(R_(['r2', 'n'], ['r4', 'q']));
  return t;
};

for (const lang of ['en', 'ar'] as const)
  describe(`${lang === 'ar' ? 'RTL' : 'LTR'}: Shift+F10 on a cell of the block`, () => {
    it('« Read the totals » is the last item; Enter says the figures once, the focus back on the cell', () => {
      const t = withStatus(lang);
      t.cell('r2', 'n')!.focus();
      t.key('F10', { shiftKey: true });
      expect(t.entries().at(-1)).toBe('status.read');
      expect(t.entries().at(-2)).toBe('|');
      expect(t.item('status.read')!.textContent).toContain(lang === 'ar' ? 'قراءة المجاميع' : 'Read the totals');
      const before = t.said().length;
      t.key('End');
      expect(t.focused()).toBe('status.read');
      t.key('Enter');
      const said = t.said().slice(before);
      expect(said).toEqual([lang === 'ar' ? 'العدد: 9، المجموع: 140، المتوسط: 23.33، الأدنى: 2، الأقصى: 74' : 'Count: 9, Sum: 140, Average: 23.33, Min: 2, Max: 74']);
      expect(t.list()).toBeNull();
      expect(document.activeElement).toBe(t.cell('r2', 'n'));
    });
  });

it('outside the block (the cell alone): no « Read the totals »', () => {
  const t = withStatus('en');
  t.rclick(t.cell('r7', 'q')!);
  expect(t.ids()).not.toContain('status.read');
});

it('without use.status: no « Read the totals »', () => {
  const t = withStatus('en', false);
  t.cell('r2', 'n')!.focus();
  t.key('F10', { shiftKey: true });
  expect(t.ids()).not.toContain('status.read');
});
