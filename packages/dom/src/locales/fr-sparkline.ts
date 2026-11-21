import type { SparklineMessages } from '../part-texts.js';

/**
 * French, the sparklines' texts (1.16.0, `@dzgrid/dom/sparkline`, sparklines.md 7–8): spread into the grid's messages,
 * `text: { ...FR.text, ...FR_SPARKLINE.text }`.
 */
export const FR_SPARKLINE = {
  locale: 'fr',
  text: {
    "sparkline.summary": { one: "1 valeur : {last}", other: "{n} valeurs, de {min} à {max}, dernière {last}" },
    "sparkline.point": "{value} ({i} sur {n})",
  },
} satisfies SparklineMessages;
