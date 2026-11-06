import type { DockMessages } from '../part-texts.js';

/** العربية، نصوص الإرساء (`@dzgrid/dom/dock`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_DOCK.text }`. `{panel}`: عنوان لوحة؛ `{grid}`: اسم الجدول. */
export const AR_DOCK = {
  locale: 'ar',
  text: {
    'dock.region': "{panel}، {grid}",
    'dock.tabs': "اللوحات",
    'dock.collapse': "طي {panel}",
    'dock.expand': "توسيع {panel}",
    'dock.close': "إغلاق {panel}",
    'dock.place': "وضع {panel}",
    'dock.start': "في البداية",
    'dock.end': "في النهاية",
    'dock.bottom': "في الأسفل",
    'dock.width': "عرض {panel}",
    'dock.height': "ارتفاع {panel}",
  },
} satisfies DockMessages;
