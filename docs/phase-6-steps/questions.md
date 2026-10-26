# Phase 6 (advanced columns and comfort): the owner's questions (architect, 2026-10-26)

Plan: `docs/phase-6-plan.md`. Each question: the text for the owner in simple French, 2–4 options, the recommended one (★). The answers go to `docs/phase-6-steps/decisions.md` and win over the plan.

## Le menu de colonne

**Q-M1 — Ce que contient le menu ⋮ d'une colonne.**
- A. Trier (croissant, décroissant, sans tri) ; épingler (au début, à la fin, non) ; ajuster la largeur (cette colonne, toutes) ; redimensionner au clavier ; déplacer d'une place ; masquer ; « Choisir les colonnes… » ; « Filtrer… » (si les filtres sont là) ; réinitialiser les colonnes ; et les actions de votre application. ★
- B. Le minimum : masquer, épingler, ajuster, « Choisir les colonnes… ». Le reste plus tard.
- C. Comme A, plus la densité des lignes (compacte, normale, aérée) en bas du menu.

**Q-M2 — Comment on ouvre le menu.**
- A. Le bouton ⋮ (visible au survol et au focus, toujours sur écran tactile) et le clic droit sur l'en-tête. ★
- B. Le bouton ⋮ toujours visible, pas de clic droit.
- C. Seulement le bouton ⋮ au survol.

**Q-M3 — Déplacer une colonne au doigt (écran tactile).**
- A. Pas de glisser au doigt (il fait défiler) ; on déplace par le menu (« déplacer d'une place ») ou par la fenêtre « Choisir les colonnes ». ★
- B. Un appui long (½ seconde) puis on glisse.

## Les touches

**Q-K1 — La touche du menu.** Aujourd'hui Alt+Bas sur un en-tête ouvre déjà le filtre.
- A. Alt+Bas garde le filtre ; le menu s'ouvre avec Maj+F10 ou la touche Menu du clavier (comme un clic droit). Sans filtres, Alt+Bas ouvre le menu. ★
- B. Alt+Bas ouvre le menu, dont la première ligne est « Filtrer… » (un pas de plus pour filtrer).
- C. Deux touches différentes au choix de l'application.

**Q-K2 — Déplacer une colonne au clavier** (sur l'en-tête).
- A. Ctrl+Maj+Gauche / Droite (une place), Ctrl+Maj+Début / Fin (au bord). Une phrase dit la nouvelle place. ★
- B. Alt+Maj+Gauche / Droite (prévu par l'architecture ; sous Windows, Alt+Maj change souvent la langue du clavier, gênant pour qui tape en arabe et en français).
- C. Seulement par le menu.

**Q-K3 — Le mode « redimensionner » au clavier** (critère de sortie de la phase).
- A. On y entre par le menu (« Redimensionner ») ou par Alt+R sur l'en-tête ; Gauche / Droite changent de 10 px (Maj : 1 px), Début ajuste au contenu, Entrée garde, Échap annule. ★
- B. Seulement par le menu.
- C. Par F2 sur l'en-tête (F2 y sert déjà à « remettre en ordre » après une modification : il faudrait le déplacer).

## Choisir les colonnes

**Q-C1 — La fenêtre « Choisir les colonnes »** (recherche, cases à cocher, poignées).
- A. Une fenêtre qui s'ouvre par-dessus la grille (depuis le menu ⋮ ou un bouton de votre application), fermée par Échap ou un clic dehors. ★
- B. Un panneau latéral fixé dans la grille (à droite, à gauche en arabe), avec des onglets « Colonnes » et « Filtres ».
- C. Les deux : la fenêtre maintenant, le panneau latéral plus tard.

**Q-C2 — Quand les changements s'appliquent.**
- A. Tout de suite (cocher masque la colonne à l'instant). ★
- B. Avec un bouton « Appliquer » et un bouton « Annuler ».

**Q-C3 — L'onglet « Filtres » du panneau latéral** (tous les filtres d'un coup d'œil).
- A. Plus tard, avec le filtre avancé (Phase 9). ★
- B. Dans cette phase.

**Q-H — Changer l'ordre dans la fenêtre.**
- A. Les deux : poignées à glisser à la souris, et au clavier Alt+Haut / Alt+Bas sur une ligne (une phrase dit la place). ★
- B. Seulement les poignées (pas accessible au clavier : déconseillé).
- C. Seulement des boutons « monter / descendre ».

## Groupes d'en-têtes

**Q-GH — Les groupes d'en-têtes repliables** (« Patient » au-dessus de Nom, Prénom, Âge, refermé en une seule colonne).
- A. Oui : un petit bouton dans l'en-tête du groupe ; l'application dit quelles colonnes restent visibles groupe fermé ; l'état ouvert / fermé est gardé à part des colonnes masquées par l'utilisateur (≈ 40–80 octets dans le cœur). ★
- B. Oui, mais en masquant simplement les colonnes (0 octet dans le cœur ; l'utilisateur qui réaffiche une colonne ouvre le groupe à moitié).
- C. Plus tard.

## La zone de regroupement

**Q-G — La zone « Nom × » au-dessus de la grille** (glisser une colonne pour regrouper les lignes). Le regroupement lui-même vient en Phase 7.
- A. Phase 6 prépare le glisser d'un en-tête vers une zone et écrit la fiche de la zone ; la zone et ses étiquettes « Nom × » arrivent en Phase 7 avec le regroupement. Rien de visible en Phase 6. ★
- B. Montrer la zone vide dès la Phase 6 (elle ne fait rien avant la Phase 7).

## L'état sauvegardé (GridState)

**Q-S1 — Ce que l'état garde.**
- A. Les colonnes (ordre, largeur, masquées, épinglées, groupes ouverts), le tri, les filtres, la recherche, la page et sa taille, la densité. Pas les lignes ouvertes, pas la sélection, pas la position de défilement (l'application peut les demander). ★
- B. Comme A, plus les lignes ouvertes (arbre, détails).
- C. Tout : plus la sélection et la ligne en haut de l'écran.
- D. Seulement les colonnes.

**Q-S2 — Où l'état est gardé.**
- A. L'application reçoit un petit JSON (et un signal à chaque changement) et le range où elle veut ; deux aides optionnelles : le stockage du navigateur, et l'adresse de la page (pour l'écran d'audit). ★
- B. Seulement le JSON ; l'application fait le reste.
- C. La grille le range toute seule dans le stockage du navigateur.

## Lignes épinglées

**Q-P — Les lignes épinglées en haut et en bas** (une ligne de totaux, une ligne de référence).
- A. Haut et bas ; jamais triées ni filtrées ; lisibles au clavier ; pas modifiables dans cette phase. Le bas demande ≈ 200–300 octets dans la base. ★
- B. Seulement en haut (0 octet dans la base).
- C. Haut et bas, et modifiables.
- D. Plus tard (avec les totaux de la Phase 7).

## Hauteur des lignes

**Q-R1 — Hauteur automatique** (un texte long passe à la ligne et la ligne grandit).
- A. Par colonne (`wrap: true`) ; la hauteur fixe (`rowHeight`) l'emporte si les deux sont donnés ; marche avec les détails ; au-delà de 10 000 lignes, un avertissement pour le développeur (le défilement peut sauter un peu). ★
- B. Pour toute la grille d'un coup (`rowHeight: 'auto'`).
- C. Les deux.

**Q-R2 — La densité pour l'utilisateur** (aujourd'hui seule l'application la choisit).
- A. Une fonction pour l'application (sa propre barre d'outils), et une ligne optionnelle dans le menu ⋮ ; gardée dans l'état. ★
- B. Seulement la fonction.
- C. Toujours dans le menu.

## Impression

**Q-I — `preparePrint()`.**
- A. Imprime les lignes affichées (filtrées, triées), jusqu'à 5 000, en vrai tableau (en-têtes répétés sur chaque page, arabe de droite à gauche) ; au-delà, une ligne dit « 5 000 premières lignes » ; sur un serveur paginé, la page affichée seulement. ★
- B. Comme A, sans limite (risque de bloquer la page).
- C. Seulement une feuille de style d'impression (imprime ce qui est à l'écran).
- D. Plus tard.

## Sehhaty et ordre

**Q-SE — Ce dont Sehhaty a besoin en premier.** (Je n'ai pas lu Sehhaty ; seule la fiche de suivi dit que l'écran d'audit garde son état dans l'adresse.)
- A. L'état dans l'adresse (GridState), puis le menu ⋮ et « Choisir les colonnes ». ★
- B. Le menu et le choix des colonnes d'abord.
- C. Autre chose : dites quoi (lignes de totaux, impression, hauteur automatique…).

**Q-O — L'ordre des étapes.**
- A. Fiches → état (cœur, puis aides) → déplacer les colonnes → redimensionner au clavier et ajuster → menu ⋮ → choisir les colonnes → groupes repliables → lignes épinglées → hauteur automatique → impression → Angular et démos → clôture (0.4.0 préparée). ★
- B. Commencer par ce que l'on voit (menu, choix des colonnes, déplacer), l'état ensuite.
- C. L'ordre de Q-SE d'abord, le reste ensuite.

## Budgets

**Q-B — Les tailles** (octets compressés ; remis à la mesure + 10 % à la fin, jamais au-dessus de ce que vous accordez). Tout est dans des entrées optionnelles : une grille qui ne les importe pas ne paie rien, sauf :
- (a) cœur 29 000 → 29 150 (marge 84 ; groupes repliables, peut-être une ligne épinglée en bas et une restauration en une seule requête) ;
- (b) base DOM 21 980 → 22 400 (marge 415 ; lignes épinglées en bas, hauteur automatique avec les détails) ;
- (c) nouvelles entrées : `core/state` 1 500, `dom/state` 800, `dom/columns` 3 500, `dom/column-menu` 3 000, `dom/columns-panel` 4 000, `dom/pinned-rows` 2 000, `dom/auto-height` 1 400, `dom/print` 1 600 ;
- (d) textes `-columns` en / fr / ar 500 / 600 / 800, `-print` 150 / 150 / 200 ; styles `columns.css` 1 100, `print.css` 400 ;
- (e) `dom/spans` 4 950 → 5 300 ; Angular 7 000 → 7 300 ;
- (f) garde du profil d'audit (K.8) 83 500 → 84 000 (marge 514) ; exemple Angular réel 92 500 → 94 500 s'il garde son état dans l'adresse (93 000 sinon).

Options :
- A. Tout accepter pour la phase. ★
- B. Accepter les nouvelles entrées, mais 0 octet dans la base : pas de ligne épinglée en bas, pas de hauteur automatique avec les détails, groupes repliables par masquage simple.
- C. Accepter étape par étape (chaque étape redemande).
