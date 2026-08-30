# Règles UX « zéro friction » (mode Campus)

> Ces règles priment sur tout choix d'interface en mode Campus.
> Principe fondateur : **l'utilisateur ne doit jamais rien configurer pour que
> ça marche — tout marche dès la connexion.**
> (Reprise fidèle de la doctrine produit interne.)

## 1. Le parcours idéal, à ne jamais alourdir

1. Ouvrir l'application → e-mail → code → **c'est fini**.
2. Maintenir la touche → parler → le texte est là.

Aucune étape de plus. Pas de « choisis ton modèle », pas de « configure ton
moteur », pas de visite guidée obligatoire. Tout ce qui existe au-delà de ces
deux étapes est **optionnel et découvert plus tard**.

## 2. Tout a un bon défaut

| Réglage             | Défaut Campus                                       |
| ------------------- | --------------------------------------------------- |
| Style               | **Automatique** (repli « Transcription améliorée ») |
| Raccourci de dictée | `Ctrl+Espace`, affiché sur l'écran « C'est prêt »   |
| Reformulation       | toujours active — **pas d'interrupteur**            |
| Moteur              | serveur de l'établissement — aucun choix            |
| Langue              | détection automatique côté serveur                  |
| Signal sonore       | activé (il rassure : Nova écoute)                   |

Tout est modifiable **plus tard**, dans les réglages. Rien n'est demandé au
départ.

## 3. L'intelligence fait le travail, pas l'utilisateur

- Le style se choisit seul selon l'application au premier plan.
- Le vocabulaire s'apprend seul à partir des corrections.
- Les règles de formatage de l'établissement s'appliquent sans action.
- Le repli local est invisible : si le serveur tombe, le texte brut est collé,
  une notification discrète l'explique, point.

## 4. Règles d'interface

- **Quatre entrées maximum** dans la navigation principale.
- **Pas de jargon** : jamais « modèle », « moteur », « tokens »,
  « quantization ». On dit « le serveur de votre établissement »,
  « connecté », « hors ligne ».
- **Pas de badge, pas de compteur d'usage anxiogène**, pas de « il vous reste
  X mots » — en Campus, c'est illimité.
- Chaque écran doit se comprendre **sans lire** : un titre, un visuel, un bouton.
- Une seule notification à la fois, auto-masquée, jamais bloquante.
- Le mode commande et les snippets existent mais ne s'imposent pas.

## 5. Interdit en mode Campus

- Écran de choix de modèle, de moteur ou de profil de puissance.
- Toute mention de palier, licence, quota, Pro, Ultra.
- Toute étape d'onboarding après la connexion.
- Tout réglage obligatoire.
- Tout message d'erreur technique brut.

## 6. Ce que cela implique pour la conception

Une maquette qui ajoute une étape, un choix ou un réglage obligatoire au
parcours de connexion est **hors sujet**, même si elle est plus belle. La
sophistication doit se loger dans la qualité de l'exécution, pas dans le
nombre d'options offertes.
