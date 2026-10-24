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
    'edit.undone': "تم التراجع: \u2068{column}\u2069",
    'edit.undoneMany': { one: "تم التراجع عن خلية واحدة ({n})", two: "تم التراجع عن خليتين ({n})", few: "تم التراجع عن {n} خلايا", many: "تم التراجع عن {n} خلية", other: "تم التراجع عن {n} خلية" },
    'edit.redone': "تمت الإعادة: \u2068{column}\u2069",
    'edit.redoneMany': { one: "تمت إعادة خلية واحدة ({n})", two: "تمت إعادة خليتين ({n})", few: "تمت إعادة {n} خلايا", many: "تمت إعادة {n} خلية", other: "تمت إعادة {n} خلية" },
    'edit.undoSkipped': { one: "تعذّر التراجع عن خلية واحدة ({n}): تغيّرت القيمة منذ ذلك الحين", two: "تعذّر التراجع عن خليتين ({n}): تغيّرت القيمة منذ ذلك الحين", few: "تعذّر التراجع عن {n} خلايا: تغيّرت القيمة منذ ذلك الحين", many: "تعذّر التراجع عن {n} خلية: تغيّرت القيمة منذ ذلك الحين", other: "تعذّر التراجع عن {n} خلية: تغيّرت القيمة منذ ذلك الحين" },
    'edit.redoSkipped': { one: "تعذّرت إعادة خلية واحدة ({n}): تغيّرت القيمة منذ ذلك الحين", two: "تعذّرت إعادة خليتين ({n}): تغيّرت القيمة منذ ذلك الحين", few: "تعذّرت إعادة {n} خلايا: تغيّرت القيمة منذ ذلك الحين", many: "تعذّرت إعادة {n} خلية: تغيّرت القيمة منذ ذلك الحين", other: "تعذّرت إعادة {n} خلية: تغيّرت القيمة منذ ذلك الحين" },
    'edit.nothingToUndo': "لا شيء للتراجع عنه",
    'edit.nothingToRedo': "لا شيء لإعادته",
    'header.withStale': "{name}، بحاجة إلى إعادة الترتيب",
    'validation.required': "القيمة مطلوبة",
    'validation.min': "الحد الأدنى {min}",
    'validation.max': "الحد الأقصى {max}",
    'validation.pattern': "صيغة غير صحيحة",
    'validation.options': "اختر قيمة من القائمة",
    'validation.invalid': "قيمة غير صالحة",
  },
} satisfies EditMessages;
