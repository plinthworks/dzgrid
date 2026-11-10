# Publier DzGrid 1.9.0 — la liste du propriétaire

Préparé le 2026-11-10 (lots A et B, réglages de présentation, puis la revue de code de la version). **Rien n'est
publié, aucune étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en **1.9.0**
(`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.9.0`. Une version mineure :
rien de la 1.8.0 n'a été retiré (`npm run check:api` ; `LAYOUT_CSS` changé, accepté par toi le 2026-11-09).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.9.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, compile chaque entrée publiée
                          # (nouveau garde-fou), le mesure, puis :
                          # « Release check: the 5 packages at 1.9.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** — un seul code à 6 chiffres pour les cinq :

```sh
npm whoami                               # luffysamy
npm run publish:latest -- --otp=CODE     # build, puis core → dom → theme → angular → element, puis vérifie sur npm
```

Si le code expire au milieu : relance la même commande, ce qui est déjà publié est sauté.

**B. Par l'étiquette** — seulement si le « trusted publisher » est déclaré sur **les cinq** paquets (vérifie
`@dzgrid/element` → Settings → Trusted Publisher : `plinthworks` / `dzgrid` / `release.yml`) :

```sh
git tag v1.9.0
git push origin v1.9.0
```

GitHub refait tout (build, exemple Angular construit, entrées compilées, mesuré, tests, tailles, contraste, contrôle de
version), puis publie avec provenance, sans jeton.

## Vérifier

```sh
npm run publish:verify    # les cinq sont sur npm
```

## Dans les applications

```sh
cd /Users/nadou/Dev/allergie-detector/admin-web   # (ou une autre appli)
npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

`^1.0.0` accepte déjà la 1.9.0. À regarder après (CHANGELOG « Upgrading from 1.8.0 ») :

- **Titres des colonnes nombres** : ils suivent maintenant l'alignement de leur colonne (à droite au-dessus des
  nombres, à gauche en arabe). Pour garder l'ancienne place : `headerAlign: 'start'` sur la colonne.
- **Chiffres de largeur égale** dans les cellules nombres ; `--dzg-num-figures: normal` pour revenir.
- **La densité règle aussi la marge des cellules** (compacte plus serrée, spacieuse plus large ; « comfortable »
  inchangée). Marges fixes : `.dzg { --dzg-density: 1 }`.
- **Avec `responsive()`** : Entrée et Espace sur la première cellule ouvrent les lignes repliées tant que des colonnes
  sont repliées (Espace n'y coche donc plus la ligne). Sans `responsive()`, rien ne change.
- **`LAYOUT_CSS`** : une constante plus longue. Rien à faire si l'appli l'injecte seulement.

## Ce que la 1.9.0 ajoute (tout est à activer, rien ne change seul)

- **Colonnes depuis les données** : `autoColumns(rows, { … })` (`@dzgrid/core/auto-columns`).
- **Ligne de totaux** : `total: 'sum'…` sur une colonne et `totalsRow()` avec `pinnedRows()` ; écrite dans CSV, Excel
  et l'impression.
- **Export JSON** : `run(scope, { format: 'json' })`.
- **Titres verticaux** (`verticalHeaders()`), **en-têtes masqués** (`headers: 'hidden'`), **en-tête plus haut**
  (`headerHeight`).
- **Colonnes repliées sous la ligne** sur écran étroit : `responsive()`.
- **Importer un CSV ou un Excel** : `fileImport({ onRows })` — l'appli décide quoi faire des lignes.
- **Réglages de présentation** : `theme: { … }` et `icons` avec `theming()` (`@dzgrid/dom/theme`), la feuille
  `@dzgrid/theme/variables.css`, lignes alternées, ombre des colonnes épinglées.

## La revue de la version (corrigé avant publication)

- **Import d'un `.xlsx` hostile** : une « bombe ZIP » est refusée (128 Mio décompressés au plus) ; une référence de
  cellule lointaine ne remplit plus des millions de cases ; un XML mal fermé se lit en un passage (plus de temps
  quadratique) ; une référence de caractère invalide ne fait plus d'erreur.
- **Icônes** : un échappement CSS (`\`) et un DOCTYPE sont refusés. **`theme`** : `image(`, `image-set(`, `src(`
  refusés comme `url(`.
- **Totaux + `responsive()`** : le total d'une colonne repliée manquait dans CSV / Excel.
- **Garde-fou permanent** : `release:check` compile, dans l'exemple Angular réel (gabarits stricts, `skipLibCheck:
  false`), un composant qui importe **chaque entrée publiée** des cinq paquets, lues dans leurs `exports` : une
  nouvelle entrée est couverte toute seule (`npm run example:entries`).

Taille : la ligne de l'exemple Angular réel passe de 100 000 à 101 000 o (règle +2 %, mesuré 100 752 : la base 1.9.0) ; K.8 89 732 / 90 000.

Pages locales pour essayer : `npm start` (port 4700).
