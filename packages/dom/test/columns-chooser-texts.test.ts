// The chooser's texts (Phase 6 step 4, owner Q4-1: in the `locales/<lang>-columns` bundles, beside the moves'; docs/
// behaviors/columns-chooser.md « Texts », step04-plan §6): COLUMNS_CHOOSER_KEYS, with COLUMNS_KEYS, exactly each bundle's
// keys; `columnsChooser()` refuses a grid missing one (a TypeError naming it); the sentences by hand in English, French
// (a narrow no-break space before « : ») and Arabic.
import { describe, it, expect, afterEach } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { COLUMNS_CHOOSER_KEYS, columnsChooser } from '../src/columns-panel.js';
import { COLUMNS_KEYS } from '../src/columns.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { msg } from '../src/messages.js';
import { cleanup, join, rmake } from './support-range.js';

afterEach(cleanup);

const KEYS = 'title search list handle up down placed showAll reset close none matches shown hidden allShown resetDone pinnedStart pinnedEnd last clearToMove'.split(' ').map((k) => `chooser.${k}`).sort();

describe('column chooser texts', () => {
  it('COLUMNS_CHOOSER_KEYS and COLUMNS_KEYS are each -columns bundle\'s keys, all of them', () => {
    expect([...COLUMNS_CHOOSER_KEYS].sort()).toEqual(KEYS);
    for (const b of [EN_COLUMNS, FR_COLUMNS, AR_COLUMNS]) expect(Object.keys(b.text).sort(), b.locale).toEqual([...KEYS, ...COLUMNS_KEYS].sort());
  });

  it('a grid missing a text: columnsChooser() refuses it at setup, naming the key (a move sentence too)', () => {
    const text = { ...EN_COLUMNS.text } as Record<string, string>;
    delete text['chooser.reset'];
    expect(() => rmake({ messages: join(EN, { locale: 'en', text }), features: () => [columnsChooser()] })).toThrow(/columns-panel: missing chooser\.reset/);
    const t2 = { ...EN_COLUMNS.text } as Record<string, string>;
    delete t2['move.edge'];
    expect(() => rmake({ messages: join(EN, { locale: 'en', text: t2 }), features: () => [columnsChooser()] })).toThrow(/columns-panel: missing move\.edge/);
  });

  it('the labels and sentences, in English, French and Arabic', () => {
    const en = join(EN, EN_COLUMNS);
    const fr = join(FR, FR_COLUMNS);
    const ar = join(AR, AR_COLUMNS);
    expect(['title', 'search', 'list', 'showAll', 'reset', 'close', 'none', 'allShown', 'resetDone', 'pinnedStart', 'pinnedEnd', 'last', 'clearToMove'].map((k) => msg(en, `chooser.${k}` as never)))
      .toEqual(['Choose columns', 'Search a column', 'Columns', 'Show all', 'Reset', 'Close', 'No column', 'All columns shown', 'Columns reset', 'pinned to the start', 'pinned to the end', 'the last shown column', 'Empty the search to change the order']);
    expect(msg(en, 'chooser.handle', { column: 'Qty' })).toBe('Drag Qty');
    expect(msg(en, 'chooser.up', { column: 'Qty' })).toBe('Move Qty up');
    expect(msg(en, 'chooser.down', { column: 'Qty' })).toBe('Move Qty down');
    expect(msg(en, 'chooser.placed', { column: 'Date', n: 5, total: 12 })).toBe('Date: place 5 of 12');
    expect(msg(en, 'chooser.matches', { n: 2 })).toBe('Columns found: 2');
    expect(msg(en, 'chooser.shown', { column: 'Qty' })).toBe('Qty shown');
    expect(msg(en, 'chooser.hidden', { column: 'Qty' })).toBe('Qty hidden');

    expect(['title', 'search', 'list', 'showAll', 'reset', 'close', 'none', 'allShown', 'resetDone', 'pinnedStart', 'pinnedEnd', 'last', 'clearToMove'].map((k) => msg(fr, `chooser.${k}` as never)))
      .toEqual(['Choisir les colonnes', 'Rechercher une colonne', 'Colonnes', 'Tout afficher', 'Réinitialiser', 'Fermer', 'Aucune colonne', 'Toutes les colonnes affichées', 'Colonnes réinitialisées', 'épinglée au début', 'épinglée à la fin', 'dernière colonne affichée', 'Videz la recherche pour changer l\'ordre']);
    expect(msg(fr, 'chooser.handle', { column: 'Date' })).toBe('Glisser Date');
    expect(msg(fr, 'chooser.up', { column: 'Date' })).toBe('Monter Date');
    expect(msg(fr, 'chooser.down', { column: 'Date' })).toBe('Descendre Date');
    expect(msg(fr, 'chooser.placed', { column: 'Date', n: 5, total: 12 })).toBe('Date\u202F: place 5 sur 12');
    expect(msg(fr, 'chooser.matches', { n: 2 })).toBe('Colonnes trouvées\u202F: 2');
    expect(msg(fr, 'chooser.shown', { column: 'Date' })).toBe('Date affichée');
    expect(msg(fr, 'chooser.hidden', { column: 'Date' })).toBe('Date masquée');

    const dz = localeCtx({ locale: 'ar-DZ' });
    expect(msg(ar, 'chooser.title')).toBe('اختيار الأعمدة');
    expect(msg(ar, 'chooser.search')).toBe('البحث عن عمود');
    expect(msg(ar, 'chooser.placed', { column: 'التاريخ', n: 5, total: 12 }, dz)).toBe('التاريخ: الموضع 5 من 12');
    expect(msg(ar, 'chooser.matches', { n: 2 }, dz)).toBe('الأعمدة الموجودة: 2');
    expect(msg(ar, 'chooser.shown', { column: 'التاريخ' })).toBe('التاريخ ظاهر');
    expect(msg(ar, 'chooser.hidden', { column: 'التاريخ' })).toBe('التاريخ مخفي');
    expect(msg(ar, 'chooser.handle', { column: 'التاريخ' })).toBe('سحب التاريخ');
    expect(msg(ar, 'chooser.pinnedStart')).toBe('مثبّت في البداية');
    expect(msg(ar, 'chooser.last')).toBe('آخر عمود ظاهر');
    expect(msg(ar, 'chooser.clearToMove')).toBe('أفرغ البحث لتغيير الترتيب');
  });
});
