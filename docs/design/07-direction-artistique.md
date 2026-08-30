# Direction artistique — « Quiet Engineering »

> Trois mots : **Calm. Precise. Intelligent.**

Nova doit se lire comme un **logiciel professionnel haut de gamme** :
réaliste, mature, minimal, extrêmement cohérent. Crédible pour une école
d'ingénieurs, crédible pour une direction des systèmes d'information, crédible
demain dans un environnement industriel.

Nova doit rester **immédiatement identifiable comme Nova** : l'orbe « bille de
verre », l'accent bleu unique, le fond bleu nuit.

## Interdits explicites

- Tableau de bord SaaS générique.
- Imitation de ChatGPT.
- Clone de macOS.
- Grosses cartes très arrondies partout.
- Dégradés « IA » violets.
- Une couleur différente par fonctionnalité.
- Gamification enfantine.
- Glassmorphism partout.
- Gros titres marketing.
- Style « Dribbble » impossible à implémenter.

La gamification demandée (progression, AI Essentials, AI Skills) doit être
**premium et discrète** : elle informe, elle ne récompense pas bruyamment.
Pas de confettis, pas de badges colorés, pas de barres de niveau ludiques.

## Niveau d'exigence : pensée de conception Apple, pas copie d'Apple

Le niveau attendu est celui des principes ci-dessous. Ce sont des **critères de
jugement**, pas un vocabulaire visuel à recopier.

### Les huit principes à faire respecter

1. **Intention** — chaque élément demande du temps et de l'attention à
   l'utilisateur ; ne le dépenser que là où ça rapporte.
2. **Contrôle** — proposer des choix, ne jamais forcer un chemin unique ;
   annulation facile ; confirmation réservée à l'irréversible.
3. **Responsabilité** — demander une permission au bon moment, uniquement pour
   ce qui est nécessaire, en l'expliquant.
4. **Familiarité** — ce qui se ressemble se comporte pareil et vit au même
   endroit ; ne rompre un motif connu que si l'on peut prouver que c'est mieux.
5. **Souplesse** — s'adapter au contexte, à la taille de fenêtre, à la mise à
   l'échelle, aux capacités.
6. **Simplicité, pas minimalisme** — dépouiller pour révéler l'essentiel, sans
   enterrer les fonctions. Chemin courant d'abord, options avancées un niveau
   plus bas. Parfois **ajouter** du contexte simplifie.
7. **Soin** — rien d'aléatoire : chaque espacement, chaque alignement, chaque
   durée est délibéré et défendable. Un défilement saccadé ou une icône
   décalée se lisent comme de la négligence.
8. **Plaisir** — résultat des sept autres, jamais un ornement ajouté.

### Repères d'orientation

- **Où suis-je, où puis-je aller, qu'y a-t-il, comment je sors ?** Chaque écran
  doit répondre à ces quatre questions. Ne jamais piéger l'utilisateur.
- **Nommer par le contenu**, pas par une catégorie vague : « Progression »,
  « Bibliothèque » valent mieux que « Accueil ».
- **La proximité fait la relation** : placer un contrôle près de ce qu'il
  modifie. S'il faut une étiquette pour expliquer un contrôle, la
  correspondance est mauvaise.
- **Validation en ligne**, pas à la soumission.

### Typographie

- Le tracking dépend de la taille : **négatif sur les grands titres**, proche
  de zéro sur le texte courant, légèrement positif sur les très petits textes.
- L'interlignage varie en sens inverse de la taille : serré sur les titres,
  aéré sur le corps, resserré sur les interfaces denses.
- La hiérarchie se construit avec **graisse + taille + interlignage**, pas avec
  la taille seule. La graisse donne de la présence sans occuper d'espace.
- Police système d'abord : elle embarque déjà l'optique et les tables de
  tracking.

### Matériaux et profondeur

- La translucidité **structure** sans voler l'attention : elle sert les
  barres, panneaux et feuilles, avec le contenu qui défile dessous.
- Le poids du matériau encode la hiérarchie ; ne jamais empiler deux surfaces
  translucides claires — la lisibilité s'effondre.
- **Assombrir pour concentrer, décaler pour maintenir le flux** : une tâche
  modale s'accompagne d'un voile ; un panneau non bloquant s'en passe.
- Préférer un **effet de bord au défilement** (dégradé de flou) à un filet de
  séparation de 1 px sous un en-tête collant.

Attention : la demande produit interdit le glassmorphism généralisé. La
translucidité est donc un outil **rare et structurel** ici — barre latérale,
panneau, bulle — jamais un effet décoratif appliqué aux cartes.

### Mouvement

- Le mouvement part de la **valeur affichée** et reste interruptible ; rien ne
  verrouille l'entrée pendant une transition.
- Ressorts plutôt que durées fixes. Amortissement `1.0` (aucun rebond) pour
  l'interface courante ; un léger rebond (`~0.8`) **uniquement** quand le geste
  portait de l'élan.
- Réponse `0.3`–`0.4` s selon le cas (déplacement `0.4`, panneau `0.3`).
- Ce qui entre par la droite ressort par la droite ; les menus et panneaux
  naissent de l'élément qui les déclenche.
- Retour visuel dès l'appui, jamais seulement à la fin.
- `prefers-reduced-motion` ne veut pas dire « aucun retour » : fondu court à la
  place du glissement, sans dépassement élastique.

Pour un produit « Quiet Engineering », le mouvement doit être **court, sobre et
critique** : il explique un changement d'état, il ne divertit pas.

## Périmètre à couvrir par la refonte

Connexion Campus · OTP · succès de connexion · expérience après première
connexion · AI Essentials · AI Skills · progression · gamification premium et
discrète · Smart Setup · configuration recommandée en un clic · microphone ·
choix des usages · première dictée · Accueil · Rewrite · transcription de
fichier · Styles · Historique · Campus · Organisation · Confidentialité ·
Réglages · Dictionnaire · Snippets · Règles de formatage · Avancé · états hors
ligne · repli local · erreurs · écrans vides · dialogues · info-bulles ·
notifications · bulle d'enregistrement · thème sombre · petites fenêtres ·
mise à l'échelle Windows 125 % et 150 %.

Plusieurs de ces éléments (**AI Essentials, AI Skills, progression, Smart
Setup, choix des usages, Organisation, Rewrite** comme écran) **n'existent pas
encore dans le code** : ce sont des ajouts produit à concevoir, pas des écrans
à redessiner.
