# Publier DzGrid 1.6.0 — la liste du propriétaire

Préparé le 2026-11-06 (déplacement de lignes et dock). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les quatre paquets sont en **1.6.0** (`@dzgrid/core`, `dom`, `theme`, `angular`), leurs pairs `@dzgrid/*` en
`^1.6.0`. Une version mineure : rien de la 1.5.0 n’a été retiré (`npm run check:api`).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.6.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the four packages at 1.6.0. »
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
git tag v1.6.0
git push origin v1.6.0
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

`^1.0.0` accepte déjà la 1.6.0. À lire avant (CHANGELOG « Upgrade notes ») : `[(selected)]` ou `(selectionChanged)`
(l'un ou l'autre) ; les clés ne sont pas des id (`selectedIds()`) ; l'impression (`print.css` ou `print.unlayered.css`) ;
la feuille de confort (`dzgrid.comfort.css`) pour garder les barres fines et le spinner.

## Ce que la 1.6.0 ajoute (tout est à activer, rien ne change seul)

- **Déplacer des lignes** `@dzgrid/dom/row-drag` (+ `row-drag.css`) : poignée ⠿, plusieurs lignes, l'arbre (dedans /
  avant / après), Alt+Maj+flèches, menu de cellule, vers une autre grille ou une zone ; l'événement `rowMove` et
  `moveRows()` pour l'appli (NgRx), ou `apply: true`.
- **Le dock** `@dzgrid/dom/dock` (+ `dock.css`) : panneaux à gauche, à droite ou en bas, onglets (colonnes et
  filtres), redimensionner, replier, disposition sauvegardée.

Pages locales pour essayer : `deplacer.html`, `dock.html` (`npm start`, port 4700).
