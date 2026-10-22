import type { TreeMessages } from '../part-texts.js';

/** العربية, the tree's texts (`@dzgrid/dom/tree`): spread into the grid's messages, `text: { ...AR.text, ...AR_TREE.text }`. To be read by an Arabic reader. No `zero` form: an opening always shows one row or more. */
export const AR_TREE = {
  locale: 'ar',
  text: {
    'tree.expanded': { one: "تم توسيع {name}، صف واحد ({n})", two: "تم توسيع {name}، صفان ({n})", few: "تم توسيع {name}، {n} صفوف", many: "تم توسيع {name}، {n} صفا", other: "تم توسيع {name}، {n} صف" },
    'tree.empty': "{name}، لا توجد صفوف",
    'tree.collapsed': "تم طي {name}",
    'tree.expandedSome': { one: "تم توسيع صف واحد ({n})", two: "تم توسيع صفين ({n})", few: "تم توسيع {n} صفوف", many: "تم توسيع {n} صفا", other: "تم توسيع {n} صف" },
  },
} satisfies TreeMessages;
