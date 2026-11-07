import type { PivotBarMessages } from '../part-texts.js';

/** English, the pivot bar's texts (`@dzgrid/dom/pivot-bar`): spread after the -group and -pivot ones, `text: { ...EN.text, ...EN_GROUP.text, ...EN_PIVOT.text, ...EN_PIVOT_BAR.text }`. `{column}`: a column's name; `{part}`: a part's name; `{n}`, `{total}`: places. */
export const EN_PIVOT_BAR = {
  locale: 'en',
  text: {
    'pivot.rows': "Rows",
    'pivot.columns': "Columns",
    'pivot.values': "Values",
    'pivot.valuesEmpty': "Add a value to total",
    'pivot.addValue': "Add a value",
    'pivot.removeValue': "Remove {column} from the values",
    'pivot.valueAdded': "Value added: {column}",
    'pivot.valueRemoved': "{column} removed from the values",
    'pivot.valuePlaced': "{column}: place {n} of {total}",
    'pivot.order': "Reverse order: {column}",
    'pivot.reversed': "{column}: reverse order",
    'pivot.ordered': "{column}: usual order",
    'pivot.refused': "{column} cannot go in {part}",
    'pivot.mode': "Pivot mode",
  },
} satisfies PivotBarMessages;
