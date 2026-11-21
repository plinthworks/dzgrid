import type { AdvancedFilterMessages } from '../part-texts.js';

/** English, the advanced filter's texts (`@dzgrid/dom/advanced-filter`): added to the grid's messages, `text: { ...EN.text, ...EN_ADVANCED_FILTER.text }`. `{n}`: a number. */
export const EN_ADVANCED_FILTER = {
  locale: 'en',
  text: {
    'adv.title': "Advanced filter",
    'adv.join': "Keep the rows matching",
    'adv.and': "All (AND)",
    'adv.or': "Any (OR)",
    'adv.groupAnd': "Group: all (AND)",
    'adv.groupOr': "Group: any (OR)",
    'adv.addCondition': "+ Condition",
    'adv.addGroup': "+ Group",
    'adv.removeCondition': "Remove the condition",
    'adv.removeGroup': "Remove the group",
    'adv.column': "Column",
    'adv.pick': "Choose a column",
    'adv.condition': "Condition {n}",
    'adv.apply': "Apply",
    'adv.clear': "Clear",
    'adv.cancel': "Cancel",
    'adv.conditionAdded': "Condition added",
    'adv.groupAdded': "Group added",
    'adv.removed': "Removed",
  },
} satisfies AdvancedFilterMessages;
