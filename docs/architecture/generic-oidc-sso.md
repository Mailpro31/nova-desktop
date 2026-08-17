# Generic OIDC SSO

Troisième fournisseur d'identité Organization — et le premier qui ne soit pas
une marque. Il complète [`microsoft-entra-sso.md`](./microsoft-entra-sso.md),
[`google-workspace-sso.md`](./google-workspace-sso.md) et
[`organization-identity.md`](./organization-identity.md).

Implémentation : `nova-server/main.py` § *OIDC générique*,
`src-tauri/src/organization_sso.rs`, `src/lib/organization/ssoProviders.ts`.

---

## 1. Un adaptateur, pas une implémentation par marque

Okta, Keycloak, Auth0, Ping, Zitadel, authentik : tous parlent OpenID Connect.
Nova n'en connaît aucun **nommément**. Il connaît un émetteur, et lui demande le
reste.

Le fournisseur canonique est `oidc` — celui déjà déclaré dans le modèle
d'identité en Phase 13. Aucun second vocabulaire (`generic_oidc`, `custom_oidc`)
n'a été introduit.

| | Microsoft / Google | OIDC générique |
|---|---|---|
| Points de terminaison | connus d'avance | **découverts** |
| Émetteur | déduit du tenant / fixe | **configuré**, vérifié |
| Rattachement | revendication (`tid`, `hd`) | l'émetteur **est** le rattachement |
| Secret | non / oui | selon la méthode déclarée |

Tout le reste — PKCE, `state`, `nonce`, bouclage, validation, cache JWKS,
rattachement de compte, session, `/api/me` — est le moteur partagé, inchangé.

---

## 2. Découverte

```
{issuer}/.well-known/openid-configuration
   → authorization_endpoint
   → token_endpoint
   → jwks_uri
```

Aucune saisie manuelle d'URL n'est demandée à l'exploitant : elle serait à la
fois pénible et une source d'erreurs silencieuses.

Le document est refusé si son `issuer` ne correspond pas **exactement** à celui
configuré, si l'un des trois points de terminaison manque, ou si l'un d'eux
n'est pas en `https`. Cache d'une heure, rechargement contrôlé.

**Les redirections ne sont pas suivies** : une redirection vers une adresse
interne contournerait le contrôle fait avant l'appel.

---

## 3. SSRF — la vraie nouveauté

Un émetteur configurable transforme le serveur en client HTTP dirigé par la
configuration. C'est la seule chose que cet adaptateur ajoute au modèle de
menace, et elle ne se corrige pas après coup.

Politique par défaut, avant toute requête réseau :

| Refusé | Motif |
|---|---|
| `http://`, `file://`, `ftp://` | `scheme_not_https` |
| `https://user:pass@idp…` | `credentials_in_url` |
| requête ou fragment dans l'URL | `not_a_base_url` |
| `127.0.0.1`, `[::1]` | `internal_address` |
| **`169.254.169.254`** (métadonnées cloud) | `internal_address` |
| `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12` | `internal_address` |
| lien-local, réservé, multicast | `internal_address` |
| hôte non résolvable | `unresolvable_host` |

Le nom est résolu et **toutes** ses adresses doivent être acceptables : un nom
qui résout à la fois vers une adresse publique et vers une adresse interne
servirait de pont.

### Mode privé, pour les IdP auto-hébergés

Un Keycloak d'entreprise vit légitimement sur un réseau privé. Le refuser par
principe rendrait Nova inutilisable dans ces contextes.

`NOVA_OIDC_ALLOW_PRIVATE_ISSUER=true` lève la contrainte d'adresse — et
**uniquement** celle-là. C'est une décision d'exploitation, prise côté serveur :
rien dans l'API ne l'expose, donc rien ne permet au poste de la basculer. Un
test vérifie que la chaîne n'apparaît dans aucune réponse publique.

---

## 4. Émetteur

L'émetteur est une **identité de sécurité**, pas une chaîne d'affichage. La
comparaison est exacte — ni `startswith`, ni `contains`, ni comparaison de
domaine. `https://idp.example.com` et `https://idp.example.com.evil.test` n'ont
rien à voir, et un test le verrouille.

---

## 5. Authentification du client

| Méthode | Comportement |
|---|---|
| `none` | client public, PKCE seul — le défaut |
| `client_secret_post` | secret dans le corps de la requête de jeton |
| `client_secret_basic` | secret dans l'en-tête `Authorization` |

Rien d'exotique : `private_key_jwt` et consorts sont refusés avec
`PROVIDER_CONFIG_INVALID` plutôt que silencieusement ignorés.

Quand un secret existe, il vit **côté serveur uniquement** : jamais dans
`Nova.exe`, jamais dans `/api/config`, jamais dans `/api/me`, jamais dans
`/api/auth/providers`, jamais dans les journaux, jamais dans Git. Un test
inspecte les réponses publiques pour s'en assurer.

Nova Desktop reste un client public au sens strict.

---

## 6. PKCE, `state`, `nonce`, bouclage

Strictement le moteur existant. `S256` uniquement — `plain` n'est pas proposé.

Chaque flux porte son fournisseur : un retour OIDC ne peut pas compléter une
tentative Microsoft ou Google, et réciproquement (`STATE_MISMATCH`). Côté poste,
un verrou global n'autorise qu'une tentative à la fois.

Redirection : `http://127.0.0.1:<port éphémère>/callback`, comme les deux
autres.

> **Limite à connaître.** Certains IdP exigent l'enregistrement exact de chaque
> URI de redirection, port compris — ce qui est incompatible avec un port
> éphémère. Le cas n'est pas résolu ici : il faudra soit un port fixe déclaré
> dans la configuration du fournisseur, soit un enregistrement générique côté
> IdP. Le modèle global n'a pas été dégradé pour un fournisseur atypique.

---

## 7. Validation du jeton

Signature JWKS, **`RS256` imposé**, `iss`, `aud`, `exp`, `nbf`, `nonce`, `sub`.

`RS256` seulement : tous les IdP visés le proposent, et élargir l'allowlist sans
tests complets serait un pari déguisé en compatibilité. `none` et les
confusions HMAC/RSA sont testées et refusées.

L'URL des clés vient de la découverte, jamais d'un champ du jeton.

---

## 8. Périmètre d'identité — `issuer` + `sub`

C'est le point le plus important de cette phase, et il a exigé une migration.

Un `sub` n'est unique **que dans le périmètre de son émetteur**. Okta, Keycloak
et Auth0 peuvent parfaitement attribuer `12345` à trois personnes différentes.
Avant cette phase, la clé d'identité était `(provider, external_subject)` : deux
IdP OIDC s'y seraient écrasés l'un l'autre.

```
federated_identities
  PRIMARY KEY (provider, external_issuer, external_subject)
```

`external_issuer` vaut `''` chez Microsoft et Google, dont le fournisseur suffit
à cadrer le sujet — leur clé est donc inchangée en pratique.

### Migration

SQLite ne sait pas modifier une clé primaire : la table est reconstruite et
**toutes** les lignes recopiées, avec un émetteur vide pour l'existant.
Idempotente (conditionnée à l'absence de la colonne), et vérifiée par un test
sur une base d'avant la phase — aucune identité perdue, `verification` et
`external_tenant_id` intacts.

---

## 9. Rattachement à une organisation

Pas de devinette de tenant. La **configuration OIDC appartient à une
organisation** : c'est l'émetteur vérifié qui la désigne, via
`organizations.oidc_issuer`.

```
émetteur vérifié → organizations.oidc_issuer → organization_id Nova
```

Jamais depuis une adresse, un nom d'hôte ou une revendication arbitraire.

### Contrainte de revendication facultative

`NOVA_OIDC_REQUIRED_CLAIM` / `..._VALUE` compare **exactement** une revendication
supplémentaire (`department = Engineering`, par exemple). Ni expression, ni
moteur de règles : une égalité, ou rien. C'est délibérément minimal — un moteur
de policy est un autre sujet.

---

## 10. Ce que l'OIDC ne décide pas

Un jeton portant `role=admin`, `groups=["admins"]` ou `is_superuser=true`
n'obtient **rien de plus** : le rôle de sécurité reste décidé par Nova. Testé
explicitement.

Les revendications `groups` ne deviennent pas des groupes Nova. La
synchronisation d'annuaire viendra avec SCIM, pas ici.

L'adresse reste un attribut secondaire : elle ne lie jamais deux identités OIDC
entre elles, ni une identité OIDC à une identité Microsoft ou Google.

---

## 11. Libellé du fournisseur

« Continue with OIDC » ne dit rien à personne. `NOVA_OIDC_DISPLAY_NAME` permet
« Okta », « Company SSO », « IPSA SSO ». C'est de l'**affichage** : le libellé
n'entre dans aucune décision de sécurité, et le poste retombe proprement sur
« Company SSO » si le serveur l'omet.

---

## 12. Interface

Aucun écran nouveau. Les boutons apparaissent selon ce que le serveur annonce :

```
[ Continue with Microsoft ]
[ Continue with Google ]
[ Continue with Company SSO ]
```

En édition Personal, aucun. Sans configuration valide, aucun bouton OIDC — le
poste n'invente rien.

---

## 13. Erreurs

Trois codes ajoutés, parce que les génériques ne les couvraient pas :
`PROVIDER_CONFIG_INVALID`, `OIDC_DISCOVERY_FAILED`, `OIDC_ISSUER_MISMATCH`.
Tout le reste réutilise le modèle existant.

---

## 14. Dettes assumées

**Plusieurs IdP par organisation.** Le registre est aujourd'hui global au
serveur : une seule configuration OIDC par instance. Le modèle de données le
supporte déjà (l'émetteur fait partie de la clé d'identité, et deux émetteurs
coexistent en base — testé), mais la **configuration** devra devenir une table
`organization_provider_configs` avec un `provider_instance_id` propre. C'est le
sujet du Control Plane, pas de cette phase.

**État de flux en mémoire.** `SSO_FLOWS` vit dans le processus : une connexion
en cours ne survit ni à un redémarrage, ni à un routage vers un autre worker.
Avant tout déploiement horizontal, il faudra un stockage éphémère partagé
(Redis ou table dédiée) pour l'état PKCE/`state`/`nonce`. Aucune dépendance
n'a été ajoutée ici.

**Caches JWKS et métadonnées en mémoire.** Acceptable — ils se reconstruisent
seuls. Ils multiplient simplement les appels au démarrage de chaque worker.

---

## 15. REAL OIDC VALIDATION

| | |
|---|---|
| **Date** | 17 août 2026 |
| **IdP réel** | **aucun** |
| **AUTOMATED OIDC VALIDATED** | ✅ 41 tests serveur + 7 tests poste |
| **REAL OIDC NOT TESTED** | ❌ aucun Okta, Keycloak ou Auth0 disponible |

Aucun IdP réel n'a été contacté et aucun succès n'a été simulé. Aucun service
externe n'a été démarré pour fabriquer une preuve — la phase l'interdisait, et
c'était la bonne consigne.

La recette réelle, le jour venu : déclarer un émetteur, un identifiant client et
une méthode d'authentification, vérifier `GET /api/auth/providers`, puis suivre
le même parcours que Microsoft — connexion, `/api/me`, redémarrage, déconnexion,
reconnexion.
