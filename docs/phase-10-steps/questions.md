# Phase 10 (pivot, tableau croisé) — questions au propriétaire et ses réponses

Questions posées depuis `docs/phase-10-plan.md` §5 (plan de l'architecte, 2026-11-06). **Réponses du propriétaire
(2026-11-06) : « ★ partout, tailles OK ».** Elles priment sur le plan. Les décisions prises seul en appliquant ces
réponses, et les mesures : `decisions.md`.

## Pourquoi et combien
- **Q-SC — Le pivot sert-il un écran réel ?** → **B.** Une version 1 propre et petite, sans serveur ; le propriétaire
  l'essaie ensuite.

## Ce que l'utilisateur voit
- **Q-P1 — En-têtes des colonnes créées.** → **A.** Sur plusieurs lignes : « 2025 » au-dessus de « Janv. » au-dessus de
  « Montant » (il faut charger `spans()`).
- **Q-P2 — Ordre des colonnes créées.** → **A.** Comme les groupes : par valeur (mois dans l'ordre du calendrier, textes
  par ordre alphabétique de la langue, « (Vide) » en dernier).
- **Q-P3 — Après un filtre, quelles colonnes ?** → **A.** Seulement celles qui ont encore des lignes.
- **Q-P4 — Totaux.** → **A.** Une colonne « Total » par valeur à la fin de chaque ligne + une ligne de total général ;
  sous-totaux par niveau seulement si l'appli les demande.
- **Q-P5 — Trop de valeurs différentes.** → **A.** Au-delà de 200 colonnes créées, aucune n'est créée ; un message donne
  leur nombre seulement.

## Comment on s'en sert
- **Q-P6 — Qui allume le mode pivot ?** → **A.** L'application ; l'utilisateur choisit seulement les colonnes
  (interrupteur « Tableau croisé » facultatif, si l'appli le veut).
- **Q-P7 — Où l'utilisateur choisit les colonnes du pivot.** → **A.** Une bande « Colonnes » à côté de « Regrouper
  par », avec un bouton « + » qui liste les colonnes (au clavier, sans glisser).
- **Q-P8 — Les valeurs.** → **A.** Les colonnes qui ont un total ; le menu ⋮ d'une colonne créée change sa fonction.
- **Q-P9 — Clic sur l'en-tête d'une colonne créée.** → **A.** Trie les lignes par ce total.

## Données, état, serveur
- **Q-P10 — Ce qu'on enregistre.** → **A.** Le mode, les colonnes du pivot et les fonctions (des noms de colonnes) ;
  jamais les colonnes créées (leurs noms contiennent des valeurs des lignes).
- **Q-P11 — Pivot avec un serveur.** → **A.** Pas dans cette phase : refusé avec un avertissement, la grille reste
  regroupée.
- **Q-P12 — Graphiques et Angular.** → **A.** Une fonction `series()` qui donne le tableau croisé prêt pour une
  bibliothèque de graphiques ; rien de nouveau en Angular (`ctrl.use(pivot)`).

## Découpage décidé avec le chef de projet (2026-11-06)
Premier lot : le cœur seul (fiches, resserrement du cache du regroupement, `@dzgrid/core/pivot` et ses cas de
conformité, la ligne de temps du critère de sortie, `series()`, l'état). Pas de DOM ni de navigateur dans ce lot ; le
DOM vient au lot suivant, après le compte rendu au propriétaire.
