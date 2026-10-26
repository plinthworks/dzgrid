import type { FillMessages } from '../part-texts.js';

/** العربية، نصوص التعبئة (`@dzgrid/dom/fill`): تُضاف إلى رسائل الجدول بعد نصوص التحديد، `text: { ...AR.text, ...AR_RANGE.text, ...AR_FILL.text }`. */
export const AR_FILL = {
  locale: 'ar',
  text: {
    'fill.filled': "التعبئة: {n}",
    'fill.bulk': "التعديل: {n}",
    'fill.mode': "التعبئة: الأسهم للتوسيع، Enter للكتابة، Escape للإلغاء",
    'fill.pick': "التعبئة: انقر الخلية الأخيرة؛ Escape للإلغاء",
    'fill.cancel': "أُلغيت التعبئة",
    'fill.down': "إلى الأسفل: {n}",
    'fill.up': "إلى الأعلى: {n}",
    'fill.end': "إلى النهاية: {n}",
    'fill.start': "إلى البداية: {n}",
  },
} satisfies FillMessages;
