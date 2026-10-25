import type { RangeMessages } from '../part-texts.js';

/** العربية, the block's texts (`@dzgrid/dom/range`): spread into the grid's messages, `text: { ...AR.text, ...AR_RANGE.text }`. To be read by an Arabic reader. */
export const AR_RANGE = {
  locale: 'ar',
  text: {
    'range.rows': { zero: "لا صفوف", one: "صف واحد", two: "صفان", few: "{n} صفوف", many: "{n} صفًا", other: "{n} صف" },
    'range.cols': { zero: "لا أعمدة", one: "عمود واحد", two: "عمودان", few: "{n} أعمدة", many: "{n} عمودًا", other: "{n} عمود" },
    'range.size': "{rows}، {cols} محددة",
    'range.cleared': "أُلغي التحديد",
    'range.reordered': "أُلغي التحديد: تغيّر الترتيب",
    'range.copied': "النسخ: {n}",
    'range.cut': "القص: {n}",
    'range.pasted': "اللصق: {n}",
    'range.erased': "المسح: {n}",
    'range.refused': "؛ مرفوضة: {n}",
    'range.readOnly': "؛ للقراءة فقط: {n}",
    'range.tooLong': "؛ طويلة جدًا: {n}",
    'range.outside': "؛ خارج الجدول: {n}",
    'range.tooBig': "اللصق أكبر من {max} خلية؛ لم يُلصق شيء",
    'range.noCopy': "النسخ ممنوع",
  },
} satisfies RangeMessages;
