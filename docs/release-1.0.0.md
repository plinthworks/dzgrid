# Publier DzGrid 1.0.0 sur npm — la liste du propriétaire

Préparé le 2026-10-28. **Rien n'est publié.** Les agents ont tout préparé et vérifié ; c'est toi qui publies.

Quatre paquets, tous en **1.0.0** : `@dzgrid/core`, `@dzgrid/dom`, `@dzgrid/theme`, `@dzgrid/angular`.
Aucun des quatre noms n'existe encore sur npm.

## Ce qu'il faut savoir avant

- **`@dzgrid` doit être une organisation npm.** Ton compte npm s'appelle `luffysamy` : un « scope d'utilisateur »
  serait `@luffysamy/...`, pas `@dzgrid/...`. Donc il faut créer l'organisation `dzgrid` (gratuite, paquets publics
  illimités), comme `@tzslot`, qui est déjà une organisation. Le nom `dzgrid` est libre aujourd'hui (le registre répond
  « Scope not found »).
- **La publication de confiance (OIDC) demande que le paquet existe déjà.** Sur npm, le « trusted publisher » se
  déclare dans les réglages d'un paquet : il n'y a pas de réglage avant la première version. Donc **la 1.0.0 se publie
  à la main**, depuis ton Mac ; les versions suivantes partiront toutes seules de GitHub quand tu pousses une étiquette.
- **À la main, pas de provenance.** Les manifestes demandent une attestation de provenance (`provenance: true`),
  que seule GitHub Actions sait signer. Depuis ton Mac, on ajoute `--provenance=false` (sinon npm refuse).
- **Double authentification** : ton compte demande un code à chaque `npm publish`. Un code dure peu : s'il expire au
  milieu, relance la même commande, ce qui est déjà publié est sauté.

## Étape 1 — créer l'organisation (une fois)

1. Va sur https://www.npmjs.com, connecte-toi.
2. Clique sur ton avatar → **Add Organization**.
3. Nom : **`dzgrid`** → choisis l'offre **gratuite** (« Unlimited public packages »).
4. Pas besoin d'inviter quelqu'un.

## Étape 2 — la première publication, à la main

Dans un terminal, depuis le dossier du dépôt :

```sh
cd /Users/nadou/Dev/dzgrid
git pull                       # être sur le commit préparé (main)
npm ci
npm login                      # ouvre le navigateur ; vérifie ensuite :
npm whoami                     # doit répondre luffysamy
npm run build                  # construit les trois dist/ (le thème part de son dossier)
npm run release:check          # « Release check: the four packages at 1.0.0 »
```

Puis, **dans cet ordre** (chaque paquet a besoin du précédent), avec un code à 6 chiffres neuf à chaque fois :

```sh
(cd packages/core/dist    && npm publish --access public --provenance=false --otp=CODE)
(cd packages/dom/dist     && npm publish --access public --provenance=false --otp=CODE)
(cd packages/theme        && npm publish --access public --provenance=false --otp=CODE)
(cd packages/angular/dist && npm publish --access public --provenance=false --otp=CODE)
```

Ou en une commande (même ordre, saute ce qui est déjà publié, puis demande au registre que les quatre soient bien
installables) :

```sh
npm run publish:latest -- --otp=CODE      # comme tzslot : un seul code, les quatre paquets, puis la vérification
```

Pour finir, vérifier :

```sh
npm run publish:verify         # « All four are on npm. »
```

Si un paquet échoue : corrige, relance la même commande. Ne laisse jamais la publication à moitié : `dom` demande
`core ^1.0.0`, `angular` demande `core` et `dom`.

## Étape 3 — brancher la publication automatique (une fois, après l'étape 2)

Pour **chacun des quatre paquets** sur npmjs.com (`@dzgrid/core`, `@dzgrid/dom`, `@dzgrid/theme`, `@dzgrid/angular`) :

1. Page du paquet → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Organization or user : **`plinthworks`** ; Repository : **`dzgrid`** ;
   Workflow filename : **`release.yml`** ; Environment : laisser vide.
3. Enregistrer.
4. Conseillé ensuite, même page : **Publishing access** → « Require two-factor authentication and disallow tokens ».
   La publication de confiance continue de marcher, et plus aucun jeton ne peut publier.

## Étape 4 — l'étiquette

```sh
git tag v1.0.0
git push origin v1.0.0
```

Le workflow `release` se lance : il refait les vérifications, voit que les quatre 1.0.0 sont déjà sur npm, les saute,
et confirme qu'elles sont installables. C'est aussi une bonne répétition pour la suite.

## Les versions suivantes (1.0.1, 1.1.0, …)

1. Mettre la nouvelle version dans les quatre `packages/*/package.json`, les pairs `@dzgrid/*` des sources, et
   `packages/angular/src/version.ts` (les tests `scripts/test/release*.test.ts` vérifient qu'ils sont d'accord).
2. Une entrée dans `CHANGELOG.md`, commit, push sur `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. GitHub publie seul (`.github/workflows/release.yml`) : tests, typecheck, build, tailles, contraste, contrôle de
   version, puis core → dom → theme → angular, avec provenance, sans jeton stocké. Une étiquette qui ne correspond pas
   à la version arrête tout avant npm.

## Ce qui a été vérifié (2026-10-28)

- **Versions** : les quatre en 1.0.0 ; une fois construits, les pairs `@dzgrid/*` en `^1.0.0` ; Angular
  `^19 || ^20 || ^21 || ^22` (19 et 22 essayés à l'étape 23) ; tzslot `>=2.4.0 <3` (facultatif) ; gsap `^3.13.0`
  (facultatif). `npm run pack:local` fabrique `1.0.1-local.<heure>` : au-dessus de 1.0.0, jamais masqué par la vraie.
- **Manifestes** : `exports` et `types` vers le JavaScript et les `.d.ts` construits (jamais `src/`) ; `sideEffects:
  false` (le thème : `*.css`) ; licence MIT, dépôt avec son dossier, page d'accueil, suivi des bogues, mots-clés,
  `engines` (Node ≥ 22), `publishConfig { access: public, provenance: true }` ; un README court et la licence dans
  chaque paquet. `npm run build` refuse désormais un manifeste qui en manque (`publishProblems`).
- **publint** (0.3.25, `--strict`) : rien à redire sur les quatre archives.
- **arethetypeswrong** (`@arethetypeswrong/cli`) : aucun problème avec le profil `esm-only`. Le profil complet ne
  signale que « un `require()` tomberait sur de l'ESM » : normal, les paquets sont ESM seulement (choix voulu).
- **Fouille de secrets** dans les archives dépaquetées : pas de `.env`, `.npmrc`, clé, jeton (npm, GitHub, AWS, JWT,
  clé privée), pas de chemin local (`/Users/…`), pas de nom ni d'adresse personnelle, pas de données de test. Les
  cartes de source ont des chemins relatifs et leur source incluse ; aucune ne pointe vers un fichier absent. Seules
  URL : github.com/plinthworks/dzgrid et npmjs.com.
- **Tailles des archives** : voir le tableau plus bas.
- **Essai d'installation à neuf** (hors du dépôt, depuis les archives, sans `legacy-peer-deps`) :
  une page sans framework (core, dom, theme) — `tsc` strict sans `skipLibCheck` vert, en `bundler` et en `NodeNext`,
  bundle esbuild vert, `import()` dans Node vert ; une appli **Angular 21** (`<dz-grid>`, sans zone) — `ngc`
  `strictTemplates` vert et `ng build` vert sans avertissement.
- **Licence de GSAP** relue le 2026-10-28 (`docs/phase-5-steps/gsap-license.md`) : un pair facultatif dans un paquet
  MIT, jamais embarqué, pour une grille de données : usage permis. Point clos pour 1.0.0.
- **Portail** : voir plus bas.

## Résultats du portail

Une fois, `caffeinate -i`, Node 24.22.1, vitest 2 processus :

| Contrôle | Résultat |
|---|---|
| vitest (tout) | 481 fichiers, 7 201 tests verts |
| `test:perm` | 5 fichiers, 10 tests verts |
| `typecheck` | vert |
| `build` | vert (avec le nouveau contrôle `publishProblems`) |
| `check:size` | 0 dépassement, aucune ligne relevée |
| `check:contrast` | 1 092 paires, 0 sous le minimum |
| `pack:release` | 4 archives |
| `npm publish --dry-run` (chaque dossier, et `node scripts/release.mjs publish --dry-run`) | les quatre acceptés |

Tailles des archives (`packed/`) :

| Paquet | Archive | Fichiers | Dépaqueté |
|---|---|---|---|
| `@dzgrid/core` | 440,9 kB | 297 | 1,6 MB |
| `@dzgrid/dom` | 785,3 kB | 612 | 2,8 MB |
| `@dzgrid/theme` | 37,4 kB | 36 | 197 kB |
| `@dzgrid/angular` | 39,8 kB | 6 | 154 kB |

Les archives sont grandes surtout à cause des cartes de source (avec leur source incluse) ; ce qu'une appli charge
est mesuré par `check:size` (par exemple `@dzgrid/angular` 6 811 o gz).

## Ce que toi seul peux faire

1. Créer l'organisation `dzgrid` sur npmjs.com (étape 1).
2. `npm login` puis publier les quatre paquets dans l'ordre (étape 2).
3. Déclarer le « trusted publisher » sur chacun des quatre (étape 3).
4. Pousser l'étiquette `v1.0.0` (étape 4).
5. Dans allergen-detector : remplacer les `file:…tgz` par `"@dzgrid/…": "^1.0.0"`.
