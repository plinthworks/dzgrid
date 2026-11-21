# PDF export (1.17.0) — the plan

Owner 2026-11-21 (« on passe au filtre avancé et l'export, tu peux continuer en autonome »). Opt-in, defaults
unchanged. Sheet first: `docs/behaviors/pdf-export.md`. Sizes: everything PDF in new entries (lazy); existing lines
+2 %; K.8 ≤ 94 000 and not grown. Written from ISO 32000-1 and the public TrueType tables; no PDF or font library read
or used (CLEANROOM.md).

## API

| Item | Entry | Use |
|---|---|---|
| Writer | `@dzgrid/core/pdf` | `pdfParts(input, options)` (a generator: objects, and the rows laid out as numbers), `pdfFile()` (the file around them: header, xref, trailer), `toPdf(input, options, deflate?)` (all at once, Node); types `PdfInput`, `PdfOptions`, `PdfText`, `PdfTextContext`, `PdfSummary`, `PdfObject`, `PdfPiece`; `PDF_MIME` |
| Export | `@dzgrid/dom/export` | `csvExport({ pdf: true \| PdfExportOptions })`; `run(scope, { format: 'pdf' })`; `bind(button, { format: 'pdf' })`; `ExportFormat` gains `'pdf'` |
| Cell menu | `@dzgrid/dom/context-menu` | `use: { pdf: { run: (s) => exporter.run(s, { format: 'pdf' }) } }`, label `cmenu.exportPdf` |
| Texts | `@dzgrid/dom/locales/<lang>-pdf` | `EN_PDF`, `FR_PDF`, `AR_PDF` (the menu item only) |
| Problems | `@dzgrid/core` | `ProblemCode` gains `pdf-glyph`, `pdf-text-cut`, `pdf-script`, `pdf-font` |
| Angular, element | — | as Excel's: the feature in `features`, its `run` / `bind`; nothing new |

## How it is built

- **Core** (`packages/core/src/pdf/`): `afm.ts` Helvetica / Helvetica-Bold widths and WinAnsi; `ttf.ts` reads a
  TrueType font (cmap 4 / 12, hmtx, loca, glyf) and writes its subset (unused glyphs emptied, ids kept, composite
  components kept, long `loca`); `write.ts` reads the rows as Excel does (same skip rules, columns, group labels,
  totals), lays every cell out first (wrap, cut, page breaks: the page count is known before the first page), then
  writes each page's content stream, the fonts (Type1 by name, or Type0 / CIDFontType2 / FontFile2 / ToUnicode), the
  page tree, the properties (no date) and the catalog.
- **DOM** (`packages/dom/src/export/pdf/`): a chunk loaded at the first PDF export (from the run chunk, by
  `import()`); widths from the layout, the text hook from print's sources (`g.share`, `g.grouped.cell`, `g.foot.cell`;
  undefined falls back to the core's format), each stream through `CompressionStream('deflate')` (FlateDecode), in
  16 ms slices with the cancel checked. The run chunk adds the format, its `missing-feature` and the refusal's name.

## Measures

- 10 000 rows × 10 columns, click to download: Chrome 175 ms, Firefox 264 ms, WebKit 157 ms, 0.72–0.75 MB, 286 pages
  (`scripts/browser-1-17.mjs --only pdf`). Node: `toPdf` stored 140 ms, 4.2 MB; deflated 155 ms, 0.70 MB, 304 pages.
- Sizes (minified, gzip): `@dzgrid/core/pdf` 8 153 / 9 000, pdf chunk 856 / 950, `-pdf` texts 94 / 96 / 116 → 150;
  run chunk 5 690 / 5 750 (+2 % rule), context-menu 2 591 / 2 610 (+2 %); K.8 93 762 / 94 000 (no PDF byte in it);
  `@dzgrid/core` 30 230 and `dom/export` 1 250 (+2 B, +1 B: the same minified code, esbuild's names shuffled).

## Same values everywhere

| Place | PDF |
|---|---|
| Rows | the export's (Excel's): groups, footers, grand total, totals row, tree; no pinned rows, no detail blocks |
| Columns | the export's (`columns`, else the visible ones, collapsed ones included) |
| Text | print's: screen format, `showAs` share, group / totals cells |
| Header groups | the grid's column groups, as Excel and print |

## Décisions prises en autonome

- Format : `csvExport({ pdf })` + `run(scope, { format: 'pdf' })` / `bind(…, { format: 'pdf' })`, comme Excel ; pas de poignée `exporter.pdf` (elle aurait grossi la partie chargée d'emblée, donc K.8).
- Menu des cellules : `use.pdf` reçoit `{ run }` ; son libellé dans de nouveaux paquets `locales/<lang>-pdf` (les paquets du menu n'avaient pas la place sous +2 %).
- Tableau trop large ★ : tout est réduit pour tenir la largeur (jamais découpé en pages de côté), le texte jamais sous la moitié de sa taille.
- Orientation `auto` par défaut : paysage dès que les colonnes ne tiennent pas en portrait ; A4 par défaut, Letter en option ; une marge unique (36 pt).
- Texte long : renvoyé à la ligne sur les mots, 3 lignes au plus (`wrap`), la suite coupée par « … » et comptée (`pdf-text-cut`) ; un nombre jamais renvoyé, coupé sur une ligne.
- Une ligne n'est jamais coupée entre deux pages ; l'en-tête (groupes compris) se répète en haut de chaque page.
- Numéros « 1 / 3 » en chiffres et barre, sans langue ; `pageNumbers: false` ou une fonction pour les mots de l'appli.
- Titre, sous-titre, pied comme ceux d'Excel (texte, textes, fonction) ; titre et sous-titre sur la première page seulement, pied après le tableau sur la dernière.
- Lignes écrites = celles du fichier Excel (groupes, totaux, ligne de totaux, arbre indenté) ; lignes épinglées et blocs de détail non écrits (comme Excel / CSV).
- Texte des cellules = celui de l'impression (format de l'écran, part `showAs`, cellules de groupe et de totaux) ; alignement : nombres à la fin, texte au début, `align` de la colonne respecté.
- Couleurs d'impression fixes (gris clairs, texte noir), jamais les variables CSS : un thème sombre imprime clair.
- Police par défaut ★ : Helvetica standard (WinAnsi), rien d'incorporé ; un caractère hors WinAnsi devient « ? » avec un avertissement `pdf-glyph` (compte par colonne), jamais d'erreur ; U+202F / U+00A0 des nombres français écrits en espaces, U+2212 en tiret.
- `font: ArrayBuffer` (et `boldFont`) : une police TrueType `.ttf` incorporée, sous-ensemble (glyphes non utilisés vidés, numéros gardés), table ToUnicode pour copier / chercher ; `.otf` CFF et `.ttc` refusés (`pdf-font`, Helvetica à la place) ; sans `boldFont`, le gras est simulé (contour).
- Arabe, hébreu et écritures à liaison (indiennes, Asie du Sud-Est) refusés ★ : erreur `pdf-script`, aucun fichier, l'export échoue — jamais un texte faux ; la doc renvoie à `print()` (« Enregistrer en PDF » du navigateur) ; même avec une police donnée (pas de mise en forme ni de bidi dans ce rédacteur).
- Grille de droite à gauche en texte latin : la première colonne à droite (miroir), `rtl` réglable.
- Déterministe : aucune date dans le fichier, nom de sous-ensemble tiré des glyphes ; mêmes lignes = mêmes octets (sans compression).
- Compression `CompressionStream('deflate')` du navigateur (FlateDecode) ; sans lui, ou en échec, le flux est stocké (fichier valide, plus gros).
- Pas de conformance JSON pour le PDF : l'octet exact n'est pas un contrat ; les tests relisent la structure (lecteur de test), Ghostscript et pdfminer quand ils sont là (aucun paquet ajouté ; pas de qpdf ni mutool sur la machine).
- L'échec refusé (`pdf-script`) passe par le rapport d'erreur de la grille comme tout export échoué (`window.reportError`), comme `xlsx-too-large`.
