# DzGrid : architecture complète

> Livrable destiné à `/Users/nadou/Dev/dzgrid/ARCHITECTURE.md`. Rédigé le 2026-10-16, avant toute ligne de code.
> **Aucune ligne d'ag-Grid, ni d'aucune autre bibliothèque de grille, n'a été lue.** Seuls comptent le comportement observable et la liste publique de fonctionnalités, conformément à `CLEANROOM.md`. Les niveaux « Community / Enterprise » du §2 viennent de ma connaissance générale de cette liste : ils sont à confirmer sur la documentation publique à jour **[À VÉRIFIER]**.
> Ce que je n'ai pas vérifié est marqué **[À VÉRIFIER]**.

## Décisions validées par le propriétaire (2026-10-16)

Le propriétaire a accepté toutes les recommandations du §1. Elles priment sur le reste du document quand il dit autre chose.

| Sujet | Décision |
|---|---|
| K.1 Licence | Tout en MIT pour l'instant ; le niveau « Enterprise » vit dans `src/enterprise/`, exposé par sous-chemins d'export, isolé par un test de graphe d'imports. |
| K.2 Dates | Pas de Temporal dans `core` ni `dom` : `Day` (`YYYY-MM-DD`) et `InstantMs` distincts ; `zoneDayBounds` sur `Intl` ; aucun `Date` dans le cœur ; sélecteur de date par adaptateur, tzslot en option. |
| K.3 Virtualisation | DOM recyclé, lignes et colonnes, un seul conteneur de défilement ; jamais de canvas ; plafond + pagination si S1 échoue. |
| K.4 Données | Lignes du consommateur jamais modifiées ; `getRowId` requis ; transactions `{add, update, remove}` ; modifications en surcouche. |
| K.5 Moteurs | `client` (P1) → `paged` serveur, total inconnu accepté (P3) → `infinite` et `serverSide` (P7) ; `viewport` hors v1 ; pas de worker en v1. |
| K.6 Priorité Enterprise | Plages/presse-papiers/remplissage/édition en masse → filtre à valeurs → master/detail → regroupement → arbre → Excel → menus → filtre avancé → pivot ; graphiques hors v1. |
| K.7 Cibles | Chrome/Edge 123, Safari 17.5, Firefox 120 ; Angular ^19 \|\| ^20 \|\| ^21 ; Node ≥ 22. |
| K.8 Budgets | Profil audit ≤ 85 kB gz ; tout sauf graphiques ≤ 150 kB gz ; 100 000 × 30 : premier rendu ≤ 120 ms, défilement ≥ 58 fps, tri numérique ≤ 40 ms, tri texte ≤ 250 ms, filtre texte ≤ 35 ms, ≤ 25 Mo. |
| K.9 Nommage | `DzGrid`, scope `@dzgrid` ; palette partagée `--tz-*`, propre à la grille `--dzg-*` / `.dzg-*` ; playground 4700. Le scope npm reste à réserver. |
| K.10 Dépendances | Aucune dépendance d'exécution dans `core`, `dom`, `theme` ; pas de RxJS. |
| K.11 Excel | Writer XLSX maison, RTL compris, sans SheetJS (P8). |
| K.12 Compat ag-Grid | Hors v1. |
| K.13 Graphiques | Hors v1 ; `rangeAsSeries` seulement. |
| K.14 Après édition | La ligne ne bouge pas tant qu'aucun tri/filtre n'est relancé (`reapplyAfterEdit: false`), avec indicateur discret. |

### Ajustements après la Phase 0 (spikes, détail dans `spikes/*/README.md` et ROADMAP.md)

Ils priment sur les sections citées. Validés par le propriétaire le 2026-10-16, y compris les deux choix marqués ★.

- **§3.7 Virtualisation (S1, S9)**
  - Un million de lignes défile à 60 fps dans les trois moteurs : **aucun plafond de lignes, pas de pagination imposée, jamais de canvas**.
  - Plafonds de hauteur mesurés : Chrome et WebKit 33 554 428 px ; Firefox 17 895 696 px et **s'effondre à 0** au-delà. WebKit **revient à 0** quand on écrit un `scrollTop` démesuré : toujours borner avant d'écrire.
  - La vraie limite est la précision des flottants : au-delà de 2²² px, Firefox et Chrome (DPR 3) décalent d'un demi-pixel ou d'un pixel d'écran. **`maxPhysical = 4 000 000 px`** (et non 8 M) ; la mise à l'échelle commence vers 125 000 lignes de 32 px.
  - `scrollMapper(logicalHeight, maxPhysical, viewportBlockSize)` projette la **plage de défilement** (L − vp sur P − vp), extrémités exactes, reconstruit au redimensionnement. Projeter les hauteurs rend les dernières lignes inatteignables.
  - Le décalage logique est la source de vérité ; la grille ignore ses propres écritures de `scrollTop`. Grands décalages par la mise en page (couche placée en `inset-block-start`), petits par rapport à une base ré-ancrée tous les 2²⁰ px.
  - Lignes **recyclées dans l'ordre du DOM**, **`contain: strict`** sur chaque ligne, **pas de `content-visibility`** (coûte 17 à 27 % dans Chrome), **jamais de reconstruction de la fenêtre** (2,4 à 3,5× plus lent, seule variante qui perd des images). ★ Position des lignes en **`inset-block-start`** (égalité de vitesse avec `translateY`, propriété logique, meilleure précision) ; cellules en `inset-inline-start`.
  - Hauteur automatique (S3) : ancre = première ligne visible déjà mesurée, plus une ancre de fin en bas ; mesure des nouvelles lignes par lecture groupée dans le rAF, avant la peinture ; `ResizeObserver` pour les changements ultérieurs (police, largeur). **Libre jusqu'à 10 000 lignes ; au-delà, permise avec un avertissement au développeur** (Firefox bouge de ≤ 1,5 px vers 4,8 M px).
- **§3.7 Arbre DOM et rangée retenue (S4, S10)**
  - `role="grid"` sur `.dzg-viewport` ; la région live et le pied **hors** du `grid` (sinon `aria-required-children` dans les trois moteurs). `tabindex="-1"` sur le conteneur de défilement (Firefox le met sinon dans l'ordre de tabulation).
  - **Contrat de la rangée retenue** : (1) la ligne qui porte l'arrêt de tabulation est retenue quand elle quitte la fenêtre, même si la grille n'a pas le focus, au plus une ; (2) relâchée quand le focus change de ligne ou que la ligne n'est plus affichée, le focus passant alors volontairement à la ligne la plus proche ; (3) dans le rowgroup du corps, à sa place dans l'ordre d'affichage (ordre du DOM = ordre `aria-rowindex`) ; son nœud n'est **jamais déplacé, détaché ni rebranché** — la fenêtre se reconstruit autour d'elle ; (4) jamais cachée (`display`, `visibility`, `content-visibility`, `inert`, `aria-hidden` interdits) : elle reste à sa vraie position, coupée par le conteneur ; (5) mise à jour comme toute ligne, sauf la cellule en édition ; (6) pour fermer un éditeur, focaliser la cellule d'abord, retirer l'input ensuite.
  - Invariant §4 n° 14 complété : « la ligne focalisée n'est jamais déplacée dans le DOM » (déplacer un nœud focalisé perd le focus, sans événement dans Firefox et WebKit ; `moveBefore` n'existe pas dans WebKit).
  - Les défilements déclenchés par une touche s'exécutent après un `requestAnimationFrame` (Firefox annule un défilement programmé dans la même image) **[À VÉRIFIER dans le vrai code]**.
- **§3.8 Rendu, clavier, presse-papiers (S2, S7)**
  - `ensureVisible` défile par géométrie ; tout `scrollIntoView` exige `scroll-padding-inline-start/end` = largeurs épinglées et `scroll-padding-block-start` = hauteur d'en-tête.
  - Poignée de redimensionnement au bord inline-end ; pour la dernière colonne épinglée en fin, au bord inline-start avec sens inversé.
  - Presse-papiers : écouteurs sur `document`, routés par `document.activeElement` (Firefox envoie à `<body>`) ; collage **`text/plain` d'abord** (TSV), `text/html` (premier `<table>`) seulement si le texte est vide ; copie des deux formats depuis l'événement. TSV : CRLF après chaque ligne, dernière comprise ; cellule entre guillemets seulement si elle contient TAB, CR, LF ou `"` ; décodage tolérant. Menu « Copier » par `clipboard.write` ; menu « Coller » par `readText`, avec un message « utilisez Ctrl+V » si refusé. Jamais `execCommand`.
  - Ouvert : Entrée dans un éditeur (rester ou descendre) ; ligne éditée qui disparaît (valider ou annuler) — à trancher par le propriétaire avant la Phase 4.
- **§3.9 i18n, RTL, a11y (S2, S4, S5)**
  - RTL : `scrollLeft` va de 0 à −max dans les trois moteurs ; `ScrollX` logique 0..max, convention détectée une fois par document ; après un changement de `dir`, relire et reposer la position logique. Ne jamais déduire le côté de l'ascenseur de `clientLeft` (WebKit l'omet).
  - ★ Bidi : **cellule flex + `<span>` intérieur en `unicode-bidi: plaintext`**, pour les colonnes de **texte libre seulement** (noms, commentaires) ; les colonnes nombre, jour, instant, énumération n'en ont pas.
  - Intl : poser **toujours** `calendar: 'gregory'` (Safari ouvre `ar-SA` en Umm al-Qura) et `numberingSystem` (`ar-SA`, `ar-EG` sont en chiffres arabes-indiens par défaut ; `ar-DZ`, `ar-MA`, `ar-TN`, `ar` en latins). Un lecteur de nombre retire U+200E, U+200F, U+061C, U+00A0, U+202F, U+066C et lit U+066B comme décimale, U+066A comme pourcent.
  - Accessibilité : colonne d'identité en `rowheader` par défaut ; Chrome ignore `aria-colspan` sur une ligne de détail (la cellule hérite de l'en-tête « Nom ») ; annoncer déplier/replier dans la région live (macOS n'expose pas « n sur m » dans un arbre) ; en pagination, `aria-rowcount` couvre la page courante ; « 10.000 » en `ar-DZ` peut être lu comme un décimal **[À VÉRIFIER avec un lecteur d'écran]**.
- **§3.4–3.5 Valeurs et tri (S5)** : `zoneDayBounds` **vérifié** : 14 cas et 92 040 bornes (12 zones, 2010–2030) identiques dans node, Chrome, Firefox, WebKit ; 22–48 µs par appel. Tri du texte par **clés de rang** (les valeurs distinctes sont classées une fois, puis tri par entier : ~15 ms pour 100 000 lignes ensuite), sur le fil principal, sans Worker ; défaut `sensitivity: 'base'`, `numeric: true`. Jamais `localeCompare` dans un tri.
- **§3.12 Wrapper Angular (S6)** : une vue par cellule à gabarit, gardée toute sa vie (pool par colonne) ; au recyclage, on modifie l'objet de contexte et on appelle `detectChanges()` sur cette vue seule, de façon synchrone ; vue attachée à `ApplicationRef` pour que les signaux de l'hôte restent vivants. Vues neuves et contextes en signaux rejetés. `<ng-template dzgCell="colId" let-value let-row="row" let-index="index">` lu par `contentChildren`, typé par `ngTemplateContextGuard` ; les sorties passent par la fermeture du gabarit de l'hôte. Le DOM appelle `bind` hors de tout contexte réactif (NG0600). Conseil documenté : **≤ ~3 colonnes à gabarit** dans une fenêtre de 40 lignes ; au-delà, rendus DOM. Option `cellComponent` (pool de `ComponentRef` + `setInput`, même coût). Ouvert : priorité entre gabarit et rendu de colonne quand les deux existent.
- **§3.16 et K.11 Export (S8)** : writer XLSX validé (zip, CRC-32, 0 cellule fausse sur 100 010, 3,9 kB gz) ; `deflate-raw` gardé, stockage sans compression en repli. Instants écrits en heure murale de la zone d'affichage, zone nommée dans l'en-tête ; une cellule texte n'est jamais une formule ; échappement `_xHHHH_` ; jours avant 1900-03-01 en texte avec un `Problem` ; 32 767 caractères par cellule ; le vrai writer sera découpé et en flux ; ZIP64 hors v1. Fidélité Excel **[À VÉRIFIER à la main]**.
- **Outillage** : `@angular/build` manque pour compiler Angular avec Vite ; S6 a compilé en AOT par `ngc` + linker + esbuild. À ajouter avant la Phase 3.

## 0. Provenance, et limites de ce que j'ai lu

**Lu en entier ou presque** : `dzgrid/CLEANROOM.md` ; DzCalendar `ARCHITECTURE.md` (1352 lignes), `CLAUDE.md`, `ROADMAP.md` (120 premières lignes), `CLEANROOM.md` (via DzGrid, identique en esprit), `conformance/README.md`, `perf/budgets.json`, `vitest.config.ts`, `scripts/build.mjs`, `packages/theme/dzcalendar.scss` (110 premières lignes), liste de `packages/` ; tzslot `CLAUDE.md`, `ROADMAP.md` (80 lignes), `packages/theme/tzslot.scss` (120 lignes), `packages/angular/src/calendar.ts` (lignes 100-220) ; ngx-sheetgrid `cell-edits.ts`, `displayed-rows.ts`, `date-value.ts`, `event-target.ts`, `grid.types.ts`, `rule-engine.ts`, `cell-range.ts` (175 premières lignes) ; le plan `blueprint-0.2.0.md` ; la note de cadrage Sehhaty `grille-de-donnees.md`.

**Lu seulement par signatures (grep des `import` et `export`)** : `fill-handle.ts`, `cell-value.ts`, `filter-label.resolver.ts`. Leur contenu interne est **[À VÉRIFIER]** (en particulier un éventuel usage de `Date` dans `fill-handle.ts`/`nextInSeries`).

**Non lu** : les specs de ngx-sheetgrid, `tzslot/README.md`, le reste de `packages/angular/src`, `tzslot/dom/src/calendar.ts` (l'absence de RTL ~l.593 est reprise de la consigne, non revérifiée), `size-budget.json`, le reste de `dzcalendar.scss`.

**Pas de shell dans cette session** : `git show --stat a6c97f5` n'a pas pu être exécuté. Les cinq bugs corrigés par ce commit (index affiché vs source, réponses serveur dans le désordre, dates décalées d'un jour, raccourcis qui volent la saisie, rollback) sont ceux de la consigne et du plan 0.2.0, recoupés avec le code que j'ai lu (`displayed-rows.ts`, `date-value.ts`, `event-target.ts`, `cell-edits.ts`). Le détail exact du diff est **[À VÉRIFIER]**.

**Je n'ai rien mesuré.** Tous les chiffres de budgets (§5.2) sont des **cibles** à confirmer par les spikes de la Phase 0.

### Décisions validées par le propriétaire

Aucune pour l'instant. Cette section se remplit, comme dans DzCalendar, à mesure que le propriétaire tranche K.1 à K.14. Ce qu'elle dit prime sur le reste du document.

### Conventions reprises à l'identique de DzCalendar et tzslot

| Convention | Source | Conséquence pour DzGrid |
|---|---|---|
| Cœur pur : `lib: ES2023` sans DOM, `types: []`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` | DzCalendar B (paquet core) | Identique. Un test de pureté échoue sur `\bDate\b`, `Date.now`, `Math.random`, `performance.now`, tout global DOM. |
| Tests du cœur en `node`, jamais jsdom ; jsdom pour le comportement DOM ; vrai Chrome (`playwright-core`, `channel:'chrome'`) pour la mise en page | `vitest.config.ts`, CLAUDE.md | Projets vitest `core`, `dom`, `angular`, `conformance`, `theme`. Captures par clip d'une capture pleine page. |
| Conformité JSON écrite **à la main**, lisible par d'autres langages | `conformance/README.md` | `@dzgrid/conformance`, mêmes règles : chaînes ISO, `refs`, jamais générée sans revue. |
| Un `Problem` (code + détail) au lieu d'une exception sur donnée invalide ; exception seulement sur erreur de programmation (contexte invalide) ; les phrases naissent dans la couche DOM | DzCalendar B.5 | Même règle. Ex. : `duplicate-row-id`, `invalid-day`. |
| `update(patch)` conçu pour un framework qui rend la valeur à chaque changement ; l'état d'interface survit ; dernière valeur émise ignorée au retour | DzCalendar D.7, tzslot CLAUDE.md | Identique (§3.9, §3.12). |
| Planificateur à 3 phases lecture, calcul, écriture ; aucune lecture de géométrie dans un chemin d'écriture ; `LayoutCount` mesuré | DzCalendar D.1 | `FrameScheduler` repris. |
| `PrefixSums` (Fenwick) et `visibleRange` | DzCalendar B.12 | Repris tel quel (notre code, MIT) dans `core/layout`. |
| Wrapper Angular : instance DOM créée à la construction, `effect(() => untracked(...))`, `model()`, pas de `NgZone` obligatoire | tzslot `calendar.ts:150-168` | Identique (§3.12). |
| Thème : SCSS source, CSS compilé, test de dérive, `light-dark()`, `--tz-*` partagé, préfixe propre pour le reste | `tzslot.scss`, `dzcalendar.scss` | Même famille (§3.11). |
| Build `scripts/build.mjs` : tsc par paquet, manifeste `dist/` réécrit, refus d'un manifeste qui pointe vers `src/` | `build.mjs` | Copié. |
| Bench sur bundle **minifié** avec `perf/budgets.json`, sortie 1 si dépassement | CLAUDE.md DzCalendar | Identique, avec un volet navigateur. |
| Fiches `docs/behaviors/<nom>.md` écrites **avant** le code, les tests y renvoient | `CLEANROOM.md` | Liste des fiches à écrire par phase en §6. |
| Revue d'architecte + revue de code en fin de phase, constats corrigés avant « terminé » | CLAUDE.md DzCalendar | Identique, §6. |
| Parler au propriétaire en français ; valider les décisions structurantes avant de coder | CLAUDE.md | Ce document sert à cela. |

---

## 1. Décisions à faire valider par le propriétaire

Chaque décision porte ma recommandation. Rien n'est codé tant que K.1 à K.9 ne sont pas tranchées.

### K.1 Licence et modèle gratuit / pro
- **Contexte** : le besoin est « Community ET Enterprise ». DzCalendar a décidé « tout en MIT pour l'instant, frontière de code pour le Pro ».
- **Recommandation** : **tout en MIT**. Les fonctions de niveau Enterprise vivent dans un dossier `src/enterprise/` de chaque paquet, exposées par des **sous-chemins d'export** (`@dzgrid/core/grouping`, `@dzgrid/dom/range`…). Un test de graphe d'imports interdit à la base (`core/index`, `dom/index`) d'importer `enterprise/`. Un futur découpage (FSL, clé de licence) devient alors mécanique, sans que le modèle économique soit décidé maintenant.
- **Si autre choix** : une licence FSL dès le départ impose un paquet séparé et une vérification de clé hors ligne (cf. DzCalendar K.9). Coût : un mois, aucun gain tant qu'il n'y a pas de second client.

### K.2 Dépendance à `@tzslot/core` (Temporal, ~20 kB gz) pour les colonnes date
- **Contexte** : une grille de lignes n'a pas besoin de `ZonedDateTime`. Le piège réel est le **jour calendaire contre l'instant** (bug « dates décalées d'un jour »). Le budget total visé est ~85 kB gz pour l'écran d'audit : 20 kB seraient près d'un quart.
- **Recommandation** : **pas de dépendance à Temporal dans `@dzgrid/core` ni `@dzgrid/dom`**. Deux types de valeurs distincts, jamais mélangés :
  - `Day` : chaîne `YYYY-MM-DD` validée, manipulée par arithmétique entière sur les jours depuis l'époque. Aucune zone.
  - `InstantMs` : millisecondes depuis l'époque, lues depuis un nombre ou une chaîne ISO **avec** offset (`Z`, `+01:00`). Une chaîne sans offset est un `Problem` (`ambiguous-instant`), jamais une supposition silencieuse (option `assumeZone` explicite).
  - Le seul calcul de fuseau nécessaire (« les bornes du jour D dans la zone Z ») est écrit en ~1 kB sur `Intl.DateTimeFormat` avec `timeZone` (`zoneDayBounds`, §3.4), validé par des cas de conformité qui reprennent ceux de DzCalendar (`zone-dayinfo`).
  - **Aucun `Date`** dans le cœur : formatage par `formatToParts(epochMs)` (la technique de DzCalendar B.17).
  - Le sélecteur de date de l'interface est un **adaptateur** (`DatePickerAdapter`). Par défaut : champ texte + `<input type="date">` natif. Un adaptateur optionnel `@dzgrid/dom/tzslot-picker` branche `@tzslot/dom` (peer optionnelle, chargée à la demande) pour qui l'a déjà.
- **Si autre choix** (dépendre de `@tzslot/core`) : cohérence parfaite avec DzCalendar et un seul Temporal dans la page, au prix de +20 kB gz sur *chaque* écran, y compris ceux sans colonne date.

### K.3 Stratégie de virtualisation : DOM recyclé ou canvas
- **Recommandation** : **DOM recyclé**, lignes **et** colonnes, dans **un seul conteneur de défilement** (§3.6). Un canvas ruinerait l'accessibilité (lecteurs d'écran, sélection de texte native, recherche de page), le RTL et le bidi (arabe mêlé de latin), le thème par variables CSS et les cellules personnalisées. La performance de 10⁵ lignes × 30 colonnes est atteignable en DOM si un cellule visible coûte ~0,01 ms.
- **Condition de la recommandation** : les spikes S1, S2 et S9 de la Phase 0 doivent le confirmer. Si S1 échoue (un million de lignes n'est pas défilable), on **plafonne** le nombre de lignes défilables et on impose la pagination ou l'infini serveur au-delà ; on ne passe pas au canvas.
- **Limite connue** : la hauteur maximale d'un élément est bornée par le navigateur (de l'ordre de 17,9 M px sous Firefox, 33,5 M px sous Chrome **[À VÉRIFIER, spike S1]**). Au-delà d'environ 250 000 lignes × 32 px, un `ScrollMapper` met l'échelle (§3.6).

### K.4 Modèle de données : immuable, transactions
- **Recommandation** :
  - Les objets de ligne du consommateur ne sont **jamais modifiés** (acquis de ngx-sheetgrid : `cell-edits.ts` stage dans un tampon).
  - Identité obligatoire : `getRowId` est **requis**, jamais deviné (corrige l'échantillon de la première ligne).
  - Le magasin (`RowStore`) est mis à jour par **transactions atomiques** `{add, update, remove}` ; `setRows(rows)` est une transaction calculée par différence d'identités.
  - Les modifications de cellule restent dans une **surcouche** (`CellEdits`) lue au moment d'afficher, de trier et de filtrer (O(1) par cellule), au lieu de recopier tout le tableau comme `applyCellEdits`.
  - Structure : tableau + `Map<RowKey, RowNode>` à copie sur écriture et numéro de version. Un arbre persistant (DzCalendar B.6) serait du luxe : 100 000 pointeurs se recopient en ~0,3 ms.
- **Si autre choix** : mutation en place = plus rapide, mais ouvre la porte au rollback qui corrompt la source, et à la perte d'identité des lignes.

### K.5 Moteurs de lignes
- **Recommandation** : quatre moteurs derrière une même interface `RowModel`, dans cet ordre de construction :
  1. `client` (Phase 1) : tri, filtre, regroupement en mémoire ; sert aussi les annuaires de ~11 000 lignes.
  2. `paged` serveur (Phase 3) : **premier besoin de Sehhaty** (journaux d'audit 10⁵ à 10⁷ lignes). Le total peut être **inconnu** (compter 10⁷ lignes coûte cher) : la barre de pagination fonctionne avec `hasNext`.
  3. `infinite` (blocs paginés, défilement) puis `serverSide` (groupes et feuilles paresseux) en Phase 7.
  4. `viewport` (le serveur pousse la fenêtre visible) : **hors v1**, à la demande.
- Pas de Web Worker en v1 (le pipeline est synchrone). Il reste « worker-ready » : étapes pures, entrées et sorties sérialisables.

### K.6 Priorité des fonctions Enterprise
Ordre proposé, guidé par les écrans de Sehhaty :

| Rang | Fonction | Pourquoi | Phase |
|---|---|---|---|
| 1 | Sélection de plage, presse-papiers, poignée de remplissage, édition en masse | `pharma/stock` (« seul écran où l'édition en masse a un sens métier ») ; modules déjà écrits dans ngx-sheetgrid | 4 |
| 2 | Filtre à valeurs (set) | Journaux d'audit, annuaires : filtres sur des énumérations | 3 |
| 3 | Master/detail | `admin-lab-facilities` | 6 |
| 4 | Regroupement et agrégation | Historiques pharmacie et labo | 6 |
| 5 | Données arborescentes | À la demande | 6 |
| 6 | Export Excel | Les administrateurs ouvrent les exports dans Excel | 8 |
| 7 | Menu colonne, menu contextuel, panneau latéral, barre d'état | Confort | 5 et 8 |
| 8 | Filtre avancé | À la demande | 8 |
| 9 | Pivot | Peu probable pour Sehhaty | 9 |
| 10 | Graphiques intégrés | **Hors v1** (K.13) | — |

### K.7 Navigateurs et frameworks
- **Recommandation** : navigateurs à jour, seuil fixé par `light-dark()` : **Chrome et Edge 123, Safari 17.5, Firefox 120** (même seuil que tzslot et DzCalendar). Angular `^19 || ^20 || ^21` (signaux d'entrée et `model()` stables à partir de 19 ; Sehhaty est en 21). Node ≥ 22 pour les outils.
- **Si autre choix** : viser Angular 18 comme tzslot oblige à contourner `model()` et NG0600.

### K.8 Budgets de taille et de performance
Chiffres complets en §5.2 et §5.3. **Cibles proposées** :
- profil « écran d'audit » (cœur + DOM de base + pagination serveur + filtres + Angular + thème) ≤ **85 kB gz** ;
- tout, sauf graphiques, ≤ **150 kB gz** (environ 45 % de ce que la note Sehhaty mesure pour ag-Grid, ≈ 330 kB gz) ;
- 100 000 lignes × 30 colonnes : premier rendu ≤ **120 ms**, défilement ≥ **58 fps** médian, tri numérique ≤ **40 ms**, tri texte (Collator) ≤ **250 ms**, filtre texte ≤ **35 ms**, surcoût mémoire ≤ **25 Mo**.

À valider avant la Phase 1 : ces chiffres deviennent des critères de sortie de phase.

### K.9 Nommage
- **Recommandation** : produit `DzGrid`, scope npm `@dzgrid` (`core`, `dom`, `theme`, `angular`, `conformance`).
- **CSS** : le **thème partage les neuf couleurs `--tz-*`** de tzslot et DzCalendar (une palette posée une fois habille les trois). Ce qui est propre à la grille vit sous **`--dzg-*`** et les classes sous **`dzg-*`**. Raison : DzCalendar occupe déjà `--dz-*` et `.dz-cal` avec des noms qui entreraient en collision (`--dz-radius`, `--dz-gutter-width`). Les tons d'état réutilisent en lecture seule `--dz-tone-*` de DzCalendar, avec repli.
- **Dépôt** : `/Users/nadou/Dev/dzgrid`, **port du playground 4700**.
- **À vérifier** : disponibilité du scope `@dzgrid` sur npm **[À VÉRIFIER]**.

### K.10 Zéro dépendance d'exécution
Aucune dépendance dans `core`, `dom`, `theme`. Pas de RxJS (le serveur est une `Promise`, le wrapper Angular fournit `fromObservable`). Le seul extra optionnel est `@tzslot/dom` pour le sélecteur de date (K.2). Recommandation : oui.

### K.11 Export Excel
- **Recommandation** : écrire nous-mêmes un writer XLSX minimal (zip + `sheet1.xml` + chaînes partagées), avec `CompressionStream('deflate-raw')` quand il existe, sinon stockage sans compression. Support du sens de lecture droite-à-gauche (`rightToLeft="1"` sur la feuille). Pas de dépendance à SheetJS. À livrer en Phase 8.
- **Risque** : fidélité Excel (formats de nombre et de date, styles). Spike S8.

### K.12 Compatibilité de migration depuis ag-Grid
Un traducteur d'options (`@dzgrid/compat-aggrid`) ne lirait que les **noms publics** d'options documentés. Il est hors v1 : seul Sehhaty compte, et Sehhaty n'a jamais utilisé ag-Grid en production (note de cadrage). À rouvrir si d'autres équipes s'intéressent au produit.

### K.13 Graphiques intégrés
**Hors v1.** Le cœur livre seulement `rangeAsSeries(range)` (une plage de cellules devient des séries nommées) pour qu'un hôte branche sa bibliothèque de graphiques. Un module de rendu SVG minimal pourrait venir après la Phase 9, si le besoin se confirme.

### K.14 Comportement des lignes après une édition
Après la validation d'une cellule triée ou filtrée, la ligne **ne bouge pas** tant qu'aucun tri ou filtre n'est relancé (`reapplyAfterEdit: false` par défaut). Sans cela, l'édition en masse fait sauter la ligne sous le curseur. Recommandation : oui, avec un indicateur « l'ordre n'est plus à jour » discret et un geste pour réappliquer.

---

## 2. Inventaire des fonctionnalités

Légende : **C** = Community, **E** = Enterprise (niveaux d'après la liste publique d'ag-Grid **[À VÉRIFIER]**). **Phase** = phase DzGrid (§6). **ngx** = module réutilisable de ngx-sheetgrid (code pur, sans ag-Grid) : voir §3.0 pour ce qu'il faut y changer. « comportement seul » = ngx-sheetgrid a la fonction, mais enveloppée dans ag-Grid : on ne reprend que la fiche de comportement, pas le code.

### 2.1 Colonnes

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Largeurs, min, max, flex | C | 2 | — | `ColumnModel` pur (§3.3) |
| Redimensionnement à la souris | C | 2 | — | Pointer Events, poignée au bord de **fin** logique |
| Redimensionnement au clavier | C | 5 | — | Mode « redimensionner » entré par le menu colonne (§3.8) |
| Déplacement des colonnes (glisser) | C | 5 | — | Alternative clavier `Alt+Maj+flèche` (WCAG 2.5.7) |
| Épinglage début / fin | C | 2 | — | `start`/`end`, **jamais** `left`/`right` |
| Groupes d'en-têtes (multi-niveaux, repliables) | C | 5 | `flattenColumns` (concept) | `aria-colspan` |
| Visibilité des colonnes | C | 2 | — | Panneau de colonnes en Phase 5 |
| Auto-taille (contenu, ajustement à la largeur) | C | 5 | — | Mesure en phase `read`, échantillon déterministe |
| Types de colonne et défauts (`defaultColDef`, `columnTypes`) | C | 1 | `ColumnConfigBase` (forme) | |
| `valueGetter`, `valueFormatter`, `valueParser`, `valueSetter` | C | 1 | `cell-value.ts` | Codecs §3.4 |
| Types de données (`text`, `number`, `day`, `instant`, `boolean`, `enum`) | C | 1 | `cell-value.ts`, `date-value.ts` (sémantique) | Jour ≠ instant |
| Colonne de sélection (cases à cocher) | C | 2 | — | Colonne pseudo, épinglée début |
| Colonne de numéros de ligne | C | 5 | — | |
| Colonnes calculées / colSpan | C | 5 | `colSpan` (forme) | |
| Tooltips d'en-tête et de cellule | C | 2 | — | Accessibles au clavier |
| État de colonnes sauvegardé / restauré | C | 5 | — | `GridState` versionné (§3.14) |
| Rendus de cellule (texte, statut, barre, note, étiquettes, avatar, booléen, tendance, actions) | C | 2 à 5 | `renderers/*` (comportement seul) | Réécrits en DOM pur, tons par classes |

### 2.2 Lignes et modèles de lignes

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Modèle client (mémoire) | C | 1 | — | |
| Pagination serveur (page, taille, total inconnu) | C | 3 | `ServerRequest/Response` (concept) | Premier besoin Sehhaty |
| Défilement infini (blocs) | C | 7 | — | |
| Modèle côté serveur (groupes paresseux) | E | 7 | — | |
| Modèle viewport | E | hors v1 | — | K.5 |
| Transactions (ajout, mise à jour, suppression), mise à jour par différence d'identités | C | 1 | — | |
| Transactions asynchrones groupées | E | 7 | — | |
| Hauteur de ligne fixe / par fonction | C | 2 | — | |
| Hauteur automatique (contenu) | C | 5 | — | Spike S3 |
| Fusion de lignes (`rowSpan`) | C | 5 | `rowSpan` (forme) | |
| Lignes pleine largeur | C | 5 | — | Famille `full-width` dans `RowNode` |
| Lignes épinglées haut / bas | C | 5 | — | Aussi pour les totaux |
| Règles de style de ligne et de cellule | C | 2 | `rule-engine.ts` | **Classes**, plus de hex |
| Glisser-déposer de lignes (réordonner) | C | 8 | — | Alternative clavier |
| Surbrillance des changements de valeur (flash) | E | 8 | — | `prefers-reduced-motion` |
| Superpositions : chargement, aucune ligne, erreur | C | 2 | — | Messages i18n |
| Défilement programmatique (`ensureVisible`) | C | 2 | — | Par identité de ligne |
| Impression (mise en page sans virtualisation) | C | 10 | — | `preparePrint()` comme DzCalendar |

### 2.3 Tri, filtres, recherche rapide

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Tri simple, multi-colonnes (Maj+clic), cycle asc / desc / aucun | C | 1 (cœur), 2 (UI) | — | Départage par ordre source : stable |
| Comparateur par type, collation `Intl`, accents et chiffres arabes | C | 1 | — | Spike S5 |
| Filtre texte (contient, commence, finit, égal, différent, vide) | C | 1 (cœur), 3 (UI) | `FilterOperator` (types) | |
| Filtre nombre (comparaisons, entre, vide) | C | 1, 3 | idem | |
| Filtre jour et filtre instant (zone d'affichage) | C | 1, 3 | `date-value.ts` (sémantique), `date-filter.ts` (comportement seul) | Bornes **calculées une fois**, §3.5 |
| Filtre booléen | C | 1, 3 | — | |
| Deux conditions ET / OU par colonne | C | 3 | — | `combined` |
| Filtre à valeurs (set), recherche dans la liste, effectifs | E | 3 | `set-filter.ts` (comportement seul) | Liste virtualisée au-delà de 2 000 valeurs |
| Filtre multiple (plusieurs types dans une colonne) | E | 8 | — | |
| Filtres flottants (rangée sous l'en-tête) | C | 3 | `inline-filter-header.ts` (comportement seul) | Propriétaire `filter-input` pour le clavier |
| Filtre externe (fonction hôte + version) | C | 3 | — | Version explicite : pas d'état caché |
| Recherche rapide (plusieurs mots, ET) | C | 3 | — | Insensible aux accents, repli des signes diacritiques arabes |
| Filtre avancé (arbre ET/OU entre colonnes, éditeur) | E | 8 | — | |
| Modèle de filtre sérialisable, API get/set | C | 3 | — | Sert aussi la requête serveur |
| Filtre côté serveur (mêmes modèles, bornes résolues) | C | 3 | `ServerRequest` | |

### 2.4 Sélection

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Sélection de ligne simple / multiple, cases, Maj et Ctrl | C | 2 | — | Par **identité**, jamais par indice |
| Case d'en-tête à trois états ; « tout » = filtré / page / tout le serveur | C | 2, 3 | — | Modèle par exclusion pour le serveur |
| Sélection survivant au tri, au filtre, au rafraîchissement | C | 2 | — | |
| Sélection de plage de cellules | E | 4 | `cell-range.ts` | Coins par `RowKey`, pas par indice |
| Navigation clavier de plage (Maj+flèches, Ctrl+A) | E | 4 | — | |
| Sélection de groupe, de feuilles d'un groupe | E | 6 | — | |

### 2.5 Édition, plages, presse-papiers

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Éditeurs : texte, nombre, jour, date-heure, case, liste | C | 4 | `cell-value.ts` | Sélecteur de jour via l'adaptateur (K.2) |
| Éditeur riche (liste avec recherche) | E | 4 | — | |
| Édition en ligne, de ligne entière, en fenêtre | C | 4 | — | |
| Validation avec message accessible (`aria-invalid`, `aria-describedby`) | C | 4 | — | Codes d'erreur, phrases dans les messages |
| Enregistrement : statuts, générations, annulation, une requête par geste | — | 4 | `cell-edits.ts` | Cœur du module, avec file par cellule |
| Annuler / rétablir | C | 4 | — | Pile d'inverses (§3.10) |
| Coller depuis un tableur (TSV, guillemets) | E | 4 | `cell-range.ts` (`planPaste`) | Vraie citation TSV |
| Copier (cellules, lignes, avec en-têtes) | E | 4 | `rangeToTsv` | |
| Couper, supprimer le contenu | E | 4 | — | |
| Poignée de remplissage (copie, série) | E | 4 | `fill-handle.ts` | |
| Édition en masse (valeur appliquée à la sélection) | — | 4 | `fill-handle`, `cell-edits` | Pharmacie |
| Tabulation d'une cellule à l'autre pendant l'édition | C | 4 | — | `tabNavigation: 'cell' | 'grid'` |

### 2.6 Regroupement, agrégation, pivot, arbre, master/detail

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Regroupement de lignes par colonnes (multi-niveaux) | E | 6 | — | Identité par chemin (§3.2) |
| Agrégations (somme, min, max, moyenne, nombre, premier, dernier, personnalisée) | E | 6 | — | Moyenne = paire (somme, nombre) pour être fusionnable |
| Lignes de pied de groupe et total général | E | 6 | — | |
| Zone de glisser-déposer des colonnes de groupe | E | 6 | — | |
| Pivot | E | 9 | — | Colonnes secondaires générées |
| Données arborescentes (chemin ou parent) | E | 6 | `TreeConfig` (concept), `tree-cell-renderer` (comportement seul) | `role="treegrid"` |
| Master/detail (grille imbriquée) | E | 6 | `MasterDetailConfig` (concept) | Lignes de détail = nœuds `kind:'detail'` |
| État du détail conservé quand on s'éloigne | E | 6 | — | LRU d'états par `RowKey` maître |

### 2.7 Export

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Export CSV (RFC 4180, BOM, séparateur de la locale) | C | 3 | — | Garde-fou contre l'injection de formule (§4) |
| Export « tout » côté serveur (rappel hôte) | — | 3 | — | 10⁷ lignes : jamais côté client |
| Export Excel (XLSX) | E | 8 | — | K.11 |
| Export de la sélection / de la plage | C/E | 3, 4 | — | |
| Tableau en HTML / impression | C | 10 | — | |

### 2.8 Menus, panneaux, barre d'état, graphiques

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Menu de colonne (épingler, auto-taille, regrouper, masquer, réinitialiser) | E | 5 | — | Ouvert par `Alt+Bas` |
| Menu contextuel de cellule (copier, coller, exporter…) | E | 8 | — | Touche Menu et `Maj+F10` |
| Panneau latéral : colonnes, filtres | E | 5 | — | |
| Barre d'état (totaux, sélection, agrégat de plage) | E | 8 | — | |
| Info-bulles | C | 2 | — | |
| Graphiques intégrés | E | hors v1 | — | K.13 |
| Recherche dans la grille (trouver) | E | 8 | — | |

### 2.9 i18n, RTL, accessibilité, thèmes

| Fonction | Niv. | Phase | ngx | Note |
|---|---|---|---|---|
| Messages traduits (`en`, `fr`, `ar`) | C | 2 | `GRID_LABELS_*` (plan 0.2.0, concept) | Typés, complétude testée |
| Pluriels (6 formes en arabe), `Intl.PluralRules` | — | 2 | — | |
| Nombres, jours, instants par locale ; chiffres latins ou arabes au choix ; **grégorien forcé** | — | 1 | — | |
| RTL natif (direction logique partout) | C | 2 | — | Aucun `left`/`right` |
| Direction à l'exécution sans recréer la grille | — | 2 | — | Meilleur que le plan 0.2.0 (D2) |
| ARIA `grid` / `treegrid`, clavier, focus, région live | C | 2 | — | |
| Thème par variables, mode sombre, six palettes, densité | C | 2 | — | `--tz-*` + `--dzg-*` |
| Contraste 4,5:1 vérifié par un script | — | 2 | — | |
| `forced-colors`, `prefers-reduced-motion` | — | 2 | — | |

### 2.10 Couverture des écrans de Sehhaty

| Écran | Volume | Moteur | Fonctions | Phase où il devient possible |
|---|---|---|---|---|
| `admin/audit-logs` | 10⁵ à 10⁷ | paginé serveur | 7 colonnes, 7 filtres serveur, tri, export, RTL, thème | **3** |
| `admin/admin-pharmacies` | ~11 000 | client | tri, filtre, set filter, recherche rapide | **3** (client dès 2) |
| `pharma/stock` | 200 à 3 000 | client | édition en masse, remplissage, collage | **4** |
| `pharma/history`, `labo/history` | 15 k à 150 k / an | paginé serveur ou client | filtres, regroupement éventuel | 3, puis 6 |
| `admin/admin-lab-facilities` | quelques centaines + sous-liste | client | master/detail | **6** |
| `admin/admin-doctors` | dizaines de milliers | paginé serveur | filtres, set filter | 3 |
| `dmp-doctor-patients` | 200 à 3 000 | client | **en dernier** (données patient) | 4 minimum |

---

## 3. Architecture

### 3.0 Ce que DzGrid reprend de ngx-sheetgrid, module par module

Chaque module est du code à nous, sans ag-Grid. Le tableau dit ce qu'il faut **changer** pour tenir les invariants du §4. Les specs de ngx-sheetgrid (non lues) servent de réserve de cas : les cas purs sont portés en JSON dans `@dzgrid/conformance`.

| Module ngx-sheetgrid | Pur ? (lu) | Reprise dans DzGrid | À changer |
|---|---|---|---|
| `cell-edits.ts` (345 l.) | Oui, aucune importation | `core/edit/cell-edits.ts` | (1) clé composite `rowId + ' ' + field` : remplacée par un `Map<RowKey, Map<ColumnId, PendingCell>>` imbriqué, où l'ambiguïté de clé est **impossible** (le commentaire d'origine suppose qu'un caractère ne figure jamais dans un nom : hypothèse retirée, caractère exact **[À VÉRIFIER]**) ; (2) `rowId: string` devient `RowKey` ; (3) `applyCellEdits` recopie toutes les lignes à chaque changement : remplacé par une lecture de surcouche ; (4) ajout d'une file par cellule et d'un compteur de génération global ; (5) ajout de `reconcileEdits` quand les données source sont rafraîchies (revue 0.2.0 : « saved edits never cleared on refresh ») ; (6) `previousValue` documenté comme information, jamais comme cible de rollback (la cible est `lastSaved`, comme aujourd'hui). La logique `stageEdits`, `settleSaved`, `settleFailed`, `rollbackEdits`, `ticketsFor` est conservée telle quelle : elle encode déjà les correctifs de a6c97f5 (générations jamais réutilisées, succès ancien après échec récent). |
| `cell-range.ts` | Oui (importe `cell-edits`, `fill-handle`, `cell-value`) | `core/range/range.ts` | (1) `toClipboardText` utilise `value instanceof Date` / `toISOString()` : remplacé par le codec de colonne (aucun `Date` dans le cœur) ; (2) `CellRef.rowIndex: number` est **l'indice affiché non typé** à l'origine du bug 1 : remplacé par `rowKey: RowKey` et résolu en bornes par `DisplayedRows.indexOf` à l'usage ; (3) `rangeToTsv` n'échappe pas tabulations, retours à la ligne ni guillemets : vraie citation TSV ; (4) `isInjectedRow` supprimé (les lignes de détail ne sont plus des lignes de données, §3.2) ; (5) `planPaste` conservé (règles : hors grille ignoré, colonnes non éditables ignorées, valeur non lisible ignorée, lignes sans donnée enjambées). |
| `fill-handle.ts` | Importe seulement `cell-edits` (type) | `core/range/fill.ts` | Relire entièrement en Phase 4 ; vérifier l'usage de `Date` dans `nextInSeries` **[À VÉRIFIER]** ; les séries de jours passent par `Day` ; `FillColumn.renderer` remplacé par `ColumnDef.type`. |
| `cell-value.ts` | Oui | `core/value/codec.ts` | Étendu aux types `day`, `instant`, `enum` ; lecture selon la locale (chiffres arabes-indic, séparateur décimal) ; oui/non en arabe (revue : « paste parser lacks Arabic yes/no ») ; `REJECTED` conservé. |
| `rule-engine.ts` | Logique pure, **mais** `STYLE_MAP` porte des couleurs hexadécimales et des `rgba` | `core/rules/rules.ts` | Sort des **noms de classe** (`dzg-rule--danger`), jamais de couleurs ; `textColor` / `bgColor` libres refusés par défaut (option `rawColors` explicite, comme DzCalendar). Les couleurs vivent dans le thème, vérifiées par le script de contraste. |
| `date-value.ts` | Utilise `Date` partout | **Non repris tel quel.** Sa **sémantique** (une date seule est un jour local, pas minuit UTC ; une date avec heure reste l'instant) est reprise dans `core/value/day.ts` et `instant.ts` sans `Date`. Ses cas de test deviennent des cas de conformité. | — |
| `displayed-rows.ts` | Oui (19 lignes) | Remplacé : le concept devient le type `DisplayedRows` et les indices typés (§3.2). | Le correctif n'est plus une fonction qu'on peut oublier d'appeler : il n'existe plus d'autre chemin. |
| `event-target.ts` | Logique pure, sélecteur ag-Grid (`.ag-cell-inline-editing`) | `dom/src/keys/owner.ts` | Sélecteur remplacé par `[data-dzg-editor]` ; devient le classement du **propriétaire de la touche** (§3.8). |
| `filter-label.resolver.ts` | Dépend d'Angular et de `GRID_I18N` | Non repris | La résolution `label` / `labelKey` passe dans `core/filter/option-label.ts` (fonction pure). |
| `grid.types.ts` | **Non** : importe `ag-grid-angular` (type), `@angular/core` (`Type`), `rxjs` (`Observable`) | Non repris | Les types `FilterOperator`, `FilterValue`, `FilterOption`, `ServerRequest/Response`, `RuleStyle`, `StatusVariant` sont **ré-écrits** (sans ces importations) dans `core`. La discrimination `renderer` → `rendererConfig` est reprise comme idée. |
| `public-api.spec.ts` (idée) | — | Test de surface publique | Échoue si l'API exportée s'élargit par accident. |
| `data-grid.ts`, `grid-column.mapper.ts`, interfaces ag-Grid des renderers, `renderers/*`, `grid-icons.ts` | Parlent à ag-Grid | **Exclus** (CLEANROOM) | Les rendus sont réécrits en DOM pur ; seul le comportement observable (fiches) sert. |

### 3.1 Couches et paquets

```
                    ┌───────────────────────────────────────────────────────────┐
  Applications      │ Angular 19–21 (@dzgrid/angular)   JS pur   (plus tard :   │
                    │                                            React, Vue, WC)│
                    └──────────────┬────────────────────────────────────────────┘
                                   │ wrappers fins : signals, model(), untracked
  Rendu            ┌───────────────▼────────────────────────────────────────┐   ┌──────────────┐
  (DOM clair)      │ @dzgrid/dom                                            │◄──┤ @dzgrid/theme│
                   │  createGrid · viewport 2D · en-têtes · épinglage ·     │   │ (CSS vars,   │
                   │  éditeurs · filtres UI · menus · clavier · focus ·     │   │  --tz-*,     │
                   │  presse-papiers · a11y · messages en/fr/ar             │   │  --dzg-*)    │
                   └───────────────┬────────────────────────────────────────┘   └──────────────┘
                                   │
  Modèle et moteurs ▼   (aucun DOM, aucun framework, aucun Date, aucune dépendance)
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │ @dzgrid/core                                                                     │
   │  identités et indices typés · RowStore + transactions · RowModel (client, paged, │
   │  infinite, serverSide) · colonnes · codecs (Day / Instant) · tri · filtres ·     │
   │  sélection · plages · édition + sauvegardes · clipboard · export CSV ·           │
   │  regroupement / agrégation / arbre · layout (PrefixSums, fenêtre 2D) ·           │
   │  i18n (formats, pluriels) · intentions clavier · état sérialisable               │
   └──────────────────────────────────────────────────────────────────────────────────┘
   Transverse : @dzgrid/conformance (cas JSON + schémas + runner), lu par TS aujourd'hui.
```

| Paquet | Contenu | Licence | Phase |
|---|---|---|---|
| `@dzgrid/core` | Tout le modèle et les moteurs purs. Base : client + tri + filtres + sélection + colonnes + édition + CSV. Sous-chemins : `/grouping`, `/tree`, `/pivot`, `/server`, `/range`, `/advanced-filter`, `/xlsx` | MIT | 0 à 9 |
| `@dzgrid/dom` | `createGrid`, rendu, interactions, a11y, messages. Sous-chemins : `/editors`, `/filters`, `/range`, `/menus`, `/sidebar`, `/statusbar`, `/detail`, `/locales/{en,fr,ar}` | MIT | 2 à 9 |
| `@dzgrid/theme` | `dzgrid.scss` → `dzgrid.css`, `contrast.css`, variantes Tailwind 3 et 4 | MIT | 2 |
| `@dzgrid/angular` | `<dz-grid>`, contrôleur, gabarits, fournisseurs | MIT | 3 |
| `@dzgrid/conformance` | `cases/**/*.json`, schémas, runner | MIT | 1 |

Les paquets Pro, `compat-aggrid` et les wrappers React / Vue / Web Component sont reportés (K.1, K.12). Un wrapper de plus doit consister en un fichier mince au-dessus de `@dzgrid/dom`, comme `@dzgrid/angular`.

### 3.2 Identités, indices typés, noeuds de ligne

**Règle d'or** : aucune API publique ne prend un `number` là où elle attend un indice. Les identités de ligne sont des chaînes typées ; les indices sont des marques de type qui ne se fabriquent qu'à un seul endroit.

```ts
declare const rowKeyBrand: unique symbol;
export type RowKey = string & { readonly [rowKeyBrand]: true };
export type RowIdInput = string | number;            // ce que renvoie getRowId

// Seuls producteurs de RowKey. Chaque famille a son préfixe et un encodage à longueur :
// 'd:<len>:<id>', 'g:<len>:<seg>…', 'x:<clé du maître>' (détail), 'p:t|b:<i>' (épinglée).
// Un id utilisateur ne peut donc jamais être pris pour une clé de groupe ou de détail.
export function dataKey(id: RowIdInput): RowKey | null;      // null pour '', NaN, objet, null
export function groupKey(path: readonly string[]): RowKey;
export function detailKey(master: RowKey): RowKey;

declare const displayIndexBrand: unique symbol;
export type DisplayIndex = number & { readonly [displayIndexBrand]: true };
// Il n'existe PAS de SourceIndex public : l'ordre source reste interne au RowStore.

export type RowKind = 'data' | 'group' | 'footer' | 'detail' | 'full-width' | 'loading';
interface RowNodeBase { readonly key: RowKey; readonly kind: RowKind; readonly level: number }
export interface DataNode<T> extends RowNodeBase { readonly kind: 'data'; readonly id: RowIdInput; readonly data: Readonly<T> }
export interface GroupNode extends RowNodeBase {
  readonly kind: 'group'; readonly field: string; readonly value: unknown;
  readonly childCount: number; readonly expanded: boolean; readonly aggregates: Readonly<Record<string, unknown>>;
}
export interface DetailNode extends RowNodeBase { readonly kind: 'detail'; readonly master: RowKey }
export interface LoadingNode extends RowNodeBase { readonly kind: 'loading' }
export type RowNode<T> = DataNode<T> | GroupNode | DetailNode | LoadingNode /* | FooterNode | FullWidthNode */;

/** Vue immuable d'un RowModel à une version donnée. Un DisplayIndex n'a de sens que pour elle. */
export interface DisplayedRows<T> {
  readonly version: number;
  readonly count: number;
  nodeAt(i: DisplayIndex): RowNode<T>;
  indexOf(key: RowKey): DisplayIndex | -1;
  /** Seule porte d'entrée numérique : vérifie 0 ≤ n < count. */
  index(n: number): DisplayIndex | null;
  /** Prochaine ligne de données à partir de i (les groupes, détails, chargements sont enjambés). */
  nextData(i: DisplayIndex, delta: 1 | -1): DataNode<T> | null;
}
```

Conséquences par construction :
- les opérations de **cellule** (édition, collage, remplissage) n'acceptent qu'un `DataNode<T>`. Écrire dans une ligne de groupe ou de détail ne compile pas ;
- le focus, la sélection, la plage et l'édition retiennent des `RowKey`, jamais des indices (§4) ;
- les événements publics portent un `RowNode`, pas un nombre.

### 3.3 Colonnes

```ts
export type ColumnType = 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'enum' | 'custom';
export type Side = 'start' | 'end';                      // jamais 'left' | 'right'

export interface ColumnDef<T, V = unknown> {
  readonly id: string;                                   // OBLIGATOIRE et stable : clé de l'état
  readonly field?: string;                               // chemin 'a.b.c'
  readonly value?: (row: Readonly<T>) => V;
  readonly header?: string | (() => string);             // déjà traduit par l'hôte
  readonly headerTooltip?: string | (() => string);
  readonly type?: ColumnType;
  readonly codec?: ValueCodec<V>;                        // remplace le codec du type
  readonly enumOptions?: readonly EnumOption[];
  readonly width?: number; readonly minWidth?: number; readonly maxWidth?: number; readonly flex?: number;
  readonly resizable?: boolean; readonly movable?: boolean; readonly sortable?: boolean;
  readonly pinned?: Side | null; readonly hidden?: boolean; readonly align?: 'start' | 'center' | 'end';
  readonly filter?: false | FilterSpec; readonly floatingFilter?: boolean;
  readonly editable?: boolean | ((ctx: EditCtx<T>) => boolean);
  readonly editor?: EditorSpec<V>; readonly validate?: Validator<V>;
  readonly cell?: CellSpec<T, V>;                        // rendu ; par défaut texte via le codec
  readonly rules?: readonly CellRule<T>[];
  readonly rowSpan?: (ctx: SpanCtx<T>) => number; readonly colSpan?: (ctx: SpanCtx<T>) => number;
  readonly wrap?: boolean; readonly autoHeight?: boolean;
  readonly groupable?: boolean; readonly aggFunc?: AggFuncName | AggFn<V>;
  readonly csv?: ExportSpec<V>;
}
export interface ColumnGroupDef<T> { readonly id: string; readonly header: string | (() => string);
  readonly children: readonly ColumnOrGroup<T>[]; readonly openByDefault?: boolean }
export type ColumnOrGroup<T> = ColumnDef<T, any> | ColumnGroupDef<T>;

/** État d'une colonne : sérialisable, source = utilisateur ou hôte. */
export interface ColumnState {
  readonly id: string; readonly width?: number; readonly hidden?: boolean; readonly pinned?: Side | null;
  readonly order?: number; readonly sort?: 'asc' | 'desc' | null; readonly sortIndex?: number;
  readonly groupIndex?: number | null; readonly aggFunc?: string | null;
}
export interface ColumnLayout {
  readonly start: ColumnSlice; readonly center: ColumnSlice; readonly end: ColumnSlice;
  readonly headerRows: readonly (readonly HeaderCell[])[];   // groupes sur plusieurs rangées, avec colSpan
  readonly totalWidth: number;
}
export interface ColumnSlice { readonly columns: readonly ColumnDef<any>[]; readonly widths: PrefixSums; readonly width: number }
export interface ColumnModel {
  readonly layout: ColumnLayout;
  state(): readonly ColumnState[];
  apply(patch: readonly ColumnState[], source: 'user' | 'host' | 'api'): ColumnChange;
  setDefs(defs: readonly ColumnOrGroup<any>[]): ColumnChange;     // conserve l'état utilisateur par id
  autoSizePlan(ids: readonly string[], o?: { sample?: number; skipHeader?: boolean }): AutoSizePlan;
}
```

- Toute notion de côté est **logique** : l'ordre des colonnes est « du début vers la fin » ; en RTL, le début est à droite. Aucun `left`/`right` hors du seul module `dir` (§3.9).
- `setDefs` : quand l'hôte renvoie un nouveau tableau de colonnes (Angular recalcule un `computed`), l'état posé par l'utilisateur (largeur, ordre, épinglage, tri) est **conservé par `id`** ; seuls les défauts de la définition changent. Une propriété verrouillée (`lockPinned`) l'emporte.
- Auto-taille : le cœur choisit un **échantillon déterministe** de lignes (premières, dernières, extrêmes de longueur) ; le DOM mesure en une seule phase `read` (§3.7). Le cœur fusionne le résultat avec `min`/`max`.

### 3.4 Valeurs : codecs, jour et instant

```ts
export const REJECTED: unique symbol;

export interface LocaleCtx {
  readonly locale: string;                      // 'ar-DZ', 'fr-FR'
  readonly numerals: 'latn' | 'locale';         // défaut 'latn' : chiffres latins, sûrs pour la copie
  readonly timeZone: string;                    // IANA ; pour 'instant' seulement
  readonly calendar: 'gregory';                 // forcé : ar-SA ouvrirait sinon l'Umm al-Qura
}
export interface ValueCodec<V> {
  readonly kind: ColumnType;
  parse(text: string, ctx: LocaleCtx): V | typeof REJECTED;       // saisie, collage
  format(v: V, ctx: LocaleCtx): string;                           // affichage (Intl, caches)
  compare(a: V, b: V, ctx: LocaleCtx): number;
  /** Clé de tri précalculée quand elle existe : nombre ou chaîne. */
  sortKey?(v: V, ctx: LocaleCtx): number | string;
  isEmpty(v: unknown): boolean;
  equals(a: V, b: V): boolean;
  /** Texte exporté (CSV, TSV) : valeur brute et stable, pas l'affichage. */
  toExport(v: V): string;
}
export const textCodec: ValueCodec<string>;  export const numberCodec: ValueCodec<number>;
export const booleanCodec: ValueCodec<boolean>;
export const dayCodec: ValueCodec<Day>;      export const instantCodec: ValueCodec<InstantMs>;
export function enumCodec(options: readonly EnumOption[]): ValueCodec<string>;
```

**Jour contre instant, par le type** :

```ts
declare const dayBrand: unique symbol;     export type Day = string & { readonly [dayBrand]: true };      // 'YYYY-MM-DD'
declare const instBrand: unique symbol;    export type InstantMs = number & { readonly [instBrand]: true };
export function parseDay(s: unknown): Day | null;                 // refuse '2026-02-31'
export function dayToEpochDay(d: Day): number;                    // arithmétique civile, sans Date
export function epochDayToDay(n: number): Day;
export function parseInstant(v: unknown, o?: { assumeZone?: string }): InstantMs | null;   // offset obligatoire
export function instantToDayIn(i: InstantMs, zone: string): Day;
/** Début inclusif et fin exclusive du jour `day` dans `zone`, en instants. */
export function zoneDayBounds(day: Day, zone: string): { from: InstantMs; to: InstantMs };
```
`zoneDayBounds` : à partir du jour, on teste les instants candidats `jourUTC − décalage` pour chaque décalage observé aux deux bouts d'une fenêtre de ±26 h (au plus deux ou trois valeurs distinctes), on retient le plus petit dont le jour local égale `day`. Cela couvre le jour de 23 h, de 25 h, de 23 h 30, et le jour **sans minuit** (São Paulo 2018-11-04, Havane 2023-03-12 : le jour commence à 01:00). Fait sur `Intl.DateTimeFormat#formatToParts(epochMs)` avec `timeZone`, mis en cache par zone. **[À VÉRIFIER]** : identique sous Chrome, Safari et Firefox (spike S5).

Formatage : `Intl.NumberFormat` et `Intl.DateTimeFormat` créés une fois par `(locale, options)` (cache `Map`), `calendar: 'gregory'` toujours posé, `numberingSystem` selon `numerals`. **Jamais** de `Date`.

### 3.5 Tri, filtres, recherche rapide

```ts
export interface SortItem { readonly column: string; readonly dir: 'asc' | 'desc'; readonly nulls?: 'first' | 'last' }
export function compileSort<T>(items: readonly SortItem[], cols: ColumnLookup<T>, ctx: LocaleCtx, read: ValueReader<T>):
  (a: DataNode<T>, b: DataNode<T>) => number;      // départage : ordre source (stable)
export function sortIndices<T>(nodes: readonly DataNode<T>[], cmp: ReturnType<typeof compileSort<T>>,
  o?: { keys?: ReadonlyMap<string, ArrayLike<number | string>> }): Uint32Array;   // tri d'indices, clés précalculées
```
- Le tri trie un **tableau d'indices** (`Uint32Array`) et non les noeuds : pas de copie d'objets.
- Colonnes numériques et jours : clés dans un `Float64Array`, comparaison directe. Colonnes texte : `Intl.Collator(locale, {numeric, sensitivity})` en cache ; le budget (K.8) admet 250 ms pour 100 000 lignes, car le comparateur est le coût dominant **[À VÉRIFIER spike S5]**.
- `ValueReader` lit la **surcouche d'édition** avant la valeur source : l'ordre affiché correspond à ce que l'utilisateur voit (mais cf. K.14 : un tri n'est pas réappliqué à chaque édition).

**Modèle de filtre : JSON pur, identique client et serveur.**

```ts
export type FilterModel = Readonly<Record<string, ColumnFilter>>;    // clé : id de colonne
export type TextOp = 'contains' | 'notContains' | 'equals' | 'notEqual' | 'startsWith' | 'endsWith' | 'blank' | 'notBlank';
export type NumOp = 'equals' | 'notEqual' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'blank' | 'notBlank';
export type ColumnFilter =
  | { type: 'text';    op: TextOp; value?: string; caseSensitive?: boolean }
  | { type: 'number';  op: NumOp;  value?: number; valueTo?: number }
  | { type: 'day';     op: NumOp;  value?: Day;    valueTo?: Day }                       // jours calendaires, bornes incluses
  | { type: 'instant'; op: 'onDay' | 'betweenDays' | 'before' | 'after' | 'between' | 'blank' | 'notBlank';
      day?: Day; dayTo?: Day; at?: string; atTo?: string }                                 // jours (zone d'affichage) OU instants exacts
  | { type: 'boolean'; value: boolean | null }
  | { type: 'set';     include?: readonly string[]; exclude?: readonly string[]; blanks?: 'include' | 'exclude' }
  | { type: 'combined'; join: 'and' | 'or'; conditions: readonly ColumnFilter[] };
export interface AdvancedFilter { readonly join: 'and' | 'or'; readonly items: readonly (AdvancedFilter | { column: string; filter: ColumnFilter })[] }
export function compileFilter<T>(model: FilterModel, adv: AdvancedFilter | null, quick: string, cols: ColumnLookup<T>,
  ctx: LocaleCtx, read: ValueReader<T>, external?: (n: DataNode<T>) => boolean): (n: DataNode<T>) => boolean;
export function setValues<T>(rows: Iterable<DataNode<T>>, col: ColumnDef<T>, model: FilterModel, ctx: LocaleCtx): SetValueIndex;  // « ignore son propre filtre »
```

**Pour le serveur**, la requête ne transporte pas seulement le modèle : un filtre d'instant porte aussi **les bornes résolues**, calculées une seule fois côté client par `zoneDayBounds` :

```json
{ "type": "instant", "op": "betweenDays", "day": "2026-03-05", "dayTo": "2026-03-06",
  "resolved": { "from": "2026-03-04T23:00:00Z", "to": "2026-03-06T23:00:00Z" }, "zone": "Africa/Algiers" }
```
Intervalle **semi-ouvert** `[from, to)` en UTC : le serveur n'a pas à connaître de fuseau et ne peut pas se tromper de jour. Un filtre `day` voyage en jours inclusifs `{from, to}`, sans fuseau.

**Recherche rapide** : le texte est découpé en mots (ET) ; chaque mot doit se trouver dans une colonne visible. Comparaison insensible à la casse, aux accents (`NFD`) et aux signes diacritiques arabes (voyelles brèves, tatwil), avec unification des chiffres arabes-indic et latins. Les colonnes `text` et `enum` sont lues brutes ; les colonnes numériques ou date sont comparées sur leur forme **formatée** seulement si le mot contient un chiffre (sinon trop coûteux). **[À VÉRIFIER]** la cible de 150 ms pour 100 000 lignes (spike S5).

### 3.6 Modèles de lignes

```ts
export interface Query {
  readonly sort: readonly SortItem[]; readonly filter: FilterModel; readonly advanced: AdvancedFilter | null;
  readonly quick: string; readonly group: readonly string[]; readonly external: number;   // version du filtre externe
  readonly key: string;                      // empreinte canonique (clés triées) : égalité de requête
}
export type ModelStatus =
  | { phase: 'idle' } | { phase: 'loading'; since: number }
  | { phase: 'error'; failure: FetchFailure };

export interface RowModel<T> {
  readonly kind: 'client' | 'paged' | 'infinite' | 'server-side';
  readonly displayed: DisplayedRows<T>;                       // courant, immuable
  readonly status: ModelStatus;
  setQuery(q: Query): void;                                   // recalcul ou nouvelle requête
  invalidate(o?: { keepScroll?: boolean }): void;
  rangeNeeded(first: DisplayIndex, last: DisplayIndex): void; // blocs à charger (infinite)
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}
export function clientRows<T>(o: { rows: readonly T[]; getRowId: (r: T) => RowIdInput }): ClientModel<T>;
export function pagedRows<T>(o: PagedOptions<T>): PagedModel<T>;          // @dzgrid/core/server
export function infiniteRows<T>(o: InfiniteOptions<T>): RowModel<T>;
export function serverSideRows<T>(o: ServerSideOptions<T>): RowModel<T>;
```

**Pipeline client** (chaque étage mémoïsé par `(version du magasin, tranche de requête)`) :

```
RowStore ─► filtre ─► [arbre | groupes] ─► tri (dans chaque niveau) ─► agrégation ─► aplatissement (état d'expansion) ─► DisplayedRows
```
Un tri ne refait pas le filtre ; un déploiement de groupe ne refait ni le tri ni le filtre. `DisplayedRows` ne se reconstruit que si l'aplatissement change.

**RowStore et transactions** :

```ts
export interface RowTransaction<T> {
  readonly add?: readonly T[]; readonly addAt?: number;
  readonly update?: readonly T[];                                  // remplacement de ligne entière, par identité
  readonly patch?: readonly { readonly id: RowIdInput; readonly set: Partial<T> }[];
  readonly remove?: readonly RowIdInput[];
}
export interface TransactionResult<T> {
  readonly version: number; readonly added: readonly DataNode<T>[]; readonly updated: readonly DataNode<T>[];
  readonly removed: readonly RowKey[]; readonly problems: readonly Problem[];
}
export interface RowStore<T> {
  readonly version: number; readonly size: number;
  get(key: RowKey): DataNode<T> | undefined;
  apply(tx: RowTransaction<T>): TransactionResult<T>;              // atomique : une transaction, une notification
  replaceAll(rows: Iterable<T>): TransactionResult<T>;             // différence d'identités ; objets inchangés gardés
}
```
Identité en double (`duplicate-row-id`) : la **première** ligne est gardée, les suivantes sont refusées avec un `Problem` ; rien n'est jeté en silence.

**Moteur paginé serveur**, le premier utile à Sehhaty :

```ts
export interface PageRequest {
  readonly page: number;                       // 0-based
  readonly pageSize: number;
  readonly sort: readonly SortItem[];
  readonly filter: FilterModel;                // avec bornes résolues (§3.5)
  readonly advanced: AdvancedFilter | null;
  readonly quick: string;
  readonly ticket: Ticket;                     // {seq, key}
  readonly signal: AbortSignalLike;
}
export interface PageResponse<T> {
  readonly rows: readonly T[];
  readonly total?: number;                     // absent si trop coûteux à compter
  readonly hasNext?: boolean;                  // requis si `total` est absent
}
export type PageFetch<T> = (req: PageRequest) => Promise<PageResponse<T>> | PageResponse<T>;
export interface PagedOptions<T> { readonly pageSize: number; readonly pageSizes?: readonly number[];
  readonly getRowId: (r: T) => RowIdInput; readonly fetch: PageFetch<T>; readonly debounceMs?: number }
export interface PagedModel<T> extends RowModel<T> {
  readonly page: number; readonly pageSize: number; readonly total: number | null; readonly hasNext: boolean;
  goTo(page: number): void; setPageSize(n: number): void;
}
```

**La porte d'ordre des réponses** (invariant 3 du §4) :

```ts
export interface Ticket { readonly seq: number; readonly key: string /* empreinte de Query + canal */ }
export interface RequestGate {
  /** Ouvre une requête : abandonne (AbortController) celles du même canal et incrémente seq. */
  begin(channel: string, key: string): { ticket: Ticket; signal: AbortSignalLike };
  /** Vrai ssi ce ticket est le dernier du canal ET que la requête courante a toujours cette clé. */
  accepts(t: Ticket): boolean;
  /** Une nouvelle requête (tri, filtre, recherche) change d'« époque » : tout ticket antérieur meurt. */
  newEpoch(): void;
}
```
Le modèle n'expose **aucune** méthode publique qui écrive des lignes venant du serveur : la seule voie est `settle(ticket, response)`, qui appelle `gate.accepts(ticket)` en premier. Une réponse refusée est jetée (et comptée dans les diagnostics), jamais appliquée.

Blocs (`infinite`) : `BlockRequest { startRow, endRow, sort, filter, quick, ticket, signal }` ; `BlockResponse { rows, lastRow?: number }` ; cache de blocs LRU à nombre maximal fixé ; canaux = un par bloc ; une nouvelle époque purge tous les blocs.

Modèle côté serveur : `GroupRequest { groupKeys: readonly string[]; groupBy: readonly string[]; values: readonly {col; agg}[]; startRow; endRow; … }`. Contrat : le serveur renvoie les agrégats ; le client ne les recalcule pas.

### 3.7 Virtualisation et mise en page (décision K.3)

**Maths du cœur** (`core/layout`, repris de DzCalendar) :

```ts
export class PrefixSums { constructor(sizes: ArrayLike<number>); readonly total: number;
  set(i: number, size: number): void; offsetOf(i: number): number; indexAt(offset: number): number }  // Fenwick O(log n)
export interface RowLayout { readonly count: number; readonly total: number;
  offsetOf(i: DisplayIndex): number; heightOf(i: DisplayIndex): number; indexAt(offset: number): DisplayIndex;
  setHeight(i: DisplayIndex, h: number): void }          // chemin O(1) si hauteur uniforme
export interface Window2D { readonly rows: { first: DisplayIndex; last: DisplayIndex };
  readonly cols: { first: number; last: number } }       // colonnes du segment central uniquement
export function visibleWindow(rows: RowLayout, centerCols: PrefixSums, scrollBlock: number, scrollInline: number,
  vw: number, vh: number, o: { overscanRows: number; overscanCols: number }): Window2D;

/** Hauteur logique > hauteur physique permise : mise à l'échelle du défilement. */
export interface ScrollMapper { readonly scaled: boolean; readonly physicalHeight: number;
  toLogical(physicalTop: number): number; toPhysical(logicalTop: number): number }
export function scrollMapper(logicalHeight: number, maxPhysical: number): ScrollMapper;
```
`maxPhysical` vaut 8 000 000 px par défaut (sous les plafonds connus) **[À VÉRIFIER, spike S1]**. Au-delà d'environ 250 000 lignes de 32 px, `scaled` devient vrai : la molette est rendue plus fine par interception (`wheel` + `scrollTop` fractionné). Pour Sehhaty, ce cas ne se produit pas : les journaux d'audit sont paginés.

**Structure du DOM : un seul conteneur de défilement.**

```
<div class="dzg" role="grid" aria-rowcount aria-colcount aria-multiselectable dir="…" data-dzg-ready>
  <div class="dzg-viewport" tabindex="-1">                      ← LE seul conteneur qui défile (deux axes)
    <div class="dzg-header" role="rowgroup">                    ← position: sticky; inset-block-start: 0
      <div role="row" aria-rowindex="1"> …en-têtes de groupes… </div>
      <div role="row" aria-rowindex="2"> …en-têtes de colonnes… </div>
      <div role="row" aria-rowindex="3"> …filtres flottants… </div>
    </div>
    <div class="dzg-pinned-top" role="rowgroup">…</div>         ← sticky sous l'en-tête
    <div class="dzg-body" role="rowgroup" style="block-size: <hauteur>px">
      <div class="dzg-row" role="row" aria-rowindex="…" aria-selected style="transform: translateY(<y>px)">
        <div class="dzg-seg dzg-seg--start">  cellules épinglées début  </div>   ← sticky inset-inline-start: 0
        <div class="dzg-seg dzg-seg--center" style="inline-size: <w>px"> cellules virtualisées </div>
        <div class="dzg-seg dzg-seg--end">    cellules épinglées fin    </div>   ← sticky inset-inline-end: 0
      </div>
    </div>
    <div class="dzg-pinned-bottom" role="rowgroup">…</div>      ← sticky inset-block-end: 0
    <div class="dzg-overlays" aria-hidden="true">plages, poignée de remplissage, repères de glisser</div>
  </div>
  <div class="dzg-footer">pagination · barre d'état</div>
  <div class="dzg-live" aria-live="polite" aria-atomic="true" class="visually-hidden"></div>
</div>
```
Pourquoi un conteneur unique :
- l'en-tête et le corps défilent horizontalement **ensemble**, sans synchronisation de `scrollLeft` ni compensation de la largeur de l'ascenseur : le décalage en-tête/corps que les grilles à plusieurs conteneurs corrigent à coup de `scroll`-sync n'existe pas ;
- le **côté de l'ascenseur vertical** est géré par le navigateur selon `dir` ;
- l'épinglage est du `position: sticky` sur des segments **en flux** d'une rangée `display: flex` (le `sticky` ne marche pas sur des enfants absolus ; on place donc les cellules absolues **dans** le segment central, qui est en flux).

**Algorithme de fenêtre (lignes)** : fenêtre glissante contiguë par indice affiché.
1. `scroll` (passif) marque « sale » ; une boucle `requestAnimationFrame` regroupe.
2. Phase `read` : `scrollTop`, `clientHeight`, `scrollLeft` converti par `ScrollX` (§3.9). Rien d'autre n'est lu.
3. Phase calcul : `visibleWindow(...)` avec `overscanRows = clamp(4, 4 + vitesse × 0,1 s / hauteurLigne)` pour limiter les zones blanches en défilement rapide.
4. Phase `write` : rangées sorties de la fenêtre → `pool` ; rangées entrées → prises dans le pool, liées à leur nœud. Comme la fenêtre est contiguë et glisse, on **ajoute en tête ou en queue** : l'ordre du DOM est toujours l'ordre des `aria-rowindex`, sans déplacement des rangées du milieu. Un saut sans recouvrement vide la fenêtre et la reconstruit dans l'ordre (un `DocumentFragment`).
5. **La rangée qui a le focus ou un éditeur ouvert n'est jamais recyclée** : elle sort de la fenêtre mais reste montée, placée à sa position, jusqu'à la fin de l'édition ou le déplacement du focus (spike S10).
6. `overflow-anchor: none` sur le conteneur : nous seuls gérons la position. Sur transaction qui insère au-dessus de la fenêtre, on corrige `scrollTop` de la variation de hauteur d'une **ligne d'ancrage** (clé + décalage), sans saut visible.

**Colonnes** : seul le segment central est virtualisé (`cols.first..cols.last` + surbalayage de 2). Les segments épinglés sont toujours complets ; au-delà de 6 colonnes épinglées par côté, avertissement dans la console de développement. Les rangées d'en-tête de groupes affichent seulement les cellules de groupe qui coupent la fenêtre.

**Écriture dans les cellules** : la rangée lie `cells: Map<columnId, CellView>`. Un rechargement de rangée compare une signature par cellule `(référence de valeur, version de format, drapeaux d'état)` et n'écrit rien si elle est inchangée. Le rendu par défaut ne crée **aucun objet d'instance par cellule** : il met à jour le texte d'un noeud texte existant. Les rendus personnalisés ont un contrat `create / update / destroy`.

**Hauteurs** : `--dzg-row-height` est lue **une fois** en `read` (conversion en px) et relue à chaque changement de densité, de taille de police (`rem`) ou de zoom (observé par `ResizeObserver` + `matchMedia('(resolution)')`). Hauteur automatique : estimation, mesure à l'apparition (une phase `read` groupée), `PrefixSums.set`, et correction du défilement par la ligne d'ancrage. Réservée à ≤ 10 000 lignes sans avertissement (spike S3).

**Positionnement** : `transform: translateY` pour les rangées (composé par le GPU, ne touche pas la mise en page) ; `inset-inline-start` pour les cellules du segment central (logique). **[À VÉRIFIER]** contre `inset-block-start` dans le spike S9.

### 3.8 Rendu DOM, interactions, clavier

`@dzgrid/dom` : `createGrid(host, options) → GridInstance`, même forme que DzCalendar. Pas de DOM virtuel global : le modèle est celui du cœur, le DOM est un cache (`Map<RowKey, RowView>`).

```ts
export interface GridSettings<T> {
  readonly rowModel: RowModel<T>;
  readonly columns: readonly ColumnOrGroup<T>[];
  readonly getRowId: (row: T) => RowIdInput;                   // requis
  readonly features?: readonly GridFeature[];                  // sélection de plage, presse-papiers, menus… (tree-shaken)
  readonly locale?: string; readonly direction?: 'auto' | 'ltr' | 'rtl';
  readonly timeZone?: string; readonly numerals?: 'latn' | 'locale';
  readonly messages?: Partial<GridMessages>;
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  readonly selection?: { mode: 'none' | 'single' | 'multi'; checkbox?: boolean; click?: boolean };
  readonly tabNavigation?: 'grid' | 'cell';                    // défaut 'grid' : Tab sort de la grille
  readonly onEvent?: (e: GridEvent<T>) => void;
  readonly injectStyles?: boolean;                             // false pour une CSP stricte
  /* … le reste : état, rendus, éditeurs, sauvegarde */
}
export interface GridInstance<T> {
  readonly kernel: GridKernel<T>;
  update(patch: Partial<GridSettings<T>>): void;
  readonly api: GridApi<T>;
  destroy(): void;
}
export interface GridApi<T> {
  getState(): GridState; setState(s: GridState, o?: { source: 'host' | 'api' }): void;
  focusCell(row: RowKey, column: string): void; ensureVisible(row: RowKey, column?: string): void;
  select(keys: readonly RowKey[]): void; clearSelection(): void;
  startEdit(row: RowKey, column: string): void; stopEdit(commit: boolean): void;
  undo(): boolean; redo(): boolean;
  refresh(o?: { keepScroll?: boolean }): void; exportCsv(o?: CsvOptions): void;
  announce(message: string): void;
}
```

**Interactions** : Pointer Events unifiés (souris, tactile, stylet) avec `setPointerCapture`. Tous les calculs de position convertissent l'abscisse **en coordonnée logique** : `x = dir === 'rtl' ? rect.right − clientX : clientX − rect.left`. Les poignées de redimensionnement sont au bord de **fin** logique de l'en-tête. Le redimensionnement et le déplacement ne lisent aucune géométrie pendant le geste : un `read` au début met en cache les rectangles d'en-tête.

**Le routeur de touches : propriétaire d'abord** (invariant 5 du §4).

```ts
export type KeyOwner = 'cell' | 'header' | 'editor' | 'filter-input' | 'popup' | 'outside';
export function ownerOf(target: EventTarget | null, root: HTMLElement): KeyOwner;   // repris de event-target.ts

export type Intent =
  | { kind: 'move'; axis: 'row' | 'col'; delta: -1 | 1 }            // axe `col` en coordonnée logique
  | { kind: 'edge'; axis: 'row' | 'col'; to: 'first' | 'last'; withCtrl: boolean }
  | { kind: 'page'; delta: -1 | 1 }
  | { kind: 'extend'; axis: 'row' | 'col'; delta: -1 | 1 }
  | { kind: 'startEdit' } | { kind: 'commit'; then: 'down' | 'up' | 'next' | 'prev' | 'stay' } | { kind: 'cancel' }
  | { kind: 'toggleSelect' } | { kind: 'selectAll' } | { kind: 'sort'; multi: boolean }
  | { kind: 'openMenu' } | { kind: 'expand' } | { kind: 'collapse' }
  | { kind: 'undo' } | { kind: 'redo' } | { kind: 'clear' } | { kind: 'moveColumn'; delta: -1 | 1 };

/** Chaque intention déclare où elle est permise. Ajouter une intention sans entrée ici ne compile pas. */
export const INTENT_OWNERS: { readonly [K in Intent['kind']]: readonly KeyOwner[] };

export function intentFor(e: KeyLike, ctx: { dir: 'ltr' | 'rtl'; owner: KeyOwner; mode: 'nav' | 'edit' | 'menu';
  hasRange: boolean; treegrid: boolean; mac: boolean }): Intent | null;
```
Le routeur n'a **qu'un** écouteur `keydown` sur la racine. Il classe la cible, calcule l'intention, et ne la dispatche que si le propriétaire figure dans `INTENT_OWNERS[kind]`. Exemples :
- cible dans un éditeur : seules `commit` et `cancel` passent ; `Ctrl+A`, `Ctrl+Z`, `Delete`, `Espace`, les flèches restent au champ de saisie ;
- cible dans un champ de filtre flottant : aucune intention de grille ;
- `copy` / `cut` / `paste` sont des **événements DOM** (pas des `keydown`) : ignorés si la cible est éditable ; sinon la grille les prend en charge (le `copy` n'a besoin d'aucune permission quand on pose les données via `clipboardData.setData`).

**Inversion RTL dans `intentFor`** : `ArrowRight` en RTL = déplacement vers le **début** logique = `{kind:'move', axis:'col', delta:-1}`. La même inversion vaut pour `Home`/`End` (début / fin logique), `Ctrl+Home` (première cellule), et `ArrowRight`/`ArrowLeft` pour déplier / replier un arbre (en RTL, `ArrowLeft` déplie).

**Clavier selon le patron ARIA grid** :

| Touche | Dans une cellule | Dans un en-tête |
|---|---|---|
| Flèches | Déplacent d'une cellule (logique en RTL) | Entre en-têtes ; `Bas` descend à la première ligne |
| `Home` / `End` | Première / dernière cellule de la ligne (début / fin) | idem sur l'en-tête |
| `Ctrl+Home` / `Ctrl+End` | Première / dernière cellule de la grille | idem |
| `PageHaut` / `PageBas` | Une page d'écran de lignes | — |
| `Entrée` ou `F2` | Entre en édition (cellule éditable) | Trie la colonne |
| `Maj+Entrée` | — | Trie en ajoutant à un tri multiple |
| `Échap` | Annule l'édition, puis la plage | Ferme le menu |
| `Espace` | Coche / décoche la ligne | — |
| `Maj+flèches` | Étend la plage (si `range` actif) | — |
| `Ctrl/Cmd+A` | Sélectionne tout / la plage | — |
| `Ctrl/Cmd+C / X / V` | Copie, coupe, colle (propriétaire `cell`) | — |
| `Ctrl/Cmd+Z / Maj+Z` ou `Y` | Annule / rétablit (propriétaire `cell`) | — |
| `Suppr` | Vide la plage (cellules éditables) | — |
| `Alt+Bas` ou `Maj+F10`/touche Menu | Menu contextuel | Menu de colonne |
| `Alt+Maj+flèche` | — | Déplace la colonne (début / fin logiques) |
| `Tab` | Quitte la grille (**un seul arrêt de tabulation**, patron roving) ; en édition avec `tabNavigation:'cell'`, passe à la cellule suivante | idem |

Alternatives au glisser (WCAG 2.5.7) : déplacement de colonne au clavier, redimensionnement par un mode « redimensionner » (flèches ± 8 px, `Maj` ± 32 px, `Entrée` valide, `Échap` annule) ouvert par le menu colonne, remplissage par `Ctrl+D` (bas) et `Ctrl+R` (fin logique) comme dans un tableur. On évite `Ctrl+Alt+flèches` (combinaison de VoiceOver). **[À VÉRIFIER]** avec lecteurs d'écran (spike S4).

**Focus** : roving tabindex. Position de focus = `{rowKey, columnId}` ; si la ligne disparaît (filtre, suppression), le focus se replie sur la ligne affichée la plus proche **à cet instant**. Le focus survit à `update()` et au rafraîchissement.

**Édition** (`dom/editors`) : un éditeur est un `<input>` / `<select>` / combobox rendu **dans** la cellule ; la cellule en édition est marquée `data-dzg-editor`. Valider : `Entrée` (ligne suivante par défaut), `Tab`, perte de focus (option). Annuler : `Échap`. Message d'erreur : `aria-invalid`, `aria-describedby` vers un noeud d'erreur, annonce dans la région live. La cellule d'édition **n'est pas recyclée** (§3.7).

**Presse-papiers** : copie en `text/plain` (TSV avec citation RFC 4180 : tabulation, retour à la ligne et guillemets) et `text/html` (tableau simple). Collage : lecture de `text/plain` (et `text/html` d'Excel en repli **[À VÉRIFIER, spike S7]**), `tsvToMatrix`, `planPaste` ; une valeur seule collée sur une plage la remplit. Les valeurs sont **brutes** (identifiant, nombre, jour ISO), pas l'affichage localisé, avec lecture selon la locale au collage (chiffres arabes-indic, virgule décimale).

**Superpositions** (plages, poignée, repères) : dessinées dans `.dzg-overlays` à partir de la **géométrie** (`PrefixSums`), pas de classes sur les cellules : elles ne dépendent donc pas des cellules montées ni du recyclage. En RTL, la poignée de remplissage se place au coin bas du bord de fin logique (en bas à gauche).

**Menus et fenêtres** (`popup`) : attribut `popover` quand il existe, positionnement par CSS anchor positioning avec repli JS d'environ 1 kB, **placement en `start`/`end` logiques**, focus piégé et restitué, `Échap` ferme, rôle `menu` ou `dialog` selon le cas, `aria-expanded` sur le déclencheur. Propriétaire `popup` pour le clavier.

**Annonces (région live polie)** : tri changé, filtre appliqué (« 128 lignes »), page changée, chargement terminé ou en erreur, enregistrement réussi ou refusé, plage copiée. Les textes viennent des messages (§3.9).

### 3.9 i18n, RTL, accessibilité

**Messages** : un dictionnaire typé, sans aucune chaîne en dur.

```ts
export const MESSAGE_KEYS = ['grid.noRows', 'grid.loading', 'grid.error', 'sort.ascending', /* … ~120 clés */] as const;
export type MessageKey = typeof MESSAGE_KEYS[number];
export type MessageValue = string | { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type GridMessages = { readonly [K in MessageKey]: MessageValue };
export const EN = { /* … */ } satisfies GridMessages;   // fr.ts, ar.ts : idem, satisfies = complétude à la compilation
export function msg(m: GridMessages, key: MessageKey, params?: Readonly<Record<string, string | number>>, ctx?: LocaleCtx): string;
```
- Les clés plurielles utilisent `Intl.PluralRules(locale)` ; l'arabe exige ses six formes (`zero`, `one`, `two`, `few`, `many`, `other`), vérifiées par un test via `resolvedOptions().pluralCategories`.
- Un test vérifie que les paramètres `{n}`, `{page}`… d'une clé sont **les mêmes** dans `en`, `fr` et `ar`.
- Les en-têtes de colonne et les libellés du domaine viennent de l'hôte, déjà traduits ; **la grille ne contient aucune chaîne visible en dur** (garde-fou §4, invariant 9).
- Les dictionnaires sont des sous-chemins (`@dzgrid/dom/locales/ar`) importables à la demande : une application mono-langue n'embarque que le sien.

**Formats** : `createFormatters(ctx)` construit, avec cache, des formateurs de nombre, pourcentage, devise, jour, date-heure, liste. Le calendrier est **toujours grégorien** (`calendar: 'gregory'` ; `ar-SA` ouvrirait l'Umm al-Qura), les chiffres **latins par défaut** (`numerals: 'latn'` : sûrs pour la copie et les filtres), `locale` seul décide du reste (`ar-DZ`, `fr-FR`). **[À VÉRIFIER]** : les différences ICU entre navigateurs ; les tests de format épinglent des étiquettes de langue complètes et comparent des *parties* structurées plutôt que des chaînes entières.

**RTL natif, par construction** :
- **direction** : `direction: 'auto' | 'ltr' | 'rtl'` ; en `auto`, lue sur l'ancêtre `[dir]` le plus proche (ou `documentElement`), avec un `MutationObserver` sur l'attribut `dir` des ancêtres. Un changement à l'exécution **ne recrée pas la grille** (contrairement au plan 0.2.0 D2) : tout est en propriétés logiques, seul le calcul de défilement doit relire la convention du signe.
- **module `dir.ts`** : seul fichier autorisé à nommer `left`, `right`, `scrollLeft`, `clientX` pour la géométrie. Il fournit `inlineScroll(el, dir)` (distance ≥ 0 depuis le début logique, quelle que soit la convention de signe de `scrollLeft` en RTL), `setInlineScroll`, `logicalX(event, rect, dir)`. Un test de grep interdit `left`, `right`, `marginLeft`, `paddingRight`, `scrollLeft`, `textAlign: 'left'` ailleurs.
- **CSS** : uniquement `inset-inline-*`, `margin-inline`, `padding-inline`, `text-align: start | end`, `border-inline-*`, `float: inline-start`. Icônes directionnelles (chevrons, flèches de tri de menu) : retournées par `scale: -1 1` sous `:dir(rtl)` ; les icônes sans direction ne le sont pas.
- **Bidi des cellules** : texte `unicode-bidi: isolate`, `text-align: start` ; colonnes numériques `text-align: end` avec isolation LTR pour les nombres (`unicode-bidi: isolate; direction: ltr` sur la valeur, lecture à gauche en RTL). Identifiants latins dans un texte arabe : isolés par `unicode-bidi: isolate` posé sur la cellule, pas par un `<bdi>` par cellule (coût DOM).

**Accessibilité (ARIA grid et treegrid)** :

| Élément | Rôle et attributs |
|---|---|
| Racine | `role="grid"` (`treegrid` si arbre ou regroupement) ; `aria-rowcount` total (−1 si inconnu), `aria-colcount` total, `aria-multiselectable`, `aria-busy` pendant un chargement, `aria-readonly` si aucune colonne n'est éditable |
| En-tête / corps | `role="rowgroup"` |
| Rangée | `role="row"`, `aria-rowindex` (**1-based, en-têtes comprises**, calculé par la mise en page, jamais par l'ordre du DOM), `aria-selected` quand la sélection est active |
| En-tête de colonne | `role="columnheader"`, `aria-colindex`, `aria-sort` (`ascending`, `descending`, `none`), `aria-colspan` pour les groupes |
| Cellule | `role="gridcell"` (ou `rowheader` pour la colonne d'identité), `aria-colindex`, `aria-readonly`, `aria-invalid` si erreur de validation, `aria-colspan`/`aria-rowspan` pour les fusions |
| Arbre | `aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize` |
| Détail | rangée `role="row"` à une cellule `aria-colspan` = total |
| Région live | annonces (voir §3.8) |

Tout défilement virtualisé garde `aria-rowindex` exact : un lecteur d'écran sait où il est même si les rangées voisines ne sont pas montées. **Reste à prouver** : que NVDA, JAWS, VoiceOver et TalkBack annoncent correctement une grille virtualisée, y compris en arabe, et la navigation par commandes de tableau (spike S4). Cibles ≥ 24×24 px (`--dzg-target-min`), focus non masqué (WCAG 2.4.11), indicateurs jamais portés par la couleur seule (1.4.1), `forced-colors` lisible.

### 3.10 Édition, sauvegardes, annulation

Cœur pur, repris et durci de `cell-edits.ts` (§3.0).

```ts
export type CellSaveStatus = 'pending' | 'saving' | 'saved' | 'failed';
export interface PendingCell { readonly row: RowKey; readonly column: string; readonly value: unknown;
  readonly previousValue: unknown; readonly status: CellSaveStatus; readonly generation: number;
  readonly lastSaved?: { readonly value: unknown; readonly generation: number } }
export type CellEdits = ReadonlyMap<RowKey, ReadonlyMap<string, PendingCell>>;     // imbriquée : pas de clé composite

export interface StagedChange { readonly row: RowKey; readonly column: string; readonly value: unknown; readonly previousValue: unknown }
export type SaveOrigin = 'edit' | 'fill' | 'paste' | 'bulk' | 'undo' | 'redo';
export interface SaveRequest<T> { readonly origin: SaveOrigin; readonly changes: readonly StagedChange[]; readonly rows: readonly T[] }
export type SaveHandler<T> = (req: SaveRequest<T>, signal: AbortSignalLike) => Promise<void> | void;

export interface SaveCoordinator<T> {
  readonly edits: CellEdits;                                    // instantané immuable
  stage(changes: readonly StagedChange[], origin: SaveOrigin): StageResult;
  readonly dirty: boolean;                                      // pending ou saving
  flush(): Promise<void>;
  onSource(change: ModelChange<T>): void;                       // réconcilie la surcouche (voir plus bas)
  subscribe(fn: (e: SaveEvent) => void): () => void;
}
export function createSaveCoordinator<T>(o: { save?: SaveHandler<T>; serializePerCell?: boolean /* défaut true */;
  nextGeneration: () => number }): SaveCoordinator<T>;
```

Règles (chacune a ses cas de conformité, §5.1) :
1. **Un geste = une requête** : un remplissage de 50 lignes ou un collage de 200 cellules est un seul `SaveRequest`.
2. **Génération globale monotone** : jamais réutilisée pour une cellule, même après un rollback qui l'a oubliée.
3. **File par cellule** (`serializePerCell`, défaut vrai) : une cellule n'a jamais **deux sauvegardes en vol**. L'édition suivante attend l'issue de la précédente ; seules les plus récentes en attente sont conservées (« la dernière gagne »). Cela empêche le serveur d'appliquer deux requêtes dans le désordre et de garder la plus ancienne. Le mode `parallel` reste disponible ; la logique de ticket (`settleSaved` / `settleFailed`) y garantit la cohérence à l'écran.
4. **Rollback** : on ne modifie **jamais** les lignes source. Un échec retire l'entrée de la surcouche, ou la remet à `lastSaved`. La cible n'est pas `previousValue`.
5. **Rafraîchissement des données** (`onSource`) : quand la source change pour une cellule qui a une entrée `saved`, l'entrée est abandonnée (le serveur fait autorité). Les entrées `pending` et `saving` survivent (elles portent l'intention de l'utilisateur). Un changement de `getRowId` ou de modèle abandonne tout, avec un avertissement si une sauvegarde est en vol.
6. **Erreur de sauvegarde** : `SaveFailure { request, error }` remonte à l'hôte, avec annonce live et état visuel ; l'erreur d'origine est transmise **sans modification**.

**Annuler / rétablir** : pile d'inverses, limite 100 lots.

```ts
export interface UndoBatch { readonly label?: string; readonly cells: readonly { row: RowKey; column: string; before: unknown; after: unknown }[] }
export interface UndoStack { canUndo: boolean; canRedo: boolean; push(b: UndoBatch): void;
  undo(): StagedChange[] | null; redo(): StagedChange[] | null; clear(): void }
```
Annuler une cellule déjà enregistrée est une **nouvelle édition** qui repasse par la sauvegarde, avec l'origine `undo`. Si la valeur courante de la cellule n'est plus `after` (modifiée depuis, y compris par le serveur), l'entrée est ignorée avec une annonce, jamais appliquée à l'aveugle.

**Validation** :
```ts
export type ValidationResult = { ok: true } | { ok: false; code: string; params?: Readonly<Record<string, string | number>> };
export type Validator<V> = (value: V, ctx: { row: Readonly<unknown>; column: string; locale: LocaleCtx }) => ValidationResult;
export const required: Validator<unknown>; export const min: (n: number) => Validator<number>; export const max: (n: number) => Validator<number>;
```
Le code d'erreur est traduit par la couche DOM (clé `validation.<code>`) ou par l'hôte.

### 3.11 Thème (`@dzgrid/theme`)

- `dzgrid.scss` est la source, `dzgrid.css` est compilé (`npm run build:theme`), un test échoue si les deux dérivent : même mécanique que tzslot.
- **Palette partagée** : les neuf couleurs `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border`, `--tz-accent`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, en paires `light-dark()` ; mêmes valeurs que `@tzslot/theme` et `@dzcalendar/theme`. Sehhaty projette ses **six palettes commutables** et son mode sombre sur ces variables : la grille suit à chaud, sans recréation (à vérifier par un test navigateur qui commute la palette grille affichée).
- **Variables propres** `--dzg-*` : `--dzg-row-height`, `--dzg-header-height`, `--dzg-cell-padding-inline`, `--dzg-font`, `--dzg-radius`, `--dzg-target-min`, et les couleurs dérivées `--dzg-header-bg`, `--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-range-bg`, `--dzg-range-border`, `--dzg-focus-ring`, `--dzg-tone-<success|danger|warning|info|neutral>-bg|-fg`. Chaque couleur propre est définie **au point d'usage** en `var(--dzg-x, color-mix(in srgb, var(--tz-accent) 12%, var(--tz-bg)))` (une variable qui renvoie à une autre est figée là où elle est déclarée : cf. commentaire de `tzslot.scss`).
- **Aucun hexadécimal dans les sources `dom`, `angular`, `core`** : un test échoue sur `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `hsl(` et sur toute affectation de `style.color`, `style.background*`, `style.border*Color` dans les sources. Les tons d'état sont des **classes** (`dzg-badge--success`) qui lisent des variables. Les règles de style de ligne et de cellule de l'hôte produisent des classes (`dzg-rule--danger`).
- **Contraste vérifiable par un script** (`scripts/check-contrast.mjs`) :
  - lit `dzgrid.css` et la liste `contrast-pairs.json` : paires `{fg, bg, min, scheme}` ; **toutes** les combinaisons de texte (jetons texte × surfaces de la grille) à 4,5:1 ; composants d'interface, bordures de champ, anneau de focus, poignées, cases à cocher à 3:1 ;
  - évalue `light-dark()` pour clair et sombre, et `color-mix(in srgb, …)` (composition réelle sur le fond, canal alpha compris) ;
  - accepte `--palette fichier.json` : Sehhaty lui passe ses six palettes × clair / sombre (12 combinaisons) et ses propres surcharges, ce qui comble l'angle mort noté dans la note de cadrage (« `check-contrast.mjs` ne lit que `_sehhaty-tokens.scss` ») ;
  - **complétude** : un test échoue si le SCSS emploie une variable de couleur de texte ou de surface absente de la table de paires.
- **Densité** : `[data-density="compact|comfortable|spacious"]` change `--dzg-row-height` et les marges ; la virtualisation relit la hauteur à chaque changement (§3.7).
- **Contrat de sélecteurs** : classes BEM stables `dzg`, `dzg-row`, `dzg-cell`, `dzg-cell--focus`, `dzg-cell--range`, `dzg-cell--invalid`, `dzg-cell--saving|saved|failed`, attributs `data-dzg-*`, `part=""` pour un futur Web Component. Le CSS de mise en page injecté utilise `:where()` (spécificité nulle) : toute règle chargée après gagne. `injectStyles: false` + chaînes `*_CSS` exportées pour une CSP stricte.
- **`forced-colors`** (`contrast.css`) : couleurs système, sélection et plage en contour. **Impression** : `@media print`, cellules à bordures nettes, `print-color-adjust: exact`.
- **Tailwind** : `tailwind.css` (v4) et `tailwind3.css`, comme tzslot.
- **Cellules à indicateur d'état** (non-seulement-couleur) : `saving` (animation désactivée sous `prefers-reduced-motion`), `failed` (icône + bordure), `saved` (coche discrète).

### 3.12 Wrapper Angular (`@dzgrid/angular`)

Composants autonomes, `OnPush`, **aucun NgModule**, signaux d'entrée. Patron de `tz-calendar` (instance créée **à la construction**, `effect` + `untracked`).

```ts
@Component({ selector: 'dz-grid', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DzGridController], template: '' })
export class DzGrid<T> implements OnDestroy {
  // données
  readonly rowModel   = input.required<RowModel<T>>();           // clientRows(...) | pagedRows(...) | …
  readonly columns    = input.required<readonly ColumnOrGroup<T>[]>();
  readonly getRowId   = input.required<(r: T) => RowIdInput>();
  readonly features   = input<readonly GridFeature[]>(NO_FEATURES);      // constante stable
  readonly options    = input<Partial<GridSettings<T>>>(NO_OPTIONS);     // le reste
  readonly locale     = input<string | undefined>(undefined);
  readonly direction  = input<'auto' | 'ltr' | 'rtl'>('auto');
  readonly messages   = input<Partial<GridMessages> | undefined>(undefined);
  readonly timeZone   = input<string | undefined>(undefined);
  readonly density    = input<'compact' | 'comfortable' | 'spacious'>('comfortable');
  readonly save       = input<SaveHandler<T> | undefined>(undefined);
  // état bidirectionnel
  readonly sort        = model<readonly SortItem[]>([]);
  readonly filter      = model<FilterModel>({});
  readonly quickFilter = model('');
  readonly selection   = model<SelectionState>(NO_SELECTION);
  readonly columnState = model<readonly ColumnState[]>([]);
  readonly page        = model(0);
  // sorties
  readonly cellValueChanged = output<CellChange<T>>();   readonly saveFailed   = output<SaveFailure<T>>();
  readonly fetchFailed      = output<FetchFailure>();    readonly rowClicked   = output<RowClick<T>>();
  readonly cellContextMenu  = output<CellMenu<T>>();     readonly problems     = output<readonly Problem[]>();
  readonly gridReady        = output<GridApi<T>>();
}
```
- **`rowModel` est un objet** (créé par l'hôte : `clientRows`, `pagedRows`) : le wrapper n'invente pas d'API de données, et un changement de modèle est un changement d'entrée explicite.
- **Écho de valeur** : `update()` côté DOM ignore une valeur égale à la **dernière valeur émise** pour `sort`, `filter`, `selection`, `columnState`, `page`, sans quoi le renvoi par Angular réinitialiserait l'état entre deux clics (leçon tzslot, DzCalendar D.7). Un test rejoue la séquence « geste, `update` avec la valeur renvoyée, geste » pour chaque état.
- **L'état d'interface n'est jamais dans les options** : focus et cellule active, défilement, édition en cours, fenêtre ouverte, plage, colonnes déployées, détails ouverts survivent à tout `update()`.
- **Zone et zoneless** : aucun `NgZone` obligatoire. Instance créée dans `NgZone.runOutsideAngular` quand il est injecté (zone.js) ; les `output` repassent par `run`. Sous `provideZonelessChangeDetection`, les écritures de signal (`model.set`) planifient la détection.
- **Gabarits** :
  ```html
  <dz-grid [rowModel]="model" [columns]="columns" [getRowId]="rowId" [(sort)]="sort" [(filter)]="filter">
    <ng-template dzgCell="status" let-value let-row="row" let-ctx="ctx"><app-badge [value]="value" /></ng-template>
    <ng-template dzgHeader="actions"> … </ng-template>
    <ng-template dzgDetail let-master="row"> <dz-grid … /> </ng-template>
    <ng-template dzgNoRows> … </ng-template>
  </dz-grid>
  ```
  Les directives (`DzgCell`, `DzgHeader`, `DzgDetail`, `DzgNoRows`, `DzgEditor`) sont lues par `contentChildren`. Cycle de vie d'une cellule à gabarit : `didMount` → `ViewContainerRef.createEmbeddedView` et déplacement des noeuds dans la cellule ; `didUpdate` → mise à jour du contexte et `detectChanges()` **sur cette seule vue** ; `willUnmount` → `destroy()` (le contrat garantit l'appel avant recyclage). Vues recyclées en **pool par colonne**. Pas de `ApplicationRef.tick()` global. **Coût à mesurer** (spike S6) : conseiller les rendus DOM pour les colonnes denses.
- **Contrôleur** : `DzGridController` (fourni par le composant) expose des signaux — `rowCount`, `selectedCount`, `loading`, `error`, `canUndo`, `canRedo`, `dirty`, `page`, `total`, `hasNext` — et `api: Signal<GridApi<T> | null>`. Un en-tête ou une barre d'outils de l'hôte fait `inject(DzGridController)`.
- **Fournisseurs** : `provideDzGrid({ locale, timeZone, messages, numerals, defaults })`, jetons `DZG_LOCALE`, `DZG_MESSAGES`, `DZG_DEFAULTS`. La direction n'est **pas** lue via `@angular/cdk/bidi` : elle vient du DOM (§3.9). Pas de CDK. `@angular/forms` non requis.
- **Observable** : `fromObservable(obs$)` dans `@dzgrid/angular` convertit un `Observable` en `Promise` (`firstValueFrom`) pour `fetch` et `save`.
- **Exemple, `admin/audit-logs`** :
  ```ts
  readonly model = pagedRows<AuditLog>({ pageSize: 50, pageSizes: [25, 50, 100], getRowId: r => r.id,
    fetch: req => firstValueFrom(this.api.list(toQuery(req))) });
  ```
  avec `columns` posées sur sept colonnes, `[(filter)]`, `(fetchFailed)`. Taille cible : ≤ 85 kB gz pour ce profil.

### 3.13 Regroupement, agrégation, arbre, master/detail

```ts
export type AggFuncName = 'sum' | 'min' | 'max' | 'avg' | 'count' | 'first' | 'last';
export type AggFn<V> = (values: readonly V[], ctx: AggCtx) => unknown;
export interface GroupingOptions { readonly by: readonly string[]; readonly expandedDepth: number | 'all';
  readonly footers?: 'none' | 'group' | 'grand' | 'both'; readonly sortGroups?: 'asc' | 'desc' | 'by-agg'; readonly minChildren?: number }
export function buildGroups<T>(nodes: readonly DataNode<T>[], o: GroupingOptions, cols: ColumnLookup<T>, ctx: LocaleCtx): GroupTree<T>;
export interface TreeOptions { readonly path?: (row: Readonly<unknown>) => readonly string[]; readonly parentId?: string; readonly children?: string }
export function buildTree<T>(nodes: readonly DataNode<T>[], o: TreeOptions): GroupTree<T>;
export type ExpansionState = ReadonlySet<RowKey>;           // groupKey par chemin : survit au tri et au filtre
```
- **Identité de groupe** : `groupKey(path)` (§3.2). Étendre un groupe survit au tri, au filtre, au rafraîchissement.
- **Agrégation mergeable** : la moyenne garde `(somme, nombre)` pour qu'un groupe parent se calcule à partir de ses enfants sans relire les lignes. La somme utilise l'addition compensée (Neumaier) : les sommes monétaires de la pharmacie ne dérivent pas à la quatrième décimale. Un type `decimal` exact est hors v1.
- **Arbre filtré** : on conserve les ancêtres des lignes qui correspondent. Tri par niveau. Rôle `treegrid`.
- **Master/detail** : le détail est un **noeud `DetailNode`** inséré dans `DisplayedRows` juste après le maître (hauteur propre dans `RowLayout`). Il n'est **pas** une ligne de données : il est impossible de coller, remplir ou éditer dedans (§3.2). Le DOM crée à l'expansion une instance `createGrid` **imbriquée** (modèle fourni par `detail(master)`), la détruit quand elle sort de la fenêtre, et conserve son `GridState` dans un LRU indexé par `RowKey` du maître : s'éloigner puis revenir retrouve ses tris et filtres. Clé de détail = `detailKey(masterKey)` (jamais `undefined::detail`).

### 3.14 État sérialisable

```ts
export interface GridState { readonly v: 1; readonly columns: readonly ColumnState[]; readonly sort: readonly SortItem[];
  readonly filter: FilterModel; readonly advanced: AdvancedFilter | null; readonly quick: string;
  readonly group: readonly string[]; readonly expanded: readonly string[]; readonly page?: number; readonly pageSize?: number;
  readonly selected?: SelectionState; readonly scrollAnchor?: { row: string; offset: number } }
```
Versionné. Pour le serveur paginé, l'hôte l'enregistre dans l'URL ou le stockage local. Une version inconnue est un `Problem`, jamais une exception. **Aucune donnée de ligne** n'y est jamais incluse (données de santé).

### 3.15 Sélection

```ts
export type SelectionState =
  | { readonly mode: 'include'; readonly keys: ReadonlySet<RowKey> }
  | { readonly mode: 'exclude'; readonly keys: ReadonlySet<RowKey> };     // « tout sauf » : serveur, 10⁷ lignes
export function isSelected(s: SelectionState, k: RowKey): boolean;
export function selectionCount(s: SelectionState, total: number | null): number | null;
```
- Par identité : survit au tri, au filtre, à la pagination. Sélectionner « tout » sur un modèle serveur passe en `exclude` : jamais 10⁷ identités en mémoire.
- Maj+clic : plage **dans l'ordre affiché courant** via `DisplayedRows.indexOf`. Une borne qui n'est plus affichée annule la plage avec une annonce.
- La plage de cellules : `CellRange { anchor: CellAddr; focus: CellAddr }` où `CellAddr = { row: RowKey; column: string }`. Résolue en bornes par `rangeBounds(range, displayed, columns)` ; **si un coin n'est plus affiché, la plage est abandonnée**, jamais réinterprétée sur une autre ligne.

### 3.16 Export

```ts
export interface CsvOptions { readonly separator?: ',' | ';' | '\t'; readonly bom?: boolean;           // défaut true (Excel)
  readonly header?: boolean; readonly sanitizeFormulas?: boolean;                                       // défaut true
  readonly columns?: readonly string[]; readonly rows?: 'all-loaded' | 'filtered' | 'selected' | 'range' }
export function* csvChunks<T>(rows: Iterable<DataNode<T>>, cols: readonly ColumnDef<T>[], ctx: LocaleCtx, o: CsvOptions): Generator<string>;
```
- RFC 4180 : guillemets doublés, champs contenant séparateur, guillemet ou saut de ligne entre guillemets.
- Séparateur par défaut selon la locale (`;` si la virgule est le séparateur décimal) : Excel en français ou en arabe attend le point-virgule.
- **Anti-injection de formules** (revue 0.2.0) : une cellule **texte** commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée par une apostrophe. Les nombres négatifs ne sont pas préfixés (le type est connu).
- **Découpé** : le générateur rend la main (`yield` au pas de 20 ms) pour qu'aucune image ne dépasse 50 ms. L'hôte écrit dans un `Blob`.
- **Hook d'audit** : `exportRequested` (événement annulable) : un hôte médical peut refuser ou journaliser l'export.
- **Serveur** : `exportAll: (req: PageRequest) => Promise<{ url?: string; blob?: Blob }>` : 10⁷ lignes ne s'exportent jamais côté client.

### 3.17 Noyau (`kernel.ts`) et événements

```ts
export interface GridKernel<T> {
  readonly rows: RowModel<T>; readonly columns: ColumnModel; readonly saves: SaveCoordinator<T>; readonly undo: UndoStack;
  getState(): GridState; setState(s: GridState, o: { source: ChangeSource }): void;
  dispatch(cmd: GridCommand): GridCommandResult;       // commandes sérialisables : 'sort.set', 'filter.set', 'edit.stage', …
  subscribe(fn: (e: GridEvent<T>) => void): () => void;
  destroy(): void;
}
export type ChangeSource = 'user' | 'host' | 'api' | 'data';
```
Chaque événement porte sa `source`. Les modèles à deux sens (`model()` Angular) ne réagissent qu'à `'user'` : un `host` qui renvoie sa valeur ne boucle pas.

Événements principaux : `modelUpdated`, `sortChanged`, `filterChanged`, `selectionChanged`, `rangeChanged`, `columnResized|Moved|Pinned|Visible`, `rowClicked`, `cellClicked`, `cellDoubleClicked`, `cellContextMenu`, `cellEditStarted|Stopped`, `cellValueChanged` (avec statut de sauvegarde), `saveFailed`, `fetchFailed`, `paginationChanged`, `rowExpanded`, `problems`, `firstDataRendered`, `scroll`.

---

## 4. Invariants rendus impossibles à violer par construction

Chaque ligne : le bug (réel, celui de ngx-sheetgrid 0.1.x, ou potentiel), le mécanisme qui le rend impossible, et le test qui le garde.

| # | Invariant | Mécanisme (par construction) | Garde-fou |
|---|---|---|---|
| 1 | **Indice affiché ≠ indice source.** (Bug 1 : après un tri, l'indice du focus désignait une autre ligne dans les données.) | Il n'existe **pas de type `SourceIndex` public**. `DisplayIndex` est une marque de type que seul `DisplayedRows.index(n)` fabrique ; il n'a de sens que pour une `version`. Le focus, la sélection, la plage, l'édition retiennent des `RowKey`. Les événements portent un `RowNode`. Les opérations de cellule n'acceptent qu'un `DataNode`. Le hit-test lit la clé de ligne dans le DOM (`data-dzg-row`), jamais sa position. | Test de types (`expectTypeOf`) : passer un `number` à `focusCell` ne compile pas ; cas de conformité `displayed-after-sort` ; test jsdom « trier puis cliquer la 3ᵉ ligne affichée édite la bonne ». |
| 2 | **Identité de ligne stable.** (Revue : id échantillonné sur la première ligne ; ids de détail `undefined::detail`.) | `getRowId` **obligatoire**. `RowKey` n'est produit que par `dataKey`, `groupKey`, `detailKey` : préfixes distincts et encodage à longueur ; un id utilisateur ne peut pas entrer en collision avec une clé de groupe. Id absent ou invalide : `Problem` `invalid-row-id`, ligne refusée. Doublon : `Problem` `duplicate-row-id`, première gardée. | Cas `row-key-collisions` (ids `'g:1:a'`, `'x:…'`, chaînes avec séparateurs, nombres et chaînes équivalentes) ; test de propriété avec PRNG à graine. |
| 3 | **Réponses serveur dans l'ordre.** (Bug 2 : une réponse lente écrasait la réponse d'une requête plus récente.) | `RequestGate` : chaque requête reçoit un `Ticket {seq, key}` ; **seule** la dernière du canal, dont la clé égale la requête courante, est acceptée ; `AbortController` abandonne les précédentes. Le modèle serveur n'expose aucune écriture de lignes autre que `settle(ticket, response)`. Une nouvelle requête (tri, filtre, recherche, taille de page) change d'**époque** : tout ticket antérieur meurt. | Suite de conformité `server-gate` : arrivée inversée, deux filtres rapprochés, changement de page pendant un chargement, réponse après `destroy`. |
| 4 | **Jours calendaires contre instants.** (Bug 3 : `new Date('2026-03-05')` est minuit UTC, donc la veille à l'ouest ; `toISOString()` d'un minuit local donne la veille à l'est.) | Types `Day` et `InstantMs` **distincts** ; **aucun `Date`** dans le cœur (test de pureté). Un `Day` ne subit jamais de conversion de fuseau. Un instant sans offset est un `Problem`. Les filtres d'instant par jour calculent `[from, to)` **une seule fois** par `zoneDayBounds` ; le serveur reçoit ces bornes résolues. Formatage par `formatToParts(epochMs)`, grégorien forcé. | Cas `zone-day-bounds` (Algiers, Paris 2026-03-29 et 10-25, São Paulo 2018-11-04, Havane 2023-03-12, Apia 2011-12-30, Lord Howe, Kolkata) ; cas `day-filter-inclusive` ; cas de collage de dates. |
| 5 | **Saisie contre raccourcis.** (Bug 4 : `Ctrl+V` dans un éditeur collait dans la plage ; `Échap` supprimait la sélection ; `Ctrl+A`, `Suppr`, `Ctrl+Z` volaient la frappe.) | Un seul écouteur `keydown` ; `ownerOf(target)` classe la cible (`cell`, `header`, `editor`, `filter-input`, `popup`) ; `INTENT_OWNERS` (type exhaustif) dit où chaque intention est permise : **impossible d'enregistrer un raccourci sans propriétaire**. `copy`/`cut`/`paste` sont des événements DOM ignorés quand la cible est éditable. | Test jsdom par éditeur et par champ de filtre : chaque touche et chaque événement de presse-papiers (`paste` simulé) laisse la grille inerte ; test de type sur `INTENT_OWNERS`. |
| 6 | **Sauvegardes concurrentes, rollback.** (Bug 5 : un ancien succès marquait « enregistré » une édition plus récente en vol ; un rollback repartait de la génération 1 et prenait un ticket en vol ; le rollback a corrompu des lignes.) | Génération **globale monotone** jamais réutilisée ; **une seule sauvegarde en vol par cellule** (file `serializePerCell`) ; surcouche d'édition : les lignes source ne sont jamais modifiées, donc un rollback ne peut rien corrompre ; rollback vers `lastSaved` ; réconciliation avec les données rafraîchies. | Suite de conformité `edit-saves` (séquences d'événements : édition, début de sauvegarde, résultats dans tous les ordres) ; test de propriété : pour toute permutation des résolutions, l'état affiché final égale la dernière valeur acceptée. |
| 7 | **Direction logique.** (tzslot : flèches non inversées, chevrons en dur.) | Propriétés CSS logiques ; `left`/`right`/`scrollLeft`/`clientX` seulement dans `dom/src/dir.ts` ; `intentFor` prend `dir` ; l'ordre des colonnes est logique ; `ScrollX` normalise le signe de `scrollLeft`. | Test de grep (sources et SCSS) ; cas `keyboard-intent` pour chaque touche en `ltr` et `rtl` ; test Chrome : épinglage début / fin et ascenseur en RTL. |
| 8 | **Aucune couleur en dur ; contraste.** | Test d'interdiction des hex, `rgb(`, `style.color` ; tons par classes ; `check-contrast.mjs` complet (§3.11). | Script en CI, avec les six palettes de Sehhaty. |
| 9 | **Aucune chaîne visible en dur.** | Les sources `dom` n'écrivent jamais un littéral dans `textContent`, `innerText`, `title`, `aria-label`, `placeholder` : tout passe par `msg(...)`. Un test d'AST (API du compilateur TypeScript) échoue sur un littéral dans ces puits. Typage de `MessageKey` : une clé inexistante ne compile pas. | Test `no-literal` ; complétude `en`/`fr`/`ar` par `satisfies`. |
| 10 | **Fuites.** | Tout écouteur, observateur, minuterie et `AbortController` passe par une portée `Disposer` détruite par `destroy()`. | Test mémoire : 1 000 cycles créer/détruire retiennent ≤ 1 Mo ; compteur d'écouteurs en jsdom. |
| 11 | **Navigation inter-pages qui perd la sélection.** | Sélection par `RowKey`, modèle `exclude` pour « tout » côté serveur. | Cas `selection-across-pages`. |
| 12 | **Sortie qui change la forme du fichier.** (CSV ouvert dans Excel : injection de formule, BOM absent.) | `sanitizeFormulas` défaut vrai ; BOM par défaut ; citation RFC 4180 ; séparateur selon la locale. | Cas `csv` (valeurs `=1+1`, `@SUM`, `-5` numérique, guillemets, retours à la ligne, arabe). |
| 13 | **Perte de l'état utilisateur au renvoi par le framework.** | `update()` ignore la dernière valeur émise ; état d'interface hors des options ; `setDefs` conserve par `id`. | Test Angular : séquence « geste, renvoi, geste » pour chaque état. |
| 14 | **Zone blanche ou ordre DOM incohérent après défilement.** | Fenêtre glissante contiguë, `aria-rowindex` calculé par la mise en page ; suréchantillonnage proportionnel à la vitesse. | Test Chrome : parcours 100 000 lignes, aucune image sans rangée ; lecture de l'arbre d'accessibilité. |

---

## 5. Tests, conformité, performance

### 5.1 Niveaux

| Niveau | Outil | Contenu |
|---|---|---|
| Cœur | vitest, environnement **node** | Tout `@dzgrid/core`. Aucun mock du temps : `now` et zone injectés. PRNG à graine (`mulberry32`) ; `Math.random` interdit dans les tests. |
| Pureté | vitest | `purity.test.ts` : aucun `Date`, `Math.random`, `performance.now`, global DOM ; compilation sans lib DOM ; graphe d'imports (`enterprise/` non importé par la base). |
| Conformité | vitest + `@dzgrid/conformance` | Cas JSON écrits **à la main** (§5.1.1). |
| DOM | vitest + jsdom | Comportement, clavier, focus, ARIA, `update()` qui préserve l'état, propriété des touches, éditeurs, presse-papiers, RTL (flèches). **Jamais la mise en page.** |
| CSS | vitest (texte) | Là où jsdom ne voit pas une règle (sticky, logique, min-width), on assert le texte de la CSS. |
| Mise en page réelle | `playwright-core`, Chrome système (`channel:'chrome'`) | Colonnes épinglées début / fin en LTR **et** RTL, alignement en-tête / corps ≤ 1 px, côté de l'ascenseur, signe de `scrollLeft`, mesure de hauteur auto, palettes commutées à chaud, captures par **clip d'une capture pleine page**. |
| Accessibilité | axe-core dans Chrome + CDP `Accessibility.getFullAXTree` | Aucune violation ; `aria-rowindex` exact après défilement ; protocole manuel de lecteurs d'écran dans `docs/a11y-protocol.md` (NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari, TalkBack, **en arabe**). |
| Angular | vitest + plugin Angular (gabarits compilés) | Signaux, `model()`, zoneless, gabarits de cellule, écho de valeur. |
| Thème | vitest (node) | Dérive SCSS / CSS, interdiction des hex, `check-contrast`, complétude des paires. |
| CI | `test:ci` en 1 worker | Détecte l'état partagé entre fichiers (leçon tzslot). |

### 5.1.1 Suites de conformité

```
conformance/cases/
  zone-day-bounds/    {day, zone}                              → {from, to}  (ISO)
  day-arith/          {op, a, b}                               → Day / Instant
  value-parse/        {type, locale, text}                     → valeur | rejet          (ar-DZ, fr-FR, en)
  filter-text/ filter-number/ filter-day/ filter-instant/ filter-set/ filter-combined/ quick-filter/
  sort/               {rows, sort, locale}                     → ordre des ids
  displayed-order/    {rows, ops[], …}                         → ids affichés (invariant 1)
  server-gate/        {steps[]}                                → applied|dropped par pas (invariant 3)
  edit-saves/         {steps[]}                                → statuts et valeurs finaux (invariant 6)
  paste-plan/ fill-plan/                                       → changements
  clipboard-tsv/      {matrix}                                 → texte, et inversement
  csv/                {rows, columns, options}                 → texte
  selection/          {ops[]}                                  → état
  group-agg/ tree/                                             → arbre aplati
  layout-rows/ layout-cols/                                    → fenêtre visible, offsets
  keyboard-intent/    {key, dir, owner, mode, …}               → intention | null
  row-key/            {ids[]}                                  → clés et collisions
  format/             {locale, kind, value}                    → parties structurées
```
Format d'un cas (même schéma que DzCalendar) :

```json
{ "id": "gate-stale-page-response", "suite": "server-gate",
  "description": "La page 3 répond avant la page 2 : la page 2 est jetée",
  "refs": [],
  "input": { "steps": [
    { "op": "begin",   "channel": "page", "key": "q1|p2", "as": "t1" },
    { "op": "begin",   "channel": "page", "key": "q1|p3", "as": "t2" },
    { "op": "respond", "ticket": "t2", "rows": ["r30", "r31"] },
    { "op": "respond", "ticket": "t1", "rows": ["r20", "r21"] } ] },
  "expected": { "results": [
    { "step": 3, "applied": true },
    { "step": 4, "applied": false, "reason": "superseded" } ],
    "displayed": ["r30", "r31"] } }
```
```json
{ "id": "zone-day-bounds-algiers-plain", "suite": "zone-day-bounds",
  "description": "Africa/Algiers est à +01:00 toute l'année : le 5 mars commence à 23:00Z la veille",
  "input": { "day": "2026-03-05", "zone": "Africa/Algiers" },
  "expected": { "from": "2026-03-04T23:00:00Z", "to": "2026-03-05T23:00:00Z" } }
{ "id": "zone-day-bounds-saopaulo-midnight-skipped", "suite": "zone-day-bounds",
  "description": "Le 4 nov. 2018, minuit n'existe pas à São Paulo : le jour commence à 01:00 -02:00 et dure 23 h",
  "input": { "day": "2018-11-04", "zone": "America/Sao_Paulo" },
  "expected": { "from": "2018-11-04T03:00:00Z", "to": "2018-11-05T02:00:00Z" } }
{ "id": "keyboard-arrowright-rtl", "suite": "keyboard-intent",
  "description": "En RTL, la flèche droite va vers le début logique",
  "input": { "key": "ArrowRight", "dir": "rtl", "owner": "cell", "mode": "nav" },
  "expected": { "kind": "move", "axis": "col", "delta": -1 } }
```
Règles : valeurs en chaînes ISO ou nombres ; `refs` cite le rapport public de bug quand il y en a un (`AGG#…`), sinon le commit de ngx-sheetgrid ; les attentes sont **écrites à la main** depuis les règles publiques (IANA, RFC 4180, ARIA), jamais copiées de la sortie du code ; les cas de zone **reprennent ceux de `@dzcalendar/conformance` (notre code)**. Les cas des specs de ngx-sheetgrid (`cell-edits`, `cell-range`, `fill-handle`, `cell-value`, `date-value`) y sont portés après relecture.

### 5.2 Budgets de taille (gzip, minifié)

| Contenu | Budget |
|---|---|
| `@dzgrid/core` base (client, tri, filtres, sélection, colonnes, édition, CSV, formats) | ≤ 28 kB |
| Sous-chemins du cœur : `/grouping` 5, `/tree` 2, `/pivot` 6, `/server` 6, `/range` 6, `/advanced-filter` 5, `/xlsx` 6 | ≤ 36 kB en tout |
| `@dzgrid/dom` base (grille, en-têtes, épinglage, redimensionnement, clavier, pagination, superpositions) | ≤ 30 kB |
| Sous-chemins du DOM : `/editors` 8, `/filters` 10, `/menus+sidebar+statusbar` 9, `/detail+tree` 5 | ≤ 32 kB en tout |
| `@dzgrid/theme` (CSS) | ≤ 9 kB |
| `@dzgrid/angular` | ≤ 8 kB |
| Dictionnaire de messages (par langue) | ≤ 2 kB |
| **Profil « écran d'audit »** (cœur base + `/server` + DOM base + filtres + thème + Angular + une langue) | **≤ 85 kB** |
| **Tout, sans graphiques** | **≤ 150 kB** |

`scripts/size.mjs` mesure chaque sous-chemin et échoue au-delà de +5 %. Chaque paquet est `sideEffects: false`. L'ordre de grandeur de comparaison (≈ 330 kB gz pour ag-Grid) vient de la note de cadrage Sehhaty, non de nous.

### 5.3 Budgets de temps (Chrome récent, ordinateur portable de milieu de gamme, bundle **minifié**)

**Jeu A** : 100 000 lignes × 30 colonnes (10 texte, 8 nombres, 4 jours, 2 instants, 3 énumérations, 2 booléens, 1 identifiant) ; fenêtre 1 280 × 720 ; 25 lignes visibles, 12 colonnes visibles.
**Jeu B** : 3 000 lignes × 12 colonnes, édition en masse (pharmacie).
**Jeu C** : serveur simulé à 10⁷ lignes, latence 150 ms, total inconnu.

| Opération | Cible |
|---|---|
| Charger A dans le magasin (identités, index) | ≤ 80 ms ; ≤ 120 octets de surcoût par ligne, 0 par cellule |
| **Premier rendu A** (de `setRows` à la première image du corps, données déjà en mémoire) | **≤ 120 ms** |
| Noeuds DOM du corps après premier rendu | ≤ 1 000 |
| **Défilement continu A** (molette à 3 000 px/s, et glissement de l'ascenseur) | **≥ 58 fps médian**, image au 95ᵉ centile ≤ 25 ms, script ≤ 6 ms par image, ≤ 1 mise en page par image, images sans rangée ≤ 1 % |
| Défilement horizontal A (30 colonnes, 2 épinglées) | mêmes seuils |
| **Tri numérique / jour A** | **≤ 40 ms** |
| **Tri texte A** (Collator fr et ar) | **≤ 250 ms** |
| Tri à deux clés A | ≤ 120 ms (numérique) |
| **Filtre texte « contient » A** | **≤ 35 ms** ; nombre ≤ 10 ms ; à valeurs (set) ≤ 15 ms |
| Recherche rapide A (colonnes texte seules) | ≤ 150 ms **[À VÉRIFIER]** |
| Construction de l'index d'un filtre à valeurs sur A (une colonne) | ≤ 30 ms |
| Une transaction : modifier 1 ligne | cœur ≤ 1 ms ; DOM ≤ 4 ms ; 1 image ; ≤ 1 mise en page ; 0 appel de rendu sur les autres lignes |
| **Édition en masse B** : 3 000 lignes × 1 colonne | ≤ 30 ms jusqu'à l'affichage ; une seule requête de sauvegarde |
| Collage de 1 000 cellules (B) | ≤ 40 ms |
| Regroupement sur 2 colonnes + 3 agrégations (A) | ≤ 150 ms ; déployer un groupe de 10 000 lignes ≤ 30 ms |
| Export CSV A (30 colonnes) | ≤ 700 ms au total, aucune image > 50 ms |
| Changement de page serveur (C) | requête émise ≤ 1 image après le geste ; superposition « chargement » ≤ 100 ms après ; **0 réponse périmée appliquée** sur 1 000 permutations |
| Changement de direction à chaud | ≤ 100 ms, position de défilement conservée (distance depuis le début) |
| Surcoût mémoire A (hors données de l'hôte) | ≤ 25 Mo |
| Fuite : 1 000 cycles créer / détruire | ≤ 1 Mo retenus |
| Colonnes à gabarit Angular, 500 cellules visibles (spike S6) | ≤ 8 ms par image **[À VÉRIFIER]** |
| **Un million de lignes** (client, spike S1) | défilable ; premier rendu ≤ 1,2 s ; tri numérique ≤ 600 ms |

### 5.4 Stratégie de mesure

- `npm run bench` : benchmark Node sur un bundle **minifié** (esbuild), médiane de runs, `perf/budgets.json` (même mécanique que DzCalendar), sortie 1 si dépassement. Ne jamais mesurer du code non minifié.
- `npm run bench:browser` (`scripts/perf-browser.mjs`) : `playwright-core`, `channel:'chrome'`, protocole CDP : `Performance.getMetrics` (`LayoutCount`, `RecalcStyleCount`, `TaskDuration`), `PerformanceObserver` sur `long-animation-frame`, mesure d'images par `requestAnimationFrame`, tas par `HeapProfiler.collectGarbage` puis `Runtime.getHeapUsage` (l'API `measureUserAgentSpecificMemory` exige l'isolation inter-origine **[À VÉRIFIER]**). Charge `playground/perf.html` (jeux A, B, C), compare à `perf/baseline.json` (tolérance +25 %).
- Un profil de CPU ralenti 4× (CDP `Emulation.setCPUThrottlingRate`) pour approcher un poste bas de gamme : seuils élargis ×3, mais pas d'image > 100 ms.
- Les scripts sont lancés par le propriétaire ; `test:ci` ne contient que les tests déterministes.

---

## 6. Phases

Ordre : fondations de données → rendu en lecture seule → **serveur paginé et filtres (premier écran utilisable)** → édition → colonnes avancées → regroupement et détail → serveur avancé → export et menus → pivot → durcissement.

**Chaque phase se termine par** : une revue d'architecte contre ce document, une revue de code, les constats corrigés avant de déclarer la phase terminée, `ROADMAP.md` à jour, et les écarts consignés en tête de ce document. Les **fiches `docs/behaviors/*.md`** de la phase sont écrites **avant** le code, dans nos mots (CLEANROOM).

### Phase 0 : échafaudage et spikes
- **Livrables** : monorepo (workspaces, tsconfig stricts, vitest en projets, `scripts/build.mjs` copié, `contrast`/`size`/`bench` en squelette), `CLAUDE.md`, `ROADMAP.md`, `docs/behaviors/`, playground (Vite, **port 4700**), `core/{ids,problems,value/day,value/instant,zone}` (suffisant pour les spikes), `purity.test.ts`.
- **Spikes obligatoires** (chacun écrit dans `spikes/`, résultat noté dans `ROADMAP.md`, règle de décision incluse) :
  | # | Question | Règle de décision |
  |---|---|---|
  | **S1** | Un million de lignes en DOM recyclé : plafond de hauteur par navigateur, `ScrollMapper`, fluidité, mémoire | Si non défilable ≥ 58 fps : plafonner et imposer pagination / infini au-delà. **Pas de canvas.** |
  | **S2** | RTL avec colonnes épinglées en `position: sticky` dans un seul conteneur ; `scrollLeft` négatif (Chrome, Safari, Firefox) ; côté de l'ascenseur ; `scrollTo`/`scrollIntoView` ; poignées de redimensionnement ; `ScrollX` | Si le `sticky` en RTL échoue sur un navigateur ciblé : repli à trois conteneurs synchronisés. |
  | **S3** | Hauteur automatique : mesure à l'apparition, ligne d'ancrage, saut du défilement | Si instable : limiter à ≤ 10 000 lignes, estimer et corriger sans saut visible. |
  | **S4** | Accessibilité d'une grille virtualisée avec NVDA, JAWS, VoiceOver, TalkBack (arabe compris) : annonces, `aria-rowindex`, navigation par commandes de tableau, retenue de la rangée focalisée, treegrid, détail | Si un lecteur ne s'y retrouve pas : renforcer la région live et la rangée retenue ; documenter. |
  | **S5** | `Intl` : vitesse du `Collator` (100 000 lignes, fr et ar), chiffres de `ar-DZ`, `calendar:'gregory'` imposé, `formatToParts(number)` + `timeZone`, **`zoneDayBounds` contre 12 zones**, différences ICU entre navigateurs | Si trop lent : tri texte par clés précalculées par lots ou Web Worker (hors v1). |
  | **S6** | Coût des gabarits Angular dans des cellules virtualisées (500 vues visibles) | Si trop cher : pool de vues, rendus DOM conseillés pour les colonnes denses. |
  | **S7** | Presse-papiers : événements `copy`/`paste` et `clipboardData`, `text/html` d'Excel, Safari et Firefox | Choix du chemin de collage et des permissions. |
  | **S8** | XLSX maison : `CompressionStream('deflate-raw')`, CRC32, ouverture dans Excel, feuille `rightToLeft`, chaînes arabes | Si fragile : stockage sans compression. |
  | **S9** | Composition et défilement : `transform` ou `inset-block-start`, `contain`, `content-visibility`, coût du recyclage contre un rendu complet | Retient la variante la plus rapide. |
  | **S10** | Focus et édition contre recyclage : rangée retenue, ordre du DOM, retour du focus | Contrat de la rangée retenue (§3.7). |
- **Critères de sortie** : les dix questions ont une réponse chiffrée ; K.1 à K.9 sont tranchées ; `npm test` et `npm run typecheck` verts ; `npm run build` produit `dist/` ; `purity.test.ts` échoue sur un `new Date()` planté (vérifié).
- **Dépend de** : rien.

### Phase 1 : cœur de données
- **Livrables** : `core/{value/*,row/*,columns/*,sort,filter/*,model/client,layout/*,selection,i18n/format,problems}`, `conformance/` (harnais + suites `row-key`, `zone-day-bounds`, `day-arith`, `value-parse`, `sort`, `filter-*`, `quick-filter`, `displayed-order`, `layout-*`, `selection`, `format`). **Fiches** : tri, filtres texte / nombre / jour / instant, recherche rapide.
- **Critères de sortie** : A chargé ≤ 80 ms ; tri numérique ≤ 40 ms ; tri texte ≤ 250 ms ; filtre texte ≤ 35 ms ; test de types : un `number` n'est jamais accepté comme indice (invariant 1) ; `zoneDayBounds` correct sur les 12 zones ; `purity.test.ts` vert ; un cas de conformité par `ProblemCode` ; mémoire ≤ 120 octets par ligne.
- **Dépend de** : P0.

### Phase 2 : rendu en lecture seule, thème, RTL, accessibilité de base
- **Livrables** : `dom/{grid,settings,styles,messages,render/*,header,pinning,resize,pointer,keys,a11y,overlays}` (virtualisation lignes et colonnes, colonnes épinglées, redimensionnement, tri par clic, sélection de lignes, tooltips, superpositions chargement / aucune ligne / erreur), `theme/*` (`dzgrid.scss`, `contrast`, tailwind), `scripts/check-contrast.mjs`, messages `en`/`fr`/`ar`, `playground/index.html` (jeu A), `playground/rtl.html`. **Fiches** : défilement et recyclage, épinglage, redimensionnement, clavier de lecture, sélection de ligne.
- **Critères de sortie** : budgets premier rendu et défilement du jeu A **mesurés en Chrome** ; capture en LTR et RTL, clair et sombre ; alignement en-tête / corps ≤ 1 px ; ascenseur et épinglage corrects en RTL ; `aria-rowindex` exact après défilement (CDP) ; axe-core sans violation ; contraste ≥ 4,5:1 sur les six palettes de Sehhaty × clair / sombre ; garde-fous « aucun hex », « aucune chaîne en dur », « aucun `left`/`right` » verts ; focus conservé à travers `update()`.
- **Dépend de** : P1, S1, S2, S4, S9, S10.

### Phase 3 : serveur paginé, filtres, export CSV, Angular — **première phase utilisable pour `admin/audit-logs`**
- **Livrables** : `core/server/{gate,paged}`, `core/export/csv`, filtres et UI (`dom/filters` : menu de colonne minimal pour le filtre, filtres flottants, filtre à valeurs, filtre jour et instant avec l'adaptateur de sélecteur de date, recherche rapide), pagination (taille, suivant sans total), annonces live, `exportAll` ; **`@dzgrid/angular`** (`<dz-grid>`, contrôleur, fournisseurs, `fromObservable`, gabarits de cellule) ; `playground/index.html` (écran d'audit simulé à 10⁷ lignes) ; adaptateur optionnel `tzslot-picker`. **Fiches** : pagination serveur (total inconnu), filtres, ordre des requêtes, export CSV.
- **Critères de sortie (écran `admin/audit-logs`)** :
  1. sept colonnes et sept filtres serveur de l'écran actuel transposés ; tri ; pagination serveur avec **total inconnu** ; export CSV (BOM, séparateur, anti-injection) et rappel d'export serveur ;
  2. **suite `server-gate` verte** et un test navigateur qui permute 1 000 fois les réponses : aucune réponse périmée n'est appliquée ;
  3. filtres de jour et d'instant : les bornes envoyées sont `[from, to)` en UTC ; un filtre « le 5 mars » inclut 23:59 (cas de conformité) ;
  4. arabe relu par un lecteur d'arabe : filtre ouvert, tri, pagination, export ouvert dans Excel ;
  5. contraste sur les 12 combinaisons palette × thème ; palette commutée à chaud grille affichée ; un passage lecteur d'écran ;
  6. profil de taille ≤ 85 kB gz ; installation depuis les tarballs de `npm run pack:local` dans une **vraie application Angular 21** (`ng build`), comme tzslot ;
  7. la question honnête de la note Sehhaty : l'administrateur trouve-t-il cela mieux que la table précédente ? Mesurée en production avant de généraliser.
- **Dépend de** : P2, S5, S6. **C'est la première phase qui rend DzGrid utilisable pour `admin/audit-logs`.** Les annuaires (~11 000 lignes, côté client) sont aussi servis dès cette phase.

### Phase 4 : édition, plages, presse-papiers, édition en masse
- **Livrables** : `core/{edit/*,range/*,clipboard,undo}`, `dom/{editors,range,clipboard}` (éditeurs, validation accessible, sélection de plage, poignée de remplissage, copier / coller / couper, `Ctrl+D`/`Ctrl+R`, annuler / rétablir, états visuels de sauvegarde, édition en masse sur la sélection), suites `edit-saves`, `paste-plan`, `fill-plan`, `clipboard-tsv`. **Fiches** : édition, plages, remplissage, collage, annulation, sauvegardes concurrentes.
- **Critères de sortie** : tous les bugs 1 à 5 sont couverts par un test qui **échouait avant** (on rejoue les scénarios de a6c97f5) ; pharmacie (jeu B) : 3 000 lignes, édition en masse ≤ 30 ms, **une seule requête** ; collage de 1 000 cellules ≤ 40 ms ; `Ctrl+V`/`Ctrl+Z`/`Échap` dans un éditeur n'agissent pas sur la grille ; rollback ne touche jamais la source ; plage et poignée corrects en RTL ; clavier de plage complet.
- **Dépend de** : P3 (ou P2 pour un écran client). **Rend possible `pharma/stock`.**

### Phase 5 : colonnes avancées et confort
- **Livrables** : déplacement de colonnes (souris, clavier), groupes d'en-têtes, auto-taille, menu de colonne, panneau latéral (colonnes, filtres), `GridState` (sauvegarde et restauration), lignes épinglées haut / bas, fusion de lignes et de colonnes, hauteur automatique, lignes pleine largeur, densité, `preparePrint()`. **Fiches** correspondantes.
- **Critères de sortie** : mode « redimensionner » au clavier ; état restauré à l'identique en RTL ; hauteur auto sans saut (spike S3) ; fusion correcte sous tri.
- **Dépend de** : P2 (P4 pour les menus éditables).

### Phase 6 : regroupement, agrégation, arbre, master/detail
- **Livrables** : `core/{grouping,tree}`, `dom/{detail,tree,groups}` : regroupement multi-niveaux, pieds et total général, zone de glisser des colonnes de groupe, arbre (`treegrid`), master/detail avec grille imbriquée et état conservé, suites `group-agg`, `tree`.
- **Critères de sortie** : regroupement 2 colonnes + 3 agrégations sur A ≤ 150 ms ; expansion d'un groupe de 10 000 ≤ 30 ms ; `ArrowRight`/`ArrowLeft` inversés en RTL pour déplier ; détail non éditable et non collable (types) ; `aria-level`/`aria-expanded` corrects ; **rend possible `admin-lab-facilities`** et les historiques regroupés.
- **Dépend de** : P2, S4.

### Phase 7 : défilement infini, modèle côté serveur
- **Livrables** : `core/server/{infinite,server-side}`, cache de blocs, lignes de chargement, groupes paresseux, transactions asynchrones groupées.
- **Critères de sortie** : `server-gate` étendue aux blocs ; 10⁷ lignes défilables sans plus de N blocs en mémoire ; changement de tri ou de filtre purge les blocs ; accessibilité de lignes « chargement ».
- **Dépend de** : P3, P6.

### Phase 8 : export Excel, menus, barre d'état, filtre avancé, glisser de lignes
- **Livrables** : `core/xlsx`, `core/advanced-filter`, `dom/{menus,statusbar,advanced-filter}` : menu contextuel, barre d'état (totaux, agrégat de plage), recherche dans la grille, filtre multiple, glisser-déposer de lignes avec alternative clavier, surbrillance des changements.
- **Critères de sortie** : XLSX ouvert sans réparation dans Excel (clair et RTL, chaînes arabes) ; menu contextuel au clavier ; `prefers-reduced-motion` respecté.
- **Dépend de** : P4, P5, S7, S8.

### Phase 9 : pivot
- **Livrables** : `core/pivot`, colonnes secondaires générées, mode pivot UI. Éventuellement `rangeAsSeries` pour un graphique d'hôte.
- **Critères de sortie** : cas `pivot` ; budget de 150 ms pour 100 000 lignes, deux clés de pivot.
- **Dépend de** : P6.

### Phase 10 : durcissement et écosystème
- **Livrables** : passes de performance (profil 4× plus lent), accessibilité (ACR WCAG 2.2 AA en brouillon, protocole lecteurs d'écran complet), impression, documentation, `llms.txt`, wrapper de plus (React, Vue ou Web Component), benchmark public, `CHANGELOG`.
- **Dépend de** : toutes.

**Dépendances en un coup d'œil** : `P0 → P1 → P2 → P3 → P4 → P8` ; `P2 → P5` ; `P2 → P6 → P7` ; `P3 → P7` ; `P6 → P9` ; `P4,P5 → P8`.

**Première phase utilisable pour `admin/audit-logs` : la Phase 3.**
`pharma/stock` : Phase 4. `admin-lab-facilities` : Phase 6. L'écran `dmp-doctor-patients` (données patient) : en dernier, après P4, avec relecture de sécurité.

---

## 7. Risques et hors périmètre

### 7.1 Risques

| Risque | Gravité | Réponse |
|---|---|---|
| **Largeur du périmètre** : Community + Enterprise est un chantier de plusieurs produits | Haute | Ordre des phases pensé pour s'arrêter à P4 avec un produit cohérent (lecture, serveur, filtres, édition) ; fiches de comportement avant le code ; Enterprise rare cher (pivot, graphiques) repoussé. |
| **Accessibilité d'une grille virtualisée** : les lecteurs d'écran n'annoncent pas toujours bien un DOM partiel | Haute | Spike S4 dès la Phase 0 ; `aria-rowindex` exact ; rangée focalisée retenue ; région live ; protocole manuel en arabe. |
| **RTL : `sticky`, signe de `scrollLeft`, ascenseur** diffèrent selon le navigateur | Haute | Spike S2 ; module `dir.ts` unique ; tests Chrome en RTL ; repli à trois conteneurs prévu. |
| **ICU et `Intl`** : chiffres, grégorien, formats varient entre navigateurs | Moyenne | Étiquettes de langue complètes, parties structurées dans les tests, `calendar:'gregory'` explicite ; relecture arabe humaine. |
| **Vitesse du `Collator`** pour le tri texte sur 10⁵ lignes | Moyenne | Budget 250 ms ; clés précalculées ; Web Worker en réserve (étapes pures et sérialisables). |
| **Hauteur maximale d'un élément** : plafond de défilement | Moyenne | `ScrollMapper` ; plafonnement et pagination au-delà ; Sehhaty pagine. |
| **Gabarits Angular dans des cellules virtualisées** : coût de `detectChanges` | Moyenne | Pool de vues ; rendus DOM pour les colonnes denses ; spike S6. |
| **Fidélité du XLSX maison** | Moyenne | Spike S8 ; tests d'ouverture manuels ; repli sans compression. |
| **Presse-papiers entre navigateurs** | Moyenne | Spike S7 ; événements `copy`/`paste` plutôt que `navigator.clipboard`. |
| **Données de santé** : export, presse-papiers, journaux de console | Haute | `exportRequested` annulable ; aucune donnée de ligne dans `GridState` ni dans les `Problem` ; `canExport`/`canCopy` configurables ; avertissement si l'hôte active le presse-papiers sur une colonne marquée sensible. |
| **XSS dans les rendus** | Haute | Le rendu par défaut écrit par `textContent`. Un rendu HTML est une option explicite (`{ html }`) avec un point d'extension `sanitize` ; compatible Trusted Types ; CSP stricte par `injectStyles:false`. |
| **Contamination de la salle blanche** : un contributeur qui a lu le code d'une autre grille | Haute | `CLEANROOM.md` ; fiches de comportement avant le code ; tests citant les fiches ; revue d'architecte chargée de le vérifier ; ni code ni CSS de bibliothèque tierce dans le dépôt, y compris dans `node_modules` du playground. |
| **Un seul mainteneur** | Moyenne | Paquets petits, API minimale, documentation d'architecture à jour ; rien de magique. |
| **Hypothèses de ce document non vérifiées** | Moyenne | Chaque **[À VÉRIFIER]** est un spike ou une relecture ; aucune ne bloque K.1 à K.9. |
| **Réutilisation de modules de ngx-sheetgrid** : bugs hérités | Moyenne | Chaque module est relu et durci (§3.0) ; les cas de leurs specs deviennent des cas de conformité écrits à la main. |

### 7.2 Hors périmètre (v1)

- **Graphiques intégrés** (K.13) ; seulement `rangeAsSeries` plus tard.
- **Formules de tableur**, validation croisée de cellules à la tableur.
- **Moteur de rendu canvas**, Web Components (planifié plus tard), React / Vue (plus tard).
- **Modèle viewport** (K.5), **Web Workers** (réserve).
- **Traducteur d'options ag-Grid** (K.12) et migration automatique.
- **Récupération de données HTTP intégrée** : l'hôte fournit `fetch` et `save` (Promesses).
- **Rendu côté serveur** (SSR) de la grille ; l'hydratation n'est pas prévue.
- **Édition collaborative**, résolution de conflits entre utilisateurs.
- **Type décimal exact** (monnaie) ; seulement la somme compensée.
- **Calendriers autres que le grégorien** à l'affichage (forcé, décision d'origine).
- **Navigateurs anciens** (avant Chrome 123, Safari 17.5, Firefox 120) ; Internet Explorer.
- **Impression paginée avancée** (au-delà de `preparePrint()` et de la feuille d'impression).
- **Ports natifs** (Swift, Kotlin) ; la suite de conformité reste utilisable pour eux plus tard.

---

## 8. Arborescence de départ

```
dzgrid/
├─ ARCHITECTURE.md · CLAUDE.md · ROADMAP.md · CHANGELOG.md · README.md · CLEANROOM.md · LICENSE
├─ package.json                  workspaces: ["packages/*"] ; scripts ci-dessous
├─ tsconfig.spec.json · vitest.config.ts · vite.config.ts · size-budget.json
├─ perf/{budgets.json, baseline.json}
├─ docs/{behaviors/*.md, a11y-protocol.md}
├─ spikes/{s1-virtual-1m, s2-rtl-sticky, s3-autoheight, s4-a11y, s5-intl, s6-angular-cells, s7-clipboard, s8-xlsx, s9-compose, s10-focus}/
├─ scripts/
│  ├─ build.mjs                  copié de DzCalendar (tsc par paquet, ng-packagr, manifestes, garde « pas de src/ »)
│  ├─ size.mjs · perf-browser.mjs · check-contrast.mjs · conformance-gen.mjs · api.mjs
├─ conformance/                  README.md · schema/*.schema.json · cases/** · runner/runner.test.ts
├─ packages/
│  ├─ core/   (lib ES2023, sans DOM, sans dépendance)
│  │  ├─ src/
│  │  │  ├─ index.ts · ids.ts (RowKey, DisplayIndex) · problems.ts · kernel.ts · state.ts
│  │  │  ├─ value/     codec.ts · text.ts · number.ts · boolean.ts · enum.ts · day.ts · instant.ts · zone-day.ts
│  │  │  ├─ row/       store.ts · node.ts · displayed.ts · transaction.ts
│  │  │  ├─ columns/   defs.ts · model.ts · layout.ts · state.ts · autosize.ts
│  │  │  ├─ sort/      compile.ts · collate.ts
│  │  │  ├─ filter/    model.ts · compile.ts · text.ts · number.ts · day.ts · instant.ts · set.ts · quick.ts · option-label.ts
│  │  │  ├─ model/     query.ts · client.ts · pipeline.ts
│  │  │  ├─ selection/ rows.ts · range.ts · fill.ts
│  │  │  ├─ edit/      cell-edits.ts · coordinator.ts · undo.ts · validate.ts
│  │  │  ├─ clipboard/ tsv.ts · paste.ts
│  │  │  ├─ rules/     rules.ts
│  │  │  ├─ layout/    prefix-sums.ts · rows.ts · window.ts · scroll-mapper.ts
│  │  │  ├─ i18n/      messages.ts · format.ts · plural.ts · fold.ts
│  │  │  ├─ keys/      intent.ts · owners.ts
│  │  │  ├─ export/    csv.ts
│  │  │  ├─ enterprise/ grouping/ · tree/ · pivot/ · server/{gate,paged,infinite,server-side}.ts · advanced-filter/ · xlsx/
│  │  └─ test/         *.test.ts · purity.test.ts · types.test.ts · perf.test.ts · memory.test.ts
│  ├─ dom/
│  │  ├─ src/
│  │  │  ├─ index.ts · grid.ts · settings.ts · styles.ts · dir.ts · messages.ts · locales/{en,fr,ar}.ts
│  │  │  ├─ render/    viewport.ts · rows.ts · cells.ts · header.ts · pool.ts · scheduler.ts · measure.ts · overlays.ts
│  │  │  ├─ interact/  pointer.ts · resize.ts · move.ts · drag-rows.ts · autoscroll.ts · hit-test.ts
│  │  │  ├─ keys/      router.ts · owner.ts · focus.ts
│  │  │  ├─ a11y/      aria.ts · live-region.ts · announce.ts
│  │  │  ├─ popup/     popup.ts · anchor.ts
│  │  │  ├─ editors/   text.ts · number.ts · day.ts · select.ts · checkbox.ts · rich-select.ts · picker-adapter.ts
│  │  │  ├─ filters/   menu.ts · floating.ts · set-filter.ts · day-filter.ts · quick.ts
│  │  │  ├─ range/ · menus/ · sidebar/ · statusbar/ · detail/ · pagination/ · tzslot-picker/
│  │  └─ test/
│  ├─ theme/     dzgrid.scss · dzgrid.css (généré) · contrast.css · contrast-pairs.json · tailwind.css · tailwind3.css · test/
│  ├─ angular/   ng-package.json · src/{index,grid,controller,providers,templates,from-observable,shapes}.ts · test/
│  └─ conformance/
└─ playground/   index.html (Angular) · vanilla.html · rtl.html · perf.html · a11y.html · server.html
```

Scripts `package.json` : `test`, `test:ci` (1 worker), `test:watch`, `typecheck` (un `tsc` par paquet puis `tsconfig.spec.json`), `build`, `build:theme`, `check:contrast`, `check:size`, `bench`, `bench:browser`, `spike`, `start` (**Vite, port 4700**), `pack:local`, `publish:dry`, `docs:api`.
Dépendances de développement : mêmes outils que tzslot et DzCalendar (vitest, jsdom, plugin Angular, ng-packagr, sass, playwright-core, esbuild, axe-core). **Aucune dépendance d'exécution** pour `core`, `dom`, `theme` (K.10).
Config vitest : projets `core`, `conformance`, `theme` en `environment:'node'` ; `dom` en `jsdom` ; `angular` en `jsdom` avec le plugin Angular.

---

*Fin du document. Les décisions K.1 à K.14 sont à faire valider par le propriétaire avant toute ligne de code ; la Phase 0 ne doit commencer qu'après K.1 à K.9.*