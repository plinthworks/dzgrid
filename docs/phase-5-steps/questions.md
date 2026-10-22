# Phase 5 (editing): the owner's questions (architect, 2026-10-22)

Plan: `docs/phase-5-plan.md`. Each question: the text for the owner in simple French, 2–4 options, the recommended one (★). The answers go to `docs/phase-5-steps/decisions.md` and win over the plan.

## Scope and naming

**Q1 — Ce que la phase contient.** L'architecture met tout dans l'édition : modifier une cellule, mais aussi choisir un bloc de cellules, copier-coller depuis Excel, tirer la poignée pour remplir, changer beaucoup de lignes d'un coup.
- A. Tout dans cette phase, en deux parties : d'abord modifier une cellule (avec enregistrement et annuler), puis les blocs, le copier-coller et la poignée. ★
- B. Seulement modifier une cellule ; le reste plus tard.
- C. Tout d'un coup, sans partie séparée.

**Q2 — Le nom.** L'architecture appelle l'édition « Phase 4, partie D » et réserve « Phase 5 » aux colonnes avancées (déplacer, menu, état sauvegardé).
- A. L'édition devient la Phase 5 ; les phases suivantes avancent d'un numéro ; version 0.3.0 à la fin. ★
- B. On garde « Phase 4, partie D » (la 0.2.0 attendrait l'édition).

## Using the editor

**Q3 — La touche Entrée dans une cellule en cours de modification.**
- A. Entrée enregistre et descend à la ligne suivante, comme dans Excel ; Maj+Entrée monte. Réglable par l'application (« rester »). ★
- B. Entrée enregistre et reste sur la cellule. Réglable (« descendre »).
- C. Pas de réglage : toujours descendre.

**Q4 — Comment commencer à modifier une cellule.**
- A. F2, Entrée, double-clic, ou taper directement une lettre ou un chiffre (le texte est remplacé) ; Suppr vide la cellule. Pas sur un simple clic. ★
- B. Pareil, plus le simple clic.
- C. Seulement F2 et double-clic.

**Q5 — Quitter la cellule sans appuyer sur Entrée** (clic ailleurs, Tab).
- A. Ce qui est tapé est gardé et enregistré. ★
- B. Ce qui est tapé est perdu (il faut Entrée).

**Q9 — Une valeur refusée** (texte dans une colonne de nombres, champ obligatoire vide).
- A. La cellule reste ouverte, un message dit pourquoi ; Échap annule. Pour un collage, les cellules refusées sont sautées et comptées. ★
- B. La valeur est gardée en rouge, mais pas enregistrée tant qu'elle n'est pas corrigée.

**Q11 — Annuler et rétablir** (Ctrl+Z, Ctrl+Y).
- A. Oui dans cette phase, 100 gestes en mémoire ; annuler une valeur déjà enregistrée l'enregistre à nouveau. ★
- B. Plus tard.

## Rows that move

**Q6 — Après une modification, une ligne ne correspond plus au tri ou au filtre.** (Exemple : on met le stock à 0 dans une liste filtrée « stock > 0 ».)
- A. Elle reste à sa place, un peu grisée, jusqu'à ce que l'utilisateur remette en ordre ; ainsi rien ne saute sous ses yeux. ★
- B. Elle part dès que l'enregistrement a réussi.
- C. Elle part tout de suite.

**Q7 — Comment l'utilisateur remet la liste en ordre** (si Q6 = A).
- A. Une petite marque sur l'en-tête trié ou filtré, dite une fois au lecteur d'écran ; un clic sur cette marque remet en ordre ; l'application peut aussi le faire. ★
- B. Seulement au prochain tri ou filtre fait par l'utilisateur.
- C. Seulement par l'application (son propre bouton).

**Q8 — La ligne disparaît pendant qu'on la modifie** (données rechargées, ligne supprimée ailleurs).
- A. Si la ligne existe encore (juste cachée) : ce qui est tapé est gardé et enregistré. Si elle est supprimée : c'est annulé et on le dit. ★
- B. Toujours annulé.
- C. Toujours enregistré, même si la ligne est supprimée.

**Q13 — Arbre : modifier la colonne qui dit qui est le parent** (ou le chemin d'une ligne).
- A. Pas possible dans cette phase (la colonne reste en lecture seule ; déplacer des lignes viendra avec le glisser de lignes). ★
- B. Possible ; la ligne change de place quand l'enregistrement revient.
- C. Possible ; elle change de place seulement quand on remet en ordre.

## Saving

**Q10 — Montrer l'enregistrement en cours, réussi ou raté.**
- A. Des marques fixes seulement (petit signe pendant, coche brève après, signe d'erreur qui reste) ; l'application peut animer elle-même.
- B. Les marques, plus un petit éclat animé quand c'est enregistré (comme pour une valeur qui change). ★
- C. B, plus une bordure qui tourne autour de la cellule pendant l'enregistrement (idée à essayer, coûte un peu de poids).
- D. B maintenant, la bordure en option que l'application allume.

**Q18 — Grilles servies par un serveur page par page** (comme l'écran d'audit).
- A. On peut y modifier ; la valeur reste affichée jusqu'à la prochaine réponse du serveur ; l'application décide si elle recharge. ★
- B. Rechargement automatique de la page après chaque enregistrement.
- C. Pas de modification sur ces grilles dans cette phase.

## Other choices

**Q12 — Donner le « contexte » de l'application aux filtres personnalisés et au tri** (ex. le rôle de l'utilisateur, la pharmacie choisie). Cela change le cœur et coûte environ 100 octets.
- A. Oui maintenant : les règles « modifiable ou non » et la validation en ont besoin aussi. ★
- B. Plus tard.

**Q14 — Modifier une date.**
- A. On tape la date ; un calendrier (tzslot) s'ouvre à la demande, chargé seulement s'il sert, comme dans les filtres. ★
- B. On tape la date seulement.

**Q15 — Choisir dans une liste** (statut, unité…).
- A. Une liste simple où l'on tape les premières lettres pour aller au bon choix ; la liste avec champ de recherche plus tard. ★
- B. La liste avec recherche tout de suite (plus lourde).

**Q17 — Angular.**
- A. L'application donne sa fonction d'enregistrement et reçoit des événements (cellule modifiée, échec) ; ses propres éditeurs par un gabarit ; pas de formulaires Angular. ★
- B. A, plus un état « modifications en attente » lié dans les deux sens.

**Q19 — Le premier écran réel de Sehhaty avec édition** (`pharma/stock`).
- A. On construit d'abord une démo « stock » inventée dans le bac à sable ; vous écrivez la vraie fiche (colonnes, règles, API d'enregistrement) avant la partie 2. ★
- B. Vous écrivez la vraie fiche maintenant, et on travaille dessus dès le début.

## Budgets

**Q16 — Les tailles** (octets compressés ; remis à la mesure + 10 % à la fin, jamais au-dessus de ce que vous accordez).
- (a) cœur : garder 29 000 (les coutures, ~250–400, entrent dans la marge de 760) ;
- (b) nouveau `@dzgrid/core/edit` 3 000 ; plus tard `@dzgrid/core/range` 4 000 ;
- (c) base DOM 21 300 → 21 800 (marge 652, besoin ~400–600) ;
- (d) nouveau `@dzgrid/dom/editors` 8 000 (chiffre de l'architecture), calendrier chargé à part 2 600 ; plus tard `@dzgrid/dom/range` 4 500 ;
- (e) textes `-edit` en / fr / ar : 350 / 400 / 450 ;
- (f) thème 2 500 → 2 900 ;
- (g) Angular 6 250 → 6 900 (marge 12) ;
- (h) animations : gardé 3 150, ou 3 500 si la bordure de Q10 C/D est choisie ;
- l'exemple Angular réel reste sous 90 000 (prévu ~88 000), le profil K.8 sous 83 500.

Options :
- A. Tout accepter pour la phase. ★
- B. Accepter seulement ce que demande la partie 1 ; la partie 2 redemande.
- C. Refuser des hausses : dites lesquelles, on cherche les octets ailleurs.
