# S10 — Focus et édition contre le recyclage

## Question

Pendant qu'une cellule a le focus ou qu'un éditeur (`<input>`) y est ouvert, on la fait défiler
loin hors de la fenêtre puis revenir, on trie, on met les données à jour : le focus reste-t-il sur
la **même cellule logique** (par `RowKey`, pas par position), l'éditeur garde-t-il son texte et son
curseur, aucun `blur` non voulu, un ordre de Tab sain, et le focus revient-il sur la cellule à la
fermeture de l'éditeur (`Entrée`, `Échap`) ? Règle de décision (§6) : *produire le contrat de la
rangée retenue pour le §3.7.*

## Méthode

- La grille est celle du spike S4 (`../s4-a11y/grid.ts`, importée telle quelle) ; `index.html`
  ajoute un journal de tous les `focus`/`blur`/`focusin`/`focusout` (capture sur `document`).
  `?retain=0` désactive la rangée retenue (recyclage naïf, témoin).
- `dom-probe.html` : primitives, sans grille — ce que fait chaque moteur à une cellule focalisée
  (ou à un `<input>` focalisé, curseur en 4) quand on la **déplace**, la **détache** ou la **cache**
  de diverses façons ; nœud AX de la rangée via CDP dans Chrome.
- `run.mjs` (`node spikes/s10-focus/run.mjs [chrome firefox webkit]`), 10 000 lignes de 32 px,
  fenêtre de ~31 rangées. Le clavier est réel (`page.keyboard`) ; défilement, tri et mise à jour
  passent par l'API de la grille. Après la dernière touche frappée, 300 ms de pause avant de
  défiler (`HUMAN_PAUSE`, voir constat 5).

## Résultats (2026-10-16, Chrome 155.0.8059.80, Firefox 157.0, WebKit 27.2 — Playwright 1.64.1, macOS 26.2)

`results/result.json` : **57 vérifications, 0 échec** (19 par moteur). Mêmes résultats dans les trois moteurs.

**Grille avec rangée retenue :**

| Scénario | Résultat (Chrome = Firefox = WebKit) |
|---|---|
| A. Cellule r42/Ville focalisée, défilement à 5 000, 9 999, retour | même nœud `activeElement`, 0 `blur`/`focusout` ; r42 retenue, ordre DOM = ordre `aria-rowindex` |
| B. Éditeur sur r42/Note, « Bonjour », curseur en 4, défilement à 5 000 | même `<input>`, texte et curseur intacts, 0 `blur` |
| B'. Frappe de « ! » dans l'éditeur hors écran | « Bonj!our », curseur 5 ; **le moteur fait défiler la grille jusqu'à l'éditeur** (voir constat 4) |
| B''. Défilement à 9 999 puis 0 | même input, un seul input dans le corps, texte et curseur intacts |
| C. Tri (âge décroissant) éditeur ouvert | même input, texte, curseur ; r42 à son **nouveau** `aria-rowindex` ; ordre DOM sain ; 0 `blur` |
| D. Mise à jour de toutes les lignes (ville + « Note » venant du serveur) éditeur ouvert | l'éditeur garde « Bonj!our » et son curseur ; la cellule voisine est mise à jour ; 0 `blur` |
| E. `Entrée` | éditeur fermé, valeur validée, focus sur la cellule r42/Note ; seuls `blur`+`focusout` de l'input (voulus) |
| F. `F2`, frappe, défilement à 8 000, `Échap` | annulé, focus sur r42/Note, rangée toujours retenue |
| G. `Tab` depuis la cellule retenue hors écran ; `Maj+Tab` | sort vers le champ « après » ; revient sur r42/Note (le moteur la ramène à l'écran) ; Tab depuis « avant » → r42/Note |
| H. `Tab` éditeur ouvert | le focus quitte la grille, le `blur` valide (« Bonj!our+ ») — voulu |
| I. La ligne focalisée est filtrée | focus déplacé (voulu) sur la ligne qui occupe maintenant son indice (r43/Ville) |

**Témoin sans rangée retenue (`retain=0`) :**
- Chrome : la rangée recyclée emporte le focus vers `<body>` avec `blur` + `focusout` ; l'éditeur
  reçoit `blur`, notre gestionnaire valide et ferme — l'utilisateur perd son éditeur sans l'avoir voulu.
- Firefox, WebKit : focus sur `<body>` **sans aucun événement** ; l'éditeur, qui croit toujours
  être ouvert sur r42, voyage avec le nœud recyclé : on retrouve l'`<input>` dans **r5001/Note**,
  puis dans **r23/Note** après retour en haut. C'est le bogue classique du recyclage.

**Primitives (`dom-probe.html`)** — `oui` = le focus (et le curseur de l'input) reste :

| Opération sur la rangée focalisée | Chrome | Firefox | WebKit |
|---|---|---|---|
| `insertBefore` / `append` (déplacement) / retrait + réinsertion | non, `blur` émis | non, **aucun `blur`** | non, **aucun `blur`** |
| `moveBefore()` | oui | oui | absent |
| `translateY` lointain (rester en place dans le DOM) | oui | oui | oui |
| déplacer les rangées **voisines** autour d'elle | oui | oui | oui |
| `display: none`, `visibility: hidden`, `content-visibility: hidden`, `inert` | non, `blur` émis | non, `blur` émis | non, `blur` émis |
| `content-visibility: auto` + loin | oui | oui | oui |
| `aria-hidden="true"` | oui (Chrome l'expose quand même : nœud AX non ignoré) | oui | oui |

Dans Chrome, `display:none`, `visibility:hidden` et `inert` retirent aussi la rangée de l'arbre AX ;
`content-visibility:hidden` la garde mais avec un nom vide.

**Constats :**
1. On ne peut pas déplacer un nœud focalisé : les trois moteurs perdent le focus, et deux sur trois
   le font **en silence** (pas de `blur`), donc aucune logique « sur blur » ne peut rattraper.
   `moveBefore()` le permettrait dans Chrome et Firefox, pas dans WebKit : on ne s'y fie pas.
2. On ne peut pas cacher la rangée retenue par CSS ou `inert` : focus perdu partout.
3. On peut la laisser à sa place réelle (`translateY`) : rien ne bouge, le conteneur la coupe.
4. **Les moteurs ramènent eux-mêmes l'élément focalisé à l'écran** : taper dans un éditeur hors
   écran fait défiler la grille de 160 000 px à ~1 383 px (Chrome), 1 384 (Firefox), 1 072
   (WebKit) ; `Maj+Tab` vers une cellule retenue la remet à l'écran (309 809 px dans les trois).
   D'où l'exigence : la rangée retenue doit être **à sa vraie position** ; garée ailleurs (en haut
   du corps, à `-9999px`, en fin de DOM sans `translateY`), ce défilement natif mènerait au mauvais
   endroit. Pour la grille, c'est un défilement comme un autre (événement `scroll` → rendu).
5. Firefox : juste après une touche dans un `<input>`, il programme un « ramener le curseur à
   l'écran » qui s'exécute à l'image suivante ; un défilement par programme fait dans cet
   intervalle est annulé (deux essais avec `HUMAN_PAUSE=0` : B et F échouent au premier, F au second — la grille est
   ramenée sur l'éditeur ; aucun échec avec 300 ms ; Chrome et WebKit ne le font pas). `ensureVisible` / `scrollTo` déclenchés par une touche doivent passer après un
   `requestAnimationFrame` **[À VÉRIFIER dans le vrai code]**.

## Décision : contrat de la rangée retenue (pour ARCHITECTURE §3.7, étape 5)

> **Rangée retenue.** La position de focus `{rowKey, columnId}` désigne une cellule, la seule de la
> grille à porter `tabindex="0"`.
> 1. **Quand.** La rangée de cette cellule est retenue dès qu'elle sort de la fenêtre, **que la
>    grille ait le focus DOM ou non** (sinon Tab ne trouve plus d'arrêt de tabulation et
>    `Maj+Tab` ne revient pas sur la dernière cellule), et a fortiori si un éditeur y est ouvert.
>    Il y a au plus une rangée retenue (l'éditeur est toujours dans la rangée focalisée). Elle n'est
>    jamais comptée dans le pool.
> 2. **Fin.** Elle est libérée quand la position de focus change de ligne (clavier, clic, API), ou
>    quand sa ligne quitte les lignes affichées (filtre, suppression, repli d'un ancêtre,
>    changement de page) ; le focus va alors, **volontairement**, sur la ligne affichée la plus
>    proche à cet instant (§3.8) et un éditeur ouvert est fermé (annulé dans le spike ; validé ou
>    annulé : à trancher, §3.10).
> 3. **Où dans le DOM.** Dans le `rowgroup` du corps, parmi les rangées de la fenêtre, à sa place
>    dans l'ordre d'affichage (avant la fenêtre si son indice est plus petit, après sinon) : l'ordre
>    du DOM reste l'ordre des `aria-rowindex`, donc l'ordre de lecture et de Tab. **Son nœud n'est
>    jamais déplacé, détaché, ni lié à une autre clé** tant qu'il est retenu ; c'est l'ancre du
>    placement : les autres rangées sont insérées avant ou après lui (`insertBefore` relatif à
>    l'ancre). Un saut sans recouvrement reconstruit la fenêtre **autour** de l'ancre, pas en vidant
>    le corps.
> 4. **Comment elle est « cachée ».** Elle ne l'est pas : elle garde sa position réelle,
>    `translateY(offsetOf(indice))` à l'intérieur d'un corps dont la hauteur est la hauteur totale ;
>    le conteneur de défilement la coupe. Positionnée en absolu, elle ne change pas la mise en page.
>    Interdits : `display:none`, `visibility:hidden`, `content-visibility:hidden`, `inert`,
>    `aria-hidden`, position factice. Elle reste dans l'arbre AX (Chrome : `offscreen`, non ignorée).
> 5. **Contenu.** Elle est liée et mise à jour comme les autres (transactions, `aria-rowindex`,
>    `translateY` après un tri), sauf la cellule en édition, que rien n'écrit tant que l'éditeur est
>    ouvert.
> 6. **Fermeture de l'éditeur.** Mettre d'abord le focus sur la cellule, puis retirer l'`<input>` :
>    le seul `blur` émis est celui, voulu, de l'input.
> 7. **Défilement natif.** Les moteurs ramènent à l'écran la cellule ou l'éditeur focalisé (frappe,
>    `Maj+Tab`) : la grille le traite comme un défilement ordinaire.

**Autres modifications proposées pour ARCHITECTURE.md** (non faites ici) :
- §3.7, étape 4 : « un saut sans recouvrement vide la fenêtre et la reconstruit dans l'ordre (un
  `DocumentFragment`) » → « … la reconstruit autour de la rangée retenue, s'il y en a une ».
- §3.7, étape 5 : remplacer la phrase actuelle par le contrat ci-dessus (« jusqu'à la fin de
  l'édition ou le déplacement du focus » devient « tant que la position de focus est sur cette
  ligne, même si la grille n'a plus le focus DOM »).
- §3.8 Focus : préciser qu'une ligne qui disparaît avec un éditeur ouvert ferme l'éditeur
  (valider ou annuler, à trancher) et que le repli d'un ancêtre ramène le focus sur cet ancêtre (APG).
- §4, invariant 14 : ajouter « la rangée focalisée n'est jamais déplacée dans le DOM » et le test
  Chrome/Firefox/WebKit de `run.mjs` (scénarios A–I).

## Points ouverts

- Rangées épinglées (haut / bas) et segments épinglés (début / fin) : une cellule focalisée dans
  un segment `sticky` n'a pas été testée ; la colonne focalisée hors de la fenêtre horizontale
  devra être retenue de la même façon (cellule retenue dans le segment central).
- Éditeurs riches (`<select>`, combobox avec popup) : seul `<input>` est testé ; un popup doit
  vivre hors du corps défilant ou se fermer au défilement **[À VÉRIFIER]**.
- Glisser de lignes, défilement à la molette et tactile réels (ici : `scrollTop` par programme).
- `Entrée` en édition : le spike reste sur la cellule ; le §3.8 dit « ligne suivante » par défaut.
- Coût mesuré : une rangée de plus au plus, négligeable — non chiffré au-delà.
