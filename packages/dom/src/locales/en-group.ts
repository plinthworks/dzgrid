import type { GroupMessages } from '../part-texts.js';

/** English, row grouping's texts (`@dzgrid/dom/grouping`, `@dzgrid/dom/group-zone`, the column menu's items): spread into the grid's messages, `text: { ...EN.text, ...EN_GROUP.text }`. `{name}`: a group's value as shown; `{column}`: a column's header. */
export const EN_GROUP = {
  locale: 'en',
  text: {
    'group.label': "{name} ({n})",
    'group.blank': "(Blank)",
    'group.total': "Total {name}",
    'group.grandTotal': "Total",
    'group.expanded': { one: "{name} expanded, {n} row", other: "{name} expanded, {n} rows" },
    'group.collapsed': "{name} collapsed",
    'group.expandedSome': { one: "{n} group expanded", other: "{n} groups expanded" },
    'zone.label': "Row grouping",
    'zone.empty': "Drag a column here to group",
    'zone.remove': "Stop grouping by {column}",
    'zone.grouped': "Grouped by {column}",
    'zone.removed': "No longer grouped by {column}",
    'zone.placed': "{column}: level {n} of {total}",
    'menu.groupBy': "Group by this column",
    'menu.groupOff': "Stop grouping by this column",
  },
} satisfies GroupMessages;
