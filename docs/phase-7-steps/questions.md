# Phase 7 (regroupement et totaux) — questions au propriétaire et ses réponses

Questions posées depuis `docs/phase-7-plan.md` §5 (plan de l'architecte, 2026-10-28). **Réponses du propriétaire
(2026-11-04) : « ★ partout dans le §5, tailles OK ».** Elles priment sur le plan. Les décisions prises seul en
appliquant ces réponses, et les mesures : `decisions.md`.

## Écrans
- **Q-SE — Que regroupent les écrans de Sehhaty ?** → **B.** On construit le cas général ; le propriétaire vérifie
  ensuite sur ses écrans. Pas de regroupement et de détails ensemble sur une même grille dans cette phase.

## Ce que l'utilisateur voit
- **Q-G1 — Où s'affiche le nom du groupe ?** → **A.** Dans la première colonne visible (ou celle que l'appli choisit),
  en retrait avec le chevron, comme l'arbre ; aucune colonne ajoutée.
- **Q-G2 — Ordre des groupes.** → **A.** Par valeur, croissant ; un tri décroissant sur la colonne regroupée l'inverse.
  « (Vide) » toujours en dernier.
- **Q-G3 — « Alger » et « alger » : un groupe ou deux ?** → **A.** Deux (valeur exacte).
- **Q-A1 — Le total général.** → **A.** Une ligne « Total » à la fin des lignes (elle défile avec elles ; en haut sur
  demande), plus `totals()` pour qu'une appli remplisse elle-même une ligne épinglée.
- **Q-A2 — « Nombre » compte quoi ?** → **A.** Les lignes du groupe.
- **Q-A3 — Avec un pied de groupe, la ligne du groupe ouvert garde-t-elle ses totaux ?** → **A.** Oui.
- **Q-E1 — Au départ, les groupes sont…** → **A.** Fermés (l'appli peut demander tout ouvert ou jusqu'à un niveau).
- **Q-E2 — Pendant une recherche, ouvrir seuls les groupes qui contiennent un résultat ?** → **A.** Non.
- **Q-SEL — Cocher un groupe.** → **A.** Impossible ; Ctrl+A prend ce qui est affiché.
- **Q-K1 — Entrée sur une ligne de groupe.** → **A.** Ouvre ou ferme le groupe.
- **Q-H — Les colonnes regroupées.** → **A.** Restent affichées.

## La zone « Nom × »
- **Q-Z1 — Comment l'appli l'active.** → **B.** Une fonction séparée `groupZone()`.
- **Q-Z2 — Les trois choix de la fiche.** → **A.** Tels quels (la colonne déposée reste affichée ; tirer une étiquette
  hors de la zone ne la retire pas ; une zone par grille).

## Données, état, serveur
- **Q-ED — Après une modification de cellule.** → **A.** La ligne reste dans son groupe jusqu'à « Réappliquer », les
  totaux changent tout de suite.
- **Q-T — Mises à jour en direct.** → **A.** Tout recalculer, mesuré ; seulement les totaux quand aucune colonne
  regroupée ne change.
- **Q-SRV — Regrouper avec un serveur.** → **A.** Refusé en Phase 7 (avertissement, grille à plat) ; Phase 8.
- **Q-PG — Regroupement et pages du navigateur.** → **A.** Refusé, les groupes s'affichent en entier.
- **Q-ST — L'état enregistré.** → **A.** Les colonnes de regroupement (`rowGroups`), jamais les groupes ouverts.
- **Q-EX — Export et impression.** → **A**, **et l'export Excel aussi** : lignes de groupe et leurs totaux, comme le CSV.

## Tailles et ordre
- **Q-B — Les octets.** → **A, avec la règle d'aujourd'hui** (le tableau du plan est périmé) : la ligne d'une nouvelle
  entrée = la mesure + 10 % ; une ligne existante peut monter de 2 % au plus (règle automatique) ; au-delà, arrêt et
  rapport au propriétaire. K.8 est à 90 000 (mesuré ≈ 89 150), base DOM 23 260, base du cœur 29 150.
- **Q-RA — La page « vraie application ».** → **A.** Inchangée en Phase 7.
