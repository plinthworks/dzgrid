# Publier DzGrid 1.12.1 — la liste du propriétaire

Préparé le 2026-11-15 (ta remarque « pas du tout stylé, c'est moche » sur le panneau des colonnes ancré, dans ton
appli en sombre avec le preflight de Tailwind 3). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les **cinq** paquets sont en **1.12.1** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs pairs
`@dzgrid/*` en `^1.12.1`. Un correctif : rien retiré, aucun type public changé (`check:api` vert, rien signalé).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit de la 1.12.1
npm ci
npm run release:check     # « Release check: the 5 packages at 1.12.1. »
```

**À trancher avant** : deux lignes de taille au-delà de la règle des +2 % (voir « Tailles »). `check:size` est rouge
sur elles tant que tu n'as pas dit oui (ou demandé un panneau plus léger).

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE`.

**B. Par l'étiquette** : `git tag v1.12.1 && git push origin v1.12.1`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.12.1 change (fiche `presentation-settings.md` 42–43)

- **Le panneau des colonnes, une apparence soignée par défaut** (clair et sombre, gauche à droite et arabe, feuilles en
  couche ou non, avec ou sans le preflight) : la case et le nom sur une même ligne, centrés ; des lignes compactes de
  2rem, teintées au survol ; la recherche en un seul champ — une loupe, le texte en indication et comme nom accessible
  (plus d'étiquette au-dessus d'une case vide) ; une colonne qu'on ne peut pas masquer montre un cadenas grisé **à la
  place de sa case** (la case reste là, transparente, toujours atteinte et annoncée « indisponible ») ; « Tout
  afficher » et « Réinitialiser » suivent les variables des boutons de la grille (`--dzg-button-*`), après un trait.
  Dans le dock : le titre, puis « Replier », « Placer », « Fermer » en boutons carrés de même taille, chacun avec une
  infobulle égale à son nom. Les bords et traits sont dessinés pour qu'un `border-width: 0` de reset ne les efface pas.
- **Variables** (défaut = la nouvelle apparence) : `--dzg-panel-border`, `--dzg-panel-padding`, `--dzg-panel-gap`,
  `--dzg-panel-row-height`, `--dzg-panel-hover-bg`, `--dzg-panel-title-font-size`, `--dzg-panel-title-font-weight`
  (`--dzg-panel-bg` comme avant). Le tableau du guide (en, fr) les liste.
- **Un titre étroit garde son nom** : un titre avec un bouton de filtre, sous 6.5rem, montre d'abord son nom — au
  moins deux lettres et « … » à 80 px. Là, la marque « non triée » de l'appli n'est pas dessinée, et le bouton de filtre
  d'une colonne non filtrée ne prend pas de place tant que le titre n'est pas survolé ou n'a pas le focus (toujours
  atteint au clavier, nommé comme avant) ; la marque d'un tri et l'entonnoir d'une colonne filtrée restent. L'ajustement
  automatique mesure toujours le titre entier ; le minimum de 80 px ne change pas.
- Pas fait (ta décision si tu le veux) : une phrase propre au cadenas (« ne peut pas être masquée ») demanderait une
  nouvelle clé de texte, donc un changement de `ColumnsMessages` (API). Aujourd'hui : l'état « indisponible » de la case,
  et « dernière colonne affichée » quand c'est la raison.

## Tailles

- `@dzgrid/dom/filters` 12 250 → 12 350 et `/filters-base` 12 200 → 12 300 (+0,8 %, règle des +2 %), mesurés 12 317 /
  12 266 ; K.8 91 939 / 92 000.
- **Au-delà des +2 %, à toi** : `columns-panel.css` mesuré 1 686 pour une ligne de 1 400 (+20 %), `dock.css` 860 pour
  800 (+7,5 %). Proposé : 1 720 et 880. Le nouveau dessin (champ de recherche, loupe, cadenas, pied sur les variables
  des boutons, tête carrée, sept variables, robustesse au reset) ne tient pas dans 28 et 16 octets de plus.

## Vérifié (2026-11-15)

`gate:step` : `test:ci` 9 454 / 9 459 au premier passage (deux épingles oubliées — la ligne `filters` et la version
locale du paquet — corrigées), puis `test:tz`, `typecheck`, `build`, `check:api` (rien signalé), `check:types` verts ;
`check:size` rouge sur les deux seules lignes ci-dessus. `test:real-app` 58/58 ; matrice `browser-1-12.mjs` 13 804 /
13 804 (Chrome, Firefox, WebKit × couches × clair/sombre × fr/ar × avec/sans preflight, section (12) neuve) ;
`release:check` « the 5 packages at 1.12.1 » ; site 33/33 ; mots interdits verts.
