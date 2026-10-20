import type { RulesMessages } from '../part-texts.js';

/** العربية, the selection rules' texts (`@dzgrid/dom/rules`): spread into the grid's messages, `text: { ...AR.text, ...AR_RULES.text }`. To be read by an Arabic reader. The count follows a colon, so one form serves every number above one. */
export const AR_RULES = {
  locale: 'ar',
  text: {
    'rules.refused': { one: "غير قابل للتحديد", other: "غير قابلة للتحديد: {n}" },
    'rules.refusedReason': "{reason}",
    'rules.partly': "{selected}\u060C غير قابلة للتحديد: {n}",
  },
} satisfies RulesMessages;
