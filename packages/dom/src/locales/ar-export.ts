import type { ExportMessages } from '../messages.js';

/** العربية, the export's texts (`@dzgrid/dom/export`): spread into the grid's messages, `text: { ...AR.text, ...AR_EXPORT.text }`. To be read by an Arabic reader. */
export const AR_EXPORT = {
  locale: 'ar',
  text: {
    'export.fileName': "تصدير",
    'announce.exportStarted': "جارٍ التصدير…",
    'announce.exportDone': "تم التصدير. {rows}",
    'announce.exportDoneHidden': "تم التصدير. {rows}. محددة لكن مخفية بالمرشحات: {hidden}",
    'announce.exportDoneOpen': "تم التصدير",
    'announce.exportFailed': "فشل التصدير",
    'announce.exportRefused': "التصدير غير مسموح به",
    'announce.exportCancelled': "أُلغي التصدير",
  },
} satisfies ExportMessages;
