# Validation Windows — pilote Nova Campus

Ce document est la seule chose qui sépare Nova de **PILOT READY**. Tout le
reste est vérifié automatiquement ; ce qui suit ne peut l'être que sur une
machine Windows réelle.

Il est écrit pour être exécuté par quelqu'un qui n'a pas développé Nova.
Cochez au fur et à mesure, et **notez ce qui échoue plutôt que de le corriger** :
un échec observé vaut mieux qu'un échec contourné.

---

## Comment lire ce document

Deux blocs, à ne pas confondre :

| Bloc                                 | Effet d'un échec                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **A — Pilot Core**                   | **bloque le pilote**. Ce sont les capacités que tout étudiant utilisera.                                                        |
| **B — Nova Commands (expérimental)** | **ne bloque pas le pilote**. La fonctionnalité est désactivée par défaut, sans raccourci : un étudiant ne peut pas l'atteindre. |

Notez pour chaque échec : le scénario, ce que vous attendiez, ce qui s'est
passé, et l'application concernée.

---

## 0. Environnements

Idéalement chaque bloc A est passé dans plusieurs environnements. Au minimum :
**Windows 11 à 100 % puis à 150 %**.

| Environnement                                            | Passé le | Par |
| -------------------------------------------------------- | -------- | --- |
| Windows 11 · 100 % · 1 écran                             |          |     |
| Windows 11 · 125 % · 1 écran                             |          |     |
| Windows 11 · 150 % · 1 écran                             |          |     |
| Windows 11 · 2 écrans (échelles différentes si possible) |          |     |
| Compte Windows **standard**, sans droits administrateur  |          |     |

> Le compte standard est important : un étudiant n'aura pas les droits
> administrateur. L'installation peut les demander ; **l'usage quotidien, non**.

---

# BLOC A — PILOT CORE

## A1. Installation

| #   | Étape                                               | Attendu                                                                                 | ✓   |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------- | --- |
| 1   | Installer sur une machine où Nova n'a jamais tourné | l'installateur se termine sans erreur                                                   | ☐   |
| 2   | Lancer Nova                                         | la fenêtre s'ouvre, ou l'icône apparaît dans la zone de notification                    | ☐   |
| 3   | Observer la demande de permission micro             | Windows demande l'accès ; le refus mène à un écran explicite, pas à un échec silencieux | ☐   |
| 4   | Parcourir l'accueil de première ouverture           | aucune étape ne propose une capacité absente                                            | ☐   |
| 5   | Se connecter avec une adresse académique            | code reçu, saisie, connexion                                                            | ☐   |
| 6   | Fermer puis rouvrir Nova                            | **aucune reconnexion demandée**                                                         | ☐   |

**Ce qui doit survivre à un redémarrage** — cochez après un redémarrage complet
de Windows :

☐ session Campus ☐ raccourci ☐ Style actif ☐ historique
☐ thème ☐ langue ☐ variables rapides ☐ liste noire « Automatique »

## A2. Dictée — matrice par application

Pour **chaque** application : placez le curseur dans un champ de saisie,
pressez le raccourci, dictez une phrase courte, arrêtez.

| Application            | Démarre | Écoute visible | Arrêt | Traitement | Insertion | Ctrl+Z | Focus conservé | Historique |
| ---------------------- | ------- | -------------- | ----- | ---------- | --------- | ------ | -------------- | ---------- |
| Bloc-notes             | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| Chrome — `<textarea>`  | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| Chrome — champ enrichi | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| Google Docs            | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| VS Code                | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| Discord                | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |
| Outlook                | ☐       | ☐              | ☐     | ☐          | ☐         | ☐      | ☐              | ☐          |

**« Focus conservé »** signifie : après insertion, le curseur est toujours dans
le champ, et vous pouvez continuer à taper sans cliquer.

## A3. Repli presse-papiers — **le test le plus important**

Nova garantit qu'une dictée n'est jamais perdue : si le collage échoue, le
texte reste dans le presse-papiers.

| #   | Provoquer                                                                                        | Attendu                                                                       | ✓   |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --- |
| 1   | Dicter dans une application qui refuse le collage simulé (certains clients bancaires, jeux, RDP) | Nova affiche « Collage impossible — votre dictée est dans le presse-papiers » | ☐   |
| 2   | Presser `Ctrl+V`                                                                                 | le texte dicté apparaît, **complet**                                          | ☐   |
| 3   | Ouvrir l'accueil de Nova                                                                         | le même message et le raccourci `Ctrl+V` y figurent                           | ☐   |

Si vous ne parvenez pas à provoquer un refus, notez-le : c'est en soi un
résultat.

## A4. Overlay

| #   | Vérifier                                                    | Attendu                                                 | ✓   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------- | --- |
| 1   | L'overlay apparaît **immédiatement** après le raccourci     | pas de délai perceptible                                | ☐   |
| 2   | Il **ne prend jamais le focus**                             | vous pouvez continuer à taper pendant qu'il est visible | ☐   |
| 3   | Sa taille ne saute pas entre écoute et traitement           | ☐                                                       |
| 4   | Il réagit à la voix (l'indicateur bouge quand vous parlez)  | ☐                                                       |
| 5   | À 125 % puis 150 %                                          | ni coupé ni flou, toujours lisible                      | ☐   |
| 6   | Sur un second écran                                         | apparaît sur l'écran actif, entièrement visible         | ☐   |
| 7   | Windows → Accessibilité → **Effets d'animation désactivés** | l'état reste identifiable sans animation                | ☐   |

## A5. Cohérence des états

Ouvrez la fenêtre Nova **et** dictez dans une autre application, de façon à voir
les deux surfaces.

| #   | Vérifier                                                    | ✓   |
| --- | ----------------------------------------------------------- | --- |
| 1   | Repos : l'accueil dit « Nova est prêt »                     | ☐   |
| 2   | Pendant la dictée : l'accueil passe à « Nova vous écoute… » | ☐   |
| 3   | Après l'arrêt : « Nova travaille… »                         | ☐   |
| 4   | Après insertion : retour à « Nova est prêt »                | ☐   |
| 5   | **Overlay et accueil ne se contredisent jamais**            | ☐   |

## A6. Campus — cycle complet

| #   | Scénario                                | Attendu                                                           | ✓   |
| --- | --------------------------------------- | ----------------------------------------------------------------- | --- |
| 1   | Campus joignable                        | l'accueil et la barre latérale indiquent la connexion             | ☐   |
| 2   | Couper le réseau **pendant** une dictée | la dictée aboutit en local, aucune perte                          | ☐   |
| 3   | Réseau coupé, nouvelle dictée           | « Nova Local est actif », dictée fonctionnelle, texte brut inséré | ☐   |
| 4   | Ouvrir AI Skills hors ligne             | annonce claire, aucune action ne semble disponible                | ☐   |
| 5   | Rétablir le réseau, attendre ~30 s      | retour automatique à l'état connecté                              | ☐   |
| 6   | Se déconnecter                          | **une confirmation est demandée**                                 | ☐   |
| 7   | Se reconnecter                          | historique, Styles et réglages intacts                            | ☐   |

## A7. Réseau contraint (réaliste en école)

| #   | Condition                             | Attendu                                              | ✓   |
| --- | ------------------------------------- | ---------------------------------------------------- | --- |
| 1   | Serveur Campus bloqué par le pare-feu | Nova démarre normalement, repli local, **aucun gel** | ☐   |
| 2   | Aucun accès Internet                  | idem                                                 | ☐   |
| 3   | Serveur très lent (>5 s)              | l'interface reste réactive, aucune fenêtre figée     | ☐   |
| 4   | Session expirée pendant l'usage       | invitation à se reconnecter, pas d'erreur technique  | ☐   |

## A8. Mise à jour

À faire **depuis une version antérieure déjà configurée**.

| #   | Vérifier après mise à jour                              | ✓   |
| --- | ------------------------------------------------------- | --- |
| 1   | Session Campus conservée                                | ☐   |
| 2   | Le parcours de première ouverture **ne recommence pas** | ☐   |
| 3   | Styles personnels présents                              | ☐   |
| 4   | Variables rapides présentes                             | ☐   |
| 5   | Liste noire « Automatique » présente                    | ☐   |
| 6   | Raccourcis inchangés                                    | ☐   |
| 7   | Historique complet                                      | ☐   |
| 8   | Thème et langue inchangés                               | ☐   |

> **Écart connu et accepté** : l'étape d'accueil sur les Styles d'écriture peut
> réapparaître **une seule fois** (renommage interne d'une clé). Tout autre
> retour d'onboarding est un échec.

## A9. Installateur et marque

| #   | Vérifier                                                                     | ✓   |
| --- | ---------------------------------------------------------------------------- | --- |
| 1   | Nom de l'application dans le menu Démarrer                                   | ☐   |
| 2   | Icône correcte (menu Démarrer, barre des tâches, zone de notification)       | ☐   |
| 3   | Titre de la fenêtre                                                          | ☐   |
| 4   | Éditeur affiché par Windows à l'installation                                 | ☐   |
| 5   | Version affichée dans Réglages → Avancé = version installée                  | ☐   |
| 6   | Aucun texte de développement visible (« debug », « placeholder », « test »)  | ☐   |
| 7   | La désinstallation se termine proprement                                     | ☐   |
| 8   | Le nom du build Campus n'apparaît pas dans le build Personal, et inversement | ☐   |

## A10. Inspection des journaux — **confidentialité**

Après avoir exécuté A2 à A7, ouvrir Réglages → Avancé → dossier des journaux et
rechercher dans les fichiers :

| Rechercher                             | Attendu     | ✓   |
| -------------------------------------- | ----------- | --- |
| une phrase que vous avez dictée        | **absente** | ☐   |
| un texte traité par un AI Skill        | **absent**  | ☐   |
| `Authorization` ou `Bearer`            | **absent**  | ☐   |
| une clé d'API                          | **absente** | ☐   |
| un titre de fenêtre ou nom de document | **absent**  | ☐   |

Toute occurrence est un **échec bloquant**.

## A11. Compte standard (sans droits administrateur)

| #   | Vérifier                                   | ✓   |
| --- | ------------------------------------------ | --- |
| 1   | Nova démarre                               | ☐   |
| 2   | Le raccourci global fonctionne             | ☐   |
| 3   | L'insertion fonctionne                     | ☐   |
| 4   | Les réglages persistent après redémarrage  | ☐   |
| 5   | Aucune invite d'élévation en usage courant | ☐   |

## A12. Bindings TypeScript

À faire une fois, sur une machine de développement :

```bash
bun run tauri dev      # tauri-specta réécrit src/bindings.ts au démarrage
git diff --stat src/bindings.ts
```

**Attendu : aucune différence.** Plusieurs types ont été maintenus à la main
faute de pouvoir lancer l'application ; ce test est leur seule vérification.
Un diff non vide n'est pas grave en soi — il faut alors le relire et le
committer.

---

# BLOC B — NOVA COMMANDS (EXPÉRIMENTAL)

> **Un échec ici ne bloque pas le pilote.** Nova Commands est désactivé par
> défaut et n'a aucun raccourci : un étudiant ne peut pas l'atteindre.
> Ce bloc sert à décider si la fonctionnalité peut être ouverte, plus tard.

**Activation** : Réglages → AI Skills → `Ctrl+Shift+D` → bloc « Expérimental » →
activer Nova Commands → attribuer un raccourci.

**Diagnostic** : bouton « Lancer le diagnostic ». Attendu sur Windows :
`sequence_detection = true`, `clipboard_kind` cohérent, `enabled = true`.

## B1. Matrice par application

Sélectionner du texte, presser le raccourci, choisir « Améliorer », puis
« Copier » — et seulement ensuite « Remplacer ».

| Application            | Capture | Aperçu | Remplace | Ctrl+Z | Presse-papiers rendu | Focus |
| ---------------------- | ------- | ------ | -------- | ------ | -------------------- | ----- |
| Bloc-notes             | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| Chrome — `<textarea>`  | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| Chrome — champ enrichi | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| Google Docs            | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| VS Code                | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| Discord                | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |
| Outlook                | ☐       | ☐      | ☐        | ☐      | ☐                    | ☐     |

## B2. Cas limites

| #   | Provoquer                                              | Attendu                                       | ✓   |
| --- | ------------------------------------------------------ | --------------------------------------------- | --- |
| 1   | Aucune sélection                                       | « Aucun texte sélectionné », rien n'est collé | ☐   |
| 2   | Une **image** dans le presse-papiers (capture d'écran) | refus explicite, **et l'image survit**        | ☐   |
| 3   | Sélection identique au presse-papiers                  | capturée quand même                           | ☐   |
| 4   | Changer de fenêtre entre l'aperçu et « Remplacer »     | refus, « Copier » reste offert                | ☐   |
| 5   | Double déclenchement rapide                            | le second est refusé                          | ☐   |
| 6   | Campus injoignable                                     | « Campus injoignable », aucune palette        | ☐   |
| 7   | Échap sur l'aperçu                                     | rien n'est modifié                            | ☐   |

## B3. Réglage à ajuster

`PASTE_SETTLE = 250 ms` (`src-tauri/src/nova_commands.rs`) est une **heuristique** :
aucune API ne dit qu'une application a fini de lire le presse-papiers.

**Symptôme d'une valeur trop courte** : c'est l'ancien contenu du presse-papiers
qui est collé au lieu du résultat.

Notez ici les applications où cela se produit :

```
Application :                       Reproductible : oui / non
Application :                       Reproductible : oui / non
```

## B4. Régression de la dictée — **obligatoire**

Nova Commands utilise un chemin presse-papiers séparé. Après le bloc B, revenez
au bloc A2 sur **au moins deux applications** :

| #   | Vérifier                                                  | ✓   |
| --- | --------------------------------------------------------- | --- |
| 1   | La dictée fonctionne toujours                             | ☐   |
| 2   | Le texte dicté est toujours laissé dans le presse-papiers | ☐   |
| 3   | Désactiver Nova Commands, redémarrer, redicter            | ☐   |

---

## Décision

Le pilote peut démarrer quand **tout le bloc A est vert**. Le bloc B est
consultatif.

|                        |                                      |
| ---------------------- | ------------------------------------ |
| Bloc A complet et vert | ☐                                    |
| Échecs bloc A (liste)  |                                      |
| Bloc B exécuté         | ☐                                    |
| Verdict                | ☐ PILOT READY ☐ retour en correction |
| Date / testeur         |                                      |
