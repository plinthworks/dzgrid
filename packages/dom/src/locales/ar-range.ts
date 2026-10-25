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
  },
} satisfies RangeMessages;
