import type { EditMessages } from '../part-texts.js';

/** العربية, the editing texts (`@dzgrid/dom/edit`): spread into the grid's messages, `text: { ...AR.text, ...AR_EDIT.text }`. To be read by an Arabic reader. `edit.reapplied` has no `zero` form (a reapply shows its rows; 0 falls to `other`). */
export const AR_EDIT = {
  locale: 'ar',
  text: {
    'edit.saving': "جارٍ الحفظ",
    'edit.saveRefused': "{column}: لم يُحفظ، {reason}. أُعيدت القيمة السابقة.",
    'edit.reasonUnknown': "رفضه الخادم",
    'edit.reasonNetwork': "تعذّر الوصول إلى الخادم",
    'edit.failedMark': "لم يُحفظ: {reason}",
    'edit.stale': "الترتيب قديم: أعد الترتيب من العنوان",
    'edit.rowStale': "لم يعد مطابقًا للمرشح",
    'edit.reapply': "إعادة الترتيب",
    'edit.reapplied': { one: "أُعيد الترتيب، صف واحد ({n})", two: "أُعيد الترتيب، صفان ({n})", few: "أُعيد الترتيب، {n} صفوف", many: "أُعيد الترتيب، {n} صفا", other: "أُعيد الترتيب، {n} صف" },
    'header.withStale': "{name}، بحاجة إلى إعادة الترتيب",
    'validation.required': "القيمة مطلوبة",
    'validation.min': "الحد الأدنى {min}",
    'validation.max': "الحد الأقصى {max}",
    'validation.pattern': "صيغة غير صحيحة",
    'validation.options': "اختر قيمة من القائمة",
    'validation.invalid': "قيمة غير صالحة",
  },
} satisfies EditMessages;
