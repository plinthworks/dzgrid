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

## Ce qui a été vérifié (2026-10-28)

Voir ROADMAP « Phase 6 — close » : le portail complet (vitest, `test:perm`, `test:tz`, `typecheck`, `build`,
`check:size`, `check:contrast`, l'exemple Angular, `release:check`), les navigateurs (Chrome complet, Firefox,
WebKit), la page « vraie application » (`npm run test:real-app`), `npm run publish:dry` (les quatre acceptés).
