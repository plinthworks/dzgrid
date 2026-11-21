# Ce qu'ag-Grid a et que DzGrid n'a pas — novembre 2026

Demande du propriétaire (2026-11-18) : « fais un check sur les fonctionnalités qu'ag-Grid a et qu'on n'a pas ».
DzGrid de référence : 1.13.0 (publiée). Analyse seule, aucun code touché.

**Sources.** ag-Grid : uniquement sa documentation publique — la navigation de la doc JavaScript (lue le 2026-11-18
par `https://www.ag-grid.com/llms.txt`, qui liste toutes les pages) et la page « Community vs. Enterprise ». Ni code,
ni exemple, ni CSS (`CLEANROOM.md`). La page « Community vs. Enterprise » ne donne qu'une liste courte ; le niveau des
pages plus fines vient de la doc publique telle que je la connais : un **?** marque un niveau dont je ne suis pas sûr.
DzGrid : le site `website/src/content/docs/` (pages citées `features/…`, `settings/…`, `column-options/…`,
`guides/…`), `docs/behaviors/`, `ROADMAP.md`, `docs/STATUS.md`, `CHANGELOG.md`, `docs/inventory.md` (comparaison de
la phase 3, aujourd'hui dépassée : presque tous ses « P5…P10 » sont faits).

**Lecture des colonnes.**
- **Niveau** : C = Community (gratuit), E = Enterprise (payant).
- **Verdict** : ✅ équivalent · 🟡 partiel (ce qui manque est dit) · ❌ absent.
- **Effort** pour DzGrid : S (jours), M (une à deux semaines), L (une phase).
- **Utilité** pour une appli métier comme celle du propriétaire (tables sur un serveur, journaux, maître / détail) :
  haute / moyenne / basse.

## 1. Modèles de lignes et données serveur

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Modèle client | Toutes les lignes en mémoire, tri / filtre instantanés | C | `settings/rows` | ✅ | — | haute |
| Infinite row model | Le défilement charge des blocs de lignes | C | `infiniteRows` (`behaviors/infinite-scroll.md`, 10⁷ lignes) | ✅ | — | haute |
| Server-side row model | Le serveur trie, filtre, groupe, pagine ; groupes chargés à l'ouverture | E | `settings/source`, `settings/operations`, `server-side-groups.md`, `features/lazy-children` | ✅ | — | haute |
| Pivot côté serveur | Le serveur calcule les croisements | E | `server-pivot.md` (1.8.0) | ✅ | — | basse |
| Viewport row model | Le serveur pousse la fenêtre visible (cotations qui bougent) | E | absent | ❌ | L | basse |
| Transactions (ajout / maj / suppression par id) | Une ligne change, les autres restent | C | `row-identity-transactions.md` | ✅ | — | haute |
| Mises à jour à haute fréquence | Transactions regroupées, asynchrones | C | `row-transactions-async.md` | ✅ | — | moyenne |
| Réessai d'un chargement | Bouton « Réessayer » sur un bloc en échec | E | lignes en échec avec Retry (infinite), overlay d'erreur | ✅ | — | haute |
| Pagination client et serveur | Pages, taille, « 51–100 sur 1 234 », total inconnu | C | `features/pagination`, `settings/pagination` | ✅ | — | haute |
| Sélection côté serveur | « Tout sélectionner » sur des lignes non chargées | E | `server-selection.md` | ✅ | — | moyenne |
| Mise à jour d'une ligne / cellule par l'API | Changer une valeur depuis le code | C | transactions, `edit` `commit()` | ✅ | — | haute |

## 2. Tri

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Tri par clic d'en-tête | Croissant, décroissant, aucun | C | base, `column-options/sortable` | ✅ | — | haute |
| Tri multi-colonnes | Plusieurs clés numérotées | C | `settings/multi-sort` | ✅ | — | haute |
| Comparateur propre | Une colonne trie selon son sens | C | `column-options/codec` (`compare`) | ✅ | — | moyenne |
| Tri absolu, post-tri | Trier par magnitude, épingler certains en tête | C | codec seulement, pas de crochet post-tri | 🟡 manque un crochet « après le tri » | S | basse |
| Tri annoncé au lecteur d'écran | « Trié par date, décroissant » | C | `sort.md` | ✅ | — | haute |

## 3. Filtres

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Filtre texte | Contient, commence par, égal, vide… | C | `features/filters`, `filter-text.md` | ✅ | — | haute |
| Filtre nombre | >, entre, vide | C | `filter-number.md` | ✅ | — | haute |
| Filtre BigInt | Entiers géants sans perte | C | type `custom` + `settings/filter-kinds` | 🟡 pas de type BigInt prêt | S | basse |
| Filtre date | Le, avant, après, entre ; calendrier | C | `filter-day.md`, `filter-instant.md` (fuseau), `filter-date-picker.md` | ✅ | — | haute |
| Raccourcis de dates relatives | Aujourd'hui, 7 derniers jours… | — (pas chez ag) | `filter-relative.md` | ✅ (en plus) | — | haute |
| Set filter (liste de valeurs) | Liste à cocher, recherche, tout sélectionner | E | `filter-set.md`, `value-list.md` (comptes, valeurs du serveur) | ✅ | — | haute |
| Set filter en arbre | Dates par année / mois / jour, chemins en arbre | E | absent | ❌ | M | moyenne |
| Set filter « mode Excel » | Même allure et comportement qu'Excel | E | liste proche d'Excel, pas de mode dédié | 🟡 pas de bascule « mode Excel » | S | basse |
| Multi filter | Deux filtres dans une colonne (condition + liste) | E | `filter-multi.md` (`condition: true`) | ✅ | — | moyenne |
| Plusieurs conditions ET / OU | « contient A ou B » | C | `filter-combined.md` | ✅ | — | moyenne |
| Advanced filter | Expression ET / OU sur plusieurs colonnes, saisie ou constructeur | E | 1.17.0 : `advanced-filter.md` (constructeur ; pas de saisie texte) | 🟡 pas de forme texte | S | moyenne |
| Quick filter | Une boîte cherche dans toutes les colonnes | C | `features/quick-search`, sans accents, arabe replié, serveur | ✅ | — | haute |
| Floating filters | Une ligne de champs sous les en-têtes | C | `features/filters` (ligne de filtres) | ✅ | — | haute |
| Floating filter propre | Son contrôle dans la ligne de filtres | C | `settings/filter-kinds` | ✅ | — | basse |
| Filtre externe | Un interrupteur hors grille filtre les lignes | C | sorte propre ou `params` serveur | ✅ | — | moyenne |
| Filtre propre | Curseur, carte… | C | `settings/filter-kinds` | ✅ | — | moyenne |
| Filtre API / modèle | Lire, poser, sauver le filtre | C | `features/grid-state` | ✅ | — | haute |
| Filtres envoyés au serveur | Même modèle vers l'API | E (SSRM) | `server-filter.md` | ✅ | — | haute |

## 4. Édition

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Édition de cellule | F2, Entrée, frappe, double clic | C | `features/edit`, `features/editors` | ✅ | — | haute |
| Éditeurs texte, nombre, date, case | Les champs de base | C | `features/editors` (jour, date-heure avec fuseau) | ✅ | — | haute |
| Éditeur grand texte | Zone multi-ligne en surimpression | C | 1.14.0 : `edit.editor: 'textarea'` + `@dzgrid/dom/editors-textarea` | ✅ | — | moyenne |
| Select / rich select | Liste avec recherche, clavier | C / E | `features/list-editor` | ✅ | — | haute |
| Rich select à valeurs asynchrones | La liste cherche dans le serveur en tapant | E | 1.15.0 : `edit: { search }` + `@dzgrid/dom/editors-search` (editors.md 23–29) | ✅ | — | haute |
| Édition de ligne entière | Toute la ligne passe en édition, une validation | C | 1.15.0 : `editors({ row: rowEditor })` (`@dzgrid/dom/editors-row`, edit-row.md) | ✅ | — | moyenne |
| Édition par lot (batch) | Les changements attendent, puis « Enregistrer tout » / « Annuler tout » | E ? | 1.15.0 : `editBatch()` (`@dzgrid/dom/edit-batch`, edit-batch.md ; Q-G2 « A ») | ✅ | — | haute |
| Annuler / rétablir | Ctrl+Z / Ctrl+Y | C | `edit-undo.md` (100 gestes) | ✅ | — | haute |
| Validation | Refus, message accessible | C | `column-options/validate`, `edit-validation.md` | ✅ | — | haute |
| Analyse / enregistrement des valeurs | Texte → valeur, valeur → ligne | C | `column-options/codec`, `save` | ✅ | — | haute |
| Éditer une ligne de groupe | Une somme modifiée se répartit | E | absent | ❌ | M | basse |
| Formules dans les cellules | `=A1+B1`, éditeur de formules, fonctions propres | E | absent (seulement la garde anti-formule à l'export) | ❌ | L | basse |
| Notes de cellule | Une note attachée à une cellule | E ? | absent | ❌ | M | basse |

## 5. Sélection, presse-papiers, remplissage

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Sélection de lignes (cases, tout sélectionner) | Une ou plusieurs lignes | C | `settings/selection`, `features/rules` (lignes non cochables) | ✅ | — | haute |
| Sélection hiérarchique | Cocher un groupe coche ses enfants | E | groupes : 1.14.0 `groupSelect()` ; arbre : `tree-selection.md` (pas de cascade) | 🟡 manque sur l'arbre | S | moyenne |
| Sélection de cellules / plages | Rectangles au clavier et à la souris | E | `features/range` | ✅ | — | haute |
| Poignée de plage | Agrandir la plage par une poignée | E | `features/range` | ✅ | — | moyenne |
| Poignée de recopie (fill) | Recopier, prolonger une série | E | `features/fill` | ✅ | — | moyenne |
| Presse-papiers | Copier, couper, coller, Suppr sur un bloc | E | `clipboard.md` (garde anti-formule) | ✅ | — | haute |
| Sélection du texte d'une cellule | Surligner du texte à la souris | C | non trouvé (copie par Ctrl+C) | 🟡 non vérifié | S | basse |

## 6. Groupes, agrégation, pivot, arbre, maître / détail

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Regroupement de lignes | Lignes sous des lignes de groupe | E | `features/grouping` | ✅ | — | moyenne |
| Bande « Grouper par » | Glisser un en-tête pour grouper | E | `features/group-zone` | ✅ | — | moyenne |
| Types d'affichage des groupes | Une colonne, une colonne par niveau, lignes de groupe | E | une seule façon (libellé indenté dans une colonne) | 🟡 pas de colonne par niveau | M | basse |
| Groupes collants | Les groupes restent sous l'en-tête | E | `row-grouping.md` 18, `tree-sticky.md` | ✅ | — | moyenne |
| Agrégation | Somme, moyenne, min, max, compte, propre | E | `column-options/agg-func` | ✅ | — | moyenne |
| Lignes de total | Pieds de groupe, grand total | E | `features/totals-row`, `aggregation.md` | ✅ | — | haute |
| « Afficher les valeurs en » | % du total, du parent, de la ligne | E | 1.14.0 : `showAs` + `@dzgrid/dom/show-as` (% du total, du groupe ; pas « de la ligne ») | 🟡 | S | moyenne |
| Pivot | Valeurs d'une colonne en colonnes | E | `features/pivot`, `features/pivot-bar` | ✅ | — | basse |
| Données en arbre | Chemin, enfants imbriqués, parent id | E | `features/tree` | ✅ | — | moyenne |
| Arbre filtré | Ancêtres gardés | E | `tree-filter.md` | ✅ | — | moyenne |
| Déplacer dans l'arbre | Glisser une ligne sous un autre parent | E | `row-move.md` (Alt+Maj+→) | ✅ | — | basse |
| Maître / détail | Une grille ou un contenu sous une ligne | E | `features/detail`, `features/nested-grid` | ✅ | — | haute |
| Lignes pleine largeur | Une cellule sur toute la largeur | C | `settings/full-width` | ✅ | — | moyenne |

## 7. Colonnes

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Définitions, mise à jour à chaud | Colonnes changées sans recréer | C | `settings/columns` | ✅ | — | haute |
| Colonnes générées depuis les données | Sans définitions | C | `auto-columns.md` | ✅ | — | basse |
| Types de données de cellule | Texte, nombre, date, booléen… avec format | C | `column-options/type` (+ `day` / `instant` séparés) | ✅ | — | haute |
| Colonnes calculées | Valeur calculée depuis la ligne (ag en ajoute une version saisie par l'utilisateur ?) | C ? | `column-options/value` (par code) | 🟡 pas de colonne créée par l'utilisateur | M | basse |
| Expressions / données de référence | Code → libellé | C | `column-options/enum-options` | ✅ | — | haute |
| Groupes d'en-têtes | En-têtes sur plusieurs niveaux, repliables | C | `features/groups`, `column-options/group-show` | ✅ | — | moyenne |
| Déplacer | Glisser, clavier | C | `features/columns`, `column-options/movable` | ✅ | — | moyenne |
| Épingler | Début / fin | C | `column-options/pinned` | ✅ | — | haute |
| Dimensionner, ajuster au contenu | Bord, double clic, flex | C | `column-resize.md`, `column-options/flex` | 🟡 « ajuster toutes au large de la vue » non offert | S | basse |
| Fusion de colonnes (col span) | Une cellule sur plusieurs colonnes | C | `column-options/col-span` | ✅ | — | basse |
| Restrictions (verrouiller place, visibilité) | La colonne ne bouge / ne se cache pas | C | `movable`, `hideable`, `resizable` | ✅ | — | moyenne |
| En-têtes : retour à la ligne, verticaux, info-bulle | Titres longs | C | `features/wrapped-headers`, `features/vertical-headers`, `column-options/header-tooltip` | ✅ | — | moyenne |
| État des colonnes | Sauver / restaurer ordre, largeurs | C | `features/grid-state` | ✅ | — | haute |
| Menu de colonne | Trier, épingler, taille, cacher | C / E | `features/column-menu` | ✅ | — | haute |
| Sélecteur de colonnes | Montrer, cacher, ordonner | E | `features/columns-chooser` | ✅ | — | haute |
| Barre latérale et panneaux d'outils | Panneau colonnes, panneau filtres, panneau propre | E | `features/dock`, `features/filters-panel` | ✅ | — | moyenne |
| Panneau colonnes : mise à jour différée | Changer puis « Appliquer » | E | changements immédiats (choix Q-C2) | 🟡 pas de mode différé | S | basse |
| Barre d'état | Comptes, somme / moyenne de la plage | E | `features/status-bar` | ✅ | — | moyenne |
| Barre d'accès rapide (Quick Access Toolbar) | Actions courantes à portée (récent, détail non lu) | E ? | absent ; l'hôte fait sa barre | 🟡 à préciser | S | basse |

## 8. Lignes

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Numéros de ligne | 1, 2, 3 en tête de ligne | E | `features/row-numbers` | ✅ | — | moyenne |
| Glisser des lignes (géré / non géré) | Réordonner à la souris | C | `features/row-drag` (clavier, menu aussi) | ✅ | — | moyenne |
| Zone de dépôt externe | Déposer une ligne hors de la grille | C | `row-move.md` « Other grids and zones » | ✅ | — | basse |
| De grille à grille | Déposer à une place précise d'une autre grille | C | la racine d'une autre grille, pas l'écart exact | 🟡 pas de position précise | M | basse |
| Lignes épinglées | En haut, en bas | C | `features/pinned-rows` | ✅ | — | moyenne |
| Hauteur de ligne | Fixe, auto selon contenu | C | `settings/row-height` (1.14.0 : une fonction, `rowHeights()`), `features/auto-height`, `settings/density` | ✅ | — | basse |
| Fusion de lignes (row span) | Une cellule sur plusieurs lignes | C | `column-options/merge`, `column-options/row-span` | ✅ | — | moyenne |
| Style de lignes | Classes selon les données | C | `settings/row-class`, `cell-class.md` | ✅ | — | haute |
| Animation des lignes | Les lignes glissent après un tri | C | `features/motion` (GSAP, à installer) | ✅ | — | basse |
| Clignoter un changement | Une cellule changée flashe | C | `features/motion` (GSAP), `features/fresh-rows` | ✅ | — | moyenne |
| Lignes en chargement | Squelettes pendant un bloc | C | `infinite-scroll.md` | ✅ | — | haute |

## 9. Export, import, impression

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Export CSV | Lignes filtrées / triées / choisies | C | `features/csv-export` (séparateur local, BOM, garde) | ✅ | — | haute |
| Export Excel | Vrai .xlsx, formats, dates, figés, filtres | E | `features/csv-export` (`xlsx`), `xlsx-export.md` | ✅ | — | haute |
| Excel : styles | Couleurs, gras par cellule | E | crochet `xlsxStyle` (fond, couleur, gras, italique) | ✅ | — | moyenne |
| Excel : plusieurs feuilles | Plusieurs grilles dans un classeur | E | absent (`sheets.md` = onglets de grille, mis de côté) | ❌ | M | moyenne |
| Excel : images, liens, notes | Contenu riche dans le fichier | E | absent (exclu dans `xlsx-export.md`) | ❌ | M | basse |
| Excel : maître / détail | Les détails dans le fichier | E | absent (panneaux jamais écrits) | ❌ | M | moyenne |
| Excel : formules, protection, mise en page, tableaux Excel | Fichier avancé | E | absent | ❌ | M | basse |
| Excel : contenu en plus (titre, pied) | Lignes avant / après | E | 1.14.0 : `xlsx: { title, subtitle, footer }` | ✅ | — | moyenne |
| Import Excel / CSV | Lire un fichier déposé | E | `features/file-import` | ✅ | — | moyenne |
| Export PDF | PDF propre (styles, filigrane, langues) | E | `csvExport({ pdf })` (1.17.0, `pdf-export.md`) ; arabe par l'impression du navigateur (`features/print`) | 🟡 PDF généré (latin, police TrueType donnée) ; pas d'arabe ni de filigrane | L | moyenne |
| Impression | Vue imprimable | C | `features/print`, `features/print-on-menu` | ✅ | — | moyenne |
| Export JSON | — | — (pas chez ag) | `json-export.md` | ✅ (en plus) | — | basse |

## 10. Graphiques

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Graphiques intégrés | Graphe d'une plage ou d'un pivot, menu, panneaux | E | absent | ❌ | L | basse |
| Sparklines | Mini-courbe / barres dans une cellule | E | absent (une part propre peut dessiner un SVG) | ❌ | M | moyenne |

## 11. Interaction, accessibilité, langue, sens

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Navigation clavier | Flèches, Début / Fin, Page | C | `reading-keyboard.md`, `column-options/keyboard` | ✅ | — | haute |
| Tactile | Doigt, stylet | C | défilement oui ; pas de poignées de plage ni de menu à l'appui long | 🟡 | M | basse |
| Accessibilité ARIA | Lecteurs d'écran | C | `guides/accessibility`, ACR WCAG 2.2, axe 0 | ✅ | — | haute |
| Droite-à-gauche | Grille en arabe | C | `settings/direction`, conçu dès le début | ✅ | — | haute |
| Localisation | Textes traduits | C | `settings/messages` ; fournis : en, fr, ar | 🟡 ag fournit une trentaine de langues | S par langue | basse |
| Grilles alignées | Deux grilles défilent et se dimensionnent ensemble | C | absent | ❌ | M | basse |
| Champs dans les cellules | Tab entre les contrôles d'une cellule | C | parts (`settings/parts`) | ✅ | — | moyenne |
| Contexte de la grille | Données de l'appli dans les rappels | C | `settings/context` | ✅ | — | moyenne |
| État de la grille | Sauver / restaurer tout | C | `features/grid-state` (adresse aussi) | ✅ | — | haute |

## 12. Apparence

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| API de thème (paramètres) | Couleurs, polices, bordures par code | C | `settings/theme`, `features/theming`, variables CSS | ✅ | — | haute |
| Thèmes fournis | Quartz, Alpine, Balham, Material | C | thème de base + `midnight`, `clinic` (`guides/theming-rtl`) | ✅ | — | moyenne |
| Mode sombre | — | C | `light-dark()` partout | ✅ | — | haute |
| Icônes propres | — | C | `settings/icons` | ✅ | — | moyenne |
| Theme Builder (outil visuel) | Régler le thème dans une page et copier | C | absent | ❌ | M | basse |
| Système de design (Figma) | Kit de maquettes | C | absent | ❌ | M | basse |

## 13. Performance

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Virtualisation lignes et colonnes | Seul le visible est dessiné | C | `virtual-scroll.md`, `settings/overscan` | ✅ | — | haute |
| Très grand nombre de lignes | Au-delà de la hauteur max du navigateur | C | défilement mis à l'échelle, ligne 10⁷ | ✅ | — | moyenne |
| Cache de valeurs, détection de changement | Moins de calculs | C | caches internes, réécriture seulement si changé | ✅ | — | moyenne |

## 14. Frameworks

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| JavaScript / TypeScript | — | C | `@dzgrid/dom` | ✅ | — | haute |
| Angular | — | C | `@dzgrid/angular` | ✅ | — | haute |
| React, Vue (et Solid) | Composants natifs | C | `<dz-grid>` (`@dzgrid/element`) utilisable, pas d'enveloppe dédiée ; Firefox / WebKit et page React / Vue restent à faire | 🟡 | M par framework | basse |

## 15. Divers

| Fonctionnalité | Ce que ça fait | Niveau | DzGrid aujourd'hui | Verdict | Effort | Utilité |
|---|---|---|---|---|---|---|
| Menu contextuel | Clic droit : copier, coller, exporter, actions propres | E | `features/context-menu` | ✅ | — | haute |
| Infobulles | Sur cellule, en-tête | C | `settings/tooltips`, `column-options/tooltip` (riches : DzTooltip) | ✅ | — | moyenne |
| Overlays | Chargement, aucune ligne, erreur | C | `settings/overlay`, barre `settings/busy` | ✅ | — | haute |
| Rechercher (Find) | Ctrl+F dans la grille, de résultat en résultat | C ? | `features/find` | ✅ | — | haute |
| Composants de cellule | Dessin propre | C | `settings/parts`, `features/slots`, `features/badge`, `features/cell-boolean` | ✅ | — | haute |
| Boîte à outils IA | Piloter la grille en langage naturel | E ? | absent | ❌ | M | basse |
| Serveur MCP, skills pour agents | Aider un agent à coder avec la grille | C ? | `llms.txt`, `llms-full.txt` | 🟡 pas de serveur MCP | S | basse |

## (1) Compte par verdict

139 lignes en tout (les deux lignes « en plus » de DzGrid, dates relatives et export JSON, comptées ✅).

| Verdict | Nombre |
|---|---|
| ✅ équivalent | 100 |
| 🟡 partiel | 18 |
| ❌ absent | 21 |

En clair : **tout ce qui est payant chez ag et qui sert une appli de gestion est là** (modèle serveur, liste de
valeurs, plages, presse-papiers, recopie, Excel, groupes, pivot, arbre, maître / détail, panneaux, barre d'état, menu
contextuel). Les vrais manques sont l'édition « formulaire » (ligne entière, lot, liste serveur), les graphiques, le
filtre avancé et les finitions d'Excel.

## (2) Les 15 manques à regarder d'abord (utilité × effort)

1. **Édition par lot** (❌, M, haute) — garder les changements, puis « Enregistrer tout / Annuler tout » ; courant en gestion.
2. **Liste d'édition qui cherche dans le serveur** (❌, M, haute) — référentiels de milliers de valeurs (au-delà de 500 : champ texte aujourd'hui).
3. **Édition de ligne entière** (❌, M, moyenne) — toute la ligne en édition, une seule validation, une seule sauvegarde.
4. **« Afficher les valeurs en » %** (❌, S, moyenne) — % du total ou du groupe, sans colonne calculée à la main.
5. **Éditeur grand texte** (🟡, S, moyenne) — commentaires, motifs ; aujourd'hui une part à écrire.
6. **Excel : lignes de titre / pied** (❌, S, moyenne) — « Export du 18/11, filtre : … » en tête du fichier.
7. **Sparklines** (❌, M, moyenne) — tendance d'un compteur dans une cellule de journal.
8. **Set filter en arbre pour les dates** (❌, M, moyenne) — cocher 2026 › novembre.
9. **Excel : maître / détail et plusieurs feuilles** (❌, M, moyenne) — exporter les détails avec les maîtres.
10. **Sélection hiérarchique des groupes** (🟡, S, moyenne) — cocher un groupe coche ses lignes.
11. **Filtre avancé** (❌, L, moyenne) — une expression ET / OU sur plusieurs colonnes.
12. **Export PDF généré** (🟡, L, moyenne) — aujourd'hui l'impression du navigateur vers PDF.
13. **Hauteur de ligne par fonction** (🟡, S, basse) — hauteur selon la donnée sans mesurer le contenu.
14. **Enveloppes React / Vue** (🟡, M, basse pour l'appli, utile pour l'adoption) — `<dz-grid>` suffit déjà.
15. **Graphiques intégrés** (❌, L, basse) — gros chantier ; une bibliothèque de graphiques à part ferait l'affaire.

Hors classement (basse utilité) : viewport row model, grilles alignées, formules, notes, Theme Builder, kit Figma,
boîte à outils IA, grille-à-grille à l'écart près, tactile avancé, langues en plus, BigInt, types d'affichage des groupes.

## (3) Ce que DzGrid a et qu'ag-Grid n'a pas (honnêtement)

- **Dates sérieuses** : jour et instant séparés, fuseau d'affichage (`settings/time-zone`), date sans décalage jamais
  devinée (`column-options/assume-zone`), raccourcis relatifs qui passent minuit, export Excel en heure locale nommée.
- **Arabe et droite-à-gauche conçus dès le début**, chiffres de la langue (`settings/numerals`), recherche sans
  accents et arabe replié, surlignage des trouvés.
- **Accessibilité mesurée** : ACR WCAG 2.2, axe à 0 en fr / ar, annonces pour chaque geste.
- **Tout est gratuit et sans dépendance** : ce qu'ag fait payer (serveur, Excel, plages, groupes, pivot, maître /
  détail, panneaux) est dans DzGrid ; noyau pur testé, tailles tenues au budget.
- **Petits plus** : colonnes repliées sous la ligne sur écran étroit (`features/responsive`), espaces de catégorie
  (`features/row-gaps`), import CSV / Excel, export JSON, lignes nouvelles marquées (`features/fresh-rows`), règles de
  sélection expliquées (`features/rules`), mauvaise entrée qui ne lève jamais (`Problem`).
- **Moins que ag** : écosystème, nombre de langues, graphiques, communauté et années d'usage en production.

## (4) Questions au propriétaire

1. **Q-G1 — Quoi d'abord ?**
   A ★ L'édition « formulaire » : par lot, ligne entière, liste qui cherche dans le serveur (utile tout de suite).
   B Les graphiques : sparklines puis graphiques de plage.
2. **Q-G2 — Édition par lot : où vivent les changements en attente ?**
   A ★ Dans la grille (`edit`), avec `pending()`, `saveAll()`, `discardAll()` ; l'appli décide du bouton.
   B Chez l'appli (NgRx), la grille ne fait que montrer les cellules modifiées.
3. **Q-G3 — Sparklines : à nous ou chez un voisin ?**
   A ★ Une petite part SVG à nous (ligne, barres), sans bibliothèque.
   B Laisser l'appli brancher une bibliothèque de graphiques dans une part.
4. **Q-G4 — Filtre avancé (expression sur plusieurs colonnes) ?**
   A ★ Pas maintenant : le panneau des filtres et les filtres combinés suffisent.
   B Oui, avec un constructeur ET / OU.
5. **Q-G5 — Excel : quelles finitions ?**
   A ★ Lignes de titre / pied et détails des maîtres, rien d'autre.
   B Tout (feuilles, images, liens, mise en page).
6. **Q-G6 — Frameworks ?**
   A ★ Angular et `<dz-grid>` suffisent ; finir Firefox / WebKit de `<dz-grid>`.
   B Écrire des enveloppes React et Vue.
