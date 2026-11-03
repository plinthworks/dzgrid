import type { MessageValue } from '../messages.js';
import type { ContextMenuMessages, ContextMenuXlsxKey } from '../part-texts.js';

/** « Export to Excel » (Phase 9): optional in an application's own bundle (`ContextMenuXlsxKey`). */
const XLSX: { readonly [K in ContextMenuXlsxKey]?: MessageValue } = { 'cmenu.exportXlsx': "Export to Excel" };

/** English, the cell menu's texts (`@dzgrid/dom/context-menu`): added to the grid's messages, `text: { ...EN.text, ...EN_CONTEXT_MENU.text }`. `{keys}`: Ctrl+V, or ⌘V on a Mac. */
export const EN_CONTEXT_MENU = {
  locale: 'en',
  text: {
    'cmenu.label': "Cell menu",
    'cmenu.copy': "Copy",
    'cmenu.copyHeaders': "Copy with headers",
    'cmenu.cut': "Cut",
    'cmenu.paste': "Paste",
    'cmenu.useCopyKey': "Use {keys} to copy",
    'cmenu.usePasteKey': "Use {keys} to paste",
    'cmenu.fillDown': "Fill down",
    'cmenu.fillEnd': "Fill right",
    'cmenu.undo': "Undo",
    'cmenu.redo': "Redo",
    'cmenu.expand': "Expand",
    'cmenu.collapse': "Collapse",
    'cmenu.pinTop': "Pin to the top",
    'cmenu.pinBottom': "Pin to the bottom",
    'cmenu.unpin': "Unpin",
    'cmenu.pinnedTop': "Row pinned to the top",
    'cmenu.pinnedBottom': "Row pinned to the bottom",
    'cmenu.unpinned': "Row unpinned",
    'cmenu.exportCsv': "Export to CSV",
    ...XLSX,
  },
} satisfies ContextMenuMessages;
