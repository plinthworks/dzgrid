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
