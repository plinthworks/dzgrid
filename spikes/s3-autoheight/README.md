# S3 — Hauteur automatique des lignes dans une liste virtualisée

## Question

Des lignes dont la hauteur dépend du texte replié, dans une liste où seules les
lignes visibles sont montées : estimer, mesurer à l'apparition, corriger le
défilement par une ligne d'ancrage. Le contenu à l'écran saute-t-il quand les
mesures remplacent les estimations, vers le bas comme vers le haut (lignes encore
jamais mesurées), à 10 000 et 100 000 lignes, dans les trois moteurs ?

## Méthode

- `autoheight.ts` : `PrefixSums` (Fenwick), `AutoList`. Estimation 48 px pour
  toutes les lignes ; hauteurs réelles 29 à 249 px (moyenne ~85 px), texte
  latin/arabe tiré par mulberry32 à partir de l'indice (graine 42). Surbalayage 4.
- Ancre = la première ligne à l'écran **déjà mesurée** (donc déjà peinte à sa vraie
  taille), avec son décalage ; après mesure, `scrollTop = offsetOf(ancre) + décalage`.
  En bas de liste, l'ancre est la fin (la dernière ligne reste en bas).
- Modes : `read` (mesure groupée `getBoundingClientRect` dans le même rAF que le
  montage, jusqu'à 6 passes), `ro` (`ResizeObserver`), `naive` (mesure sans
  correction : témoin, il doit sauter).
- Mesure du saut : un pilote fait défiler d'un pas fixe par image et échantillonne au
  début de chaque image (= ce qui a été peint). Saut d'une ligne = son déplacement à
  l'écran + le défilement de l'utilisateur (variation de `scrollTop` moins les
  corrections de la liste). On prend le maximum sur toutes les lignes visibles dans
  deux images de suite, et à part la ligne du milieu.
- Scénarios : (1) du haut vers le bas, 120 × 40 px puis 40 × 400 px ; (2) saut au
  milieu, puis vers le haut, mêmes pas ; (3) saut à la fin, puis 100 × −120 px ;
  (4) liste neuve, saut à la ligne 300, puis 400 × −100 px jusqu'à `scrollTop` 0.
- Variante `inset` : `inset-block-start` au lieu de `translateY` (100 000 lignes).
- `node spikes/s3-autoheight/run.mjs` (un navigateur à la fois ; `S3_QUICK=1` :
  10 000 lignes seulement ; `S3_ENGINES=chrome`) → `results/result.json`,
  `results/<moteur>-read-10k.png`.

## Résultats (Chrome 155, Firefox 157, WebKit 27.2) — saut visible maximal, px

| Configuration | Chrome | Firefox | WebKit |
|---|---|---|---|
| `naive` 10k, vers le bas | 0 | 0 | 0 |
| `naive` 10k, vers le haut (milieu / fin / vers 0) | **365 / 507 / 448** (74/161 images > 0,5 px) | **347 / 507 / 448** | **367 / 508 / 488** |
| `read` 10k, 4 scénarios | **0** | **0** | **0** |
| `ro` 10k, 4 scénarios | **0** | **0** | **0** |
| `read` 100k (`translateY`), 4 scénarios | **0** | 0 / **0,5** (milieu) / **1,5** (fin, 9/101 images) / 0 | **0** |
| `ro` 100k | **0** | 0 / 0,5 / **1** (fin, 7/101) / 0 | **0** |
| `read` 100k `inset-block-start` | 0 | 0 / 0,27 / **1,2** (fin, 8/101), plus des bandes vides ≤ 1,5 px | 0 |

Toujours : zone vide à l'écran 0 px (sauf Firefox `inset` ci-dessus). Fin atteinte :
dernière ligne collée au bas (0 px ; `naive` : la dernière ligne n'est même pas montée,
la fin a « fui » car le total a grossi). Haut atteint : `scrollTop` 0 et ligne 0 à
0 px du haut, dans tous les modes.

Coût (bruité, autres navigateurs en parallèle) : `read` médiane 0,2–0,3 ms par mise à
jour, p95 ≤ 1 ms, max ~5 ms (Chrome) ; `ro` médiane < 0,1 ms. Corrections : ~360 par
run, ~25 000 px cumulés (estimation 48 px contre ~85 px réels).

`ResizeObserver` : 1 à 5 « ResizeObserver loop completed with undelivered
notifications » par run (Chrome, Firefox, WebKit en 100k) : les lignes montées dans le
rappel (fenêtre élargie) ne sont mesurées qu'à l'image suivante. Sans saut mesuré ici
parce qu'elles tombent dans le surbalayage, mais c'est un frame avec des positions
estimées.

Firefox à 100 000 lignes (total ~4,8 M px) : sauts de 0,5 à 1,5 px en remontant depuis
la fin, absents à 10 000 lignes (~0,5 M px) et absents dans Chrome et WebKit. Même
chose avec `inset-block-start`, donc pas seulement `translateY`. Hypothèse **[À
VÉRIFIER]** : précision des positions et du défilement de Firefox au-delà de 2²² px
(4,19 M), à croiser avec S1.

## Décision (règle : si instable → limiter à ≤ 10 000 lignes, estimer et corriger sans saut visible)

- **Stable à 10 000 lignes dans les trois moteurs : 0 px.** Stable à 100 000 dans
  Chrome et WebKit (0 px). Firefox à 100 000 : ≤ 1,5 px, sur quelques images, en
  remontant près de la fin. Ce n'est pas un saut de lignes (le témoin saute de 350 à
  500 px) mais un tremblement d'un pixel.
- On applique la règle telle que l'architecture l'écrit déjà : hauteur automatique
  **sans avertissement jusqu'à 10 000 lignes** ; au-delà, permise avec avertissement de
  développement (tremblement ≤ 1,5 px sous Firefox au-delà d'environ 4 M px).
- Mesure retenue : **`read` groupé dans le rAF** (une seule phase de lecture, même
  image, pas d'erreur de boucle) pour l'apparition ; `ResizeObserver` seulement pour
  les changements après coup (police, largeur de colonne), pas pour l'apparition.

## Ce que ça change dans ARCHITECTURE.md (§3.7)

- Préciser l'ancre : la première ligne visible **déjà mesurée**, pas `indexAt(scrollTop)`
  (sinon la ligne d'ancre elle-même peut changer de taille et pousser ce qui est
  dessous) ; ancre « fin » quand on est en bas de liste.
- Mesure à l'apparition dans la phase `read` du rAF, en boucle courte (montage → lecture
  → correction → remontage) avant la peinture ; pas de `ResizeObserver` pour ce cas.
- Le pouce de l'ascenseur bouge sous les corrections (~25 000 px cumulés ici) : une
  meilleure estimation (par longueur de texte et largeur de colonne) réduirait cela.

## Points ouverts

- **[À VÉRIFIER]** Défilement réel (molette, pavé tactile, élan) : ici le défilement
  est programmé par image. Sous Safari et iOS, écrire `scrollTop` pendant l'élan peut
  le couper. Chrome défile sur le thread du compositeur : une image peut montrer du
  vide avant la mesure (pas un saut).
- **[À VÉRIFIER]** Glisser du pouce de l'ascenseur pendant que les corrections le déplacent.
- Hauteurs fractionnaires (zoom, HiDPI) : non testées, toutes les hauteurs mesurées
  ici sont entières.
- Une ligne en bloc avec `unicode-bidi: plaintext` s'aligne selon son texte
  (voir la capture : « تحليل #4981 » à droite) — même constat que S2, sans effet sur la
  mesure.
- Timings bruités (d'autres agents utilisaient des navigateurs) ; le propriétaire
  relance tout à la suite.
