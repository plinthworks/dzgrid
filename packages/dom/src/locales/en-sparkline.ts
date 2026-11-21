import type { SparklineMessages } from '../part-texts.js';

/**
 * English, the sparklines' texts (1.16.0, `@dzgrid/dom/sparkline`, sparklines.md 7–8): spread into the grid's messages,
 * `text: { ...EN.text, ...EN_SPARKLINE.text }`.
 */
export const EN_SPARKLINE = {
  locale: 'en',
  text: {
    "sparkline.summary": { one: "1 value: {last}", other: "{n} values, from {min} to {max}, last {last}" },
    "sparkline.point": "{value} ({i} of {n})",
  },
} satisfies SparklineMessages;
