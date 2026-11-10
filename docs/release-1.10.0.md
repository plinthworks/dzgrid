# Publier DzGrid 1.10.0 — la liste du propriétaire

Préparé le 2026-11-10 (tes réponses à la revue de présentation : lignes 1.4, 1.5, 1.8, 5.7, 6.5 ; puis la revue de code
de la version). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont
en **1.10.0** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.10.0`. Une version
mineure : rien de la 1.9.0 n'a été retiré (`npm run check:api` : ajouts seulement).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.10.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, compile chaque entrée publiée, le mesure, puis :
                          # « Release check: the 5 packages at 1.10.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** — un seul code à 6 chiffres pour les cinq :

```sh
npm whoami                               # luffysamy
npm run publish:latest -- --otp=CODE     # build, puis core → dom → theme → angular → element, puis vérifie sur npm
```

Si le code expire au milieu : relance la même commande, ce qui est déjà publié est sauté.

**B. Par l'étiquette** — seulement si le « trusted publisher » est déclaré sur **les cinq** paquets :

```sh
git tag v1.10.0
git push origin v1.10.0
```

## Vérifier

```sh
npm run publish:verify    # les cinq sont sur npm
```

## Dans les applications

```sh
npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

`^1.0.0` accepte déjà la 1.10.0. À regarder après (CHANGELOG « Upgrading from 1.9.0 ») :

- **Colonnes oui / non traduites** : une colonne `type: 'boolean'` affiche Oui / Non (Yes / No, نعم / لا) au lieu
  de `true` / `false` — cellule, impression, liste du filtre, fichiers « comme affiché » ; la recherche rapide trouve
  « oui ». Le CSV par défaut, le presse-papiers et Excel gardent `true` / `false` (relus dans toutes les langues). Un
  paquet de textes de l'appli sans `cell.yes` / `cell.no` garde `true` / `false`.
- **`headerHeight` accepte un objet** : son type devient `number | HeaderHeights`. Rien à faire si l'appli le donne
  seulement ; du code qui le relit comme un nombre doit d'abord vérifier que c'en est un.
- **Groupes de colonnes + titres verticaux** : un titre sans groupe au-dessus descend maintenant jusqu'en bas de la
  rangée des titres quand elle a grandi (avant, un petit vide dessous).

## Ce que la 1.10.0 ajoute (tout est à activer, rien ne change seul)

- **Rangées des groupes à part** : `headerHeight: { columns: 70, groups: 30 }` (un nombre garde son sens).
- **Hauteur de la ligne de filtres** : `filters({ rowHeight })`.
- **Colonnes ajustées au chargement** : `columns({ fitOnLoad: 'content' })`, et `fitContent()` pour le refaire.
- **Titres sur plusieurs lignes** : `headerWrap: true` sur la colonne et `wrappedHeaders({ maxLines })`.
- **Colonne sous la souris** : `columnHover()` et la variable `--dzg-column-hover-bg`.
- **Décidé** : la hauteur de la grille vient toujours de son conteneur (pas de mode « aussi haute que ses lignes ») ;
  le multi-feuilles est parqué (le plan reste).

## La revue de la version (corrigé avant publication)

- **Oui / non dans la langue de la grille** (ton rapport du 2026-11-10) : vu dans Chrome en français et en arabe.

- **Groupes de colonnes + rangée des titres agrandie** (titres verticaux ou sur plusieurs lignes) : le titre sans
  groupe au-dessus s'arrêtait trop haut, et les étiquettes collantes des cellules fusionnées glissaient sous l'en-tête.
  Vu dans Chrome, corrigé.
- **`columnHover()` avec une grille dans une ligne de détail** : la grille intérieure ne déplace plus la colonne de la
  grille extérieure.
- **Une hauteur impossible à écrire en JSON** (`rowHeight: 10n`) ou un objet sans prototype faisait une erreur ;
  maintenant signalé comme toute mauvaise hauteur.

Tailles : **K.8 relevée de 90 000 à 91 000 o** (ta décision du 2026-11-10, « augmente la limite ») — mesuré 90 077 ; le reste
en règle +2 % : base DOM 24 550 → 24 750 (mesuré 24 721), core/detail 1 170, dom/columns 4 250 (bruit gzip) ;
la ligne de l'exemple Angular réel 101 000 → 101 500 (règle +2 %, mesuré 101 165).

**À toi avant de publier** : `check:api` signale `EN`, `FR`, `AR` « changés » — deux clés ajoutées (`cell.yes`,
`cell.no`), rien de retiré. Si tu l'acceptes :
`node scripts/api.mjs --accept "owner 2026-11-10: yes / no words added to the base bundles" --only "@dzgrid/dom/locales/en#EN,@dzgrid/dom/locales/fr#FR,@dzgrid/dom/locales/ar#AR"`.

Pages locales pour essayer : `npm start` (port 4700), boutons « 1.10 » dans `playground/nouveautes-1-9`.
