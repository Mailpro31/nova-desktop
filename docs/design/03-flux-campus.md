# Flux Campus, réseau, rôles et repli local

## Connexion

Le serveur est celui de l'établissement (ex. `https://nova.ipsa.fr`). Son
adresse est soit saisie par l'utilisateur, soit **pré-remplie et verrouillée**
par la DSI via un fichier `campus-config.json`. Dans ce cas le champ serveur est
visible mais non modifiable.

Nova cherche ce fichier dans cet ordre :

1. `%ProgramData%\Nova\campus-config.json` — la configuration **du poste**,
   celle qu'un déploiement Intune ou GPO écrit une fois pour tous les comptes.
   Elle est lisible sans droits administrateur, modifiable seulement avec, et
   survit aux mises à jour de Nova puisqu'elle vit hors du répertoire
   d'installation ;
2. à côté de `Nova.exe` — l'emplacement historique, conservé pour les postes
   déjà déployés et pour l'installation portable, qui n'a pas de configuration
   de poste ;
3. rien : l'utilisateur saisit lui-même l'adresse.

Un fichier laissé à côté de l'exécutable ne peut donc pas détourner un poste
géré. Sur macOS l'équivalent est `/Library/Application Support/Nova`, sur Linux
`/etc/nova`.

```
Bienvenue ──▶ E-mail + serveur ──▶ Code à 6 chiffres ──▶ Prêt
                    │                      │
                    │                      ├── 400 : « code incorrect ou expiré »
                    │                      └── 403 : sièges ou appareils épuisés
                    └── réseau : « serveur injoignable »
```

- Le code est envoyé à l'adresse de l'établissement. Saisie en **6 cases
  séparées**, avance automatique, retour arrière intelligent.
- Bouton « Renvoyer le code » avec **compte à rebours de 60 s**.
- L'appareil est identifié par le nom de machine (`hostname`) : un compte a un
  nombre de sièges et d'appareils limité côté serveur.
- Après vérification : session `{server_url, token, email}` persistée. Elle
  survit aux redémarrages.

Il n'y a **aucune étape après « Prêt »** : l'écran rappelle le raccourci et
lance l'application.

## Rôles et périmètre

`GET /api/me` renvoie `{email, role, cohort, organization}`.
Rôles existants côté serveur : **student · teacher · staff · partner**.
`cohort` est une promotion (« Promo 2028 »), `organization` l'établissement
(déduit du domaine e-mail).

Aujourd'hui **l'interface n'exploite pas le rôle** : aucun écran ne change
selon student/teacher/staff/partner. C'est un gisement pour la refonte
(vocabulaire partagé par cohorte, règles de formatage imposées par
l'établissement, vue enseignant) — mais rien n'existe encore côté client.

Un compte peut être **suspendu** côté serveur (`disabled`).

## États réseau — trois états, pas deux

| État                 | Déclencheur                                        | Comportement attendu                                                                         |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Connecté**         | `GET /api/health` répond (timeout 2 s, cache 30 s) | pastille verte, nom du serveur                                                               |
| **Hors ligne**       | serveur injoignable                                | pastille orange, **repli local**, notification discrète auto-masquée (4 s), jamais bloquante |
| **Session invalide** | `401` sur une route authentifiée                   | session supprimée, retour à l'écran de connexion, message « session expirée »                |

L'état est ré-évalué toutes les 30 secondes.

## Repli local — « jamais de perte »

C'est la garantie centrale du mode Campus :

- Serveur injoignable → la transcription se fait localement, le texte est collé.
- Reformulation impossible (502, délai dépassé) → **le texte brut est collé**,
  jamais rien n'est perdu, une notification l'explique en langage clair.
- Une erreur 502 avec serveur joignable reste **silencieuse** : le texte brut
  est collé sans notification trompeuse.
- Mode commande en échec : la sélection n'est **pas modifiée**.

Aucun message technique brut ne doit apparaître : jamais « HTTP 502 »,
toujours « Serveur injoignable — texte collé sans reformulation ».

## Ce que le client envoie au serveur

| Route                          | Contenu envoyé                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `POST /api/transcribe`         | l'audio (WAV, après filtrage des silences)                                         |
| `POST /api/reformulate`        | le texte + **la consigne du style**, rien d'autre                                  |
| `POST /api/command`            | l'instruction dictée + le texte sélectionné                                        |
| `POST /api/dictionary/learn`   | `{heard, corrected}`, 120 caractères max                                           |
| `POST /api/dictionary/analyze` | un document, dont seuls les termes sont extraits — le document n'est jamais stocké |

Le serveur injecte lui-même le vocabulaire, les snippets et les règles de
formatage : le client ne les transmet pas.

## Capacités et paliers — mode personnel uniquement

Le mode personnel expose des paliers (`free`, `pro`, `ultra`, `business`) et un
verrou par fonctionnalité (`features[...]`), matérialisé par des badges
« NÉCESSITE NOVA PRO / ULTRA », un comparatif de paliers, une barre de quota et
un accent lilas `--color-ultra`.

**Rien de tout cela n'existe en Campus** : ni palier, ni quota, ni compteur
d'usage, ni invitation à l'abonnement. Une maquette Campus qui affiche un
badge de palier est fausse.
