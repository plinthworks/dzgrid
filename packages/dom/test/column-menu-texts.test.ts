// The column menu's texts (Phase 6 step 3, owner Q3-2: their own bundles `locales/<lang>-column-menu`, loaded only with
// the menu; docs/behaviors/column-menu.md « Texts », density.md « Texts », S12-Q12 for the two fill items): COLUMN_MENU_KEYS
// exactly each bundle's keys; `columnMenu()` refuses a grid missing one (a TypeError naming it, as `fill()` and
// `columns()`); the sentences by hand in English, French (a narrow no-break space before « : ») and Arabic.
import { describe, it, expect, afterEach } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { COLUMN_MENU_KEYS, columnMenu } from '../src/column-menu.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { FR_COLUMN_MENU } from '../src/locales/fr-column-menu.js';
import { AR_COLUMN_MENU } from '../src/locales/ar-column-menu.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { msg } from '../src/messages.js';
import { cleanup, join, rmake } from './support-range.js';

afterEach(cleanup);

const KEYS = [
  'menu.button', 'menu.label', 'menu.sort', 'menu.sortAsc', 'menu.sortDesc', 'menu.sortNone', 'menu.pin', 'menu.pinStart', 'menu.pinEnd', 'menu.pinNone',
  'menu.sizeAuto', 'menu.sizeAutoAll', 'menu.sizeResize', 'menu.sizeWiden', 'menu.sizeNarrow', 'menu.width', 'menu.moveStart', 'menu.moveEnd', 'menu.fillDown', 'menu.fillEnd',
  'menu.filter', 'menu.hide', 'menu.choose', 'menu.reset', 'menu.pinnedStart', 'menu.pinnedEnd', 'menu.unpinned', 'menu.hidden', 'menu.resetDone',
  'density.label', 'density.compact', 'density.comfortable', 'density.spacious', 'density.changed',
].sort();

describe('column menu texts', () => {
  it('COLUMN_MENU_KEYS are each bundle\'s keys, all of them', () => {
    expect([...COLUMN_MENU_KEYS].sort()).toEqual(KEYS);
    for (const b of [EN_COLUMN_MENU, FR_COLUMN_MENU, AR_COLUMN_MENU]) expect(Object.keys(b.text).sort(), b.locale).toEqual(KEYS);
    expect([EN_COLUMN_MENU.locale, FR_COLUMN_MENU.locale, AR_COLUMN_MENU.locale]).toEqual(['en', 'fr', 'ar']);
  });

  it('a grid missing a text: columnMenu() refuses it at setup, naming the key', () => {
    const text = { ...EN_COLUMN_MENU.text } as Record<string, string>;
    delete text['menu.hide'];
    expect(() => rmake({ messages: join(EN, { locale: 'en', text }), features: () => [columnMenu()] })).toThrow(/column-menu: missing menu\.hide/);
  });

  it('the item labels and sentences, in English, French and Arabic', () => {
    const en = join(EN, EN_COLUMN_MENU);
    const fr = join(FR, FR_COLUMN_MENU);
    const ar = join(AR, AR_COLUMN_MENU);
    expect(msg(en, 'menu.button', { column: 'Qty' })).toBe('Qty column menu');
    expect(msg(en, 'menu.label', { column: 'Qty' })).toBe('Qty column');
    expect(['menu.sortAsc', 'menu.sortDesc', 'menu.sortNone', 'menu.pinStart', 'menu.pinEnd', 'menu.pinNone', 'menu.sizeWiden', 'menu.sizeNarrow', 'menu.moveStart', 'menu.moveEnd', 'menu.fillDown', 'menu.fillEnd', 'menu.filter', 'menu.hide', 'menu.choose', 'menu.reset'].map((k) => msg(en, k as never)))
      .toEqual(['Sort ascending', 'Sort descending', 'No sort', 'Pin to the start', 'Pin to the end', 'Do not pin', 'Widen', 'Narrow', 'Move toward the start', 'Move toward the end', 'Fill down', 'Fill right', 'Filter…', 'Hide column', 'Choose columns…', 'Reset columns']);
    expect(msg(en, 'menu.pinnedStart', { column: 'Qty' })).toBe('Qty pinned to the start');
    expect(msg(en, 'menu.hidden', { column: 'Qty' })).toBe('Qty hidden');
    expect(msg(en, 'menu.width', { column: 'Qty', width: 130 })).toBe('Qty: 130 pixels');
    expect(msg(en, 'density.changed', { density: 'Compact' })).toBe('Density: Compact');

    expect(msg(fr, 'menu.button', { column: 'Qté' })).toBe('Menu de la colonne Qté');
    expect(msg(fr, 'menu.label', { column: 'Qté' })).toBe('Colonne Qté');
    expect(['menu.sortAsc', 'menu.sortDesc', 'menu.sortNone', 'menu.pinStart', 'menu.pinEnd', 'menu.pinNone', 'menu.sizeAuto', 'menu.sizeAutoAll', 'menu.sizeResize', 'menu.sizeWiden', 'menu.sizeNarrow', 'menu.moveStart', 'menu.moveEnd', 'menu.fillDown', 'menu.fillEnd', 'menu.filter', 'menu.hide', 'menu.choose', 'menu.reset'].map((k) => msg(fr, k as never)))
      .toEqual(['Tri croissant', 'Tri décroissant', 'Sans tri', 'Épingler au début', 'Épingler à la fin', 'Ne pas épingler', 'Ajuster cette colonne', 'Ajuster toutes les colonnes', 'Redimensionner au clavier', 'Élargir', 'Rétrécir', 'Déplacer vers le début', 'Déplacer vers la fin', 'Recopier vers le bas', 'Recopier vers la droite', 'Filtrer…', 'Masquer la colonne', 'Choisir les colonnes…', 'Réinitialiser les colonnes']);
    expect(msg(fr, 'menu.pinnedStart', { column: 'Nom' })).toBe('Nom épinglée au début');
    expect(msg(fr, 'menu.pinnedEnd', { column: 'Nom' })).toBe('Nom épinglée à la fin');
    expect(msg(fr, 'menu.unpinned', { column: 'Nom' })).toBe('Nom n\'est plus épinglée');
    expect(msg(fr, 'menu.hidden', { column: 'Nom' })).toBe('Nom masquée');
    expect(msg(fr, 'menu.resetDone')).toBe('Colonnes réinitialisées');
    expect(msg(fr, 'menu.width', { column: 'Nom', width: 130 })).toBe('Nom : 130 pixels');
    expect(['density.label', 'density.compact', 'density.comfortable', 'density.spacious'].map((k) => msg(fr, k as never))).toEqual(['Densité', 'Compacte', 'Normale', 'Aérée']);
    expect(msg(fr, 'density.changed', { density: 'Aérée' })).toBe('Densité : Aérée');

    const dz = localeCtx({ locale: 'ar-DZ' });
    expect(msg(ar, 'menu.button', { column: 'الكمية' })).toBe('قائمة العمود الكمية');
    expect(msg(ar, 'menu.label', { column: 'الكمية' })).toBe('العمود الكمية');
    expect(msg(ar, 'menu.sortAsc')).toBe('ترتيب تصاعدي');
    expect(msg(ar, 'menu.hide')).toBe('إخفاء العمود');
    // Ctrl+R fills toward the logical end: the left in Arabic (plan R8; the owner's Arabic review).
    expect(msg(ar, 'menu.fillDown')).toBe('نسخ نحو الأسفل');
    expect(msg(ar, 'menu.fillEnd')).toBe('نسخ نحو اليسار');
    expect(msg(ar, 'menu.pinnedStart', { column: 'الاسم' })).toBe('الاسم مثبّت في البداية');
    expect(msg(ar, 'menu.width', { column: 'الاسم', width: 130 }, dz)).toBe('الاسم: 130 بكسل');
    expect(msg(ar, 'density.changed', { density: 'مضغوطة' })).toBe('الكثافة: مضغوطة');
  });
});
