/**
 * The words of an option's facts table (<OptionFacts>), in each language. The facts themselves come from the
 * sources (scripts/gen-options.mjs → src/generated/options.json); a default the code cannot write as a literal is a
 * token here.
 */
export interface FactWords {
  type: string;
  default: string;
  required: string;
  live: string;
  angular: string;
  element: string;
  source: string;
  none: string;
  yes: string;
  no: string;
  liveYes: string;
  liveNo: string;
  liveColumn: string;
  input: (name: string) => string;
  noInput: string;
  attribute: (name: string) => string;
  property: (name: string) => string;
  viaSettings: (name: string) => string;
  tokens: Record<string, string>;
}

export const FACTS: Record<'en' | 'fr', FactWords> = {
  en: {
    type: 'Type',
    default: 'Default',
    required: 'Required',
    live: 'Live update (`update()`)',
    angular: 'Angular',
    element: '`<dz-grid>`',
    source: 'Declared in',
    none: 'not set',
    yes: 'Yes',
    no: 'No',
    liveYes: 'Yes',
    liveNo: 'No — read once, when the grid is made',
    liveColumn: 'Yes — give the columns again (`update({ columns })`)',
    input: (name) => `the \`[${name}]\` input`,
    noInput: 'no input of its own: `onEvent` is the component’s outputs',
    attribute: (name) => `the \`${name}\` attribute`,
    property: (name) => `the \`${name}\` property`,
    viaSettings: (name) => `the \`settings\` property: \`el.settings = { ${name}: … }\``,
    tokens: {
      messagesLocale: 'the bundle’s language (`messages.locale`)',
      densityHeight: 'the density’s: 28, 32 or 40 px at 16 px text',
      rowHeight: 'the row height',
      bundleLabel: 'the bundle’s `grid.label`',
      overscanAuto: '2 rows, more while scrolling fast (up to 40); 1 column',
      operationsAuto: '`\'client\'`; with a `source`, every operation on the server',
      idPath: 'the column’s `id`, unless `value` is given',
      columnId: 'the column’s `id`',
      header: 'the column’s `header`',
      filterByType: 'the filter of its type: text, number, day, instant or yes/no (an `enum` list needs `kind: \'set\'`)',
      alignByType: '`\'end\'` for a number column, else `\'start\'`',
      align: 'the column’s `align`',
    },
  },
  fr: {
    type: 'Type',
    default: 'Par défaut',
    required: 'Obligatoire',
    live: 'Modifiable en direct (`update()`)',
    angular: 'Angular',
    element: '`<dz-grid>`',
    source: 'Déclaré dans',
    none: 'non défini',
    yes: 'Oui',
    no: 'Non',
    liveYes: 'Oui',
    liveNo: 'Non — lu une fois, à la création de la grille',
    liveColumn: 'Oui — en redonnant les colonnes (`update({ columns })`)',
    input: (name) => `l’entrée \`[${name}]\``,
    noInput: 'pas d’entrée à lui : `onEvent`, ce sont les sorties du composant',
    attribute: (name) => `l’attribut \`${name}\``,
    property: (name) => `la propriété \`${name}\``,
    viaSettings: (name) => `la propriété \`settings\` : \`el.settings = { ${name}: … }\``,
    tokens: {
      messagesLocale: 'la langue du paquet de textes (`messages.locale`)',
      densityHeight: 'celle de la densité : 28, 32 ou 40 px pour un texte de 16 px',
      rowHeight: 'la hauteur des lignes',
      bundleLabel: 'le `grid.label` du paquet de textes',
      overscanAuto: '2 lignes, plus pendant un défilement rapide (jusqu’à 40) ; 1 colonne',
      operationsAuto: '`\'client\'` ; avec une `source`, chaque opération sur le serveur',
      idPath: 'l’`id` de la colonne, sauf si `value` est donné',
      columnId: 'l’`id` de la colonne',
      header: 'le `header` de la colonne',
      filterByType: 'le filtre de son type : texte, nombre, jour, instant ou oui/non (la liste d’un `enum` demande `kind: \'set\'`)',
      alignByType: '`\'end\'` pour une colonne de nombres, sinon `\'start\'`',
      align: 'l’`align` de la colonne',
    },
  },
};
