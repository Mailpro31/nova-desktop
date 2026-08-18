# Nova Organization Identity

Ce document définit **qui se connecte** à Nova, **à quelle organisation** cette
personne appartient, et **d'où viennent ses droits**. Il complète
[`organization-foundation.md`](./organization-foundation.md), qui définit les
éditions et les capacités.

Implémentation : `src/lib/organization/identity.ts`,
`src-tauri/src/organization.rs`, et `nova-server/main.py`.

---

## 1. La chaîne d'identité

```
Identity Provider          qui atteste de l'identité
        ↓
External identity          (provider, external_subject) — immuable
        ↓
Organization / Tenant      mapping EXPLICITE, jamais déduit d'une adresse
        ↓
Member                     l'utilisateur dans cette organisation
        ↓
Groups                     segmentation (promo, équipe, service)
        ↓
Security Role              droits Nova
        ↓
Capabilities               ce que l'application ouvre
```

Chaque flèche est une décision **du serveur**. Le Desktop lit le résultat ; il
ne le propose jamais.

**Nova ne détermine jamais de permission à partir de** : une adresse e-mail, un
domaine d'adresse seul, un nom d'organisation, un `memberType`, ou une valeur
envoyée par le Desktop.

---

## 2. Frontières de confiance

| Couche | Rôle | Ce qu'elle **ne** fait **pas** |
|---|---|---|
| Desktop | expérience : masquer ce qui n'est pas disponible | autoriser quoi que ce soit |
| `/api/*` | **autorité** : authentifier, autoriser, décider | faire confiance au corps de requête pour l'identité |
| IdP (Entra, Google, OIDC) | attester une identité externe | décider des droits Nova |

Un client modifié ne gagne rien : il peut s'afficher ce qu'il veut, il n'obtient
pas pour autant une réponse du serveur. Un test le vérifie côté serveur
(`test_client_cannot_claim_a_security_role`) et côté Desktop.

> **Vérification côté Desktop = UX. Autorisation côté serveur = sécurité.**
> Toute opération sensible doit être revalidée par le serveur, qui ne lit ni
> l'organisation ni le rôle envoyés par le client.

---

## 3. Modèles

### IdentityProvider

```
microsoft_entra | google_workspace | oidc | legacy_email_code
```

`legacy_email_code` — adresse académique + code à six chiffres — en fait
partie : c'est une manière de s'authentifier, pas un régime à part. Ce qui la
distingue est qu'elle n'a pas de sujet externe.

### User

Identifiant interne stable, distinct de l'adresse.

```
user_id           UUID Nova, attribué à la création, jamais réattribué
email             clé historique, conservée (toutes les tables la référencent)
organization_id   organisation d'appartenance
status            active | disabled | deprovisioned
```

### FederatedIdentity

```
provider              microsoft_entra | google_workspace | oidc
external_subject      oid (Microsoft) / sub (Google, OIDC) — IMMUABLE
external_tenant_id    tid (Microsoft) / customer (Google) / issuer (OIDC)
organization_id       organisation Nova rattachée
```

Règles appliquées et testées :

- une **adresse e-mail ne peut jamais** être un `external_subject` — la
  construction échoue avec `email_used_as_subject` ;
- la clé d'unicité est le couple `(provider, external_subject)` : un même sujet
  chez deux fournisseurs reste **deux identités distinctes** ;
- un sujet absent est refusé (`missing_subject`) plutôt que remplacé.

Pourquoi `oid` et non `sub` chez Microsoft : `oid` identifie l'objet
utilisateur dans le tenant et survit à un changement de nom ou d'adresse, là où
`sub` n'est stable que par couple (application, utilisateur) — il change si
l'application change.

### Organization

```
id                 UUID Nova, immuable        ← clé de tenant
slug               « ipsa »                   ← lisible, configuré
display_name       « IPSA Paris »             ← un libellé, jamais une clé
org_type           education | business
entra_tenant_id    mapping explicite
google_customer_id / oidc_issuer
```

### Cycle de vie de l'identifiant d'organisation

L'UUID est **attribué une fois, persisté, et jamais recalculé**.

```
premier démarrage
   ↓  seed = uuid5(NAMESPACE_URL, "https://nova.id/organization/<slug>")
   ↓  écrit dans `organizations.id` ET dans `server_state.organization_id`
démarrages suivants
   ↓  lu dans `server_state` — le slug n'intervient plus
```

| Événement | `organization_id` |
|---|---|
| redémarrage du serveur | inchangé |
| renommage du `display_name` | inchangé |
| **renommage du `slug`** | **inchangé** |
| deux instances distinctes | toujours différents |
| dérivé d'une adresse e-mail | jamais |

Le rattachement instance → organisation passe par `server_state`, pas par le
slug. Sans cela, renommer le slug ferait échouer la recherche et créerait
silencieusement une seconde organisation pour le même établissement — six tests
verrouillent ce comportement.

Pourquoi une graine déterministe plutôt qu'un tirage aléatoire : deux serveurs
déjà déployés pour le même établissement (bascule, reprise après incident,
restauration d'une sauvegarde antérieure) convergent vers le même identifiant
au lieu d'en inventer deux. C'est un mécanisme de **migration**, consulté une
seule fois.

> **Autorité future.** Le Nova Control Plane sera l'autorité de création des
> `organization_id` : il attribuera l'UUID et le fournira au serveur de
> l'organisation. `seed_organization_id()` n'est qu'un amorçage de
> compatibilité pour les instances déployées avant lui, et disparaîtra une fois
> le Control Plane en place.

### OrganizationMembership

Séparé de l'identité, parce qu'une identité n'est pas une permission :

```
organization_id + user_id
member_type      student | teacher | staff | employee | manager | other
security_role    member | organization_admin | it_admin
groups           []
status           active | disabled | deprovisioned
```

### Groups

```
id                identifiant Nova
label             libellé affiché
source            legacy_cohort | microsoft_entra | google_workspace | scim | manual
external_group_id identifiant dans l'annuaire d'origine, ou null
```

La cohorte Campus reste pleinement compatible : elle devient un groupe de
source `legacy_cohort`. `external_group_id` est distinct de `id` — un groupe
renommé côté annuaire garde son identifiant Nova, et deux annuaires peuvent
employer le même identifiant externe.

### SecurityRole

`member | organization_admin | it_admin`.

**Aucun métier ne produit autre chose que `member`.** `security_role_for()`
ignore le métier : les tests le vérifient pour `student`, `teacher`, `staff`,
`partner`, `employee` et `manager`.

Depuis la Phase 22, le rôle est lu dans la colonne `users.security_role`, écrite
par un opérateur et par lui seul — jamais déduite d'un métier, d'un domaine
d'adresse, d'un groupe d'annuaire ou d'une revendication d'IdP. Voir
[`control-plane-admin-auth.md`](./control-plane-admin-auth.md).

---

## 4. `/api/me` — contrat v2, strictement additif

Les trois champs historiques gardent nom, type et place. Le champ
`organization` reste une **chaîne** (le nom d'affichage) : le Desktop déployé le
déclare déjà ainsi, en faire un objet casserait chaque poste installé. Les
données structurées vivent donc dans des champs nouveaux.

```jsonc
{
  // historique — inchangé
  "email": "…", "role": "student", "cohort": "AERO2",
  "organization": "IPSA Paris",

  // v2 — additif
  "contract_version": 2,
  "user_id": "…",
  "organization_id": "…",
  "organization_type": "education",
  "membership": {
    "member_type": "student",
    "security_role": "member",
    "groups": [{ "id": "AERO2", "label": "AERO2",
                 "source": "legacy_cohort", "external_group_id": null }],
    "status": "active"
  },
  "identity": { "provider": "legacy_email_code",
                "has_external_identity": false },
  "capabilities": ["dictation", "rewrite", "…"]
}
```

Le sujet externe n'est **pas** renvoyé : le client n'en a aucun usage, et le
diffuser élargirait la surface pour rien.

### Stratégie de compatibilité — trois serveurs, un seul client

| Serveur | Ce que le Desktop fait |
|---|---|
| **A. antérieur au contrat étendu** | `parseServerIdentity` produit un instantané vide ; la compatibilité Campus s'applique, comportement inchangé |
| **B. contrat étendu (actuel)** | l'identité, l'organisation et les capacités annoncées deviennent autoritatives |
| **C. futur serveur Organization** | les champs supplémentaires inconnus sont ignorés ; le contrat reste lisible |

Ordre de priorité, jamais l'inverse :

```
identité annoncée par le serveur
        ↓
compatibilité Campus (config d'établissement)
        ↓
repli d'affichage dérivé de l'hôte (non faisant autorité)
```

Côté client, `parseServerIdentity()` lit ces ajouts et n'invente rien :

- une réponse ancienne (sans aucun de ces champs) produit un instantané vide,
  pas une erreur — le poste continue de fonctionner ;
- le `securityRole` retenu est celui du serveur, `member` par défaut :
  l'absence d'information ne vaut jamais élévation ;
- une valeur non prévue (`security_role: "super_admin"`) fait rejeter la
  réponse entière plutôt que d'en retenir une partie arbitraire.

Asymétrie assumée : un `organization_type` inconnu est **ignoré** (le reste de
la réponse demeure exploitable, puisqu'un type ne confère rien), là où un
`security_role` inconnu fait **rejeter** la réponse — il pourrait être une
revendication de privilège.

### Capacités : Core contre Organization

Quand `/api/me` fournit une liste `capabilities`, elle devient autoritative
pour les **surfaces d'organisation** — vocabulaire, raccourcis, règles de
formatage, AI Skills, notes d'ingénierie, commandes, contexte d'écran,
inférence distante. Ce que le serveur ne cite pas, il ne le fournit pas.

Les capacités du **Nova Core** (dictée, reformulation, Styles, Styles
personnels, transcription de fichier, personnalisation, repli local) sont
volontairement absentes de cette table de correspondance. Une liste incomplète
— serveur d'une version intermédiaire, champ tronqué, incident — ne doit jamais
pouvoir éteindre la dictée d'un poste étudiant : une information manquante
n'est pas un refus. Un test le verrouille avec une liste vide.

`/api/config` expose en plus `organization_id` (UUID Nova) et
`organization_type`, à côté du slug lisible déjà présent.

---

## 5. Auth Campus héritée

Le login actuel — adresse académique + code à six chiffres — **reste en
production, inchangé**. Il devient conceptuellement
`IdentityProvider = legacy_email_code`, ce qui permettra de migrer les
établissements un par un plutôt que tous à la fois.

Session : jeton opaque `secrets.token_urlsafe(32)`, TTL 30 jours, révocable
(`tokens.active = 0`), limité par sièges et par machines.

---

## 6. Microsoft Entra — état réel et préparation

**Ce qui existe déjà** (audité, non modifié dans sa mécanique) : un flux
OAuth 2.0 Device Code côté serveur, `client_id` détenu par l'établissement
(`NOVA_ENTRA_CLIENT_ID`), autorité `organizations` par défaut, scopes
`openid profile email User.Read`, aucun secret client — ni côté serveur, ni
dans `Nova.exe`.

**Ce que le flux faisait** : échanger le code contre un `access_token`, appeler
Graph `/me`, et n'autoriser que sur le **domaine de l'adresse**. Aucune
revendication n'était lue : ni `tid`, ni `oid`, ni `sub`.

**Ce que cette phase ajoute** :

- lecture des revendications `oid` / `tid` / `sub` de l'`id_token` ;
- enregistrement de l'identité fédérée immuable ;
- vérification **optionnelle** du tenant : si `NOVA_ENTRA_ALLOWED_TENANT_ID` est
  configuré, le `tid` doit correspondre. Non configuré, le comportement
  historique est conservé à l'identique.

**L'identité fédérée enregistrée n'est pas autoritative.** Elle porte un niveau
de garantie explicite, `federated_identities.verification` :

| Niveau | Signification | Produit par |
|---|---|---|
| `transport_only` | revendications lues d'un jeton reçu en TLS serveur-à-serveur, **signature non vérifiée** | Device Code hérité |
| `verified` | signature, émetteur, audience, expiration, `nonce` et tenant vérifiés | **Authorization Code + PKCE** (Phase 15) |

Le Device Code reste `transport_only` : rien ne consulte son identité pour
autoriser, ce qui autorise là reste le domaine de l'adresse et le mapping de
tenant. Le flux PKCE, lui, produit une identité `verified` et le tenant vérifié
décide de l'organisation — voir
[`microsoft-entra-sso.md`](./microsoft-entra-sso.md).

`decode_jwt_claims()` lit la charge utile **sans vérifier la signature**. C'est
légitime ici et seulement ici : le jeton est reçu directement de
`login.microsoftonline.com` par un appel serveur-à-serveur sur TLS, il n'est à
aucun moment fourni par le client. Il ne doit jamais être employé sur un jeton
venant du Desktop ou d'un navigateur — dans ce cas, signature, émetteur,
audience et expiration doivent être vérifiés.

**Le mapping reste explicite** : `tenant externe → organisation Nova`, déclaré
dans la table `organizations`. Il n'existe volontairement aucune fonction qui
rattache une organisation à partir d'un domaine d'adresse — cela donnerait
l'accès d'une organisation à quiconque contrôle une adresse dans ce domaine.

Aucun nouveau bouton Microsoft n'est construit.

---

## 7. Google Workspace et OIDC générique — préparation

Même structure, aucune implémentation :

| | Sujet externe | Tenant |
|---|---|---|
| Google Workspace | `sub` | identifiant client Workspace |
| OIDC générique (Okta, Auth0, Keycloak, Ping) | `sub` | `issuer` |

En OIDC générique, l'unicité d'un `sub` n'est garantie **que dans le périmètre
de son `issuer`** : c'est le couple qui identifie, jamais le `sub` seul.

Aucune déduction n'est faite depuis `@gmail.com` ni `@entreprise.com` — ni pour
choisir une organisation, ni pour accorder un droit. Aucun écran de
configuration n'est créé.

---

## 8. Sécurité d'application native — recommandation

| | Device Code (actuel) | Authorization Code + PKCE (visé) |
|---|---|---|
| Secret client embarqué | non | non |
| Navigateur système | non (l'utilisateur ouvre une URL et saisit un code) | oui |
| Hameçonnage | **sensible** : un code valide saisi sur un vrai écran Microsoft à la demande d'un attaquant suffit | résistant : la redirection revient à l'application |
| Ergonomie | code à recopier | un clic |
| Liaison à la requête | aucune | `state` + `nonce` + `code_verifier` |

**Réalisé en Phase 15** : Authorization Code + PKCE (S256), navigateur système
et redirection en boucle locale, avec validation JWKS complète côté serveur —
voir [`microsoft-entra-sso.md`](./microsoft-entra-sso.md). Device Code est
conservé comme repli ; ce n'est pas un remplacement, les deux coexistent.

Points de vérification obligatoires côté serveur pour tout jeton reçu d'un
client : signature (JWKS), `iss`, `aud`, `exp`, `nonce`, et `tid` rapporté au
mapping de tenant.

---

## 9. Stockage des jetons

**État audité, côté Desktop :**

| | Emplacement | Forme |
|---|---|---|
| Jeton de session | trousseau du système (Windows Credential Manager via `keyring`) | protégé par le système |
| Métadonnées (`server_url`, e-mail) | `campus_session.json` (tauri-store) | JSON en clair |
| Clé du trousseau | — | SHA-256 de `serveur|e-mail` |

- une migration ponctuelle déplace les jetons de l'ancien stockage en clair vers
  le trousseau, puis efface le champ ;
- la déconnexion révoque côté serveur **et** supprime l'entrée du trousseau ;
- aucun jeton n'est journalisé : `campus.rs` ne trace ni le jeton, ni l'en-tête
  `Authorization` ;
- **après désinstallation**, l'entrée du trousseau survit (l'installeur ne la
  nettoie pas) — P2 ci-dessous.

**Côté serveur** : le serveur ne conserve plus que l'**empreinte** du jeton.

```
émission     token = secrets.token_urlsafe(32)   → envoyé au client, jamais stocké
             token_hash = SHA-256(token)         → seule valeur écrite en base
             tokens.token = "h:<empreinte>"      → colonne conservée, sans secret
vérification SHA-256(jeton reçu) → recherche par token_hash
```

Un SHA-256 simple, et non un dérivateur lent (bcrypt, argon2) : ces derniers
protègent des secrets à **faible** entropie contre la force brute. Un jeton
`token_urlsafe(32)` porte 256 bits d'aléa — il n'y a rien à deviner — et le
ralentissement se paierait sur chaque requête authentifiée.

Lire la base ne donne donc plus de session : ni `token`, ni `token_hash` ne
sont acceptés comme identifiants (test dédié).

### Migration des sessions existantes

Aucune session n'est perdue. La base contenait encore les jetons en clair : leur
empreinte est donc calculable immédiatement, ce qui évite tout régime
transitoire — et surtout toute ambiguïté « ce champ contient-il un jeton ou une
empreinte ? ».

```
ALTER TABLE tokens ADD COLUMN token_hash TEXT      (additif)
CREATE UNIQUE INDEX idx_tokens_hash                 (idempotent)
pour chaque ligne encore en clair :
    token_hash = SHA-256(token)
    token      = "h:" || token_hash                 (colonne conservée, vidée de son secret)
```

Un poste connecté avant la migration reste connecté ; un redémarrage
n'invalide rien ; la migration est idempotente.

---

## 10. Journal d'audit d'authentification

Ce qu'un futur journal peut enregistrer :

- identifiant interne (`user_id`), organisation (`organization_id`) ;
- fournisseur d'identité, horodatage ;
- résultat (succès / échec) et **code de raison**
  (`missing_subject`, `email_used_as_subject`, tenant refusé…).

Ce qu'il ne doit jamais enregistrer : jeton d'accès, jeton de rafraîchissement,
code d'autorisation, code e-mail, mot de passe, contenu dicté, prompts IA, texte
sélectionné.

Le code à usage unique n'est imprimé que si `NOVA_ENV=development` est
**explicitement** déclaré. Le défaut est `production` : un déploiement qui
oublie de déclarer son environnement et n'a pas de SMTP échoue bruyamment
(erreur de configuration journalisée, sans le code) plutôt que de divulguer
silencieusement les codes de tous ses utilisateurs.

---

## 11. Exposition du serveur

**Aujourd'hui** : l'adresse du serveur vient de `campus-config.json` déposé par
la DSI ; à défaut, l'utilisateur la saisit, et elle est affichée dans
l'interface (hôte du serveur dans la barre latérale).

**Direction visée** : une découverte d'organisation par le Control Plane —
l'utilisateur désigne son organisation, le Control Plane renvoie sa
configuration et un point d'accès **logique** (nom de domaine géré par Nova),
jamais une adresse IP saisie à la main.

Sans illusion : une URL à laquelle le client doit se connecter n'est pas un
secret, et rien ne peut la rendre telle. L'objectif est de supprimer une friction
d'usage et de réduire la surface d'attaque (pas d'IP interne dans l'interface,
pas de serveur arbitraire saisissable), pas de créer une fausse sécurité.

`campus-config.json` reste pris en charge.

---

## 12. Cycle de vie des comptes

`active | disabled | deprovisioned`. Seul `active` ouvre l'accès : un statut
inconnu ne vaut jamais autorisation (`grants_access`). Le champ booléen
`disabled` du serveur est conservé et reste la colonne que lisent
l'administration et `current_user` ; `status` la reflète et prépare le
déprovisionnement. Aucun mécanisme SCIM n'est construit.

---

## 13. Ce qui n'est pas construit

Bouton Microsoft, login Google, login OIDC, interface OAuth, SCIM, Nova Admin,
Control Plane, écrans Business, AI Learn, moteur de policies, packages,
nouveau parcours d'accueil.
