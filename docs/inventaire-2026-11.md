# Inventaire — novembre 2026 (DzGrid 1.14.0, DzTooltip 1.0.0, la migration)

Lecture seule du 2026-11-21 : rien lancé (pas de tests, pas de build, pas de navigateur), rien commité. Chaque ligne
cite sa preuve (un fichier, ou « absent : grep X sans résultat ») ; « non vérifié » quand je n'ai pas pu confirmer.
Sources : `CLAUDE.md`, `CLEANROOM.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `docs/STATUS.md`, `CHANGELOG.md`,
`docs/behaviors/`, le site `website/src/content/docs/`, `docs/gap-aggrid-2026-11.md`, `docs/presentation-review.md`,
`docs/phase-12-steps/`, `size-budget.json`, `api/*.api.txt`, `scripts/` ; DzTooltip (`CLAUDE.md`, `README.md`,
`CHANGELOG.md`, `docs/`, `packages/`) ; la migration (README, `docs/`, les rustines, les deux écrans — décrite ici en
termes génériques, jamais citée) ; la mémoire du propriétaire.

## Résumé (une page)

1. **Tout est publié** : npm répond 1.14.0 pour les cinq paquets `@dzgrid/*` et 1.0.0 pour les quatre `@dztooltip/*` (`npm view`).
2. **Une seule chose manque à la sortie** : l'étiquette git `v1.14.0` n'existe ni en local ni sur `origin` (`git tag -l`, `git ls-remote --tags`) ; `main` est poussée. DzTooltip `v1.0.0` **est** posée et poussée (l'hypothèse « non poussée » était fausse).
3. DzGrid couvre **100 des 139 fonctions d'ag-Grid** (18 partielles, 21 absentes — `docs/gap-aggrid-2026-11.md`) ; ce qui manque vraiment : l'édition « formulaire » (lot, ligne entière, liste serveur), les graphiques, le filtre avancé, les finitions Excel.
4. Le site est complet et **gardé par des tests** : chaque réglage (39), option de colonne (48) et fonction (53 pages) a sa page en/fr (`website/test/options.test.ts`) ; l'API de référence est générée depuis `api/*.api.txt`.
5. **Incohérences trouvées** : la base d'API du cœur n'a pas `xlsx: { title, subtitle, footer }` ni `XlsxText` (1.14.0) → la page API du site non plus ; README avec des tailles d'octobre (84 912 / 94 609) ; `ARCHITECTURE.md` K.8 « ≤ 92 kB » (ligne à 93 000) et K.7 Angular `^19‖^20‖^21` (pairs réels jusqu'à `^22`) ; 7 fiches de comportement qu'aucun test ne cite.
6. **Taille** : K.8 92 611 / 93 000 — 389 o (0,4 %) de marge : la prochaine lecture d'un réglage dans la base y touche ; relever la ligne est une décision du propriétaire (déjà 85 → 90 → 91 → 92 → 93 k).
7. **Vérifications ouvertes** (depuis la phase 11) : écoute au lecteur d'écran (L4c, jamais faite : `docs/a11y/acr-wcag22.md` « draft »), `<dz-grid>` dans Firefox / WebKit (`scripts/browser-element.mjs` Chrome seul), deux écarts 4× acceptés ou non, deuxième journée du banc.
8. **DzTooltip 1.0.0** : 35 / 35 à l'audit Floating UI, 20 fichiers de tests, matrice navigateurs lancée ; pas de budget de taille, pas de base d'API (`check:api`), pas de site, un seul fichier de test Angular, les contrôles navigateur de la fixture Angular en attente.
9. **La migration** : 199 OK dans Chrome le 2026-11-19, une rustine restante (la marque de tri d'un en-tête à filtre) ; huit bouchons à remplacer par les vraies pièces de l'appli ; jamais compilée dans la vraie appli.
10. **Prochaine décision** : l'édition formulaire (Q-G1/Q-G2 du gap, sans réponse) ou ce que tu as dit « après » (sparklines, maître / détail dans Excel) — questions à la fin.

## 1. Ce qui existe

Légende : **Entrée** = fonction, réglage ou option ; **Tests** = oui et où (dossier `packages/<p>/test/`) ; **Site** = page
sous `website/src/content/docs/` ; ✅ complet · 🟡 partiel (dit).

### DzGrid — données et serveur

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Lignes en mémoire, identité `getRowId`, transactions | `rows`, `getRowId`, `api.transaction` | core `row-identity*`, dom | `settings/rows`, `settings/get-row-id` | ✅ |
| Transactions asynchrones regroupées | sheet `row-transactions-async.md` | core / dom (sheet citée) | `settings/rows` | ✅ |
| Pages serveur, total inconnu, « 51–100 sur 1 234 » | `source`, `pagination` | dom `pagination*` (6 fichiers), core `server-side*` | `settings/source`, `features/pagination` | ✅ |
| Défilement infini, blocs, Retry, 10⁷ lignes | `infiniteRows` | core `infinite-permutations`, dom | `guides/server-data` | ✅ |
| Modèle serveur complet (tri, filtre, groupes, pivot) | `operations`, `server-side-groups.md`, `server-pivot.md` | core `server-pivot.test.ts`, dom | `settings/operations`, `features/lazy-children` | ✅ |
| Sélection côté serveur (ids / « tout sauf ») | `server-selection.md` | core / dom | `settings/selection` | ✅ |
| Rechargement, lignes gardées, barre d'attente | `reload.md`, `busy` | dom | `settings/busy` | ✅ |
| Abandon, ordre des requêtes, une seule première requête | `request-order.md` | core | `guides/server-data` | ✅ |

### DzGrid — colonnes

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Définitions, types, formats, `value`, énumérations | `columns`, `ColumnDef` (48 options) | core `columns*`, dom | `column-options/*` (48 pages, test `options.test.ts`) | ✅ |
| Déplacer, redimensionner, ajuster, épingler | `columns()`, `pinned`, `fitOnLoad`, `fitContent()` | dom `columns*` (22 fichiers) | `features/columns`, `column-options/pinned` | ✅ |
| Glisser un en-tête hors de la grille pour la masquer | `columns({ dragOutHides })` (1.14.0) | dom `columns-drag-hide.test.ts` | `features/columns` (cité 2×) | ✅ |
| Groupes d'en-têtes repliables | `groups()`, `groupShow` | dom `groups*` (3) | `features/groups` | ✅ |
| Menu de colonne, sélecteur, panneau, dock | `columnMenu()`, `columnsPanel()`, `dock()` | dom `column-menu*` (8), `columns-panel`, `dock*` (3) | `features/column-menu`, `columns-chooser`, `dock` | ✅ |
| Titres repliés, verticaux, alignés, infobulle | `wrappedHeaders()`, `headerVertical`, `headerAlign`, `headerTooltip` | dom `wrapped-headers`, `vertical-headers` | `features/wrapped-headers`, `vertical-headers` | ✅ |
| En-têtes cachés ou absents | `headers: 'hidden' \| 'none'` | dom `rustines-1-13.test.ts` | `settings/headers` | ✅ |
| Colonne sautée par le clavier, sans entonnoir | `keyboard: false`, `filterButton: false` | dom `rustines-1-13`, `app-1-13` | `column-options/keyboard`, `filter-button` | ✅ |
| Colonnes repliées sur écran étroit | `responsive()` | dom `responsive` | `features/responsive` | ✅ |
| Colonnes générées depuis les données | `autoColumns` | core `auto-columns` | `features/columns` | ✅ |
| Fusions (col span, row span, merge) | `spans()` | dom `spans*` (15) | `features/spans` | ✅ |
| État des colonnes sauvé / restauré, adresse | `gridState()` | dom `state*` (5) | `features/grid-state` | ✅ |

### DzGrid — filtres, tri, recherche

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Tri clic, multi-tri, comparateur | `sortable`, `multiSort`, `codec.compare` | core `sort*`, dom | `settings/multi-sort` | ✅ |
| Filtres texte, nombre, jour, instant (fuseau), relatif | `filters()`, `filterKinds` | dom `filters*` (32), core | `features/filters`, `settings/filter-kinds` | ✅ |
| Liste de valeurs (comptes, serveur, `exclude`, `start: empty`) | `filter: { kind: 'set' }` | dom `filter-set*`, core | `features/filters` | ✅ |
| Multi-filtre (condition + liste), ET / OU | `condition: true`, `filter-combined.md` | dom | `features/filters` | ✅ |
| Rangée de filtres flottants, hauteur propre | `filters({ floating, rowHeight })` | dom | `features/filters` | ✅ |
| Panneau des filtres | `filtersPanel()` | dom `filters-panel` | `features/filters-panel` | ✅ |
| Recherche rapide (sans accents, arabe replié, serveur) | `quickSearch()` | dom `search*` (5) | `features/quick-search` | ✅ |
| Rechercher dans la grille (Ctrl+F, résultat par résultat) | `find()` | dom `find*` (2) | `features/find` | ✅ |
| Surlignage des trouvés | `search-highlight.md` | dom | `features/quick-search` | ✅ |
| Crochet « après le tri », BigInt prêt, mode Excel | — | — | — | 🟡 absents (gap §2–3, utilité basse) |

### DzGrid — sélection et plages

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Sélection de lignes, cases, « tout », règles expliquées | `selection`, `rules()` | dom `rules*` (4), core | `settings/selection`, `features/rules` | ✅ |
| Cocher un groupe coche ses lignes | `groupSelect()` (1.14.0) | dom `grouping-select.test.ts` | `features/group-select` | ✅ |
| Cascade sur l'arbre | `tree-selection.md` | dom | `features/tree` | 🟡 pas de cascade (gap §5) |
| Blocs de cellules, poignée, clavier | `range()` | dom `range*` (31) | `features/range` | ✅ |
| Presse-papiers (copier, couper, coller, garde anti-formule) | `clipboard.md` | dom `range*` | `guides/selection-ranges` | ✅ |
| Poignée de recopie, séries, Ctrl+D / R | `fill()` | dom `fill*` (12) | `features/fill` | ✅ |

### DzGrid — édition

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Édition de cellule, F2, frappe, enregistrement, états | `edit()` | dom `edit*` (44) | `features/edit`, `guides/editing` | ✅ |
| Éditeurs texte, nombre, jour, date-heure, case | `editors()` | dom `editors*` (23) | `features/editors` | ✅ |
| Liste avec recherche | `editors-list` | dom `editors-list` | `features/list-editor` | ✅ (≤ 500 options ; au-delà champ texte) |
| Grand texte | `edit.editor: 'textarea'` (1.14.0) | dom `editors-textarea.test.ts` | `features/textarea-editor` | ✅ |
| Validation, refus, message accessible | `validate` | dom `edit-validation*` | `column-options/validate` | ✅ |
| Annuler / rétablir (100 gestes) | `edit-undo.md` | dom `edit-undo*` | `features/edit` | ✅ |
| Ligne qui ne bouge pas après édition | `reapplyAfterEdit` (K.14) | dom `edit-reapply*` | `features/edit` | ✅ |
| Édition par lot, ligne entière, liste serveur | `editBatch()`, `editors({ row: rowEditor })`, `edit: { search }` + `searchEditor` | dom `edit-batch` (17), `editors-row` (17), `editors-search` (10) | `features/edit-batch`, `row-editor`, `search-editor` | ✅ 1.15.0 |

### DzGrid — groupes, pivot, arbre, détail

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Regroupement, bande « Grouper par », groupes collants | `grouping()`, `groupZone()` | dom `grouping*` (8), `grouping-zone` | `features/grouping`, `group-zone` | ✅ |
| Agrégation, pieds de groupe, ligne de totaux | `aggFunc`, `total`, `totalsRow()` | core, dom `totals-row` | `column-options/agg-func`, `features/totals-row` | ✅ |
| « Afficher en % » du total / du groupe | `showAs` + `showAs()` (1.14.0) | dom `show-as.test.ts` | `features/show-as` | 🟡 pas « de la ligne » |
| Pivot client et serveur, barre de pivot | `pivot()`, `pivotBar()` | dom `pivot*` (8), core `server-pivot` | `features/pivot`, `pivot-bar` | ✅ |
| Arbre (chemin, enfants, parent id), filtre, collant, paresseux | `tree()`, `treeLazy()` | dom `tree*` (19), `tree-lazy` | `features/tree`, `lazy-children` | ✅ |
| Déplacer une ligne (souris, clavier, autre grille) | `rowDrag()` | dom `row-drag*` (5) | `features/row-drag`, `guides/row-moves` | ✅ |
| Maître / détail, grille imbriquée, flèches à travers, défilement du maître | `detail()`, `nestedGrid({ arrows, inlineScroll })`, Angular `dzgNested*` | dom `detail*` (15), angular `detail-nested-arrows` | `features/detail`, `nested-grid` (cité 2×) | ✅ |
| Lignes pleine largeur, épinglées, numéros, écarts, hauteurs | `fullWidth`, `pinnedRows()`, `rowNumbers()`, `rowGaps()`, `rowHeight` fn + `rowHeights()` | dom `pinned-rows*`, `row-numbers`, `row-gaps`, `row-heights.test.ts` | `settings/full-width`, `features/pinned-rows`, `row-numbers`, `row-gaps`, `row-heights` | ✅ |

### DzGrid — export, impression, import

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| CSV (séparateur local, BOM, garde), JSON | `csvExport()`, `json-export.md` | dom `export*` (8), core `csv*` | `features/csv-export` | ✅ |
| Excel maison (formats, dates en heure murale, figés, filtres, styles) | `csvExport({ xlsx })`, `xlsxStyle` | core `xlsx*`, conformance | `features/csv-export` | ✅ |
| Excel : titre, sous-titre, pied | `xlsx: { title, subtitle, footer }` (1.14.0) | core xlsx (+5), conformance (+2) | `features/csv-export` (« title » cité 4×) | ✅ — mais absent de `api/dzgrid-core.api.txt` (§2) |
| Excel : plusieurs feuilles, maître / détail, images, formules | — | — | — | ❌ (gap §9) |
| Impression, menu d'impression | `print()`, `printMenu()` | dom `print*` (4), `print-menu` | `features/print`, `print-on-menu` | ✅ |
| Import CSV / Excel (bombe ZIP bornée) | `fileImport()` | dom `import`, core `import*` | `features/file-import` | ✅ |
| PDF généré | — | — | — | 🟡 impression du navigateur seulement |

### DzGrid — présentation et thème

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Palette `--tz-*`, variables `--dzg-*` (toutes les lignes de `docs/presentation-review.md` faites en 1.9 / 1.10) | `@dzgrid/theme/variables.css`, `theming()`, `icons` | theme (41 fichiers), dom `theming.test.ts` | `features/theming`, `guides/theming-rtl`, `settings/theme`, `icons` | ✅ |
| Thèmes vitrines, ponts Tailwind 4 / 3, Bootstrap, contraste | `midnight.css`, `clinic.css`, `tailwind*.css`, `bootstrap.css`, `contrast.css` | theme, `scripts/check-contrast.mjs` | `guides/appearance` | ✅ |
| Feuilles par fonction, en couches et `unlayered` | 23 feuilles × 2 (`packages/theme/package.json`) | theme | `features/*` | ✅ |
| CSP sans `<style>` : feuilles de mise en page exportées | `injectStyles: false`, `LAYOUT_CSS`, `FILTERS_CSS`, `PAGINATION_CSS`, `STATUS_CSS`, `TREE_CSS` (`packages/dom/src/{filters,pagination,statusbar,tree}.ts`) | dom | `settings/inject-styles` | ✅ (detail, dock, find, groups, spans, filters-panel ont un `styles.ts` : exporté ? non vérifié) |
| Densités, hauteurs d'en-tête, zébrage, survol de colonne, ombre épinglée | `density`, `headerHeight`, `--dzg-row-odd-bg`, `columnHover()` | dom `column-hover`, theme | `settings/density`, `header-height`, `features/column-hover` | ✅ |
| Anneau de focus au clavier seulement | `focusVisible: 'keyboard'` (1.13.0) | dom + theme `rustines-1-13` | `settings/focus-visible` | ✅ |
| Mouvement (GSAP en pair optionnel), lignes nouvelles, badges, oui / non | `motionGsap()`, `freshRows()`, `badge`, `cell-boolean` | dom `motion-gsap`, `fresh-rows` | `features/motion`, `fresh-rows`, `badge`, `cell-boolean` | ✅ |
| Parts, slots, barre d'état, menu contextuel, overlays | `parts`, `slots()`, `statusBar()`, `contextMenu()`, `overlay` | dom `parts*` (8), `slots*` (8), `statusbar*`, `context-menu*` (7) | `settings/parts`, `features/slots`, `status-bar`, `context-menu`, `settings/overlay` | ✅ |
| Hauteur de la grille depuis son contenu | — | — | — | refusé par le propriétaire (ne pas reproposer) |

### DzGrid — accessibilité, langues, sens

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| Grille et treegrid WAI-ARIA, annonces, rangée retenue | base | dom `a11y*`, `scripts/browser-a11y.mjs` (axe 0) | `guides/accessibility` | ✅ |
| ACR WCAG 2.2 | `docs/a11y/acr-wcag22.md` | automatisé seulement | `guides/accessibility` | 🟡 **brouillon**, écoute au lecteur d'écran jamais faite (`spikes/s4-a11y/results/` : pas de `manual-*.md`) |
| Droite-à-gauche conçu dès le début, côtés logiques gardés | `direction` | `purity`/guards, matrices en arabe | `settings/direction` | ✅ |
| Langues en, fr, ar (un paquet de textes par fonction) | `messages`, `@dzgrid/dom/locales/*` (3 × 29 entrées) | dom | `settings/messages`, `locale` | ✅ (3 langues ; ag en a ~30) |
| Chiffres de la langue, fuseau d'affichage, date sans décalage jamais devinée | `numerals`, `timeZone`, `assumeZone` | core, `test:tz` (Auckland, Los Angeles) | `settings/numerals`, `time-zone`, `column-options/assume-zone` | ✅ |
| Tactile avancé (poignées, appui long) | — | — | — | 🟡 (gap §11) |

### DzGrid — Angular et élément

| Fonction | Entrée / option | Tests | Site | État |
|---|---|---|---|---|
| `<dz-grid>` Angular 19–22, signaux, une sortie par événement, `[features]`, gabarits de cellule | `@dzgrid/angular` (pairs `^19‖^20‖^21‖^22`, `packages/angular/package.json`) | angular (58 fichiers), `parity.test.ts`, `packages/angular/browser/run.mjs` | `getting-started/angular`, `api/angular` | ✅ |
| Détail Angular imbriqué avec flèches et défilement du maître | `dzgNested`, `dzgNestedArrows`, `dzgNestedInlineScroll` | angular `detail-nested-arrows` | `features/nested-grid` | ✅ |
| Élément `<dz-grid>` sans framework | `@dzgrid/element` (1 750 o) | element (2 fichiers), `scripts/browser-element.mjs` | `getting-started/web-component` | 🟡 Chrome seul (script : `browser('chrome')`) |
| React / Vue | — | — | — | 🟡 l'élément suffit ; pas d'enveloppe |

### DzGrid — docs, site, qualité

| Quoi | Où | Preuve | État |
|---|---|---|---|
| Fiches de comportement (112, écrites avant le code) | `docs/behaviors/` | 105 citées par au moins un test ; 7 non (§2) | ✅ |
| Site Astro / Starlight en + fr : 3 démarrages, 16 guides, 39 réglages, 48 options, 53 fonctions, 6 pages d'API | `website/src/content/docs/` (mêmes comptes en `fr/`) | `website/test/{options,api,pages,examples,llms}.test.ts` ; Pages GitHub (`.github/workflows/docs.yml`) | ✅ |
| `llms.txt` / `llms-full.txt` | racine | construits depuis démarrages + guides seulement (`scripts/llms.mjs` l. 25–30) ; pas les pages de fonctions / réglages | 🟡 couverture partielle, voulue |
| Pureté du cœur, mots interdits, casts de tests comptés | `packages/core/test/purity.test.ts`, `scripts/test/banned-words.test.ts`, `test-casts.test.ts` | — | ✅ |
| Gates : `gate:step` (test:ci, test:tz, typecheck, build, check:size, check:api, check:types), `release:check`, `test:real-app`, matrices (`scripts/browser-*.mjs`, 38 scripts) | `package.json`, `scripts/` | dernier gate vert 2026-11-19 (ROADMAP « 1.14.0 ») | ✅ |
| Tailles : 218 lignes de budget, K.8 92 611 / 93 000 | `size-budget.json` | règle +2 %, au-delà le propriétaire | ✅ (marge 389 o) |
| API : baseline 1.0.0, rien retiré ni rétréci sans décision | `api/*.api.txt`, `scripts/api.mjs` | `rowHeight` élargi accepté (« AA ») | ✅ (trou §2) |
| Banc public (ag-Grid, Tabulator), licences vérifiées | `docs/benchmark/` | 2026-11-09, DzGrid 1.7.0 | 🟡 une journée, deuxième à faire |
| Conformance (JSON, 61 cas) | `conformance/cases/` | vitest node | ✅ |

### DzTooltip 1.0.0

| Domaine | Fonction | Entrée | Tests | Docs | État |
|---|---|---|---|---|---|
| Positionnement | 12 placements + `auto`, flip puis en travers, `shift` (`true` / `'attached'` / `false`), `offset` (nombre, axes logiques, fonction), taille bornée à la place, couche du dessus, `<dialog>` modal, `root`, iframe même origine, shadow root, ancres virtuelles, `followCursor`, `everyFrame`, suivi de l'ancre (Resize / IntersectionObserver) | `@dztooltip/core` `tooltip()`, `popover()` | core : 13 fichiers (`float-place`, `follow`, `finish-place`, `finish-interact`, `review-*`) | README, `docs/behaviors/tooltips-popovers.md` (41 lignes de fiche), `docs/audit-floating-ui.md` 35 / 35 | ✅ |
| Bulles | délai, focus clavier immédiat, jamais au toucher seul, une à la fois, `when: 'truncated'`, groupes de délai, triangle de sécurité, tons, formes (`bubble`, `ticket`, `pill`, SVG), animations (`fade`…`morph`), mouvement réduit, `animate` (GSAP via crochet, **pas de paquet**) | `tooltip()` | `tooltip-anywhere`, `tooltip-group`, `safe-html` | README | ✅ |
| Popovers | clic ou `manual`, Échap, dehors, Tab après la fin, imbriqués, modal (`inert`, Tab enfermé, `initialFocus`, `returnFocus`), hover card, `onClose(reason)`, corps qui défile | `popover()` | `popover`, `finish-interact` | README | ✅ |
| Contenu | mots, `Node`, `{ html }` nettoyé par `safeHtml` (liste blanche, document inerte), fonction avec `gone()` | `safeHtml` | `safe-html` (entrées hostiles) | README | ✅ |
| Angular | `[dzTooltip]`, `[dzPopover]` (mots, template, composant, html ; toutes les options en entrées ; `isOpen()` ; `opened` / `closed`) | `@dztooltip/angular` (pairs Angular ^19–^22) | **1 fichier** `tooltip-directives.test.ts` | README | ✅ (tests minces) |
| Pont DzGrid | `dzTooltips({ tone, placement, animation, shape, header, html })` par la couture `FeatureHandle.tooltips` ; bulle pointée sur le texte de la cellule (fiche 41) | `@dztooltip/dzgrid` (pair `@dzgrid/dom ^1.13.0`) | 5 fichiers (`tooltip-*-grid`), types vérifiés contre DzGrid (`fits-dzgrid.ts`) | README, guide DzGrid `guides/tooltips-popovers` | ✅ |
| Thème | `dztooltip.css` (couche), `.unlayered.css`, `.scss` ; `--dzt-*` ; dérive testée | `@dztooltip/theme` | theme : 1 fichier | README (table des variables) | ✅ |
| Qualité | `test`, `test:ci`, `typecheck` (ngc strict), `build` (refuse une dépendance), `release:check` (ngc Angular 19 et 22), `test:browser` (Chrome, Firefox, WebKit × couches × schéma × langue × preflight ; sections 12–14 lancées depuis le 2026-11-16), `playground` 4740 + `playground-check` (axe 0) | `package.json`, `scripts/` | — | `docs/release-1.0.0.md` « Vérifié » | ✅ ; **pas de budget de taille, pas de `check:api`, pas de site** |

## 2. Promis mais incomplet ou incohérent

| # | Ce que dit la doc | Ce que fait le code / ce qui manque | Preuve | Effort |
|---|---|---|---|---|
| 1 | CHANGELOG 1.14.0 : « types `XlsxText`, `XlsxTextContext` (`@dzgrid/core/xlsx`) » ; STATUS « pages d'API régénérées » | La base d'API du cœur ne les a pas, et `XlsxOptions` y est sans `title` / `subtitle` / `footer` ; la page API du site (générée de la base) non plus. Le code les exporte bien. | `grep XlsxText api/dzgrid-core.api.txt` : 0 ; `website/.../api/core.mdx` : 0 ; `packages/core/src/xlsx.ts` l. 7 les exporte ; `api/dzgrid-dom.api.txt` a bien les 4 nouvelles entrées (l. 4814–4834) | S (régénérer, accepter) |
| 2 | README : « first load 84 912 B (guard 84 950) », « real Angular build 94 609 B (ceiling 95 000) » | Aujourd'hui K.8 92 611 / 93 000, appli Angular réelle 103 800 | `README.md` l. 23, 178–179 ; `size-budget.json` ; ROADMAP « 1.14.0 » | S |
| 3 | `ARCHITECTURE.md` K.8 « Profil audit ≤ 92 kB » ; K.7 « Angular ^19 ‖ ^20 ‖ ^21 » | Ligne à 93 000 depuis le 2026-11-16 ; pairs Angular jusqu'à `^22` | `grep "93 000" ARCHITECTURE.md` : 0 ; `size-budget.json` `maxGzip: 93000` ; `packages/angular/package.json` | S |
| 4 | Chaque fiche « est citée par ses tests » (`docs/behaviors/README.md`) | 7 fiches qu'aucun test ne cite : `angular-example`, `direction`, `display-format`, `instant-reading`, `operations`, `sheets` (parqué), `tooltips-popovers` (pointeur vers DzTooltip) | `grep -rl <fiche> packages/*/test conformance scripts/test website/test` : 0 pour chacune | S (pointer les tests existants ou les écrire) |
| 5 | Mémoire : « Library gap told to owner: feature CSS (filters, pagination, status) not exported for injectStyles:false » | Réglé depuis : `FILTERS_CSS`, `PAGINATION_CSS`, `STATUS_CSS`, `TREE_CSS` exportés et documentés ; mais `detail`, `dock`, `find`, `groups`, `spans`, `filters-panel` ont un `styles.ts` — exporté ou non : **non vérifié** | `packages/dom/src/{filters,pagination,statusbar,tree}.ts` ; `ls packages/dom/src/*/styles.ts` ; `settings/inject-styles.mdx` | S (vérifier, compléter la page) |
| 6 | STATUS (2026-11-14) : DzTooltip `scripts/browser.mjs` « câblé, pas encore lancé » | Lancé depuis le 2026-11-16 (sections 12–14) ; mais les contrôles de la fixture Angular (section 11b) attendent toujours une fixture propre à DzTooltip | DzTooltip `scripts/browser.mjs` en-tête ; `CHANGELOG.md` 1.0.0 | S (STATUS) / M (fixture) |
| 7 | STATUS tête : « étiquette v1.14.0 à poser » | Toujours absente, en local et sur `origin` | `git tag -l`, `git ls-remote --tags origin` (dernière : v1.13.0) | S (propriétaire) |
| 8 | DzTooltip CHANGELOG : « No size budgets yet » ; CLAUDE.md « sizes measured, never asserted » | Aucun `size-budget.json`, aucun `check:size`, aucun `api/*.api.txt` ni `check:api` : une régression de taille ou d'API passerait | `ls /Users/nadou/Dev/dztooltip/*.json` ; `scripts/` sans `size.mjs` ni `api.mjs` | M |
| 9 | Gap §14 : React / Vue « page React / Vue restent à faire » ; ROADMAP L7 « Firefox, WebKit and a React / Vue page left » | Rien depuis : `browser-element.mjs` ouvre Chrome seul | `scripts/browser-element.mjs` l. 22 | S–M |
| 10 | `docs/a11y/acr-wcag22.md` : « 1.8.0 in preparation », « draft », « no screen-reader listening » | Jamais mis à jour depuis (1.14.0 publiée) ; l'écoute (L4c) n'a pas eu lieu | en-tête du fichier ; `spikes/s4-a11y/results/` sans `manual-*.md` | S (version) / propriétaire (écoute) |
| 11 | `docs/inventory.md` (comparaison phase 3) | Dépassé — le gap de novembre le dit lui-même | `docs/gap-aggrid-2026-11.md` l. 11 | S (bandeau « dépassé » ou suppression) |
| 12 | Matrices navigateurs 1.12 / 1.13 / 1.14 | Les pages qu'elles ouvrent (`playground/v1-12-1.html`, `v1-13.html`, `v1-14.html`) sont hors git (règle des démos) : la matrice n'est pas rejouable depuis un clone ; seules `v1-14.*` restent sur le disque | `git ls-files playground \| grep v1-` : rien ; `ls playground` : `v1-14.*` seulement | décision (les pages sont-elles des démos du propriétaire ?) |
| 13 | STATUS (1.12.0) : deux blocages `page.hover` de Playwright (Firefox « unlayered dark ar », WebKit « layered dark fr », 30 s) « à surveiller » | Pas de suite écrite ; matrices 1.13 / 1.14 vertes | `docs/STATUS.md` l. 113–115 | — (à surveiller) |
| 14 | Gap §4 : « Édition de ligne entière : absent » ; questions Q-G1…Q-G6 | Sans réponse écrite du propriétaire (seulement « 1 à 5 » et « le reste après ») | `grep Q-G docs/STATUS.md ROADMAP.md` : 0 | questions ci-dessous |

Pas trouvé : page du site décrivant une chose retirée (`@dzgrid/dom/tooltip`, `hideDelayMs`, `tooltips()`, multi-feuilles :
grep sans résultat dans `website/src/content/docs`) ; « Unreleased » traînant dans le CHANGELOG (0) ; test `.skip`
(0 dans `packages/*/test`, `conformance`, `scripts/test`, `website/test` — les « 3 sautés » du gate viennent d'un
`skipIf` d'environnement, non vérifié lequel).

## 3. Ce qui reste à faire, classé (utilité pour une appli métier × effort)

| Rang | Quoi | Utilité | Effort | Source / preuve |
|---|---|---|---|---|
| 1 | **Poser et pousser `v1.14.0`** | hygiène | S (une commande, propriétaire) | §2-7 |
| 2 | **Retirer la dernière rustine** : laisser une part d'en-tête dessiner ou cacher la marque de tri de sa colonne (ex. `ColumnDef.sortMark: false` ou un drapeau dans le contexte de la part ; `aria-sort` reste) | haute (la vraie appli livre avec une règle sur `.dzg-hcell` / `.dzg-sort`) | S | `dz-grid-migration/src/app/shared/data-table/dzgrid-rustines.scss` (rustine 3) ; `filterButton` ne couvre que l'entonnoir |
| 3 | **Édition par lot** (`pending()`, `saveAll()`, `discardAll()`) | haute | M | gap §4 n° 1, Q-G2 |
| 4 | **Liste d'édition qui cherche dans le serveur** (au-delà de 500 options) | haute | M | gap n° 2 |
| 5 | **Édition de ligne entière** | moyenne | M | gap n° 3 |
| 6 | **Hygiène de l'API et des docs** : base du cœur (`XlsxText`, `xlsx.title`), page API du site, README (tailles), ARCHITECTURE K.7 / K.8, ACR (version), `docs/inventory.md`, les 7 fiches sans test | moyenne (confiance) | S | §2-1…4, 10, 11 |
| 7 | **Sparklines** (part SVG à nous) et **maître / détail dans Excel** | moyenne | M + M | gap n° 7, 9 ; propriétaire « le reste on le fera après » (STATUS tête) |
| 8 | **Sélection en cascade sur l'arbre** | moyenne | S | gap §5 |
| 9 | **Set filter en arbre pour les dates** (année › mois › jour) | moyenne | M | gap n° 8 |
| 10 | **`<dz-grid>` dans Firefox et WebKit** (+ une page React / Vue) | moyenne (adoption) | S–M | ROADMAP L7, §2-9 |
| 11 | **Écoute au lecteur d'écran** (4 passages × 45 min, `docs/a11y/parcours-essentiel.md`) puis ACR relu | haute pour qui vend l'accessibilité | M (temps du propriétaire) | ROADMAP L4c ; mémoire |
| 12 | **DzTooltip** : budgets de taille + base d'API + fixture Angular pour les contrôles navigateur ; tests Angular plus épais | moyenne | S + S + M | §2-6, 8 ; `packages/angular/test` : 1 fichier |
| 13 | **Marge K.8** : 389 o. Ce que ça veut dire : toute lecture d'un nouveau réglage **dans la base** (`@dzgrid/dom`, `@dzgrid/core`, le thème de base, le paquet Angular) coûte 50–500 o gz ; une fonction à part (nouvelle entrée) ne compte pas tant que le profil audit ne la charge pas. Prochaine base-level : soit un golf, soit une décision « 93 → 94 k » | — | décision | `size-budget.json` ; mémoire (« raising limits without the owner » : non) |
| 14 | **Écarts 4×** (drag `<dz-grid>` 55,1 / 51,6 ms ; arbre 10⁶ aux plafonds) : accepter ou police de fixture plus légère ; **deuxième journée du banc** | basse | S / M | `docs/phase-11-steps/decisions.md` « Misses written » ; `docs/benchmark/README.md` |
| 15 | **Indice visible en développement quand des textes manquent** (console seulement aujourd'hui) | moyenne (confort) | S | mémoire « à proposer » |
| 16 | **Barres de défilement qui s'effacent** | ? | S | mémoire « owner studying » |
| 17 | **Pages des matrices hors git** (`v1-12-1`, `v1-13` disparues du disque) : décider si elles rentrent en git nettoyées, sinon noter que la matrice n'est pas rejouable | moyenne (reproductibilité) | S | §2-12 |
| 18 | Filtre avancé (L), PDF généré (L), graphiques intégrés (L), enveloppes React / Vue (M), ~30 langues | basse | L | gap ; Q-G4 / Q-G6 ★ « pas maintenant » |
| — | **Ne pas reproposer** : hauteur de grille depuis le contenu, multi-feuilles (parqué, `docs/phase-12-steps/sheets-plan.md`), dépendance Floating UI, paquet GSAP, relever une limite sans le propriétaire | — | — | mémoire `project-state-2026-11.md` |

Limites connues de DzTooltip (de principe, pas des manques) : iframe d'une autre origine (le `root` est ignoré) ; dans
un shadow root sans réflexion ARIA, description par `aria-description` et pas d'`aria-controls`, et le thème doit
atteindre la page ; triangle de sécurité pour les bulles de la page, pas celles de la grille ; hover card jamais seul
accès ; cœur 11,86 kB gz tout compris (`docs/audit-floating-ui.md` §1).

## 4. Risques avant de copier la migration dans la vraie appli

Lu dans `/Users/nadou/Dev/dz-grid-migration` (README, `docs/LISEZMOI.md`, `docs/ARCHITECTURE.md`, `docs/AUDIT-CSS.md`,
`src/`), décrit sans ses noms.

1. **Jamais compilée dans la vraie appli** (`LISEZMOI` : « pas encore compilé dans ton app ») ; les chemins d'import vers
   les pièces de l'appli sont ceux du projet de migration. Vérifiée dans Chrome seulement (`captures/check.txt`,
   199 OK, 0 FAIL, 2026-11-19 ; le clavier du détail dans les trois moteurs par un script à part), sans la police maison
   de l'appli, clair et sombre.
2. **Huit bouchons à remplacer** (marqués `BOUCHON` en tête de fichier) : le chargeur de traductions (JSON local avec
   les seules clés des deux écrans, 77 lignes) ; le service « gate » réduit à un formateur de plage de dates (le vrai
   passe par moment) ; le service des périodes d'ouverture **refait d'après son usage, stratégies devinées** (le
   fichier le dit : « à vérifier ») ; le bouton, la directive d'infobulle (tippy), le sélecteur de période tzslot, le
   service de titre de page, la configuration de dialogue.
3. **Le serveur est faux** : URL et forme des appels **supposées** ; enveloppe `{ status, body }` supposée ; un nom
   d'opérateur de filtre corrigé d'une faute de frappe dans les deux écrans — **le vrai back attend peut-être l'ancienne
   orthographe** ; les bornes de dates : la grille envoie une fin exclue pour ses propres filtres, les sélecteurs
   passent tel quel ; le tri par défaut de l'écran est envoyé quand l'utilisateur n'en choisit aucun ; la sélection
   arrive en **ids** (et « tout sauf ces ids ») et non en lignes ; la taille de page n'est plus remise à 100 après
   « effacer ». Proxy `/api` → 4731 à remplacer.
4. **Ordre du CSS (Tailwind 3)** : les feuilles `unlayered` de DzGrid et de DzTooltip **juste après `@tailwind base`**,
   avant `components` / `utilities` (9 feuilles aujourd'hui : base, variables, buttons, pager, range, dock, columns,
   columns-panel, dztooltip) ; le thème de l'écran après elles ; **les rustines en dernier, hors `@layer`**. La feuille
   ag-Grid de l'appli reste importée tant qu'un autre écran est en ag-Grid (ses règles `.ag-*` ne touchent pas la
   grille — c'est la condition testée). Le mode sombre passe par la classe `.dark` → `--tz-color-scheme` (`dark-mode.ts`)
   et `data-dzg-row-fg="force"` en sombre. Budget Angular `anyComponentStyle` 8 / 16 kB : surveiller les `.scss` des
   écrans.
5. **Versions figées** (`package.json`) : Angular `~21.2`, DzGrid `1.14.0` exact, DzTooltip `1.0.0` exact, tzslot `2.4.0`
   exact, Tailwind `3.4.19`, TypeScript `~5.9`, `.npmrc` `legacy-peer-deps`. Pairs à respecter dans la vraie appli :
   DzGrid veut `@tzslot/* >=2.4.0 <3` et Angular `^19…^22` ; le pont DzTooltip veut `@dzgrid/dom ^1.13.0`. Deux
   systèmes d'infobulles cohabitent (tippy pour le reste de l'appli, DzTooltip pour la grille) : deux feuilles, deux
   délais.
6. **La rustine 3** vise des classes internes (`.dzg-hcell`, `.dzg-sort`) : elle peut casser en silence à une montée de
   DzGrid ; à retirer dès que DzGrid offre l'option (§3-2). À chaque montée : relire le fichier des rustines, regarder
   l'écran.
7. **Anciens tests `*.spec.ts`** visant ag-Grid : à réécrire (le traducteur de requêtes est une classe sans dépendance,
   facile à tester).
8. **Avant livraison** (mémoire `rustines-delivery`) : passe de style sur l'écran réel (clair / sombre, Chrome / Firefox /
   Safari, étroit, clavier, contraste), version DzGrid épinglée, `(problems)` branché sur un log.

## 5. Questions pour le propriétaire

1. **Q1 — L'étiquette `v1.14.0`** : A ★ je te donne la commande maintenant (tag + push, toi) · B à la prochaine version.
2. **Q2 — La dernière rustine** : A ★ une option de colonne en 1.15 pour cacher / confier la marque de tri à une part
   d'en-tête (S) · B garder la rustine dans l'appli.
3. **Q3 — La suite fonctionnelle** : A ★ l'édition « formulaire » (lot, puis liste serveur, puis ligne entière ; Q-G1 /
   Q-G2 du gap) · B ce que tu as dit « après » d'abord : sparklines et maître / détail dans Excel.
4. **Q4 — La vraie appli** : A ★ copier maintenant sur 1.14.0 + 1.0.0, compiler, me renvoyer les erreurs et le vrai
   contrat du back (URL, enveloppe, opérateur) · B attendre 1.15 (rustine retirée) avant de copier.
5. **Q5 — L'hygiène** (base d'API du cœur, page API, README, ARCHITECTURE K.7 / K.8, ACR, `docs/inventory.md`, 7 fiches) :
   A ★ un petit lot à part, sans release, gate à la fin · B avec la 1.15.
6. **Q6 — Les vérifications ouvertes** : A ★ `<dz-grid>` Firefox / WebKit maintenant (une matinée) ; l'écoute au
   lecteur d'écran quand tu as 3 h ; les écarts 4× acceptés tels quels · B tout laisser jusqu'à la 2.0.
