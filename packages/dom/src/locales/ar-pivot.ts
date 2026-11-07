import type { PivotMessages } from '../part-texts.js';

/** العربية, the pivot's texts (`@dzgrid/dom/pivot`): spread into the grid's messages, `text: { ...AR.text, ...AR_GROUP.text, ...AR_PIVOT.text }`. To be read by an Arabic reader. */
export const AR_PIVOT = {
  locale: 'ar',
  text: {
    'pivot.label': "أعمدة الجدول المحوري",
    'pivot.empty': "أضف عمودًا هنا لتوزيعه أعمدةً",
    'pivot.remove': "إزالة {column} من الأعمدة",
    'pivot.grouped': "وُزِّع أعمدةً: {column}",
    'pivot.removed': "أُزيل {column} من الأعمدة",
    'pivot.placed': "{column}: المستوى {n} من {total}",
    'pivot.add': "إضافة عمود",
    'zone.add': "إضافة عمود",
    'pivot.total': "المجموع",
    'pivot.subtotal': "مجموع {name}",
    'pivot.count': { zero: "لا أعمدة", one: "عمود واحد", two: "عمودان", few: "{n} أعمدة", many: "{n} عمودًا", other: "{n} عمود" },
    'pivot.tooMany': "{n} عمود: كثيرة على الشاشة؛ أزل عمودًا",
    'pivot.switch': "جدول محوري",
    'pivot.fnSaid': "{column}: {fn}",
    'pivot.valueChip': "{fn}({column})",
    'menu.pivotBy': "توزيع أعمدةً",
    'menu.pivotOff': "إيقاف التوزيع أعمدةً",
    'menu.total': "المجموع",
    'fn.sum': "المجموع",
    'fn.avg': "المتوسط",
    'fn.min': "الأدنى",
    'fn.max': "الأقصى",
    'fn.count': "العدد",
  },
} satisfies PivotMessages;
