import type { ImportMessages } from '../part-texts.js';

/** Français, les textes de l’import de fichier (`@dzgrid/dom/import`) : `text: { ...FR.text, ...FR_IMPORT.text }`. */
export const FR_IMPORT = {
  locale: 'fr',
  text: {
    'import.drop': "Déposez le fichier pour l’importer",
    'import.read': "Lignes lues : {rows}, problèmes : {problems}",
    'import.failed': "Ce fichier ne peut pas être lu",
  },
} satisfies ImportMessages;
