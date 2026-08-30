# Authentification d'administration

Comment Nova sait **qui** administre une organisation, et **ce qu'il a le droit
d'y faire**. Fondation backend du futur Nova Admin — qui n'existe pas encore.

Complète [`control-plane-foundation.md`](./control-plane-foundation.md).
Implémentation : `nova-server/main.py` § _Administration moderne_,
`nova-server/admin_cli.py`.

---

## 1. Ce que cela remplace

Un jeton statique partagé — `X-Admin-Token` — authentifiait **une machine, pas
une personne**. Il a été retiré en Phase 28 ; ce document explique pourquoi, et
ce qui l'a remplacé.

Un unique secret partagé, écrit dans une variable d'environnement, circulant
entre tous ceux qui administrent. Il ne se révoque pas individuellement — le
changer déconnecte tout le monde. Il ne distingue aucun rôle : celui qui l'a
peut tout. Et un journal d'audit alimenté par lui ne peut écrire qu'une seule
chose : « quelqu'un qui détenait le jeton ».

C'était acceptable pour un serveur d'établissement administré par une personne.
Ça ne l'est plus dès qu'il y a deux administrateurs, ou une organisation de plus.

---

## 2. Identité, privilège : deux questions distinctes

```
Microsoft / Google / OIDC          Nova
        ↓                            ↓
   QUI est la personne        CE QU'ELLE PEUT FAIRE
   (authentification)              (autorisation)
```

C'est la règle posée depuis la Phase 13, appliquée ici au cas le plus sensible.
Une revendication `role=admin`, `groups=admins` ou `is_admin=true` venue d'un IdP
**n'élève rien**. Nova lit une seule chose : la colonne `users.security_role`,
écrite par un opérateur.

Sans cela, quiconque contrôle un annuaire d'entreprise — ou un groupe dans cet
annuaire — contrôlerait l'administration de Nova.

Un rôle inconnu, corrompu, ou écrit par une version future retombe sur `member`.
Le défaut, en cas de doute, est toujours le moindre privilège.

**Aucun mot de passe Nova.** Pas de table de mots de passe d'administration, pas
de réinitialisation maison, pas de second annuaire à sécuriser. L'authentification
reste celle de l'organisation.

---

## 3. Modèle d'identité réutilisé, sessions séparées

Aucun second modèle d'identité n'a été créé. Un administrateur est un `User`,
avec son `FederatedIdentity` et son appartenance à une organisation — plus un
rôle de sécurité. Dupliquer le modèle aurait produit deux notions de « personne »
à garder synchronisées, et donc à désynchroniser.

Les **sessions**, en revanche, sont séparées.

Une session Nova ordinaire sert à dicter, toute la journée, sur un poste, pendant
trente jours. Si elle ouvrait aussi l'administration, le privilège élevé serait
présent en permanence, sur chaque poste, pendant un mois. La session
d'administration s'ouvre donc **explicitement**, vit quelques heures, et se
referme.

```
SSO de l'organisation
        ↓
  session Nova (utilisateur)
        ↓  POST /api/admin/step-up/start — rôle vérifié
  réauthentification auprès de l'IdP (Phase 24)
        ↓  POST /api/admin/step-up/complete — fraîcheur et identité vérifiées
  session d'administration (courte)
        ↓
  /api/admin/*  /api/control/*
```

Depuis la **Phase 24**, une session utilisateur ne suffit plus : il faut une
authentification **récente**. Voir [`admin-step-up.md`](./admin-step-up.md).

---

## 4. Séparation stricte des deux jetons

|                        | Routes utilisateur | Routes d'administration |
| ---------------------- | ------------------ | ----------------------- |
| Jeton de session Nova  | ✅                 | ❌ `401`                |
| Jeton de session admin | ❌ `401`           | ✅                      |

Les deux voyagent en `Authorization: Bearer`. **Le client ne déclare jamais que
son jeton est un jeton d'administration** — le serveur le sait parce qu'il le
trouve, ou non, dans `admin_sessions`. Demander au client de qualifier son propre
jeton reviendrait à lui demander son niveau de privilège.

Être administrateur ne suffit donc pas : il faut avoir **ouvert** une session
d'administration. Testé dans les deux sens.

---

## 5. Le jeton d'administration

Mêmes exigences que les sessions Nova : opaque, 32 octets d'entropie, **stocké
haché** (SHA-256), jamais journalisé, jamais en paramètre d'URL.

Pas de JWT maison. Un JWT ne servirait ici qu'à transporter un rôle que le
serveur relit de toute façon en base à chaque appel — il ajouterait une
signature à vérifier, une rotation de clé à gérer, et aucune propriété utile.

Table `admin_sessions` : `id`, `user_id`, `email`, `organization_id`,
`security_role`, `auth_provider`, `token_hash`, `created_at`, `expires_at`,
`last_seen_at`, `revoked_at`.

**Durées** : 4 heures d'existence maximale, 30 minutes d'inactivité. Les deux
sont réglables par variable d'environnement, et vérifiées côté serveur — jamais
sur la foi du client.

---

## 6. Une session ne fige pas un privilège

Le rôle inscrit dans la session est **indicatif**. À chaque appel, le serveur
revérifie l'état réel :

| Vérification                                | Si elle échoue              |
| ------------------------------------------- | --------------------------- |
| session non révoquée                        | `401 ADMIN_SESSION_REVOKED` |
| session non expirée (absolue et inactivité) | `401 ADMIN_SESSION_EXPIRED` |
| compte actif                                | `403 ADMIN_REQUIRED`        |
| rôle toujours administrateur                | `403 ADMIN_ROLE_REQUIRED`   |
| organisation active                         | `403 ADMIN_REQUIRED`        |

Retirer son rôle à quelqu'un lui ferme la porte **au prochain appel**, pas à la
prochaine expiration. Un compte désactivé perd immédiatement l'accès. Une
organisation suspendue ne s'administre plus.

**Se déconnecter de Nova ferme aussi les sessions d'administration.** Laisser un
privilège ouvert derrière une personne partie demanderait une justification que
nous n'avons pas.

---

## 7. Rôles et capacités

Trois rôles d'administration. Ce que l'on vérifie dans le code, ce sont les
**capacités** — sans quoi `if role ==` se disperse dans quarante routes et la
matrice devient impossible à relire.

| Capacité            | `organization_admin` | `it_admin` | `read_only` |
| ------------------- | :------------------: | :--------: | :---------: |
| `organization_read` |          ✅          |     ✅     |     ✅      |
| `diagnostics_read`  |          ✅          |     ✅     |     ✅      |
| `provider_manage`   |          ✅          |     ✅     |      —      |
| `discovery_manage`  |          ✅          |     ✅     |      —      |
| `identity_manage`   |          ✅          |     —      |      —      |
| `security_manage`   |          ✅          |     —      |      —      |
| `deployment_manage` |          —           |     ✅     |      —      |

`organization_admin` gère **les personnes**, `it_admin` gère **la machine**.
Aucun n'est un sur-ensemble de l'autre : trois rôles qui autorisent la même chose
seraient un seul rôle déguisé en trois. Un test le vérifie explicitement.

Un `member` n'a **aucune** capacité d'administration. La ligne est écrite dans la
table plutôt que laissée à l'absence de clé : un oubli ne doit pas se lire comme
une intention.

Un refus dit `ADMIN_ROLE_REQUIRED`, jamais quel rôle manquait — c'est inutile à
un administrateur légitime, et informatif pour qui sonde.

---

## 8. Le premier administrateur

Problème d'amorçage : si aucun administrateur n'existe, qui crée le premier ?

**Pas un endpoint.** « Faites de moi un administrateur » est une porte dérobée
quelles que soient les conditions qu'on lui ajoute — il suffit qu'une seule se
relâche un jour. Pas non plus une variable d'environnement d'amorçage : elle
resterait en place bien après le premier démarrage, et une variable oubliée est
une porte dérobée permanente.

La seule autorité acceptable est celle de qui détient déjà le serveur :

```bash
python admin_cli.py grant  <email> organization_admin
python admin_cli.py revoke <email>
python admin_cli.py list
```

Depuis la **Phase 26**, Nova Admin gère les administrateurs **suivants** — voir
[`admin-identity-management.md`](./admin-identity-management.md). La ligne de
commande reste celle du premier, et le chemin de récupération quand plus personne
ne peut se connecter.

`set_security_role()` n'est exposée par aucune route. La route
`POST /api/admin/user/{email}` modifie le rôle **métier** (`users.role`) — jamais
le rôle de sécurité. Aucun chemin HTTP n'accorde de privilège, et un test
vérifie que ces routes n'existent pas.

Révoquer ferme immédiatement les sessions ouvertes de la personne : une
révocation qui n'agirait qu'à l'expiration n'en serait pas une.

---

## 9. Isolation par organisation

```
GET /api/control/organizations/{organization_id}
```

L'identifiant dans le chemin **désigne** ; il n'autorise pas. Le serveur vérifie
que le principal administre bien cette organisation. Sans cela, il suffirait d'en
changer dans l'URL pour administrer le voisin.

Une organisation qu'on n'administre pas renvoie `404 ORGANIZATION_NOT_FOUND` —
pas `403`. Un administrateur n'a pas à découvrir quelles autres organisations
existent sur la plateforme.

Un `organization_id` fourni par le client, en paramètre ou en en-tête, n'a
**aucun effet** : le principal fait autorité. Testé.

---

## 10. Le jeton partagé — retiré

Il n'existe plus. Depuis la **Phase 28**, l'administration n'a qu'un seul
chemin : SSO, puis réauthentification, puis session d'administration.

Ce qui a été supprimé : la variable `NOVA_ADMIN_TOKEN`, le drapeau
`NOVA_LEGACY_ADMIN_TOKEN`, l'en-tête `X-Admin-Token`, la comparaison, et la
valeur aléatoire fabriquée au démarrage quand la variable manquait — un secret
par défaut est un secret partagé par tous les déploiements qui l'oublient.

Présenter cet en-tête, avec n'importe quelle valeur, ne donne désormais rien :
`401 ADMIN_REQUIRED`. Des tests le vérifient sur plusieurs valeurs, dont
l'ancienne valeur de fixture qui ouvrait tout.

### Ce qui a rendu ce retrait possible

Il fallait d'abord que rien d'essentiel n'en dépende. Trois phases l'ont
préparé : Nova Admin (25), la gestion des administrateurs (26), celle des
membres et la suppression de l'ancienne console (27).

Restait un trou, découvert en Phase 28 : **activer la découverte d'une
organisation** demandait une session d'administration, qui demandait Nova Admin,
qui ne démarrait pas sans découverte. Le jeton servait de sortie de secours à cet
amorçage circulaire. `admin_cli.py discovery` prend sa place — au bon endroit,
sur le serveur, comme le reste de l'amorçage.

### Migration

| Avant                              | Maintenant                                       |
| ---------------------------------- | ------------------------------------------------ |
| `X-Admin-Token` sur `/api/admin/*` | Nova Admin : SSO + réauthentification            |
| Premier administrateur             | `admin_cli.py grant <email> organization_admin`  |
| Activer la découverte              | `admin_cli.py discovery enable --endpoint <url>` |
| Récupération                       | la ligne de commande, sur le serveur             |

Aucun nouveau mécanisme n'a été introduit : ni clés d'API, ni comptes de service,
ni jetons machine. Le jour où une automatisation en aura réellement besoin, ce
sera une décision à prendre, pas un reste à conserver.

### Les quatre chemins, une fois pour toutes

|                             |                                          |
| --------------------------- | ---------------------------------------- |
| **Premier administrateur**  | `admin_cli.py grant`, sur le serveur     |
| **Première découverte**     | `admin_cli.py discovery enable`          |
| **Administration courante** | Nova Admin — SSO puis réauthentification |
| **Récupération**            | la ligne de commande locale              |

La ligne de commande n'est **ni une API distante, ni un mécanisme machine** :
elle ne crée aucune session, n'émet aucun jeton et n'expose aucune route. Son
autorité est celle de qui détient déjà le serveur. Un test le vérifie.

### Couverture de la ligne de commande

`admin_cli.py discovery` est devenu un chemin d'amorçage critique ; il est donc
couvert automatiquement, dans `test_admin_cli.py` : lecture, activation,
désactivation, contrat de conservation de l'adresse, entrées invalides, et —
surtout — la preuve que la commande **délègue** la validation d'adresse au même
helper que l'API, avec le drapeau du serveur. Une validation parallèle plus
permissive serait exactement la porte dérobée que ce retrait cherchait à fermer.

## 11. Journal d'audit

Table `admin_audit_log` : organisation, acteur, rôle, action, cible, identifiant
de corrélation, horodatage serveur, métadonnées minimales.

Actions enregistrées aujourd'hui :

```
admin_session.create · admin_step_up.success
admin_role.grant|change|revoke
member.disable|enable|type_change|group_change|sessions_revoke|delete
provider_config.create|update|disable · discovery.update
organization_policy.update
```

> **Quatre noms de plus vivent dans la table de libellés** —
> `user.update|delete|revoke_machines` et `cohort.disable`. Plus aucune route
> ne les écrit : elles sont parties avec la console héritée en Phase 27. Leurs
> libellés restent pour que les lignes **déjà écrites** se lisent encore. Un
> journal dont les anciennes entrées deviendraient illisibles au fil des
> versions ne servirait plus à répondre à « qui a fait cela ? ».

**Ce qui n'y entre jamais** : jeton d'administration, jeton de session, secret
client, code d'autorisation, `id_token`, jeton de rafraîchissement, `nonce`,
audio, texte dicté, prompt. Un journal est exactement l'endroit où un secret
survivrait le plus longtemps. On enregistre qu'un secret **a été remplacé**
(`secret_replaced: true`), jamais sa valeur — ni l'ancienne, ni la nouvelle.

Les lectures simples ne sont pas auditées : tout auditer produit un journal que
personne ne lit.

**Immuabilité, honnêtement** : le journal est en ajout seul _par l'application_ —
aucune route ne le modifie ni ne le supprime, et les horodatages viennent du
serveur. SQLite n'offre aucune immuabilité au niveau du stockage : quiconque
tient le fichier tient le journal. Prétendre le contraire serait faux.

---

## 12. Les secrets restent invisibles

Toutes les garanties de la Phase 19 tiennent : `oidc_client_secret` n'est jamais
renvoyé, seul `has_secret` l'est. La vue Control Plane ne donne que des
résumés — nombre de configurations par type, combien sont actives — sans
émetteur, sans identifiant client, sans secret.

**« Administrateur » ne veut pas dire « voir les secrets ».** Une session
d'administration ne change rien à cette règle.

---

## 13. MFA : chez l'IdP, et il faut le dire

Nova ne vérifie aucun second facteur, et n'en gère aucun. Si Microsoft, Google ou
Okta imposent un MFA, il se produit chez eux, avant que Nova voie quoi que ce
soit. **Nova Admin s'appuie sur la politique d'authentification de l'IdP amont.**

### Step-up — ✅ fait en Phase 24

Ouvrir une session d'administration exige désormais une authentification
**récente** : `max_age` à l'autorisation, puis vérification d'`auth_time` dans
l'`id_token`. Nova n'invente toujours aucun second facteur — il redemande une
authentification à l'IdP et vérifie sa fraîcheur. Ce que l'IdP exige alors le
regarde seul.

Voir [`admin-step-up.md`](./admin-step-up.md).

---

## 14. Administrateur d'organisation ≠ opérateur Nova

Deux niveaux, à ne jamais confondre :

|        | Administrateur d'organisation | Opérateur Nova                                 |
| ------ | ----------------------------- | ---------------------------------------------- |
| Qui    | le client                     | l'équipe Nova                                  |
| Portée | **son** organisation          | les tenants, le provisionnement, les incidents |
| Existe | ✅                            | ❌ pas construit                               |

`organization_admin` ne reçoit **aucun** pouvoir global. Le jour où l'opérateur
Nova existera, ce sera une identité séparée, avec son propre chemin
d'authentification — pas un rôle de plus dans la table des membres d'un client.

---

## 15. Modèle web futur

Nova Admin sera une application web. Le backend expose aujourd'hui un jeton
`Bearer`, ce qui convient au test et à une console qui garde son jeton en
mémoire.

**Cible recommandée** : cookie de session `HttpOnly` + `Secure` + `SameSite=Lax`,
adossé à la même table `admin_sessions`. Un jeton `Bearer` en mémoire disparaît
au rafraîchissement de page ; stocké dans `localStorage`, il devient lisible par
tout script injecté. Le cookie évite les deux — au prix d'une protection CSRF
explicite (jeton anti-rejeu ou en-tête personnalisé, `SameSite` seul ne suffisant
pas pour les mutations).

Rien de ce choix n'affecte le Desktop, qui n'utilise aucune de ces routes.

### CORS

**Aucun CORS n'est configuré, et c'est le bon état actuel** — aucune application
web n'existe. Le jour où elle existera : liste d'origines explicite, jamais
`Access-Control-Allow-Origin: *`, et surtout jamais le joker combiné aux
identifiants.

---

## 16. Limitation d'appels

Aucune. Même situation que la découverte, et même raison : un limiteur en mémoire
de processus ne limiterait rien derrière plusieurs workers tout en donnant
l'illusion d'une protection.

`POST /api/admin/session` en aura besoin — c'est le point où l'on teste des
jetons de session volés. C'est une **exigence de passerelle**, notée comme telle.

---

## 17. SQLite

Honnêtement : acceptable pour cette fondation et pour le mode dédié. Inadapté à
un Control Plane central — écritures sérialisées, pas de réplication, pas de
verrouillage réparti.

Les tables ajoutées sont écrites sans dépendre d'aucune particularité SQLite :
types simples, clés explicites, aucun `rowid` implicite, aucun `AUTOINCREMENT`,
identifiants générés par l'application. La migration vers PostgreSQL restera un
portage de schéma, pas une réécriture.

---

## 18. Ce qui n'est pas construit

- ~~**Nova Admin UI**~~ ✅ **faite en Phase 25** — voir
  [`nova-admin-foundation.md`](./nova-admin-foundation.md) ;
- **Nova Control operator** — documenté comme identité future séparée (§ 14) ;
- ~~**routes de gestion des administrateurs**~~ ✅ **faites en Phase 26**, avec
  garde-fou du dernier gestionnaire ;
- **migration PostgreSQL** (§ 17), **limitation d'appels** (§ 16) ;
- **step-up par action** pendant une session d'administration — le mécanisme
  existe depuis la Phase 24, la granularité non ;
- **SCIM, policies, packages, SAML, passerelle privée**.
