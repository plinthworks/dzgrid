import type { EditorsMessages } from '../part-texts.js';

/** العربية, the editors' texts (`@dzgrid/dom/editors`): spread after the editing ones, `text: { ...AR.text, ...AR_EDIT.text, ...AR_EDITORS.text }`. To be read by an Arabic reader. */
export const AR_EDITORS = {
  locale: 'ar',
  text: {
    'edit.refused': "{column}: قيمة مرفوضة، {reason}",
    'edit.refusedDropped': "{column}: قيمة مرفوضة، أُلغي التعديل",
    'editors.fieldName': "{column}، {row}",
    'validation.parse': "المطلوب رقم",
    'validation.day': "المطلوب تاريخ ({pattern})",
    'validation.invalid-instant': "المطلوب تاريخ ووقت",
    'validation.wall-time-skipped': "هذا الوقت غير موجود في ذلك اليوم (تغيير الساعة)",
    'validation.wall-time-ambiguous': "هذا الوقت يتكرر مرتين في ذلك اليوم",
    'edit.calendar': "فتح التقويم",
    'edit.calendarLoading': "جارٍ تحميل التقويم",
    'edit.calendarFailed': "تعذّر تحميل التقويم",
    'edit.optionNotInList': "{label} (خارج القائمة)",
  },
} satisfies EditorsMessages;
