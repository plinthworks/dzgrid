import type { ImportMessages } from '../part-texts.js';

/** English, the file import's texts (`@dzgrid/dom/import`): `text: { ...EN.text, ...EN_IMPORT.text }`. */
export const EN_IMPORT = {
  locale: 'en',
  text: {
    'import.drop': "Drop the file to import it",
    'import.read': "Rows read: {rows}, problems: {problems}",
    'import.failed': "This file cannot be read",
  },
} satisfies ImportMessages;
