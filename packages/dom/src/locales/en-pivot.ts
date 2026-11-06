import type { PivotMessages } from '../part-texts.js';

/** English, the pivot's texts (`@dzgrid/dom/pivot`, the « Colonnes » band, the menu's « Total »): spread into the grid's messages, `text: { ...EN.text, ...EN_GROUP.text, ...EN_PIVOT.text }`. `{column}`: a column's header; `{n}`: a count; `{name}`: a band's header; `{fn}`: a function's name. */
export const EN_PIVOT = {
  locale: 'en',
  text: {
    'pivot.label': "Pivot columns",
    'pivot.empty': "Add a column here to spread it across",
    'pivot.remove': "Remove {column} from the columns",
    'pivot.grouped': "Spread across: {column}",
    'pivot.removed': "{column} removed from the columns",
    'pivot.placed': "{column}: level {n} of {total}",
    'pivot.add': "Add a column",
    'zone.add': "Add a column",
    'pivot.total': "Total",
    'pivot.subtotal': "Total {name}",
    'pivot.count': { one: "{n} column", other: "{n} columns" },
    'pivot.tooMany': "{n} columns: too many for the screen; remove a column",
    'pivot.switch': "Pivot table",
    'pivot.fnSaid': "{column}: {fn}",
    'menu.pivotBy': "Spread across columns",
    'menu.pivotOff': "Stop spreading across columns",
    'menu.total': "Total",
    'fn.sum': "Sum",
    'fn.avg': "Average",
    'fn.min': "Min",
    'fn.max': "Max",
    'fn.count': "Count",
  },
} satisfies PivotMessages;
