// The cell menu's Excel text is optional (owner, 2026-11-03, decisions.md « Excel export »): a host's own bundle made
// for 1.3.0 keeps compiling (`satisfies ContextMenuMessages`, checked by `npm run typecheck`) and keeps working; the key
// is asked only when the menu is given `use.xlsx`, as the filter rows' keys are asked only when the rows are.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ContextMenuMessages } from '../src/context-menu.js';
import { cleanup, cmake, CMSG } from './support-context-menu.js';

afterEach(() => cleanup());

/** Every key 1.3.0 had, and no other: an application's own language. */
const MINE_1_3_0 = {
  locale: 'de',
  text: {
    'cmenu.label': 'Zellmenü', 'cmenu.copy': 'Kopieren', 'cmenu.copyHeaders': 'Mit Kopfzeilen kopieren', 'cmenu.cut': 'Ausschneiden', 'cmenu.paste': 'Einfügen',
    'cmenu.useCopyKey': '{keys} zum Kopieren', 'cmenu.usePasteKey': '{keys} zum Einfügen', 'cmenu.fillDown': 'Nach unten füllen', 'cmenu.fillEnd': 'Nach rechts füllen',
    'cmenu.undo': 'Rückgängig', 'cmenu.redo': 'Wiederholen', 'cmenu.expand': 'Aufklappen', 'cmenu.collapse': 'Zuklappen', 'cmenu.pinTop': 'Oben anheften',
    'cmenu.pinBottom': 'Unten anheften', 'cmenu.unpin': 'Lösen', 'cmenu.pinnedTop': 'Oben angeheftet', 'cmenu.pinnedBottom': 'Unten angeheftet',
    'cmenu.unpinned': 'Gelöst', 'cmenu.exportCsv': 'Als CSV exportieren',
  },
} satisfies ContextMenuMessages;

const withMine = () => ({ locale: 'en', text: { ...CMSG.en.text, ...MINE_1_3_0.text, 'cmenu.exportXlsx': undefined } }) as unknown as typeof CMSG.en; // a bundle without the new key, at run time

describe('the Excel text is optional', () => {
  it('a 1.3.0-shaped bundle: the menu works without use.xlsx', () => {
    const t = cmake({ messages: withMine(), menu: (u) => ({ use: { range: u.range, csv: { run: vi.fn(async () => 'done') } } }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.item('export.csv')!.textContent).toBe('Als CSV exportieren');
  });

  it('with use.xlsx and no text: the setup names the missing key', () => {
    expect(() => cmake({ messages: withMine(), menu: (u) => ({ use: { range: u.range, xlsx: { run: vi.fn(async () => 'done') } } }) })).toThrow(/cmenu\.exportXlsx/);
  });
});
