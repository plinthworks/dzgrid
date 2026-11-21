import type { SparklineMessages } from '../part-texts.js';

/**
 * Arabic, the sparklines' texts (1.16.0, `@dzgrid/dom/sparkline`, sparklines.md 7–8): spread into the grid's messages,
 * `text: { ...AR.text, ...AR_SPARKLINE.text }`.
 */
export const AR_SPARKLINE = {
  locale: 'ar',
  text: {
    "sparkline.summary": {
      one: "قيمة واحدة: {last}",
      two: "قيمتان، من {min} إلى {max}، الأخيرة {last}",
      few: "{n} قيم، من {min} إلى {max}، الأخيرة {last}",
      many: "{n} قيمة، من {min} إلى {max}، الأخيرة {last}",
      other: "{n} قيمة، من {min} إلى {max}، الأخيرة {last}",
    },
    "sparkline.point": "{value} ({i} من {n})",
  },
} satisfies SparklineMessages;
