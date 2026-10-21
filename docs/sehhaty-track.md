# Piste « Intégration Sehhaty »

Ouverte le 2026-10-21 à la clôture de la Phase 3 côté DzGrid (décision du propriétaire, `docs/phase-3-steps/step25-decisions.md`, Q1). La Phase 3 est close sans l'étape 24 ; ce qui demande Sehhaty, ses données ou ses personnes vit ici. Les critères de sortie 1 (partie Sehhaty), 4, 5 et 7 de la Phase 3 (ARCHITECTURE §6) sont **renvoyés ici, par décision du propriétaire du 2026-10-21**. La Phase 4 (arbre, maître/détail) ne l'attend pas.

Règle qui ne change pas : aucun agent ne lit `~/Dev/sehhaty` ni `~/Dev/sehhaty-dashboard`. Tout ce qui en vient passe par le propriétaire, écrit dans `docs/sehhaty/audit-logs.md`.

## 1. Ce que le propriétaire doit fournir pour l'étape 24 (bloquant)

La forme est celle de `docs/phase-3-plan.md` §1.1 ; à écrire dans `docs/sehhaty/audit-logs.md`.

1. **Les sept colonnes** de l'écran `admin/audit-logs` (`AuditColumnSpec`) : identifiant stable, chemin du champ dans la ligne de l'API, en-tête fr et ar, type (`text`, `number`, `day`, `instant`, `enum`, `boolean`), options d'énumération avec leurs libellés fr / ar, texte libre ou non (isolation bidi), triable par le serveur ou non, largeur, épinglage, précision des instants.
2. **Les sept filtres serveur** (`AuditFilterSpec`) : nom affiché (fr / ar), colonne filtrée ou aucune (rôle, IP, locataire…), genre (`text-contains`, `text-equals`, `enum-one`, `enum-many`, `day-range`, `instant-range`, `number-range`, `boolean`), paramètre(s) de l'API, **format exact sur le fil** (ISO avec `Z` ? `YYYY-MM-DD` ? liste séparée par des virgules ? paramètre répété ?), source des valeurs d'une énumération (fixe ou point d'accès, avec sa forme).
3. **L'API** (`AuditApiSpec`) :
   - pagination : `page-0`, `page-1`, `offset-limit` ou `cursor` (nom du paramètre, où revient le curseur suivant) ; tailles de page, taille maximale ;
   - tri : paramètre, tri multiple accepté ou non ;
   - décompte : total toujours renvoyé (et après filtre ?), indication « page suivante », ou rien ;
   - enveloppe de réponse : un exemple JSON de deux lignes (valeurs fictives) ; le champ unique de la ligne ;
   - horodatages avec ou sans décalage (sans : dans quelle zone) ; zone d'affichage (ex. `Africa/Algiers`) ;
   - **borne de fin** d'un filtre de dates : incluse ou exclue (DzGrid envoie `[from, to)` en UTC, critère 3) ;
   - recherche texte : acceptée ou non, avec ou sans accents ; filtres vide / non vide ; paramètres inconnus refusés ?
   - erreurs : codes HTTP et corps ; requêtes rejouables sans risque ;
   - export : aucun, fichier synchrone ou tâche asynchrone (point d'accès, paramètres, ce qui revient : URL ? blob ?) ;
   - état dans l'URL aujourd'hui, sélection de lignes (action groupée), rendu serveur du tableau de bord.

Avec ces réponses, l'étape 24 écrit (tests d'abord) `examples/angular-audit/src/audit-columns.ts` (les sept `ColumnDef` et leurs filtres), `examples/angular-audit/src/to-query.ts` (`PageRequest` → paramètres de l'API ; `WireFilterModel` → paramètres de filtre ; mode de pagination) et `examples/angular-audit/test/to-query.spec.ts` (pour chacun des sept filtres, une `PageRequest` écrite à la main donne exactement la chaîne de requête documentée ; bornes d'instants au format documenté ; tri ; curseur ou offset).

## 2. Les éléments de la piste

| # | Élément | Qui | Critère de la Phase 3 |
|---|---|---|---|
| 1 | Étape 24 : transposition de l'écran (§1 ci-dessus), `to-query.ts` et ses tests | propriétaire (entrées), puis agents | 1 (partie Sehhaty) |
| 2 | Palettes `sehhaty.json` : `npm run check:contrast -- --palette sehhaty.json` sur les 12 combinaisons palette × thème ; palette commutée à chaud, grille affichée | propriétaire (fichier), puis agents | 5 |
| 3 | Relecture arabe par un lecteur d'arabe : `locales/ar*.ts` (dont les annonces de sélection de l'étape 7 et `ar-rules`), fenêtre de filtre ouverte, tri, pagination | propriétaire (relecteur) | 4 |
| 4 | Essai Excel : ouvrir `examples/angular-audit/out/audit-ar.csv` (`npm run example:csv`) ; colonne A « التاريخ والوقت (Africa/Algiers) », ordre logique des colonnes, une note avec virgule dans une seule cellule | propriétaire | 4 |
| 5 | Écoute au lecteur d'écran, `docs/a11y-protocol.md` §7 à §15 (NVDA, VoiceOver ; arabe compris) | propriétaire | 5 |
| 6 | Réponses de l'API (§1, point 3) : offset ou curseur, total, borne de fin | propriétaire | 1 |
| 7 | Ligne mise de côté qui garde le dernier patient affiché tant qu'elle n'est pas réutilisée : acceptable pour des données de santé ? | propriétaire | — |
| 8 | Budget mémoire de la préparation de la recherche (≈ 630 o par ligne mesurés sur 100 000 × 10 colonnes texte) ; annonce du tri multiple | propriétaire | — |
| 9 | Critère 7 : « l'administrateur trouve-t-il cela mieux que la table précédente ? », mesuré en production avant de généraliser | propriétaire | 7 |
| 10 | L'essai dans Sehhaty même : installer les quatre archives de `npm run pack:local` (ou 0.1.0 une fois publiée) dans le tableau de bord, `ng build`, l'écran d'audit derrière un drapeau | propriétaire | 1, 6, 7 |

À côté, sans bloquer la piste : les demandes T1 à T11 à tzslot (`docs/tzslot-requests.md`) ; la publication de 0.1.0 (licence de GSAP confirmée, portée `@dzgrid` réservée sur npm, `@tzslot` 2.2.0 publié ; voir `CHANGELOG.md`).

## 3. Comment on la ferme

Chaque élément fermé est noté dans `docs/STATUS.md` (date, ce qui a été vu) et dans `ROADMAP.md` (Phase 3, tableau des critères : « renvoyé » devient « tenu »). La piste est close quand les critères 1, 4, 5 et 7 le sont.
