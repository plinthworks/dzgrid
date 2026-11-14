# Publier DzGrid 1.12.0 — la liste du propriétaire

Préparé le 2026-11-13 (ta réponse « toujours laisser le choix », puis « A partout »), après une relecture du code de
la 1.12.0. **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en
**1.12.0** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.12.0`. Une version
mineure : rien de la 1.11.0 n'est retiré (`check:api` vert ; seuls ajouts, et `autoColumns<T, C>` que tu as accepté).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit de la 1.12.0
npm ci
npm run release:check     # « Release check: the 5 packages at 1.12.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE` (relancer la même commande si le code expire).

**B. Par l'étiquette** (si le « trusted publisher » est déclaré sur les cinq) : `git tag v1.12.0 && git push origin v1.12.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.12.0 ajoute

- **`reload()`** : redemande les données puis redessine — `grid.api.reload()`, `ctrl.reload()` d'Angular (c'est le
  même chemin), `el.reload()` de `<dz-grid>`. `refresh()` ne fait que redessiner. Sur des lignes données par
  l'application : rien à chercher, elles sont recalculées et redessinées.
- **Chaque apparence est une variable** (38 nouvelles, chacune une clé de `theme`, valeur par défaut = l'apparence
  d'avant) : texte des lignes survolées / sélectionnées, séparateur court entre colonnes, dernière ligne et dernière
  colonne, boutons et marges des titres, champs, boutons, popups, infobulle (taille, police, marges, flèche), voile,
  pied. Le tableau du guide les liste toutes (un test échoue s'il en manque une, en anglais et en français).
- **`icons.sortNone`**, et les icônes de l'application jamais rognées ni recouvertes (copies `*.unlayered.css` aussi).
- **L'infobulle dit son côté** et, avec `variables.css`, a une flèche vers le milieu de sa cellule.
- **`autoColumns<Ligne, DzgColumnDef<Ligne>>`** : des colonnes Angular avec un composant dans `ui.cell`, sans cast
  (`override`, `merge`, `add`).

## Infobulles riches → `@dztooltip` (ta décision du 2026-11-14, « ok partout »)

- **Les tons, placements, formes, animations (dont `morph`), les infobulles partout dans la page et les bulles qui
  restent** sont partis, avant publication, dans leurs propres paquets : DzTooltip (`@dztooltip/core`,
  `@dztooltip/angular`, `@dztooltip/theme`, et le pont `@dztooltip/dzgrid` : `features: [dzTooltips({ … })]`), dans
  `/Users/nadou/Dev/dztooltip`. DzGrid ne publie **aucune** des entrées `@dzgrid/dom/tooltip`, `/popover`,
  `@dzgrid/angular/tooltip`, `/popover`, `@dzgrid/theme/tooltips.css` (jamais publiées ; retirées de `api/*.api.txt`
  avec la ligne d'historique « owner 2026-11-14: rich tooltips moved to @dztooltip, never published »).
- **DzGrid garde** son infobulle simple (celle de la 1.11, ses variables et sa flèche), et :
  - **par colonne en une ligne** : `tooltip: true` (le texte affiché), `tooltip: { when: 'truncated' }` (seulement
    quand il est coupé), `tooltip: false` (aucune), les options `{ text, when, delayMs, content }` ; `tooltips: { cells:
    false | 'truncated' }` pour toute la grille ; `headerTooltip` en mots ou en `{ text }` ;
  - **une couture** (`FeatureHandle.tooltips` : `TooltipSeam`, `TooltipShow`, `TipFor`) par laquelle une fonction
    prend la main sur les infobulles des cellules et des titres : la grille décide quand et quoi, la fonction où et
    comment. Le pont de DzTooltip l'utilise ; un test montre qu'une fonction quelconque peut le faire.
  - une apparence (`tone`, `placement`, `animation`, `shape`, `style`, `maxWidth`, `html`) sans fonction qui dessine :
    la grille affiche les mots et le signale une fois (`missing-feature`).
- **Ta décision « A »** : `ColumnDef.tooltip` (fonction | booléen | `ColumnTooltip`) et `headerTooltip` (mots |
  `TooltipSpec`) acceptés dans `check:api`.
- Corrigé aussi : le bouton Réessayer garde son anneau de focus (il prenait l'allure du pied).
- Tailles : base `@dzgrid/dom` 25 800 → 25 700 (mesuré 25 653) ; K.8 91 831 / 92 000 ; `@dzgrid/dom/theme` 2 513 / 2 530 ;
  appli Angular réelle 102 925 / 103 050 (ligne laissée).

## Deux corrections avant publication (ta réponse « oui », 2026-11-14)

1. **Une infobulle en attente n'apparaît plus en retard** (`tooltips.md` 12) : un appui sur une cellule ou un titre,
   Échap ou le focus qui quitte la grille annulent l'affichage encore en attente ; un doigt seul n'en ouvre jamais.
   Aucune API nouvelle.
2. **`--dzg-pager-button-disabled-border`** (défaut : le bord du bouton, comme aujourd'hui), et pour la symétrie
   `--dzg-pager-button-hover-border` / `-active-border` (`pager.css`). La liste « Lignes par page » n'est jamais
   désactivée : pas de variable pour cet état. Tableau des variables du site à jour (en, fr).

Tailles : `pager.css` 760 → 775 (+2 %, mesuré 767).

## Icônes de la pagination (ta demande du 2026-11-14)

- **`icons: { pagerFirst, pagerPrevious, pagerNext, pagerLast }`** (avec `theming()`) : les « « ‹ › » » deviennent tes
  icônes SVG, nettoyées comme les autres. Chacune dessinée seulement si tu la donnes (sinon le caractère d'avant), dans
  la couleur du bouton (grisée quand il ne peut pas agir), à la taille de son texte ou `--dzg-icon-size`, inversée en
  arabe (dessine-les pour la gauche à droite). Les noms des boutons ne changent pas.
- Tailles : `@dzgrid/dom/theme` 2 499 → 2 530 (mesuré 2 513, les infobulles riches parties : les quatre clés) ; le
  dessin est dans le CSS de `pagination()` (3 366 / 3 450).

## Ce que la relecture a corrigé

- **Une infobulle près du bas de la fenêtre** dépassait de la taille de sa flèche (≈ 6 px) avant de passer au-dessus :
  la flèche est maintenant comptée (vu dans Chrome, en français et en arabe ; un contrôle de la matrice navigateurs le
  garde).
- **`ctrl.reload()` d'Angular** passe par `api.reload()` de la grille, comme l'élément. `ctrl.refresh({})` garde son
  chemin (même requête, même état, mêmes lignes : un test compare les trois) ; le faire passer aussi par `reload()`
  coûte 17 o de K.8 — à toi de dire.
- **Dernière ligne** : c'est la dernière ligne affichée du corps, quelle qu'elle soit (groupe fermé, dernier enfant,
  total général, détail ouvert), jamais une ligne épinglée — décidé, écrit, testé.
- **Le plancher de 80 px** relève aussi un `width` plus petit donné par l'application (comme le minimum de 40 px
  avant) ; un `minWidth` le garde plus étroit. Écrit dans la fiche et le CHANGELOG.

## Les cinq corrections (ta réponse « oui lance les 5 corrections », 2026-11-13)

Chacune : une ligne de fiche d'abord (`presentation-settings.md` 34–38, `filter-set.md` « The list's width »), un test
écrit à la main et rouge d'abord, la matrice navigateurs étendue (elle échouait avant la correction).

1. **Le titre d'une colonne envoyé au bout de la colonne** (Tailwind 3, copies sans couche). Cause : le bouton de
   filtre (et le ⋮) étaient poussés au bout par une marge automatique ; le `button { margin: 0 }` du preflight
   (sans couche) l'enlève, et la cellule rangée « à la fin » depuis la 1.11.0 (colonnes étroites) envoyait alors tout
   au bout. Corrigé par un élément vide qui grandit avant les boutons (une taille : aucune remise à zéro courante n'y
   touche), dans la mise en page des filtres (injectée : copies en couche et sans couche pareil) et `columns.css`.
   **K.8 91 000 → 92 000** (ta réponse « tu peux augmenter » ; mesuré 91 037).
2. **`--dzg-sort-none-fg`** : la couleur de la marque « non triée » à part (par défaut celle du tri).
3. **Les boutons des fenêtres** (Effacer, Appliquer, ajouter / retirer, raccourcis, Réessayer ; la pagination à part, plus bas) : 12
   variables (graisse, marge latérale, hauteur, survol, appui ; le bouton principal et ses états), défauts = l'aspect
   d'aujourd'hui. **Nouvelle feuille `@dzgrid/theme/buttons.css`** (après `variables.css`) : `variables.css` n'avait
   plus la place sous sa ligne (+2 %).
4. **Tout le texte d'une ligne survolée ou sélectionnée dans la couleur de la ligne, au choix** :
   `data-dzg-row-fg="force"` sur l'hôte de la grille. Et `--dzg-row-state-fg` pour qu'un composant de cellule suive
   sans l'interrupteur.
5. **La liste d'un filtre par valeurs aussi large que sa plus longue valeur** (une seule mesure, toutes les valeurs dans une
   copie cachée d'une étiquette, sans poser de ligne ; jamais pendant une recherche ; entre `--dzg-set-list-min-width` 14rem et `--dzg-set-list-max-width`
   `min(32rem, 90vw)` ; au-delà, points de suspension et texte entier en infobulle).

## La pagination à part (ta réponse « oui ajoute-les », puis « donne la possibilité de styler la pagination »)

Fiche `presentation-settings.md` 39–40 d'abord, tests écrits à la main et rouges d'abord, matrice navigateurs étendue
(elle échouait avant).

- **Les boutons de la pagination ne lisent plus les variables des boutons des fenêtres** (`--dzg-button-*`, même
  `-bg` et `-border` de la 1.9.0) : « Effacer » dessiné en lien ne rend plus la pagination sans bord. Seule la taille
  du texte est commune (`--dzg-pager-button-font-size` se rabat sur `--dzg-button-font-size`). Une appli qui stylait
  la pagination par `--dzg-button-*` passe à `--dzg-pager-button-*` (avec `pager.css`).
- **Toute la bande stylable par variables** (**nouvelle feuille `@dzgrid/theme/pager.css`**, après `variables.css` ;
  `buttons.css` n'avait plus la place sous sa ligne — 922 o pour 500 ; défauts = l'aspect d'aujourd'hui) : la bande
  (`--dzg-footer-line`, marges, hauteur, écart, taille, `-justify`, `-align`), la place des boutons
  (`--dzg-pager-margin-inline-start`), les textes (« 1 à 100 sur 150 », « Page 1 sur 2 », « Lignes par page », la
  sélection : couleur, graisse, taille), les boutons (fond, texte, bord, coins, marge, taille, survol, appui,
  inactif), la liste « Lignes par page » (les mêmes, qui suivent ceux des boutons par défaut), l'anneau de focus.
  `--dzg-button-font-size` pour les boutons des fenêtres et Réessayer.
- **À toi de dire** : ce sont des variables CSS seulement, pas des clés de `theme` — 43 clés coûteraient ≈ 170 o à
  `@dzgrid/dom/theme` (2 490 / 2 499, au-delà des +2 %). Les noms de la bande sont `--dzg-footer-*` (comme
  `--dzg-footer-bg` / `-fg` déjà là : la bande sert aussi à la barre d'état), ceux de la pagination `--dzg-pager-*`.
- **Pas atteignable sans changer la structure** : la flèche de la liste (celle du navigateur, dans la couleur du
  texte ; une couleur à part demanderait de la dessiner nous-mêmes, `appearance: none`) ; un repère de page courante
  (il n'y en a pas : pas de liste de numéros). L'ordre et les parties : `pagination({ footer })` ; la liste cachée
  avec moins de deux tailles (`pagination: { pageSizes }`).

Tailles : **K.8 91 037 / 92 000** (ligne relevée, « tu peux augmenter ») ; +2 % par ligne : `/filters` 12 250,
`/filters-base` 12 200, `columns.css` 1 224, `variables.css` 1 938, `@dzgrid/dom/theme` 2 499 (les clés de `theme` en
une chaîne), l'appli Angular réelle 102 150 (mesuré 102 115) ; `buttons.css` nouvelle, 500 ; `pager.css` nouvelle, 760 (mesuré 738).

## À regarder après (CHANGELOG « Upgrading from 1.11.0 »)

- Le bord discret des champs de filtre en mode clair (`--dzg-input-border: none` l'enlève).
- Une colonne avec bouton de filtre et sans `minWidth` fait au moins 80 px.
- L'infobulle à la taille des cellules ; avec `variables.css`, sa flèche et 6 px de plus entre elle et sa cellule.
- `data-last-row` / `data-last-col` sur la dernière ligne et la dernière colonne (les traits par défaut sont ceux
  d'avant).
- La fenêtre d'un filtre par valeurs plus large quand une valeur est longue (`--dzg-set-list-max-width: 14rem` rend
  l'ancienne largeur).

Tailles (avant les cinq corrections) : K.8 (profil esbuild) 90 997 / 91 000 ; base DOM 25 169 / 25 200 ; Angular 8 599 / 8 650. **Appli Angular réelle
102 079 / 101 700 : au-dessus — `release:check` s'arrête là, à toi de décider** (la ligne relevée par la règle des
+2 % serait 102 100 ; la 1.12.0 telle que commitée mesurait déjà ≈ 17 o de moins au profil esbuild, donc déjà au-dessus).
