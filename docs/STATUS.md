# État du travail — à lire en premier si la session est perdue

Mis à jour : 2026-10-26. **Phase 5 (l'édition) close techniquement** (étape 13, décision Q-C4) : parties A et B faites, portail final vert, **0.3.0 préparée en local, non publiée** (0.1.0 et 0.2.0 ne l'ont jamais été). Le commit « release: 0.3.0 prepared » et l'étiquette locale `v0.3.0` (Q-C1 : `main` poussée sans l'étiquette) : au chef de projet. Jamais `npm publish`. **Suite : Phase 6**, puis le site de documentation.

L'ancien texte de ce fichier (étapes 1 à 12 de la Phase 5) est gardé mot pour mot dans `docs/phase-5-steps/status-log.md` ; celui des Phases 3 et 4 dans `docs/phase-4-steps/status-log.md`. Le détail de chaque étape est dans `ROADMAP.md` et `docs/phase-5-steps/stepNN-plan.md` (« Done », « Review »).

## Où on en est

- **Phases 0 à 3** : faites (clôture côté DzGrid le 2026-10-21, étiquette locale `v0.1.0`).
- **Phase 4** (arbre, maître/détail, ligne de filtres) : close techniquement le 2026-10-22 (`v0.2.0` locale).
- **Phase 5** (l'édition) : close techniquement le 2026-10-26. Partie A (édition, enregistrements, refus, annuler) ; partie B (blocs de cellules, presse-papiers, poignée de recopie, Ctrl+D / R, modification en masse) ; thèmes vitrines, ponts Tailwind / Bootstrap, démos. **La partie A reste ouverte sur 124a–b seulement** (S9-Q5). Plan `docs/phase-5-plan.md` (§5 « fermé le 2026-10-26 »), décisions `docs/phase-5-steps/decisions.md` (elles priment), critères G1–G17 et PB1–PB13 dans ROADMAP « Phase 5 — close techniquement », écarts dans ARCHITECTURE « Ajustements après la Phase 5 ».
- **Version** : les quatre paquets à **0.3.0**, pairs `@dzgrid/*` en `^0.3.0` une fois construits ; `npm run pack:local` donne `packed/dzgrid-{core,dom,angular,theme}-0.3.0.tgz` ; l'exemple Angular s'installe depuis ces archives. CHANGELOG `[0.3.0] - unreleased` (liste des changements cassants vérifiée contre `v0.2.0`).
- **Ordre décidé par le propriétaire (2026-10-25)** : **Phase 6** (menu de colonne, choix des colonnes, zone de regroupement, déplacement des colonnes, `GridState`, lignes épinglées…) → **site de documentation** (Astro Starlight, FR + EN, en ligne sur sa parole seulement ; `docs/phase-5-steps/showcase-plan.md`) → **Phases 7 à 11** (regroupement, serveur infini, xlsx / menus / barre d'état / filtre avancé / glisser de lignes, pivot, durcissement). `dmp-doctor-patients` en dernier, après une revue de sécurité.
- **Phase 6 : plan écrit, en attente des réponses du propriétaire** (`docs/phase-6-plan.md`, questions `docs/phase-6-steps/questions.md`, 2026-10-26).

### Étapes de la Phase 5 et leurs commits

| Étape | Sujet | Commit |
|---|---|---|
| 1 | fiches, a11y §19, décisions Q1–Q19 | `4880616` |
| 2 | coutures du cœur (`editable`, `validate`, ordre périmé, contexte de l'appli) | `6b390aa` |
| — | thèmes vitrines, couche CSS, ponts, `rowClass` / `headerClass` | `8ccb6b0`, `01b07ae` |
| — | `rowHeight`, démos commandes et RH | `502e1c8` |
| 3 | `@dzgrid/core/edit` | `904ed78` |
| 4 | affichage : marques, lignes grisées, remise en ordre | `b56279a` |
| 5–6 | `@dzgrid/dom/editors` (texte, nombre, dates, oui/non, liste) | `9513cfe`, `51131af` |
| 7–8 | enregistrements de bout en bout ; annuler / rétablir, arbres, détails | `9ba9541`, `1acaabf` |
| 9 | Angular ; portail de la partie A | `7ba1020` |
| 10 | partie B : fiches, `@dzgrid/core/range` | `7156ec0` |
| 11a–11b | `@dzgrid/dom/range` : blocs, presse-papiers | `295e4e8`, `832154d` |
| 12 | `@dzgrid/dom/fill`, cellule active visible | `9190b04`, `a21428b` |
| 13 | clôture : budgets, 0.3.0, portail, docs | non commitée |

### Portail final (2026-10-26, une commande à la fois, `caffeinate -i`, vitest ≤ 2 processus, un navigateur sans fenêtre à la fois)

| Commande | Résultat |
|---|---|
| `build`, `typecheck` | verts |
| `test:ci` | 404 fichiers, 6 325 tests, verts (445 s, premier passage) |
| `test:perm` | 5 fichiers, 10 tests, verts (231 s) |
| propriétés à 3 000 graines | `range-fill-property` et `range-paste-property` verts |
| `test:tz` | Auckland et Los Angeles : 404 / 6 325 chacun, verts |
| `check:size` | 0 dépassement (91 lignes) ; `ar-range` 500 / 500 au plafond |
| `check:contrast` | 954 paires, 0 sous leur minimum |
| `test:browser` complet | 967 / 967 ; Firefox et WebKit : `edit-undo` 8, `range` 7, `clipboard` 13, `fill` 30, tous verts ; `--only playground` 41 / 41 |
| `test:audit -- --full` | 42 / 42 ; export 100 000 × 30 en 406 / 399 / 401 ms, sans tâche longue |
| Angular (`packages/angular/browser/run.mjs`) | 90 / 90 |
| exemple | `build` (archives 0.3.0 en copies), `bytes` **92 059 / 92 500** (écran stock 32 610 à part), `csv` 10 tests (BOM), `ssr` fr / ar × audit / stock sans erreur, `browser` 8 / 8 |
| `pack:local` | core 422 356 o (288 fichiers), dom 634 791 (528), angular 43 772 (6), theme 28 600 (24) ; ni tests, ni brouillons, ni sources `.ts`, ni `.d.ts.map` ; licence et README dans chacune |

Aucun banc lancé (Q17d). Aucune relance nécessaire.

**Tailles au plafond ou presque** (octets gz, budgets de la clôture) : `ar-range` 500 / 500, `core/edit` 3 098 / 3 100, `edit.css` 2 197 / 2 200, `dom/edit` 4 146 / 4 150, `dom/tree` 3 795 / 3 800, `ar-edit` 895 / 900, calendrier 1 494 / 1 500, cœur 28 916 / 29 000, `dom/range` 4 768 / 4 800. Toute hausse : décision écrite du propriétaire. Tableau complet : ROADMAP « Final budgets (Phase 5) ».

## Ce qui attend le propriétaire (rien ne bloque la Phase 6)

1. **124a–b** (le dernier point qui garde la partie A ouverte, S9-Q5) : méthodes de saisie japonaise et pinyin, touches mortes françaises ; iOS / Android (toucher, double toucher, bulle au-dessus du clavier, VoiceOver / TalkBack), sur `orders-edit.html`.
2. **Excel** (Windows, macOS) et **Google Sheets**, fr et ar, dans les deux sens (nombres, dates, `'=1+1`, `0123`, retours à la ligne dans une cellule, colonne A en arabe : risque K1) ; le CSV arabe dans Excel (`examples/angular-audit/out/audit-ar.csv`, ordre des colonnes).
3. **Safari réel** (S11b-Q2) : Cmd+C / V / X sur `orders-edit.html` sans texte sélectionné ; une parade seulement si cela échoue.
4. **Écoute au lecteur d'écran** §16–§18 (arbre, détail, ligne de filtres), §19 (édition : 119, 124c–g), §20 (blocs, presse-papiers, recopie : 125–142). Jamais « validé » avant.
5. **Relectures arabes** : `ar-tree`, `ar-detail`, `ar-filters`, `ar-edit`, `ar-editors`, `ar-range` (textes raccourcis), `ar-fill`.
6. **Licence de GSAP** à relire (https://gsap.com/standard-license : produits concurrents, redistribution) avant toute publication.
7. **Publication npm** (portée `@dzgrid`, GitHub Actions OIDC), sur sa parole seulement ; 0.1.0, 0.2.0 et 0.3.0 jamais publiées.
8. **tzslot** : demandes T1–T11 (`docs/tzslot-requests.md`).
9. **Palettes** `sehhaty.json` et la spécification de l'étape 24 (`docs/sehhaty-track.md`) ; la fiche `pharma/stock` (Q19).
10. **Mesure sur machine calme** (Q17d) : les 17 lignes Node, « toggle near the end », les lignes du jeu B (masse, collage, recopie), puis la règle Q17c.
11. **Ctrl/Cmd+D (favori) et Ctrl/Cmd+R (recharger)** dans de vrais navigateurs avec fenêtre (§20 132, 138) : sans fenêtre on prouve seulement que la touche est empêchée.
12. **À regarder** : le bord violet du bloc dans Clinic, la bordure orange dans l'anneau bleu.

**Démo à essayer** : `http://127.0.0.1:4700/orders-edit.html` (blocs, presse-papiers, poignée, Ctrl+D / R, Ctrl+Entrée ; `?locale=ar-DZ&theme=dark&skin=midnight`, `?paged=1`, `?tree=1`, `?enter=down`, `?range=0`), `detail.html`, `orders.html`, `hr.html`.

## Commandes

```bash
npm run test:ci        # la suite, un processus (pendant le travail : npx vitest run --maxWorkers=2 <fichiers>)
npm run test:perm      # 1 000 permutations de l'écran d'audit et de l'export, par configuration
npm run test:tz        # la suite à Auckland et à Los Angeles (chaque passe avec --maxWorkers=2)
npm run typecheck      # cœur, DOM, tests, gabarits Angular (ngc)
npm run build          # packages/*/dist (refuse un manifeste vers src/, une carte vers un fichier absent)
npm run pack:local     # les quatre archives 0.3.0 dans packed/
npm run check:size     # tailles contre size-budget.json (npm run build d'abord pour la ligne Angular)
npm run check:contrast # chaque paire de couleurs du thème, de Midnight et de Clinic
npm run build:theme    # dzgrid.css, contrast.css et leurs copies sans couche, depuis le Sass
npm run test:browser   # la grille dans Chrome sans fenêtre (-- --only tree|detail|motion|filters|themes|demos …)
npm run test:audit -- --full          # écran d'audit, 1 000 permutations
node packages/angular/browser/run.mjs # Angular dans Chrome
npm run example:build  # exemple Angular 21 depuis les archives ; puis example:bytes, example:csv, example:ssr, example:browser (`?screen=stock` : l'écran modifiable)
node packages/angular/browser/run.mjs --only edit # l'édition dans Angular seule
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
