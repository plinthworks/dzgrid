# S4 — Protocole manuel, lecteurs d'écran

> Copied from `spikes/s4-a11y/protocol.md` (Phase 0). The spike pages it refers to stay in `spikes/s4-a11y/`; the Phase 2 grid replaces them.

Ce que l'automate de `run.mjs` ne peut pas savoir : ce que les lecteurs **disent**. Ce protocole
est à suivre par une personne, avec chaque couple, en **français puis en arabe** :

| # | Lecteur | Navigateur | Système |
|---|---|---|---|
| A | NVDA (version stable du moment) | Firefox | Windows 11 |
| B | JAWS (version stable du moment) | Chrome | Windows 11 |
| C | VoiceOver | Safari | macOS (≥ 15) |
| D | TalkBack | Chrome | Android (≥ 14) |

Durée estimée : 45 min par couple et par langue.

## 0. Préparation

**Servir les pages.** Sur la machine de test (ou sur un Mac relié) :
```bash
node spikes/s4-a11y/serve.mjs     # affiche les URL des pages et le port
```
Le serveur écoute sur `127.0.0.1`. Windows : cloner le dépôt et lancer la commande sur la machine
Windows elle-même (`npm install` requis). Android : brancher le téléphone en USB et
`adb reverse tcp:<port> tcp:<port>`, puis ouvrir l'URL dans Chrome du téléphone.

Pages (toutes avec `&manual=1`, qui ajoute une barre de boutons de test avant la grille) :
`?lang=fr`, `?lang=ar`, `?lang=fr&mode=treegrid`, `?lang=ar&mode=treegrid`, `?lang=fr&mode=detail`,
`?lang=ar&mode=detail`, `?lang=fr&mode=paged`, `?lang=ar&mode=paged`.

Ordre de tabulation de la page : boutons de test → champ « avant » → **grille (un seul arrêt)** →
champ « après ». Les boutons « Dans 5 s : … » déclenchent l'action 5 secondes après l'activation :
le temps de revenir dans la grille avec Tab pour entendre l'annonce **pendant que le focus y est**.

**Réglages des lecteurs** (à noter dans le relevé s'ils diffèrent) :
- NVDA : Préférences → Mise en forme des documents → Tableaux : « Tableaux » coché,
  « En-têtes de lignes/colonnes : lignes et colonnes », « Coordonnées des cellules » coché.
  Parole → « Changement automatique de langue » coché ; une voix arabe installée (OneCore ar-SA ou
  ar-EG, ou eSpeak NG). Outils → **Visionneuse de parole** ouverte pour copier le texte exact.
- JAWS : Centre de paramètres → Tableaux : « Lecture des en-têtes : en-têtes de ligne et de
  colonne », « Coordonnées des cellules » activé ; détection de langue activée ; voix arabe
  installée. **Historique de la parole** : `Insert+Espace` puis `H`.
- VoiceOver : Utilitaire VoiceOver → Verbosité → Tableaux : annoncer les en-têtes de ligne et de
  colonne, et le nombre de lignes et de colonnes ; Parole : voix arabe (Majed ou Tarik) téléchargée,
  rotor Langues. Visuels → **Afficher le panneau de légende** (texte prononcé, à photographier
  ou copier). Safari : Réglages → Avancés → « Appuyer sur Tab pour mettre en évidence chaque
  élément » coché (sinon Tab saute les boutons).
- TalkBack : Paramètres → Accessibilité → TalkBack → Paramètres avancés → Paramètres pour les
  développeurs → **Afficher la sortie vocale** ; synthèse Google avec l'arabe installé.

**Langue** : passer d'abord le système et le lecteur en français, page `lang=fr` ; puis en arabe
(langue de l'interface du lecteur en arabe si possible), page `lang=ar`.

## 1. Relevé

Une ligne par étape, dans un tableur ou ce gabarit (copier dans `spikes/s4-a11y/results/manual-<lecteur>-<langue>.md`) :

| Étape | Lecteur + version | Navigateur + version | Langue | Mode (navigation / focus / formulaire) | Texte prononcé (copié de la visionneuse) | Attendu atteint ? (oui / dégradé / perdu) | Remarque |
|---|---|---|---|---|---|---|---|

- **oui** : l'information attendue est dite (l'ordre des mots et la formulation exacte peuvent varier).
- **dégradé** : information manquante ou en trop, mais l'utilisateur sait où il est.
- **perdu** : mauvais numéro de ligne, « fin du tableau » avant la ligne 10 001, focus perdu
  (retour au début de la page, silence après une touche), annonce absente ou coupée, lecture
  repartie du haut après un défilement, un tri ou une mise à jour.

Pour chaque étape, noter aussi si une annonce a été **interrompue** par une autre.

## 2. Étapes — page `?lang=fr&manual=1` (puis `?lang=ar&manual=1`)

Les flèches sont celles du français ; **en arabe (RTL), → et ← sont inversées** : ← va à la
colonne suivante (logique), → à la précédente.

1. **Entrée dans la grille.** Focus sur le champ « avant » (fr) / « قبل » (ar), puis `Tab`.
   Attendu : nom de la grille « Patients » / « المرضى », rôle grille ou tableau, **10 001 lignes,
   6 colonnes** ; puis la cellule : en-tête « Nom », « Patient 0 », ligne 2, colonne 1.
   NVDA et JAWS doivent passer seuls en mode focus / formulaire (noter si ce n'est pas le cas).
2. **Déplacement d'une cellule.** `→` (ar : `←`) : « Ville, Oran, colonne 2 ». `↓` : « Patient 1 »
   (en-tête de ligne), « Alger », ligne 3. `↑` deux fois : arrive sur l'en-tête « Ville » (ligne 1).
   Noter si l'en-tête de ligne n'est dit qu'au changement de ligne (souhaité) ou à chaque cellule.
3. **Saut lointain.** Activer « Aller à la ligne 5 000 » (bouton de test). Attendu : cellule
   « Alger », **ligne 5 001 sur 10 001**, colonne 2, en-têtes « Ville » et « Patient 4999 ».
   *Perdu* si le numéro dit est la position dans la fenêtre (de 1 à 31) au lieu de 5 001.
4. **Parcours au clavier.** `↓` × 40 (une à une, en écoutant) : les numéros croissent de 1, sans
   silence ni « fin du tableau ». `Page suivante` × 3 : saut d'environ 17 lignes à chaque fois.
   `Ctrl+Fin` : « ligne 10 001, colonne 6 » (Note, vide). `Ctrl+Début` : « Patient 0 », ligne 2.
5. **Région live.**
   a. `Ctrl+Début`, `↑` (en-tête « Nom »), `→` (ar : `←`) jusqu'à « Ville », `Entrée`. Attendu :
      « trié croissant » (état de l'en-tête), puis, poliment, « Trié par Ville, ordre croissant.
      10 000 lignes. » / « مرتب حسب المدينة، تصاعديًا. 10.000 صف. » — dite une seule fois, entière.
      **Arabe : noter comment « 10.000 » est lu** (« عشرة آلاف » attendu ; *dégradé* si lu
      « عشرة فاصلة صفر صفر صفر » ou chiffre par chiffre).
   b. `Entrée` encore : « décroissant » ; encore : tri retiré (« Tri retiré. »).
   c. Activer « Dans 5 s : filtrer sur Oran », revenir dans la grille par `Tab`, attendre.
      Attendu sans bouger : « Filtre appliqué : 1 667 lignes. » / « طُبّق المرشح: 1.667 صفًا. ».
      Puis `↓` : le nombre total de lignes annoncé doit être 1 668.
   d. « Dans 5 s : retirer le filtre » : annonce « Filtre appliqué : 10 000 lignes. ».
   e. Page `mode=paged` : « Dans 5 s : page suivante » ×2 → « Page 2 sur 100, lignes 101 à 200 sur
      10 000. » puis « Page 3… ». Noter le nombre de lignes de la grille annoncé ensuite (101 attendu).
6. **Rangée retenue (la question centrale).**
   a. Étape 3 (focus sur « Alger », ligne 5 001). Activer « Dans 5 s : défiler jusqu'à la fin
      (focus inchangé) », revenir dans la grille par `Tab` (plusieurs fois) : on doit retomber sur « Alger »,
      ligne 5 001. Attendre le défilement (visible à l'écran). Attendu : **rien** n'est annoncé, ou
      seulement un bruit discret ; aucune relecture de la page.
   b. `↓` : « Patient 5000 », ligne **5 002** (la grille revient en arrière). *Perdu* si l'on entend
      la ligne 9 977 ou plus, ou si le focus est ailleurs.
   c. Refaire a., puis « Dans 5 s : mettre à jour les données » et « Dans 5 s : trier par Âge » :
      le focus reste sur la même personne (même nom en en-tête de ligne), le numéro de ligne dit à
      la touche suivante est sa **nouvelle** position. Noter toute annonce de focus non demandée.
   d. Mode navigation (NVDA `Insert+Espace` ; JAWS `Insert+Z` ; VoiceOver : sortir de la table
      `VO+Maj+↑` puis `VO+→`) depuis la rangée retenue, lire vers le bas : la rangée suivante lue
      sera la première de la fenêtre (ex. 9 977) — **noter** ce que le lecteur annonce à ce saut
      (aucun avertissement attendu ; c'est la limite connue de la virtualisation).
7. **Commandes de tableau du lecteur** (elles déplacent le curseur du lecteur, pas le focus) :
   NVDA et JAWS `Ctrl+Alt+↓ / ↑ / → / ←` ; VoiceOver `VO+↓ / ↑ / → / ←` dans la table (après
   `VO+Maj+↓` pour interagir) ; TalkBack : balayage vers la droite / gauche.
   Depuis la ligne 5 001, descendre de 20 cellules par ces commandes : noter où elles s'arrêtent
   (attendu : à la dernière rangée montée, ~5 016, avec « bord du tableau » ou rien) et si les
   numéros dits restent ceux de `aria-rowindex`. Noter si `↓` (clavier du navigateur) reprend
   ensuite au bon endroit.
8. **Édition.** Ligne 5 001, aller à « Note » (`Fin`), `Entrée` : « Note, zone de texte » (champ
   vide), taper « essai », `Entrée` : retour sur la cellule, « essai » lu. `F2`, taper « x »,
   `Échap` : retour sur la cellule, « essai » (sans le x).
9. **Sortie et retour.** `Tab` : champ « après ». `Maj+Tab` : retour sur la dernière cellule
   focalisée (Note, ligne 5 001) même si elle a défilé hors de vue entre-temps.

## 3. Étapes — page `?mode=treegrid`

10. `Tab` dans la grille. Attendu : rôle arborescence de tableau / treegrid, 10 001 lignes ;
    « Service 0 », **développé**, **niveau 1**, **1 sur 100**.
11. `↓` : « Patient 1 », niveau 2, **1 sur 99**. « Aller à la ligne 5 000 » (ici : cellule « Patient 5001 »,
    colonne 1, niveau 2, 1 sur 99, ligne 5 003).
12. `←` (ar : `→`) : focus sur le parent « Service 50 », niveau 1, 51 sur 100, développé.
    `←` encore : « réduit » + annonce « Service 50 replié. » ; nombre total de lignes 9 902.
    `→` (ar : `←`) : « développé » + annonce « Service 50 déplié. 10 000 lignes. ».
    Noter : VoiceOver (macOS) ne reçoit pas la position « n sur m » des rangées (constat du spike) :
    vérifier ce qu'il dit à la place.
13. Rangée retenue : focus sur « Service 50 » replié, « Dans 5 s : défiler jusqu'à la fin »,
    revenir, attendre, `↓` : « Service 51 ».

## 4. Étapes — page `?mode=detail`

14. Ligne 2 : « Patient 0 », **développé** (la cellule maître porte `aria-expanded`). `↓` : la
    ligne de détail, une seule cellule sur 6 colonnes : « Détail de Patient 0 : Cardiologie — Oran,
    2026-01-01 ». **Noter si l'en-tête « Nom » est dit** avant le détail, et quel nombre de colonnes /
    quelle colonne est annoncée (le spike montre que Chrome rattache la cellule à la colonne 1).
15. `↑` sur « Patient 0 », `Entrée` : « réduit » ; la ligne de détail disparaît (`aria-rowcount` 10 005).

## 5. TalkBack (Android) — adaptation

Sans clavier : balayages. Avec un clavier Bluetooth : mêmes étapes que ci-dessus (TalkBack
transmet les flèches à la page quand le focus est dans la grille ; noter sinon).
- Étape 1 : balayer vers la droite depuis le champ « avant » jusqu'à la première cellule ; attendu :
  « Patient 0, en-tête de ligne, ligne 2, colonne 1 » (TalkBack annonce le tableau en entrant :
  « tableau, 10 001 lignes, 6 colonnes »).
- Étape 3 : toucher deux fois « Aller à la ligne 5 000 ». Le focus TalkBack suit-il le focus DOM ?
- Étape 6 : défiler à deux doigts jusqu'en bas, puis balayer : noter si le focus TalkBack
  (cadre vert) reste sur la rangée retenue, saute au début de la fenêtre ou se perd.
- Étape 5c : l'annonce du filtre est-elle dite pendant que le cadre est sur une cellule ?

## 6. Règle de décision (S4)

Si une étape est **perdu** pour un couple : appliquer, dans cet ordre, et refaire l'étape :
1. annoncer la position dans la région live après un saut (« Ligne 5 001 sur 10 001 ») ;
2. retenir aussi les rangées voisines de la rangée focalisée (± 1) pour que les commandes de
   tableau du lecteur ne tombent pas sur le vide ;
3. pour l'étape 6d (curseur virtuel), documenter la limite : la grille ne peut pas exposer 10 000
   rangées ; recommander la pagination quand le public l'exige.
Consigner le résultat dans `ROADMAP.md` (ligne S4) et dans `README.md` (Constats).

## 7. Étapes — fusions de cellules et en-têtes groupés (étape 9b)

Page : le bac à sable `playground/spans.html` (`npx vite --host 127.0.0.1`, puis
http://127.0.0.1:4700/spans.html ; sur un autre appareil, l'adresse du poste). Mêmes couples A à D,
en **français puis en arabe** (réglage « Données : arabe », la grille passe de droite à gauche).
Durée estimée : 20 min par couple et par langue. Pour chaque étape, noter ce qui est **dit**, mot
pour mot si possible : juste, incomplet, faux, ou perdu.

16. **Fusion lue une fois, avec ses coordonnées** (exemple 1). `Tab` jusqu'à la première cellule
    « Service » : attendu « Cardiologie », ligne 2, colonne 1 (ou 2 avec les cases), et l'étendue
    si le lecteur la donne (« couvre N lignes »). `→` puis `↓` trois fois dans « Patient » :
    à chaque ligne, le lecteur dit-il le service de la ligne (en-tête de ligne ou contexte) ou
    rien ? `←` depuis la 4ᵉ ligne : retour sur la cellule fusionnée, **dite une seule fois**, pas
    répétée pour chaque ligne qu'elle couvre.
17. **Commandes de tableau du lecteur** (NVDA `Ctrl+Alt+flèches`, JAWS `Ctrl+Alt+flèches`,
    VoiceOver `Ctrl+Option+flèches`) dans une colonne fusionnée : sur une ligne couverte, le lecteur
    trouve-t-il la valeur (la fusion), dit-il « vide », ou saute-t-il ? **Si une paire perd la
    valeur sur les lignes couvertes, le noter : c'est la condition d'O10 (cellules cachées qui
    répètent la valeur).**
18. **Fusion décidée par la donnée et ligne pleine largeur** (exemples 2 et 3). Sur la ligne du
    total : « Total : 10 rendez-vous », colonne 2, sur 3 colonnes si le lecteur le dit. Sur une
    ligne de titre : le titre entier est dit, une seule fois ; noter la colonne annoncée (Chrome
    rattache une cellule pleine largeur à la colonne 1).
19. **En-têtes groupés annoncés** (exemple 4). `Tab` dans la grille, puis dans le corps, colonne
    « Pouls » : en entrant dans la colonne, attendu « Clinique, Constantes, Pouls » (ou au moins
    « Constantes, Pouls »), puis la valeur. Colonne « Nom » : « Patient, Nom ». Colonne
    « Service » (sans groupe) : « Service », **sans** nom de groupe d'une autre colonne. Noter si
    un nom est **répété** (« Service, Service ») : les rangées de groupes portent, pour chaque
    colonne, une en-tête cachée (le nom du groupe, ou celui de la colonne là où il n'y a pas de
    groupe) parce que VoiceOver associe par position.
20. **Clavier dans les en-têtes groupés.** Sur l'en-tête « Pouls », `↑` : « Constantes », en-tête
    de colonne, **couvre 3 colonnes** si le lecteur le dit ; `↑` : « Clinique » ; `↓` `↓` : retour
    sur « Pouls ». Sur « Clinique », `→` (ar : `←`) : « Séjour » ; `Début` / `Fin` : premier et
    dernier groupe de la rangée. `Entrée` ou `Espace` sur un groupe : rien n'est trié, rien n'est
    annoncé.
21. **Groupe coupé par l'épinglage.** Cocher « première colonne épinglée » (Nom est épinglé) :
    deux cellules « Patient » ; noter si le lecteur annonce deux fois « Patient » en passant de
    l'une à l'autre (attendu : oui, ce sont deux morceaux du même groupe, O7).

Consigner le résultat dans `docs/behaviors/spans.md` (fin de la fiche) et dans `ROADMAP.md`
(ligne de l'étape 9b). Règle de décision propre à cette section : une valeur perdue sur les lignes
couvertes (étape 17) déclenche O10 ; un groupe faux ou manquant (étape 19) se corrige dans les
rangées de groupes avant toute autre chose.

## 8. Étapes — ligne de filtres sous les en-têtes (étape 12)

Page : le bac à sable avec la ligne de filtres, http://127.0.0.1:4700/?filters=1&floating=1
(`npx vite --host 127.0.0.1`), en **français** puis en **arabe** (réglage de langue « ar-DZ », la
grille passe de droite à gauche). Mêmes couples A à D. Durée estimée : 15 min par couple et par
langue. Noter ce qui est **dit**, mot pour mot si possible.

22. **La ligne trouvée au clavier.** `Tab` dans la grille, sur un en-tête (« Montant »), puis `↓` :
    attendu une cellule de la 2ᵉ rangée, colonne « Montant », sans « trié » ni nom de groupe en
    trop ; `↓` : la première ligne ; `↑` `↑` : retour sur l'en-tête. Le lecteur ne doit **pas**
    dire « lecture seule » sur une cellule qui contient une boîte.
23. **Entrer et sortir de la boîte.** Sur la cellule « Montant », `Entrée` (puis `F2`) : attendu
    « Filtrer Montant », zone de saisie (ar : « ترشيح المبلغ »), en mode formulaire ou édition
    (NVDA, JAWS) sans le forcer. Taper `1,5` (ar : `١٫٥`) : les flèches, `Début`, `Fin` restent dans
    le texte. Après une courte pause : « Filtré. N lignes » est dit une fois. `Échap` : retour sur
    la cellule, le filtre reste ; le lecteur sort du mode formulaire.
24. **Nombre illisible.** Taper `abc` : après la pause, « Montant : nombre non valide » est dit
    **une fois**, et la boîte est annoncée « non valide » si on y revient ; taper à nouveau efface
    l'état. Le signe `-` seul, en cours de frappe, ne doit rien faire dire.
25. **Résumé et Effacer.** Avec un filtre que la boîte ne sait pas modifier (sur « Jour », ou un
    « entre » posé par l'hôte) : `Entrée` sur la cellule mène au bouton « Effacer le filtre Jour »
    (ar : « مسح مرشح اليوم ») ; on entend aussi « Filtre actif ». `Entrée` sur le bouton : le filtre
    part, le focus revient sur la cellule, le nombre de lignes est dit.
26. **Un seul arrêt de tabulation.** Depuis le champ avant la grille, `Tab` entre dans la grille,
    `Tab` suivant en sort (sauf voile avec bouton) : aucune boîte de la ligne de filtres n'est un
    arrêt de tabulation tant qu'on n'y est pas entré par `Entrée` ou `F2`.

Consigner le résultat dans `docs/behaviors/filter-ui.md` (fin de la fiche) et dans `ROADMAP.md`
(ligne de l'étape 12). Règle de décision propre à cette section : un nom de boîte faux ou absent
(étape 23) ou une annonce répétée (étapes 23, 24) se corrige avant l'étape 13 ; une boîte dite
« lecture seule » (étape 22) remet en cause `aria-readonly` sur la grille.

## 9. Étapes — fenêtre de filtre (étape 13)

Page : le bac à sable avec la fenêtre et la ligne de filtres,
http://127.0.0.1:4700/?filters=1&popup=1&floating=1 (`npx vite --host 127.0.0.1`), en **français**
puis en **arabe** (réglage de langue « ar-DZ »). Mêmes couples A à D. Durée estimée : 15 min par
couple et par langue. Noter ce qui est **dit**, mot pour mot si possible.

27. **L'en-tête filtré.** Poser un filtre sur « Montant » (par la ligne flottante, `1`), revenir sur
    l'en-tête : attendu « Montant, filtré » (ar : « المبلغ، مرشح »), avec le tri s'il y en a un
    (« Montant, Tri 2, filtré » en tri multiple). Sans filtre : « Montant » seul, sans le nom du
    bouton. Le raccourci (Alt+Flèche bas) peut être dit : le noter.
28. **Ouvrir au clavier.** Sur l'en-tête « Montant », `Alt+↓` : attendu le nom de la fenêtre
    « Filtre Montant » (ar : « مرشح المبلغ »), dialogue, puis le champ « Valeur » (son texte
    sélectionné). Rien d'autre n'est dit à l'ouverture. Sur une cellule du corps, `Alt+↓` ne fait rien.
29. **Les champs.** `Maj+Tab` : « Condition », liste déroulante, sa valeur (« Égal à ») ; la
    changer pour « Entre » : un second champ « Jusqu’à » apparaît. `Tab` jusqu’à « Effacer le filtre
    Montant » puis « Appliquer » ; `Tab` encore : retour sur « Condition » (le focus reste dans la
    fenêtre).
30. **Appliquer.** Taper `1,5` (ar : `١٫٥`) dans « Valeur » et `50` dans « Jusqu’à », `Entrée` :
    la fenêtre se ferme, le focus revient sur l'en-tête (ou sur le bouton si on l'a ouverte à la
    souris), « Filtré. N lignes » est dit **une fois**. Avec `abc` : « Montant : nombre non valide »
    une fois, le focus sur le champ, la fenêtre reste ouverte.
31. **Échap.** Rouvrir, `Échap` : la fenêtre se ferme, le focus revient où elle s'est ouverte, sans
    fermer un dialogue autour de la grille.
32. **Le bouton.** À la souris (ou en mode navigation du lecteur), le bouton de l'en-tête est
    « Filtre Montant », bouton, « réduit » ; ouvert, « développé ».
33. **Oui / non.** Sur l'en-tête « Actif », `Alt+↓` : un groupe d'options « Filtre Actif » avec
    « Tous », « Oui », « Non » ; choisir « Oui » : « Filtré. N lignes » une fois.
34. **Résumé.** Avec un filtre « entre » sur « Montant », la cellule de la ligne flottante : `Entrée`
    mène au bouton « Filtre actif » (bouton qui ouvre un dialogue), puis « Effacer le filtre Montant ».
35. **Sur un serveur** (page serveur quand elle existera, ou noter « non testé ») : la saisie
    n'envoie rien ; `Appliquer` : le nombre est dit une fois la réponse arrivée.

Consigner le résultat dans `docs/behaviors/filter-ui.md` (fin de la fiche) et dans `ROADMAP.md`
(ligne de l'étape 13). Règle de décision propre à cette section : un nom de fenêtre faux ou absent
(28), un focus perdu à la fermeture (30, 31) ou une annonce répétée (30, 33) se corrige avant
l'étape 14 ; un nom d'en-tête qui contient celui du bouton (27) remet en cause l'`aria-label` posé
sur l'en-tête.

## 10. Étapes — filtres de dates sur tzslot (étape 14)

Page : le bac à sable avec la fenêtre et les colonnes de dates,
http://127.0.0.1:4700/?filters=1&popup=1&dates=1 (`npx vite --host 127.0.0.1`), en **français**
(zone Europe/Paris) puis en **arabe** (« ar-DZ »). Couples A à D, plus VoiceOver sur iOS et TalkBack
si possible. Durée estimée : 20 min par couple et par langue. Noter ce qui est **dit**, mot pour mot.

36. **Ouvrir un filtre de jour.** Sur l'en-tête « Jour », `Alt+↓` : le nom de la fenêtre « Filtre
    Jour » (ar : « مرشح اليوم »), puis « Condition », « Le » (ar : « في يوم »). La première fois, une
    ligne « Chargement du calendrier… » peut être dite (une fois, poliment) ; le focus ne bouge pas
    quand le calendrier arrive.
37. **Le déclencheur porte la valeur** (T1). `Tab` jusqu'au champ : attendu « Date, 29 mars 2026,
    bouton, ouvre un dialogue » (la date choisie dans le nom), « Date, Choisir une date » sans date.
38. **Le calendrier.** `Entrée` sur le champ : un dialogue nommé « Date » ; le jour sélectionné (ou
    aujourd'hui) dit avec son mois et son année ; `→` (ar : `←`) passe au jour suivant ; `Entrée`
    choisit, le calendrier se ferme, le focus revient sur le champ, qui dit la nouvelle date ; dans
    le navigateur, « Filtré. N lignes » est dit **une fois**.
39. **Échap à deux niveaux.** Calendrier ouvert, `Échap` : le calendrier se ferme, le focus sur le
    champ, la fenêtre de filtre reste. `Échap` encore : la fenêtre se ferme, le focus revient sur
    l'en-tête (ou le bouton), sans fermer un dialogue autour de la grille.
40. **Tab.** Calendrier ouvert, `Tab` / `Maj+Tab` restent dans le calendrier. Fermé, `Tab` depuis le
    champ va vers « Effacer le filtre Jour » puis « Appliquer », puis revient sur « Condition ».
41. **Entre et les raccourcis.** Choisir « Entre » : le champ « Période » ; l'ouvrir : les raccourcis
    « Aujourd'hui », « Hier », « 7 derniers jours »… (ar : « اليوم »، « أمس »، « آخر 7 أيام »),
    chacun bouton **bascule** (« enfoncé » pour celui en vigueur). En presser un : la période est dite
    (la ligne de résumé), le filtre s'applique, une seule annonce.
42. **Date et heure.** Sur la colonne « Rendez-vous » (zone Europe/Paris), la ligne « Fuseau
    horaire Europe/Paris » est dite avant le champ (ou en le parcourant). Choisir « Avant », taper
    `29/03/2026 02:30` : la note « 02:30 n'existe pas ce jour-là… » est dite ; l'heure devient 03:30.
    Taper `25/10/2026 02:30` : deux boutons « été » (enfoncé) / « hiver » ; presser « hiver ».
43. **Échec du chargement.** (Le bac à sable `?dates=fail` simule un calendrier introuvable.) Ouvrir
    un filtre de date : « Le calendrier n'a pas pu être chargé… » dit une fois (alerte), un bouton
    « Réessayer » ; « Vide » et « Non vide » marchent, `Échap` ferme.
44. **Sur iOS (VoiceOver) et Android (TalkBack)** : le calendrier dans la fenêtre se parcourt au
    balayage, le dialogue imbriqué est annoncé, le bouton de retour (geste) ferme le calendrier avant
    la fenêtre — noter sinon.

Consigner le résultat dans `docs/behaviors/filter-date-picker.md` (fin de la fiche) et dans
`ROADMAP.md` (ligne de l'étape 14). Règle de décision propre à cette section : un déclencheur sans la
date (37) se corrige chez tzslot (T1), notre contournement restant jusque-là ; un calendrier sans nom
ou un dialogue imbriqué que le lecteur ne voit pas (38, 44) bloque l'étape 18 ; une annonce répétée
(38, 41) se corrige avant l'étape 15.

## 11. Étapes — filtre par liste de valeurs (étape 15)

Page : le bac à sable avec la fenêtre et une colonne « Commune » à environ 2 000 valeurs,
http://127.0.0.1:4700/?filters=1&popup=1&sets=1 (`npx vite --host 127.0.0.1`), en **français**
puis en **arabe** (« ar-DZ », lien « Arabe, droite à gauche » de la page d'accueil). Couples A à D, plus VoiceOver
sur iOS et TalkBack si possible. Durée estimée : 20 min par couple et par langue. Noter ce qui est
**dit**, mot pour mot.

45. **Ouvrir.** Sur l'en-tête « Commune », `Alt+↓` : le nom de la fenêtre « Filtre Commune », puis
    « Rechercher des valeurs, zone de texte ». La première fois, « Chargement… » peut être dit une
    fois. La colonne « Statut » (liste d'options, sans `filter.kind`) n'a **pas** de bouton.
46. **La liste.** `Tab` une fois (« Tout sélectionner, case à cocher »), puis `Tab` : « liste,
    sélection multiple » (ou équivalent), puis la première option : attendu « <nom>, 12 lignes,
    sélectionné(e) / non sélectionné(e), 1 sur 2 001 » (l'ordre des mots dépend du lecteur).
47. **Cocher.** `Espace` : « sélectionné » ou « non sélectionné » est dit ; après une courte pause,
    « Filtré. N lignes » **une fois** (même après plusieurs `Espace` rapides). Aucune annonce par
    case cochée si le lecteur dit déjà l'état — **noter si un lecteur reste muet** (alors on ajoute
    une annonce).
48. **Se déplacer.** `↓`, `↑`, `Début`, `Fin`, `Page suivante` : chaque option est dite avec sa
    position « k sur 2 001 » ; `Fin` atteint la dernière. Taper « o » puis « r » vite : le focus va à
    la première valeur commençant par « Or » (accents ignorés : « e » trouve « É »).
49. **Tout sélectionner.** Après quelques cases : la case « Tout sélectionner » est dite « partiellement
    cochée » (mixed). La cocher : tout est coché, une seule annonce du filtre.
50. **Rechercher.** Dans la recherche, taper « bou » : la ligne d'état dit « 37 valeurs » une fois
    la liste stable (pas à chaque touche) ; la case devient « Tout sélectionner (affichées) ».
    Liste trop longue : « Les 2 000 premières valeurs. Affinez votre recherche. »
51. **Vides.** L'option « (Vides) » est dite avec son nombre de lignes ; absente pendant une recherche.
52. **Mode navigation.** En mode lecture (flèches du lecteur), seules les options dessinées sont
    lues (environ 25) : limite connue, comme la grille (§2, 6d). Noter ce que dit le lecteur.
53. **Focus gardé.** Sur une option, faire défiler la liste à la molette loin : revenir avec `↓` :
    le focus est toujours sur l'option, dite à nouveau correctement.
54. **Échec du chargement.** (`&setfail=1` simule une liste introuvable.) Ouvrir le filtre
    « Commune » : « Les valeurs n'ont pas pu être chargées… » dit une fois (alerte), un bouton
    « Réessayer » ; `Échap` ferme. Sur un serveur (écran d'audit, étape 18 :
    http://127.0.0.1:4700/audit.html?config=server&latency=1200, colonne « Ressource ») : cocher
    n'envoie rien ; `Entrée` dans la recherche ou « Appliquer » : une requête, « Filtré. N lignes »
    une fois ; un échec de la liste (`&fail=30`, ou le bouton « Faire échouer la prochaine requête »)
    se dit de même, et « Réessayer » met le focus dans la recherche.
55. **Arabe.** Pluriels (« قيمة واحدة », « قيمتان », « 3 قيم »…) dans la ligne d'état et les noms
    des options ; le nom de l'option (« X، 12 صفا ») lu dans le bon ordre ; les noms arabes de la
    liste alignés à droite, les latins à gauche de leur ligne (chacun dans son sens).

Consigner le résultat dans `docs/behaviors/filter-set.md` (fin de la fiche) et dans `ROADMAP.md`
(ligne de l'étape 15). Règle de décision propre à cette section : un lecteur muet au cochage (47)
ajoute une annonce par case (étape 18) ; une liste que le lecteur ne voit pas comme multi-sélection
(46) ou une position fausse (48) bloque l'étape 18 ; une annonce répétée (47, 50) se corrige avant
l'étape 16.

## 12. Étapes — recherche rapide (étape 16)

Page : le bac à sable avec le champ « Rechercher » au-dessus de la grille,
http://127.0.0.1:4700/?search=1 (`npx vite --host 127.0.0.1`), lien « Recherche rapide » de la page
d'accueil, en **français** puis en **arabe** (`?search=1&locale=ar-DZ&direction=auto`). Couples A à D.
Durée estimée : 10 min par couple et par langue. Noter ce qui est **dit**, mot pour mot.

56. **Le champ.** `Tab` jusqu'au champ : son nom « Rechercher dans la grille » et son rôle
    « zone de recherche » (ou « champ de recherche »).
57. **Taper.** Taper « bou » vite : rien n'est dit à chaque touche ; après une courte pause,
    « N lignes » **une fois**.
58. **Rien trouvé.** Taper « zzz » : « 0 ligne » une fois ; le voile « Aucune ligne ne correspond
    aux filtres » est visible (et dit s'il est atteint).
59. **Échap.** Champ rempli : `Échap` le vide, le nombre complet est dit une fois ; le focus reste
    dans le champ. Champ vide : `Échap` ne fait rien dans la grille.
60. **Vers la grille.** `↓` : le focus passe dans la grille, la cellule (ou la grille) est dite.
61. **Arabe.** Avec un clavier arabe et la saisie de voyelles (« مَرِيض »), rien n'est dit pendant la
    composition ; après la pause, le nombre est dit une fois ; le texte du champ s'écrit de droite à
    gauche dans une page française (`dir="auto"`).
62. **Avec les filtres.** (`?search=1&filters=1&floating=1&popup=1`) Une recherche puis un filtre :
    une seule annonce cohérente à chaque fois ; « Effacer les filtres » du voile vide aussi le champ.
63. **Serveur lent.** (écran d'audit, étape 18 : http://127.0.0.1:4700/audit.html?config=server&latency=1200,
    total inconnu ; puis « Total : connu ») rien n'est dit avant la réponse ; puis « N lignes » une
    fois, ou rien si le serveur ne connaît pas le nombre.

Consigner le résultat dans `docs/behaviors/quick-search-box.md` (fin de la fiche) et dans
`ROADMAP.md` (ligne de l'étape 16). Règle de décision propre à cette section : un nombre dit à chaque
touche (57) ou pendant une composition (61) se corrige avant l'étape 17 ; un champ dont le rôle n'est
pas dit (56) se signale à l'hôte (son `type="search"`), pas à la grille.

## 13. Étapes — pagination (étape 17)

Page : le bac à sable, lien « Pagination » de la page d'accueil, http://127.0.0.1:4700/?paging=client
(`npx vite --host 127.0.0.1`), puis le serveur par curseur sans total `?paging=cursor`, en
**français** puis en **arabe** (`&locale=ar-DZ&direction=auto`). Couples A à D. Durée estimée :
10 min par couple et par langue. Noter ce qui est **dit**, mot pour mot.

64. **Le repère.** Liste des repères (NVDA `D`, VoiceOver rotor) : « Pagination, Grille de données »,
    une navigation ; avec deux grilles, deux noms différents.
65. **Les boutons.** `Tab` dans le pied : « Première page, bouton, indisponible », « Page précédente,
    indisponible », « Page suivante, bouton », « Dernière page », « Lignes par page, liste ». Le texte
    « 1 à 50 sur 2 000 » se lit en mode lecture, il n'est pas annoncé de lui-même.
66. **Suivant.** `Entrée` sur « Page suivante » : une phrase, **une fois** : « Page 2 sur 40. 51 à
    100 sur 2 000 » ; le focus reste sur « Page suivante » ; la grille revient en haut.
67. **Indisponible.** Sur la dernière page, « Page suivante » est dit indisponible, ne fait rien et ne
    dit rien ; le focus ne part pas.
68. **Taille.** Changer « Lignes par page » à 100 : la nouvelle page dite une fois ; le focus reste sur
    la liste.
69. **Serveur lent.** (`?paging=cursor`) rien n'est dit avant la réponse ; puis « Page 3. 101 à 150 »
    (sans « sur … ») ; pas de bouton « Dernière page ».
70. **Sélection.** Cocher la case d'en-tête : les lignes de la page seulement ; le pied dit « 50 lignes
    sélectionnées » puis offre « Sélectionner les 2 000 lignes » ; l'activer : « Toutes les lignes
    correspondantes sélectionnées », le focus passe sur « Effacer la sélection » ; l'activer : le focus
    revient dans la grille. Page suivante après avoir coché quelques lignes : « … (certaines non
    affichées) ».
71. **Arabe.** Chiffres lus correctement (latins ou arabes selon `numerals`), pluriels justes (« صفان »),
    flèches dans le sens de lecture, première page à droite.

Consigner le résultat dans `docs/behaviors/pagination-footer.md` (fin de la fiche) et dans
`ROADMAP.md` (ligne de l'étape 17). Règle de décision propre à cette section : une phrase dite deux
fois (66, 68), ou un focus qui part (66, 67, 70), se corrige avant l'étape 18 ; un nom de bouton mal
traduit se corrige dans les textes (`locales/*-pagination.ts`).

## 14. Étapes — écran d'audit (étape 18)

Page : l'écran d'audit, http://127.0.0.1:4700/audit.html?config=server&latency=1200
(`npx vite --host 127.0.0.1`, lien « Écran d'audit » du menu Démos), en **français** puis en
**arabe** (`&lang=ar`), configuration B (tout sur le serveur) puis A (`&config=fetched`). Couples A
à D. Durée estimée : 15 min par couple et par langue. Noter ce qui est **dit**, mot pour mot.

72. **Taper lentement.** Dans « Rechercher dans le journal », taper « compte » lentement (une touche
    par seconde) : rien n'est dit pendant la frappe ni pendant le chargement ; après la réponse,
    « N lignes » **une fois** (rien avec « Total : inconnu » si le nombre n'est pas connu). Le texte
    tapé n'est jamais modifié par une réponse.
73. **Suivant sur un serveur lent.** « Page suivante » : les lignes restent, grisées, la grille est
    dite occupée si le lecteur le dit ; rien d'autre avant la réponse ; puis « Page 2. 51 à 100 »
    (« Page 2 sur … » avec un total) **une fois** ; le focus reste sur le bouton.
74. **Erreur.** Bouton « Faire échouer la prochaine requête », puis « Page suivante » : « Échec du
    chargement » dit une fois (alerte), le bouton « Réessayer » ; l'activer : « Chargement » puis la
    page dite une fois ; le focus revient dans la grille.
75. **Liste de valeurs.** Sur « Ressource », `Alt+↓` : la liste se charge (« Chargement… ») puis
    « 2 000 valeurs » ; cocher deux valeurs n'envoie rien ; « Appliquer » : une requête, « Filtré.
    N lignes » (ou « Filtré. Nombre inconnu ») **une fois**. Avec un échec de la liste : l'alerte,
    « Réessayer » met le focus dans la recherche de la liste.
76. **Clic dehors.** Fenêtre de filtre ouverte, un clic sur une cellule de la grille : la fenêtre se
    ferme (décision Q4 de l'étape 18) ; ce qui n'était pas appliqué est abandonné (serveur) ; le focus
    est sur la cellule cliquée, rien d'autre n'est dit. Un clic sur du texte de la page : le focus
    revient sur le bouton du filtre.
77. **Tri.** Cliquer « Date et heure » : rien n'est dit avant la réponse ; puis « Trié par Date et
    heure, croissant. » (avec « N lignes » seulement si le total est connu) **une fois**.
78. **Arabe.** Mêmes étapes en arabe, de droite à gauche : chiffres, pluriels, noms des boutons ;
    les noms arabes et latins de « الفاعل » lus chacun dans son sens.
79. **Palette.** Changer « Palette » pendant la lecture : rien n'est dit, la grille garde le focus et
    sa position.

Consigner le résultat dans `docs/behaviors/audit-screen.md` (fin de la fiche) et dans `ROADMAP.md`
(ligne de l'étape 18). Règle de décision propre à cette section : une phrase dite deux fois ou avec
un nombre faux (72, 73, 75, 77), ou un texte tapé modifié (72), se corrige avant l'étape 19 ; un
lecteur muet au cochage (75) ajoute une annonce par case (§11, item 47).

## 15. Étapes — règles de sélection, en-tête avec son propre champ de filtre (étape 21)

Page : le bac à sable, lien « Règles de sélection » du menu Démos, http://127.0.0.1:4700/?rules=1
(`npx vite --host 127.0.0.1`), en **français** puis en **arabe** (`&locale=ar-DZ&direction=auto`).
La règle de la démo : « si la ligne 4 est cochée, la ligne 8 ne peut pas l'être », et au plus cinq
lignes. Couples A à D. Durée estimée : 10 min par couple et par langue. Noter ce qui est **dit**, mot
pour mot (décision Q2 du propriétaire : « à vérifier à l'oreille »).

80. **La case grisée.** Cocher la ligne 4. Aller sur la ligne 8 : la ligne se lit comme les autres,
    « non sélectionnée » (jamais « indisponible » : pas d'`aria-disabled` sur la ligne). Noter si le
    lecteur dit quelque chose de la case grisée (il ne devrait rien dire de plus).
81. **Le refus.** `Espace` sur la ligne 8 : « Non sélectionnable : la ligne 4 est cochée »
    (la phrase de la règle de la démo, dite telle quelle) ; la ligne reste non sélectionnée ; rien d'autre n'est dit. `Espace` encore :
    la même phrase, **dite de nouveau**.
82. **Une plage.** Ligne 3, puis `Maj+Flèche bas` jusqu'à la ligne 9 et `Maj+clic` : « N lignes
    sélectionnées, 1 non sélectionnable » **une fois** (une seule phrase, pas deux).
83. **Tout.** `Ctrl+A` (Cmd+A) : les lignes affichées permises seulement, la phrase partielle ; la
    case d'en-tête se lit « cochée » quand toutes les lignes affichées sont cochées ou refusées.
84. **Décocher.** `Espace` sur une ligne cochée : toujours permis, « N lignes sélectionnées ».
85. **L'en-tête avec un champ.** Sur l'en-tête « Nom » (qui porte son propre champ de recherche) :
    `Tab` depuis l'extérieur n'entre pas dans le champ (un seul arrêt pour la grille) ; `F2` (ou
    `Entrée`) entre dans le champ, son nom est lu ; taper « an » : après la pause, « Filtré. N lignes »
    une fois ; `Échap` revient sur l'en-tête, le texte reste ; `Entrée` sur un autre en-tête sans champ
    trie comme avant.
86. **Arabe.** Mêmes étapes de droite à gauche : la raison et les nombres lus justes, le curseur du
    champ d'en-tête avance dans le sens de lecture.

Consigner le résultat dans `docs/behaviors/selection-rules.md` (fin de la fiche) et dans
`ROADMAP.md` (ligne de l'étape 21). Règle de décision propre à cette section : une ligne refusée lue
« indisponible » (80), un refus muet ou dit deux fois en une action (81, 82), ou un focus qui sort de
la grille (85) se corrige avant l'étape 22 ; un lecteur qui ne dit rien avant l'essai sur la case
grisée est attendu (Q2).

## 16. Étapes — arborescence de tableau, treegrid (Phase 4, étapes 4 à 7)

Page : le bac à sable, lien « Arbre » du menu Démos (`playground/tree.html`, étape 6 ;
`npx vite --host 127.0.0.1`), en **français** puis en **arabe** (`&locale=ar-DZ&direction=auto`).
Données : 100 services (niveau 1), chacun avec ses patients (niveau 2), certains patients avec
leurs séjours (niveau 3) ; au départ tout est replié sauf « Service 0 ». Couples A à D. Durée
estimée : 15 min par couple et par langue. Noter ce qui est **dit**, mot pour mot. Fiches :
`docs/behaviors/tree-view.md`, `tree-keys.md`, `tree-filter.md`, `tree-selection.md`.

Les phrases attendues ci-dessous sont celles des paquets `locales/{fr,ar}-tree` prévus (étape 4) ;
si le paquet final les a changées, noter la phrase dite et la comparer au paquet. Les mots d'état
(« développé », « réduit » ; en arabe « موسّع », « مطوي » ou proches) sont ceux du lecteur, pas de
la grille : noter les siens.

87. **Entrée.** `Tab` dans la grille. Attendu : rôle « arborescence de tableau » / treegrid (en arabe
    selon le lecteur : « شبكة شجرية » ou « جدول »), le nombre de lignes affichées, puis « Service 0 »,
    **développé**, **niveau 1**, **1 sur 100**. Noter si le lecteur dit le niveau et la position, ou
    seulement l'un des deux (VoiceOver ne disait pas « n sur m » au spike S4, §3).
88. **Descendre d'un niveau.** `↓` : « Patient 1 », **niveau 2**, **1 sur N** (N = patients du
    service). Un patient sans séjour ne dit ni « développé » ni « réduit ».
89. **Ouvrir au clavier.** Sur un patient qui a des séjours, colonne de l'arbre : `→` (ar : `←`).
    Attendu : « développé », puis l'annonce **une fois** — fr « Patient 3 développé, 4 lignes. »,
    ar « تم توسيع Patient 3، 4 صفوف. » ; le focus reste sur la ligne. `→` (ar : `←`) encore : le focus
    passe à la colonne suivante (une ligne ouverte ne s'ouvre pas deux fois).
90. **Fermer et remonter.** Revenir à la colonne de l'arbre, `←` (ar : `→`) : « réduit » et fr
    « Patient 3 réduit. », ar « تم طي Patient 3. ». `←` (ar : `→`) encore : le focus monte sur
    « Service 0 », même colonne, niveau 1, développé. Sur un service replié de niveau 1, `←`
    (ar : `→`) ne dit rien et ne bouge pas.
91. **Étoile.** Sur « Service 0 », `*` : les services frères s'ouvrent ; une seule phrase (fr « 99 lignes
    développées. », ar « تم توسيع 99 صفا. » — noter le nombre dit) ; le focus ne bouge pas.
92. **Le focus caché par une fermeture.** Ouvrir « Service 2 », descendre sur un de ses patients ;
    « Dans 5 s : replier Service 2 » (bouton de test), revenir dans la grille, attendre. Attendu : le
    focus est sur « Service 2 » (pas perdu, pas sur `body`), « réduit » dit.
93. **Filtre.** Champ de filtre « Nom » : taper un nom de patient. Attendu : « Filtré. 1 ligne » (fr)
    / « تمت التصفية. صف واحد (1) » (ar) — le nombre compte les correspondances, pas les services
    affichés en grisé. Descendre : le service parent est lu (texte grisé, sans mot particulier),
    développé, puis le patient, **1 sur 1**. Effacer le filtre : les services reviennent tels que
    l'utilisateur les avait ouverts.
94. **Sélection.** `Espace` sur un service : « sélectionné » pour ce service seul ; descendre sur un de
    ses patients : « non sélectionné » (pas de cascade). `Ctrl+A` : la phrase de sélection donne le
    nombre des lignes affichées.
95. **Arabe.** Mêmes étapes de droite à gauche : flèche **gauche** pour ouvrir, **droite** pour
    fermer et remonter ; le chevron d'une ligne repliée pointe vers la gauche ; les niveaux et
    positions lus en chiffres latins ou arabes selon le lecteur (noter lesquels).
95b. **Parents épinglés (silencieux).** « Tout déplier », puis descendre au clavier (`↓` maintenu, puis
    `Page suiv.`) loin dans les patients d'un service : à l'écran, le service et le patient restent
    épinglés sous l'en-tête (fiche `docs/behaviors/tree-sticky.md`). Attendu : le lecteur **ne dit
    rien** de ces copies — ni en défilant, ni en arrivant sur une ligne qu'elles couvraient ; chaque
    ligne n'est dite qu'une fois, avec son niveau et sa position ; la navigation du lecteur (VoiceOver
    `VO+↑`, NVDA mode navigation `↑`) ne s'arrête jamais sur une copie. `↑` jusqu'à une ligne qui
    était sous les copies : elle est dite normalement et reste visible (la grille fait défiler). Un clic
    sur une copie (souris) : le lecteur dit la vraie ligne focalisée, sans « sélectionné ». Noter tout
    mot dit en trop. Arabe : idem.
95c. **Enfants à la demande, réponse vide.** Page `playground/tree.html?lazy=client` (fiche
    `docs/behaviors/tree-lazy.md`). Ouvrir « Service 0 » et attendre ses patients ; sur « Patient 2 »
    (déclaré parent, le faux serveur ne rend aucun enfant), `→` (ar : `←`). Attendu : « Chargement »,
    puis **une fois** fr « Patient 2, aucune ligne », ar « Patient 2، لا توجد صفوف » (la clé `tree.empty` du paquet
    `locales/<lang>-tree`, étape 13) ; jamais « développé, 0 ligne ». La ligne devient une feuille : ni
    « développé » ni « réduit » ensuite, plus de chevron. Noter la phrase exacte et si le lecteur coupe
    « Chargement ».

Consigner le résultat dans `docs/behaviors/tree-view.md` (fin de la fiche) et dans `ROADMAP.md`
(clôture de la Phase 4, étape 13 ; écoute non bloquante). Règle de décision propre à cette section :
un niveau ou une position faux (87, 88, 93), une ouverture ou une fermeture muette ou dite deux fois
(89, 90, 91, 95c), un focus perdu (92) ou une copie épinglée dite ou atteinte (95b) se corrige avant la clôture de la Phase 4 ; un lecteur qui ne
dit pas `aria-posinset` (VoiceOver) est noté, sans correction si l'annonce dit l'action.

## 17. Étapes — ligne de détail, maître/détail (Phase 4, étapes 9 à 11)

Page : le bac à sable, lien « Maître/détail » du menu Démos (étape 10), en **français** puis en
**arabe**. Données : 10 000 patients ; le détail d'un patient est une petite grille de ses visites
(4 colonnes), hauteur 240 px ; « Patient 0 » ouvert au départ. Couples A à D. Durée estimée :
15 min par couple et par langue. Fiche : `docs/behaviors/master-detail.md`.

96. **Le maître ouvert.** `Tab` dans la grille, sur « Patient 0 », colonne « Nom » (celle du chevron) :
    la cellule est dite **développée** (`aria-expanded` sur la cellule du chevron, pas sur la ligne :
    une ligne de `grid` ne peut pas le porter, étape 10). Noter le mot exact, et ce qui est dit dans une
    autre colonne de la même ligne (rien sur l'état : attendu).
97. **Atteindre le détail.** `↓` : un seul arrêt, nom attendu fr « Détails de Patient 0 », ar
    « تفاصيل Patient 0 » (`detail.label` ; le nom vient d'un groupe ainsi nommé dans la cellule : noter
    si « groupe » est dit en plus, et si le contenu de la grille intérieure est lu — il ne devrait pas),
    une cellule qui couvre toutes les colonnes. Noter si l'en-tête d'une
    colonne est dit avant (le spike S4 montrait Chrome rattachant la cellule à la colonne 1), et
    quelle position de ligne est dite (elle compte la ligne de détail).
98. **Gauche, droite, début, fin.** Sur le détail : `←`, `→`, `Début`, `Fin` ne déplacent rien, ne
    disent rien de nouveau (ou relisent la même cellule).
99. **Entrer.** `Entrée` (ou `F2`) : le focus passe dans la grille intérieure, sur sa première
    cellule ; le lecteur annonce la grille intérieure (son nom, fr « Visites de Patient 0 », ar
    « زيارات Patient 0 », son nombre de lignes). Les flèches parcourent la grille intérieure ; la
    grille extérieure ne défile pas.
100. **Trier dedans.** Dans la grille intérieure, trier une colonne : la phrase de tri est celle de la
     grille intérieure, dite une fois ; rien n'est dit pour la grille extérieure.
101. **Sortir.** `Échap` : retour sur l'arrêt du détail (« Détails de Patient 0 »). `↓` : la ligne
     suivante, « Patient 1 », colonne retrouvée (celle d'avant le détail). `Tab` depuis l'intérieur
     ou l'arrêt : sort de la grille vers le champ « après » (pas de piège, WCAG 2.1.2).
102. **Fermer.** Sur « Patient 0 », colonne « Nom » (celle du chevron ; l'étape 10 garde les touches de
     l'arbre pour le maître) : `←` (ar : `→`) : annonce fr « Patient 0 réduit », ar « تم طي Patient 0 »
     (`detail.collapsed`), la ligne de détail disparaît ; le nombre de lignes diminue de 1. Si le
     focus était dans le détail, il revient sur « Patient 0 ». `→` (ar : `←`) rouvre : fr « Patient 0
     développé », ar « تم توسيع Patient 0 » (`detail.expanded`) ; un second `→` passe à la colonne
     suivante.
103. **Retour à un détail déjà ouvert.** Rouvrir « Patient 0 » : `↓`, `Entrée` : la grille
     intérieure revient triée et défilée comme laissée en 100.
104. **Arabe.** Mêmes étapes de droite à gauche ; noter la langue de la voix pour le nom du détail
     (texte arabe, nom du patient en caractères latins).

Consigner le résultat dans `docs/behaviors/master-detail.md` (fin de la fiche) et dans `ROADMAP.md`
(clôture de la Phase 4). Règle de décision propre à cette section : un détail lu sans nom ou sous le
nom d'une colonne seule (97), un piège clavier (101), une grille extérieure qui bouge quand on
travaille dedans (99, 100), ou un focus perdu à la fermeture (102) se corrige avant la clôture de la
Phase 4 ; une position de ligne qui compte le détail est attendue (le détail est une ligne).

## 18. Étapes — ligne de filtres affichable en direct (Phase 4, étape 12)

Page : le bac à sable avec la ligne de filtres et son bouton, http://127.0.0.1:4700/?filters=1&floating=1&popup=1
(lien « Filtres (ligne + fenêtre) et pages » du menu Démos), en **français** puis en **arabe**. Le bouton
« Ligne de filtres » (ar « صف المرشحات ») est au-dessus de la grille. Couples A à D. Durée estimée : 10 min par
couple et par langue. Fiche : `docs/behaviors/floating-toggle.md`.

105. **Le bouton.** `Tab` jusqu'au bouton : nom « Ligne de filtres », état **enfoncé** (`aria-pressed`, la ligne
     est montrée au départ). Noter le mot exact de l'état.
106. **Masquer.** `Espace` sur le bouton : annonce fr « Ligne de filtres masquée », ar « تم إخفاء صف المرشحات »
     (dite une fois, en plus du nouvel état « non enfoncé » que le lecteur dit lui-même : noter si les deux
     se suivent sans se couper). Le focus reste sur le bouton.
107. **Le filtre reste.** Avant 106, taper `1` dans la case « Nom » de la ligne de filtres puis masquer **sans
     attendre** : le filtre s'applique (« Filtré. N lignes » peut être dit), et l'en-tête « Nom » est lu
     « Nom, filtré » (ar « الاسم، مرشح ») une fois la ligne masquée.
108. **Le focus dans la ligne.** Dans la console du navigateur :
     `setTimeout(() => filtering.floating.set(false), 8000)`, puis revenir dans la grille, entrer dans la case
     « Montant » de la ligne de filtres (`↓` depuis l'en-tête, `Entrée`) et attendre : la ligne se masque, le
     focus va sur l'en-tête « Montant », qui est dit ; aucune phrase « Ligne de filtres masquée » (le masquage
     vient de l'application, pas de l'utilisateur).
109. **Montrer.** `Espace` sur le bouton : annonce fr « Ligne de filtres affichée », ar « تم إظهار صف المرشحات » ;
     aucune phrase « Filtré » de plus. `Tab` dans la grille, `↓` depuis un en-tête : la case du même filtre,
     qui contient `1`.
110. **Compte des lignes.** Ligne masquée puis montrée : la position de ligne dite sur une cellule du corps
     change d'un (la rangée de filtres compte comme une ligne d'en-tête).

Consigner le résultat dans `docs/behaviors/floating-toggle.md` (fin de la fiche) et dans `ROADMAP.md` (clôture de
la Phase 4). Règle de décision : une annonce manquante ou dite deux fois (106, 109), un filtre perdu au masquage
(107) ou un focus perdu (108) se corrige avant la clôture de la Phase 4.

## 19. Étapes — édition (Phase 5, partie A)

Page : le bac à sable, démo « Stock » inventée (Q19 ; `playground/stock.html`, construite aux étapes 5 à 7),
en **français** puis en **arabe** (`&locale=ar-DZ&direction=auto`). Données : 200 produits ; colonnes « Produit »
(texte, en-tête de ligne, lecture seule), « Stock » (nombre, obligatoire, au moins 0, modifiable), « Péremption »
(date, modifiable), « Statut » (liste : Disponible, Rupture, Retiré), « Actif » (oui/non) ; liste triée par
« Stock » et filtrée « Stock > 0 ». Le faux serveur d'enregistrement répond en 1,5 s ; le bouton « Refuser le
prochain » fait refuser l'enregistrement suivant (raison : « stock verrouillé ») ; le bouton « Supprimer la ligne
dans 5 s » retire la ligne focalisée. Couples A à D. Durée estimée : 20 min par couple et par langue. Noter ce qui
est **dit**, mot pour mot. Fiches : `docs/behaviors/editing.md`, `editors.md`, `edit-save.md`,
`edit-validation.md`, `edit-reapply.md`, `edit-undo.md`.

Les phrases attendues sont celles des paquets `locales/{fr,ar}-edit` prévus ; si le paquet final les a changées,
noter la phrase dite et la comparer au paquet.

111. **Lecture seule.** `Tab` dans la grille, colonne « Produit » : la cellule est dite **lecture seule** (ar :
     le mot du lecteur, « للقراءة فقط » ou proche) ; `→` (ar : `←`) sur « Stock » : rien de tel. `F2` sur
     « Produit » : rien ne s'ouvre, rien n'est dit.
112. **Ouvrir.** Sur « Stock », `F2` : un champ d'édition, nom « Stock, Paracétamol » (en-tête de colonne puis de
     ligne ; noter l'ordre dit), valeur lue. `Échap` : retour sur la cellule, valeur inchangée, rien dit de plus.
113. **Taper pour remplacer.** Sur « Stock », taper `7` : le champ s'ouvre avec « 7 » seul. `Entrée` : fr
     « Enregistrement en cours » (ar « جارٍ الحفظ »), dit **une fois** ; le focus reste sur la cellule (défaut depuis la révision Q3 ; avec `enterMoves: 'down'` il descend d'une ligne). Pendant
     1,5 s une ligne court autour de la cellule (vue) : **rien n'est dit** pour elle ; à la fin, ni « enregistré »
     ni autre phrase (la coche et l'éclat se voient). Noter toute phrase en trop.
114. **Refus local.** Sur « Stock », taper `abc`, `Entrée` : le bord clignote en rouge ~0,5 s (vue), le champ
     reste ouvert avec « abc » ; dit **une fois** fr « Stock : valeur refusée, nombre attendu », ar
     « Stock: قيمة مرفوضة، المطلوب رقم » ; le champ est dit **invalide** et sa description (le message) lue au
     retour sur le champ. `Entrée` encore : animation et phrase **encore une fois**. `Échap` : valeur d'avant,
     rien dit.
115. **Obligatoire.** Sur « Stock », `Suppr` : refus, fr « Stock : valeur refusée, valeur obligatoire », ar
     « Stock: قيمة مرفوضة، القيمة مطلوبة » ; aucun champ ne s'ouvre ; la valeur reste.
116. **Quitter avec une valeur fausse.** Taper `-3` dans « Stock », puis cliquer une autre cellule : fr « Stock :
     valeur refusée, modification annulée », ar « Stock: قيمة مرفوضة، أُلغي التعديل » ; le focus est sur la
     cellule cliquée (jamais ramené en arrière).
117. **Refus du serveur.** « Refuser le prochain », puis taper `12` dans « Stock », `Entrée` : « Enregistrement en
     cours », puis après 1,5 s, une fois, fr « Stock : non enregistré, stock verrouillé. Valeur précédente
     rétablie. », ar « Stock: لم يُحفظ، stock verrouillé. أُعيدت القيمة السابقة. » (raison de l'hôte, ici en
     français dans les deux langues). Revenir sur la cellule : l'ancienne valeur, puis sa description fr « Non
     enregistré : stock verrouillé », ar « لم يُحفظ: stock verrouillé ». `F2` : le champ propose « 12 ».
118. **Ordre à remettre.** Mettre « Stock » à `0` sur une ligne (le filtre est « Stock > 0 ») : la ligne reste,
     grisée (vue) ; après la phrase d'enregistrement, **une fois** fr « Ordre de la liste à mettre à jour : la
     marque de l'en-tête remet en ordre », ar « ترتيب القائمة بحاجة إلى تحديث: علامة العنوان تعيد الترتيب ».
     Une deuxième modification ne le redit pas. Sur l'en-tête « Stock » : fr « Stock, …, à remettre en ordre »,
     ar « Stock، بحاجة إلى إعادة الترتيب » (noter l'ordre des mots de tri et de filtre). Descendre sur la ligne
     grisée : sa description fr « Ne correspond plus au filtre », ar « لم يعد مطابقًا للمرشح ». Sur l'en-tête,
     `F2` (entrer dans ses contrôles) puis `Entrée` sur la marque : fr « Remis en ordre, N lignes », ar
     « أُعيد الترتيب، N … » ; la ligne grisée part ; le focus n'est jamais perdu. (`Entrée` sur l'en-tête,
     elle, trie, ce qui remet aussi en ordre.)
119. **Annuler.** Hors champ, `Ctrl+Z` (Mac `Cmd+Z`) : fr « Annulé : Stock », ar « تم التراجع: Stock », puis
     « Enregistrement en cours » ; le focus va sur la cellule annulée. `Ctrl+Y` : fr « Rétabli : Stock », ar
     « تمت الإعادة: Stock ». Dans un champ ouvert, `Ctrl+Z` défait la frappe, la grille ne dit rien.
     Tout annuler puis `Ctrl+Z` : fr « Rien à annuler », ar « لا شيء للتراجع عنه ».
     (Étape 8, S8-O6 : la phrase d'annulation et « Enregistrement en cours » sont dites dans la même annonce,
     « Annulé : Stock. Enregistrement en cours » ; à écouter : la phrase entière, une seule fois.)
120. **Date.** Sur « Péremption », `F2`, `Alt+↓` : « Chargement du calendrier » peut être dit, puis le calendrier
     (dit par tzslot) ; choisir un jour : retour dans le champ, la date écrite ; `Échap` deux fois depuis le
     calendrier : le premier ferme le calendrier, le second annule. Taper `31/02/2026`, `Entrée` : fr
     « Péremption : valeur refusée, date attendue (JJ/MM/AAAA) », ar « Péremption: قيمة مرفوضة، المطلوب تاريخ (…) ».
121. **Liste.** Sur « Statut », `Entrée` : une liste, l'option courante dite ; taper `r` : « Rupture », `r`
     encore : « Retiré » ; `Entrée` : choisie, enregistrée, le focus reste sur la cellule (défaut, révision Q3 ; en bas avec `enterMoves: 'down'`). En arabe, mêmes étapes avec les
     libellés arabes de la démo.
122. **Oui/non.** Sur « Actif », `Espace` : la valeur dite change (oui ↔ non), « Enregistrement en cours » ; la
     ligne n'est **pas** sélectionnée. Sur « Produit », `Espace` : la ligne est sélectionnée (comme avant).
123. **Ligne supprimée pendant la frappe.** « Supprimer la ligne dans 5 s », ouvrir « Stock » de cette ligne,
     taper `9` sans valider, attendre : une fois fr « Ligne supprimée, modification annulée », ar « حُذف الصف،
     أُلغي التعديل » ; le focus sur la ligne voisine, jamais sur `body`.
124. **Arabe.** Mêmes étapes de droite à gauche : `Tab` dans un champ va vers la gauche ; les chiffres
     arabes-indiens tapés dans « Stock » (`١٢`) sont acceptés ; le curseur dans un nombre va comme dans un
     champ de gauche à droite. Noter la langue de la voix pour les noms de colonnes.

124a. **Méthode de saisie (étape 5 ; à la main, CDP ne pilote pas celle du système).** Page
     `orders-edit.html` (bac à sable, 127.0.0.1:4700), colonne « Client » d'une sous-commande. macOS, clavier
     **Japonais – Romaji** : sur la cellule, taper `kana`, `Espace`, `Entrée` : le champ s'ouvre vide, « かな »
     y arrive en entier (aucun premier caractère perdu), l'`Entrée` de la composition ne garde rien ; une seconde
     `Entrée` garde. **Pinyin – Simplifié** : `zhongwen` → « 中文 », même règle. Clavier **français** : touche
     morte `^` puis `e` → « ê » dans le champ. Un premier caractère perdu se note (risque de l'étape 5 ; repli :
     un champ caché par grille, question au propriétaire).
     **Bloquant** pour la clôture de la partie A (revue de l'étape 5) : sans méthode du système active sur une
     cellule (elle n'est pas un champ), la première lettre romaji peut arriver brute (« kかな ») ; le repli est un
     risque de l'étape 6.
124b. **Téléphone et tablette (étape 5, S5-O4).** iOS Safari et Android Chrome : une tape sur une cellule
     modifiable la sélectionne seulement ; deux tapes rapides ouvrent le champ **et** le clavier ; un refus
     (`abc` dans « Qté ») montre la bulle sous la cellule (au-dessus si pas de place), jamais sous le clavier ni
     sur le champ ; le lecteur (VoiceOver, TalkBack) dit le nom du champ, puis la phrase du refus.

124c. **Calendrier (étape 6).** Page `orders-edit.html` (fr, puis `?locale=ar-DZ`), « Date » : F2 puis `Alt+↓`
     (ou le bouton) : le lecteur dit le dialogue « Ouvrir le calendrier », puis le jour sélectionné ; les flèches
     disent les jours (inversées en arabe) ; `Entrée` écrit la date, le focus revient au champ, qui est dit
     « liste déroulante » avec sa valeur ; `Échap` deux fois : le calendrier, puis la modification. Si le
     morceau ne se charge pas (réseau coupé) : « Le calendrier n’a pas pu se charger » dit une fois, « Réessayer ».
124d. **Liste (étape 6).** « Statut » : F2 : « Statut, O-0002, liste déroulante, En attente » ; `↓` dit chaque
     option ; taper `l` va à « Livrée » ; en arabe une lettre (« م ») va à l’option et répétée passe à la
     suivante ; `Entrée` garde, la phrase « enregistré » n’est pas dite (O3).
124e. **Oui / non (étape 6).** « Urgent » : `Espace` bascule, le lecteur dit « Oui » ou « Non » (poliment) ; la
     ligne n’est pas sélectionnée ; une cellule en lecture seule sélectionne la ligne comme avant.
124f. **Annuler, étape 8 (`orders-edit.html`, fr puis `?locale=ar-DZ`).** Clavier AZERTY : `Ctrl+Z` (la touche Z)
     annule, `Ctrl+W` ne fait rien ; clavier arabe : `Ctrl+ظ` annule, `Ctrl+غ` rétablit. Les boutons « Annuler » /
     « Rétablir » (ar « تراجع » / « إعادة ») : grisés (`aria-disabled`) sans rien à annuler ; pressés, le focus va sur
     la cellule et la phrase est dite. Annuler une sous-commande dont la commande est fermée (`?tree=1`) : la phrase
     est dite, le focus reste sur la cellule d'où l'on a appuyé.
124g. **Arbre et détail (étape 8).** `orders-edit.html?tree=1` : dans le champ de la colonne « Commande », `←` / `→`
     déplacent le curseur, la ligne ne s'ouvre ni ne se ferme ; « Commande mère » est dite « lecture seule ».
     `detail.html` : modifier un « Montant » dans les visites d'un patient, `Ctrl+Z` dans cette grille annule la visite
     seulement ; « Enregistrement lent », fermer le patient pendant l'enregistrement puis le rouvrir : la cellule dit
     encore « Enregistrement en cours », puis la valeur est gardée ; rien n'est dit sur un panneau fermé.

Consigner le résultat dans `docs/behaviors/editing.md` (fin de la fiche) et dans `ROADMAP.md` (clôture de la
partie A de la Phase 5). Règle de décision propre à cette section : une phrase de refus manquante ou dite deux
fois (114–117), une bordure animée dite (113), un focus perdu ou ramené de force (116, 118, 123), une touche
d'un champ qui agit sur la grille (119) ou un « lecture seule » manquant (111) se corrige avant la clôture de la
partie A ; l'ordre « colonne, ligne » du nom d'un champ est noté, sans correction s'il est dit en entier.

## 20. Étapes — blocs de cellules, presse-papiers, recopie (Phase 5, partie B)

Page : le bac à sable, démo des commandes (`orders-edit.html`, plages actives ; `?range=0` les coupe), en
**français** puis en **arabe** (`?locale=ar-DZ`). Fiches : `docs/behaviors/range-selection.md`,
`clipboard.md`, `fill.md`. Un tableur ouvert à côté (Excel, LibreOffice ou Google Sheets) pour 129–130.
Noter ce qui est **dit**, mot pour mot ; les phrases attendues sont celles des paquets `locales/{fr,ar}-range`
prévus (si le paquet final les a changées, noter la phrase dite et la comparer au paquet). Couples A à D.
Durée estimée : 20 min par couple et par langue.

125. **Étendre au clavier.** Sur une cellule « Qté », `Maj+↓` deux fois puis `Maj+→` : chaque cellule
     atteinte est lue (le focus suit le coin qui bouge, QB2), dite **sélectionnée** ; après une courte pause,
     **une fois** fr « 3 lignes, 2 colonnes sélectionnées », ar « 3 صفوف، عمودان محددان » (ou proche).
     Aucune phrase pendant que les touches se suivent.
126. **La ligne entière.** `Maj+Espace` : la ligne entière est sélectionnée, sa taille dite une fois.
127. **Tout.** `Ctrl+A` (Mac `Cmd+A`) : toutes les cellules affichées, la taille dite ; aucune ligne n'est
     cochée (QB1 : les lignes se cochent par leur case).
128. **Effacer le bloc.** `Échap` : fr « Sélection effacée », ar « أُلغي التحديد » (ou proche), une fois ; le
     focus reste sur la cellule. Une flèche sans `Maj` fait de même sans phrase de plus.
129. **Copier.** Un bloc de 3 × 2, `Ctrl+C` : fr « Cellules copiées : 6 », ar « النسخ: 6 » (étape 11b, S11b-Q4) ; coller dans le
     tableur : six cellules, les nombres reconnus comme nombres (virgule décimale en français), les dates
     comme dates. Dans un champ ouvert, `Ctrl+C` copie le texte du champ, la grille ne dit rien.
130. **Coller, avec un refus.** Copier dans le tableur trois cellules dont une « abc » vers « Qté » ;
     `Ctrl+V` sur la grille : une phrase **une seule fois**, fr « Cellules collées : 2 ; refusées : 1.
     Enregistrement en cours », ar « اللصق: 2؛ مرفوضة: 1. … » ; la cellule refusée **clignote** (vue) ;
     « Enregistrement en cours » une fois, dans la même phrase, pas une par cellule. Coller hors de la grille
     (sur la dernière ligne un bloc de 3 lignes) : « … ; hors de la grille : 2 ». Un collage trop grand :
     « Collage trop grand : au plus 100 000 cellules ; rien n’est collé ». **Couper** (`Ctrl+X`, S11b-Q1) :
     « Cellules coupées : n », les cellules vidées tout de suite, un `Ctrl+Z` rend tout.
131. **Annuler un collage.** `Ctrl+Z` : fr « Annulé : 3 cellules » (ou la phrase du paquet `-edit` pour
     plusieurs cellules), une fois ; toutes les cellules collées reprennent leur valeur ; le focus va sur la
     première.
132. **Recopier vers le bas.** Un bloc de 3 lignes sur « Qté », `Ctrl+D` (Mac `Cmd+D`) : la première valeur
     recopiée dans les deux autres, une phrase une fois ; le navigateur n'ouvre pas son dialogue de favori.
133. **Supprimer un bloc.** `Suppr` sur un bloc dont une colonne est en lecture seule : les cellules
     modifiables vidées, une phrase avec le compte, fr « Cellules effacées : 4 ; en lecture seule : 2 »,
     ar « المسح: 4؛ للقراءة فقط: 2 » ; un `Ctrl+Z` rend tout.
134. **En arabe.** Mêmes étapes de droite à gauche : `Maj+←` étend vers la **fin** logique (la gauche à
     l'écran), `Ctrl+R` recopie vers la gauche ; la poignée de recopie est en bas à gauche (vue) ; la copie
     collée dans le tableur garde l'ordre logique (la première colonne de la grille en colonne A).
135. **Grille imbriquée.** `detail.html` : un bloc dans les visites d'un patient, `Ctrl+C` : seules les
     cellules du panneau sont copiées (la grille extérieure ne dit rien) ; `Échap` efface le bloc du panneau
     seulement.
136. **Bruit « non sélectionné ».** Avec un bloc présent, se déplacer hors du bloc avec les flèches : le
     lecteur ne doit **pas** dire « non sélectionné » sur chaque cellule (les cellules hors du bloc n'ont pas
     `aria-selected`, choix de la fiche `range-selection.md` 12). Dans le bloc : « sélectionné » dit. Noter,
     par lecteur (NVDA, JAWS, VoiceOver, TalkBack), ce qui est dit dans et hors du bloc.

137. **Mode recopie au clavier** (étape 12, S12-Q2). Sur « Qté » (deux cellules `1, 2` en bloc),
     `Ctrl+Maj+Entrée` : fr « Recopie : flèches pour étendre, Entrée pour écrire, Échap pour annuler », une fois ;
     `↓` trois fois, une pause : « Vers le bas : 3 lignes » ; `Entrée` : « Cellules recopiées : 3.
     Enregistrement en cours », les valeurs `3, 4, 5`. En arabe, `←` va vers la **fin** logique. `Échap` dans le
     mode : « Recopie annulée », le bloc reste. Noter si un lecteur ou une méthode de saisie prend
     `Ctrl+Maj+Entrée` avant la page.
138. **Ctrl+D / Ctrl+R avec un lecteur** : une phrase par geste ; **le navigateur n'ouvre ni son dialogue de
     favori ni ne recharge** (vérifier dans un vrai navigateur, avec fenêtre : les navigateurs sans fenêtre ne le
     montrent jamais). Sur la première ligne, `Ctrl+D` est laissé au navigateur (rien à recopier).
139. **Ctrl+Entrée, modification en masse** : un bloc de « Statut », `F2`, choisir une valeur, `Ctrl+Entrée` :
     « Cellules modifiées : n », une fois ; le champ se ferme, le focus reste sur la cellule (même avec
     `?enter=down`).
140. **Glisser la poignée avec un lecteur en marche** : une seule phrase, au lâcher. La poignée (petit carré en
     bas à droite, **en bas à gauche en arabe**, pointeur en croix) se voit aussi sur une seule cellule cliquée
     (S12-Q8) ; elle n'est pas lue (`aria-hidden`).
141. **Annuler une recopie** : `Ctrl+Z` après un glisser : « Annulé : n cellules », le focus sur la première.
142. **Sans glisser** (WCAG 2.5.7) : un clic sur la poignée : « Recopie : cliquez la cellule jusqu'où
     recopier ; Échap pour annuler » ; un clic sur une cellule plus bas : écrit comme un lâcher là ; `Échap`
     après le premier clic : « Recopie annulée », rien d'écrit.

Consigner le résultat dans `docs/behaviors/range-selection.md` (fin de la fiche) et dans `ROADMAP.md`
(clôture de la partie B). Règle de décision propre à cette section : une phrase de compte manquante ou dite
deux fois (125, 129–133), une phrase par cellule au lieu d'une par geste (130, 131), un focus perdu (128,
131), une touche d'un champ qui agit sur la grille (129) se corrige avant la clôture de la partie B ; le
« non sélectionné » d'un lecteur (136) est noté : s'il manque « sélectionné » dans le bloc chez un lecteur,
question au propriétaire (mettre `aria-selected="false"` partout, ou garder le choix).

## 21. Étapes — colonnes : déplacer, menu ⋮, choisir, redimensionner, groupes repliables, lignes épinglées, densité, impression (Phase 6)

Page : le bac à sable, démo des commandes (`orders.html`, avec le menu, le choix des colonnes, le
déplacement, l'état et la densité, étape 12) et la démo RH (`hr.html` : groupes repliables, textes longs,
une ligne de totaux modifiable), en **français** puis en **arabe** (`?locale=ar-DZ`). Fiches :
`docs/behaviors/column-move.md`, `column-menu.md`, `columns-chooser.md`, `column-resize.md`,
`header-groups.md`, `pinned-rows.md`, `density.md`, `grid-state.md`, `auto-height.md`, `print.md`.
Noter ce qui est **dit**, mot pour mot ; les phrases attendues sont celles du paquet `locales/{fr,ar}-columns`
prévu (si le paquet final les a changées, noter la phrase dite et la comparer au paquet). Couples A à D.
Durée estimée : 30 min par couple et par langue. Rien n'est « validé » avant cette écoute.

143. **Le bouton ⋮.** Tabuler jusqu'à la grille, monter sur l'en-tête « Nom » : le lecteur dit l'en-tête (nom,
     tri) ; le bouton ⋮ n'est **pas** un arrêt de Tab de plus (une seule tabulation pour la grille). Avec la
     souris, le bouton apparaît au survol ; sur un écran tactile, il est toujours là.
144. **Ouvrir le menu au clavier.** Sur « Nom », `Maj+F10` (ou la touche Menu) : le lecteur dit « menu » et le
     premier élément, fr « Tri croissant », ar « ترتيب تصاعدي » ; le tri en cours est dit **coché**. Un seul
     menu s'ouvre (pas deux : `Maj+F10` déclenche aussi le menu contextuel dans certains navigateurs). Sur une
     colonne **sans** filtre, `Alt+↓` ouvre aussi le menu ; sur une colonne avec filtre, `Alt+↓` ouvre toujours
     le filtre.
145. **Parcourir le menu.** `↓`, `↑`, `Début`, `Fin` ; taper « m » va à « Masquer la colonne » (en arabe, taper
     la première lettre d'un élément). Les éléments grisés sont dits « indisponible » (ou « estompé ») et ne
     font rien.
146. **Épingler.** « Épingler au début », `Entrée` : fr « Nom épinglée au début », ar « Nom مثبّت في البداية » ;
     le menu se ferme, le focus revient sur l'en-tête « Nom », qui est maintenant au bord de début (à droite en
     arabe).
147. **Fermer sans rien faire.** Rouvrir, `Échap` : rien n'est dit de plus ; le focus revient sur l'en-tête.
     Rouvrir, `Tab` : même chose. Un clic dehors : même chose.
148. **Masquer.** « Masquer la colonne » : fr « Nom masquée » ; le focus va sur l'en-tête voisin (jamais perdu,
     jamais sur le haut de la page). Sur la dernière colonne visible, « Masquer » est indisponible.
149. **Déplacer au clavier.** Sur « Qté », `Ctrl+Maj+→` (Mac `Cmd+Maj+→`, décision « Step 1 follow-ups ») :
     fr « Qté : colonne 4 sur 9 », ar « Qté: العمود 4 من 9 » — le compte ne porte que sur les colonnes
     **visibles** (masquer une colonne avant : « sur 8 ») ; le focus reste sur « Qté ». Trois fois vite : **une** phrase après la pause.
     Au bord du groupe de colonnes non épinglées : « Qté : déjà au bord ». En arabe, `Ctrl+Maj+←` va vers la
     **fin** logique (la gauche). Noter si un lecteur (NVDA, JAWS) ou le système (macOS : Spaces) prend la
     touche avant la page.
150. **Déplacer par le menu.** « Déplacer vers la fin » : même phrase qu'en 149 (le chemin sans glisser).
151. **Glisser un en-tête avec un lecteur en marche.** Une seule phrase, au lâcher ; `Échap` pendant le
     glisser : « Déplacement annulé ». Sur une colonne verrouillée (`movable: false`) au clavier : « … ne se
     déplace pas ».
152. **Choisir les colonnes.** Depuis le menu, « Choisir les colonnes… » : le lecteur dit la fenêtre, fr
     « Choisir les colonnes, dialogue », et le champ « Rechercher une colonne » (étiquette visible). Taper
     « dat » : après une pause, fr « Colonnes trouvées : 2 » ; en arabe, taper sans hamza (« اسم ») trouve
     « إسم » si une colonne s'appelle ainsi.
153. **Cocher et décocher.** `↓` dans la liste : chaque ligne est une vraie case à cocher, dite avec son nom et
     son état **coché** / **non coché** ; la liste n'est qu'un seul arrêt de Tab. La dernière colonne cochée
     est dite **indisponible** (on ne peut pas tout masquer).
     `Espace` : la colonne disparaît de la grille à l'instant, fr « Date masquée » ; `Espace` encore : « Date
     affichée ».
154. **Changer l'ordre dans la fenêtre.** `Alt+↓` (Mac `Option+↓`) sur « Date » : fr « Date : place 5 sur 12 »,
     ar « Date: الموضع 5 من 12 » — le compte porte sur **toutes** les colonnes de la liste, masquées comprises
     (différent de 149) ; le focus reste sur la ligne ; la grille derrière a bougé. Au doigt ou à la souris, le
     bouton ▼ de la ligne fait de même, la même phrase ; la poignée est dite « Glisser Date » si on y arrive. Avec du texte dans la recherche : fr « Videz la recherche pour
     changer l'ordre ».
155. **Fermer la fenêtre.** `Échap` dans la recherche non vide la vide ; `Échap` encore ferme ; le focus revient
     sur l'en-tête d'où le menu était parti. Ouverte par un bouton de l'application : le focus revient à ce
     bouton.
156. **Redimensionner au clavier.** Sur « Nom », `Alt+R` (ou le menu « Redimensionner au clavier ») : fr
     « Redimensionner Nom : 140 pixels. Flèches pour changer, Entrée pour garder, Échap pour annuler » ; `→`
     trois fois puis une pause : « Nom : 170 pixels » (une seule phrase) ; `Maj+→` : 1 pixel ; au bout :
     « …, maximum ». En arabe, `←` **élargit**. `Échap` : « Redimensionnement annulé », la largeur d'avant.
     `Entrée` : garde, rien de plus. `F2` sur l'en-tête n'entre **pas** dans ce mode. À la souris : les boutons
     « − », « + », « ✓ » sous l'en-tête font de même sans glisser ; dans le menu, « Élargir » laisse le menu
     ouvert et la largeur est dite après une pause.
157. **Ajuster au contenu.** Dans le mode, `Début` : la colonne prend la largeur de son texte le plus long,
     la largeur dite. Menu « Ajuster toutes les colonnes » : fr « Colonnes ajustées : 9 », une fois. Vérifier à
     l'œil en arabe que les textes arabes ne sont pas coupés.
158. **Groupe repliable.** `hr.html`, monter sur l'en-tête de groupe « Identité » : fr « Identité, groupe
     ouvert » ; `Entrée` : fr « Identité fermé, colonnes affichées : 1 » ; le focus reste sur l'en-tête de
     groupe ; `Espace` : le rouvre. Fermer le groupe alors que le focus était sur une de ses cellules (par la
     souris) : le focus va sur la colonne restante de la même ligne, jamais perdu.
159. **Lignes épinglées — lecture.** `hr.html`, la ligne de totaux en bas : depuis la dernière ligne du corps,
     `↓` y entre ; le lecteur dit (ou pas : le noter, par lecteur) « Lignes épinglées en bas ». `Ctrl+Fin` va sur
     la dernière ligne **du corps**, pas sur les totaux. Trier par une colonne : la ligne épinglée ne bouge pas,
     et le nombre de lignes dit après le tri ne la compte pas.
160. **Lignes épinglées — modification** (décision Q-P = C). Sur une cellule modifiable de la ligne épinglée,
     `F2`, taper, `Entrée` : les mêmes phrases que dans le corps (§19 : « Enregistrement en cours », refus,
     « Annulé ») ; **aucune** phrase « ordre de la liste à mettre à jour ». Une cellule de totaux non modifiable
     est dite « lecture seule ». `Ctrl+Z` : la valeur revient, le focus sur la cellule épinglée.
161. **Densité.** Menu ⋮, groupe « Densité », « Compacte » : fr « Densité : compacte », ar « الكثافة: مضغوطة » ;
     la ligne qui avait le focus reste visible ; le focus revient sur l'en-tête.
162. **État retrouvé.** Déplacer, masquer, trier, filtrer, puis recharger la page (`?state=1`, stockage du
     navigateur) : la grille revient pareille, filtres compris, et **rien n'est dit** au chargement en plus de
     l'habituel ; le focus n'est pas volé. Recharger en arabe : mêmes colonnes au bord de début (à droite).
     **L'adresse** (copier l'URL, l'ouvrir dans un autre onglet) : colonnes, tri et page reviennent, **mais pas
     le filtre tapé ni la recherche** (décision O6 : ils ne vont dans l'adresse que si l'application le
     demande) ; vérifier qu'aucun nom tapé n'apparaît dans l'adresse.
163. **Hauteur automatique.** `hr.html`, colonne de titres longs : en lisant ligne à ligne vers le bas, le
     lecteur et l'écran ne sautent pas (la ligne lue reste visible) ; agrandir le texte du navigateur à 200 % :
     les lignes grandissent, rien n'est coupé.
164. **Impression.** Bouton « Imprimer » du bac à sable, aperçu (ou PDF) : un vrai tableau, en-têtes répétés
     sur chaque page, aucune ligne coupée ; en arabe, la première colonne à droite. Lire le PDF avec le lecteur
     (si le lecteur PDF expose le tableau) : en-têtes de colonnes dits avec les cellules. Au-delà de 5 000
     lignes : fr « 5 000 premières lignes sur 12 345 » au-dessus du tableau.
165. **Tab enfermé dans « Choisir les colonnes ».** Fenêtre ouverte, `Tab` sans arrêt : recherche → liste (un
     seul arrêt) → « Tout afficher » → « Réinitialiser » → « Fermer » → retour à la recherche ; jamais la page
     derrière ni la grille. `Maj+Tab` dans l'autre sens. Le lecteur ne sort pas non plus de la fenêtre en mode
     lecture (VoiceOver : `VO+→` ; NVDA : `↓` en mode navigation) : noter s'il y arrive.
166. **Mac, VoiceOver.** Safari puis Chrome, VoiceOver en marche, sur l'en-tête « Nom » : `VO+Maj+M` ouvre le menu
     de la colonne (pas le menu du navigateur), le premier élément dit ; `Ctrl+clic` sur l'en-tête fait de même ;
     `Fn+Maj+F10` aussi. Puis `Échap` : retour sur l'en-tête. Noter si VoiceOver ouvre son propre menu à la place.

Consigner le résultat dans les fiches concernées (fin de chaque fiche) et dans `ROADMAP.md` (clôture de la
Phase 6). Règle de décision propre à cette section : un focus perdu ou envoyé en haut de la page (147, 148,
155, 158), une phrase manquante ou dite deux fois (146, 149, 153, 154, 156), deux menus ouverts (144), une
phrase « à mettre à jour » sur une ligne épinglée (160), une touche prise par la page alors qu'elle est dans
un champ, se corrigent avant la clôture de la Phase 6. Une touche prise avant la page par un lecteur ou par le
système (149, 156) : question au propriétaire (autre touche, ou le menu seulement). Un Tab qui sort de la
fenêtre (165) ou `VO+Maj+M` qui n'ouvre pas le menu (166) se corrigent aussi avant la clôture.
