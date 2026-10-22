# DzGrid : architecture complète

> Livrable destiné à `/Users/nadou/Dev/dzgrid/ARCHITECTURE.md`. Rédigé le 2026-10-16, avant toute ligne de code.
> **Aucune ligne d'ag-Grid, ni d'aucune autre bibliothèque de grille, n'a été lue.** Seuls comptent le comportement observable et la liste publique de fonctionnalités, conformément à `CLEANROOM.md`. Les niveaux « Community / Enterprise » du §2 viennent de ma connaissance générale de cette liste : ils sont à confirmer sur la documentation publique à jour **[À VÉRIFIER]**.
> Ce que je n'ai pas vérifié est marqué **[À VÉRIFIER]**.

## Décisions validées par le propriétaire (2026-10-16)

Le propriétaire a accepté toutes les recommandations du §1. Elles priment sur le reste du document quand il dit autre chose.

| Sujet | Décision |
|---|---|
| K.1 Licence | Tout en MIT pour l'instant ; le niveau « Enterprise » vit dans `src/enterprise/`, exposé par sous-chemins d'export, isolé par un test de graphe d'imports. |
| K.2 Dates | Pas de Temporal dans `core` ni dans la base de `dom` : `Day` (`YYYY-MM-DD`) et `InstantMs` distincts ; `zoneDayBounds` sur `Intl` ; aucun `Date` dans le cœur. Amendé à l'étape 14 (décisions Q1, Q4) : le contrôle de date des filtres est tzslot, Temporal seulement sous `dom/src/filters/dates/**`, derrière `import()`. |
| K.3 Virtualisation | DOM recyclé, lignes et colonnes, un seul conteneur de défilement ; jamais de canvas. S1 a confirmé : aucun plafond de lignes (voir les ajustements après la Phase 0). |
| K.4 Données | Lignes du consommateur jamais modifiées ; `getRowId` requis ; transactions `{add, update, remove}` ; modifications en surcouche. |
| K.5 Moteurs | `client` (P1) → `paged` serveur, total inconnu accepté (P3) → `infinite` et `serverSide` (P7) ; `viewport` hors v1 ; pas de worker en v1. |
| K.6 Priorité Enterprise | Plages/presse-papiers/remplissage/édition en masse → filtre à valeurs → master/detail → regroupement → arbre → Excel → menus → filtre avancé → pivot ; graphiques hors v1. |
| K.7 Cibles | Chrome/Edge 123, Safari 17.5, Firefox 120 ; Angular ^19 \|\| ^20 \|\| ^21 ; Node ≥ 22. |
| K.8 Budgets | Profil audit ≤ 85 kB gz ; tout sauf graphiques ≤ 150 kB gz ; 100 000 × 30 : premier rendu ≤ 120 ms, défilement ≥ 58 fps, tri numérique ≤ 40 ms, tri texte ≤ 250 ms, filtre texte ≤ 35 ms, ≤ 25 Mo. |
| K.9 Nommage | `DzGrid`, scope `@dzgrid` ; palette partagée `--tz-*`, propre à la grille `--dzg-*` / `.dzg-*` ; playground 4700. Le scope npm reste à réserver. |
| K.10 Dépendances | Aucune dépendance d'exécution dans `core`, `dom`, `theme` ; pas de RxJS. `@tzslot/dom` et `@tzslot/core` (`>=2.2.0 <3`) : pairs **optionnelles** de `@dzgrid/dom` et `@dzgrid/angular`, pour les filtres de dates (étape 14). `gsap` (`^3.13.0`) : pair **optionnel** de `@dzgrid/dom` pour `@dzgrid/dom/motion-gsap` (étape 26 ; licence de GSAP, pas MIT : voir « Décisions de l'étape 26 »). |
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
  - Lignes **recyclées dans l'ordre du DOM**, **`contain: strict`** sur chaque ligne (**remplacé par `contain: content`**, S11), **pas de `content-visibility`** (coûte 17 à 27 % dans Chrome), **jamais de reconstruction de la fenêtre** (2,4 à 3,5× plus lent, seule variante qui perd des images). ★ Position des lignes en **`inset-block-start`** (égalité de vitesse avec `translateY`, propriété logique, meilleure précision) ; cellules en `inset-inline-start`.
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

### Décisions de la Phase 1 (validées par le propriétaire le 2026-10-16)

Détail et raisons dans `docs/phase-1-plan.md` §0. Elles priment sur les sections citées.

- **D1** — Le magasin de lignes garde des tableaux parallèles (`rows[]`, `ids[]`, `Map<id, index>`) ; un `DataNode` est une vue créée à la demande ; `TransactionResult` porte des `RowKey[]`. Les nœuds se comparent par `key`, jamais par `===`.
- **D2** — Les filtres texte ignorent par défaut la casse, les accents et les marques arabes (harakat, tatwil, formes de l'alif) ; `caseSensitive: true` rend le filtre exact.
- **D3** — Les vides sont triés en dernier dans les deux sens ; à égalité, l'ordre source est gardé, en descendant aussi. `nulls: 'first'` l'inverse.
- **D4** — Les négations sont des compléments exacts : `notEqual` et `notContains` incluent les vides ; les comparaisons (`equals`, `lt`, `between`…) n'acceptent jamais un vide. Une cellule illisible compte comme vide, avec un avertissement.
- **D5** — Saisie sans devinette : `%` final (ou U+066A) divise par 100 ; un seul `.` ou `,` est lu selon la locale ; l'ordre jour/mois vient de la locale ; années à deux chiffres et noms de mois refusés.
- **D6** — `ColumnState` perd `sort`, `sortIndex`, `groupIndex`, `aggFunc` : le tri ne vit que dans `Query`. `Query` n'a que `sort`, `filter`, `quick` pour l'instant.
- **D7** — `ValueCodec` gagne `coerce` (valeur machine : JSON, ISO) à côté de `parse` (texte humain), et `keyKind`/`sortKey` requis. Tri et filtres prennent un indice source (`RowTest = (src: number) => boolean`), pas un `DataNode`.
- **D8** — Un instant **tapé** qui tombe dans un changement d'heure est refusé (`reject`) ; un instant **chargé** depuis l'hôte est lu en `compatible`, avec un avertissement.
- **D9** — Codecs dans `value/codecs/*.ts` ; pas de noyau en Phase 1 (§3.17 passe en Phase 2) ; `ChangeSource` et `ModelChange` définis dès maintenant.

### Décisions de la Phase 2 (validées par le propriétaire le 2026-10-16, détail dans `docs/phase-2-plan.md` §1)
- **D1** paquets `@dzgrid/dom` et `@dzgrid/theme` ; `createGrid` exige un dictionnaire, aucun anglais embarqué. **D2** noyau pur dans le cœur (`kernel.ts`) : tri, sélection, ancre, focus ; pas le défilement. **D3** réglages `rows` + `getRowId` + `columns`, la grille construit le modèle ; `update({ rows })` = diff par id. **D6** cellules du centre en ordre DOM, fenêtre glissante, cellule focalisée retenue. **D7** `FrameScheduler` lecture / calcul / écriture, `Map<RowKey, RowView>` + réserve, signature par cellule. **D8** sélection dans le noyau, « tout sélectionner » = lignes affichées après filtre, colonne de cases pseudo-colonne DOM, `aria-selected` fait foi. **D9** ~40 clés de messages, clés à points, pluriels. **D10** `--tz-*` + `--dzg-*` ; Sehhaty projette aussi fonds, texte et bordure sur `--tz-*` ; palettes recopiées à la main, correspondance à confirmer par le propriétaire. **D11** une bulle par grille (WCAG 1.4.13), superpositions hors de `role="grid"`. **D12** jsdom + Chrome sans fenêtre via `playwright-core`, un navigateur à la fois. **D13** préparation de la recherche en temps libre, livrée désactivée par défaut. **D14** problèmes `too-many-pinned` et `autoheight-scaled`.
- **D4** (tranché par S11, 346 vérifications dans les trois moteurs, après revue) : en mode mis à l'échelle, la rangée retenue est placée à sa **vraie distance** des rangées visibles (`offset − base`, bornée à ±2·REBASE), et le corps porte **`overflow: clip`** pour qu'elle n'agrandisse jamais la zone de défilement. L'« image physique » proposée par le plan est rejetée : près de la fenêtre, elle recouvre des rangées visibles ; un défilement natif dans les 100 ms qui suivent un `focusin` ou un `keydown` de la grille est refait logiquement (`ensureVisible`). Focus, texte et curseur d'un éditeur survivent.
- **D5** (tranché par S11) : touches de défilement interceptées aussi sur le viewport ; tactile en **correspondance relative** (delta natif appliqué 1:1 au décalage logique puis réécrit ; Chrome : 601 px pour 600, élan conservé) ; glisser de l'ascenseur en correspondance absolue.
- **Contre S9** : `contain: strict` (sa partie `size`) fait perdre aux segments épinglés leur `sticky` dans Firefox, en LTR comme en RTL. Les rangées prennent **`contain: content`** avec une `block-size` explicite (même gain mesuré par S9).

### Ajustements après la Phase 1 (revues d'architecte, de code et de tests ; détail dans ROADMAP.md)

Ils priment sur les sections citées.

- **§3.4 Valeurs** — `readInstant(v, { assumeZone, disambiguation })` remplace `parseInstant(v, { assumeZone })` comme lecteur complet (`parseInstant` garde la même option). `resolveWall` (noms de politique de Temporal) résout la seconde et reporte les millisecondes. `epochDayToDay` et `addDays` renvoient `null` hors 0000–9999 au lieu de lever ; `instantToDayIn` aussi. `ValueCodec` gagne `coerce`, `why`, `warning` (heure murale chargée dans un changement d'heure, D8) et un `sortKey` requis. Un instant numérique hors ±8,64e15 ms est refusé.
- **§3.4 Nombres** — `readNumber` refuse aussi un groupe après un zéro initial (`0,500`) et un nombre non nul qui sous-déborde à 0. Les caractères invisibles sont écrits `\uXXXX` dans le code ; un test refuse tout caractère invisible ou de contrôle bidi dans les sources du cœur.
- **§3.5 Pliage** — `fold` suit le plan : NFKD (formes de présentation, `ﻻ` → `لا`), `ى` lu `ي`, `ة` et `ه` distincts. Il plie caractère par caractère par une table construite au premier usage, tenue égale à la définition par chaîne (`foldSlow`).
- **§3.5 Cache de colonnes** — `ColumnCache` garde par colonne et par génération : clés numériques, rangs, textes, textes d'export, affichages pliés, textes « prêts à chercher » ; une mise à jour les corrige ligne par ligne, problèmes de cellule compris ; un accesseur d'hôte qui lève donne une cellule vide signalée (`read threw`).
- **§3.3 Colonnes** — tailles non finies ou négatives, côté physique (`left`), type inconnu, zone inconnue (`unknown-zone`) : refusés avec un problème, jamais une exception. Un `order` demandé gagne l'égalité avec une position par défaut ; une clé `undefined` dans un patch veut dire « inchangé ». Les largeurs flexibles se figent comme en CSS flexbox.
- **§3.6 Magasin** — un `replaceAll` des mêmes lignes dans le même ordre est une mise à jour (`changedSrc`) que les caches corrigent ; une clé de ligne forgée (préfixe de longueur faux) ne trouve rien.
- **§3.6 Moteur client** — étages filtre → tri → affichées, entrées structurées ; une mise à jour qui ne change ni l'appartenance au filtre ni une clé de tri garde l'ordre ; `setReader` ne réordonne rien avant `reapply()` (K.14).
- **Surface publique** — figée par `test/public-api.test.ts` ; les pièces internes (`ColumnCache`, `flatDisplayed`, outils de format pour les tests) passent dans `@dzgrid/core/internal`.
- **Revues de fin de Phase 1** (architecte et code) :
  - **Positions** : `SourceIndex` (marque distincte, interne) pour les positions dans le magasin ; `DisplayedRows.sourceOf` supprimé ; `RowSnapshot`, `RowStore`, `createRowStore`, `ColumnEnv`, `compileFilter`, `filterIndices`, `compileQuick`, `canNarrow`, `sortIndices` passent dans `@dzgrid/core/internal`. `ClientModel` n'expose plus son magasin mais `row(key)`. Une `DisplayIndex` n'est valable que pour la version qui l'a produite : le DOM tient des `RowKey` (§4).
  - **Colonnes** : `ColumnLookup.dataVersion` (définitions et colonnes visibles) distinct de `version` (mise en page) ; le moteur suit `dataVersion` et l'identité du modèle de colonnes.
  - **Moteur client** : `problems` porte ceux du dernier chargement ou de la dernière transaction ; les caches de recherche sont libérés quand la case est vidée ; `invalidate()` ignore `keepScroll` (affaire du DOM).
  - **Recherche** : chaque colonne est jointe en une seule chaîne (`Haystack`, séparateur U+0000, décalages `Uint32Array`) ; un mot = un balayage `indexOf`. Remplace §3.5 « pliage par cellule » et les listes par cellule. `fold` passe le grec, le hangul, les écritures indiennes et le reste par `foldSlow` ; les chiffres de toutes les écritures (`\p{Nd}`) sont lus.
  - **Bornes d'instant** (§3.5, format serveur) : `InstantRange = { from: number | null; to: number | null }`, toujours `[from, to)` ; *après* un instant commence 1 ms plus tard ; jamais `Infinity` (le JSON ne le porte pas).
  - **Sources** : aucun caractère invisible ni signe combinant tapé tel quel dans le code du cœur (test `source-chars`).
  - **Documents périmés, remplacés par ce qui précède** : §3.2 (`DataNode.id` est la chaîne canonique ; `keyAt` ajouté), §3.4 (`ValueCodec`, `instantCodec` fabrique, `formattersFor`), §3.5 (`sortIndices(items, within, env)` au lieu de `compileSort`, filtres `Day | string`, `setValues` en Phase 3, la phrase « NFD » de la recherche rapide), §3.6 (`Query`, `RowModel` sans `rangeNeeded` pour l'instant, `TransactionResult` en `RowKey[]`, `clientRows({ rows, getRowId, columns, ctx, reader? })`), §3.7 (`visibleWindow`, champs de `ScrollMapper`, `RowLayout.uniform`, ancre), §5.1.1 (suites ajoutées : `instant-parse`, `columns-layout`, `transaction`, `scroll-mapper`, `problems` ; `filter-set` vit dans `filter-combined`), §5.2 (le budget du cœur est la mesure + 10 %, 18,8 kB), §8 (arborescence regroupée : pas de `columns/layout.ts`, `row/transaction.ts`, `model/pipeline.ts`, `filter/{text,number,day,set}.ts`, `sort/collate.ts`). `@dzgrid/conformance` est pour l'instant le dossier racine `conformance/`.
- **Mesuré sur le jeu A (100 000 × 30, M4 Max, minifié)** — chargement 20 ms ; tri numérique 18 ms, jours 29 ms, texte fr 162 ms et ar 206 ms à froid, 17 ms à chaud ; filtre texte 29–33 ms à froid, < 2 ms à chaud ; mise à jour d'une ligne triée et filtrée 0,2 ms ; magasin 55 o/ligne, moteur au repos (tri + filtres) 107 o/ligne (K.8 : 25 Mo tenus), pendant une recherche 452 o/ligne ; cœur 17,8 kB gz. **Écart** : recherche rapide sur 10 colonnes de texte accentué et arabe ~0,3 s à la première frappe (150 ms tenus en ASCII, de justesse : 149 ms), puis ~5 ms par frappe.

### Ajustements après la Phase 2 (revues d'architecte et de code de fin de phase ; détail dans ROADMAP.md et `docs/phase-2-plan.md`)
- **§3.7 Virtualisation** : D4 tel que tranché par S11 (vraie distance bornée, `overflow: clip` sur le corps, correction dans les 100 ms d'un focus ou d'une touche) ; rangées en **`contain: content`** (jamais `strict`) ; **surbalayage** de 2 rangées au repos, davantage selon la vitesse (jusqu'à 40, un saut de plus de 3 vues ne compte pas), 1 colonne, recoupé 160 ms après l'arrêt ; **hauteur de rangée** réglage JS (`density` → 28/32/40 px), écrite en `--dzg-row-height` (une sortie, pas une entrée) ; en-tête d'une rangée de même hauteur. Signature de rangée `(clé, référence des données, époque)`, l'époque couvrant colonnes, langue, densité, case et direction. Cœur : `windowAt(logicalTop, physicalTop, …)` à côté de `visibleWindow` ; `overscanRows` prend `{ min, max }`.
- **§3.9** : **raffinement de S2** — une cellule tient son nœud texte directement, et ne reçoit un `span` d'isolement que si la valeur mélange les sens avec la grille (`render/bidi.ts` : arabe en LTR ; latin, chiffres ou ponctuation finale en RTL ; nombres en RTL seulement). Même rendu, 841 nœuds au lieu de 1 243 pour le jeu A. Messages : `GridMessages = { locale, text }`, 24 clés (7 servent en Phase 3), pluriels selon la langue du dictionnaire, nombres selon le contexte ; `checkMessages` refuse un dictionnaire incomplet. Colonne d'identité : la première visible. Grille `aria-readonly="true"`. Séparateur d'un nom accessible traduit (`header.withSort`).
- **§3.8 / D3 / D11** : `GridSettings` gagne `nonce`, `searchWarmup`, `overscan`, `tooltips.delayMs` ; `GridApi` = `focusCell`, `ensureVisible`, `refresh`, `announce` (`select` / `clearSelection` passent par `kernel.dispatch`) ; `GridEnv` (géométrie, `sync`, `maxPhysical`, `isOnScrollbar`, `raf`) est le port des tests ; port `Geometry` = `read()`, `writeScrollTop`, `writeScrollInline`. Bulle en `position: fixed`, **sans `popover`** pour l'instant (Phase 3). Case « tout sélectionner » en mode multiple seulement ; en mode simple la colonne garde un nom lu. `LAYOUT_CSS` et `injectStyles` exportés pour une CSP stricte.
- **§3.17 Noyau** : événements en file (un écouteur qui relance une commande ne fait pas entendre les événements dans le désordre) ; réconciliation avant `modelUpdated`, puis les événements `data` ; nouvel événement `columnsChanged` ; les problèmes de chargement, de transaction et de colonnes sont émis (`problems`) ; le rappel `onEvent` de l'hôte est isolé (son erreur est signalée par `reportError`). `cellClicked` et `firstDataRendered` restent à émettre (Phase 3).
- **§3.3** : `ColumnDef` gagne `headerTooltip` et `tooltip(value, row)` ; `too-many-pinned` (avertissement au-delà de 6 par côté, D14). `autoheight-scaled` reste réservé (pas de hauteur automatique avant la Phase 5).
- **§3.5** : `ClientModel.warmSearch()` (préparation par morceaux, abandonnée si les lignes, colonnes, langue ou lecteur changent) ; réglage `searchWarmup: 'idle' | 'off'`, désactivé par défaut ; les bottes de foin des nombres et des dates ne se construisent que pour un mot qui contient un chiffre, et un tel mot n'est pas affiné depuis sa forme sans chiffre.
- **§3.11** : `tailwind.css` (v4) et `contrast.css` (contraste renforcé, couleurs forcées) livrés ; `tailwind3.css` coupé ; pas de règles de densité en CSS ; `contrast-pairs.json` liste chaque paire, avec une table `derived`.
- **§5** : `npm run test:browser` (40 vérifications Chrome ; 61+ avec `--all`), `npm run bench:browser` (27 lignes, code minifié, sans fenêtre : indicatif), budgets de taille à la mesure + 10 % (dom 14 kB, cœur 22,3 kB) ; profil « grille client en lecture seule » 31,3 kB enregistré.
- **Non mesuré, à reprendre** : coût de D6 (cellules dans l'ordre du DOM contre une variante en place) ; contrôle AX rangée par rangée (`DOM.resolveNode`) ; axe dans Firefox et WebKit.

### Décisions de la Phase 3 (validées par le propriétaire le 2026-10-17 ; détail dans `docs/phase-3-plan.md` et `docs/phase-3-plugins.md`, inventaire dans `docs/inventory.md`)
- **Six notions publiques** : où se fait chaque opération (`operations` : filtre, recherche, tri, page, chacun `client` ou `server`) ; une source de données (`DataSource.fetch`, une fois) ; une pièce (`Part` : monter, mettre à jour, détruire) pour chaque emplacement (cellule, en-tête, filtre, filtre flottant, superposition, bulle, pied) ; des pièces par nom (`filter.day`, `floating.text`…, remplaçables globalement, par colonne, ou ajoutées) ; un genre de filtre (`FilterKind` : état sérialisable, test client, forme serveur) ; des modules par sous-chemin (`/filters`, `/pagination`, `/export`).
- **Une règle de combinaison** : pagination serveur ⇒ tout le reste serveur ; un réglage invalide donne `invalid-operations` et est lu « tout serveur ». **Mode mixte gardé en Phase 3** (le serveur filtre et trie, le navigateur pagine jusqu'à 100 000 lignes, avertissement au-delà).
- Pièces appelées par leur nom, colonnes en simples données ; un filtre sans test client exige le filtrage serveur ; filtres flottants désactivés par défaut, activés par colonne ; application pendant la frappe (300 ms côté serveur), bouton « Appliquer » pour les listes côté serveur ; formatage d'affichage pour ce qui est vu, cherché et en bulle, CSV en valeur brute sauf demande.
- Priorités : dates relatives, saut de page et panneaux latéraux en Phase 5 ; constructeur de règles ET/OU en Phase 8.
- Restent valables du premier plan : D2 (sélection à travers les pages, « tout » lié à la requête), D4 (filtres hors colonne : colonne cachée ou `params`), D6 (dates natives, tzslot optionnel), D7 (CSV pour Excel, `canExport`), D8 (Angular : autonome, signaux, `ngOnInit`).

#### Décisions de l'étape 1 (2026-10-17 ; fiches `docs/behaviors/{operations,server-pagination,request-order,server-selection,filter-ui,parts,csv-export}.md`)

Le code de l'étape 0, revu et testé, l'emporte sur les plans ; elles priment sur `docs/phase-3-plan.md` et corrigent `docs/phase-3-plugins.md`.

- **Réglage `operations` invalide** : lu refus par refus, comme `resolveOperations` — « serveur » seulement sous une pagination serveur ; un placement serveur sans source est lu « navigateur » (`page` serveur → `off`) ; une valeur inconnue garde le défaut. Remplace « lu tout serveur » ci-dessus. `operations` (fixe) et `source` (en direct) deviennent des réglages à l'étape 5.
- **Pagination serveur** : sans total, une page vide au-delà de la fin revient à la précédente (`hasNext` faux) ; au-delà de `maxRows` les lignes sont gardées, avec l'avertissement. Le noyau tient la page : `page.go`, `page.size`, événement `pageChanged {page}` (remplace `paginationChanged`).
- **Ordre des réponses** : canal `rows` ; `failure` = l'erreur de l'hôte telle quelle, l'événement `fetchFailed {error, key, page}` donne le contexte ; pas de superposition de chargement par-dessus des lignes (style périmé et `aria-busy`), seulement au premier chargement ; après un échec, la page demandée et les dernières lignes acceptées restent sous la superposition d'erreur.
- **Sélection serveur** : « tout » est lié aux filtres et à la recherche (plus tard `params` et le fuseau), jamais au tri ; compte = `counts.filtered − exclues` ; pas d'option `selection.selectAll` ; une sélection « tout sauf » de l'hôte est admise sur tout modèle. Corrige D2 (« lié à la requête »).
- **Interface des filtres** : `filter.floating` et `filters({ floating, datePicker })` ; bouton « Appliquer » dès que le filtre est côté serveur (lot récupéré compris), cases en attente perdues à la fermeture ; fenêtre modale nommée par `aria-label` (`filter.popupLabel`), qui reste ouverte sur un clic dehors ; focus d'abord sur `focus()` de la pièce, rendu à l'ancre (bouton, ou cellule d'en-tête après Alt+Flèche bas) ; nouvelles clés `filter.summarySelected`, `filter.summaryNone`, `header.withFilter`, `announce.filteredOpen`.
- **Pièces** : `update`, `destroy`, `focus` facultatifs ; `msg` accepte `app.*` (clé absente → la clé, avertissement `missing-message` une fois) ; contexte de cellule avec `focused` ; `update` seulement quand le contexte change ; un `destroy` qui lève est signalé ; propriétaire `cell-widget` déduit du contrôle, Entrée ou F2 appelle `focus()` ; nom d'un autre emplacement = `unknown-part` ; genre de filtre inconnu = `invalid-filter` ; résolution colonne → `settings.parts` → pièces d'un module → intégré.
- **CSV** : valeurs par défaut (`CsvOptions.text: 'value' | 'display'`, jamais `format`) ; `displayed` = ce qui est montré, `all` = tout ce que la requête trouve, jamais sans les filtres ; ce que le navigateur ne tient pas passe par `exportAll` (`all` et `selected` sous pagination serveur), sinon `failed` et `missing-feature` ; une seule `ExportRequest` pour `canExport` et `exportAll` ; colonnes visibles dans l'ordre de l'écran, ordre logique, garde sur tout champ non numérique, chiffres latins sans séparateur de milliers.
- **Étape 6 (2026-10-17, fiche `docs/behaviors/server-filter.md`)** : `toWire(filter, { ctx, columns, kinds? })` donne la forme envoyée (le modèle nettoyé, bornes d'instants résolues `YYYY-MM-DDTHH:mm:ss.sssZ` et zone, jours sans fuseau, filtres à moitié saisis retirés, filtres refusés retirés avec les codes du navigateur) ; la clé d'époque et de requête est faite de cette forme : une saisie incomplète ou refusée ne redemande rien.
- **Questions au propriétaire** : une rangée en réserve garde le dernier contexte de sa pièce (données de santé) ; ordre des colonnes attendu par un lecteur arabe dans Excel ; `canExport` obligatoire et contenu des événements d'export pour le journal d'audit de Sehhaty.

#### Décisions de l'étape 7 (2026-10-18 ; sélection à travers les pages, fiches `docs/behaviors/{server-selection,selection}.md`)

- **Appartenance** : « tout » est lié à `rows.membershipOf(query)`, que chaque modèle calcule (`RowModel.membershipOf`, `RowModel.scope`) : le navigateur lit les filtres qu'il applique (`compileFilter(...).applied` : saisie incomplète ou refusée = aucun filtre), la recherche par ses mots, le fuseau et, sous une recherche, les colonnes visibles ; un serveur lit le filtre sous sa forme envoyée (`toWire`, mise en cache), sa recherche, la partie navigateur, les `params` (et le fuseau). Jamais le tri ni la page. Une saisie incomplète ne change rien ; un changement de fuseau, de `params` (`setSource`) ou de colonne lue par la recherche efface « tout », après `modelUpdated`, motif `scope-changed`. `matchKey` disparaît.
- **`selection.allFiltered`** : toutes les lignes que filtres et recherche retiennent, sur toutes les pages — « tout sauf » lié dès que les lignes sont paginées (pages du navigateur, lot récupéré paginé, `selection.all` sous pagination serveur), l'ensemble affiché sinon ; rien de retenu efface. `selection.all` garde son sens (la page dans le navigateur, la requête sur un serveur). Une sélection « tout sauf » du navigateur retient aussi les lignes ajoutées plus tard qui correspondent (accepté, Q3).
- **Case d'en-tête** : `kernel.headerState` dit ce que son clic fait. Pages du serveur : la requête entière (« tout sauf » sans exclue → coché, compte 0 → décoché, sinon mixte ; inclusion : vide → décoché, autant de clés que `counts.filtered` **et** toutes les lignes affichées cochées → coché, sinon mixte) ; ailleurs, les lignes affichées comme avant. Clic : coché → `selection.clear`, sinon `selection.all` ; Ctrl+A → `selection.all`. Sur un « tout sauf » lié, `selection.all` resélectionne la requête (les décochées recochées), jamais la seule page. La case d'une page du navigateur qui remplace la sélection par la page (Q2) reste telle quelle, à revoir avec le pager (étape 17).
- **Événement et portée** : `selectionChanged` gagne `scope {params, zone}` et `reason` (`scope-changed` | `rows-dropped` | null) ; `kernel.selectionScope {query, params, zone}` suit le tri en vigueur (ce que lit une action groupée de l'hôte). Annonces DOM : la sélection de l'utilisateur (`announce.selected`, `announce.selectedAll` quand le total est inconnu), « tout » effacé (`announce.selectionCleared`), lignes perdues (`announce.selectionReduced`) ; une phrase identique n'est pas redite, sauf si la région live a dit autre chose entre-temps (`LiveRegion.said`, toute source). Compte d'un « tout sauf » : exact dans le navigateur et le lot récupéré (`RowModel.matches` : les exclues qui correspondent) ; `filtered − exclues` (≥ 0) sur les pages du serveur.
- **Lot récupéré** : seule une réponse acceptée remplace les lignes tenues ; un échec ou une purge ne retire aucune clé avant la réponse suivante ; les clés absentes de la nouvelle réponse sont retirées (`data`, `rows-dropped`), l'ancre avec sa ligne.
- **Décision du propriétaire, `selection.keepOnFilter`** (réglage DOM, en direct, vrai par défaut) : faux, tout changement du modèle de filtre ou du texte de recherche (utilisateur, hôte ou API) efface la sélection, quelle qu'elle soit, avant `modelUpdated`, motif `scope-changed`, annoncé ; un tri ou une page jamais. Porté par le noyau (`createKernel({ keepSelectionOnFilter })` et la commande `selection.keepOnFilter {keep}`), pour garder l'ordre des événements.

#### Décisions de l'étape 8 (2026-10-18 ; filtres personnalisés, fiche `docs/behaviors/filter-custom.md`)

- **`FilterKind`** (`filter/kind.ts`, types publics `FilterKind`, `AnyFilterKind`, et `Json`) : `name`, `types?`, `read`, `active`, `test?`, `wire?`. Registre `filterKindLookup` (`@dzgrid/core/internal`) lu une fois : nom vide, pointé ou réservé (`text`, `number`, `day`, `instant`, `boolean`, `set`, `custom`, `combined`) → `invalid-filter` détail `name` ; doublon → détail `duplicate`, le premier gagne. Réglage DOM `filterKinds` **fixe** ; `GridFeature.kinds` reporté.
- **Navigateur** : `compileFilter(model, env, kinds?)` reprend les contrôles, codes et détails du fil (`unknown kind`, `column type`, `invalid state`, `threw`) ; `read`, `active` et la fabrique de `test` sous un même `try` comme `toWire`. Un prédicat qui lève sur une ligne : ligne non retenue, `invalid-filter` `threw` dit une fois. La valeur testée vient de `ColumnCache.values` (valeur du codec, null pour un vide, à travers la surcouche d'édition) ; la ligne passée est la ligne de base.
- **`filter-needs-server`** (nouveau code, erreur, détail : le nom du genre) : levé par la compilation du navigateur seule, donc exactement quand un genre sans `test` rencontre un filtre placé dans le navigateur ; jamais sur le serveur ni pour un état incomplet. Les modèles client et `sourceRows` (partie navigateur) reçoivent les genres.
- **Dit une fois** : un changement de requête dont les problèmes de filtre diffèrent des précédents (code, chemin, détail) les porte dans `ModelChange.told`, d'où un seul événement `problems` du noyau ; le même refus redit ne l'est plus. `sourceRows` relaie le `told` de sa partie navigateur.
- **`ColumnCache.values`** : un tableau par colonne, paresseux, mémoïsé comme les exports (version, lecteur, langue), corrigé par une mise à jour de lignes (`#patchLists` écrit la valeur, plus le texte d'export, pour ce genre de liste). L'index des valeurs distinctes du filtre par liste est un autre cache, à l'étape 9.
- **Garde JSON du noyau** : `filter.set` et `filter.column` refusent un état personnalisé qui n'est pas du JSON (cycle, BigInt, fonction), y compris dans un filtre combiné (`invalid-filter`, détail `not json`), avant que `canonical` ne lise la requête ; le filtre en vigueur reste. `isJson` passe de `server/wire.ts` à `filter/model.ts`.
- **`ColumnDef.filter`** devient `false | { kind? }` (le genre dont la colonne montre l'interface ; autres options aux étapes 12-13). Pas de contrôle croisé avec le genre d'un filtre.

#### Décisions de l'étape 9 (2026-10-18 ; listes de valeurs, fiche `docs/behaviors/value-list.md`)

- **Règle du propriétaire** : « montrer une option qui ne remonte rien est faux ». La liste montre les valeurs présentes dans les lignes que gardent les **autres** filtres (et, dans le navigateur, la recherche rapide) ; une valeur à 0 n'est pas listée. Exception, dans le cœur : une valeur cochée dans le filtre `include` de la colonne et absente revient avec `count: 0` et `selected: true`, **en tête**, dans l'ordre de la liste `include`, jamais coupée par le plafond, soumise à une recherche non vide ; seules ces entrées portent `selected`.
- **API** : `kernel.values(column, { search?, max? })` → `ValuesHandle` (`status`, `result`, `available`, `failure`, `problems`, `search`, `refresh`, `subscribe`, `close`) ; pas une commande, pas de `modelUpdated`, pas de `fetchFailed`. `RowModel.setValues?` ; une liste par colonne (redemander ferme la première). Le noyau dit une fois les nouveaux problèmes d'une liste (`problems`, source `data`). Colonne inconnue ou non filtrable : liste fermée, `available: false`, `unknown-column` ou `invalid-filter` à `values.<col>`. Types publics `SetValue`, `ValueList`, `ValuesOptions`, `ValuesHandle`, constante `VALUES_MAX` (2 000) ; `max` invalide = défaut.
- **Navigateur** : `ColumnCache.distinct` à deux niveaux (index par colonne : textes d'export, ligne représentante, libellé, ordre de tri de la colonne avec départage par unités de code ; puis comptes sous une clé d'« autres filtres », puis le dernier résultat), invalidés par version des lignes, lecteur, langue/chiffres/zone, définition de colonne et collateur ; vidés par tout `patch` et `invalidateAll`. Les autres filtres sont compilés à neuf (le masque filtré peut être en retard sur le lecteur, K.14). Le modèle recalcule ses listes ouvertes après chaque changement et ne prévient que si le résultat change (identité stable).
- **Serveur** : quand le filtre est sur le serveur (pages serveur, lot récupéré filtré côté serveur), toujours `DataSource.values` par le canal `values:<col>`, jamais les lignes tenues ; sans `values`, `available: false`. Requête `{ column, search, limit, filter, quick?, params, zone, key, signal }` : `filter` est la forme envoyée **déjà calculée** moins la colonne (pas de `toWire` de plus). Après **chaque** changement du modèle (pas seulement une nouvelle époque), une liste ouverte redemande si sa requête diffère ou si la sienne en vol a été abandonnée par l'époque ; sinon elle garde sa réponse et met à jour les valeurs cochées absentes. Nouveau code `invalid-values-response` (erreur : pas une liste ; avertissements : entrée sans valeur texte, doublon, compte, libellé, trop d'entrées, `blanks`, `truncated` ; dix au plus puis un résumé). Libellé manquant = la valeur ; une valeur cochée absente est libellée par le codec.
- **Écarts au plan** : `FilterSlot.values()` (B2.1) devient un handle (une promesse ne s'annule pas et ne garde pas l'ancienne liste) ; B1.3 reçoit `ValuesRequest`/`ValuesResponse`.

#### Décisions de l'étape 9b (2026-10-18 ; fusions de cellules, fiche `docs/behaviors/spans.md`, plan `docs/phase-3-steps/step9b-spans-blueprint.md`, décisions du propriétaire `step9b-decisions.md`)

- **Avancé de la Phase 5 à la Phase 3** (décision du propriétaire, priorité haute) : les quatre genres, valeurs identiques fusionnées (`merge`), fusions décidées par la donnée (`rowSpan`, `colSpan`), en-têtes groupés (`ColumnGroupDef`), lignes pleine largeur (`settings.fullWidth`). Restent en Phase 5 : groupes repliables, lignes épinglées haut / bas.
- **Deux modules à part** : `@dzgrid/core/spans` (moteur pur, 3 500 o gz par-dessus le cœur) et `@dzgrid/dom/spans` (commit 3, 2 400 o) ; la base n'importe ni l'un ni l'autre (tests d'empaquetage et de pureté, comme `/server`). Une grille sans règle de fusion ne paie rien.
- **Points d'accroche (commit 1)** : `moveFocus` pur dans `packages/dom/src/keys/move.ts` (le cœur n'avait plus de place) avec un but (`Goal`) qui se vérifie lui-même ; `reconcileFocus(…, owner?)` et `setFocusOwner` (`@dzgrid/core/internal`) ; `RowPlan`/`RowSpans`/`SpanFeature` côté rendu ; niveaux d'en-tête signés (négatifs = rangées de groupes) ; les groupes sont aplatis en feuilles dans `resolveColumns`.
- **Moteur (commit 2)** : `buildSpanMap({ rows, columns, ctx, fullWidth?, text? }, prev?)` → `SpanMap` (`version`, `none`, `ownerAt`, `coveringAbove`, `inRow`, `fullWidth`, `problems`). Positions = indices d'affichage et indices de colonnes visibles (début, centre, fin) ; jamais la fenêtre ni le défilement. Mémoïsé par le `prev` passé (lignes et leur version, colonnes et leur version, règle pleine largeur, lecteur de texte, langue) : pas d'état caché. Placement dans l'ordre de lecture (ligne par ligne, du début à la fin) : la plus ancienne gagne, une fusion demandée par-dessus revient à une cellule (`span-overlap`) ; une fusion de valeurs ne rencontre jamais de case déjà prise (preuve : une case couverte plus bas l'est aussi à la ligne d'origine). Stockage creux : par colonne, les débuts des fusions qui la couvrent (triés, disjoints), recherche dichotomique.
- **`merge`** compare le texte d'export stable (`col.codec.toExport`, ou le lecteur `text` fourni par la grille, branché sur `ColumnCache.exports` et la surcouche d'édition) ; un vide ou une valeur illisible ne fusionne jamais, même avec une fonction ; `within` coupe là où une colonne citée change, et **un vide dans une colonne citée coupe aussi** ; une colonne citée peut être masquée, une inconnue est dite (`invalid-span`, détail l'id). Index des suites : `runEnds`, une passe, ≤ 25 ms pour un million de lignes (mesuré 4,5 ms).
- **`rowSpan` / `colSpan`** : appelés pour chaque ligne de la colonne qui n'est pas couverte (comme un tableau HTML), avec un `SpanCtx` réutilisé ; réponse non entière ou < 1, ou exception → 1 et `invalid-span` (`rows[i].<col>.rowSpan`, détail `not a whole number` / `threw`). `merge` avec `rowSpan`/`colSpan` sur une colonne : refusé, la colonne ne fusionne rien. 100 000 appels ≤ 20 ms (mesuré 7 ms).
- **Coupures (I3)** : une fusion reste dans son segment épinglé et dans une suite de lignes de données de même niveau ; une ligne pleine largeur, une ligne qui n'est pas de données, un changement de niveau, la fin des lignes affichées (la page) la coupent. Une fusion coupée est dite **une fois par colonne et par raison** (`span-clipped`, `columns.<col>`, détail `rows` / `segment`) tant que la disposition des colonnes ne change pas (le `prev` porte ce qui a été dit).
- **Ligne pleine largeur** : `ownerAt(r, c)` rend une cellule `{ row: r, col: 0, rows: 1, cols: n }` sur toute la largeur (seul cas qui traverse les segments) ; une règle qui lève : ligne ordinaire, `invalid-span` à `rows[i]`.
- **Problèmes** : cinq nouveaux codes, `invalid-span` (erreur), `span-overlap`, `span-clipped` (avertissements), `invalid-column-group` (erreur), `missing-feature` (avertissement) ; dix au plus par code et par colonne, puis un résumé (`rows.<col>`, `N more`). `missingFeatureProblems(tree, fullWidth)` dans `@dzgrid/core/internal` (un problème par genre, à sa première place) : la grille l'appellera au commit 3 quand aucune fonctionnalité ne fournit de `spans`.
- **En-têtes groupés** : `headerBands(tree, layout)` → `{ depth, levels, problems }` ; `levels[0]` est la rangée du haut (niveau −depth) ; un fragment `{ group, first, count, label }` par morceau contigu dans un segment ; libellé répété par fragment (O7), vide sans `header` (jamais deviné) ; profondeur prise sur tout l'arbre valide (le nombre de rangées ne bouge pas quand on masque une colonne). Groupe sans feuille, id dupliqué (d'un groupe **ou d'une colonne**) ou sans id : `invalid-column-group`, chemin dans l'arbre (`columns[1].children[0]`), ses feuilles restent comme hors groupe.
- **Clavier** : `navigate(map, { rows, cols, page }, from, goal, intent)` → `{ to, goal }` (positions ; `to.row = -1` : au-dessus de la première ligne), `land`, `ownerFocus(map, colonnes)` pour `setFocusOwner`. Sans carte, `navigate` donne exactement ce que donne `moveFocus` pour le corps (test différentiel) ; un mouvement qui finit sur la cellule de départ garde le but (bord, Gauche/Droite dans une ligne pleine largeur). `moveFocus` n'est pas encore branché sur `navigate` : il reste au commit 3 (budget dom de base : 54 o de marge).
- **Écarts au plan** : l'exemple `merge-follows-sort` du plan était incohérent (`colSpan` sur la 3ᵉ colonne ne peut pas commencer en colonne 0 ; `merge` + `colSpan` sur `ward` est refusé) : recalculé avec `colSpan` sur `name` (2 colonnes) et un ordre d'affichage qui rapproche les deux `A`.
- **En-têtes groupés à l'écran (commit 4)** : dans `@dzgrid/dom/spans` (`src/spans/bands.ts`), par la couture du commit 1 (`FeatureHandle.bands`) ; l'arbre est lu dans `settings.columns`. Une cellule de groupe est un `columnheader` (`aria-colindex` de sa première colonne, `aria-colspan`), coupée par segment avec son nom répété (O7), dessinée depuis sa première colonne même hors de la fenêtre de colonnes ; sa position de focus est sa première colonne. Un groupe sans `header` montre son id (comme une colonne).
- **Une en-tête par colonne dans chaque rangée de groupes** : à côté de la cellule du groupe, une en-tête cachée (`.dzg-hslot`) répète son nom dans chacune de ses autres colonnes montées, et le nom de la colonne là où aucun groupe ne se trouve. Raison : Chrome ignore `aria-colspan` dans son modèle de tableau et VoiceOver associe en-têtes et cellules par position (S12, variante `hfill=repeat`, la seule juste ; vérifié sur la grille par `scripts/browser.mjs`). Le test à l'oreille (protocole, §7) dira si la répétition s'entend trop.
- **Colonne avec moins de groupes : étirée en CSS**, pas de cellule vide visible : l'en-tête de colonne porte `data-up` et `--dzg-up` (niveaux vides × hauteur de ligne), monte et grandit ; peinte après les rangées de groupes, elle les couvre. Pas d'`aria-rowspan` (elle vit dans la dernière rangée d'en-tête).
- **L'en-tête devient une colonne de rangées** (`flex-direction: column`, CSS de la fonctionnalité) : avec le seul `display: flex` de la base, plusieurs rangées d'en-tête se plaçaient côte à côte dans un vrai navigateur. La rangée de filtres flottants (étape à venir) devra porter cette règle dans la base.
- **Nombre de rangées de groupes fixé à la création** (la base fabrique les rangées une fois) : des définitions plus tard avec moins de niveaux laissent des rangées vides (en-têtes étirées), avec plus de niveaux ne montrent que les niveaux extérieurs ; une grille créée sans groupe n'en montre jamais. Limite documentée (fiche `spans.md`).
- **Clavier des groupes** : dans le `move` de la fonctionnalité, avant celui du corps ; Haut vers le niveau le plus proche qui a un groupe sur la colonne, Bas vers la colonne visée (le but, gardé tant qu'il est sous le groupe focalisé), Gauche / Droite de groupe en groupe, Début / Fin ; touches de page et bords Ctrl rendus à la base comme depuis l'en-tête de la colonne visée.
- **Budget** : `@dzgrid/dom/spans` 4 500 o gz pendant la Phase 3 (O8 ter ; 4 174 mesurés). Le nom collant d'un groupe pendant le défilement latéral (plan A.3) est abandonné pour tenir.

#### Décisions de l'étape 10 (2026-10-19 ; export CSV dans le cœur, fiche `docs/behaviors/csv-export.md`, plan `docs/phase-3-steps/step10-csv-blueprint.md`, décisions `step10-decisions.md`)

- **Module à part** `@dzgrid/core/csv` (1 564 o gz par-dessus le cœur, budget 2 500) : `toCsv`, `csvChunks` (générateur de morceaux d'environ 500 lignes, BOM et en-tête dans le premier, rend un `CsvSummary` de comptes seulement), `csvRows`, `csvColumns`, `csvSeparatorFor` ; types `CsvOptions`, `CsvInput`, `CsvSummary`, `CsvScope`, `ExportRequest`. Pur, tourne dans Node ; la base ne l'importe pas (tests d'empaquetage et de pureté) ; il ne nomme que les *types* de `/server` et `/spans`.
- **Seul ajout à la base** : `ClientModel.allRows` (toutes les lignes que la requête retient, toutes pages, ordre de l'écran ; les lignes affichées sans pagination ; mémorisé jusqu'au prochain affichage) et `RowModel.allRows?` ; un lot récupéré délègue au modèle interne, les pages serveur n'en ont pas (`csvRows` rend `null` : `exportAll` à l'étape 19). Cœur 25 995 o gz (budget 26 100). Type `ColumnDef.csv?: 'text'`.
- **`selected`** (Q2) : les lignes sélectionnées que la requête montre, dans l'ordre de l'écran, parcours O(n) de `allRows` ; une ligne cachée par un filtre n'est pas écrite.
- **Garde des formules** (Q3) : tabulation, CR ou LF en tête, ou `= + - @` après espaces, espaces insécables et marques de direction (U+200E, U+200F, U+061C) ; jamais sur un nombre typé (codec `number` et valeur numérique), en valeur comme en affichage ; en-têtes et libellés compris.
- **`csv: 'text'`** (Q4) : une valeur faite seulement de chiffres 0–9 s'écrit `="0123"` (puis les guillemets RFC 4180) ; toute autre valeur de la colonne est écrite et gardée normalement.
- **Heure murale** : décalage lu par tranche de six heures quand il est le même aux deux bouts (sinon à la seconde) ; les millisecondes tombent ; hors des années 0000–9999 : valeur illisible.
- **Écarts au plan** : `csvRows` prend `Pick<RowModel, 'displayed' | 'allRows'>` et non `ClientModel`, pour accepter un lot récupéré ; le guillemet SYLK porte sur le premier champ du fichier (en-tête, ou première ligne sans en-tête) ; NaN est un vide, l'infini une valeur illisible ; un id de colonne inconnu est sauté et dit par `csvColumns` (`unknown-column`, avertissement, `csv.columns[i]`) ; aucune colonne, aucune ligne.
- **Mesures** : `csv 100 000 x 30 (toCsv)` 421 ms (budget 1 000).

#### Décisions de l'étape 11 (2026-10-19 ; en-tête, voile et bulle d'aide remplaçables, fiches `docs/behaviors/{overlays,tooltips,parts,filter-ui}.md`, plan `docs/phase-3-steps/step11-slots-blueprint.md`, décisions `step11-decisions.md`)

- **Module à part** `@dzgrid/dom/slots` (`slots()`, 1 279 o gz, budget 1 300) : les pièces `header`, `overlay` et `tooltip` remplacent le texte de la grille ; la base garde ses versions intégrées, sans machinerie de pièces (O1). Le module n'importe aucune valeur de la base (garde) : il passe par le contexte de la grille.
- **Bouton « Réessayer » dans la base** (O3) : un vrai `button`, clé obligatoire `grid.retry` (O2), voile d'erreur seulement ; `rows.refresh` au nom de l'utilisateur, focus rendu à la grille, « Chargement » annoncé. dom 18 383 o gz (budget 18 600).
- **Coutures** : `FeatureHandle.slots` (`header(col, label)`, `overlay(state)`, `tooltip(tip)`, chacune dit si une pièce a dessiné), `GridContext.partBase` (`msg` et `announce` stables), `HeaderPaint.content`, `Tooltip` avec un rappel de remplissage.
- **En-tête** : la pièce dessine le libellé seulement ; la grille garde rôle, `aria-sort`, marque de tri, poignée, clic (O4). Bouton et marque de filtre : décorations (étape 13).
- **Bulle d'aide** : seulement si l'hôte donne un texte ; montée à l'affichage, détruite au masquage (O5). **Voile** : `phase`, `failure`, `retry()`, `clearFilters()` (O6).
- **Sans `slots()`** : `missing-feature` (avertissement, `parts.<nom>`, détail `slots`), une fois à la création.
- **Écarts au plan** : `overlay(state)` lit l'échec lui-même ; la bulle reçoit un `TipFor` au lieu d'un texte ; une pièce d'en-tête qui quitte la fenêtre est détruite par `afterRows` (pas de nouvelle couture) ; `retry` recopié dans le module (base plus petite) ; `GridEnv` réexporté par `index.ts` (grid.ts reste sous 250 lignes).

#### Décisions de l'étape 12 (2026-10-19 ; ligne de filtres sous les en-têtes, fiches `docs/behaviors/{filter-ui,parts,filter-number,filter-custom}.md`, plan `docs/phase-3-steps/step12-floating-blueprint.md`, décisions `step12-decisions.md`)

- **Module à part** `@dzgrid/dom/filters` (`filters({ floating, debounceMs })`, 3 488 o gz, budget 3 500 après O5 ; l'estimation de 2 500 était basse). Il n'importe de valeurs que du cœur, de son dossier et de `src/mounted.ts` (garde).
- **Textes à part** (O1) : `locales/{en,fr,ar}-filters` (198 / 222 / 275 o gz), ajoutés par l'hôte à ses messages ; clés de filtre optionnelles dans `GridMessages`, `filters()` lève une `TypeError` qui nomme celles qui manquent.
- **Ligne fixée à la création** (O3) : présente si l'option de la grille ou une colonne (même cachée) la demande ; cellule vide pour une colonne sans filtre flottant. La boîte texte édite « contient », la boîte nombre « égal » ; tout autre filtre montre « Filtre actif » et un bouton Effacer nommé avec la colonne (O4).
- **Base** (dom 18 669 o gz, budget 18 750) : `GridFeature.parts` et `g.parts()` (pièces des fonctionnalités sous `settings.parts`, même objet tant que `settings.parts` ne change pas), lu par les cellules, `slots` et la ligne de filtres ; `missing-feature` par emplacement (détail `slots`, `filters` ou `pagination`) et pour une colonne qui demande un filtre sans `filters()` ; l'en-tête empile ses rangées (`flex-direction: column` passe de SPANS_CSS à la base). grid.ts reste à 249 lignes.
- **Clavier** : `Entrée`/`F2` sur la cellule entre dans la pièce, `Échap` y revient en gardant le filtre, gérés par le module sur la cellule (aucun changement du cœur ni de la conformité) ; un seul arrêt de tabulation (contrôles à `tabindex=-1` hors de la cellule active).
- **Pause** tenue par le module : une modification en attente par colonne (150 ms navigateur, 300 serveur, puis `filter.debounceMs`, puis `filters({ debounceMs })`), appliquée par `Entrée`, `Échap`, la sortie de la cellule, la sortie de la fenêtre ; abandonnée à la destruction. Le « tout effacer » du voile devient un seul `query.set` (une requête).
- **Écarts au plan** : `Mounted` devient une fermeture `mounted(g)` (les champs privés d'une classe ne se minifient pas ; slots 1 279 → 1 238) avec `focus()` ; un nombre illisible est jugé par la boîte elle-même à la fin de la pause (son minuteur), qui renvoie le filtre en vigueur pour annuler une saisie valide en attente ; une pause invalide sur la colonne passe à celle de `filters()` avant le défaut ; texte anglais `announce.filteredOpen` raccourci (« Filtered. Count unknown ») pour tenir 200 o.

#### Décisions de l'étape 13 (2026-10-19 ; fenêtre de filtre, fiches `docs/behaviors/{filter-ui,parts,filter-text,filter-number,filter-custom}.md`, plan `docs/phase-3-steps/step13-popup-blueprint.md`, décisions `step13-decisions.md`)

- **Mesure** : `@dzgrid/dom/filters` 6 146 o gz mesuré par-dessus `@dzgrid/dom/popup` (budget 7 000, O1 ; le module importe désormais `src/popup.ts`, permis par la garde, jamais par la base) ; textes des filtres en 421 / fr 476 / ar 537 (22 clés de plus) ; thème 1 503 ; base 18 687 (+18).
- **Base** : `FeatureHandle.decorateHeader(col, cell)` appelé par la peinture après la décoration de l'en-tête de la base (niveau 0 seulement) ; type `filter` de `SlotContext` ; `floating` gagne `canOpen` et `openFilter()` ; type du cœur `filter.ops`. grid.ts inchangé.
- **Alt+Flèche bas** (O2) : géré par le module sur l'en-tête (cellule d'en-tête ou cellule de la ligne flottante elle-même), comme Entrée/F2 à l'étape 12 ; **pas** d'intention `openMenu` dans le cœur, conformité inchangée. Amende §7.2 et `phase-3-plan.md` (étape 10 du plan).
- **Fenêtre** : une par grille, dialogue modal de l'hôte des fenêtres, nommé `filter.popupLabel {column}` ; ouvreurs : bouton de l'en-tête (`tabindex=-1`, `aria-haspopup="dialog"`, `aria-expanded`), Alt+Flèche bas, le résumé de la ligne flottante (devenu bouton), `openFilter(column)` sur l'objet du module (O6). Un second clic sur le bouton ferme ; un autre ouvreur remplace ; un clic dehors ne ferme pas (O7). Fermée quand l'ancre quitte la page ou la colonne la fenêtre de colonnes, quand la pièce change, quand le sens change, à la destruction (O9) ; le focus revient à l'ancre, sinon à la grille.
- **Appliquer** (O3) : dans le navigateur, le texte part après la pause, un choix aussitôt, Appliquer et Entrée appliquent et ferment, Échap garde ce qui attend ; sur un serveur, un brouillon, rien n'est envoyé avant Appliquer ou Entrée, fermer sans Appliquer l'abandonne. Une seule modification en attente par colonne, partagée avec la boîte flottante (la dernière gagne) ; ouvrir applique celle de la boîte.
- **Marque** : `data-dzg-filtered` et `header.withFilter` après `header.withSort` ; le thème remplit l'entonnoir (forme, pas seulement couleur).
- **Écarts au plan** : un en-tête qui porte un bouton garde son propre nom en `aria-label` (sinon le nom du bouton s'ajoute à celui de l'en-tête) ; `openFilter` ancre sur le bouton de l'en-tête (Alt+Flèche bas sur la cellule) ; une colonne qui quitte la fenêtre ferme la fenêtre même si la grille garde l'en-tête focalisé monté (D6), focus sur l'ancre ; Maj+Tab depuis un bouton radio revient sur Appliquer (un groupe radio est un seul arrêt, le piège de l'hôte ne le voyait pas) ; le bouton se place après la marque de tri par `order` (jamais déplacé dans le DOM : il peut avoir le focus) et l'étiquette de l'en-tête cède la place avec des points de suspension (CSS du module) ; Appliquer envoie le brouillon sans le comparer au filtre en vigueur (le noyau garde un filtre égal tel quel, mutant équivalent) ; `size.mjs` mesurait déjà juste un module DOM `over` avec ses externes (pas de correction).

#### Décisions de l'étape 26 (2026-10-20 ; les animations avec GSAP, `ui.cellClass`, le crochet de l'hôte ; fiches `docs/behaviors/{motion,cell-class}.md`, plan `docs/phase-3-steps/step26-motion-blueprint.md`, décisions `step26-decisions.md` et `motion-decisions.md`)

- **Entrée** `@dzgrid/dom/motion-gsap` : `motion({ preset, effects: { flip, enter, flash, page, popup }, gsap, onCell, onRow })`, une fonctionnalité ordinaire. Une coquille immédiate (586 o gz, budget 800 : options, chargeur, `load()`, `loaded`) et un morceau paresseux `motion-gsap/run/` (2 369 o gz par-dessus la coquille, budget 3 700) chargé en temps libre après les premières lignes peintes (Q1) ; GSAP vient de l'application (`gsap`) ou d'un `import('gsap')` dans le morceau. Un `motion()` sert plusieurs grilles.
- **Base** (dom 19 360 o gz, budget 19 450) : `FeatureHandle.beforeRows()` appelé une fois par peinture avant que la couche et les lignes bougent ; `settings.motion` (vivant) et `data-motion="off"` sur la racine ; `ui.cellClass(ctx)` dans `rows.ts` (après `cellValue`, avant les pièces ; seulement aux reliures, jetons comparés, jetons `dzg-` ignorés, une erreur signalée et ses classes retirées). Cœur : des types seulement (`CellClassContext`).
- **Armement** par le modèle (`rows.subscribe`, qui porte la transaction) : `order`/`query` → glissement et entrées, `page` → glissement de page, transaction `delta` → éclat (Q3 : jamais au rechargement). Un armement dont la peinture ne change pas les lignes est oublié (mode synchrone des tests).
- **Aucune lecture de mise en page** : l'ancienne place est le `top` que la grille a écrit (et le `y` d'une animation en cours), lue dans `beforeRows` ; l'ancienne page est celle de la peinture précédente. Transform et opacité seulement ; à la fin on retire exactement `transform,opacity,--dzg-flash` (jamais `clearProps: 'all'`).
- **Garde des lignes recyclées** : chaque élément animé est suivi avec sa ligne (et sa colonne) ; à chaque `afterRows`, un élément montré pour une autre ligne est terminé (`progress(1)`, les animations de l'hôte aussi) et nettoyé.
- **Plafonds** : glissement sauté au-delà de 60 lignes, d'un écran pour une ligne, après un défilement entre le changement et la peinture, à moins de 150 ms de la précédente (frappe) ; entrées : au plus 20 (au-delà la fenêtre est neuve et s'affiche simplement ; écart au plan, mesuré : 250 entrées donnaient une image longue de 89 ms) ; éclat : au plus 50 cellules, une par cellule toutes les 500 ms, rien à moins de 150 ms d'un défilement ; crochets : 50 appels par peinture.
- **Fenêtres et voile** (Q2) : un observateur sur la racine ; le contenu de la fenêtre s'anime (fondu + 4 px), pas la fenêtre elle-même (GSAP sort de la page et y remet un élément sans parent de décalage, ce qui fermerait un popover et lui ôterait le focus) ; une fenêtre n'est animée qu'une fois ; fermeture immédiate ; le voile en fondu, `hidden` reste la vérité.
- **Mouvement réduit** : `gsap.matchMedia` créé à la première question, « réduit » jusqu'à la réponse ; un changement termine ce qui joue ; seule une marque fixe de 0,6 s (`delayedCall`) et le crochet `changed` (`reduced: true`).
- **Thème** (2 046 o gz, budget 2 350) : `.dzg-cell.dzg-flash`, teinte `--dzg-flash-color` à 18 % × `--dzg-flash` et une marque de 3 px au début de la cellule (bordure logique, la marge intérieure rend sa largeur : le texte ne bouge pas), hors de toute requête de mouvement (la marque fixe vaut aussi en mouvement réduit) ; `Highlight` en couleurs forcées ; cinq paires de contraste ; la transition des lignes passe sous `:not([data-motion=off])`.
- **Écarts au plan** : GSAP absent → `missing-feature` (`features.motion`, détail `gsap`) plutôt qu'un nouveau code `missing-peer` (le cœur et la conformité inchangés) ; `column` des contextes = l'id de la colonne ; un effet `popup` en plus des quatre ; le morceau est mesuré avec `./run/*` externe aussi (sinon la coquille l'emporterait et l'écart serait nul).
- **Angular** : aucun changement du wrapper ; l'exemple importe l'entrée après la création de la grille, hors de la zone (`motionLater`), et un test zone.js compte 0 tour de zone pendant un éclat.
- **Licence de GSAP** : GSAP n'est pas sous MIT ni open source au sens OSI ; il est sous la « Standard License » de GSAP (Webflow) : gratuit, usage commercial compris ; interdits notamment de s'en servir dans un outil visuel d'animation sans code concurrent de Webflow et de le désosser pour en faire un concurrent ; les mentions restent ; Webflow peut résilier en cas de manquement. Rien n'y vise une grille de données. DzGrid reste MIT : GSAP est un pair optionnel (`gsap ^3.13.0`), aucun octet de GSAP n'est livré. Ce n'est pas un avis juridique ; **avant toute publication, demander confirmation au contact de GSAP** et noter la réponse ici (même question ouverte que K.10 de DzCalendar).

#### Décisions de l'étape 23 (2026-10-20 ; l'exemple Angular ; fiche `docs/behaviors/angular-example.md`, plan `docs/phase-3-steps/step23-example-blueprint.md`, décisions `step23-decisions.md`)

- **L'exemple** (`examples/angular-audit`, Q1) : hors des espaces de travail, ses propres dépendances (non suivies), installé depuis les archives `packed/` (copies, pas de liens), construit par `@angular/build:application` sur Angular 21 ; lancé à part (`npm run example:build`, puis `ng serve` dans son dossier). Trois constructions d'une même coquille : `default` (sans zone), `zone` (zone.js), `baseline` (un simple tableau, sans DzGrid).
- **Serveur** : `renderApplication` sur la construction serveur de l'exemple ; l'hôte `<dz-grid>` seul, aucune ligne, aucun noyau, aucun minuteur laissé ouvert ; pas d'hydratation demandée.
- **Écarts au plan** : la sortie serveur d'`@angular/build` 21 exige `@angular/ssr` (et donc `@angular/router`) : ajoutés aux dépendances de l'exemple, jamais importés côté navigateur ; la page du navigateur s'appelle `index.csr.html` quand la construction a un serveur ; `npm install` de l'exemple demande `legacy-peer-deps` (même plantage de npm 10 qu'à la racine) ; Angular 19.2 prend déjà le `BootstrapContext` du serveur (rétroporté) : seul le passage sans zone change (`provideExperimentalZonelessChangeDetection`) ; Angular 22 demande Node ≥ 22.22.3 (essai fait avec Node 24.21).
- **Octets (K.8)** : la part DzGrid du premier chargement vient de la vraie construction (fichiers initiaux de la page, gzip 9, construction `default` moins `baseline`) : 82 014 o (budget 85 000) ; Angular et la coquille seuls : 38 654 ; l'enveloppe ≈ 3 327 (estimée par les statistiques de construction). `check:size` reste la garde : le profil esbuild (`perf/profiles/audit.ts`) nomme maintenant les valeurs de `@dzgrid/angular` que l'exemple importe, mesurées sur le fesm2022 livré, Angular et rxjs à part : 75 623 (avant : 70 532). L'écart avec la vraie construction (+6 391) : les textes français et arabes tous deux chargés par l'exemple, et le découpage d'Angular.
- **CSV arabe** : l'échantillon est écrit par le vrai export de `@dzgrid/dom/export` (jsdom, sans Angular) dans `examples/angular-audit/out/audit-ar.csv` (non suivi) pour l'essai Excel du propriétaire.

#### Décisions de l'étape 22 (2026-10-20 ; `@dzgrid/angular` ; fiche `docs/behaviors/angular-parts.md`, plan `docs/phase-3-steps/step22-angular-blueprint.md`, décisions `step22-decisions.md`)

- **`<dz-grid>`** : les réglages de `createGrid` en entrées ; seules celles dont l'identité change partent dans `update()` ; les réglages figés changés plus tard sont refusés par la grille (`unsupported-live-change`). `messages` vient de l'entrée ou de `provideDzGrid` (sinon une erreur claire). Une entrée laissée à `undefined` prend la valeur de `provideDzGrid({ defaults })`. Hôte en `display: contents` (CSSOM). Grille créée dans `ngAfterContentInit` (les gabarits `dzgPart` sont connus dès le premier dessin), hors de la zone ; sorties émises dans la zone ; rien sur un serveur.
- **Modèles** `[(quick)]`, `[(filter)]`, `[(selected)]` (pas `selection`, déjà pris par le réglage) : écrits comme l'hôte, seulement s'ils diffèrent de l'état de la grille (sinon une saisie en attente serait perdue) ; ce que l'utilisateur change revient dans le modèle.
- **Pièces Angular** (Q1, Q2) : `componentPart(slot, Composant)` et `<ng-template dzgPart>` sont des marques que `<dz-grid>` relie à elle-même (une fois par marque, mémorisées) ; une entrée `cell` pour tous les emplacements ; vue rattachée à l'application, vérifiée seule à chaque reliaison (S6) ; `emit` lit la ligne affichée au moment de l'appel ; `cellAction` / `partAction` sont des types seuls dans le cœur. Ordre : fonctionnalités < `provideDzGrid` < `[parts]` < gabarits ; `part-shadowed` une fois par nom, le détail nomme la couche cachée.
- **Écarts au plan** : pas d'entrée `onEvent` (`(gridEvent)` la remplace) ; `fromObservable` n'importe pas rxjs (forme `subscribe` seule, l'abandon désabonne) ; un jeton `DZG_ENV` (géométrie des tests) ; les champs privés `#` cassent la détection des entrées du compilateur Angular dans l'outillage Analog : champs `private` dans le composant.
- **Tailles** (Q4) : `@dzgrid/angular` 5 283 o gz (budget 5 500, sortie fesm2022 de ng-packagr, Angular, `@dzgrid/*`, tzslot et rxjs à part) ; cœur 26 986 (27 100 : le code `part-shadowed`) ; base inchangée (19 200).

#### Décisions de l'étape 21 (2026-10-20 ; règles de sélection, contexte de l'application, en-tête qui filtre ; fiches `docs/behaviors/{selection-rules,selection,server-selection,parts,pagination-footer,filter-ui}.md`, plan `docs/phase-3-steps/step21-rules-blueprint.md`, décisions `step21-decisions.md`)

- **Règle** `settings.selection.canSelect(ligne, sélection, contexte)` : `true` permet, `false` refuse, une chaîne refuse et se dit telle quelle. Seuls les ajouts sont jugés (décocher toujours permis), dans l'ordre de l'écran, contre ce qui est déjà accepté. Une commande dont tous les ajouts sont refusés ne change rien. L'ancre ne bouge que vers une ligne acceptée.
- **Cœur** : une porte (`setSelectionGate`, `@dzgrid/core/internal`) que toutes les commandes de sélection traversent ; `selectionRefused` après `selectionChanged`. Sous une règle, « tout » prend les lignes affichées (pages serveur aussi, Q1) ; « tout ce qui correspond » (sauf) est refusé (`needs-rows`) ; une clé d'une ligne absente est refusée (`unknown-row`). Le tri et le cache sont dans `@dzgrid/core/rules` (`vetSelection`, `ruleGate`).
- **DOM** `rules()` : case grisée (`data-dzg-refused`, pointillés, « interdit »), jamais `aria-disabled` sur la ligne (Q2) ; refus dit à chaque essai ; refus de l'hôte dit en problème `selection-refused`. Fermé par défaut : une règle sans `rules()` est une erreur et la sélection passe à `none`.
- **Contexte** `settings.context` (en direct) : dans toutes les pièces, la règle, `canExport`/`exportAll`, la bulle d'aide ; une nouvelle identité met à jour une fois. Pas encore les filtres ni le tri (Phase 4, Q3).
- **En-tête qui filtre** : le contexte `header` reçoit `filter` (même modification en attente que la ligne de filtres et la fenêtre), un objet par colonne tant qu'il ne change pas. Clavier partagé avec la ligne de filtres (`cellKeys`) : un arrêt de tabulation, Entrée ou F2 pour entrer (Entrée trie si la pièce ne prend pas le focus), Échap pour sortir. Pièce prête facultative `header.filterBox` (elle tient dans le budget des filtres).
- **Tailles** (décision du propriétaire) : cœur 26 937 (27 100), base 19 200 (19 300), interne 786 (800), slots 1 246 (1 450), `core/rules` 476 (700), `dom/rules` 654 (800), textes 148 / 166 / 192 (150 / 170 / 200), filtres 9 102 (9 300).

#### Décisions de l'étape 20 (2026-10-20 ; pièces de cellule prêtes ; fiche `docs/behaviors/badge-boolean.md`, plan `docs/phase-3-steps/step20-parts-blueprint.md`, décisions `step20-decisions.md`)

- **Module à part** `@dzgrid/dom/parts` : des pièces seulement, pas de fonctionnalité, pas de style injecté, rien d'interne. `badge({ tones?, fallback? })` (par nom, via `ui.cell`) et `cellBoolean` (enregistré `'cell.boolean'` : toutes les colonnes oui/non), `PARTS_KEYS`. Les deux partagent un dessin (`parts/draw.ts`) : mêmes éléments à chaque réaffectation, rien d'écrit si rien ne change, la boîte retirée pour une valeur vide.
- **Badge** (Q1) : libellé = le texte de la cellule ; ton = `tones[String(valeur)]` (clés propres seulement : `constructor` n'est pas un ton), sinon `fallback`, sinon `neutral`. Cinq tons, une forme chacun sauf neutre (✓ ! ✕ i), cachée aux lecteurs d'écran ; le ton n'est jamais dit. **Oui/non** (Q2) : « ✓ Oui » / « ✗ Non » visibles, sans couleur ; vide : rien.
- **Textes** `cell.yes`, `cell.no` dans leurs lots `locales/{en,fr,ar}-parts`. Leurs types (`PartsMessageKey`, `PartsMessages`) sont dans un fichier de types à part (`part-texts.ts`) : déclarés dans `messages.ts`, ils changeaient les noms courts choisis par esbuild (+2 o gz sur la base, code identique) ; à part, la base est la même octet pour octet.
- **Thème** : dixième couleur `--tz-success` (vert, `#15803d` / `#4ade80` ; Tailwind green-700 / green-400 ; contraste renforcé `#14532d` / `#86efac`). Cadre et forme dans le ton, surface = le ton à 12 % dans le fond, libellé dans la couleur du texte. 20 paires de contraste (4 par ton), toutes passées à 12 % (pas besoin de 8 %). Couleurs forcées : cadre dans la couleur du texte, et le badge reprend les couleurs du système même dans une ligne sélectionnée (qui s'en retire).
- **`cellClass`** reste à l'étape 26 (Q3). Exemple 2 (filtre « entre deux nombres ») : un montage de test seulement, qui passe sans rien changer à la grille.
- **Tailles** : parts 583 o gz (600), textes 98 / 99 / 108 (130 / 140 / 160), thème 1 911 (2 050) ; base 19 048 et cœur 26 756 inchangés.

#### Décisions de l'étape 19 (2026-10-20 ; export CSV ; fiche `docs/behaviors/csv-export.md`, plan `docs/phase-3-steps/step19-export-blueprint.md`, décisions `step19-decisions.md`)

- **Module à part** `@dzgrid/dom/export` : `csvExport(options)`, une fonctionnalité par grille (une deuxième grille vivante : `TypeError`). Partie immédiate petite (chargeur, état occupé, boutons liés) ; le reste dans un morceau paresseux `export/run/`, chargé au premier export, au survol ou au focus du bouton. Pas de bouton à nous : celui de l'hôte, `bind(button, { scope })` (`aria-busy`, jamais `disabled`).
- **`canExport` obligatoire** (Q1) : `true` explicite, ou une fonction ; seul `true` autorise ; `false`, `{ ok: false, reason }`, une exception ou un rejet refusent (fermé par défaut). Refus : rien ne se télécharge, la grille dit « Export non autorisé » ou la raison de l'hôte.
- **Trace sans données** (Q2) : `exportRequested`, puis `exportRefused` ou `exportFinished` (id, heure UTC, portée, colonnes, requête avec la recherche, compte, taille, nom, issue ; sélection en mode + nombre ; une erreur par son nom seul). Jamais une valeur de cellule ni une clé de ligne (test sentinelle, permutations). Types ajoutés à `GridEvent` par leur forme (`ExportScope`, `ExportServerPart`, `ExportTrace`) : la base du cœur ne peut pas nommer un type de csv ou de server ; 0 octet.
- **Pages serveur** : `all` et `selected` vont à `exportAll` de l'hôte ; la partie serveur de la requête est refaite dans le morceau (`splitQuery` + `toWire` importé à la demande), égale à ce que la grille demande au serveur sans la page : pas de changement de la base. URL acceptées : http, https, blob.
- **Navigateur** : au plus 10⁷ cellules (Q4), vérifié avant `canExport` ; tranches de ~16 ms rendues par un message (pas `scheduler.yield()` : images de ~110 ms dans Chrome), texte en Blobs de ~4 Mo ; 100 000 × 30 en ~0,4 s sans image de plus de 50 ms. Lignes attendues si elles chargent (30 s), annulation, grille détruite = silence.
- **Nom de fichier** : `export-AAAA-MM-JJ-HHmm.csv` dans le fuseau d'affichage, chiffres latins, nettoyé (`safeFileName`), arabe gardé. **Annonces** : « Export en cours… » après 1 s seulement, la fin toujours ; le nombre dit avec `announce.rows` de la langue de base (pluriels arabes compris). Textes `locales/{en,fr,ar}-export` (8 clés).
- **Tailles** : export 1 088 o gz (1 200), morceau 4 349 au-dessus du cœur (5 100), textes 216 / 248 / 296 (220 / 250 / 380), K.8 69 555 (85 000) ; base et cœur inchangés.

#### Décisions de l'étape 18 (2026-10-20 ; écran d'audit, permutations, profil K.8 ; fiches `docs/behaviors/{audit-screen,filter-ui,request-order,server-pagination,sort,quick-search-box,filter-set}.md`, plan `docs/phase-3-steps/step18-audit-blueprint.md`, décisions `step18-decisions.md`)

- **L'écran d'audit** (exemple 3 de B2, inventé, le nôtre ; celui de Sehhaty vient à l'étape 24) : `perf/audit-screen.ts` (sept colonnes, `mountAudit`, sans CSS), partagé par le bac à sable `playground/audit.html` (lien « Écran d'audit »), la page Chrome `packages/dom/test/browser/audit.html` et jsdom. Deux réglages d'un même `DataSource` : A `{ filter, quick, sort: 'server', page: 'client' }` (jeu chargé, 20 000 lignes dans le navigateur), B `'server'` (pages par décalage, 10⁷ lignes, total inconnu sauf une graine sur cinq) ; en B seul `occurredAt` se trie (`sortable: false` ailleurs). Booléens traduits par `booleanCodecWith`.
- **Le faux serveur** `perf/fake-server.ts` : la ligne *i* calculée depuis *i* (temps décroissant de 37 s, acteur `i mod 97`, action `(i·7) mod 12`, ressource parmi 2 000, une vide sur 101) ; lit la forme `toWire` (texte, nombre, jour, instant résolu, booléen, liste, combiné), la recherche (acteur, action, ressource, pliées), le tri par arithmétique ; une requête filtrée ne regarde que les `scanCap` plus récents (200 000 ; 20 000 dans Chrome) ; `values` avec comptes ; modes `timers` (latence, gigue graine, taux d'échec, `failNext`) et `hold` (`release`/`fail` par numéro) ; respecte le signal (rejette avec sa raison) sauf `honourSignal: false` (réponses tardives) ; journal de chaque requête.
- **Permutations** `perf/permutation.ts` : une graine donne 8 à 14 gestes (pagineur, taille, tri, filtre flottant tapé, fenêtre « Durée », liste de valeurs ouverte/cochée/appliquée ou abandonnée — Échap ou clic dehors —, recherche tapée avec ou sans pauses, effacer tout, rafraîchir, Réessayer, tout sélectionner), les mêmes pour A et B, et un ordre de réponses (fifo, lifo, hasard, rafales) avec ~8 % d'échecs. L'oracle lit les gestes, jamais la grille. Invariants I1–I7 après chaque réponse et au repos (lignes jamais périmées, réponse courante affichée, signaux annulés, compteurs de la garde = journal du serveur, `aria-busy` et `data-stale` exacts, phrases avec le nombre de la réponse appliquée seulement, pied cohérent, champ de recherche jamais réécrit par une réponse, focus gardé, une requête par pause, A ne demande rien pour une page). I7 : même requête au repos, mêmes lignes quand la page est la même (A feuillette l'ancien jeu pendant qu'un nouveau charge, puis repart page 1 : documenté).
- **Niveau 1** (jsdom, horloge simulée) : 1 000 graines par configuration en ~107 s sur un processus, au-dessus de la règle des ~90 s → `npm run test:perm`, dans la porte de commit ; `test:ci` en joue 25. **Niveau 2** (Chrome, `npm run test:audit`) : les mêmes scripts sans frappe par de vrais événements DOM sur une horloge de la page (1 000 par configuration avec `--full`), puis 30 avec frappe au clavier Playwright et vraies minuteries ; une image au repos.
- **K.8** (Q1) : ligne `profile: audit screen (K.8)` en mode découpé (`scripts/size-split.mjs`, garde contre `dist/` et `node_modules/@dzgrid/`, entrée dans deux morceaux) : premier chargement 66 958 o gz (JS 65 175 en 4 fichiers + CSS 1 783), budget 85 000 ; à côté, paresseux : liste 3 666, adaptateurs de dates 449 / 1 107 / 682, morceau tzslot partagé 66 486 (la première fenêtre de date télécharge ~67 kB).
- **Q4 : clic dehors** : toute fenêtre de l'hôte de popups se ferme sur un appui hors d'elle et de son ancre (révise O7) ; comme Échap (le filtre tapé gardé dans le navigateur, le brouillon serveur abandonné) ; le focus va où l'appui le met, et revient à l'ancre seulement s'il tombe sur rien (au tour suivant de la boucle). Un panneau tzslot est dans la fenêtre : il ne la ferme pas. popup 1 460 o gz (1 500).
- **Défauts trouvés par les permutations** (tests d'abord) : la phrase du tri attend la réponse sur un serveur et dit le nombre de lignes triées (`counts.filtered`), pas la page, ni rien si inconnu (dom 19 052) ; un effacement qui touche filtres et recherche ne dit qu'une phrase, celle des filtres (recherche 1 298) ; un jeu chargé repart page 1 quand la requête change puis revient à l'ancienne (revient sur la lecture de l'étape 5 partie 3 « changé puis rétabli = même jeu » : **à confirmer par le propriétaire**) ; la ligne d'état de la liste de valeurs garde une ligne de haut vide (la liste ne descend plus de 32 px ; liste 3 788).
- **Captures** : 12 de référence suivies dans `docs/screenshots/step18/` (écrites seulement avec `--update-shots`) ; `packages/dom/test/browser/results/` n'est plus suivi (`.gitignore`, `git rm --cached`).

#### Décisions de l'étape 17 (2026-10-20 ; pagination ; fiches `docs/behaviors/{pagination-footer,server-pagination,selection,server-selection,parts}.md`, plan `docs/phase-3-steps/step17-pagination-blueprint.md`, décisions `step17-decisions.md`)

- **Module à part** `@dzgrid/dom/pagination` : `pagination({ footer })`, un pied sous les lignes (hors `role="grid"`), trois pièces de l'emplacement `footer` : `footer.selected`, `footer.count`, `footer.pager` (dans un `<nav>` nommé `pager.label`, gardé autour d'une pièce de l'hôte). Textes à part (`locales/{en,fr,ar}-pagination`, 16 clés, `PAGINATION_KEYS`). Dormant (`invalid-page`) sur des lignes non paginées ; pages sans `pagination()` : `missing-feature` (`settings.pagination`).
- **`@dzgrid/dom/internal`** : `mounted`, `settled` (la phrase dite une fois les lignes arrivées : filtres, recherche, page), `composing`, partagés par slots, filtres, recherche et pagination, importés par leur nom (auto-référence du paquet, vérifiée : Node, esbuild, Vite et tsc la résolvent en un seul module ; externe dans chaque ligne de taille). La base ne l'importe jamais.
- **Case d'en-tête sur pages du navigateur** (Q1 du propriétaire) : cocher ajoute la page (`selection.allDisplayed` devient une union quand les lignes sont paginées), décocher une page toute cochée n'enlève que la page (`selection.set`, une annonce) ; Ctrl+A suit. Sur une sélection « tout » (sauf-exclues), cocher recoche tout comme avant ; pages serveur inchangées.
- **Total inconnu** (Q2) : « 51 à 100 », « Page 3 », pas de bouton « dernière » par curseur (présent mais jamais actif par décalage).
- **Pas de seconde région vivante** : le décompte est du texte ; `announce.page` passe par celle de la grille, une fois, après la réponse sur un serveur, seulement pour un geste de l'utilisateur dans le pied. Boutons `aria-disabled` (jamais `disabled`), mêmes nœuds à chaque mise à jour. Retour en haut sur `modelUpdated` de genre `page`. Le voile s'arrête au-dessus du pied (`--dzg-footer-size`).
- **Tailles** : pagination 3 108 o gz (3 800), internal 505 (650), base dom 18 935 (19 100), textes 328 / 375 / 489, thème 1 783 (2 050) ; slots 994, filtres 8 919, recherche 1 228 (leur code commun sorti) ; cœur 26 756 (union +~40).
- **Écarts au plan** : un nom de `footer` qui n'est pas une pièce `footer` est dit (`unknown-part`, `pagination.footer[i]`) ; « Effacer la sélection » remet aussi le focus dans la grille (la bande se cache) ; « (certaines non affichées) » suit la règle du plan (nombre > lignes cochées de la page), donc aussi après « Tout sélectionner » ; le compte du pied suit `selectionChanged` et redemande un rendu (il est entendu après celui de la grille) ; l'hôte d'une pièce dont le seul enfant est caché ne prend pas de place.

#### Décisions de l'étape 16 (2026-10-19 ; recherche rapide ; fiches `docs/behaviors/{quick-search-box,quick-filter,filter-ui}.md`, plan `docs/phase-3-steps/step16-search-blueprint.md`, décisions `step16-decisions.md`)

- **Le champ de la page** (Q1) : la grille ne dessine aucun champ ; `quickSearch()` est une fonctionnalité (elle reçoit le contexte : textes, portée, focus, ce que `GridInstance` ne donne pas) et `search.bind(input, { debounceMs })` lie un ou plusieurs champs de l'hôte ; pas de `bindQuickSearch`.
- **Module à part** (Q2) `@dzgrid/dom/search` : 1 093 o gz (budget 1 100), sans les filtres ni aucune valeur de la base (garde de structure) ; base dom 18 743 (18 900) pour `GridContext.warm` (`{ want, warm }` : la préparation tourne aussi tant qu'un champ lié l'a demandée) ; grid.ts à lignes constantes.
- **Comportement** : pause 150 / 300 ms ; texte rogné aux bouts ; Entrée applique (sans envoyer le formulaire), Échap vide un champ rempli (arrêté là) et laisse passer sur un champ vide, quitter applique l'édition en attente, Flèche bas va dans la grille ; rien pendant une composition (`isComposing || keyCode === 229`, aussi dans les cases de filtre).
- **La grille gagne** : chaque champ garde le texte qu'il a envoyé ; toute autre recherche le réécrit et annule son attente, sauf pendant une composition ; à la liaison, le texte de la grille gagne, sinon un champ restauré s'applique sans annonce (`api`).
- **Annonce** (Q3) : `announce.rows` après une recherche de l'utilisateur, au retour du serveur sur un serveur, rien en cas d'échec ou de nombre inconnu ; aucune clé nouvelle ; surlignage des mots en Phase 5.
- **Attributs** posés seulement s'ils manquent et rendus au délier : `aria-controls` (même racine seulement ; un id `dzg-N` sur notre élément `grid` s'il n'en a pas), `dir=auto`, `autocomplete=off`, `enterkeyhint=search`, `spellcheck=false` ; jamais le nom, la description, l'id, le type, les classes ou le style de l'hôte.
- **Écarts au plan** : avec `searchWarmup: 'idle'`, le premier focus relance la préparation (rien n'est reconstruit : le test vérifie le travail, pas l'appel) — retiré pour tenir 1 100 o ; quitter le champ n'applique que l'édition en attente (un champ réécrit par l'hôte avec des espaces ne renvoie rien) ; chaque champ écoute lui-même `quickChanged` ; liste des écouteurs nommés par leurs événements ; pas de `@dzgrid/dom/internal` (étape 17).

#### Décisions de l'étape 15 (2026-10-19 ; filtre par liste de valeurs ; fiches `docs/behaviors/{filter-set,filter-ui,value-list,parts}.md`, plan `docs/phase-3-steps/step15-set-blueprint.md`, décisions `step15-decisions.md`)

- **Quelles colonnes** (Q2) : la fenêtre « liste » seulement pour `filter: { kind: 'set' }` explicite (tout type) ; une colonne à liste d'options sans `filter.kind` garde son comportement (pas de bouton). Mis en œuvre dans `resolve.ts` (paramètre `strict` : la pièce intégrée `filter.set` refusée à un genre `set` implicite) ; une pièce `filter.set` de l'hôte sert toujours.
- **Résumé** (Q4) : « Filtre actif » gardé, pas de `filter.summarySelected` ; 8 clés nouvelles obligatoires.
- **Brouillon** (Q1) : tout décocher = `include: []` ; module pur `set/draft.ts` (mode, valeurs, vides ; liste triée par unité de code ; `blanks` écrit seulement hors défaut ; bascule à la moitié stricte, seulement sur une liste complète).
- **Découpe** (Q3) : morceau paresseux `filters/set/` (brouillon, liste fenêtrée, CSS propre) chargé par `import()` ; mandataire immédiat `filters/set.ts` (chargement, échec, Réessayer, contrôle « montrable », injection de la feuille avec le nonce) ; aide partagée `filters/lazy.ts` (chargeur unique et ligne d'état / alerte), extraite de `dates.ts` ; feuille `filters/dom.ts` sans import (`el`, `tx`, `labelled`). Le morceau reçoit l'aide de chargement du mandataire (4ᵉ argument) : il ne la porte pas.
- **Contexte** : la pièce `filter` gagne `values(o?)` (`kernel.values`), une poignée par colonne, fermée par la pièce.
- **Liste** : toujours fenêtrée (un seul chemin), `listbox` multi-sélection, focus itinérant, l'option active jamais recyclée, hauteur mesurée sur une ligne dessinée ; le nombre dessiné par CSS depuis `data-n` (axe : le texte visible doit tenir dans le nom).
- **Écarts au plan** : ligne d'état dite après la pause aussi dans le navigateur ; cocher n'envoie rien quand le brouillon revient au filtre en vigueur (`changed(false, nul)` et non `changed(false, true)`) ; marche aléatoire dans son propre fichier ; ligne de performance dans `perf/browser-budgets.json` (banc navigateur).

#### Décisions de l'étape 14 (2026-10-19 ; filtres de dates sur tzslot, raccourcis relatifs ; fiches `docs/behaviors/{filter-date-picker,filter-relative,filter-day,filter-instant,filter-ui}.md`, plan `docs/phase-3-steps/step14-tzslot-blueprint.md`, décisions `step14-decisions.md`)

- **tzslot est le contrôle de date** (Q1, Q4) : pair facultative (`>=2.2.0 <3`) de `@dzgrid/dom` et `@dzgrid/angular` ; pas de champ natif, pas d'adaptateur ; étape 21 repliée. Temporal seulement sous `filters/dates/**`, derrière `import()` (K.2 amendé, garde de structure).
- **Découpe** : partie immédiate dans `/filters` (formulaires, chargeur, messages, préchargement, minuit : 8 436 o gz, budget 8 500) ; trois lots paresseux (`date`, `range`, `moment`) mesurés à part (2 288, budget 2 600) ; la part de tzslot relevée sans budget (36,4 / 57,7 / 48,5 kB, les trois 65,0 kB). K.8 : le profil d'audit compte le chargement initial, les lots à côté (revu à l'étape 18).
- **Modèle** : DzGrid garde le brouillon dans ses types (`Day`, instant UTC à la milliseconde, `{op:'relative', range}`) ; tzslot n'est que la vue. Le cœur décide des lignes et du fil, tzslot de l'affichage ; `tzslot-agreement.test.ts` vérifie l'accord (un écart trouvé : le jour perdu des Samoa, T7).
- **Zone, jour, langue** : toujours la zone et le jour de la grille (jamais ceux de la machine), `intlTag(ctx)` (grégorien, chiffres de la grille), les mots de tzslot par langue, `filters({ dateMessages })`.
- **Clavier** : une règle de capture ferme le calendrier au premier Échap (T8) ; Entrée dans un calendrier lui appartient.
- **CSP** : nous injectons les feuilles de tzslot avec le nonce, sous ses identifiants `data-tzslot`, car ses panneaux les injectent même avec `injectStyles: false` (T2).
- **Minuit** : la minuterie vit dans `/filters` (`kernel.tick()`), seulement avec un raccourci en vigueur ; `hasRelative` exporté de `@dzgrid/core/internal` (seule ligne touchée dans le cœur).
- **Écarts au plan** : `DateSettings` porte le `ctx` (le lot calcule la balise de langue : octets) ; nom accessible complété pour tous les boutons nommés de tzslot (T1, T9), `combobox` sur le champ saisi (T10), jours des autres mois non estompés (T11), jour perdu grisé (T7) — trouvés par axe et le balayage ; l'écho du champ date n'est plus coupé (tzslot ne le renvoie pas) ; une période vide ou à l'envers ne filtre pas (L1) ; Réessayer échoue encore dans Chrome (l'échec d'un `import()` est gardé) : le texte dit de recharger la page. Demandes à tzslot : `docs/tzslot-requests.md`.

### Index des décisions des étapes de la Phase 3

Où trouver, pour chaque étape, ce qui a été tranché (le plan validé de l'architecte et les réponses du propriétaire sont dans `docs/phase-3-steps/`, les décisions consignées ici sous « Décisions de l'étape N » ; le détail de ce qui a été fait dans `ROADMAP.md`, Phase 3). Numérotation : celle de `docs/phase-3-plugins.md` B4 et de `docs/STATUS.md` ; les étapes 21 (Sehhaty) et 22 (clôture) du premier plan `docs/phase-3-plan.md` sont devenues 24 et 25.

| Étape | Sujet | Décisions ici | Plan et réponses (`docs/phase-3-steps/`) |
|---|---|---|---|
| 0 | les huit chantiers | « Décisions de la Phase 3 » | `docs/phase-3-plugins.md` |
| 1 | fiches et questions ouvertes | « Décisions de l'étape 1 » | — |
| 2–4 | outillage Angular, garde des requêtes, pagination dans le navigateur | « Décisions de l'étape 1 », ROADMAP | — |
| 5 | `sourceRows` | ROADMAP (étape 5, quatre parties) | `step5-blueprint.md` |
| 6 | `toWire` | « Décisions de l'étape 1 » (point « Étape 6 ») | `step6-blueprint.md` |
| 7 | sélection sur plusieurs pages | « Décisions de l'étape 7 » | `step7-blueprint.md`, `step7-owner.md` |
| 8 | types de filtres personnalisés | « Décisions de l'étape 8 » | `step8-blueprint.md` |
| 9 | listes de valeurs | « Décisions de l'étape 9 » | `step9-blueprint.md`, `step9-decisions.md` |
| 9b | fusions de cellules | « Décisions de l'étape 9b » | `step9b-spans-blueprint.md`, `step9b-decisions.md` |
| 10 | CSV dans le cœur | « Décisions de l'étape 10 » | `step10-csv-blueprint.md`, `step10-decisions.md` |
| 11 | emplacements remplaçables | « Décisions de l'étape 11 » | `step11-slots-blueprint.md`, `step11-decisions.md` |
| 12 | ligne de filtres | « Décisions de l'étape 12 » | `step12-floating-blueprint.md`, `step12-decisions.md` |
| 13 | fenêtre de filtre | « Décisions de l'étape 13 » | `step13-popup-blueprint.md`, `step13-decisions.md` |
| 14 | filtres de dates sur tzslot | « Décisions de l'étape 14 » | `step14-dates-blueprint.md`, `step14-tzslot-blueprint.md`, `step14-decisions.md` |
| 15 | filtre par liste de valeurs | « Décisions de l'étape 15 » | `step15-set-blueprint.md`, `step15-decisions.md` |
| 16 | recherche rapide | « Décisions de l'étape 16 » | `step16-search-blueprint.md`, `step16-decisions.md` |
| 17 | pagination | « Décisions de l'étape 17 » | `step17-pagination-blueprint.md`, `step17-decisions.md` |
| 18 | écran d'audit, permutations, K.8 | « Décisions de l'étape 18 » | `step18-audit-blueprint.md`, `step18-decisions.md` |
| 19 | export CSV | « Décisions de l'étape 19 » | `step19-export-blueprint.md`, `step19-decisions.md` |
| 20 | pièces de cellule prêtes | « Décisions de l'étape 20 » | `step20-parts-blueprint.md`, `step20-decisions.md` |
| 21 | règles de sélection | « Décisions de l'étape 21 » | `step21-rules-blueprint.md`, `step21-decisions.md` |
| 22 | `@dzgrid/angular` | « Décisions de l'étape 22 » | `step22-angular-blueprint.md`, `step22-decisions.md` |
| 23 | l'exemple Angular | « Décisions de l'étape 23 » | `step23-example-blueprint.md`, `step23-decisions.md` |
| 24 | transposition Sehhaty | renvoyée à la piste « Intégration Sehhaty » (`docs/sehhaty-track.md`) | — |
| 25 | clôture | « Ajustements après la Phase 3 » ci-dessous | `step25-close-blueprint.md`, `step25-decisions.md` |
| 26 | animations GSAP, `ui.cellClass` | « Décisions de l'étape 26 » | `step26-motion-blueprint.md`, `step26-decisions.md`, `motion-study.md`, `motion-decisions.md` |

### Ajustements après la Phase 3 (clôture côté DzGrid le 2026-10-21, étape 25 ; décisions du propriétaire `docs/phase-3-steps/step25-decisions.md`)
- **Clôture sans l'étape 24** (Q1) : la Phase 3 est close côté DzGrid ; les critères de sortie 1 (partie Sehhaty), 4, 5 et 7 sont renvoyés, par décision du propriétaire du 2026-10-21, à la piste « Intégration Sehhaty » (`docs/sehhaty-track.md`), dont l'étape 24 est le premier élément. Ensuite la Phase 4 (arbre, maître/détail, décision du 2026-10-20), avant l'édition.
- **Entrées** : au lieu des cinq lignes du plan §4, une entrée par fonction (`@dzgrid/core/{server,csv,spans,rules}` mesurées par-dessus le cœur ; `@dzgrid/dom/{popup,slots,filters,search,pagination,export,parts,rules,spans,motion-gsap,internal}`), des morceaux paresseux mesurés à part (liste de valeurs, adaptateurs de dates, exécution de l'export, exécution des animations) et la part de tzslot et de GSAP relevée sans budget. `tzslot-picker` n'existe pas : les adaptateurs de dates sont dans `@dzgrid/dom/filters` (étape 14). Le profil K.8 est `perf/profiles/audit.ts`, compté au premier chargement (étape 18), avec le fesm2022 livré de `@dzgrid/angular` (étape 23).
- **Budgets** (Q2, Q3) : chaque taille = la mesure + 10 %, arrondie aux 50 o supérieurs, jamais au-dessus des plafonds du §5.2 (cœur 28 000, dom 30 000, textes 2 000, thème 9 000, `/server` 6 000, `/filters` 10 000, Angular 8 000) ; le garde du profil K.8 dans `check:size` = la mesure + 10 % (83 500), le plafond 85 000 garde la vraie construction (`npm run example:bytes`). Temps Node = max(m × 1,1 ; m + 0,5 ms) au demi-ms pour les lignes de 5 ms et plus, les autres gardent leur plafond ; Chrome sans fenêtre = la mesure + 35 % au demi-ms sous les cibles du §5.3 (17,2 ms par image = 58 i/s), lignes sous la ms gardées. Posés par `scripts/rebudget.mjs` (testé, à blanc par défaut). La règle vaut dans les deux sens : `@dzgrid/dom/export` monte de 1 200 à 1 350 (il était à son plafond), le cœur à 28 000 (plafond du §5.2). Tableau complet : ROADMAP, Phase 3.
- **Lignes de mesure ajoutées** (plan §4) : Node `gate begin/accepts x 100 000` (5,6 ms) et `setValues 100 000 x 1 column (cold, 6 values)` (11,5 ms, sous les 30 ms du §5.3) ; à côté, sans budget, la même liste sur une colonne de ~100 000 textes français distincts (≈ 196 ms) et sur des nombres (≈ 102 ms) : le classement à froid domine, la liste à cocher n'est pas faite pour ces colonnes. Chrome : « suivant » jusqu'à l'appel de `fetch` sur le serveur simulé à 10⁷ lignes (0,1 ms, synchrone), CSV de A dans le navigateur (406 ms, aucune tâche de plus de 50 ms), `<dz-grid>` premier rendu de A (37 ms, page `?a=1` du montage Angular) et 1 000 créations / destructions (0,4 Mo retenus). `npm run bench:browser` ne tournait plus depuis l'étape 17 (`@dzgrid/dom/internal` absent de la carte d'import de sa page) : réparé.
- **Non mesuré, reporté** (lignes du plan §4) : réponse jusqu'aux lignes peintes, frappe dans le filtre flottant, défilement d'une liste de 20 000 valeurs, `<dz-grid>` avec 3 colonnes à gabarit en glissement d'ascenseur (et ×4 de CPU), mémoire du modèle paginé (≤ 2 pages), CSV en morceaux (`csv one chunk`), `paged settle`. Le §5.4 prévoyait `perf/baseline.json` à +25 % : remplacé par les budgets de `perf/*.json`. À reprendre à la première étape de la Phase 4 (chaque relèvement par une décision écrite).
- **Écarts de plan déjà consignés** : B1.5 (style périmé et `aria-busy` au lieu d'une superposition de chargement), la fenêtre de filtre fermée au clic dehors (étape 18, Q4), la ligne de filtres optionnelle, l'exemple Angular hors du bac à sable (étape 23).

### Décisions de la Phase 4, étapes 2–3 (2026-10-21 ; plan `docs/phase-4-plan.md`, décisions `docs/phase-4-steps/decisions.md`, qui priment)
- **Nœuds** : `RowNode = DataNode | GroupNode | DetailNode` (types seulement). On lit `data` après `kind === 'data'`. Les règles de sélection (`SelectionRule`, `canSelect`) reçoivent un `DataNode` : seules les lignes de données se sélectionnent. Les événements `cellClicked`/`rowClicked` gardent `RowNode`.
- **Couture de forme** : `ClientOptions.shape?: RowShape<T>` (`kind: 'tree' | 'detail'`, `build`, `all?`, `parents?`, `isOpen?`, `initial?`, `problems`), un seul appel dans `show()`. Un arbre reçoit **toutes** les lignes triées (pas seulement les correspondances) et le masque des correspondances : un ancêtre garde sa place, et changer de filtre ne retrie pas. `DisplayedRows` gagne `parentOf?`, `levelAt?` et `dataCount?` (lignes de données affichées ; absent = toutes).
- **Expansion** : l'ensemble est tenu par le modèle (`expansion`, `isExpanded`, `setExpansion`, `expand`, `expandable`), le noyau l'expose (`kernel.expansion`) et le commande (`rows.expand`, `rows.expandAll {expanded, depth?}`) ; hors de la requête (aucune remise à zéro de page, de sélection, de requête). Un seul `rowExpanded {source, rows, expanded}` par commande, clés seules, après `modelUpdated` (`kind: 'expand'`) ; rien quand l'état ne change pas. Ouvrir ne fait qu'aplatir de nouveau (prouvé par les diagnostics). Les clés des lignes retirées quittent l'ensemble. `depth` : 1 = les racines.
- **Sous un filtre** : les ancêtres des correspondances s'ouvrent seuls, et ce que l'utilisateur ouvre ou ferme pendant ce temps va dans une **couche à part**, liée au filtre (`expand`), perdue quand il change ou s'efface ; l'ensemble de l'utilisateur ne bouge pas. D'où `expand(rows, expanded)` en plus de `setExpansion(set)`.
- **Focus** : une ligne cachée (repli, filtre) donne le focus à son plus proche ancêtre affiché (`parentOf`), même colonne ; sinon la règle plate.
- **Lignes non données** : `selection.allDisplayed`, la case d'en-tête et les plages Maj sautent les clés qui ne sont pas `d:`.
- **`@dzgrid/core/tree`** (`treeShape({ parentId, filter?, initial? })`, `treeConflicts`) : structure en O(n) sans récursion (orphelin → racine + `tree-orphan` ; cycle → cassé à sa première ligne, qui devient racine + `tree-cycle` ; parent de soi-même = cycle), tri par niveau = un tri global + regroupement stable par parent, filtre `'ancestors' | 'subtree'`, aplatissement en tableaux typés (niveaux en `Uint32Array` : une chaîne de 10 000 niveaux passe). Pagination + arbre → `unsupported-combination` (l'arbre entier est montré) ; fusions de cellules et détails : `treeConflicts`, à dire par le DOM (étape 4).
- **Revue des étapes 2–3** (2026-10-21) : `rows.expandAll` passe par le modèle (`expandAll?(expanded, depth, source)`) ; sous un filtre, il agit par la couche, sur les lignes que le filtre garde, et ne dit que les lignes dont l'état affiché change. Ouvrir une ligne sans enfants (sous un filtre : sans enfant gardé) ne fait rien, sans événement (décision du lead ; `RowShape.opens?`). Sous un filtre, tout sélectionner et la case d'en-tête ne prennent que les correspondances (`DisplayedRows.matchedAt?`, `dataCount`). Focus sans ancêtre affiché : la règle plate (la ligne à l'ancien rang ; décision du lead, `tree-filter.md` corrigée). `tree.initial` ne s'applique que si l'hôte n'a rien posé avant la première charge. Une ligne retirée et remise dans la même transaction garde son état. L'ensemble de l'utilisateur change en place (pas de copie par bascule) ; une bascule ne recalcule que ses clés dans les drapeaux ouverts (`ShapeInput.changed`) ; la pile de l'aplatissement a la taille de la profondeur. Problèmes de l'arbre : nommés par l'id de la ligne (`path: 'parentId'`, `detail`), relus seulement quand la structure change.

### Décisions de la Phase 4, étape 4 (2026-10-21 ; coutures DOM et `@dzgrid/dom/tree`)
- **Coutures de la base** : `GridFeature.shape?()` (demandée une fois, avant le modèle : la forme est fixe) ; `FeatureHandle.keys?(e, at, owner)`, appelée par le routeur avant `intentFor` (vrai = traitée, le routeur n'empêche que l'action par défaut) ; `g.layoutFor?(d, h)` et `g.layout` (une disposition par peinture : hauteur du corps, ancrage et ligne du haut par `total`/`offsetOf`/`indexAt` ; `ensureVisible` la lit quand une fonctionnalité en donne une ; la molette et Page suivante restent en hauteur uniforme jusqu'à l'étape 9) ; `g.viewBlock` (le bloc mesuré ; le glissé de `motion-gsap` y mesure « un écran ») ; `beforeRows` passe avant les attributs de la grille.
- **Ancrage `'expand'`** : la ligne du haut reste en place quand des lignes s'ouvrent ou se ferment, même en fin de liste (une transaction garde la fin, une ouverture non). Le haut reste le haut.
- **Focus** : un focus déplacé par les données (repli, filtre) est suivi dans le DOM même si l'ancienne cellule est encore là jusqu'à la peinture suivante (sinon, sur une image asynchrone, le focus tombait sur `body`).
- **`@dzgrid/dom/tree`** (`tree({ parentId, column?, indent?, initial?, filter? })`, `TREE_KEYS`) : rôle `treegrid` ; `aria-level`/`posinset`/`setsize`/`expanded` (pas d'`aria-expanded` sur une feuille), `data-context-row` sur un ancêtre gardé pour ses correspondances ; colonne de l'arbre décorée dans `afterRows` (retrait `padding-inline-start` par niveau, bascule `span.dzg-toggle` décorative `aria-hidden`, cible de 24 px, chevron miroir en RTL, place gardée pour une feuille ; une cellule qui n'est plus celle de l'arbre est rendue nue) ; clic sur la bascule par un écouteur en capture (ni sélection, ni `rowClicked`) ; touches de `tree-keys.md` lues par `intentFor` (miroir RTL), Ctrl/Alt/Meta : rien ; annonces seulement pour l'utilisateur. Fusions de cellules avec un arbre : `unsupported-combination` et grille sans fusions ; source serveur : `unsupported-combination` (étape 7).
- **Nouveau code** `tree-column-not-first` (avertissement, `tree.column`), règle pure `treeColumnProblems` dans `@dzgrid/core/tree` (cas de conformité). Textes `tree.expanded {name, n}`, `tree.collapsed {name}` et **`tree.expandedSome {n}`** (une seule phrase pour `*`, prévue par la fiche ; écart au plan qui n'en nommait que deux) dans `locales/{en,fr,ar}-tree`.
- **Revue de l'étape 4** (2026-10-21) : le focus ne suit les données que depuis une position de la grille ou un focus vraiment perdu (le `body`), jamais depuis la case « tout sélectionner » ni depuis un champ hors de la grille (`hasFocus` peut être périmé : le DOM fait foi) ; épingler ou désépingler la colonne focalisée rend le focus à sa cellule (la peinture le rend quand il était dans la grille) ; un repli qui cache la ligne du haut met son ancêtre affiché le plus proche en haut de la vue (décision du lead, `tree-view.md`) ; l'annonce prend la première colonne visible quand la colonne de l'arbre est masquée.

### Décisions de la Phase 4, étape 5 (2026-10-21 ; formes imbriquée et chemin, lignes de remplissage, CSV d'un arbre ; plan `docs/phase-4-steps/step05-plan.md`)
- **Une seule forme** : `parentId`, `children` ou `path`, exactement une ; aucune ou plusieurs → `tree-shape` (erreur ; aucune : toutes racines ; plusieurs : la première dans cet ordre).
- **Imbriquée** : aplatie avant le magasin (`RowShape.load` / `tx`, appelés par le modèle client), en préordre, sans récursion ; parents tenus par id (le premier id gagne) ; une transaction garde les parents connus, les enfants d'une mise à jour sont indexés, un retrait rend les enfants orphelins (`tree-orphan`).
- **Chemins** : un trie (une `Map` par niveau, O(n·profondeur)) ; un niveau sans ligne devient une ligne de remplissage (`GroupNode`, clé `groupKey(chemin)`, libellé = dernier segment), numérotée après les lignes ; une ligne au même chemin prend sa place ; deux lignes au même chemin sont sœurs.
- **Place d'une ligne de remplissage** (décision du lead) : là où se trouve la première de ses lignes les plus proches en dessous, dans l'ordre affiché (tri ou source). Pas par libellé : un libellé ne se compare pas à une colonne typée, et le cœur n'a pas de comparateur.
- **Sélection** : une ligne de remplissage n'est jamais sélectionnée (clic = focus seul, pas d'`aria-selected`, case non dessinée, pas de pièce de cellule) ; `rows.expand` ne refuse plus que les clés de données inconnues.
- **CSV** : `csv.tree` `'none' | 'level' | 'indent'` (défaut `'level'`, en-tête `levelHeader`), `treeColumn` ; retrait avant la garde des formules et les guillemets ; remplissage = libellé seul ; détails jamais écrits.
- **Revue de l'étape 5** (2026-10-21) : une ligne imbriquée refusée (sans id, `getRowId` qui lève, copie d'un id tenu) n'est pas parcourue et ne place rien (`RowShape.tx` reçoit l'instantané du magasin) ; un retrait oublie le parent de la ligne (gardé si elle revient dans la même transaction) ; les enfants d'une mise à jour s'ajoutent, n'en retirent aucun ; chemins : clés et chemins des lignes de remplissage faits à la demande, chacun depuis son parent, une clé de groupe lue dans le trie ; une ligne qui prend la place d'une ligne de remplissage garde son ouverture, et l'inverse (`RowShape.rekey`) ; CSV : une `treeColumn` non écrite revient à la première colonne écrite, une cellule vide garde son retrait ; DOM : le libellé d'une ligne de remplissage est retiré par sa classe.

### Décisions de la Phase 4, étape 6 (2026-10-21 ; animation de l'arbre, arbre d'un million de lignes ; plan `docs/phase-4-steps/step06-plan.md`)
- **Animation d'une bascule** (`effects.expand`, défaut vrai) : armée par le changement `'expand'` du modèle, le même relevé des places écrites qu'un tri ; ouvrir : les lignes du dessous glissent, les enfants apparaissent en fondu (20 au plus) ; fermer : les lignes du dessous remontent (avec celles qui entrent par le bas, de la même distance), rien sur les lignes cachées, aucun fondu — écart à D12 (« fermeture instantanée »). Sauts : plus de 60 lignes, plus d'un écran (`g.viewBlock`), un défilement entre le changement et la peinture, mouvement réduit (rien du tout), `motion: false`. Pas de règle de frappe (150 ms) : une touche tenue fait glisser chaque bascule depuis la place où sont les lignes. `expandAll` n'est pas distingué : les plafonds décident.
- **Chevron** : tourné par le thème seul (CSS, 120 ms), sous `no-preference` et hors `data-motion=off`, seulement dans la ligne survolée ou focalisée (une bascule recyclée pendant un défilement ne tourne pas).
- **Million de lignes** : jeu `perf/profiles/tree.ts` (parents, dix niveaux, largeurs mêlées), partagé par le banc Node, le banc Chrome (`--only tree`) et le terrain de jeu ; budgets des nouvelles lignes à la mesure (Node +10 %, Chrome +35 %, images tenues à 17,2 ms). Le banc Node libère la mémoire d'un cas après ses passes (`done`, non chronométré).
- **Revue de l'étape 6** (2026-10-21) : le sens d'une bascule vient de `rowExpanded` (ouvrir et fermer ensemble : simple glissé, sans fondu), jamais du nombre de lignes ; le `y` d'un glissé en cours est calculé depuis notre propre tween (plus de `gsap.getProperty`, qui laissait `translate/rotate/scale: none`) ; la remontée du bas se mesure sur les places écrites ; un tri et une bascule dans la même peinture : le tri gouverne.

### Décisions de la Phase 4, étape 7 (2026-10-21 ; enfants chargés à la demande, client et serveur ; plan `docs/phase-4-steps/step07-plan.md`, fiche `docs/behaviors/tree-lazy.md`)
- **Deux entrées optionnelles** : `@dzgrid/core/tree-lazy` (`lazyShape`) et `@dzgrid/dom/tree-lazy` (`lazyChildren({ has, load })`, donné à `tree({ lazy })`) : le chargeur ne tenait ni dans `@dzgrid/core/tree` ni dans `@dzgrid/dom/tree`. Un arbre tout en mémoire n'en porte rien.
- **La ligne de chargement est une vue de l'état** : sous chaque parent déclaré, ouvert, sans enfant, sans réponse, un nœud `kind: 'loading'` (clé `l:` + clé du parent, la même en échec). Après chaque changement du modèle, une ligne sans requête en lance une, une requête dont la ligne a disparu est annulée : une requête par ligne montrée, toute requête répondue ou annulée. Réponse refusée si son jeton n'est plus le courant.
- **Coutures de la base** : `RowShape.attach` (le modèle, et comment redessiner), `RowShape.refresh` (appelé par `invalidate`), `ModelEnv.shape`, `LoadingNode`. Réponses ajoutées par transaction (`data`) ; le magasin est le cache ; `setRows` l'oublie, un chargement encore montré continue ; `rows.refresh` retire les lignes chargées.
- **Serveur** : `DataSource.children(req: ChildRequest)`, un canal de la garde par parent (`children:<clé>`), l'époque dans la requête ; une nouvelle époque ferme tout et oublie les chargements. Pages du serveur + arbre : les pages comptent les racines, les enfants viennent entiers (décision de l'étape) ; pages du navigateur + arbre toujours refusées.
- **Mots** : ceux de la base (`grid.loading`, `grid.error`, `grid.retry`, `announce.loading`, `announce.error`) ; les paquets de l'arbre ne grossissent pas. Tout déplier et `*` ne chargent jamais.
- **Revue** : seules les actions de l'utilisateur sont annoncées (la réponse d'une requête dont « Chargement » a été dit, par son numéro) ; rafraîchir (client ou serveur), `setRows` et `destroy()` oublient les chargements et redemandent aussitôt les parents ouverts ; CSV et pied de pagination ignorent les lignes de chargement.

### Décisions de la Phase 4, étape 8 (2026-10-21 ; `@dzgrid/core/detail` ; plan `docs/phase-4-steps/step08-plan.md`, fiche `docs/behaviors/master-detail.md`)
- **Un détail est une ligne** : `detailShape({ height, initial, sizes })`, une forme ; après chaque maître ouvert, un `DetailNode` (clé `x:` + clé du maître, données du maître, niveau 0), sur l'ordre filtré, trié et paginé. Ouvrir = l'expansion du noyau (`rows.expand`, `rowExpanded`) ; `parentOf` d'un détail = son maître (le focus d'un détail fermé va au maître).
- **Coutures de la base (+6 o)** : la page est coupée avant la forme (un détail suit son maître sur sa page, ne compte pas comme ligne de page ; l'arbre refuse toujours les pages) ; la couche de bascules sous un filtre est celle de l'arbre seul (un détail reste ouvert quand le filtre change ; tout replier ferme tout) ; `allRows` d'une forme sans `all()` = les lignes filtrées et triées (CSV `all`/`selected` sans détail) ; le compte du CSV `displayed` sans détail (`k < 'l'`).
- **Hauteurs** : chaque construction donne `details` (indices) et `heights` (mesure de `sizes`, sinon `height` : nombre, fonction du maître, 240 ; valeur fausse ou fonction qui lève : 240). Le DOM (étape 9) fait `sparseRowLayout(rows, h, { at: rows.details, heights: rows.heights })` ; `'auto'` : le DOM tient la carte `sizes` et envoie les mesures d'une image en un seul `setHeights`.
- **`sparseRowLayout`** : chaque ligne `h` sauf D lignes, recherche binaire et sommes cumulées (mémoire O(D), `setHeight` et lot O(D)) ; exact contre un oracle (1 000 graines, 1 M lignes × 2 000 détails). `at` n'est pas vérifié (la forme le fait).
- **Refus** : `detailConflicts({ spans, tree, depth })` → `unsupported-combination` (fusions, arbre ; profondeur > 3, plafond souple, dite par la grille imbriquée). Pas de nouveau code de problème.
- **Budget** : 1 000 o tenus (994) en sortant `measure`/`layout` de la forme, le cache des lignes entre bascules et la vérification de `at`.
- **Revue (décisions du lead)** : `expandAll` sur des détails suit la profondeur d'un arbre (maîtres au niveau 0 ; profondeur 0 n'ouvre rien, ≥ 1 ou aucune ouvre tout ; fermer à 0 ferme tout) ; le focus d'un détail dont le maître disparaît va à la ligne arrivée à la place du maître (core +7 o) ; le pied de page compte les lignes de données de la page, jamais les détails.

### Décisions de la Phase 4, parents épinglés (2026-10-22 ; décisions Q10–Q11, plan `docs/phase-4-steps/sticky-blueprint.md`, fiche `docs/behaviors/tree-sticky.md`)
- **Option** `tree({ sticky })` : 0 aucun (ni couche ni calcul), n les n plus proches, 3 par défaut ; jamais plus que la moitié de la vue.
- **Calcul pur** `stickyStack` (`dom/src/tree/sticky.ts`) : la pile grandit depuis la ligne à son bord bas ; chaque copie est poussée vers le haut par la fin de son sous-arbre ; décalages de la disposition de la peinture (prêt pour l'étape 9), différences logiques seulement.
- **Copies** : une couche `aria-hidden` dans l'en-tête (hauteur nulle, sous ses rangées), un second moteur de lignes (`rowRenderer.spawn`) ; texte seul (Q11b), sans attributs de ligne, jamais focalisées ; rien n'est écrit quand rien ne change.
- **Pointeur** (Q11c) : chevron = fermer ; case = rien ; ailleurs = focus sur la vraie ligne, défilée sous ses propres copies, sans sélection.
- **Coutures de la base** : `GridContext.inset` / `insetFor`, lus par `ensureVisible` (WCAG 2.4.11) ; aucune dans le cœur.
- **Budget** : `@dzgrid/dom/tree` 2 600 → 3 700 pour la Phase 4 (Q11a).
- **Revue de `206121e`** : une fermeture qui cache la ligne du haut place le parent juste sous ses propres ancêtres épinglés (`offsetOf − insetFor`), `insetFor` somme les hauteurs de la disposition, un `sticky` non numérique vaut 3, le trait du thème est sous chaque copie.

### Décisions de la Phase 4, étape 9 (2026-10-22 ; base DOM des hauteurs variables et de la ligne entière ; plan `docs/phase-4-steps/step09-plan.md`)
- **Une disposition par jeu de lignes** : `rowLayout(g)` (`render/viewport.ts`) garde la dernière disposition tant que les lignes, la hauteur de ligne et `g.layoutFor` sont les mêmes (les hauteurs posées dessus vivent jusqu'à la construction suivante), sinon en fait une. La peinture, `ensureVisible` et les touches de page la lisent : jamais celle de lignes déjà parties. Uniforme : inchangé.
- **Ancre** : les mêmes lignes redisposées avec un autre total (une hauteur changée) gardent la ligne du haut comme une transaction (le haut reste le haut, la fin la fin) ; la distance dans la ligne du haut est bornée à sa nouvelle hauteur ; un changement de hauteur de ligne (zoom du texte) garde la ligne du haut et la fraction quand les hauteurs varient.
- **Pages** : sur des hauteurs variables, une page est une distance (`MoveShape.rowAt`) ; uniforme, `page` lignes comme avant. La molette ne change pas : elle déplace des pixels.
- **Ligne entière** : `MoveShape.whole` ; sur un détail, Gauche/Droite/Début/Fin ne bougent pas ; le focus d'un détail est un focus de cellule sur la colonne visée (gardée en le traversant).
- **Ligne de détail** : pas de cellules ni de case, une `gridcell` `.dzg-dcell` (`aria-colspan` = colonnes visibles + case, nommée d'après l'en-tête de ligne du maître), `RowView.slot`, collée au début de la vue, aussi large que la vue sans dépasser les colonnes. Emplacement de pièce `'detail'` (type) ; la base détruit la pièce quand la ligne sort de la fenêtre, change de clé ou que la grille finit ; Entrée/F2 appellent son `focus()`, Échap revient à la cellule.
- **Budget** : base DOM 19 765 → 20 488 (21 300), thème 2 234 → 2 238 ; les autres inchangés.
- **Revue de l'étape 9** : une page avance toujours d'au moins une ligne ; le routeur ignore les touches d'une grille imbriquée (racine `.dzg` la plus proche) ou déjà traitées ; la redisposition se voit aussi au décalage de la ligne du haut ; `layoutFor(d, h, was)` garde les hauteurs mesurées quand la hauteur de ligne change ; `ensureVisible` montre le haut d'une ligne plus haute que la vue, et Gauche/Droite/Début/Fin ramènent un détail sorti de la vue (base DOM 20 618).

### Décisions de la Phase 4, étape 10 (2026-10-22 ; `@dzgrid/dom/detail` ; plan `docs/phase-4-steps/step10-plan.md`, fiche `docs/behaviors/master-detail.md`)
- **Une entrée à part** : `detail({ part, height?, initial?, column?, nested? })` et `nestedGrid({ settings, keep?, onGrid? })` ; la base ne l'importe pas ; `nestedGrid` prend `createGrid` par le nom du paquet (`@dzgrid/dom`, externe dans la ligne de taille), jamais regroupé deux fois.
- **Ouvrir** : chevron décoratif dans la première colonne, touches de l'arbre (avant ouvre, arrière ferme, inversé en RTL). `aria-expanded` sur la **cellule du chevron** : une ligne de `grid` ne peut pas le porter (axe), une `gridcell` oui.
- **Nom** : « Détails de {name} » sur un `group` dans la cellule, d'où la cellule tire son nom ; pas d'`aria-label` sur la cellule (son texte visible, celui d'une grille intérieure, n'y serait pas : WCAG 2.5.3).
- **Pièce** : montée à la première peinture qui montre le panneau, détruite par la base quand il part ; contexte + `depth` et `leave()` (types seulement dans la base).
- **Hauteur `'auto'`** : un `ResizeObserver`, les changements d'une image en un `setHeights`, une peinture ; la mesure gardée (carte `sizes`) après une fermeture et lue par `layoutFor`, qui prend aussi `was`.
- **Grille imbriquée** : Entrée/F2 dedans, Échap non pris par elle → cellule du panneau, un niveau ; mémoire LRU `{ query, scrollTop }` par maître (20) ; au-delà de 3 niveaux, `unsupported-combination` dit par la grille créée.
- **Molette** : la grille intérieure d'abord, l'extérieure à son bord. Le chaînage du navigateur est rendu à une grille imbriquée (`overscroll-behavior: auto`, la base met `contain`) ; au-dessus du plafond, le panneau arrête la molette tant que l'intérieur peut défiler.
- **Revue** : Échap d'une composition ou qui ne fait que cacher la bulle de la grille intérieure n'en sort pas ; une grille dont le rappel de l'hôte échoue est détruite ; la bulle d'en-tête de la grille extérieure ignore les en-têtes d'une grille imbriquée (base, +11 o) ; nouvelle ligne maître ou langue → grille refaite, état gardé ; molette de côté toujours gardée par le panneau (`sideways` de `dir.ts`).
- **Budget** : `@dzgrid/dom/detail` 3 457 (3 500) ; textes 133 / 146 / 159 (200 / 220 / 250) ; base DOM 20 629 et thème 2 268 (2 500) dans leurs budgets ; aucun budget relevé.
- **Revue de `7b1b4cd`** (Q13) : une grille imbriquée est mise à jour en place (nouvelle ligne maître, langue ; refaite seulement si un réglage fixe change, `UPDATE_POLICY` exporté), sa mémoire garde la cellule focalisée, la ligne du haut + décalage et les lignes ouvertes ; budget `dom/detail` 3 900.

### Décisions de la Phase 4, étape 11 (2026-10-22 ; Angular, arbre et maître/détail ; plan `docs/phase-4-steps/step11-plan.md`, fiche `docs/behaviors/angular-parts.md`)
- **`[(expanded)]`** : l'ensemble des lignes ouvertes ; écrit par l'hôte (fermer puis ouvrir, `rows.expand`, source `host`), clés de lignes absentes sautées puis réécrites au changement de données ; revient en copie après l'utilisateur, l'API ou les données ; jamais l'écho de l'hôte. Sortie `(rowExpanded)`.
- **Panneaux** : `componentPart('detail', C)` ou gabarit `slot="detail"`, nommés dans `detail({ part })` ; contexte complet, `emit` → `partAction { slot: 'detail', column: null }`. Rien à ajouter dans l'enveloppe pour l'emplacement lui-même.
- **Grille dans un panneau** : `<dz-grid [dzgNested]="cell()">`, une entrée de `<dz-grid>` (une directive dépassait le budget de 44 o) ; Échap non pris → cellule du panneau, un niveau ; `detail.depth` au-delà de 3 ; Entrée par le repli de focus des pièces ; pas de mémoire par maître.
- **Copies épinglées** : texte seul, aucune pièce Angular (testé).
- **Budget** : angular 5 965 (6 000). Exemple Angular réel : 86 044 > 85 000 (85 555 avant l'étape, l'installation de l'exemple était périmée depuis l'étape 23, corrigée) : décision du propriétaire.
- **Revue** : clés de l'hôte en attente jusqu'à l'arrivée de leurs lignes (abandonnées sous une ligne fermée par l'utilisateur), modèle gardé sous un filtre d'arbre, événements de la création dits après le premier rendu (NG0100) ; budget angular 6 200 (Q15), mesuré 6 176.

### Décisions de la Phase 4, étape 12 (2026-10-22 ; ligne de filtres affichable en direct ; plan `docs/phase-4-steps/step12-plan.md`, fiche `docs/behaviors/floating-toggle.md`, décision Q8)
- **API** : `filters().floating` — `get()`, `set(on)`, `bind(bouton)` (rend le détacheur) ; utilisable avant la grille (un `set` d'avant est l'état de départ) ; l'état appartient à l'objet de la fonction (dernière grille montée, comme `openFilter`).
- **Base inchangée** : le rendu des en-têtes garde déjà les rangées par identité de spec ; la fonction met sa spec dans `g.headerRows` ou l'en retire, une peinture recompte `aria-rowcount` et tous les `aria-rowindex`, une seconde relit la hauteur de la vue.
- **Masquer** : le focus de la grille sur la ligne passe à l'en-tête de la même colonne (source `user` ou `api`) ; la peinture rend le focus du DOM et son balayage applique les saisies en attente. Les filtres restent ; la marque « filtré » de l'en-tête le dit. Une fenêtre ouverte depuis la ligne se ferme avec elle.
- **Montrer** : parties neuves depuis les filtres en vigueur, aucun événement, aucune phrase. Sans colonne qui la demande, chaque colonne filtrable a son champ.
- **Bouton** : `aria-pressed`, `aria-controls`, nom du paquet (`filter.floatingToggle`) seulement s'il n'a pas de mots à lui (WCAG 2.5.3) ; phrases « Ligne de filtres masquée / affichée » pour l'utilisateur seulement.
- **Angular** : `[floatingFilters]`, entrée à sens unique, en direct, sans écho (l'état revient par `filters().floating.get()`) ; 6 236 o, budget relevé à 6 250 (Q16).
- **Tailles** : `/filters` 9 728 (10 000), textes 745 / 876 / 997, dom 20 648, angular 6 236 (6 250).
- **Revue** (non commitée) : `bind` idempotent (un écouteur, seul le dernier détacheur agit) et valeurs `aria-*` de l'hôte rendues ; la ligne revient à sa place (ordre des fonctions) ; masquer ne bouge qu'un focus sur son niveau ; boîte disparue sourde aux saisies tardives ; `[floatingFilters]` lit `features()` sans le suivre ; `/filters` 9 876, exemple Angular 86 988.

## 0. Provenance, et limites de ce que j'ai lu

**Lu en entier ou presque** : `dzgrid/CLEANROOM.md` ; DzCalendar `ARCHITECTURE.md` (1352 lignes), `CLAUDE.md`, `ROADMAP.md` (120 premières lignes), `CLEANROOM.md` (via DzGrid, identique en esprit), `conformance/README.md`, `perf/budgets.json`, `vitest.config.ts`, `scripts/build.mjs`, `packages/theme/dzcalendar.scss` (110 premières lignes), liste de `packages/` ; tzslot `CLAUDE.md`, `ROADMAP.md` (80 lignes), `packages/theme/tzslot.scss` (120 lignes), `packages/angular/src/calendar.ts` (lignes 100-220) ; ngx-sheetgrid `cell-edits.ts`, `displayed-rows.ts`, `date-value.ts`, `event-target.ts`, `grid.types.ts`, `rule-engine.ts`, `cell-range.ts` (175 premières lignes) ; le plan `blueprint-0.2.0.md` ; la note de cadrage Sehhaty `grille-de-donnees.md`.

**Lu seulement par signatures (grep des `import` et `export`)** : `fill-handle.ts`, `cell-value.ts`, `filter-label.resolver.ts`. Leur contenu interne est **[À VÉRIFIER]** (en particulier un éventuel usage de `Date` dans `fill-handle.ts`/`nextInSeries`).

**Non lu** : les specs de ngx-sheetgrid, `tzslot/README.md`, le reste de `packages/angular/src`, `tzslot/dom/src/calendar.ts` (l'absence de RTL ~l.593 est reprise de la consigne, non revérifiée), `size-budget.json`, le reste de `dzcalendar.scss`.

**Pas de shell dans cette session** : `git show --stat a6c97f5` n'a pas pu être exécuté. Les cinq bugs corrigés par ce commit (index affiché vs source, réponses serveur dans le désordre, dates décalées d'un jour, raccourcis qui volent la saisie, rollback) sont ceux de la consigne et du plan 0.2.0, recoupés avec le code que j'ai lu (`displayed-rows.ts`, `date-value.ts`, `event-target.ts`, `cell-edits.ts`). Le détail exact du diff est **[À VÉRIFIER]**.

**Je n'ai rien mesuré.** Tous les chiffres de budgets (§5.2) sont des **cibles** à confirmer par les spikes de la Phase 0.

### Décisions validées par le propriétaire

Voir le tableau en tête du document (2026-10-16) et les ajustements après la Phase 0 : ils priment sur le reste.

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
  - **Amendement de l'étape 14** (décisions du propriétaire Q1 et Q4, 2026-10-19) : il n'y a plus d'adaptateur ni de champ natif. Le contrôle de date des filtres est tzslot 2.2.0 (`createDateField`, `createRangeField`, `createDateTimeField`), pair optionnelle, chargé en trois lots (`date`, `range`, `moment`) à la première ouverture d'un filtre de date. Temporal (celui de tzslot, natif ou son polyfill) n'apparaît que sous `packages/dom/src/filters/dates/**`, derrière `import()` ; ni le cœur, ni la base, ni le reste de `/filters` ne l'importent (garde de structure). Le cœur décide des lignes et du fil, tzslot de ce qui est montré ; `tzslot-agreement.test.ts` vérifie qu'ils s'accordent. Étape 21 (`/tzslot-picker`) repliée dans l'étape 14.
- **Si autre choix** (dépendre de `@tzslot/core`) : cohérence parfaite avec DzCalendar et un seul Temporal dans la page, au prix de +20 kB gz sur *chaque* écran, y compris ceux sans colonne date.

### K.3 Stratégie de virtualisation : DOM recyclé ou canvas
- **Recommandation** : **DOM recyclé**, lignes **et** colonnes, dans **un seul conteneur de défilement** (§3.6). Un canvas ruinerait l'accessibilité (lecteurs d'écran, sélection de texte native, recherche de page), le RTL et le bidi (arabe mêlé de latin), le thème par variables CSS et les cellules personnalisées. La performance de 10⁵ lignes × 30 colonnes est atteignable en DOM si un cellule visible coûte ~0,01 ms.
- **Condition de la recommandation** : les spikes S1, S2 et S9 de la Phase 0 doivent le confirmer. Si S1 échoue (un million de lignes n'est pas défilable), on **plafonne** le nombre de lignes défilables et on impose la pagination ou l'infini serveur au-delà ; on ne passe pas au canvas.
- **Limite connue** : la hauteur maximale d'un élément est bornée par le navigateur (mesuré en S1 : 17 895 696 px sous Firefox, qui s'effondre à 0 au-delà ; 33 554 428 px sous Chrome et WebKit). Au-delà d'environ 250 000 lignes × 32 px, un `ScrollMapper` met l'échelle (§3.6).

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
Aucune dépendance dans `core`, `dom`, `theme`. Pas de RxJS (le serveur est une `Promise`, le wrapper Angular fournit `fromObservable`). Le seul extra optionnel est `@tzslot/dom` pour le sélecteur de date (K.2). Recommandation : oui. Étape 14 : `@tzslot/dom` et `@tzslot/core` (`>=2.2.0 <3`) sont des `peerDependencies` marquées optionnelles (`peerDependenciesMeta`) de `@dzgrid/dom` et `@dzgrid/angular`, jamais des `dependencies` ; le dépôt les épingle à 2.2.0 en `devDependencies`. Une application sans filtre de date n'installe rien et ne charge rien. Étape 26 : `gsap` (`^3.13.0`) est de même un pair optionnel de `@dzgrid/dom`, importé seulement par le morceau paresseux de `@dzgrid/dom/motion-gsap` ; il est sous la « Standard License » de GSAP (Webflow), pas MIT : l'application qui l'installe l'accepte, DzGrid reste MIT et n'en livre rien ; confirmation à demander à GSAP avant de publier.

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
| Groupes d'en-têtes (multi-niveaux) | C | 3 (étape 9b) | `flattenColumns` (concept) | `aria-colspan` ; `headerBands` dans `@dzgrid/core/spans` |
| Groupes d'en-têtes repliables | C | 5 | — | |
| Visibilité des colonnes | C | 2 | — | Panneau de colonnes en Phase 5 |
| Auto-taille (contenu, ajustement à la largeur) | C | 5 | — | Mesure en phase `read`, échantillon déterministe |
| Types de colonne et défauts (`defaultColDef`, `columnTypes`) | C | 1 | `ColumnConfigBase` (forme) | |
| `valueGetter`, `valueFormatter`, `valueParser`, `valueSetter` | C | 1 | `cell-value.ts` | Codecs §3.4 |
| Types de données (`text`, `number`, `day`, `instant`, `boolean`, `enum`) | C | 1 | `cell-value.ts`, `date-value.ts` (sémantique) | Jour ≠ instant |
| Colonne de sélection (cases à cocher) | C | 2 | — | Colonne pseudo, épinglée début |
| Colonne de numéros de ligne | C | 5 | — | |
| colSpan (fusion de colonnes) | C | 3 (étape 9b) | `colSpan` (forme) | `@dzgrid/core/spans` |
| Colonnes calculées | C | 5 | — | |
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
| Fusion de lignes (`rowSpan`, valeurs identiques `merge`) | C | 3 (étape 9b) | `rowSpan` (forme) | `@dzgrid/core/spans` |
| Lignes pleine largeur | C | 3 (étape 9b) | — | `settings.fullWidth` ; famille `full-width` dans `RowNode` |
| Lignes épinglées haut / bas | C | 5 | — | Aussi pour les totaux |
| Règles de style de ligne et de cellule | C | 2 | `rule-engine.ts` | **Classes**, plus de hex |
| Glisser-déposer de lignes (réordonner) | C | 8 | — | Alternative clavier |
| Surbrillance des changements de valeur (flash) | E | 3 (étape 26, avancée de la Phase 8 par le propriétaire) | — | `prefers-reduced-motion` : marque fixe 0,6 s ; `@dzgrid/dom/motion-gsap` |
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
  - **Ajusté par S5** : les colonnes texte trient par **clés de rang** (valeurs distinctes classées une fois par le `Collator`, puis tri d'entiers : ~15 ms pour 100 000 lignes aux tris suivants) ; défaut `sensitivity: 'base'`, `numeric: true` ; jamais `localeCompare`. La recherche rapide (`contains`) a besoin de son propre pliage (hamza, harakat, tatweel), le `Collator` ne cherche pas de sous-chaîne.
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
  "resolved": { "from": "2026-03-04T23:00:00.000Z", "to": "2026-03-06T23:00:00.000Z" }, "zone": "Africa/Algiers" }
```
Intervalle **semi-ouvert** `[from, to)` en UTC, toujours écrit avec trois chiffres de millisecondes (comparer les chaînes revient à comparer les instants) : le serveur n'a pas à connaître de fuseau et ne peut pas se tromper de jour. Un filtre `day` voyage comme le modèle (`op`, `value`, `valueTo`), jours civils sans fuseau, `between` ordonné et inclusif. Forme complète : `docs/behaviors/server-filter.md` (étape 6 de la Phase 3, `toWire(filter, { ctx, columns, kinds? })`).

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
export function scrollMapper(logicalHeight: number, maxPhysical: number, viewportBlockSize: number): ScrollMapper;
```
`maxPhysical` vaut **4 000 000 px** par défaut (S1 : au-delà de 2²² px, Firefox et Chrome en DPR 3 perdent le demi-pixel). Le mapper projette la **plage de défilement** (logique − hauteur de vue sur physique − hauteur de vue), extrémités exactes, et se reconstruit au redimensionnement. Au-delà d'environ 125 000 lignes de 32 px, `scaled` devient vrai : la molette est interceptée et convertie en logique. Toujours borner avant d'écrire `scrollTop` (WebKit revient à 0 sur une valeur démesurée) ; la grille ignore ses propres écritures. **Ouvert** : clavier natif (PageDown, Espace), toucher et inertie en mode mis à l'échelle bougent `ratio` fois trop ; et voir la rangée retenue en mode mis à l'échelle ci-dessous.

**Structure du DOM : un seul conteneur de défilement.**

```
<div class="dzg" dir="…" data-dzg-ready>
  <div class="dzg-viewport" role="grid" aria-rowcount aria-colcount aria-multiselectable tabindex="-1">   ← LE seul conteneur qui défile ; role=grid ici (S4)
    <div class="dzg-header" role="rowgroup">                    ← position: sticky; inset-block-start: 0
      <div role="row" aria-rowindex="1"> …en-têtes de groupes… </div>
      <div role="row" aria-rowindex="2"> …en-têtes de colonnes… </div>
      <div role="row" aria-rowindex="3"> …filtres flottants… </div>
    </div>
    <div class="dzg-pinned-top" role="rowgroup">…</div>         ← sticky sous l'en-tête
    <div class="dzg-body" role="rowgroup" style="block-size: <hauteur>px">
      <div class="dzg-row" role="row" aria-rowindex="…" aria-selected style="inset-block-start: <y>px">   ← relatif à une couche ré-ancrée (S1, S9)
        <div class="dzg-seg dzg-seg--start">  cellules épinglées début  </div>   ← sticky inset-inline-start: 0
        <div class="dzg-seg dzg-seg--center" style="inline-size: <w>px"> cellules virtualisées </div>
        <div class="dzg-seg dzg-seg--end">    cellules épinglées fin    </div>   ← sticky inset-inline-end: 0
      </div>
    </div>
    <div class="dzg-pinned-bottom" role="rowgroup">…</div>      ← sticky inset-block-end: 0
    <div class="dzg-overlays" aria-hidden="true">plages, poignée de remplissage, repères de glisser</div>
  </div>
  <div class="dzg-footer">pagination · barre d'état</div>                  ← hors du grid (axe : aria-required-children)
  <div class="dzg-live visually-hidden" aria-live="polite" aria-atomic="true"></div>   ← hors du grid
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
4. Phase `write` : rangées sorties de la fenêtre → `pool` ; rangées entrées → prises dans le pool, liées à leur nœud. Comme la fenêtre est contiguë et glisse, on **ajoute en tête ou en queue** : l'ordre du DOM est toujours l'ordre des `aria-rowindex`, sans déplacement des rangées du milieu. Un saut sans recouvrement remplace les rangées une à une **autour de la rangée retenue**, sans jamais vider le corps ni reconstruire la fenêtre (S9 : 2,4 à 3,5× plus lent ; S10 : déplacer le nœud focalisé perd le focus).
5. **Rangée retenue** : contrat en six points dans les ajustements après la Phase 0 (S10) — la rangée de l'arrêt de tabulation reste montée, à sa vraie position (`inset-block-start`), jamais déplacée, détachée ni cachée. **Tranché par S11 (D4)** : en mode mis à l'échelle, la rangée retenue est à sa vraie distance des rangées visibles, bornée à ±2·REBASE, et le corps porte `overflow: clip` ; `focus({preventScroll: true})` puis défilement par la grille, et correction logique d'un défilement natif qui suit un focus.
6. `overflow-anchor: none` sur le conteneur : nous seuls gérons la position. Sur transaction qui insère au-dessus de la fenêtre, on corrige `scrollTop` de la variation de hauteur d'une **ligne d'ancrage** (clé + décalage), sans saut visible.

**Colonnes** : seul le segment central est virtualisé (`cols.first..cols.last` + surbalayage de 2). Les segments épinglés sont toujours complets ; au-delà de 6 colonnes épinglées par côté, avertissement dans la console de développement. Les rangées d'en-tête de groupes affichent seulement les cellules de groupe qui coupent la fenêtre.

**Écriture dans les cellules** : la rangée lie `cells: Map<columnId, CellView>`. Un rechargement de rangée compare une signature par cellule `(référence de valeur, version de format, drapeaux d'état)` et n'écrit rien si elle est inchangée. Le rendu par défaut ne crée **aucun objet d'instance par cellule** : il met à jour le texte d'un noeud texte existant. Les rendus personnalisés ont un contrat `create / update / destroy`.

**Hauteurs** : `--dzg-row-height` est lue **une fois** en `read` (conversion en px) et relue à chaque changement de densité, de taille de police (`rem`) ou de zoom (observé par `ResizeObserver` + `matchMedia('(resolution)')`). Hauteur automatique : estimation, mesure à l'apparition (une phase `read` groupée), `PrefixSums.set`, et correction du défilement par la ligne d'ancrage. Réservée à ≤ 10 000 lignes sans avertissement (spike S3).

**Positionnement** (S9, décision du propriétaire) : `inset-block-start` pour les rangées, relatif à une couche ré-ancrée tous les 2²⁰ px (S1) ; `inset-inline-start` pour les cellules du segment central ; `contain: content` sur chaque rangée (S11 : `strict` casse le `sticky` dans Firefox) ; pas de `content-visibility`. `translateY` est aussi rapide (écart ≤ 2 %) mais moins précis aux grands décalages.

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
  | { kind: 'openMenu' } | { kind: 'expand' } | { kind: 'collapse' }   // openMenu : non retenu (étape 13, O2) : Alt+Flèche bas ouvre le filtre, géré par @dzgrid/dom/filters sur l'en-tête
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

**Édition** (`dom/editors`) : un éditeur est un `<input>` / `<select>` / combobox rendu **dans** la cellule ; la cellule en édition est marquée `data-dzg-editor`. Valider : `Entrée` (**ouvert** : rester sur la cellule, comme le spike S10, ou descendre ; à trancher par le propriétaire avant la Phase 4), `Tab`, perte de focus (option). Annuler : `Échap`. Message d'erreur : `aria-invalid`, `aria-describedby` vers un noeud d'erreur, annonce dans la région live. La cellule d'édition **n'est pas recyclée** (§3.7).

**Presse-papiers** : copie en `text/plain` (TSV avec citation RFC 4180 : tabulation, retour à la ligne et guillemets) et `text/html` (tableau simple). Collage (S7) : écouteurs sur `document`, routés par `document.activeElement` ; lecture de `text/plain` d'abord, `text/html` (premier `<table>`) seulement si le texte est vide ; TSV : CRLF après chaque ligne, guillemets seulement autour d'une cellule qui contient TAB, CR, LF ou `"` ; `tsvToMatrix`, `planPaste` ; une valeur seule collée sur une plage la remplit. Les valeurs sont **brutes** (identifiant, nombre, jour ISO), pas l'affichage localisé, avec lecture selon la locale au collage (chiffres arabes-indic, virgule décimale).

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
- **Bidi des cellules** (S2, décision du propriétaire) : colonnes de **texte libre** = cellule flex + `<span>` intérieur en `unicode-bidi: plaintext` (seule forme qui donne l'ordre du premier caractère fort ET un alignement par colonne dans les trois moteurs) ; autres colonnes : texte `text-align: start` ; colonnes numériques `text-align: end` avec isolation LTR pour les nombres (`unicode-bidi: isolate; direction: ltr` sur la valeur, lecture à gauche en RTL). Identifiants latins dans un texte arabe : isolés par `unicode-bidi: isolate` posé sur la cellule, pas par un `<bdi>` par cellule (coût DOM).

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

Tout défilement virtualisé garde `aria-rowindex` exact : un lecteur d'écran sait où il est même si les rangées voisines ne sont pas montées. **Structure validée en S4** (axe sans violation dans les trois moteurs, arbre AX de macOS correct à la ligne 5 000) ; **reste à prouver à l'oreille**, par le protocole `docs/a11y-protocol.md` : que NVDA, JAWS, VoiceOver et TalkBack annoncent correctement une grille virtualisée, y compris en arabe, et la navigation par commandes de tableau (spike S4). Cibles ≥ 24×24 px (`--dzg-target-min`), focus non masqué (WCAG 2.4.11), indicateurs jamais portés par la couleur seule (1.4.1), `forced-colors` lisible.

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

Événements principaux : `modelUpdated`, `sortChanged`, `filterChanged`, `selectionChanged`, `rangeChanged`, `columnResized|Moved|Pinned|Visible`, `rowClicked`, `cellClicked`, `cellDoubleClicked`, `cellContextMenu`, `cellEditStarted|Stopped`, `cellValueChanged` (avec statut de sauvegarde), `saveFailed`, `fetchFailed`, `pageChanged` (étape 4 ; ex-`paginationChanged`), `rowExpanded`, `problems`, `firstDataRendered`, `scroll`.

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

### Phase 3 : serveur paginé, filtres, export CSV, Angular — **première phase utilisable pour `admin/audit-logs`** (close côté DzGrid le 2026-10-21 ; critères 1 en partie, 4, 5 et 7 renvoyés à la piste « Intégration Sehhaty », voir « Ajustements après la Phase 3 »)
- **Livrables** (noms réels à la clôture, 2026-10-21) : `@dzgrid/core/server` (`createGate`, `sourceRows`, `toWire`), `@dzgrid/core/csv`, filtres et UI (`@dzgrid/dom/filters` : bouton de filtre de l'en-tête, filtres flottants, filtre à valeurs, filtres jour et instant sur tzslot — adaptateurs chargés à la demande, pas d'entrée `tzslot-picker` —, puis `@dzgrid/dom/search` pour la recherche rapide), pagination (`@dzgrid/dom/pagination` : taille, suivant sans total), annonces live, `exportAll` (`@dzgrid/dom/export`) ; **`@dzgrid/angular`** (`<dz-grid>`, contrôleur, fournisseurs, `fromObservable`, gabarits de cellule) ; `playground/audit.html` (écran d'audit simulé à 10⁷ lignes). **Fiches** : pagination serveur (total inconnu), filtres, ordre des requêtes, export CSV.
- **Critères de sortie (écran `admin/audit-logs`)** :
  1. sept colonnes et sept filtres serveur de l'écran actuel transposés ; tri ; pagination serveur avec **total inconnu** ; export CSV (BOM, séparateur, anti-injection) et rappel d'export serveur ;
  2. **suite `server-gate` verte** et un test navigateur qui permute 1 000 fois les réponses : aucune réponse périmée n'est appliquée ;
  3. filtres de jour et d'instant : les bornes envoyées sont `[from, to)` en UTC ; un filtre « le 5 mars » inclut 23:59 (cas de conformité) ;
  4. arabe relu par un lecteur d'arabe : filtre ouvert, tri, pagination, export ouvert dans Excel ;
  5. contraste sur les 12 combinaisons palette × thème ; palette commutée à chaud grille affichée ; un passage lecteur d'écran ;
  6. profil de taille ≤ 85 kB gz ; installation depuis les tarballs de `npm run pack:local` dans une **vraie application Angular 21** (`ng build`), comme tzslot ;
  7. la question honnête de la note Sehhaty : l'administrateur trouve-t-il cela mieux que la table précédente ? Mesurée en production avant de généraliser.
- **Fusions de cellules (étape 9b, avancée de la Phase 5)** : `@dzgrid/core/spans` (carte des fusions, en-têtes groupés, clavier) et `@dzgrid/dom/spans` (corps, lignes pleine largeur, clavier, pointeur, en-têtes groupés) ; critère : fusion correcte sous tri, filtre et page, sans chevauchement (tests de propriétés), sous défilement virtuel (vérifications navigateur S12).
- **Dépend de** : P2, S5, S6. **C'est la première phase qui rend DzGrid utilisable pour `admin/audit-logs`.** Les annuaires (~11 000 lignes, côté client) sont aussi servis dès cette phase.

### Phase 4 : édition, plages, presse-papiers, édition en masse
- **Livrables** : `core/{edit/*,range/*,clipboard,undo}`, `dom/{editors,range,clipboard}` (éditeurs, validation accessible, sélection de plage, poignée de remplissage, copier / coller / couper, `Ctrl+D`/`Ctrl+R`, annuler / rétablir, états visuels de sauvegarde, édition en masse sur la sélection), suites `edit-saves`, `paste-plan`, `fill-plan`, `clipboard-tsv`. **Fiches** : édition, plages, remplissage, collage, annulation, sauvegardes concurrentes.
- **Critères de sortie** : tous les bugs 1 à 5 sont couverts par un test qui **échouait avant** (on rejoue les scénarios de a6c97f5) ; pharmacie (jeu B) : 3 000 lignes, édition en masse ≤ 30 ms, **une seule requête** ; collage de 1 000 cellules ≤ 40 ms ; `Ctrl+V`/`Ctrl+Z`/`Échap` dans un éditeur n'agissent pas sur la grille ; rollback ne touche jamais la source ; plage et poignée corrects en RTL ; clavier de plage complet.
- **Dépend de** : P3 (ou P2 pour un écran client). **Rend possible `pharma/stock`.**

### Phase 5 : colonnes avancées et confort
- **Livrables** : déplacement de colonnes (souris, clavier), groupes d'en-têtes repliables, auto-taille, menu de colonne, panneau latéral (colonnes, filtres), `GridState` (sauvegarde et restauration), lignes épinglées haut / bas, hauteur automatique, densité, `preparePrint()`. **Fiches** correspondantes. (Groupes d'en-têtes, fusions de lignes et de colonnes, lignes pleine largeur : avancés à la Phase 3, étape 9b.)
- **Critères de sortie** : mode « redimensionner » au clavier ; état restauré à l'identique en RTL ; hauteur auto sans saut (spike S3).
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
| **RTL : `sticky`, signe de `scrollLeft`, ascenseur** diffèrent selon le navigateur | Haute | Levé par S2 : `sticky` correct dans les trois moteurs, pas de repli ; module `dir.ts` unique ; tests en RTL dans les trois moteurs. |
| **ICU et `Intl`** : chiffres, grégorien, formats varient entre navigateurs | Moyenne | Étiquettes de langue complètes, parties structurées dans les tests, `calendar:'gregory'` explicite ; relecture arabe humaine. |
| **Vitesse du `Collator`** pour le tri texte sur 10⁵ lignes | Moyenne | Budget 250 ms ; clés précalculées ; Web Worker en réserve (étapes pures et sérialisables). |
| **Hauteur maximale d'un élément** : plafond de défilement | Moyenne | Levé par S1 : `ScrollMapper` à 4 M px, un million de lignes à 60 fps ; reste la rangée retenue en mode mis à l'échelle (§3.7). |
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