# Publier DzGrid 1.13.0 — la liste du propriétaire

Préparé le 2026-11-15 comme 1.12.1, jamais publiée, renumérotée 1.13.0 (« mettre tout en 1.13.0 ») avec quatre
corrections trouvées par ton appli (fiche `presentation-settings.md` 44–47). Au départ : ta remarque « pas du tout stylé, c'est moche » sur le panneau des colonnes ancré, dans ton
appli en sombre avec le preflight de Tailwind 3). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les **cinq** paquets sont en **1.13.0** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs pairs
`@dzgrid/*` en `^1.13.0`. Une mineure : des ajouts seulement (`ColumnDef.filterButton`, `--dzg-panel-search-placeholder`,
puis le 2026-11-16 `focusVisible`, `headers: 'none'`, `ColumnDef.keyboard`, `nestedGrid({ arrows, inlineScroll })`,
`--dzg-detail-inset`), rien retiré.

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit de la 1.13.0
npm ci
npm run release:check     # « Release check: the 5 packages at 1.13.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE`.

**B. Par l'étiquette** : `git tag v1.13.0 && git push origin v1.13.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.13.0 change (fiche `presentation-settings.md` 42–43)

- **Le panneau des colonnes, une apparence soignée par défaut** (clair et sombre, gauche à droite et arabe, feuilles en
  couche ou non, avec ou sans le preflight) : la case et le nom sur une même ligne, centrés ; des lignes compactes de
  2rem, teintées au survol ; la recherche en un seul champ — une loupe, le texte en indication et comme nom accessible
  (plus d'étiquette au-dessus d'une case vide) ; une colonne qu'on ne peut pas masquer montre un cadenas grisé **à la
  place de sa case** (la case reste là, transparente, toujours atteinte et annoncée « indisponible ») ; « Tout
  afficher » et « Réinitialiser » suivent les variables des boutons de la grille (`--dzg-button-*`), après un trait.
  Dans le dock : le titre, puis « Replier », « Placer », « Fermer » en boutons carrés de même taille, chacun avec une
  infobulle égale à son nom. Les bords et traits sont dessinés pour qu'un `border-width: 0` de reset ne les efface pas.
- **Variables** (défaut = la nouvelle apparence) : `--dzg-panel-border`, `--dzg-panel-padding`, `--dzg-panel-gap`,
  `--dzg-panel-row-height`, `--dzg-panel-hover-bg`, `--dzg-panel-title-font-size`, `--dzg-panel-title-font-weight`
  (`--dzg-panel-bg` comme avant). Le tableau du guide (en, fr) les liste.
- **Un titre étroit garde son nom** : un titre avec un bouton de filtre, sous 6.5rem, montre d'abord son nom — au
  moins deux lettres et « … » à 80 px. Là, la marque « non triée » de l'appli n'est pas dessinée, et le bouton de filtre
  d'une colonne non filtrée ne prend pas de place tant que le titre n'est pas survolé ou n'a pas le focus (toujours
  atteint au clavier, nommé comme avant) ; la marque d'un tri et l'entonnoir d'une colonne filtrée restent. L'ajustement
  automatique mesure toujours le titre entier ; le minimum de 80 px ne change pas.
- Pas fait (ta décision si tu le veux) : une phrase propre au cadenas (« ne peut pas être masquée ») demanderait une
  nouvelle clé de texte, donc un changement de `ColumnsMessages` (API). Aujourd'hui : l'état « indisponible » de la case,
  et « dernière colonne affichée » quand c'est la raison.

## Les quatre corrections de ton appli (fiche 44–47)

- **Le texte indicatif de la recherche du panneau** a sa variable, `--dzg-panel-search-placeholder` (défaut
  `--tz-fg-muted`, au moins 4.5:1 sur le champ, clair et sombre) ; il tient face à la règle d'indication de la page
  (preflight de Tailwind 3, ton `placeholder:text-gray-500`), qui le donnait à 4,18:1 en clair et 1,76:1 en sombre.
- **`filterButton: false`** sur une colonne : pas d'entonnoir dans son en-tête, pas de place gardée (ni le minimum de
  80 px). Pour ta part d'en-tête qui offre déjà le filtre (`filter.set`, `filter.openFilter()`) ; Alt+Flèche bas, le
  menu de colonne et la ligne de filtres l'ouvrent toujours.
- **Une part d'en-tête remplit sa cellule**, quel que soit l'alignement (avant : seulement avec `headerAlign`). Tu
  peux retirer ton `headerAlign: 'start'` posé pour ça.
- **Entrée juste après une flèche** sur les en-têtes entre dans la zone de la part de l'en-tête atteint au lieu de
  trier (l'affichage en attente est fait d'abord, la touche lue sur le bon en-tête). Entrée trie toujours un en-tête
  dont la part ne prend pas le focus ; le clic trie comme avant.

## Les options qui retirent les rustines de ton appli (2026-11-16, « A, monte à 93 000 »)

Toujours avant publication. Chacune : ligne de fiche d'abord, tests écrits à la main et rouges d'abord, matrice.

- **`focusVisible: 'keyboard'`** (réglage, vivant ; Angular `[focusVisible]`, `<dz-grid focus-visible>`) — retire la
  **rustine 5**. Après un clic, pas d'anneau, de trait intérieur ni de teinte sur la cellule, le titre ou le volet ;
  une touche (ou le focus qui revient de l'extérieur) les ramène. La grille note elle-même le dernier geste
  (`data-dzg-ring` sur sa racine) : marche dans Firefox. Défaut `'always'` (comme avant). Pas la clé `focusRing` du
  thème (la couleur).
- **`headers: 'none'`** — retire la **rustine 6 (CSS)**. L'en-tête reste pour les lecteurs d'écran, jamais montré, jamais
  atteint au clavier (↑ depuis la première ligne reste, Tab entre sur une cellule).
- **`keyboard: false`** sur une colonne — retire le saut de la colonne du chevron de la **rustine 6 (code)**. ← → Début
  Fin la sautent, en-tête compris ; un clic y va toujours.
- **`nestedGrid({ arrows: 'rows' })`** — retire `intoDetail` / `toMaster` / `onKey` de la **rustine 6 (code)**. ↓ depuis la
  ligne maître ouverte → première ligne du détail (même colonne, sinon la première prise par le clavier) ; ↑ depuis sa
  première ligne → la ligne maître ; ↓ depuis sa dernière → la ligne après le volet ; ↑ depuis celle-ci → sa dernière
  ligne. Un détail qui n'est pas une grille garde l'arrêt unique (Entrée, Échap). Code dans un petit morceau chargé au
  premier volet qui le demande (`@dzgrid/dom/detail` n'en porte que l'`import()`).
- **`nestedGrid({ inlineScroll: 'master' })`** + **`--dzg-detail-inset`** (clé `detailInset`) — retire la **rustine 2**
  et le `scrollLeft` posé par ton code. Pas de barre horizontale propre, suit le défilement du maître (molette de côté et
  touches comprises). Défaut : comme avant (option, pas le défaut : une grille imbriquée plus large que le maître serait
  coupée). `--dzg-detail-inset: 0`, `--dzg-detail-line: none` et `--dzg-frame: none` sur la grille du détail : sa
  première colonne exactement sous celle du maître.
- Pas touché : les rustines 1, 3, 4 (déjà retirées par la 1.13.0 : 44, `filterButton`), le Tab par les boutons des
  cellules (noté dans ton LISEZMOI).

## Tailles

- Règle des +2 % : `@dzgrid/dom/internal` 3 800 → 3 876 (mesuré 3 871 : Entrée après une flèche), `@dzgrid/dom/slots`
  1 400 → 1 425 (1 412 : la part d'en-tête qui remplit), `@dzgrid/theme/columns.css` 1 224 → 1 240 (1 232) ;
  `@dzgrid/dom/filters` 12 338 / 12 350, `/filters-base` 12 285 / 12 300 ; `columns-panel.css` 1 706 / 1 720,
  `dock.css` sous 880 (tes « ok » du 2026-11-15). **K.8 91 994 / 92 000.** La base `@dzgrid/dom` inchangée
  (25 668 / 25 700) : la correction du clavier vit dans `@dzgrid/dom/internal`, pas dans la base.
- **2026-11-16 (tes options, « A, monte à 93 000 »)** : **K.8 92 000 → 93 000** (mesuré 92 378) ; règle des +2 % :
  base `@dzgrid/dom` 25 700 → 26 000 (25 977), `@dzgrid/dom/detail` 4 200 → 4 284 (4 277), `@dzgrid/theme` 3 050 → 3 110
  (3 093), `variables.css` 1 938 → 1 950, `@dzgrid/dom/theme` 2 530 → 2 550, `@dzgrid/dom/print` 1 710 → 1 720 ;
  nouvelle ligne `@dzgrid/dom/detail: through (lazy)` 1 400 (mesure 1 239 + 10 %) ; appli Angular réelle 103 150 → 103 500 (mesuré 103 485, règle des +2 %).
- **2026-11-16 (deux défauts trouvés par ton appli : les options du détail pour Angular, Ctrl+Début sur une colonne
  `keyboard: false`)** — règle des +2 % : `@dzgrid/dom/detail` 4 284 → 4 360 (4 349), `@dzgrid/angular` 8 650 → 8 800
  (8 790 : `dzgNestedArrows`, `dzgNestedInlineScroll`), appli Angular réelle 103 500 → 103 650 (103 593) ; K.8 92 485 / 93 000.

## Vérifié (2026-11-15)

`pack:local` ; `gate:step` vert d'un seul passage : `test:ci` 9 468 / 9 471 (3 sautés), `test:tz`, `typecheck`,
`build`, `check:size`, `check:api` (rien signalé : `filterButton` est un ajout), `check:types`. `test:real-app`
58/58 ; matrice `browser-1-12.mjs` 14 188 / 14 188 (Chrome 4 776, Firefox 4 728, WebKit 4 684 ; × couches × clair/sombre × fr/ar × avec/sans preflight) (section (13) neuve : contraste et variable du texte indicatif sous le
preflight, pas d'entonnoir, largeur d'une part à chaque alignement, flèche puis Entrée / F2 dans la même image —
rouge avant les corrections, vert après) ; `release:check` « the 5 packages at 1.13.0 » (appli Angular réelle 103 109, ligne 103 050 → 103 150 par la règle des +2 %) ; site 33/33 ; mots interdits verts.
