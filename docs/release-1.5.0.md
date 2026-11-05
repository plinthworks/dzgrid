# Publier DzGrid 1.5.0 — la liste du propriétaire

Préparé le 2026-11-05 (Phase 7 : regroupement et totaux ; Phase 8 : défilement infini et groupes chargés par le serveur). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les quatre paquets sont en **1.5.0** (`@dzgrid/core`, `dom`, `theme`, `angular`), leurs pairs `@dzgrid/*` en
`^1.5.0`. Une version mineure : rien de la 1.4.0 n’a été retiré (`npm run check:api`).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.5.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the four packages at 1.5.0. »
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
git tag v1.5.0
git push origin v1.5.0
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

`^1.0.0` accepte déjà la 1.5.0. À lire avant (CHANGELOG « Upgrade notes ») : `[(selected)]` ou `(selectionChanged)`
(l'un ou l'autre) ; les clés ne sont pas des id (`selectedIds()`) ; l'impression (`print.css` ou `print.unlayered.css`) ;
la feuille de confort (`dzgrid.comfort.css`) pour garder les barres fines et le spinner.

## Ce que la 1.5.0 ajoute (tout est à activer, rien ne change seul)

- **Regroupement** `@dzgrid/dom/grouping` (+ `grouping.css`) : groupes sur une ou plusieurs colonnes, totaux (somme
  exacte, moyenne, min, max, nombre, premier, dernier, ou la fonction de l'appli), pieds de groupe, total général,
  `totals()` ; Entrée ouvre et ferme ; export Excel / CSV et impression avec les groupes ; état sauvegardé.
- **Zone « Regrouper par »** `@dzgrid/dom/group-zone` et « Regrouper par cette colonne » dans le menu de colonne.
- **Défilement infini** `infiniteRows` (`@dzgrid/core/infinite`) : blocs de 100, 20 gardés, lignes « Chargement… » et
  « Réessayer », 10 millions de lignes, mises à jour en direct groupées.
- **Groupes chargés par le serveur** `serverSideRows` (`@dzgrid/core/server-side`) : chaque groupe à l'ouverture,
  totaux du serveur.
- **Angular** : `[(groupBy)]`, `controller.grouping()`, `refresh({ purge })`, `applyTransaction(Async)`.

Pages locales pour essayer : `regroupement.html`, `infini.html`, `groupes-serveur.html` (`npm start`, port 4700).
