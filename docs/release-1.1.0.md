# Publier DzGrid 1.1.0 — la liste du propriétaire

Préparé le 2026-10-28 (clôture de la Phase 6). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les quatre paquets sont en **1.1.0** (`@dzgrid/core`, `dom`, `theme`, `angular`), leurs pairs `@dzgrid/*` en
`^1.1.0`. Une version mineure : rien de la 1.0.0 n'a été retiré (vérifié contre les archives 1.0.0 publiées).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.1.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the four packages at 1.1.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac (comme la 1.0.0)** — un seul code à 6 chiffres pour les quatre :

```sh
npm whoami                               # luffysamy
npm run publish:latest -- --otp=CODE     # build, puis core → dom → theme → angular, puis vérifie sur npm
```

Si le code expire au milieu : relance la même commande, ce qui est déjà publié est sauté.

**B. Par l'étiquette** — seulement si le « trusted publisher » est déclaré sur les quatre paquets
(npmjs.com → paquet → Settings → Trusted Publisher : `plinthworks` / `dzgrid` / `release.yml`) :

```sh
git tag v1.1.0
git push origin v1.1.0
```

GitHub refait tout (build, exemple Angular construit et mesuré, tests, tailles, contraste, contrôle de version), puis
publie avec provenance, sans jeton.

## Vérifier

```sh
npm run publish:verify    # « All four are on npm. »
```

## Dans les applications

```sh
cd /Users/nadou/Dev/allergie-detector/admin-web   # (ou une autre appli)
npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

`^1.0.0` accepte déjà la 1.1.0. À lire avant (CHANGELOG « Upgrade notes ») : `[(selected)]` ou `(selectionChanged)`
(l'un ou l'autre) ; les clés ne sont pas des id (`selectedIds()`) ; l'impression (`print.css` ou `print.unlayered.css`) ;
la feuille de confort (`dzgrid.comfort.css`) pour garder les barres fines et le spinner.

## Ajouté au contrôleur Angular (demande du propriétaire)

- `clearFilters()` : vide tous les filtres de colonne et la recherche, garde le tri ; une seule requête sur un
  serveur ; `(stateChanged)` suit. `false` avant la grille.
- `resetState()` (avec `gridState()`) : la grille telle que définie à sa création — colonnes, groupes, tri, filtres,
  recherche, page, densité — en une requête ; `(stateChanged)` suit, sans boucle avec `[state]`. `null` sans la
  fonctionnalité ou sans la grille. Côté DOM : `gridState().api(grid).reset()`.

## Ajouté au filtre par valeurs (propriétaire, 2026-10-29)

- `ColumnDef.filter: { kind: 'set', exclude: false }` : la liste n'écrit que « pas de filtre » ou
  `{ type: 'set', include: [...] }`, jamais `exclude` ni `blanks` (tout coché sur une liste complète = pas de filtre ;
  pas de ligne « (Vides) »). Un `exclude` ou un `blanks` venu d'ailleurs sur une telle colonne est ignoré avec
  `invalid-filter` (`filter.<col>.exclude` / `.blanks`), dans le navigateur et dans la requête au serveur.
- Limites relevées par le propriétaire (2026-10-29) : morceau « set » 4 250 → 4 350 (4 339), K.8 84 900 → 84 950
  (84 902), `core/edit` 3 150 → 3 160 (3 155), `core/state` 1 500 → 1 510 (1 506), garde de la base du cœur
  29 001 → 29 070 (29 064 ; `@dzgrid/core` reste 29 150).

## Ajouté pour l'écran « arbre » (propriétaire, 2026-10-29)

- `fill(blocks, { along: 'row' })` : la poignée de recopie, son clic sans glisser, le mode clavier et `api.fill` ne
  recopient que le long de la ligne (`'column'` : vers le haut ou le bas). Ctrl/Cmd+D n'est plus pris avec `'row'`
  (Ctrl/Cmd+R avec `'column'`). Le menu ⋮ garde « Recopier vers le bas » : l'app le retire
  (`columnMenu({ items: (col, d) => d.filter((i) => i.id !== 'fill.down') })`). Une autre valeur : les deux sens et un
  avertissement `invalid-setting`.
- `motion({ effects: { flash: { hold: 3000, fade: 1000 } } })` : la marque reste pleine 3 s puis s'efface en 1 s, pour
  les changements en direct et après un enregistrement ; en mouvement réduit, marque fixe 4 s. Sans l'option : comme
  avant (0,6 s).
- `tree({ fixedOpen: (row) => boolean })` : ces lignes sont toujours ouvertes, sans flèche ni sa place de 24 px ; ←, `*`,
  « tout replier » et `rows.expand(false)` ne les ferment pas ; `aria-expanded="true"` reste. Les autres parents gardent
  leur flèche. Pour leur style : `rowClass` et du CSS.
- Limites relevées (accord du propriétaire, 2026-10-29) : `dom/tree` 3 850 → 3 950 (3 863, la marge restante pour
  l'étape 15), `theme/edit.css` 2 200 → 2 250 (2 222). K.8 reste à 84 950 (84 901 mesuré : la hausse à 85 000 n'a pas
  servi).

## Ce qui a été vérifié (2026-10-28)

Voir ROADMAP « Phase 6 — close » : le portail complet (vitest, `test:perm`, `test:tz`, `typecheck`, `build`,
`check:size`, `check:contrast`, l'exemple Angular, `release:check`), les navigateurs (Chrome complet, Firefox,
WebKit), la page « vraie application » (`npm run test:real-app`), `npm run publish:dry` (les quatre acceptés).
