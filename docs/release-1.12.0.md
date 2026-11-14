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

## Infobulles et bulles (tes réponses du 2026-11-13 et Q-T1 B du 2026-11-14)

- **Où tu veux** : la colonne (`tooltip`, `headerTooltip`), toute la grille (`tooltips`), les boutons des titres
  (`tooltips: { header: true }` avec `features: [tooltips()]`), n'importe quel élément de la page (`tooltip(el, …)`,
  `[dzTooltip]` en Angular).
- **Tons** `info` (celui d'avant), `neutral`, `success`, `warning`, `danger`, lisibles en clair et en sombre.
- **Animations** CSS : `fade`, `scale`, `slide`, `none`, et deux plus riches à activer, `pop` et `rise` ; mouvement réduit
  = aucune animation, ou un fondu court avec `reducedMotion: 'fade'`. Ton animation à toi (`animate`, GSAP possible,
  jamais une dépendance de DzGrid), et une forme SVG à toi (`shape`) pour du morphing.
- **Placement** : `top`, `bottom`, `start`, `end`, `left`, `right` (+ `-start` / `-end`), `auto` ; bascule au bord
  (`flip: false` pour l'empêcher).
- **Tout contenu** : texte, nœuds, `<ng-template>`, composant, HTML nettoyé (sur demande : `safeHtml`).
- **Bulles qui restent** (`popover()`, `[dzPopover]`) : clic, Échap, clic dehors, Tab, code ; le focus entre et revient ;
  une ouverte par groupe ; même dans une cellule de grille.
- **Nouvelle feuille** `@dzgrid/theme/tooltips.css` (et sa copie sans couche), après `variables.css`.
- Tailles : base `@dzgrid/dom` 25 704 (+2 %, mesuré 25 690) ; nouvelles entrées à leur mesure + 10 % ; appli Angular
  réelle 102 700 (+0,5 %, mesuré 102 697) ; K.8 91 591 / 92 000.
- Corrigé aussi : le bouton Réessayer garde son anneau de focus (il prenait l'allure du pied).
- **Relecture du code des infobulles (2026-11-14)**, six défauts corrigés, chacun avec un test rouge d'abord : une bulle
  restait ouverte quand son déclencheur quittait la page ou que sa ligne de grille changeait sans défilement (tri, vue
  remplacée, grille détruite) ; Tab depuis la bulle elle-même (après un clic sur son texte) la fermait au lieu d'aller à
  son premier contrôle ; le déclencheur d'une bulle ouverte montrait encore son infobulle ; une infobulle passant d'un
  HTML à un texte identique gardait le HTML ; une grille détruite avec son infobulle affichée restait retenue par la
  page ; `[dzPopover]` détruit ouvert émettait `(closed)` sur une sortie détruite (avertissement NG0953 d'Angular).

## Trois corrections avant publication (ta réponse « oui », 2026-11-14)

Chacune : une ligne de fiche d'abord (`tooltips-popovers.md` 18–19, `presentation-settings.md` 40), un test écrit à la
main et rouge d'abord, la matrice navigateurs étendue.

1. **Une infobulle en attente n'apparaît plus en retard.** Un clic sur le déclencheur, le déclencheur désactivé, une
   bulle ouverte depuis lui, Échap ou le focus qui part n'annulaient pas l'affichage en attente : l'infobulle sortait
   ensuite, par-dessus la bulle ouverte. Cause : l'annulation ne visait qu'une infobulle déjà affichée. Maintenant :
   appui, clic, Échap, focus qui part, défilement, `disabled` (l'option, `dzTooltipDisabled`, ou l'attribut à la fin du
   délai), déclencheur retiré, bulle ouverte depuis le déclencheur ou depuis l'intérieur (une cellule qui le contient)
   l'annulent ; une bulle qui s'ouvre cache aussi l'infobulle affichée sur son déclencheur ou sa cellule. `tooltip()`,
   les infobulles des cellules et des titres de la grille (avec ou sans `tooltips()`), `[dzTooltip]`. Aucune API
   nouvelle.
2. **Infobulles et bulles hors grille en mode sombre.** Elles restaient claires : placées en fin de page, sans
   `color-scheme`, leurs `light-dark()` prenaient le clair. Elles prennent la règle de la grille
   (`color-scheme: var(--tz-color-scheme, light dark)`, injectée avec elles : copies en couche et sans couche pareil),
   héritent du mode de la page (un changement pendant qu'une bulle est ouverte est suivi tout de suite) et reprennent
   celui d'un conteneur à chaque ouverture. Tailwind 3 `.dark` : la correspondance de `tailwind3.css` suffit ; ta propre
   classe : `.my-dark { --tz-color-scheme: dark }` (recette dans le guide, en et fr).
3. **`--dzg-pager-button-disabled-border`** (défaut : le bord du bouton, comme aujourd'hui), et pour la symétrie
   `--dzg-pager-button-hover-border` / `-active-border` (`pager.css`). La liste « Lignes par page » n'est jamais
   désactivée : pas de variable pour cet état. Tableau des variables du site à jour (en, fr).

Tailles : base `@dzgrid/dom` 25 704 → 25 730 (+0,1 %, mesuré 25 724 ; le reste est dans `/tooltip` 2 753 / 2 800 et
`/popover` 3 350 / 3 450) ; `pager.css` 760 → 775 (+2 %, mesuré 767) ; K.8 91 918 / 92 000 ; appli Angular réelle 103 000 → 103 050 (+0,05 %,
mesuré 103 014).

## Icônes de la pagination (ta demande du 2026-11-14)

- **`icons: { pagerFirst, pagerPrevious, pagerNext, pagerLast }`** (avec `theming()`) : les « « ‹ › » » deviennent tes
  icônes SVG, nettoyées comme les autres. Chacune dessinée seulement si tu la donnes (sinon le caractère d'avant), dans
  la couleur du bouton (grisée quand il ne peut pas agir), à la taille de son texte ou `--dzg-icon-size`, inversée en
  arabe (dessine-les pour la gauche à droite). Les noms des boutons ne changent pas.
- Tailles : `@dzgrid/dom/theme` 2 510 → 2 530 (+0,8 %, mesuré 2 519 : les quatre clés) ; le dessin est dans le CSS de
  `pagination()` (3 366 / 3 450) ; K.8 91 873 / 92 000 ; appli Angular réelle 102 700 → 103 000 (+0,3 %, mesuré 102 965).

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
