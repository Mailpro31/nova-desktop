# Contraintes de plateforme

## Windows d'abord

Le produit est **Windows-first**. Une maquette qui suppose macOS (barre de menu
système, feux tricolores, effets de matériau natifs, gestes trackpad) est hors
cible. Nova tourne aussi sur macOS et Linux, mais l'arbitrage se fait pour
Windows.

Conséquences concrètes :

- **Mise à l'échelle 125 % et 150 %** est le cas courant, pas l'exception. Tout
  doit être exprimé en unités relatives (`rem`, `em`, pourcentages) et rester
  lisible et non tronqué à 150 %. Les hauteurs fixes en pixels cassent.
- **Barres de défilement personnalisées** : sur Windows et Linux, Nova dessine
  ses propres barres (14 px, pouce arrondi semi-transparent). Sur macOS, les
  barres natives en superposition sont conservées. Le sélecteur
  `:root[data-platform="macos"]` distingue les deux.
- Pas d'effet de transparence système : le flou d'arrière-plan doit être obtenu
  en CSS et rester sobre.

## Petites fenêtres

La fenêtre principale est redimensionnable et souvent laissée étroite. Il faut
prévoir des largeurs de contenu réduites : la barre latérale (160–176 px) plus
une colonne de contenu qui peut descendre sous 500 px utiles. Les grilles de
cartes doivent se replier proprement (4 → 2 → 1 colonne).

La bulle d'enregistrement est une **fenêtre séparée de quelques centaines de
pixels**, sans décoration, toujours au premier plan, qui se redimensionne
elle-même quand son menu de styles s'ouvre. Rien de ce qui y figure ne peut
dépendre d'un survol prolongé ni d'un espace généreux.

## Thème sombre et thème clair

L'application est **sombre par défaut** (identité « bleu nuit »). Trois états :
choix explicite « clair », choix explicite « sombre », et « système ». Les deux
thèmes sont de vrais thèmes, pas une inversion : la palette claire est une
palette Apple « light » complète (fenêtre gris perle, cartes blanches, texte
encre), avec des couleurs de statut assombries pour tenir le contraste.

Toute maquette doit être produite dans les deux thèmes, ou au minimum être
exprimée en tokens qui basculent correctement.

## Internationalisation

- **Aucune chaîne en dur** : tout passe par des clés de traduction, présentes
  au minimum en anglais et en français.
- 22 langues sont livrées, dont **l'arabe et l'hébreu** : la direction
  d'écriture bascule en RTL (attribut `dir` sur la racine, marges logiques
  `border-e`, `me-*`, `ps-*`). Une maquette qui suppose « le libellé est à
  gauche » est fragile.
- Les libellés allemands et néerlandais sont longs : prévoir la troncature avec
  info-bulle, jamais un texte coupé sans recours.

## Accessibilité

- Le raccourci global fonctionne hors de la fenêtre : sur macOS il exige
  l'autorisation d'accessibilité, sur Windows l'autorisation du microphone.
  Ces demandes sont un **écran d'onboarding à part entière**, pas une alerte.
- Respecter `prefers-reduced-motion`, `prefers-reduced-transparency` et
  `prefers-contrast` : le produit vise des établissements d'enseignement
  supérieur et des DSI, où l'accessibilité est un critère d'achat.
- La cible principale d'interaction reste le pointeur et le clavier ; tout
  parcours doit être réalisable au clavier seul.

## Performance perçue

La transcription prend de une à plusieurs secondes. L'interface doit rendre
cette attente **lisible et calme** — c'est le moment le plus scruté du produit
(la bulle d'enregistrement). Une attente non expliquée est perçue comme un bug.
