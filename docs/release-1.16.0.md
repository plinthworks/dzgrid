# Publier DzGrid 1.16.0 — la liste du propriétaire

Préparée le 2026-11-21 (« A pour Excel, prépare la 1.16 »), sur la branche `next`. **Rien n'est publié, aucune
étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en **1.16.0** (`@dzgrid/core`, `dom`,
`theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.16.0`. Une mineure : des ajouts seulement, tous
optionnels, aucun défaut changé, rien retiré.

**À savoir : la 1.15.0 publiée contient déjà ces trois ajouts.** Elle a été publiée le 2026-11-21 depuis un arbre
qui était sur `next` : les mini-courbes, le maître / détail dans Excel et `treeSelect()` y sont, sans être documentés
et avant leur revue (l'étiquette v1.15.0 pointe sur 6f0b0b5). La 1.16.0 est leur sortie officielle : documentés,
revus, avec les corrections ci-dessous. Une appli qui les importe déjà depuis 1.15.0 ne change que sa version.

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git switch next && git pull   # le commit de la 1.16.0 (main sera avancé dessus)
npm ci
npm run release:check         # « Release check: the 5 packages at 1.16.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE` (il construit l'arbre de travail : sois bien sur le
commit de la 1.16.0).

**B. Par l'étiquette** : `git tag v1.16.0 && git push origin v1.16.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.16.0 apporte (chacun optionnel)

- **Les mini-courbes** — `type: 'sparkline'` dessiné par `sparklines()` (`@dzgrid/dom/sparkline`, fiche
  `sparklines.md`) : une liste de nombres dans l'ordre du temps (un tableau, `null` un trou, ou du texte de nombres
  séparés par des espaces) en petite courbe SVG — `kind: 'line' | 'area' | 'bar' | 'winloss'`, `min` / `max`,
  `markers`. Résumé pour lecteurs d'écran (« 12 valeurs, de 3 à 41, dernière 27 »), valeur du point dans l'infobulle
  au survol, résumé au focus clavier. Le temps va de gauche à droite même en arabe. Tri par la dernière valeur ; CSV,
  Excel, JSON, presse-papiers, impression et recherche portent les nombres, jamais le résumé. Textes
  `locales/<lang>-sparkline`, look `@dzgrid/theme/sparkline.css`.
- **Le maître / détail dans Excel** — `csvExport({ xlsx: { detail: 'expanded' | 'all', detailRows, detailColumns } })`
  (fiche `xlsx-export.md` 12–19) : sous chaque maître, une ligne d'en-tête du détail (gras, sans filtre) puis ses
  lignes, une colonne plus loin et un niveau de plan plus bas (+ / −). Par défaut les lignes et colonnes visibles d'un
  `nestedGrid` ; un détail Angular (`[dzgNested]`) donne `detailRows` et `detailColumns`. Les promesses d'un serveur
  sont attendues maître après maître (progression « préparation », annulation qui abandonne le `signal`) ; un rejet fait
  échouer l'export, jamais un fichier à trous. CSV et JSON inchangés. Nouvelle entrée `@dzgrid/core/xlsx-detail`.
- **Les cases en cascade dans un arbre** — `treeSelect()` (`@dzgrid/dom/tree-select`, fiche `tree-selection.md`
  « Cascading ticks ») : une case ou Espace coche / décoche la ligne et toute sa branche, les lignes au-dessus suivent,
  la case d'un parent a trois états (`mixed`). Les enfants pas encore chargés arrivent cochés sous un parent coché ; les
  lignes cachées par un filtre ne sont jamais touchées. Les autres gestes sont inchangés.

## Ce qui peut te concerner

- **`ColumnType` gagne `'sparkline'`** : un `switch` exhaustif sur le `type` d'une colonne demande un cas de plus. Le
  reste (`ColumnDef.sparkline`, `XlsxOptions.detail` / `detailRows` / `detailColumns`, `XlsxInput.expanded` /
  `details`, `XlsxSummary.details`) est optionnel. `check:api` : ajouts seulement.

## Revue indépendante (2026-11-21)

Deux défauts trouvés et corrigés (ils étaient dans les fichiers de la 1.15.0), chacun avec un test rouge d'abord
(`packages/dom/test/sparkline.test.ts`, fiche `sparklines.md` 16) :
- Mini-courbes : une très longue liste (300 000 points) ne dessinait rien et son résumé restait vide — le plus petit et
  le plus grand étaient cherchés par un `Math.min(...liste)` qui dépasse la limite d'arguments du moteur et lève une
  erreur. Cherchés maintenant par une boucle.
- Mini-courbes : des valeurs aux bouts des nombres (±1e308) donnaient un dessin aux coordonnées `NaN` (`max - min`
  débordait en Infini), donc rien à l'écran. L'échelle se calcule maintenant par moitiés.

Tests ajoutés sans défaut : l'impression d'une mini-courbe porte les nombres (pas le résumé, pas de dessin) ; des
enfants déjà chargés sous un parent fermé sont cochés et décochés avec lui.

Vu sans défaut : mini-courbes — valeurs bizarres (NaN, Infini, textes, liste vide, un seul point, que des trous),
`min` / `max` inversés ou hors des valeurs, droite à gauche, couture de l'infobulle, résumé, et chaque endroit qui
recalcule les valeurs (écran, CSV, Excel, impression, presse-papiers — le même écrivain que le CSV —, fil du serveur :
pas de filtre de ce type), tri par la dernière valeur, coût sur 10 000 lignes (mesuré avant, comme du texte) ; Excel —
niveaux de plan (plafond 7), un en-tête par bloc, attente maître par maître avec progression et annulation, rejet =
échec propre, filtre automatique sur l'en-tête du maître seul, `nestedGrid` contre `detailRows` / `detailColumns`
d'Angular, limite de lignes d'Excel comptant les blocs ; `treeSelect()` — trois états, enfants paresseux sous un parent
coché, enfants filtrés, Espace, lecteurs d'écran (case nommée par sa ligne) ; rien qui reste après `destroy` ; aucun
`Problem` ne porte de donnée de ligne ; côtés logiques seulement.

## Tailles

**`@dzgrid/core/xlsx` 7 350 → 7 650** (toi, 2026-11-21, « A pour Excel », au-delà de +2 % ; mesuré 7 616 : la couture
des détails dans l'écrivain). **K.8 94 000** (toi, 2026-11-21 ; mesuré 93 073 : le type `'sparkline'` dans le cœur).
Règle des +2 % : `@dzgrid/core` 29 800, `core/state` 1 640, `dom/print` 1 750, `dom/theme` 2 600, `dom/detail` 4 440,
morceau d'export 5 640. Nouvelles lignes (mesure + 10 %) : `dom/sparkline` 2 350 (mesuré 2 151 après la revue), textes
-sparkline 200 / 200 / 300, `sparkline.css` 550, `core/xlsx-detail` 600 (537), morceau `xlsx detail` 850,
`dom/tree-select` 1 050 (945). Appli Angular réelle 104 000 → **104 200** par la règle des +2 % (mesuré 104 189).

## Vérifié (2026-11-21)

`pack:local` ; `gate:step` vert (696 fichiers / 9 763 tests, 3 sautés ; `test:tz`, `typecheck`, `build`,
`check:size`, `check:api` — rien retiré ni rétréci, ajouts seulement —, `check:types`). Premier passage rouge sur 2
gardes de structure laissées par les commits de la 1.16.0, réparées : `tree-select/index.ts` nomme le type `TreeRows`
du cœur (type seulement, gardé) ; le morceau d'export charge `../xlsx/detail.js` par `import()`, et ce morceau n'importe
que le cœur et `@dzgrid/core/xlsx-detail` par `import()`. `test:real-app` 58 / 58 ; matrices `browser-1-16.mjs` 351 / 351
(10 000 lignes de mini-courbes : p95 18,2 / 18,0 / 18,0 ms comme du texte, Chrome, Firefox, WebKit), `browser-1-15.mjs`
336 / 336, `browser-1-14.mjs` 75 / 75, `browser-1-12.mjs` 15 836 / 15 836 ; `test:element` 81 / 81 (Chrome, Firefox,
WebKit) ; `release:check` « the 5 packages at 1.16.0 » (appli Angular réelle 104 189 / 104 200 après la hausse +2 % ;
première mesure « OVER » sur 104 000) ; site 33 / 33 et mots interdits 3 / 3 (`packages/angular/browser/build/`
supprimé). Aucun test n'a dépassé son délai. Ton appli (`dz-grid-migration`, paquet local 1.16.1-local, DzTooltip
1.0.0) : `npm run check` 202 OK, aucun échec (le HTTP 500 est la panne simulée) ; elle tourne sur 4730.
