import type { FormsMessages } from '../part-texts.js';

/**
 * Arabic, the form editing texts (1.15.0: `@dzgrid/dom/edit-batch`, `/editors-row`, `/editors-search`): spread into the
 * grid's messages after the editing ones, `text: { ...AR.text, ...AR_EDIT.text, ...AR_EDITORS.text, ...AR_FORMS.text }`.
 */
export const AR_FORMS = {
  locale: 'ar',
  text: {
    "edit.unsaved": "غير محفوظ",
    "edit.discarded": { one: "أُلغي تعديل واحد ({n})", two: "أُلغي تعديلان ({n})", few: "أُلغيت {n} تعديلات", many: "أُلغي {n} تعديلًا", other: "أُلغي {n} تعديل" },
    "edit.notSent": "لم يُرسل شيء: {column}، {reason}",
    "edit.rowEditing": { one: "تعديل الصف {row}، حقل واحد ({n})", two: "تعديل الصف {row}، حقلان ({n})", few: "تعديل الصف {row}، {n} حقول", many: "تعديل الصف {row}، {n} حقلًا", other: "تعديل الصف {row}، {n} حقل" },
    "edit.rowCancelled": "لم يتغيّر الصف",
    "edit.searching": "جارٍ البحث…",
    "edit.noResult": "لا توجد نتائج",
    "edit.searchFailed": "فشل البحث",
  },
} satisfies FormsMessages;
