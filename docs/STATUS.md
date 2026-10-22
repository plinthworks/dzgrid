# État du travail — à lire en premier si la session est perdue

Mis à jour : 2026-10-22, **Phase 5 (édition) : étape 1 en cours** (fiches, écoute §19, docs ; aucun code). Phase 4 close techniquement ; **0.2.0 préparée en local, non publiée** (0.1.0 ne l'a jamais été). L'édition s'appelle désormais **Phase 5** (décision Q2 ; phases suivantes +1 ; 0.3.0 à la fin).

L'ancien contenu de ce fichier (les paragraphes « Étape N faite » des Phases 3 et 4, revues et portails) est gardé mot pour mot dans `docs/phase-4-steps/status-log.md` ; le détail de chaque étape est aussi dans `ROADMAP.md`.

## Où on en est

- **Phases 0 à 3** : faites ; Phase 3 close côté DzGrid le 2026-10-21 (étiquette locale `v0.1.0`, jamais publiée). Ce qui touche Sehhaty vit dans la piste « Intégration Sehhaty » (`docs/sehhaty-track.md`).
- **Phase 4, parties A–C** : faites, close techniquement le 2026-10-22 (étape 13, `docs/phase-4-steps/step13-plan.md`). Plan `docs/phase-4-plan.md` (§5 « fermé le 2026-10-22 »), décisions du propriétaire `docs/phase-4-steps/decisions.md` Q1–Q17 (elles priment), plan de chaque étape dans `docs/phase-4-steps/`, décisions en français dans ARCHITECTURE « Index des décisions de la Phase 4 » et « Ajustements après la Phase 4 », critères de sortie dans ROADMAP « Phase 4 — close techniquement, 2026-10-22 ».
- **Version** : les quatre paquets à **0.2.0**, pairs `@dzgrid/*` en `^0.2.0` une fois construits ; `npm run pack:local` donne `packed/dzgrid-{core,dom,angular,theme}-0.2.0.tgz` ; l'exemple Angular s'installe depuis ces archives. CHANGELOG `[0.2.0] - unreleased`.
- **Commit de la clôture** (« release: 0.2.0 prepared », étiquette locale `v0.2.0`, push de `main`) : au chef de projet, après lecture de ce portail. Jamais `npm publish`.

### Étapes de la Phase 4 et leurs commits

| Étape | Sujet | Commits (`git log`) |
|---|---|---|
| plan | plan de la Phase 4 et décisions du propriétaire | `30131ce` |
| 1 | fiches, spike S12 (hauteurs variables), budgets | `81e07a0` |
| 2–3 | coutures du cœur (nœuds, expansion, forme), `@dzgrid/core/tree` | `49c3787`, revue `a9c91e6` |
| 4 | coutures DOM, `@dzgrid/dom/tree` | `5fd4d0d`, revue `6bfb50c` |
| 5 | formes imbriquée et chemin, lignes de remplissage, CSV d'un arbre | `3ce75cc`, revue `bc01afa` |
| 6 | animation de l'arbre, arbre d'un million de lignes | `7334f8d`, revue `9ab4234` |
| 7 | enfants paresseux (hôte et serveur), `tree-lazy` | `1b23ee0`, revue `3bb7de7` |
| 8 | `@dzgrid/core/detail` | `05795fd`, revue `a06131e` |
| parents épinglés | `tree({ sticky })` (Q10–Q11) | `206121e`, revue `1a6d18f` |
| 9 | base DOM : hauteurs variables, ligne de détail | `f4c77b7`, revue `b20130e` |
| 10 | `@dzgrid/dom/detail`, grilles imbriquées | `7b1b4cd`, budgets `497f14b`, revue `6233ee5` |
| 11 | Angular : `[(expanded)]`, panneaux de détail, `[dzgNested]` | `d9439c4`, revue `6422626` |
| 12 | ligne de filtres affichable en direct, `[floatingFilters]` | `dcec156`, revue `ef530ae` |
| 13 | clôture, partie 1 : « aucune ligne », tests lents, budgets | `936b27a` |
| 13 | clôture, partie 2 : 0.2.0, portail final, docs | non commitée |

### Portail final de la clôture (2026-10-22, une commande à la fois, un Chrome sans fenêtre à la fois)

| Commande | Résultat |
|---|---|
| `npm run build` | vert (core, dom, angular ; manifestes, `repository`, pairs `^0.2.0`, cartes vérifiés) |
| `npm run test:ci` | 1re passe : 303 fichiers, 4 840 tests, **1 échec** : `core/test/clock-walk.test.ts` « every local midnight of a year… » à 5,3 s pour le délai de 5 s, sous une charge de la machine de ~60 (autres projets) ; il passe dans `test:tz` (2 × 4 840 verts). Relancé une fois : 303 fichiers, 4 840 tests, **tous verts** (354 s) |
| `npm run test:perm` | 2 fichiers, 6 tests (1 000 permutations par configuration), 210 s |
| `npm run typecheck` | vert |
| `npm run test:tz` (`--maxWorkers=2`) | Auckland et Los Angeles : 303 fichiers, 4 840 tests chacun, verts |
| `npm run check:size` | 0 dépassement ; cœur 28 240, dom 20 648, angular 6 238, profil K.8 80 286 (garde 83 500) |
| `npm run check:contrast` | 176 paires, 0 sous leur minimum |
| `npm run test:browser` (complet) | 499 / 499 |
| `npm run test:audit -- --full` | 42 / 42 ; 1 000 permutations (rapide : 84 s et 40 s ; saisie : 76 s et 73 s) ; export 100 000 × 30 en 436 / 426 / 407 ms sans tâche longue |
| `node packages/angular/browser/run.mjs` | 54 / 54 ; reliaison 5,45 µs par cellule composant |
| `npm run example:build` | archives 0.2.0 refaites et installées en copies (les quatre à 0.2.0) ; default, zone, baseline |
| `npm run example:bytes` | part DzGrid **86 988** ≤ 90 000 (Q17a) ; Angular et coquille 38 654 ; `@dzgrid/angular` ≈ 4 001 |
| `npm run example:csv` | 10 tests ; `out/audit-ar.csv`, 13 450 o, BOM |
| `npm run example:ssr` | fr et ar : hôte seul, 0 ligne, aucun minuteur, aucune erreur |
| `npm run example:browser` | 4 / 4 (fr, ar ; sans zone, zone.js) |
| `npm run pack:local` | quatre archives 0.2.0 : core 369 700 o (255 fichiers), dom 465 671 o (426), angular 38 082 o (6), theme 11 568 o (8). Ni tests, ni bac à sable, ni captures, ni résultats ; aucun `.d.ts.map` ; 0 problème de carte ; chaque fichier nommé par `exports` présent (`scripts/test/release-review.test.ts`) |

Aucun banc lancé (Q17d).

## Ce qui attend le propriétaire

- **Écoute au lecteur d'écran** §16–§18 de `docs/a11y-protocol.md` (arbre, détail, ligne de filtres) : non bloquante ; tant qu'elle n'est pas faite, rien n'est dit « validé ».
- **Relecture arabe** de `locales/ar-tree`, `ar-detail`, `ar-filters` (dont « {name}، لا توجد صفوف » et les phrases de la ligne de filtres).
- **Excel** : ouvrir le CSV arabe (`npm run example:csv` → `examples/angular-audit/out/audit-ar.csv`) et vérifier l'ordre des colonnes.
- **Licence de GSAP** à confirmer avant toute publication.
- **Portée npm et publication** : portée `@dzgrid` réservée, `@tzslot/core` et `@tzslot/dom` 2.2.0 publiés ; puis publication par GitHub Actions (OIDC), sur sa parole seulement.
- **tzslot** : les demandes T1–T11 (`docs/tzslot-requests.md`).
- **Palettes** `sehhaty.json` et la **spécification de l'étape 24** (écran `admin/audit-logs`), piste `docs/sehhaty-track.md`.
- **Mesure des vitesses sur machine calme** (Q17d, reportée) : 17 lignes Node à froid au-dessus de leur budget depuis `bc01afa`, « toggle near the end » 11,6 / 11,5 dans Chrome ; ensuite la règle Q17c (corriger au-delà de +25 % ou sur le chemin courant — tri, filtre, défilement ; relèvement écrit entre +10 et +25 %).

## En cours : Phase 5, l'édition (ancienne « partie D »)

- **Plan** `docs/phase-5-plan.md` (aligné sur les décisions, note « Owner decisions applied ») ; **décisions du propriétaire** `docs/phase-5-steps/decisions.md` Q1–Q19 (elles priment ; Q9 variante du propriétaire : bord rouge clignotant ~0,5 s à chaque refus ; Q10 modifiée : bord animé pendant l'enregistrement ; Q16 tous les budgets accordés).
- **Étape 1 (en cours, non commitée)** : plan `docs/phase-5-steps/step01-plan.md` ; fiches écrites `docs/behaviors/{editing,editors,edit-save,edit-validation,edit-reapply,edit-undo,edit-angular}.md` ; `docs/a11y-protocol.md` §19 (points 111–124) ; ARCHITECTURE §6 et ROADMAP renumérotés. Reste : faire relire (architecte + relecture), puis **poser au propriétaire les points ouverts O1–O11** (`step01-plan.md`), reporter ses réponses dans `decisions.md`, commit.
- **Étape suivante : 2, coutures du cœur** (`editable`, `setReader`/`reapply`, `orderStale`, contexte de l'application pour filtres et tri) — tests d'abord ; `size-budget.json` reçoit les accords Q16 avec l'étape qui construit chaque entrée.

## Commandes

```bash
npm run test:ci        # la suite, un processus (pendant le travail : npx vitest run --maxWorkers=2 <fichiers>)
npm run test:perm      # 1 000 permutations de l'écran d'audit et de l'export, par configuration
npm run test:tz        # la suite à Auckland et à Los Angeles (chaque passe avec --maxWorkers=2)
npm run typecheck      # cœur, DOM, tests, gabarits Angular (ngc)
npm run build          # packages/*/dist (refuse un manifeste vers src/, une carte vers un fichier absent)
npm run pack:local     # les quatre archives 0.2.0 dans packed/
npm run check:size     # tailles contre size-budget.json (npm run build d'abord pour la ligne Angular)
npm run check:contrast # chaque paire de couleurs du thème
npm run test:browser   # la grille dans Chrome sans fenêtre (-- --only tree|detail|motion|filters …)
npm run test:audit -- --full          # écran d'audit, 1 000 permutations
node packages/angular/browser/run.mjs # Angular dans Chrome
npm run example:build  # exemple Angular 21 depuis les archives ; puis example:bytes, example:csv, example:ssr, example:browser
npm start              # bac à sable sur http://127.0.0.1:4700 — ne jamais l'arrêter
```

Budgets depuis une mesure : `node scripts/rebudget.mjs sizes` (à blanc ; `--write` sur décision du propriétaire seulement). Bancs : `npm run bench`, `npm run bench:browser` (pas avant la mesure sur machine calme, Q17d).

## Règles de travail (du propriétaire)

- Réponses en français, courtes, sans jargon.
- **Avant chaque étape** : un architecte (lecture seule) fait le plan ; les questions de structure vont au propriétaire. **Après chaque changement** : une relecture de code et une analyse des tests (mutants dans une copie du dépôt) ; les défauts trouvés sont corrigés, tests d'abord.
- **Tests d'abord** : un test échoue avant la correction.
- **Pendant le travail** : seulement les tests touchés. **Avant le commit** : le portail complet une fois (`build`, `test:ci`, `test:perm`, `typecheck`, `check:size`, et Chrome quand l'écran change).
- **Machine partagée** avec Sehhaty : pas d'application graphique lancée par un agent ; **un seul navigateur à la fois**, toujours fermé ; vitest sur 2 processus au plus ; aucun processus de test orphelin (vérifier avec `ps` à la fin) ; **ne jamais arrêter `vite` ni ce qui écoute sur le port 4700**, ni les serveurs ou navigateurs d'autres projets ; tuer seulement ce qu'on a lancé. Pas de commande `timeout` sur ce Mac : un long passage se lance dans un sous-processus Python qui tue son groupe.
- **Salle blanche** (`CLEANROOM.md`) : jamais le code d'une autre grille ; jamais `node_modules/gsap` ; ne jamais lire `~/Dev/sehhaty*`.
- **Budgets** : une taille ou un temps ne monte que par une décision écrite du propriétaire (`size-budget.json`, ROADMAP, `decisions.md`).
- **Publication** : jamais `npm publish` sans la parole du propriétaire. Push : `main` après des commits vérifiés, jamais de force-push. Trailer de chaque commit :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01SD5iJWfHF82x2mQCxir8Qs`.
- Tenir ce fichier et `docs/phase-5-steps/` à jour après chaque étape (pour une session perdue).
