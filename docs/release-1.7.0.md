# Publier DzGrid 1.7.0 — la liste du propriétaire

Préparé le 2026-11-07 (Phase 10 : le tableau croisé, et la finition visuelle des panneaux). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les quatre paquets sont en **1.7.0** (`@dzgrid/core`, `dom`, `theme`, `angular`), leurs pairs `@dzgrid/*` en
`^1.7.0`. Une version mineure : rien de la 1.6.0 n’a été retiré (`npm run check:api`).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.7.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the four packages at 1.7.0. »
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
git tag v1.7.0
git push origin v1.7.0
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

`^1.0.0` accepte déjà la 1.7.0. À lire avant (CHANGELOG « Upgrade notes ») : `[(selected)]` ou `(selectionChanged)`
(l'un ou l'autre) ; les clés ne sont pas des id (`selectedIds()`) ; l'impression (`print.css` ou `print.unlayered.css`) ;
la feuille de confort (`dzgrid.comfort.css`) pour garder les barres fines et le spinner.

## Ce que la 1.7.0 ajoute (tout est à activer, rien ne change seul)

- **Le tableau croisé (pivot)** : `pivot({ columns, values })` donné à `grouping({ by, pivot })` ; lignes × colonnes
  créées × valeurs, en-têtes sur plusieurs lignes, colonne « Total », total général, sous-totaux en option, au-delà
  de 200 colonnes un message ; tri par un total, ↑/↓ pour inverser, mois repliables ; export Excel / CSV, impression,
  état sauvegardé ; `series()` pour une bibliothèque de graphiques.
- **La barre « Lignes │ Colonnes │ Valeurs »** `pivotBar()` et l'interrupteur `pivot({ toggle })` que l'appli place ;
  le panneau des colonnes (dans le dock) commence par « Mode pivot » et les trois parties.
- **Les deux bandes vides** : le tableau normal revient.
- **Finition visuelle** : boutons, puces, liste des colonnes, en-tête du dock.

Page locale pour essayer : `pivot.html` (`npm start`, port 4700).
