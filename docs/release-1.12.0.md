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
3. **Les boutons des fenêtres** (Effacer, Appliquer, ajouter / retirer, raccourcis, pagination, Réessayer) : 12
   variables (graisse, marge latérale, hauteur, survol, appui ; le bouton principal et ses états), défauts = l'aspect
   d'aujourd'hui. **Nouvelle feuille `@dzgrid/theme/buttons.css`** (après `variables.css`) : `variables.css` n'avait
   plus la place sous sa ligne (+2 %).
4. **Tout le texte d'une ligne survolée ou sélectionnée dans la couleur de la ligne, au choix** :
   `data-dzg-row-fg="force"` sur l'hôte de la grille. Et `--dzg-row-state-fg` pour qu'un composant de cellule suive
   sans l'interrupteur.
5. **La liste d'un filtre par valeurs aussi large que sa plus longue valeur** (une seule mesure, toutes les valeurs dans une
   copie cachée d'une étiquette, sans poser de ligne ; jamais pendant une recherche ; entre `--dzg-set-list-min-width` 14rem et `--dzg-set-list-max-width`
   `min(32rem, 90vw)` ; au-delà, points de suspension et texte entier en infobulle).

Tailles : **K.8 91 037 / 92 000** (ligne relevée, « tu peux augmenter ») ; +2 % par ligne : `/filters` 12 250,
`/filters-base` 12 200, `columns.css` 1 224, `variables.css` 1 938, `@dzgrid/dom/theme` 2 499 (les clés de `theme` en
une chaîne), l'appli Angular réelle 102 150 (mesuré 102 115) ; `buttons.css` nouvelle, 500.

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
