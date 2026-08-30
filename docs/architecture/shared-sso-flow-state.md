# État partagé des tentatives SSO

Comment une connexion SSO cesse de dépendre du processus qui l'a commencée.
Complète [`control-plane-foundation.md`](./control-plane-foundation.md) et les
trois documents de fournisseurs.

Implémentation : `nova-server/main.py` § _État des tentatives SSO_.

---

## 1. Pourquoi la mémoire du processus ne suffisait pas

Une connexion SSO se déroule en **deux appels** séparés par un aller-retour dans
le navigateur :

```
POST /api/auth/sso/{provider}/start      → worker A
        … l'utilisateur s'authentifie chez le fournisseur …
POST /api/auth/sso/{provider}/exchange   → worker B ?
```

Tant que l'état vivait dans un dictionnaire du processus, ces deux appels
devaient atterrir sur **le même** worker. Un répartiteur de charge, un
redémarrage, ou simplement `uvicorn --workers 2` suffisaient à casser une
connexion en cours — et l'utilisateur, qui venait pourtant de s'authentifier,
recevait un message d'expiration incompréhensible.

C'était la dernière dépendance du moteur d'authentification au processus local.

---

## 2. Ce qui est stocké

```sql
sso_flows(
  flow_id_hash        TEXT PRIMARY KEY,   -- empreinte, jamais l'identifiant
  provider_type       TEXT NOT NULL,
  provider_config_id  TEXT NOT NULL,
  organization_id     TEXT NOT NULL,
  nonce_hash          TEXT NOT NULL,      -- empreinte, jamais le nonce
  redirect_uri        TEXT NOT NULL,
  machine             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at, expires_at, exchanging_at, consumed_at  REAL
)
```

### Le `flow_id` est haché

Présenter un `flow_id` suffit à réclamer une tentative : c'est un secret
porteur, au même titre qu'un jeton de session. Il est donc traité pareil — seule
son empreinte SHA-256 est écrite, et un accès en lecture à la base ne permet de
reprendre aucune connexion en cours.

24 octets d'aléa cryptographique : rien à deviner, donc SHA-256 sans dérivation
lente, exactement comme pour les jetons Nova.

### Le `nonce` est haché aussi

Le `nonce` n'a **jamais besoin d'être relu en clair**. Le serveur le reçoit du
poste au démarrage, le transmet au fournisseur, et n'a plus ensuite qu'une
question à poser : _le jeton d'identité porte-t-il le bon ?_ Comparer l'empreinte
de celui que porte le jeton à celle qui a été retenue répond exactement à cette
question.

Il n'est donc **jamais** stocké en clair, et la comparaison passe par
`secrets.compare_digest`.

### Ce qui n'est jamais persisté

Code d'autorisation, `code_verifier` (il ne quitte pas le poste), jetons du
fournisseur, jeton de session Nova, secret client. Un test vérifie l'absence de
ces mots dans la ligne stockée, et que la table ne prévoit aucune colonne pour
les accueillir.

### Le `state`, lui, n'est pas côté serveur

Le `state` OAuth est généré **et vérifié par le poste** : il protège son propre
écouteur de bouclage. Le serveur ne l'a jamais vu, et cette phase ne change
rien à cela.

---

## 3. Machine à états

```
pending ──begin_exchange──▶ exchanging ──mark_consumed──▶ consumed
   │                            │
   └─────────  expiration  ─────┘
```

Trois états, pas dix. L'objectif est **un échange, exactement une fois**.

### Réservation atomique

```sql
UPDATE sso_flows SET status='exchanging', exchanging_at=?
WHERE flow_id_hash=? AND status='pending' AND expires_at>?
```

Le nombre de lignes modifiées décide : `1` réserve, autre chose refuse. Deux
workers présentant le même `flow_id` au même instant ne peuvent pas passer tous
les deux — c'est ce qui empêche deux échanges avec le même code
d'autorisation. Un test à huit fils concurrents vérifie qu'exactement un gagne.

### Quand la tentative est consommée

La réservation a lieu **avant** l'échange, la consommation **après** l'émission
de la session. Entre les deux, la tentative est `exchanging` : déjà inutilisable
par un autre worker, mais son état dit ce qui s'est réellement passé.

### Rejeu

Un second appel avec le même `flow_id` échoue, que la tentative soit `exchanging`
ou `consumed`. Du point de vue de l'appelant, la réponse est la même —
`AUTH_TIMEOUT` — et ne renseigne pas sur l'état interne.

---

## 4. Panne en cours d'échange

Si un worker réserve une tentative puis meurt avant d'échanger, celle-ci reste
`exchanging` jusqu'à son expiration. **Aucune reprise automatique.**

C'est délibéré. Un code d'autorisation OAuth est lui-même à usage unique et de
courte durée : le rejouer échouerait chez le fournisseur dans le meilleur des
cas, et ouvrirait une fenêtre où deux workers appellent le point de terminaison
de jeton dans le pire. Une reprise « intelligente » achèterait une commodité
marginale au prix d'un risque réel.

Conséquence pour l'utilisateur : il reclique, ce qui prend quelques secondes.
C'est le bon compromis.

---

## 5. Durée de vie et nettoyage

TTL de 10 minutes, centralisé (`SSO_FLOW_TTL_SECONDS`). Une tentative expirée
n'est jamais échangeable.

Les lignes terminées ou périmées depuis plus d'une heure sont effacées — au
démarrage, et à la création de chaque nouvelle tentative. Pas de tâche de fond,
pas de minuterie : le ménage se fait au moment où l'on écrit de toute façon.

---

## 6. Ce à quoi une tentative reste liée

| Lien                 | Effet                                                    |
| -------------------- | -------------------------------------------------------- |
| `provider_type`      | un retour Google ne complète pas une tentative Microsoft |
| `provider_config_id` | un retour d'un IdP OIDC n'en complète pas un autre       |
| `organization_id`    | vient de la configuration, jamais du client              |
| `redirect_uri`       | un retour sur une autre adresse est refusé               |
| `nonce_hash`         | le poste ne « rappelle » pas son nonce à l'échange       |

**Désactivation en cours de route** : la configuration est relue au moment de
l'échange. Un administrateur qui désactive un fournisseur pendant qu'une
tentative est ouverte coupe cette tentative — une désactivation ne se contourne
pas avec un flux déjà commencé.

**Compte désactivé en cours de route** : le contrôle de statut reste à la fin du
parcours, donc aucune session n'est émise.

---

## 7. Abstraction du stockage

```python
class SsoFlowStore:            # contrat
class DatabaseSsoFlowStore:    # implémentation actuelle
SSO_FLOW_STORE: SsoFlowStore = DatabaseSsoFlowStore()
```

Le moteur d'authentification parle au **contrat**, pas à SQLite. Ce n'est pas de
l'abstraction gratuite : le stockage changera, et le jour où il changera, le
moteur ne doit pas s'en apercevoir.

### Limites honnêtes de SQLite

Pour une instance dédiée, SQLite suffit : les écritures sont rares — une par
connexion — courtes, et l'`UPDATE` conditionnel donne l'atomicité recherchée.

Ce ne sera **pas** le stockage d'un Control Plane réparti. SQLite suppose un
système de fichiers partagé et cohérent, ce qu'un déploiement multi-instances
n'offre pas ; sous forte concurrence d'écriture, il sérialise et renvoie des
verrous. La trajectoire est donc :

```
Phase 20 : abstraction + SQLite      (instance dédiée, plusieurs workers)
Plus tard : Postgres ou Redis        (Control Plane multi-instances)
```

Aucune dépendance n'a été ajoutée pour cela — ce serait payer aujourd'hui un
besoin de demain.

---

## 8. Ce qui reste local, et pourquoi c'est correct

| État                                   | Portée     | Justification                                                |
| -------------------------------------- | ---------- | ------------------------------------------------------------ |
| Cache JWKS                             | worker     | reconstructible seul ; au pire un appel de plus au démarrage |
| Cache métadonnées OIDC                 | worker     | idem                                                         |
| **`ENTRA_FLOWS`** (Device Code hérité) | **worker** | **voir ci-dessous**                                          |

> ### ⚠️ LEGACY DEVICE CODE NOT HORIZONTAL-SAFE
>
> Le flux Device Code Microsoft garde son état en mémoire de processus. Son
> `start` et son `poll` doivent donc atterrir sur le même worker.
>
> Ce n'est pas un oubli : c'est un chemin de **repli hérité**, qui n'est plus le
> chemin principal depuis la Phase 15, et le migrer demanderait de porter aussi
> le `device_code` du fournisseur — un secret d'une nature différente, avec sa
> propre analyse. Le risque de toucher à un fallback qui fonctionne dépasse le
> bénéfice.
>
> Conséquence opérationnelle : derrière plusieurs workers, activer des sessions
> collantes ou accepter que le Device Code échoue parfois. Dette **P2**,
> à traiter le jour où le Device Code sera retiré ou réellement nécessaire à
> l'échelle.

---

## 9. Journalisation

Type de fournisseur, identifiants de configuration et d'organisation tronqués,
résultat, code de raison. **Jamais** : `flow_id`, `nonce`, code d'autorisation,
jetons.

L'identifiant de flux a d'ailleurs été retiré de la ligne de journal de succès :
c'est un secret porteur, il n'avait rien à y faire.

---

## 10. Ce que cette phase débloque

> **L'état d'authentification est sorti du processus.**
>
> Un répartiteur de charge peut router `start` et `exchange` vers des workers
> différents, à condition qu'ils partagent la même base. Un redémarrage ne casse
> plus une connexion en cours.

C'était le dernier verrou technique identifié avant un Control Plane réparti. Il
en reste d'autres, de nature différente : découverte d'organisation,
authentification d'administration, références de secret — tous listés dans
[`control-plane-foundation.md`](./control-plane-foundation.md).

Le contrat externe n'a pas changé : le poste envoie et reçoit exactement les
mêmes champs qu'avant.
