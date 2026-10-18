# État du travail — à lire en premier si la session est perdue

Mis à jour : 2026-10-18. Ce fichier dit où en est la Phase 3, ce qui est en cours, comment on travaille, et ce qui attend le propriétaire. Le détail de chaque étape faite est dans `ROADMAP.md` (section Phase 3) ; les décisions dans `ARCHITECTURE.md` (« Décisions de la Phase 3 », puis « Décisions de l'étape N »).

## Où on en est

| Étape (plan `docs/phase-3-plugins.md` B4) | État | Commit de fin |
|---|---|---|
| 0 — les huit chantiers (contrat RowModel, découpe de grid.ts, rangées d'en-tête, propriétaires de touches, politique d'update, événements, pièces, popups et zoom) | fait, relu, testé | `c0de566` + revues |
| 1 — fiches de comportement et décisions | fait | `285e5b9` |
| 2 — outillage Angular et empaquetage | fait | `4f8e8b6` |
| 3 — la garde des requêtes (`@dzgrid/core/server`, `createGate`) | fait | `af35f64` |
| 4 — pagination dans le navigateur | fait | `a5858fd` |
| 5 — modèle serveur `sourceRows` (pages, curseurs, jeu complet, côté écran) | fait | `1133e2b` |
| 6 — forme des filtres envoyée au serveur (`toWire`) | fait | `95298f4` |
| 7 — sélection sur plusieurs pages | fait | `2151d99` |
| 8 — types de filtres personnalisés (`FilterKind`) | fait | `7a081dc` |
| **9 — listes de valeurs du filtre à cocher** | **en cours** (un agent l'écrit, non commité) | — |
| **9b — fusions de cellules (rowspan / colspan)** | **décision du propriétaire, priorité haute** : en conception (architecte) ; code juste après l'étape 9 | — |
| 10 à 25 | à faire (liste dans `docs/phase-3-plugins.md` B4) | — |

Si l'étape 9 n'est pas commitée quand vous lisez ceci : regarder `git status` dans ce dépôt. Le plan validé est `docs/phase-3-steps/step9-blueprint.md` et les décisions `docs/phase-3-steps/step9-decisions.md`. Reprendre : vérifier la suite (`npm run test:ci`), la taille, puis relecture et analyse des tests comme ci-dessous.

## Les plans détaillés des étapes

`docs/phase-3-steps/` garde les plans validés (architecte + décisions) des étapes 5 à 9 : ce qu'un agent a reçu pour écrire l'étape. Ils servent à comprendre pourquoi le code est ainsi, et à reprendre une étape interrompue.

## Comment on travaille (règles du propriétaire)

- Réponses en français, courtes, sans jargon.
- Avant chaque étape : un architecte (lecture seule) fait le plan. Après chaque changement : une relecture de code et une analyse des tests (erreurs volontaires dans une copie du dépôt). Les défauts trouvés sont corrigés, tests d'abord.
- Tests d'abord : un test doit échouer avant la correction.
- Commits en local seulement : jamais de push. Trailer de chaque commit :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01SD5iJWfHF82x2mQCxir8Qs`.
- Ne commiter que si la suite complète passe (`npm run test:ci && npm run typecheck && npm run check:size`).
- Salle blanche (`CLEANROOM.md`) : jamais le code d'une autre grille. Ne jamais lire `~/Dev/sehhaty` ni `~/Dev/sehhaty-dashboard` : demander au propriétaire.
- Machine partagée avec Sehhaty : pas d'application graphique lancée par un agent ; un seul navigateur à la fois, toujours fermé ; tests sur 2 processus au plus (`npm run test:ci` ou `--maxWorkers=2`).
- Un budget de taille ne monte que par une décision du propriétaire, écrite dans la ROADMAP et dans `size-budget.json`.

## Commandes

- Tests : `npm run test:ci` (un processus) ; types : `npm run typecheck` (inclut `ngc` sur Angular) ; tailles : `npm run check:size` ; construction : `npm run build` ; archives : `npm run pack:local`.
- Navigateur (une page, fermée à la fin) : `node scripts/browser.mjs` ; performance : `node scripts/perf-browser.mjs`.
- Bac à sable : `npx vite --host 127.0.0.1` puis http://127.0.0.1:4700/ et `/rtl.html`.

## Budgets de taille pendant la Phase 3 (décisions du propriétaire)

| Entrée | Budget | Mesure récente |
|---|---|---|
| `@dzgrid/core` | 26 000 o gz | 24 054 |
| `@dzgrid/core/server` (mesuré par-dessus le cœur) | 6 000 | ~4 200 |
| `@dzgrid/dom` | 17 500 | ~17 090 |
| `@dzgrid/dom/popup` | 1 500 | ~1 390 |
| langues en / fr / ar | 540 / 660 / 850 | 511 / 623 / 801 |
| thème | 1 180 | ~1 100 |

À la clôture de la Phase 3, chaque budget revient à la mesure + 10 %.

## Questions en attente du propriétaire de Sehhaty

- API serveur (§1.1) : pagination par offset ou par curseur ; total toujours renvoyé (et après filtre ?) ; indication « page suivante » ; taille de page maximale ; requêtes rejouables sans risque.
- Grammaire des filtres côté API : borne de fin incluse ou exclue ; format des dates ; recherche texte sans accents ; filtres vide / non vide ; encodage des listes ; paramètres inconnus refusés ?
- Une ligne mise de côté garde le dernier patient affiché tant qu'elle n'est pas réutilisée : acceptable pour des données de santé ?
- CSV : ordre logique des colonnes pour un lecteur arabe dans Excel (étape 23) ; chaque export doit-il passer `canExport`, et que contient la trace d'export pour le journal d'audit ?
- Toujours dus : la spécification de l'écran des journaux d'audit (étape 24), les palettes `sehhaty.json`, un relecteur arabe pour `locales/ar.ts` (y compris les annonces de sélection ajoutées à l'étape 7), le budget mémoire de la préparation de recherche, la question de l'annonce du tri multiple.

## Décisions du propriétaire prises pendant la Phase 3 (rappel)

- 2026-10-18, priorité haute : les fusions de cellules, comme `rowspan` / `colspan` d'un tableau HTML, conçues et codées dans la Phase 3 (étape 9b, après la 9), les quatre genres : valeurs identiques fusionnées, fusion décidée par la donnée, en-têtes groupés, lignes pleine largeur. ag-Grid les gère mal : c'est un point où DzGrid doit faire mieux. Avant : prévu en Phase 5.

- Étape 4 : budgets cœur 24 kB, dom 16,8 kB (relevés ensuite).
- Étape 5 : dom 17,5 kB.
- Avant l'étape 6 : `/server` 6 kB.
- Étape 7 : `selection.keepOnFilter` (par défaut on garde la sélection quand le filtre change ; `false` la vide et l'annonce) ; langues 540/660/850.
- Étape 8 : cœur 26 kB.
- Étape 9 : la liste à cocher montre les valeurs présentes dans les lignes que donnent les autres filtres (« montrer une option qui ne remonte rien est faux ») ; sans autre filtre, tout ce qui est en base ou chargé ; une valeur déjà cochée reste visible à 0 pour pouvoir la décocher ; au plus 2 000 valeurs, puis « affinez votre recherche ».
