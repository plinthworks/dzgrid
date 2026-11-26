# Publier DzGrid 1.17.0 — la liste du propriétaire

Préparée le 2026-11-26, sur la branche `v117` (worktree `dzgrid-next`, au-dessus de la 1.16.0 publiée). **Rien n'est
publié, aucune étiquette n'est posée.** C'est toi qui publies. Les **cinq** paquets sont en **1.17.0** (`@dzgrid/core`,
`dom`, `theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.17.0`. Une mineure : des ajouts seulement, tous
optionnels, aucun défaut changé, rien retiré.

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git switch main && git pull   # main avancé sur le commit de la 1.17.0 (v117)
npm ci
npm run release:check         # « Release check: the 5 packages at 1.17.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE` (il construit l'arbre de travail : sois bien sur le
commit de la 1.17.0).

**B. Par l'étiquette** : `git tag v1.17.0 && git push origin v1.17.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.17.0 apporte (chacun optionnel)

- **Le filtre avancé** — une expression ET / OU sur plusieurs colonnes, groupes imbriqués (5 niveaux), fiche
  `advanced-filter.md`. C'est l'entrée `''` du modèle de filtre (`{ '': { type: 'advanced', expression } }`) : évaluée
  par le cœur, ET avec les filtres de colonne, portée par l'état sauvé, `[(filter)]`, `filterChanged` et la requête d'un
  serveur (chaque condition sous sa forme fil) ; ignorée des listes de valeurs ; « Effacer tous les filtres » l'efface.
  Une expression fautive ne lève jamais : elle ne s'applique pas, chaque faute un problème avec son chemin.
  `advancedOf`, `withAdvanced`, `setAdvanced` dans `@dzgrid/core`. Le constructeur `advancedFilter()`
  (`@dzgrid/dom/advanced-filter`) : boîte de dialogue modale, conditions dans les formulaires des colonnes, Appliquer /
  Effacer / Annuler, clavier et annonces, droite à gauche, clair et sombre ; textes `locales/<lang>-advanced-filter`,
  look `@dzgrid/theme/advanced-filter.css`. Angular `[(advancedFilter)]`, élément `el.advancedFilter`.
- **L'export PDF** — `csvExport({ pdf: true | { … } })`, `run(scope, { format: 'pdf' })`, `bind(bouton, { format:
  'pdf' })`, fiche `pdf-export.md`. Les lignes et colonnes du fichier Excel, le texte de l'impression, sur des pages A4
  ou Letter, paysage quand les colonnes ne tiennent pas, l'en-tête sur chaque page, « 1 / 3 », titre / sous-titre / pied
  comme Excel, tableau large réduit, texte long sur 3 lignes puis « … ». Helvetica (latin ; sinon « ? » et
  `pdf-glyph`) ; `font` / `boldFont` incorporent ta police TrueType (sous-ensemble, ToUnicode). L'arabe, l'hébreu et
  les écritures à liaison sont refusés (`pdf-script`, aucun fichier) : utiliser `print()`. Rédacteur pur
  `@dzgrid/core/pdf` (`pdfParts`, `pdfFile`, `toPdf` : mêmes lignes, mêmes octets, Node aussi), morceau paresseux côté
  DOM ; menu des cellules `use.pdf`, textes `locales/<lang>-pdf`.
- **Correction : la part nommée d'une ligne pleine largeur est dessinée** — `fullWidth` répondant `{ part: 'nom' }`
  était typé et documenté mais ignoré (trouvé dans ta démo, 2026-11-22). La part `cell` de ce nom (un gabarit Angular
  `dzgPart` ou `componentPart('cell', C)` aussi) dessine maintenant la ligne ; un nom inconnu : `unknown-part` et le
  texte simple.

## Ce qui peut te concerner

- **`ColumnFilter` gagne `{ type: 'advanced', expression }` et `WireFilter` `{ type: 'advanced', expression }`**
  (valables sous la clé `''` seulement) : un `switch` exhaustif sur `type` demande un cas de plus. Un serveur ne reçoit
  l'entrée `''` que si l'application se sert du filtre avancé.
- **`SpanMap` gagne `fullPart?(row)`** et `RowSpanPlan` la clé optionnelle `part` (`@dzgrid/core/spans`).
- `ExportFormat`, `ExportRequest.format` et le `format` des événements d'export gagnent `'pdf'` ; `ProblemCode` gagne
  `pdf-glyph`, `pdf-text-cut`, `pdf-script`, `pdf-font`. `check:api` : ajouts seulement.

## Revue indépendante (2026-11-26)

Cinq défauts trouvés et corrigés, chacun avec un test rouge d'abord :
- **Filtre avancé** : un raccourci de date (« aujourd'hui », « 7 derniers jours ») dans l'expression n'était pas vu
  comme tel — la grille n'armait pas sa minuterie de minuit, et une source serveur n'envoyait **aucun** filtre avancé
  (le raccourci refusé faute d'horloge). C'est maintenant un raccourci où qu'il soit
  (`packages/core/test/advanced-filter-review-1-17.test.ts`, fiche 17b).
- **Lignes pleine largeur** : une règle `fullWidth` répondant `undefined` ou `null` pour une ligne ordinaire (du
  JavaScript simple, `row.x && { part }`) était dite `invalid-span` « fullWidth threw » sur chacune de ces lignes — une
  régression de la 1.17.0. Redevenu « pas pleine largeur », sans rien dire
  (`packages/core/test/spans-full-part-review-1-17.test.ts`, fiche `spans.md`).
- **PDF** : une police TrueType abîmée à l'intérieur (avances ou `loca` hors de leurs tables) faisait lever l'export au
  lieu de `pdf-font` ; vérifiée maintenant à la lecture (Helvetica à la place), et la lecture des composants d'un glyphe
  composé s'arrête à la fin du glyphe.
- **PDF** : avec une grande `fontSize` et un grand `wrap`, une ligne plus haute que la page sortait par le bas ; ses
  lignes sont maintenant coupées à ce qui tient (« … », `pdf-text-cut`), et une première ligne sans place sous le titre
  passe à la page suivante.
- **PDF** : un titre avec un caractère hors du premier plan (un émoji) perdait sa seconde unité UTF-16 dans les
  propriétés du document.

Tests PDF ajoutés à la main (`packages/core/test/pdf-review-1-17.test.ts`, 22, chaque fichier relu par Ghostscript
`gs -o /dev/null -sDEVICE=nullpage` et pdfminer) : 3 000 lignes (décalages de la table xref, nombre d'objets, `/Size`,
`/Count`), `(`, `)`, `\`, CR / LF / CR LF, caractères de contrôle, les 27 caractères WinAnsi 128–159 et les largeurs
d'Adobe, un caractère hors du premier plan = un seul « ? », glyphe composé (composants gardés, le second lu après une
échelle), police abîmée de quatre façons, gras abîmé à côté d'un bon, 3 lignes puis « … », 200 colonnes, grille vide,
sans colonne, une ligne, pied sur sa propre page, nombres énormes, refus (hébreu dans un groupe, arabe dans les numéros
de page, syriaque, thaï ; aucune donnée de ligne dans le problème), mêmes octets avec police et compression.

Vu sans défaut : filtre avancé — évaluation par type (texte replié, nombres, jours et instants dans leur zone, oui /
non, ensembles, vides), limite de 5 niveaux, JSON fautif → problèmes sans levée ni donnée de ligne, forme fil et
aller-retour de l'état, ET avec les filtres de colonne, « Effacer tous les filtres » (menu des colonnes, menu des
cellules, panneau des filtres : tous via `makeQuery({ sort })`), listes de valeurs (client et trois sources serveur),
constructeur (piège et retour du focus, clavier, lecteurs d'écran, droite à gauche) ; chaque endroit qui recalcule le
filtre (écran, export, impression, presse-papiers : les lignes montrées ; fil du serveur ; listes de valeurs). PDF —
échappement, WinAnsi et « ? », sous-ensemble (numéros de glyphes, largeurs, cmap), réduction, en-tête répété, numéros
de page, annulation en cours (test DOM), déterminisme. Pleine largeur — nom inconnu, mise en commun des cellules, ligne
qui change de genre, gabarits Angular.

## Tailles

Règle des +2 % sur toute la 1.17.0 : **`@dzgrid/core` 29 800 → 30 300** (mesuré 30 289 : le filtre avancé, puis
les raccourcis vus dans l'expression après la revue), `@dzgrid/dom` 26 250 → 26 300 (26 256 : la part d'une ligne
pleine largeur), `core/server` 6 320 (6 309), `core/spans` 4 150 (4 137), `core/edit` 3 270 (3 246), `core/tree-lazy`
1 500 → 1 530 (1 502 : les mêmes 3 254 o minifiés, mesurés par-dessus un cœur qui a grandi), `dom/spans` 5 100
(5 082), morceau d'export 5 750 (5 689), `context-menu` 2 610 (2 591), Angular 8 960 (8 949), élément 1 785 (1 783).
**K.8 93 825 / 94 000.** Nouvelles lignes (mesure + 10 %) : `core/pdf` 9 000 (8 196), morceau pdf 950 (856),
`dom/advanced-filter` 4 400 (4 025), `advanced-filter.css` 600 (509), textes -advanced-filter 350 / 400 / 500,
-pdf 150 ×3. Appli Angular réelle 104 200 → **105 000** par la règle des +2 % (mesuré 104 964).

## Vérifié (2026-11-26)

`gate:step` vert (708 fichiers / 9 903 tests, 6 sautés ; `test:tz` Auckland et Los Angeles, `typecheck`, `build`,
`check:size`, `check:api` — rien retiré ni rétréci, ajouts seulement —, `check:types` 190 entrées). Premiers passages
rouges, réparés : des lettres hébraïques et arabes en clair dans `pdf/write.ts` (écrites en `\u`, même expression) ;
un `as never` sans sa raison et un `void || void` refusé par TypeScript dans le test de revue PDF ; les épingles des
lignes cœur, DOM, `tree-lazy` et appli Angular. `test:real-app` 58 / 58 ; `browser-1-17.mjs` 123 / 123 (filtre
avancé), `--only pdf` 39 / 39 (10 000 × 10 : 188 / 254 / 158 ms, 0,72–0,75 Mo, 286 pages ; Chrome, Firefox, WebKit ;
visionneuse PDF de Chrome), `--only full` 36 / 36 ; `test:element` 81 / 81 ; `release:check` « the 5 packages at
1.17.0 » (appli Angular réelle 104 964 / 105 000). Site : `website/test/options.test.ts` passé (dépendances du site
de `~/Dev/dzgrid`). Le gate se lance hors du bac à sable de Claude : `spikes/test/kit.test.ts` ouvre un port local, et
`serve()` attend sans fin quand il ne peut pas (`EPERM`).
