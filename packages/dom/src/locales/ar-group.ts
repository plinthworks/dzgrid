import type { GroupMessages } from '../part-texts.js';

/** العربية, row grouping's texts (`@dzgrid/dom/grouping`, `@dzgrid/dom/group-zone`, the column menu's items): spread into the grid's messages, `text: { ...AR.text, ...AR_GROUP.text }`. To be read by an Arabic reader. No `zero` form: an opening always shows one row or more. */
export const AR_GROUP = {
  locale: 'ar',
  text: {
    'group.label': "{name} ({n})",
    'group.blank': "(فارغ)",
    'group.total': "إجمالي {name}",
    'group.grandTotal': "الإجمالي",
    'group.expanded': { one: "تم توسيع {name}، صف واحد ({n})", two: "تم توسيع {name}، صفان ({n})", few: "تم توسيع {name}، {n} صفوف", many: "تم توسيع {name}، {n} صفا", other: "تم توسيع {name}، {n} صف" },
    'group.collapsed': "تم طي {name}",
    'group.expandedSome': { one: "تم توسيع مجموعة واحدة ({n})", two: "تم توسيع مجموعتين ({n})", few: "تم توسيع {n} مجموعات", many: "تم توسيع {n} مجموعة", other: "تم توسيع {n} مجموعة" },
    'zone.label': "تجميع الصفوف",
    'zone.empty': "اسحب عمودًا إلى هنا للتجميع",
    'zone.remove': "إلغاء التجميع حسب {column}",
    'zone.grouped': "مجمّع حسب {column}",
    'zone.removed': "لم يعد مجمّعًا حسب {column}",
    'zone.placed': "{column}: المستوى {n} من {total}",
    'menu.groupBy': "التجميع حسب هذا العمود",
    'menu.groupOff': "إلغاء التجميع حسب هذا العمود",
  },
} satisfies GroupMessages;
