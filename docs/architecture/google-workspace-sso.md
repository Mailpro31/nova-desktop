# Google Workspace SSO

Second fournisseur d'identité Organization. Il complète
[`microsoft-entra-sso.md`](./microsoft-entra-sso.md) et
[`organization-identity.md`](./organization-identity.md).

Implémentation : `src-tauri/src/organization_sso.rs` (poste),
`nova-server/main.py` § _SSO Organization : PKCE_ (autorité),
`src/lib/organization/ssoProviders.ts` (affichage).

---

## 1. Un moteur, deux adaptateurs

Google **n'a pas** sa propre architecture d'authentification. Microsoft et
Google partagent le même flux — Authorization Code + PKCE S256, navigateur
système, retour en bouclage, échange par le serveur, session Nova opaque — et
les mêmes garanties.

Ce qui les distingue tient en une entrée de table :

|                      | Microsoft Entra                                   | Google Workspace                       |
| -------------------- | ------------------------------------------------- | -------------------------------------- |
| Point d'autorisation | `login.microsoftonline.com/organizations/…`       | `accounts.google.com/o/oauth2/v2/auth` |
| Point de jeton       | `login.microsoftonline.com/organizations/…/token` | `oauth2.googleapis.com/token`          |
| Émetteur attendu     | `…/{tid}/v2.0` (dépend du tenant)                 | `https://accounts.google.com` (fixe)   |
| Clés publiques       | `…/{tid}/discovery/v2.0/keys`                     | `googleapis.com/oauth2/v3/certs`       |
| Sujet immuable       | `oid`                                             | `sub`                                  |
| Rattachement         | `tid` → `entra_tenant_id`                         | `hd` → `google_hosted_domain`          |
| Secret à l'échange   | **non**                                           | **oui** (voir § 3)                     |

Tout le reste — état des tentatives, validation cryptographique, cache JWKS,
rattachement de compte, émission de session, `/api/me` — n'a été écrit qu'une
fois. **Ajouter un OIDC générique reviendra à ajouter une entrée**, pas un
troisième moteur.

Côté poste, la différence se réduit à un identifiant de fournisseur et aux deux
routes correspondantes.

---

## 2. Le flux

Identique à Microsoft, à l'adaptateur près :

```
Nova Desktop
  ├─ génère code_verifier, code_challenge (S256), state, nonce
  ├─ écouteur sur 127.0.0.1:<port éphémère>
  ├─ POST /api/auth/sso/google_workspace/start
  ├─ ajoute son state, ouvre le NAVIGATEUR SYSTÈME
  │     Google → l'utilisateur s'authentifie
  ├─ retour sur 127.0.0.1:<port>/callback, state vérifié
  └─ POST /api/auth/sso/google_workspace/exchange
        │  Serveur Nova (AUTORITÉ)
        ├─ échange le code auprès de Google
        ├─ valide l'id_token : JWKS, RS256, iss, aud, exp, nonce, sub
        ├─ hd vérifié → organisation Nova (mapping EXPLICITE)
        ├─ retrouve / rattache / crée le membre
        └─ émet une session Nova opaque
```

Le poste ne dit jamais « je suis l'utilisateur Google X dans l'organisation Y,
fais-moi confiance » : le serveur redeem le code lui-même et obtient la preuve
directement de Google. Aucun jeton Google ne transite par le poste.

---

## 3. Le secret client Google — ce qu'il est vraiment

Google émet un `client_secret` pour ses clients de type **Desktop** et l'exige
dans la requête d'échange, tout en documentant qu'une application installée
« ne peut pas garder de secret ».

Ce n'est donc **pas** un secret au sens cryptographique : c'est un identifiant
public que le protocole réclame. Le dire autrement serait se mentir.

Ce qui compte est où il vit : **côté serveur uniquement**, parce que c'est le
serveur qui échange le code. `Nova.exe` n'en contient aucune trace, et le poste
n'en a jamais connaissance. Nova Desktop reste un client public au sens strict —
et cette propriété découle de la décision d'architecture prise pour Microsoft,
pas d'un aménagement pour Google.

Ce qui prouve réellement l'origine de la demande reste le `code_verifier` PKCE.

---

## 4. Rattachement à une organisation

```
hd vérifié → table organizations (google_hosted_domain) → organization_id Nova
```

`hd` est le **domaine hébergé** du Workspace, présent dans l'`id_token` validé
et donc digne de confiance une fois la signature vérifiée.

Sa limite, énoncée franchement : ce n'est pas un identifiant client immuable.
L'identifiant de client Google n'est lisible que via l'Admin SDK, ce qui
exigerait des portées d'administration que cette phase refuse. Un domaine peut
en théorie changer de main.

Ce qui rend le mécanisme sûr malgré cela : le rattachement est **déclaré par un
administrateur** dans la table, jamais déduit. Un domaine absent de la table
n'ouvre rien. Et comme pour Microsoft, un second contrôle vérifie que
l'organisation trouvée est bien celle que cette instance sert.

### Comptes Google personnels

Un compte `@gmail.com` **ne porte aucun `hd`**. Il ne correspond donc à aucune
organisation et reçoit `TENANT_NOT_ALLOWED`. Aucune organisation n'est créée
automatiquement depuis un compte personnel — un test le verrouille.

---

## 5. Validation du jeton d'identité

| Contrôle     | Détail                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Signature    | JWKS Google, via PyJWT + `cryptography`                                 |
| Algorithme   | **imposé** `RS256` — `none` et les confusions HMAC/RSA sont testées     |
| Émetteur     | `https://accounts.google.com`, comparaison exacte                       |
| Audience     | `client_id` de l'application                                            |
| Expiration   | `exp`, tolérance d'horloge 120 s                                        |
| `nonce`      | égal à celui de la tentative                                            |
| Sujet        | `sub` présent — unique parmi tous les comptes Google, jamais réattribué |
| Rattachement | `hd` rapproché du mapping                                               |

L'URL des clés vient de la **configuration du fournisseur**, jamais d'un champ
du jeton : un en-tête `jku` hostile ne joue aucun rôle. Cache d'une heure,
rechargement contrôlé sur `kid` inconnu — le même mécanisme que Microsoft,
partagé.

L'adresse reste un attribut de profil. **Jamais une clé.**

---

## 6. Identité multi-fournisseur

Un même compte Nova peut porter deux identités fédérées — une Microsoft, une
Google — mais **jamais par fusion automatique** :

- `(microsoft_entra, X)` et `(google_workspace, X)` restent **deux identités
  distinctes**, même si le sujet est identique : rien ne garantit qu'un `sub`
  Google et un `oid` Microsoft identiques désignent la même personne ;
- une adresse commune ne fusionne rien non plus. Le rattachement d'un compte
  existant n'a lieu que si l'organisation **et** l'adresse concordent dans un
  annuaire que l'organisation contrôle, et le conflit n'est levé qu'à
  l'intérieur d'un même fournisseur (`IDENTITY_CONFLICT`).

Deux tests couvrent exactement ces deux pièges.

---

## 7. Isolation des tentatives

Chaque flux porte son fournisseur. Un retour Google ne peut pas satisfaire une
tentative Microsoft, ni l'inverse : l'échange refuse avec `STATE_MISMATCH`.
Côté poste, un verrou global n'autorise qu'une tentative à la fois, donc aucun
retour de navigateur ne peut atterrir sur l'écouteur de l'autre.

---

## 8. Ce que Google ne décide pas

S'authentifier chez Google établit **l'identité**, rien d'autre. Le
`memberType`, le `securityRole`, les groupes et les capacités viennent de Nova.
Aucun compte Google ne peut obtenir `organization_admin` ou `it_admin`, et un
`organization_id` ou un `security_role` envoyé dans la requête est ignoré —
testé.

Aucun groupe Google n'est synchronisé : pas d'Admin SDK, pas de Directory API,
donc **aucun consentement administrateur** pour se connecter.

---

## 9. Portées demandées

```
openid  email  profile
```

Rien d'autre. Ni Gmail, ni Drive, ni Calendar, ni Admin SDK. La synchronisation
de groupes viendra plus tard, avec ses propres portées et sa propre décision.

---

## 10. Configuration Google Cloud — étapes manuelles

Non exécutées : elles demandent un compte Google et un projet Cloud réels.

1. **Google Cloud Console → APIs & Services → OAuth consent screen**
   - type **Internal** si le Workspace est le seul public visé (aucune
     validation Google requise), **External** sinon ;
   - portées : `openid`, `email`, `profile` uniquement ;
   - en mode **Testing**, seuls les _test users_ déclarés peuvent se connecter,
     et les jetons de rafraîchissement expirent en 7 jours. Passer en
     **Production** lève ces limites ; avec des portées non sensibles comme les
     nôtres, aucune revue Google n'est nécessaire ;
2. **Credentials → Create credentials → OAuth client ID**
   - type d'application : **Desktop app** ;
   - pour ce type, Google accepte les adresses de bouclage sans les enregistrer
     une par une : `http://127.0.0.1:<port>` est admis avec un port dynamique ;
3. Relever le **Client ID** et le **Client secret** (voir § 3 sur sa nature) ;
4. Côté serveur Nova, dans `.env` (jamais versionné) :
   ```
   NOVA_GOOGLE_CLIENT_ID=<client ID>
   NOVA_GOOGLE_CLIENT_SECRET=<client secret>
   NOVA_GOOGLE_ALLOWED_HOSTED_DOMAIN=<domaine Workspace de l'organisation>
   ```
   Le troisième alimente `organizations.google_hosted_domain` au démarrage :
   c'est le mapping explicite. Sans lui, Google reste annoncé indisponible.
5. Vérifier `GET /api/auth/providers` → `google_workspace` présent.

Un **seul** client Google Nova peut servir plusieurs organisations : le
rattachement se fait par `hd` côté serveur, pas par application Google. Aucune
architecture ne réclame une app Google par entreprise.

---

## 11. Interface

Aucun écran nouveau. Sous le formulaire d'établissement :

```
[ Continue with Microsoft ]     si le serveur l'annonce
[ Continue with Google ]        si le serveur l'annonce
```

Le poste n'invente rien : `organizationSignInOptions()` ne propose que ce que
`/api/auth/providers` annonce, et le code par adresse reste toujours
disponible. En édition Personal, aucun bouton d'organisation n'apparaît.

Le bouton Google est **textuel**. Aucun logo n'est dessiné : les règles de
marque Google imposent l'usage d'un asset officiel, et en inventer un
ressemblant serait à la fois faux et contraire à ces règles. Un bouton sobre
vaut mieux qu'une imitation.

---

## 12. Erreurs

Aucun code propre à Google : le modèle existant suffit — `AUTH_CANCELLED`,
`AUTH_TIMEOUT`, `STATE_MISMATCH`, `TOKEN_EXCHANGE_FAILED`, `ID_TOKEN_INVALID`,
`TENANT_NOT_ALLOWED`, `ORGANIZATION_MISMATCH`, `IDENTITY_CONFLICT`,
`ACCOUNT_DISABLED`, `MEMBERSHIP_NOT_FOUND`, `NETWORK_ERROR`,
`PROVIDER_NOT_CONFIGURED`, plus `PROVIDER_UNKNOWN`.

L'utilisateur reçoit une phrase, jamais un code, et les détails OAuth de Google
(`invalid_grant`, code expiré, code réutilisé) ne sont pas renvoyés au poste.

---

## 13. Prêt pour l'OIDC générique

Le registre `PROVIDERS` porte exactement ce dont un IdP OIDC a besoin : point
d'autorisation, point de jeton, émetteur, JWKS, revendication de sujet,
revendication de rattachement, portées, présence d'un secret. Ajouter Okta,
Auth0, Keycloak ou Ping consistera à décrire ces valeurs — pas à recopier
Google.

Ce qui manque encore, volontairement : une configuration **par organisation**
(aujourd'hui le registre est global au serveur) et la découverte automatique via
`.well-known/openid-configuration`. C'est le sujet de la phase suivante, pas de
celle-ci.

---

## 14. REAL GOOGLE VALIDATION

|                                     |              |
| ----------------------------------- | ------------ |
| **Date**                            | 17 août 2026 |
| **Google Cloud project**            | **aucun**    |
| **REAL GOOGLE OIDC VALIDATED**      | ❌ non       |
| **REAL GOOGLE WORKSPACE VALIDATED** | ❌ non       |

Aucun projet Google Cloud, aucun client OAuth et aucun domaine Workspace ne sont
configurés. Rien n'a été simulé : le fournisseur est annoncé indisponible tant
que l'identifiant d'application, le secret et le rattachement de domaine ne sont
pas renseignés — c'est l'état actuel.

Ce qui est prouvé sans Google : 30 tests serveur et 4 tests poste couvrent la
validation cryptographique, le rattachement Workspace, le refus des comptes
personnels, l'isolation entre fournisseurs et l'absence de fusion d'identités.
Cela prouve la logique, pas l'accord avec le service réel.

La recette réelle est celle du § 10, suivie du même parcours que Microsoft :
connexion, `/api/me`, redémarrage, déconnexion, reconnexion.
