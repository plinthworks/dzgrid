# Rapport de conformité (ACR) WCAG 2.2 A et AA — résumé pour le propriétaire

Brouillon du 2026-11-08 (lot L4b). Le rapport, en anglais pour les acheteurs : `docs/a11y/acr-wcag22.md`.
Il couvre `@dzgrid/dom`, `@dzgrid/theme` et `@dzgrid/angular` (1.8.0 en préparation, commit `98bc9f8`).

## Les chiffres (55 critères ; 4.1.1, obsolète en 2.2, non compté)

| | A (31) | AA (24) | Total |
|---|---|---|---|
| Pris en charge (Supports) | 17 | 16 | **33** |
| Partiellement (Partially Supports) | 3 | 1 | **4** |
| Non pris en charge (Does Not Support) | 0 | 0 | **0** |
| Sans objet (Not Applicable) | 11 | 7 | **18** |

## Les quatre « partiellement », et pourquoi

Aucune écoute au lecteur d'écran n'est faite. La règle du rapport : un critère dont le résultat est **ce que dit le
lecteur** reste « partiellement » tant qu'on ne l'a pas écouté, même si tous les contrôles automatiques passent. Ce
n'est pas un défaut connu.

- **1.3.1 Informations et relations** — rôles, en-têtes, positions de ligne et de colonne, niveaux de l'arbre : en
  place et vérifiés par axe ; pas encore entendus.
- **1.3.2 Ordre logique** — l'ordre du DOM suit l'écran ; mais le mode lecture d'un lecteur ne lit que les lignes
  montées (limite connue de la grille virtualisée ; conseil : la pagination). Pas encore entendu.
- **4.1.2 Nom, rôle, valeur** — noms, rôles, états en place (axe, tests) ; pas encore entendus.
- **4.1.3 Messages d'état** — régions live présentes dès le départ, phrases dites une fois par geste (contrôle
  automatique) ; pas encore entendues.

Après ton « parcours essentiel » (`docs/a11y/parcours-essentiel.md`, VoiceOver et NVDA, fr et ar), chaque ligne passe
à « pris en charge » ou garde « partiellement » avec le défaut trouvé.

## Ce que l'application doit faire (écrit dans le rapport)

Le nom de chaque grille, les textes des en-têtes, la page autour (titre, langue, repères), le contenu de ses pièces
et gabarits, les couleurs qu'elle change (contraste à garder : `check:contrast -- --palette`), `lang` sur l'hôte si la
langue de la grille diffère de la page.

## Limites dites franchement

Couleurs forcées vérifiées dans Chrome seulement ; WebKit de Playwright, pas Safari ; axe passe sur les pages au
chargement (fenêtres, menus et champs ouverts : tests jsdom et script de contraste) ; la page Angular hors du passage
navigateur ; aucune saisie vocale testée.

## À décider / à faire

- Relecture du brouillon par l'architecte (contre les fiches), puis l'écoute (lot L4c).
- Le plan nommait le fichier `acr-wcag22-aa.md` ; il s'appelle `acr-wcag22.md` (consigne du lot).
