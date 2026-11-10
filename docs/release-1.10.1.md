# Publier DzGrid 1.10.1 — la liste du propriétaire

Préparé le 2026-11-10 (ta réponse « A » : les quatre défauts trouvés en écrivant le site). **Rien n'est publié, aucune
étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en **1.10.1** (`@dzgrid/core`, `dom`,
`theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.10.1`. Un correctif : rien de la 1.10.0 n'est retiré
(`check:api` vert après ton accord sur `LAYOUT_CSS`).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.10.1 »
npm ci
npm run release:check     # « Release check: the 5 packages at 1.10.1. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE` (relancer la même commande si le code expire).

**B. Par l'étiquette** (si le « trusted publisher » est déclaré sur les cinq) : `git tag v1.10.1 && git push origin v1.10.1`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.10.1 corrige

- **Une grille avec peu de lignes remplit maintenant son conteneur** (hauteur fixe, colonne flex, part de flex) :
  la racine de la grille ne grandissait pas. Vu dans Chrome, Firefox et WebKit avec 3 et 10 000 lignes, en
  TypeScript, avec l'hôte d'Angular et avec l'élément.
- **`<dz-grid>` (l'élément) posé directement dans un hôte flex** remplit la hauteur, comme celui d'Angular.
- **Un build depuis les sources du dépôt** (le site) garde `import '@dzgrid/element/define'` ; le paquet publié
  reste le même (`./define.js`).
- **Le guide et le site** disent que `filters-base` ne donne aucun filtre aux colonnes de jours (un avertissement) ;
  les filtres de jours viennent de `@dzgrid/dom/filters`.

## À regarder après (CHANGELOG « Upgrading from 1.10.0 »)

- **Bordure comprise dans la hauteur** : une appli qui fixe elle-même la hauteur de `.dzg` (`block-size: 360px`)
  obtient 360 px en tout, 2 px de moins qu'avant.
- **L'élément porte `data-dzg-host`** et n'a plus de boîte à lui, même sous un parent flex ou grid ; une page qui veut
  une boîte écrit son `display` (sa règle gagne). L'hôte d'Angular ne change pas.

Tailles : K.8 90 105 / 91 000 (1.10.0 : 90 077) ; base DOM 24 749 / 24 750.
