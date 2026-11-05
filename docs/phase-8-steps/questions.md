# Phase 8 (défilement continu, modèle côté serveur) — questions au propriétaire et ses réponses

Questions posées depuis `docs/phase-8-plan.md` §5 (plan de l'architecte, 2026-11-05). **Réponses du propriétaire
(2026-11-05) : « ★ partout dans le §5, tailles OK ».** Elles priment sur le plan. Les décisions prises seul en
appliquant ces réponses, et les mesures : `decisions.md`.

## Le besoin
- **Q-SE — Quel écran en a besoin ?** → **A.** On construit les deux, dans cet ordre : le défilement continu
  (`@dzgrid/core/infinite`, étapes 1–5), puis les groupes chargés par le serveur (`@dzgrid/core/server-side`, étapes 6–7).
- **Q-MODE — Pages et défilement continu.** → **A.** L'appli choisit par grille ; les pages restent le défaut. Avec le
  défilement, pas de boutons de page ; le nombre de lignes reste affiché.

## Ce que l'utilisateur voit
- **Q-BLK — Combien de lignes à la fois, combien en mémoire.** → **A.** 100 lignes par demande, 20 paquets gardés
  (2 000 lignes) ; l'appli peut changer les deux.
- **Q-END — Quand le serveur ne donne pas le total.** → **A.** La barre de défilement s'allonge à mesure qu'on descend ;
  Ctrl+Fin va à la dernière ligne connue (appuyé encore, plus loin).
- **Q-LR — Une ligne pas encore arrivée.** → **A.** Une ligne grisée « Chargement… » ; si la demande échoue : « Les
  données n'ont pas pu être chargées » et « Réessayer » à cet endroit.
- **Q-PURGE — Après un tri ou un filtre, et après « Rafraîchir ».** → **A.** Tri ou filtre : retour en haut, tout est
  redemandé ; Rafraîchir : on garde l'écran et on recharge derrière (la barre fine).

## Sélection, copie, export
- **Q-SEL — « Tout sélectionner » sur 10 millions de lignes.** → **A.** « Tout ce que les filtres trouvent », sans rien
  charger ; l'appli reçoit les filtres et les lignes décochées (comme les pages serveur).
- **Q-COPY — Copier un bloc qui contient des lignes pas encore arrivées.** → **A.** Refusé, avec la phrase « Certaines
  lignes ne sont pas encore chargées » (étape 5).
- **Q-EX — Export et impression.** → **A.** « Tout » et « sélection » par la fonction d'export de l'appli ; « affiché »
  et l'impression : les lignes déjà chargées (étape 5).

## Groupes chargés par le serveur (étapes 6–7)
- **Q-WIRE — Ce que le serveur répond pour un niveau de groupes.** → **A.** Une liste explicite : pour chaque groupe sa
  valeur typée, son nombre de lignes et ses totaux ; les lignes normales seulement au dernier niveau.
- **Q-TOT — Les totaux.** → **A.** Le serveur seul les calcule ; une fonction de total maison est refusée ; le total
  général s'affiche si le serveur l'envoie.
- **Q-OPEN — Après un tri ou un filtre, les groupes ouverts…** → **A.** Restent ouverts ; leur contenu est redemandé
  quand on les voit.

## Mises à jour, Angular, tailles
- **Q-TX — Mises à jour en direct.** → **A.** Une ligne modifiée change tout de suite si elle est chargée ; un ajout ou
  une suppression fait redemander les lignes visibles ; les changements arrivés ensemble sont groupés (50 ms).
- **Q-NG — Angular.** → **A.** `[source]` avec la nouvelle fonction, plus `refresh({ purge })` et `applyTransaction`
  sur le contrôleur (étape 8).
- **Q-B — Les tailles.** → **A.** Par la règle d'aujourd'hui : une nouvelle entrée = sa mesure + 10 % ; une ligne
  existante +2 % au plus ; au-delà, arrêter et le dire au propriétaire.
