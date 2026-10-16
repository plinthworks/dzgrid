# S2 — RTL, colonnes épinglées en `position: sticky`, un seul conteneur

## Question

Un seul conteneur de défilement (en-tête `sticky` en bloc, segments épinglés
`sticky` en début et en fin de ligne, cellules centrales absolues placées par
`inset-inline-start`) tient-il en RTL dans Chrome, Firefox et WebKit ? Signe de
`scrollLeft`, côté de l'ascenseur, `scrollTo`/`scrollIntoView`, poignées de
redimensionnement, abstraction `ScrollX`.

## Méthode

- `grid.ts` : la grille (CSS logique seulement) et les mesures (côtés physiques,
  c'est ce qu'on vérifie). `dir.ts` : seul module qui nomme `scrollLeft`,
  `clientX`, gauche/droite ; `scrollConvention()` (sonde RTL de 1 px, une fois),
  `readScrollX`/`writeScrollX`, `logicalX`.
- 60 lignes × 23 colonnes (2 épinglées début, 20 centre, 1 épinglée fin), texte
  arabe, latin et mêlé, nombres isolés LTR ; données par mulberry32 (graine 7).
- Pour chaque sens : `ScrollX` = 0, max/2, max, avec `scrollTop` 0/300/900.
  Mesures `getBoundingClientRect` : décalage des segments épinglés par rapport au
  bord physique attendu de la zone client, alignement en-tête/corps de chaque
  colonne, ordre physique des colonnes, ce qui est peint au-dessus
  (`elementFromPoint`). Bornes de `scrollLeft` (affectation de ±1e6), aller-retour
  `ScrollX`, `scrollIntoView` natif avec et sans `scroll-padding`, `ensureVisible`
  géométrique, glisser réel à la souris (Playwright) des poignées, changement de
  `dir` à l'exécution, sondes bidi.
- Deux passes : `default` (navigateurs du kit, headless) ; `classic` (ascenseurs
  classiques forcés : Chrome sans `--hide-scrollbars` et
  `--disable-features=OverlayScrollbar` ; WebKit avec `::-webkit-scrollbar`
  stylé). Sur ce Mac, en headless, **les trois moteurs ont des ascenseurs en
  surimpression (0 px)**. Firefox headless ignore `ui.useOverlayScrollbars=0` :
  pas de passe `classic` pour Firefox (les spikes restent headless).
- Un seul navigateur ouvert à la fois. `node spikes/s2-rtl-sticky/run.mjs` →
  `results/result.json` (`summary` puis `raw`) et 16 captures
  `results/<moteur>-<dir>-<start|mid|classic-mid>.png`.

## Résultats (Chrome 155, Firefox 157, WebKit 27.2 — Playwright 1.64)

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| Convention de `scrollLeft` en RTL | `negative` : 0 → −max | `negative` | `negative` |
| Plage mesurée (max = 2462 px) | [−2462, 0] ; +1e6 → 0 | idem | idem |
| `scrollTo({left:-100})` en RTL | ScrollX 100 | idem | idem |
| Aller-retour `ScrollX` (0, 1, 37,5, 250, max/2, max−1, max, max+50) | ±1 px, borné | idem | idem |
| Segments épinglés au bon côté physique (début = droite, fin = gauche en RTL) | écart 0 px | 0 px | 0 px |
| Alignement en-tête/corps, toutes colonnes, 5 positions | 0 px | 0 px | 0 px |
| Ordre des colonnes miroir en RTL | oui | oui | oui |
| Épinglés peints au-dessus du centre, en-tête au-dessus du corps | oui | oui | oui |
| Ascenseur vertical en RTL (passe classic) | **gauche**, 15 px, `clientLeft` l'inclut | gauche **[À VÉRIFIER]** (vu une fois en fenêtre visible : gauche, 15 px, `clientLeft` l'inclut ; non reproductible headless) | **gauche**, 14 px, `clientLeft` **ne l'inclut pas** |
| Segment épinglé fin à côté d'un ascenseur gauche | 0 px d'écart | — | 0 px d'écart |
| `scrollIntoView` natif sans `scroll-padding` | cellule cachée sous l'épinglé (4/4 échecs) | idem | idem |
| `scrollIntoView` avec `scroll-padding-inline-start/end` = largeurs épinglées et `scroll-padding-block-start` = en-tête | 8/8 visibles | 8/8 | 8/8 |
| `ensureVisible` géométrique (`writeScrollX`) | 4/4 | 4/4 | 4/4 |
| Poignée au bord de fin (gauche en RTL), à ≤ 1 px | oui | oui | oui |
| Glisser vers la fin physique (−60 px en RTL) élargit de 60, retour +30 rétrécit de 30 | oui (centre, épinglé début, épinglé fin) | oui | oui |
| Changement de `dir` à l'exécution | `scrollLeft` remis à 0 (ScrollX 300 → 0) ; réappliqué : 300, alignement 0 | idem | idem |
| Erreurs de page | 0 | 0 | 0 |

Captures regardées : en RTL, `#` et le nom à droite, « الحالة » à gauche, l'ascenseur
classique à gauche (Chrome, WebKit), en-tête et corps alignés ; en LTR, le miroir.

### Bidi dans une cellule (`summary.<moteur>.default.bidi`)

Échantillon « Ward 3 — الطابق 2 » dans une grille RTL :

| Isolation | Chrome | Firefox | WebKit |
|---|---|---|---|
| `unicode-bidi: isolate` sur la cellule (plan actuel) | paragraphe RTL : « Ward » à droite | idem | idem |
| `plaintext` sur la cellule `display:flex` | ordre LTR, alignement garde le début de la grille | **ignoré** (texte dans un élément flex anonyme) | ordre LTR, alignement gardé |
| `plaintext` sur une cellule `display:block` | ordre LTR **mais aligné à gauche** | idem | idem |
| `dir="auto"` | ordre LTR, **aligné à gauche** | idem | idem |
| cellule flex + `<span style="unicode-bidi:plaintext">` | ordre LTR, alignement au début de la grille | idem | idem |

Seule la dernière variante donne, dans les trois moteurs, l'ordre selon le premier
caractère fort **et** une colonne alignée d'un seul côté.

## Décision (règle : si le `sticky` en RTL échoue sur un moteur ciblé → trois conteneurs)

**Le `sticky` en RTL n'échoue sur aucun des trois moteurs** : on garde un seul conteneur
(K.3, §3.7). Pas de repli à trois conteneurs.

## Ce que ça change dans ARCHITECTURE.md

- §3.9 `dir.ts` : la convention mesurée est `negative` partout ; garder la détection
  (une fois par document), pas par défilement. **Ne jamais déduire le côté de
  l'ascenseur de `clientLeft`** (WebKit n'y compte pas l'ascenseur gauche). La grille
  n'en a pas besoin : le `sticky` place les épinglés tout seul.
- §3.9 : un changement de `dir` à l'exécution remet `scrollLeft` à 0 : relire et
  réappliquer `ScrollX` après la bascule.
- §3.8 `ensureVisible` : par la géométrie (`PrefixSums` + `writeScrollX`), pas par
  `scrollIntoView` (les cellules ne sont pas forcément montées). Si on garde un
  `scrollIntoView` (focus clavier), poser `scroll-padding-inline-start/end` = largeurs
  épinglées et `scroll-padding-block-start` = hauteur de l'en-tête, sinon la cellule
  finit sous l'épinglé.
- §3.8 poignées : bord de fin logique, sauf pour la **dernière colonne épinglée en fin**,
  dont le bord de fin est le bord de la grille, contre l'ascenseur gauche en RTL : la
  poignée passe à son bord de début, sens du glisser inversé (vérifié). Une poignée
  cachée sous un segment épinglé ne se saisit pas : c'est voulu.
- §3.9 bidi : remplacer « `unicode-bidi: isolate` sur la cellule » par « cellule flex
  (alignement par la grille) + texte dans un élément `unicode-bidi: plaintext` ». Cela
  coûte un élément par cellule (le plan disait « pas de `<bdi>` par cellule ») ; à
  arbitrer, ou à réserver aux colonnes texte libre.
- WebKit : un ascenseur en surimpression couvre les ~15 px du bas du conteneur et prend
  les clics quand il est affiché (vu par `elementFromPoint`).

## Points ouverts

- **[À VÉRIFIER]** Firefox, côté de l'ascenseur classique en RTL : contrôle manuel du
  propriétaire (Firefox avec ascenseurs toujours visibles, `dir=rtl`). Attendu : gauche.
- **[À VÉRIFIER]** Windows et Linux (ascenseurs classiques par défaut), Safari réel
  (pas le WebKit de Playwright), iOS (élan du défilement).
- **[À VÉRIFIER]** Zoom non entier et écran HiDPI : `scrollLeft` fractionnaire, tolérance de 1 px.
- `text-overflow: ellipsis` avec le `<span>` en `plaintext` : pas encore essayé.
- Les mesures ne virtualisent pas les colonnes ; le recyclage des cellules centrales
  sous `sticky` est le sujet de S9.
