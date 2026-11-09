import type { ImportMessages } from '../part-texts.js';

/** العربية، نصوص استيراد ملف (`@dzgrid/dom/import`): `text: { ...AR.text, ...AR_IMPORT.text }`. */
export const AR_IMPORT = {
  locale: 'ar',
  text: {
    'import.drop': "أفلت الملف لاستيراده",
    'import.read': "الصفوف المقروءة: {rows}، المشكلات: {problems}",
    'import.failed': "تعذّرت قراءة هذا الملف",
  },
} satisfies ImportMessages;
