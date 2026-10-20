# État du travail — à lire en premier si la session est perdue

Mis à jour : 2026-10-20 (étape 17 faite, relue, testée ; corrections non commitées ; étape 18 ensuite). Ce fichier dit où en est la Phase 3, ce qui est en cours, comment on travaille, et ce qui attend le propriétaire. Le détail de chaque étape faite est dans `ROADMAP.md` (section Phase 3) ; les décisions dans `ARCHITECTURE.md` (« Décisions de la Phase 3 », puis « Décisions de l'étape N »).

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
| 9 — listes de valeurs du filtre à cocher | fait, relu, testé | `c6d3b02` |
| 9b — fusions de cellules (rowspan / colspan) | fait, relu, testé (4 commits et leurs corrections) | `f4c63f6` |
| 10 — export CSV dans le cœur (`@dzgrid/core/csv`, `ClientModel.allRows`) | fait, relu, testé | `5aebe99` |
| 11 — en-tête, voile et bulle d'aide remplaçables (`@dzgrid/dom/slots`), bouton « Réessayer » dans la base | fait, relu, testé | `0caedae`, `599cbdf` |
| 12 — ligne de filtres sous les en-têtes (`@dzgrid/dom/filters` partie 1, textes des filtres à part) | fait, relu, testé | `59d796e`, `c1b14ea` |
| 13 — fenêtre de filtre (texte, nombre, oui/non), marque « filtré », Alt+Flèche bas | fait, relu, testé | `f67fc48`, `67782bc` |
| 14 — filtres de dates sur tzslot (jour, période, avant/après), six raccourcis relatifs, horloge | fait, relu, testé | `df27559`, `85e08c3`, `ae0b40b`, `24acaab` |
| 15 — filtre par liste de valeurs (chargé à la demande), menu de démos | fait, relu, testé | `021324e`, `79c40c3` |
| 16 — recherche rapide (`@dzgrid/dom/search`) | fait, relu, testé | `85ec8a5` |
| 17 — pagination (`@dzgrid/dom/pagination`, `@dzgrid/dom/internal`) | fait, relu, testé (corrections non commitées) | `5cd9ca9` + corrections |
| 18 à 26 | à faire, la 18 ensuite (liste dans `docs/phase-3-plugins.md` B4 ; 26 = animations GSAP, `docs/phase-3-steps/motion-decisions.md`) | — |

Étape 17 faite, relue, testée (`5cd9ca9` + corrections non commitées) : pied de page `pagination()` (sélection, décompte, pagineur dans un `<nav>`), module commun `@dzgrid/dom/internal`, case d'en-tête limitée à la page affichée dans le navigateur. Corrections de la relecture : un bouton caché du pied l'est vraiment dans un navigateur (règle `[hidden]` après le `display` des boutons) ; plus de « Tout sélectionner (N) » quand toutes les lignes filtrées sont déjà cochées page par page ; l'annonce après réponse (`settled`, partagée par filtres, recherche et pagination) ne parle que pour la requête de sa propre action (un filtre ou un `page.go` de l'hôte qui remplace un changement de page en attente ne fait plus dire la page) ; décision Q4 du propriétaire : sur une sélection « tout » liée, la case d'une page recoche cette page seulement, Ctrl+A recoche tout. 3 296 tests, 301 vérifications navigateur. En cours : étape 18 ensuite. Décidé pour l'étape 22 : cellule Angular `DzgCell<T>` + `cell().emit`. Étape 26 : animations GSAP (+ règle de classe par colonne, accès à la cellule pour GSAP ; Phase 4 : états d'enregistrement animés). Pour le propriétaire : tzslot T1–T11, écoute lecteur d'écran (§8–§12), relecture arabe, licence GSAP.

## Les plans détaillés des étapes

`docs/phase-3-steps/` garde les plans validés (architecte + décisions) des étapes 5 à 16 : ce qu'un agent a reçu pour écrire l'étape. Ils servent à comprendre pourquoi le code est ainsi, et à reprendre une étape interrompue.

## Comment on travaille (règles du propriétaire)

- Réponses en français, courtes, sans jargon.
- Avant chaque étape : un architecte (lecture seule) fait le plan. Après chaque changement : une relecture de code et une analyse des tests (erreurs volontaires dans une copie du dépôt). Les défauts trouvés sont corrigés, tests d'abord.
- Tests d'abord : un test doit échouer avant la correction.
- Dépôt : https://github.com/plinthworks/dzgrid (remote `origin`, SSH). Le propriétaire a autorisé le push (2026-10-18) : on pousse `main` après des commits vérifiés (suite verte), jamais de travail non commité, jamais de force-push. Trailer de chaque commit :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01SD5iJWfHF82x2mQCxir8Qs`.
- Ne commiter que si la suite complète passe (`npm run test:ci && npm run typecheck && npm run check:size`).
- Salle blanche (`CLEANROOM.md`) : jamais le code d'une autre grille. Ne jamais lire `~/Dev/sehhaty` ni `~/Dev/sehhaty-dashboard` : demander au propriétaire.
- Machine partagée avec Sehhaty : pas d'application graphique lancée par un agent ; un seul navigateur à la fois, toujours fermé ; tests sur 2 processus au plus (`npm run test:ci` ou `--maxWorkers=2`).
- Un budget de taille ne monte que par une décision du propriétaire, écrite dans la ROADMAP et dans `size-budget.json`.

## Commandes

- Tests : `npm run test:ci` (un processus) ; types : `npm run typecheck` (inclut `ngc` sur Angular) ; tailles : `npm run check:size` ; construction : `npm run build` ; archives : `npm run pack:local`.
- Navigateur (une page, fermée à la fin) : `node scripts/browser.mjs` ; performance : `node scripts/perf-browser.mjs`.
- Bac à sable : `npx vite --host 127.0.0.1` puis http://127.0.0.1:4700/, `/rtl.html` et `/spans.html` (fusions) ; `?search=1` le champ de recherche (étape 16) ; `?paging=client` le pied de pagination, `?paging=cursor` un serveur lent par curseur sans total (étape 17).

## Budgets de taille pendant la Phase 3 (décisions du propriétaire)

| Entrée | Budget | Mesure récente |
|---|---|---|
| `@dzgrid/core` | 26 900 o gz (étape 14, raccourcis) | 26 756 |
| `@dzgrid/core/csv` (par-dessus le cœur) | 2 500 | 1 620 |
| `@dzgrid/core/spans` (par-dessus le cœur) | 3 500 | 3 422 |
| `@dzgrid/core/server` (mesuré par-dessus le cœur) | 6 000 | 5 551 |
| `@dzgrid/dom` | 19 100 (étape 17) | 18 953 |
| `@dzgrid/dom/pagination` | 3 800 (étape 17) | 3 149 |
| `@dzgrid/dom/internal` | 650 (étape 17) | 527 |
| textes de la pagination en / fr / ar | 560 / 680 / 880 (étape 17) | 328 / 375 / 489 |
| `@dzgrid/dom/search` | 1 300 (étape 16, Q4) | 1 228 |
| `@dzgrid/dom/filters` (mesuré par-dessus `@dzgrid/dom/popup`, tzslot, les lots de dates et la liste à part) | 9 300 (étape 15) | 8 919 |
| liste de valeurs (paresseuse, `filters/set/`) | 3 800 (étape 15) | 3 779 |
| adaptateurs de dates (paresseux, code DzGrid seul, tzslot à part) | 2 600 (étape 14) | 2 320 |
| lots tzslot (part de tzslot, relevée, sans budget) : date / range / moment / les trois | — | 36 394 / 57 719 / 48 461 / 65 034 |
| `@dzgrid/dom/spans` | 4 500 (O8 ter) | 4 455 |
| `@dzgrid/dom/slots` | 1 300 (étape 11) | 994 |
| `@dzgrid/dom/popup` | 1 500 | 1 428 |
| langues en / fr / ar | 560 / 680 / 870 (`grid.retry`) | 519 / 636 / 825 |
| textes des filtres en / fr / ar | 850 / 980 / 1 200 (étape 15) | 707 / 831 / 941 |
| thème | 2 050 (étape 17) | 1 783 |

À la clôture de la Phase 3, chaque budget revient à la mesure + 10 %.

## Questions en attente du propriétaire de Sehhaty

- API serveur (§1.1) : pagination par offset ou par curseur ; total toujours renvoyé (et après filtre ?) ; indication « page suivante » ; taille de page maximale ; requêtes rejouables sans risque.
- Grammaire des filtres côté API : borne de fin incluse ou exclue ; format des dates ; recherche texte sans accents ; filtres vide / non vide ; encodage des listes ; paramètres inconnus refusés ?
- Une ligne mise de côté garde le dernier patient affiché tant qu'elle n'est pas réutilisée : acceptable pour des données de santé ?
- CSV : ordre logique des colonnes pour un lecteur arabe dans Excel (étape 23) ; chaque export doit-il passer `canExport`, et que contient la trace d'export pour le journal d'audit ?
- Toujours dus : la spécification de l'écran des journaux d'audit (étape 24), les palettes `sehhaty.json`, un relecteur arabe pour `locales/ar.ts` (y compris les annonces de sélection ajoutées à l'étape 7), le budget mémoire de la préparation de recherche, la question de l'annonce du tri multiple.

## Décisions du propriétaire prises pendant la Phase 3 (rappel)

- Étape 9b : texte d'une fusion centré comme Excel, qui « voyage » en haut ou en bas de la partie visible quand la fusion est longue ; clic = la ligne sous le pointeur ; CSV répète la valeur ; modules à part `@dzgrid/core/spans` 3,5 kB et `@dzgrid/dom/spans` 2,4 kB puis 3,5 kB (O8 bis) puis 4,5 kB (O8 ter, en-têtes groupés avec leur clavier), dom de base 18 kB ; essai navigateur (S12) d'abord ; test au lecteur d'écran à l'oreille par le propriétaire. Détail : `docs/phase-3-steps/step9b-decisions.md`.
- 2026-10-18, priorité haute : les fusions de cellules, comme `rowspan` / `colspan` d'un tableau HTML, conçues et codées dans la Phase 3 (étape 9b, après la 9), les quatre genres : valeurs identiques fusionnées, fusion décidée par la donnée, en-têtes groupés, lignes pleine largeur. ag-Grid les gère mal : c'est un point où DzGrid doit faire mieux. Avant : prévu en Phase 5.

- Étape 4 : budgets cœur 24 kB, dom 16,8 kB (relevés ensuite).
- Étape 5 : dom 17,5 kB.
- Avant l'étape 6 : `/server` 6 kB.
- Étape 7 : `selection.keepOnFilter` (par défaut on garde la sélection quand le filtre change ; `false` la vide et l'annonce) ; langues 540/660/850.
- Étape 8 : cœur 26 kB.
- Étape 10 : `@dzgrid/core/csv` à part (2,5 kB) et cœur 26,1 kB pour `allRows` ; `selected` = les lignes sélectionnées que la requête montre ; option de colonne `csv: 'text'` (`="0123"` pour les valeurs faites de chiffres seulement). Détail : `docs/phase-3-steps/step10-decisions.md`.
- Étape 9 : la liste à cocher montre les valeurs présentes dans les lignes que donnent les autres filtres (« montrer une option qui ne remonte rien est faux ») ; sans autre filtre, tout ce qui est en base ou chargé ; une valeur déjà cochée reste visible à 0 pour pouvoir la décocher ; au plus 2 000 valeurs, puis « affinez votre recherche ».
