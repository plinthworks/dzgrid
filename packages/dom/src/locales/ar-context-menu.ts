import type { ContextMenuMessages } from '../part-texts.js';

/** العربية، نصوص قائمة الخلية (`@dzgrid/dom/context-menu`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_CONTEXT_MENU.text }`. */
export const AR_CONTEXT_MENU = {
  locale: 'ar',
  text: {
    'cmenu.label': "قائمة الخلية",
    'cmenu.copy': "نسخ",
    'cmenu.copyHeaders': "نسخ مع العناوين",
    'cmenu.cut': "قص",
    'cmenu.paste': "لصق",
    'cmenu.useCopyKey': "استخدم {keys} للنسخ",
    'cmenu.usePasteKey': "استخدم {keys} للصق",
    'cmenu.fillDown': "نسخ نحو الأسفل",
    'cmenu.fillEnd': "نسخ نحو اليسار",
    'cmenu.undo': "تراجع",
    'cmenu.redo': "إعادة",
    'cmenu.expand': "توسيع",
    'cmenu.collapse': "طي",
    'cmenu.pinTop': "تثبيت في الأعلى",
    'cmenu.pinBottom': "تثبيت في الأسفل",
    'cmenu.unpin': "إلغاء التثبيت",
    'cmenu.pinnedTop': "ثُبّت الصف في الأعلى",
    'cmenu.pinnedBottom': "ثُبّت الصف في الأسفل",
    'cmenu.unpinned': "أُلغي تثبيت الصف",
    'cmenu.exportCsv': "تصدير CSV",
  },
} satisfies ContextMenuMessages;
