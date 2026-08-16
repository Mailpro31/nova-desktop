# États, messages, erreurs et écrans vides

## Notifications (toasts)

Nova utilise une seule pile de notifications, en bas, via `sonner`, avec un
style maison : fond `--color-background`, filet `mid-gray/20`, coin 8 px, ombre
portée, icône à gauche, titre en `font-medium`, description en gris.

Quatre intentions : **succès · information · avertissement · erreur**.

Deux régimes coexistent aujourd'hui :

- **Notification d'attention** : persistante, marque un point d'attention dans
  l'interface (pastille non lue sur la bulle d'enregistrement), à acquitter.
- **Notification discrète** : auto-masquée, identifiant fixe pour éviter
  l'empilement (ex. « serveur injoignable », 4 s).

Règle produit : **une seule notification à la fois, jamais bloquante**.

## Catalogue réel des messages d'erreur

| Situation | Traitement actuel |
|---|---|
| Permission micro refusée | erreur, texte adapté à la plateforme |
| Aucun périphérique d'entrée | erreur |
| Micro configuré introuvable | avertissement, repli sur le micro par défaut |
| Échec du collage | erreur, message non technique (détail dans le journal) |
| Échec de transcription | erreur |
| Reformulation trop longue / repli | avertissement, texte brut déjà collé |
| Serveur Campus injoignable | avertissement discret, repli local |
| Session Campus expirée (401) | erreur + retour à la connexion |
| Moteur privé indisponible | erreur |
| Mode CPU forcé (pilote GPU) | avertissement, une fois par lancement, avec chemin de réactivation |
| Moteur en ligne verrouillé | information (mode personnel seulement) |
| Quota épuisé | erreur avec action « Passer à un palier supérieur » (mode personnel seulement) |
| Mot ajouté au dictionnaire | succès, 1,5 s |

Tout message doit être compréhensible sans culture technique. Interdits :
codes HTTP, noms de modèles, « tokens », « quantization », « VAD ».

## Écrans vides existants

- Historique sans entrée.
- Accueil Campus, carte « Récent » vide : une simple phrase grise.
- Aucune transcription : l'icône de transcription grise + un texte d'aide.
- Liste de styles réduite à « Automatique ».
- Dictionnaire partagé vide, snippets vides, règles de formatage vides.
- Aucun périphérique audio détecté.

Ces états sont aujourd'hui traités de façon **minimale et inégale** — une
phrase grise ici, rien là. C'est un chantier entier de la refonte.

## États de chargement

- Chargement de section : un anneau qui tourne, centré (`Suspense`).
- Téléchargement de modèle : barre de progression avec libellé et débit ;
  plusieurs téléchargements simultanés → mini-barres + décompte.
- Recherche de périphériques : indicateur à trois points dans le sélecteur.
- Réglage en cours d'application : interrupteur atténué (`isUpdating`).
- Vérification du serveur Campus : silencieuse, toutes les 30 s.

## Découverte progressive

Les fonctions avancées ne s'imposent jamais. Elles apparaissent au moment utile :

- après la 1re dictée → « Nova apprend de vos corrections » ;
- après la 5e dictée → « Dites “mon adresse” pour insérer vos infos » ;
- après une correction manuelle → « Nova s'en souviendra ».

**Maximum une astuce par session.** Jamais de fenêtre modale pour une astuce.

## Dialogues

Un seul composant `Dialog` : voile assombri, carte centrée, titre, description
optionnelle, corps, pied d'actions, bouton de fermeture, piège de focus,
fermeture au clic sur le voile et à l'échappement. Il sert aux confirmations
destructives (vider l'historique, se déconnecter), aux nouveautés de version,
et à la transcription de fichier.

Règle : confirmation **uniquement** pour les actions destructives et
irréversibles.
