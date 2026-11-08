# Parcours essentiel — écoute au lecteur d'écran (Phase 11, lot L4c)

Trente étapes prises dans le protocole complet (`docs/a11y-protocol.md` §2 à §29, qui reste la référence pour un
passage plus tard). Environ **45 minutes par lecteur et par langue**. Quatre passages :

| Passage | Lecteur | Navigateur | Système | Langue | Fichier de relevé |
|---|---|---|---|---|---|
| 1 | VoiceOver | Safari | macOS | français | `spikes/s4-a11y/results/manual-voiceover-fr.md` |
| 2 | VoiceOver | Safari | macOS | arabe | `spikes/s4-a11y/results/manual-voiceover-ar.md` |
| 3 | NVDA | Chrome ou Firefox (noter lequel) | Windows | français | `spikes/s4-a11y/results/manual-nvda-fr.md` |
| 4 | NVDA | Chrome ou Firefox (noter lequel) | Windows | arabe | `spikes/s4-a11y/results/manual-nvda-ar.md` |

Pour chaque passage : **copier ce fichier** sous le nom de la dernière colonne, puis cocher et écrire dedans. Le
résultat du rapport (`docs/a11y/acr-wcag22.md`, critères 1.3.1, 1.3.2, 4.1.2, 4.1.3) attend ces quatre fichiers.

## Avant de commencer (5 min)

**Les pages.** Sur le Mac, le bac à sable tourne déjà (`npm start`, http://127.0.0.1:4700/). Pour le PC Windows,
lancer sur le Mac, dans un second terminal, `npx vite --host --port 4702`, puis ouvrir sur le PC
`http://<adresse-du-mac>:4702/…` (même réseau ; l'adresse : Réglages → Wi-Fi → Détails). Les pages de démo locales
(regroupement, dock, tableau croisé) ne sont que sur le Mac : c'est pour cela qu'on les sert depuis lui.

**Arabe.** Chaque adresse ci-dessous a sa forme arabe, donnée entre crochets. En arabe, **← et → sont inversées** :
← va vers la colonne suivante (la fin, à gauche), → vers la précédente.

**Réglages** (détail : `docs/a11y-protocol.md` §0).
- VoiceOver : Utilitaire VoiceOver → Verbosité → Tableaux : en-têtes de ligne et de colonne, nombre de lignes et de
  colonnes ; voix arabe (Majed) téléchargée ; **Visuels → Afficher le panneau de légende** (texte dit, à copier).
  Safari : Réglages → Avancés → « Appuyer sur Tab pour mettre en évidence chaque élément » coché.
- NVDA : Mise en forme des documents → Tableaux, en-têtes de lignes et colonnes, coordonnées des cellules ;
  Parole → changement automatique de langue ; une voix arabe ; **Outils → Visionneuse de parole** ouverte.
- Le système et le lecteur en français pour les passages 1 et 3, en arabe (si possible) pour 2 et 4.

**Comment noter.** Pour chaque étape, une case :
- **oui** : l'information attendue est dite (l'ordre des mots et la tournure peuvent varier) ;
- **dégradé** : il manque ou il y a en trop, mais on sait où l'on est ;
- **perdu** : mauvais numéro de ligne, focus perdu (retour en haut de la page, silence après une touche), phrase
  absente, coupée ou dite deux fois.

Écrire à « Entendu » ce que dit le lecteur, **mot pour mot** (copié de la légende ou de la visionneuse). Les phrases
attendues sont celles des paquets `packages/dom/src/locales/{fr,ar}-*.ts` : si le lecteur en dit une autre, la noter
telle quelle. Les mots d'état (« développé », « coché », « sélectionné »…) sont ceux du lecteur, pas de la grille.

| | |
|---|---|
| Date | |
| Lecteur et version | |
| Navigateur et version | |
| Système | |
| Langue | |
| Durée réelle | |

---

## A. La grille simple (≈ 12 min)

Page : http://127.0.0.1:4700/?filters=1&floating=1&popup=1&sets=1&search=1
[ar : ajouter `&locale=ar-DZ&direction=auto`]. 100 000 lignes inventées ; colonnes « ID » et « Nom » épinglées au
début, « Total » à la fin ; une ligne de filtres sous les en-têtes.

### 1. Entrer dans la grille
- **Faire** : focus sur le champ de recherche au-dessus de la grille, puis `Tab` (jusqu'à arriver dans la grille).
- **Attendu** : rôle grille / tableau, le nom « Grille de données » [ar « جدول البيانات »], le nombre de lignes (de
  l'ordre de 100 002 : les données, l'en-tête et la ligne de filtres) et de colonnes ; puis la première cellule, son
  en-tête de colonne, ligne et colonne. NVDA passe seul en mode focus (le noter sinon).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 2. Une cellule à côté, une ligne plus bas
- **Faire** : `→` [ar `←`], puis `↓`.
- **Attendu** : à `→`, la cellule voisine avec son en-tête de colonne (« Nom ») et sa colonne ; à `↓`, la ligne
  suivante, numéro de ligne + 1. Noter si l'en-tête de colonne est redit à chaque cellule ou seulement au changement.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 3. Descendre vite, sans trou
- **Faire** : `↓` une vingtaine de fois en écoutant, puis `Page suivante` deux fois.
- **Attendu** : les numéros de ligne croissent de 1 à chaque `↓`, sans silence ni « fin du tableau » ; `Page
  suivante` saute d'une page (une quinzaine de lignes).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 4. La dernière ligne et retour
- **Faire** : `Ctrl+Fin` (Mac : `Cmd+Fin` ou `Cmd+Fn+→`), puis `Ctrl+Début`.
- **Attendu** : la dernière cellule de la dernière ligne, avec son **vrai** numéro de ligne (le même que le nombre de
  lignes dit à l'étape 1) ; jamais un petit numéro (1 à 40) qui serait la place dans l'écran. Puis la première ligne
  de données.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 5. Trier par un en-tête
- **Faire** : `Ctrl+Début`, `↑` jusqu'à l'en-tête « Montant » (`→` [ar `←`] pour y aller), `Entrée` ; puis
  `Entrée` encore deux fois.
- **Attendu** : l'en-tête dit trié croissant, puis **une fois et en entier** « Trié par Montant, ordre croissant.
  100 000 lignes » [ar « مرتب حسب Montant، تصاعدي. … صف »] ; au deuxième `Entrée`, décroissant ; au troisième,
  « Tri retiré ». **Arabe** : noter comment le nombre est lu (en mots attendu, pas chiffre par chiffre).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 6. Le focus garde sa place après un tri
- **Faire** : descendre sur une cellule de « Nom » (noter le nom dit), trier par « Montant » depuis son en-tête
  (`Entrée`), revenir dans le corps par `↓`.
- **Attendu** : le focus reste sur la même ligne (le même nom) ; le numéro de ligne dit est sa **nouvelle** place.
  Aucune relecture de toute la page.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 7. Taper un filtre dans la ligne de filtres
- **Faire** : sur l'en-tête « Nom », `↓` (la case de filtre), `Entrée`, taper trois lettres, attendre une seconde.
- **Attendu** : la case dite « Filtrer Nom, zone de texte » [ar : son nom arabe] ; après la pause, **une fois**
  « Filtré. N lignes » [ar « تم الترشيح. … »] ; rien pendant la frappe. `Échap` : retour sur la case de la grille.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 8. Sortir et revenir
- **Faire** : `Tab` (sortie de la grille), puis `Maj+Tab`.
- **Attendu** : `Tab` quitte la grille d'un coup (un seul arrêt de Tab pour toute la grille) ; `Maj+Tab` revient sur
  la dernière cellule focalisée.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## B. La fenêtre de filtre et la liste de valeurs (≈ 6 min)

Même page.

### 9. Ouvrir la fenêtre de filtre
- **Faire** : sur l'en-tête « Montant », `Alt+↓` (Mac : `Option+↓`).
- **Attendu** : une fenêtre (dialogue) nommée par la colonne ; le focus dans son premier champ, dit avec son
  libellé ; `Tab` passe d'un champ à l'autre sans sortir de la fenêtre.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 10. Appliquer, puis fermer
- **Faire** : choisir « supérieur à », taper `500`, aller à « Appliquer », `Entrée`. Rouvrir, `Échap`.
- **Attendu** : « Filtré. N lignes » dit une fois ; la fenêtre se ferme, le focus revient sur l'en-tête « Montant »,
  dit **filtré**. À `Échap`, rien de plus n'est dit et le focus revient sur l'en-tête.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 11. La liste de valeurs
- **Faire** : sur l'en-tête « Commune », `Alt+↓` ; `Tab` jusqu'à la liste ; `↓` deux fois ; `Espace`.
- **Attendu** : la recherche de la liste dite avec son libellé ; dans la liste (un seul arrêt de Tab), chaque valeur
  dite avec son nombre et son état **coché** / **non coché** ; `Espace` change l'état dit.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 12. Effacer les filtres
- **Faire** : `Échap` pour fermer ; puis effacer le filtre de « Montant » (sa fenêtre, « Effacer ») et celui de « Nom ».
- **Attendu** : le nombre de lignes redit une fois par effacement ; l'en-tête n'est plus dit « filtré ».
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## C. Modifier une cellule (≈ 7 min)

Page : http://127.0.0.1:4700/orders-edit.html [ar : `?locale=ar-DZ`]. « Commandes et sous-commandes » ;
l'enregistrement est simulé (0,6 s) et **refuse toute valeur qui finit par 7**.

### 13. Ouvrir, taper, garder
- **Faire** : `Tab` dans la grille, aller sur une cellule « Qté », taper `12`, `Entrée`.
- **Attendu** : à la frappe, un champ s'ouvre avec « 12 », nommé par la colonne et la ligne ; à `Entrée`, **une
  fois** « Enregistrement en cours » [ar « جارٍ الحفظ »] ; le focus reste sur la cellule ; à la fin de
  l'enregistrement, rien d'autre (ni « enregistré »).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 14. Une valeur refusée sur place
- **Faire** : sur « Qté », taper `abc`, `Entrée` ; puis `Échap`.
- **Attendu** : le champ reste ouvert ; **une fois** « Qté : valeur refusée, … » avec la raison (nombre attendu)
  [ar « Qté: قيمة مرفوضة، … »] ; le champ dit **invalide**, sa description (la raison) lue. `Échap` : l'ancienne
  valeur, rien de plus.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 15. Un refus de l'enregistrement
- **Faire** : sur « Qté », taper `17`, `Entrée`, attendre une seconde.
- **Attendu** : « Enregistrement en cours », puis **une fois** « Qté : non enregistré, … Valeur précédente
  rétablie. » [ar « Qté: لم يُحفظ، … أُعيدت القيمة السابقة. »] ; la cellule montre l'ancienne valeur ; revenir dessus
  lit sa description (non enregistré, la raison).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 16. Annuler, rétablir
- **Faire** : hors du champ, `Ctrl+Z` (Mac `Cmd+Z`) ; puis `Ctrl+Y` (Mac `Cmd+Maj+Z`, ou `Ctrl+Maj+Z`).
- **Attendu** : **une phrase entière, une seule fois** « Annulé : Qté. Enregistrement en cours » [ar « تم التراجع: Qté.
  جارٍ الحفظ »] ; le focus va sur la cellule annulée ; puis « Rétabli : Qté ».
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## D. Blocs de cellules, copier, coller (≈ 4 min)

Page : http://127.0.0.1:4700/orders-edit.html?focus=range [ar : `&locale=ar-DZ`]. Un tableur ouvert à côté (Numbers,
Excel ou LibreOffice).

### 17. Étendre un bloc au clavier
- **Faire** : sur une cellule « Qté », `Maj+↓` deux fois, puis `Maj+→` [ar `Maj+←`], puis une pause.
- **Attendu** : chaque cellule atteinte lue et dite **sélectionnée** ; après la pause, **une fois** « 3 lignes,
  2 colonnes sélectionnées » (ou proche) ; rien pendant que les touches se suivent ; hors du bloc, pas de « non
  sélectionné » à chaque cellule.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 18. Copier, coller avec un refus
- **Faire** : `Ctrl+C` sur le bloc ; dans le tableur, écrire trois cellules en colonne `5`, `abc`, `8`, les copier ;
  dans la grille, sur une cellule « Qté », `Ctrl+V`.
- **Attendu** : à la copie, « Cellules copiées : 6 » [ar « النسخ: 6 »] ; au collage, **une seule phrase** « Cellules
  collées : 2 ; refusées : 1. Enregistrement en cours » (pas une phrase par cellule).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 19. Effacer le bloc
- **Faire** : `Échap`.
- **Attendu** : « Sélection effacée » [ar : la phrase du paquet] une fois ; le focus reste sur la cellule.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## E. L'arbre (≈ 4 min)

Page : http://127.0.0.1:4700/tree.html [ar : `?locale=ar-DZ&direction=auto`]. 100 services, leurs patients, des
séjours ; seul « Service 0 » est ouvert.

### 20. Niveaux et positions
- **Faire** : `Tab` dans la grille ; `↓`.
- **Attendu** : rôle arborescence de tableau / treegrid ; « Service 0 », **développé**, **niveau 1**, **1 sur 100** ;
  puis « Patient … », **niveau 2**, **1 sur N**. Noter si VoiceOver dit le niveau mais pas « n sur m » (vu au
  prototype de la Phase 0).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 21. Ouvrir, fermer, remonter
- **Faire** : sur un patient qui a des séjours, colonne de l'arbre : `→` [ar `←`] ; puis `←` [ar `→`] deux fois.
- **Attendu** : « développé » puis **une fois** « Patient … développé, N lignes » [ar « تم توسيع … »] ; au premier
  `←`, « réduit » et « Patient … réduit » [ar « تم طي … »] ; au second, le focus monte sur « Service 0 », niveau 1.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## F. Le regroupement des lignes (≈ 3 min)

Page (Mac) : http://127.0.0.1:4700/regroupement.html [ar : `?lang=ar`]. Ventes inventées regroupées par région puis
catégorie, avec totaux.

### 22. Une ligne de groupe et ses totaux
- **Faire** : `Tab` dans la grille, `↓` jusqu'à une ligne de groupe ; `→` [ar `←`] ; puis `→` de cellule en cellule.
- **Attendu** : le libellé du groupe, son nombre de lignes, « niveau 1 », sa position, « réduit » ou « développé » ;
  `→` l'ouvre (« développé », dit une fois) ; les cellules suivantes disent la somme dans le format de la colonne.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## G. Le détail d'une ligne (≈ 3 min)

Page : http://127.0.0.1:4700/detail.html [ar : `?locale=ar-DZ`]. « Patient 0 » ouvert au départ.

### 23. Atteindre et entrer dans le détail
- **Faire** : `Tab` dans la grille, sur « Patient 0 » colonne « Nom » ; `↓` ; `Entrée`.
- **Attendu** : la cellule dite **développée** ; à `↓`, un seul arrêt nommé « Détails de Patient 0 »
  [ar « تفاصيل Patient 0 »] (le contenu de la grille intérieure n'est pas lu) ; à `Entrée`, la grille intérieure
  annoncée avec son nom et son nombre de lignes, le focus sur sa première cellule.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 24. Sortir du détail sans piège
- **Faire** : `Échap` ; puis `↓` ; puis revenir et `Tab`.
- **Attendu** : `Échap` revient sur l'arrêt « Détails de Patient 0 » ; `↓` va à « Patient 1 » ; `Tab` sort de la
  grille vers la suite de la page (pas de piège).
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## H. Les lignes épinglées (≈ 2 min)

Page : http://127.0.0.1:4700/pinned.html [ar : `?lang=ar`]. Une ligne « Objectif » en haut, « Total » en bas.

### 25. Entrer dans la ligne du bas
- **Faire** : `Ctrl+Fin`, puis `↓`.
- **Attendu** : `Ctrl+Fin` va à la dernière ligne **du corps**, pas au total ; `↓` entre dans « Total » ; noter si le
  lecteur dit « Lignes épinglées en bas » [ar : la phrase du paquet] ; une cellule de total non modifiable dite
  **lecture seule**.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## I. Le menu ⋮ et les colonnes (≈ 4 min)

Page : http://127.0.0.1:4700/orders.html [ar : `?locale=ar-DZ`].

### 26. Ouvrir le menu d'une colonne et épingler
- **Faire** : sur l'en-tête « Client », `Maj+F10` (VoiceOver : `VO+Maj+M`) ; `↓` jusqu'à « Épingler au début »,
  `Entrée`.
- **Attendu** : « menu » et son premier élément ; **un seul** menu ouvert ; les éléments indisponibles dits comme
  tels ; après `Entrée`, « Client épinglée au début » [ar : la phrase du paquet] ; le menu se ferme, le focus revient
  sur l'en-tête.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

### 27. Choisir les colonnes
- **Faire** : menu ⋮ → « Choisir les colonnes… » ; `Tab` jusqu'à la liste, `↓`, `Espace` ; `Échap` deux fois.
- **Attendu** : le dialogue « Choisir les colonnes » et le champ « Rechercher une colonne » ; dans la liste, chaque
  colonne est une case dite **cochée** / **non cochée** ; `Espace` : « … masquée » ; `Échap` : la fenêtre se ferme,
  le focus revient sur l'en-tête d'où le menu était parti.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## J. Le dock (≈ 2 min)

Page (Mac) : http://127.0.0.1:4700/dock.html [ar : `?lang=ar`].

### 28. Onglets et bord du panneau
- **Faire** : depuis la grille, `Tab` jusqu'aux onglets du dock ; `→` [ar `←`] ; `Entrée` ; puis `Tab` jusqu'au bord
  du panneau, `←` [ar `→`].
- **Attendu** : « Panneaux, liste d'onglets » ; l'onglet suivant dit avec « 2 sur 2, non sélectionné » ; `Entrée`
  l'affiche (« sélectionné ») ; le bord dit « Largeur de …, séparateur » et sa valeur, qui change à la flèche.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## K. Le tableau croisé (≈ 2 min)

Page (Mac) : http://127.0.0.1:4700/pivot.html [ar : `?lang=ar`]. Lignes par région, colonnes par mois.

### 29. Les en-têtes croisés
- **Faire** : `Tab` dans la grille, une cellule de valeur ; `↑` jusqu'en haut, en écoutant chaque en-tête.
- **Attendu** : chaque niveau d'en-tête dit comme en-tête de colonne (le mois, puis la valeur, « Montant ») ; sur la
  cellule, sa chaîne d'en-têtes et sa valeur ; une ligne du dernier niveau ne dit ni « développé » ni « réduit ».
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

## L. La région d'annonce (≈ 1 min)

### 30. Les annonces pendant qu'on est ailleurs
- **Faire** : sur la page de la partie A, focus dans la grille ; avec la souris (ou VoiceOver `VO+Espace` sur la case),
  taper une lettre dans la case de filtre « Nom », puis revenir dans le corps par `↓` avant la fin de la pause.
- **Attendu** : la phrase « Filtré. N lignes » est dite **une fois**, même si le focus a bougé, et n'en coupe pas une
  autre ; noter toute annonce interrompue ou répétée pendant tout le parcours.
- [ ] oui  [ ] dégradé  [ ] perdu — **Entendu** :

---

## Après le passage

- Rien n'est « validé » avant les quatre passages. Une étape **perdu** se corrige (un test qui échoue d'abord quand
  c'est testable, sinon la ligne de ce parcours) ; une étape **dégradé** se note, avec la question au propriétaire si
  la correction change un comportement.
- Un mot du lecteur qui manque mais que le lecteur ne sait pas dire (par exemple « n sur m » chez VoiceOver) se note
  sans correction si l'action est dite.
- Remarques générales (voix, langue de la voix sur les noms latins en arabe, chiffres lus) :
