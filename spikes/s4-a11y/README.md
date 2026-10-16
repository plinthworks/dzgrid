# S4 — Accessibilité d'une grille virtualisée

## Question

Une grille de 10 000 lignes, dont environ 30 sont montées, reste-t-elle compréhensible pour une
technologie d'assistance ? `aria-rowcount` / `aria-colcount`, `aria-rowindex` / `aria-colindex`
(base 1, en-têtes comprises), tabindex itinérant sur une seule cellule, rangée focalisée retenue
hors de la fenêtre, région live polie (tri, filtre, page), variante treegrid, ligne de détail, arabe
et RTL. Règle de décision (ARCHITECTURE §6) : *si un lecteur ne s'y retrouve pas, renforcer la
région live et la rangée retenue ; documenter.*

## Méthode

- `grid.ts` : grille de spike écrite d'après le patron APG grid / treegrid, sans lire aucune autre
  grille (CLEANROOM). Fenêtre contiguë + surbalayage de 6, rangées en `translateY`, réutilisation
  par pool, rangée retenue (contrat dans `../s10-focus/README.md`), un seul `keydown`, flèches
  inversées en RTL. `data.ts` : données et messages (fr, ar avec les six pluriels).
- `index.html?lang=fr|ar&mode=grid|treegrid|detail|paged|colvirt` (`&layout=arch` reproduit l'arbre
  du §3.7 tel qu'écrit ; `&manual=1` ajoute les boutons du protocole manuel).
- `run.mjs` (`node spikes/s4-a11y/run.mjs [chrome firefox webkit]`) :
  - **Chrome** (`--force-renderer-accessibility`) : axe-core ; CDP
    `Accessibility.getFullAXTree` (nœud focalisé, nœud AX de la rangée retenue, région live) ;
    **`chrome://accessibility`**, vidage de l'arbre interne Blink **et de l'arbre natif macOS**
    (`apiType=mac`) — celui que lit VoiceOver : `AXARIARowIndex`, `AXARIARowCount`,
    `AXColumnHeaderUIElements`, `AXRowHeaderUIElements`, `AXSortDirection`, `AXDisclosureLevel`…
    (`ax.mjs` analyse ces vidages). CDP seul n'expose ni `aria-rowindex` ni `aria-sort`.
  - **Firefox, WebKit** : axe-core + vérifications DOM / focus / clavier. Playwright 1.64 n'a plus
    `page.accessibility.snapshot` et `ariaSnapshot()` est calculé par Playwright, pas par le moteur ;
    l'API AX de macOS (Safari) demande une autorisation d'accessibilité que ce processus n'a pas
    (`AXIsProcessTrusted() = false`). Les arbres AX de Gecko et WebKit restent donc **[À VÉRIFIER]**
    à la main (`protocol.md`).
- `serve.mjs` sert les pages pour la session manuelle ; `protocol.md` est le protocole lecteurs d'écran.

## Résultats (2026-10-16, Chrome 155.0.8059.80 système, Firefox 157.0 et WebKit 27.2 de Playwright 1.64.1, macOS 26.2, axe-core 4.14.0)

`results/result.json` : **219 vérifications, 0 échec** (Chrome 93, Firefox 63, WebKit 63), fr et ar.

| Vérification | Chrome | Firefox | WebKit |
|---|---|---|---|
| axe : 0 violation (chargement, ligne 5 000, rangée retenue hors écran, treegrid, détail, colonnes à trous) | oui | oui | oui |
| Tab entre sur l'unique arrêt (1 seul `tabindex=0`), flèches logiques (ArrowLeft = suivant en RTL) | oui | oui | oui |
| Ligne 5 000 : 31 rangées montées, ordre DOM = ordre `aria-rowindex` | oui | oui | oui |
| Défilement jusqu'à 9 999 : la rangée focalisée (5 001) reste montée, première du corps, focus intact | oui | oui | oui |
| Tab hors de la grille, défilement, Maj+Tab : retour sur la même cellule logique | oui | oui | oui |
| Région live : tri, filtre, page, repli d'arbre annoncés ; `aria-rowcount` suit le filtre | oui | oui | oui |
| Treegrid : `aria-level/setsize/posinset/expanded` ; ← (→ en RTL) va au parent puis replie | oui | oui | oui |
| Détail : 1 cellule `aria-colspan=6` juste après le maître ; Entrée sur le maître la ferme | oui | oui | oui |

**Arbre natif macOS dans Chrome (ce que VoiceOver reçoit)**, fr comme ar :
- Ligne 5 000, cellule focalisée : `AXARIARowIndex=5001`, `AXARIAColumnIndex=2`, table
  `AXARIARowCount=10001`, `AXARIAColumnCount=6`, en-tête de colonne « Ville » / « المدينة »,
  en-tête de ligne « Patient 4999 » / « مريض 4999 » (colonne d'identité en `rowheader`).
- Après défilement jusqu'à 9 999 : `AXRows` = [en-tête (1), **retenue (5001)**, 9977 … 10001] ;
  la cellule retenue garde `AXFocused=1` et ses deux en-têtes. Blink : rangée retenue
  `offscreen` mais **pas `ignored`**, `tableRowIndex=1` (elle vient juste après l'en-tête dans la
  table interne). CDP : nœud `row` exposé, nom complet, focus dedans.
- Colonnes à trous (rendues 1, 7–11 sur 18) : `AXARIAColumnIndex=8` reçoit bien l'en-tête
  « Mesure 2 » (l'association se fait par position DOM, alignée parce que l'en-tête est virtualisé
  avec la même fenêtre).
- Tri : `AXSortDirection=AXAscendingSortDirection` sur le seul en-tête trié.
- Treegrid : Blink expose `hierarchicalLevel`, `setSize`, `posInSet`, `expanded` ; macOS seulement
  `AXDisclosureLevel` (base 0) et `AXExpanded` — **pas de taille de groupe ni de position** côté
  macOS, et `AXDisclosing=0` même déplié.
- Rangée retenue d'un parent replié (treegrid) : exposée, niveau 1, `collapsed`.

**Annonces relevées** (texte de la région live) :
- fr : « Trié par Ville, ordre croissant. 10 000 lignes. » (espace fine insécable) ;
  « Filtre appliqué : 1 667 lignes. » ; « Page 3 sur 100, lignes 201 à 300 sur 10 000. » ;
  « Service 50 replié. »
- ar : « مرتب حسب المدينة، تصاعديًا. 10.000 صف. » ; « طُبّق المرشح: 1.667 صفًا. » (forme `many`) ;
  « الصفحة 3 من 100، الصفوف 201 إلى 300 من 10.000. » ; « مصلحة 50 مطوي. »

**Constats qui changent le plan :**
1. **`role="grid"` sur l'enveloppe `.dzg` (§3.7 tel qu'écrit) est une violation axe dans les trois
   moteurs** : `aria-required-children` — « Element has children which are not allowed:
   div[tabindex], div[aria-atomic] » (le viewport et la région live sont enfants de la grille).
   Correct : `role="grid"` **sur le conteneur qui défile** (`.dzg-viewport`), dont les enfants sont
   les `rowgroup` ; région live et pied **hors** de la grille (frères).
2. **Firefox met un conteneur `overflow: auto` dans l'ordre de tabulation** même quand il contient
   une cellule `tabindex=0` : sans `tabindex="-1"` sur le viewport, Tab s'arrête d'abord sur la grille
   elle-même (Chrome et WebKit vont directement à la cellule). `tabindex="-1"` est donc obligatoire.
3. **`aria-colspan` d'une ligne de détail n'entre pas dans la géométrie de table de Chrome** :
   `ariaCellColumnSpan=6` est exposé, mais `tableCellColumnSpan=1` et macOS
   `AXColumnIndexRange={loc:0,len:1}` ; la cellule de détail reçoit l'en-tête de colonne « Nom ».
   VoiceOver dira probablement « Nom » avant le détail **[À VÉRIFIER]**.
4. **Grilles à numéros en `ar-DZ`** : avec `numberingSystem: 'latn'`, `ar-DZ` groupe les milliers
   par un point (« 10.000 », « 1.667 ») ; une synthèse arabe peut le lire comme un décimal
   **[À VÉRIFIER, protocole étape 5]**.
5. WebKit (macOS) ne met pas les boutons dans l'ordre de Tab par défaut (réglage système) : les
   tests utilisent des champs de saisie comme repères ; rien à changer dans la grille, mais un
   testeur Safari doit le savoir (Option+Tab, ou réglage « Tab met en surbrillance chaque élément »).

## Décision

La règle de décision ne se déclenche pas sur les moteurs mesurés : l'arbre exposé est exact à la
ligne 5 000 et à la ligne 9 999, rangée retenue comprise, en fr et en ar. On garde le modèle
« `aria-rowindex` exact + rangée retenue + région live polie » et on corrige la structure :

- `role="grid"|"treegrid"` et `aria-rowcount/colcount/label` **sur `.dzg-viewport`** ;
  `tabindex="-1"` sur ce même élément ; `.dzg-live` et `.dzg-footer` **hors** de lui ;
  `.dzg-overlays` reste dedans avec `aria-hidden="true"` (non testé ici ; axe ignore les nœuds cachés **[À VÉRIFIER]**).
- La colonne d'identité est un `rowheader` (c'est elle qui donne « Patient 4999 » à chaque cellule).
- Région live : `aria-live="polite"` + `aria-atomic="true"`, existante dès le montage, vidée puis
  remplie après ~60 ms pour qu'un message identique soit relu (délai choisi a priori **[À VÉRIFIER]**
  avec les lecteurs, protocole étape 5).
- Paginé : `aria-rowcount` = lignes de la page + en-têtes, `aria-rowindex` local à la page, et la
  position globale dans l'annonce de page (« lignes 201 à 300 sur 10 000 »). **[À VÉRIFIER]** avec
  les lecteurs (alternative : rowcount global).

**Modifications proposées pour ARCHITECTURE.md** (à valider, je n'ai pas modifié le fichier) :
- §3.7, schéma du DOM : déplacer `role="grid" aria-rowcount aria-colcount aria-multiselectable` de
  `.dzg` vers `.dzg-viewport` (qui garde `tabindex="-1"`, désormais justifié par Firefox) ; sortir
  `.dzg-live` et `.dzg-footer` de l'élément `role="grid"`. Ajouter le contrat de rangée retenue
  (voir `../s10-focus/README.md`).
- §3.9, tableau ARIA : « Racine » devient « Conteneur de défilement » ; colonne d'identité en
  `rowheader` recommandée par défaut ; ligne « Détail » : noter que `aria-colspan` n'est pas pris en
  compte dans la géométrie de table de Chrome (en-tête de colonne 1 associé) — piste : donner à la
  cellule de détail un nom propre (`aria-label` « Détail de … ») et vérifier ce que disent les lecteurs.
- §3.9 : arbre — macOS n'expose pas `aria-setsize/posinset` des rangées ; annoncer le repli / dépliage et
  le nouveau total de lignes dans la région live (fait dans le spike).
- §3.9 formats : pour les annonces en arabe, envisager `useGrouping: false` ou le séparateur de
  `ar` plutôt que `ar-DZ` si le protocole confirme la lecture décimale.
- §3.8 : `Entrée` en édition — le spike garde la même cellule ; le §3.8 dit « ligne suivante par
  défaut » : à trancher, sans effet sur l'accessibilité.

## Points ouverts

- **Lecteurs d'écran réels** : NVDA+Firefox, JAWS+Chrome, VoiceOver+Safari, TalkBack+Chrome,
  en français et en arabe — `protocol.md`. Rien ici ne prouve ce qu'ils *disent*.
- Arbres AX de Gecko et de WebKit : non lus (voir Méthode) **[À VÉRIFIER]**.
- Mode navigation / curseur virtuel (NVDA, JAWS) : le lecteur peut lire les rangées montées
  au-delà de la fenêtre visible ; il ne voit que ~30 rangées sur 10 000 et peut annoncer « fin de
  tableau » à la dernière rangée montée. C'est le cas où la règle de décision pourrait se déclencher.
- Commandes de tableau (Ctrl+Alt+flèches NVDA/JAWS, VO+flèches) : elles déplacent le curseur du
  lecteur, pas le focus DOM ; arrivées au bord de la fenêtre, elles ne déclenchent aucun défilement.
- Ligne de détail : en-tête associé (constat 3) ; contenu riche (grille imbriquée) non testé.
- Colonnes virtualisées dynamiquement (défilement horizontal) non testées ; seule une fenêtre fixe
  à trous l'a été.
- Treegrid : replier un ancêtre de la ligne focalisée devrait ramener le focus sur cet ancêtre
  (APG) ; le spike replie depuis le parent focalisé seulement.
