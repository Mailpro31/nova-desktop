# Changelog

## 1.0.27

- Dix reformulations Anthropic/Turbo offertes chaque jour au palier Gratuit, sélectionnées par défaut, avec Turbo illimité pour Pro et Ultra.
- Intelligence privée toujours sélectionnable et utilisée automatiquement comme solution de secours lorsque le service en ligne ne répond pas.
- Correction de la vérification SHA-256 des modèles locaux téléchargés depuis Hugging Face.
- Délais de reformulation ajustés pour les PC à mémoire limitée afin d'éviter de jeter un résultat encore en cours de génération.

## 1.0.26

- Optimisation adaptative selon la RAM, le CPU et l'accélération disponible, avec diagnostic intégré et mesures de latence locales.
- Commandes vocales sûres pour la ponctuation, l'annulation, le choix du Style et l'ajout de mots au dictionnaire.
- Nouveau Style Réunion avec détection automatique de Zoom, Teams, Meet, Webex et Jitsi.
- Affichage Thinking synchronisé avec le rendu réel de la bulle avant l'insertion du texte.
- Démarrage plus léger grâce au chargement à la demande des réglages et des langues.

## 1.0.25

- Nouvelle bulle d'enregistrement : annulation, validation et état Thinking avec progression.
- Transcription en ligne et locale plus robuste, avec repli CPU fiable pour Canary 180M Flash.
- Reformulation prioritairement via Anthropic, avec repli local compatible ; mode Turbo réservé aux offres Pro et Ultra.
- Correctifs des contrôles de l'overlay et suppression de l'essai Pro de 14 jours pour l'offre gratuite.
