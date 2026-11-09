# Publier DzGrid 1.8.0 — la liste du propriétaire

Préparé le 2026-11-09 (Phase 11 : durcissement et écosystème, plus le tableau croisé côté serveur). **Rien n'est
publié, aucune étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en **1.8.0**
(`@dzgrid/core`, `dom`, `theme`, `angular` et le nouveau **`@dzgrid/element`**), leurs pairs `@dzgrid/*` en `^1.8.0`.
Une version mineure : rien de la 1.7.0 n'a été retiré (`npm run check:api`), avec un changement de comportement pour
les groupes du serveur (plus bas).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.8.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the 5 packages at 1.8.0. »
```

## La première publication de `@dzgrid/element` (une fois)

Le paquet n'existe pas encore sur npm : sa première publication passe **par ton Mac** (façon A ci-dessous), pas par
l'étiquette — un « trusted publisher » ne se déclare que sur un paquet qui existe. Ensuite, sur npmjs.com →
`@dzgrid/element` → Settings → Trusted Publisher : `plinthworks` / `dzgrid` / `release.yml`, comme les quatre autres.

## Publier — une des deux façons

**A. Depuis ton Mac (comme la 1.0.0)** — un seul code à 6 chiffres pour les cinq :

```sh
npm whoami                               # luffysamy
npm run publish:latest -- --otp=CODE     # build, puis core → dom → theme → angular → element, puis vérifie sur npm
```

Si le code expire au milieu : relance la même commande, ce qui est déjà publié est sauté.

**B. Par l'étiquette** — seulement si le « trusted publisher » est déclaré sur **les cinq** paquets (donc pas pour
cette première fois de `@dzgrid/element`) :

```sh
git tag v1.8.0
git push origin v1.8.0
```

GitHub refait tout (build, exemple Angular construit et mesuré, tests, tailles, contraste, contrôle de version), puis
publie avec provenance, sans jeton.

## Vérifier

```sh
npm run publish:verify    # les cinq sont sur npm
```

## Dans les applications

```sh
cd /Users/nadou/Dev/allergie-detector/admin-web   # (ou une autre appli)
npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

`^1.0.0` accepte déjà la 1.8.0. À lire avant (CHANGELOG « Upgrading from 1.7.0 ») :

- **Groupes du serveur** : une valeur de groupe qui ne va pas avec le type de sa colonne (un nombre dans une colonne
  texte, un instant dans une colonne jour) est maintenant laissée de côté et signalée (`invalid-page-response`). Si
  ton serveur envoie des id en nombres pour une colonne texte : envoie des textes, ou type la colonne.
- **Hôte sans la mise en page** : un hôte qui a une hauteur mais pas `display: flex; flex-direction: column` dessinait
  toutes les lignes en 1.7.0 (100 000 lignes triées en 37 s). La grille tient maintenant sa vue à la hauteur de la
  fenêtre et le dit une fois (`unbounded-viewport`, chemin `host`). Si tu vois ce code : donne la mise en page à l'hôte.
- **Écrans étroits** : les colonnes figées défilent avec les autres quand le centre n'a plus la place de sa plus large
  colonne ; le dock replie un côté ouvert qui couvrait les lignes quand le focus y entre. Rien à changer.

## Ce que la 1.8.0 ajoute (tout est à activer, rien ne change seul)

- **Le tableau croisé côté serveur** : `serverSideRows(data, { pivot: serverPivot() })` (`@dzgrid/core/server-pivot`),
  la même barre et les mêmes gestes que dans le navigateur ; les cellules et les totaux viennent du serveur.
- **`<dz-grid>` pour toute page** (`@dzgrid/element`) : `import '@dzgrid/element/define'`, propriétés, attributs,
  événements `dzg-*`. Pour une page sans Angular.
- **Ctrl+P imprime toute la grille** si l'appli appelle `printOnMenu(grid)` (`@dzgrid/dom/print-menu`).
- **Le guide d'usage** `docs/guide/` (chaque exemple compilé par un test), `llms.txt` et `llms-full.txt`.
- **Plus rapide sur un PC lent** (mesuré à 4× CPU), et les vérifications d'accessibilité automatiques (rapport ACR en
  brouillon : `docs/a11y/acr-wcag22.md`).

Pages locales pour essayer : `element.html`, `pivot-serveur.html` (`npm start`, port 4700).
