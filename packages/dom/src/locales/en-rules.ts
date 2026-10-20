import type { RulesMessages } from '../part-texts.js';

/** English, the selection rules' texts (`@dzgrid/dom/rules`): spread into the grid's messages, `text: { ...EN.text, ...EN_RULES.text }`. `rules.refusedReason`: the rule's own sentence, as it gave it. */
export const EN_RULES = {
  locale: 'en',
  text: {
    'rules.refused': { one: "Not selectable", other: "{n} not selectable" },
    'rules.refusedReason': "{reason}",
    'rules.partly': "{selected}, {n} not selectable",
  },
} satisfies RulesMessages;
