# Mission : de l'installation à la première dictée Organization

Améliorer et valider l'expérience de première installation de Nova Campus et Nova Business sous Windows. Travailler sur les dépôts réels, lire leurs consignes et vérifier les parcours appelés : un composant ou un commentaire ne prouve pas qu'une fonction est accessible.

## Résultat utilisateur

Sur un poste préparé par son organisation, l'étudiant ou le salarié ouvre Nova, reconnaît son organisation, utilise son compte scolaire ou professionnel habituel et réussit sa première dictée. Aucun compte Nova supplémentaire. Aucune succession obligatoire code par e-mail puis SSO. Aucun code NOVA-LAB1 dans le parcours normal. Aucune adresse de serveur à demander lorsque le déploiement fournit déjà le rattachement.

Conserver un unique paquet Organization. La nature education/business provient du serveur vérifié, puis de sa configuration publique ; l'intention du premier écran ne donne aucun droit. Ne pas inventer de service de découverte, d'URL de production ou de mécanisme d'invitation sans contrat existant. Si le contrat manque, isoler cette décision, expliquer le point et demander une réponse courte tout en poursuivant les corrections indépendantes.

## Parcours à traiter

1. Vérifier ce que l'installeur, la configuration machine et la découverte fournissent réellement. Respecter les priorités de configuration et les origines approuvées. Un déploiement invalide doit expliquer la panne, pas perdre silencieusement son rattachement.
2. Présenter l'organisation connue. Éviter les questions redondantes et les textes scolaires en entreprise. Prévoir un recours explicite pour une installation non préparée.
3. Afficher les fournisseurs réellement configurés, y compris Google seul, OIDC seul et plusieurs configurations du même type. Transmettre l'identifiant exact de la configuration sélectionnée. Ne pas faire dépendre Google/OIDC de Microsoft.
4. Faire du SSO un chemin autonome, sans saisie préalable d'e-mail ni validation d'un code Nova. Le code par e-mail reste une alternative uniquement autorisée par l'organisation ; conserver la compatibilité des serveurs anciens sans changer leurs droits. Respecter la MFA du fournisseur. Conserver les jetons au trousseau et ne pas affaiblir PKCE, TLS ou les contrôles serveur.
5. Reprendre après annulation, erreur réseau ou expiration avec une action compréhensible. Ne pas déclarer une connexion réussie si le service n'a pas répondu. Conserver le Lab séparé et ses vérifications d'identité.
6. Préparer le micro, le raccourci et le moteur requis sans questionnaire technique. Ne pas imposer un téléchargement local avant une dictée serveur opérationnelle. Ne pas annoncer un secours local prêt sans modèle utilisable.
7. Guider un essai court jusqu'à l'insertion réelle dans une application Windows. Permettre de passer le tutoriel. En cas d'échec d'insertion, préserver et rendre récupérable le texte. Reporter Styles, formation et personnalisation après cette première réussite.

## Méthode et limites

- Avant chaque correction, écrire un test comportemental qui échoue sur le code courant et montrer sa sortie, puis montrer le résultat après correction.
- Ne désactiver, ignorer ni assouplir aucun test. Ne pas confondre tests avec pont Tauri simulé et recette native Windows/SSO réel.
- Tester Campus et Business, configuration présente/absente/invalide, chaque fournisseur, configurations multiples, code e-mail autorisé/interdit, annulation, panne, reprise et première dictée.
- Compiler et exécuter les contrôles pertinents ; conserver les sorties réelles, sans annoncer une commande non lancée.
- Branche puis PR ; aucun push direct, rebase, amend ou force-push. Aucun secret, adresse personnelle ou code d'invitation réel dans les fichiers. Ne pas modifier supabase/.
- Ne pas déployer en production ni modifier un annuaire client. Les décisions commerciales et les contrats d'invitation ambigus doivent être explicitement tranchés par le propriétaire.
- Limiter les changements à installation, rattachement, authentification et première dictée. Livrer les changements vérifiables, documenter ce qui reste bloqué et distinguer validation automatisée et validation réelle.

Appliquer cette mission dans la tâche courante, sans créer une autre tâche ni déléguer à des agents.
