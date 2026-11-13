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

## À regarder après (CHANGELOG « Upgrading from 1.11.0 »)

- Le bord discret des champs de filtre en mode clair (`--dzg-input-border: none` l'enlève).
- Une colonne avec bouton de filtre et sans `minWidth` fait au moins 80 px.
- L'infobulle à la taille des cellules ; avec `variables.css`, sa flèche et 6 px de plus entre elle et sa cellule.
- `data-last-row` / `data-last-col` sur la dernière ligne et la dernière colonne (les traits par défaut sont ceux
  d'avant).

Tailles : K.8 (profil esbuild) 90 997 / 91 000 ; base DOM 25 169 / 25 200 ; Angular 8 599 / 8 650. **Appli Angular réelle
102 079 / 101 700 : au-dessus — `release:check` s'arrête là, à toi de décider** (la ligne relevée par la règle des
+2 % serait 102 100 ; la 1.12.0 telle que commitée mesurait déjà ≈ 17 o de moins au profil esbuild, donc déjà au-dessus).
