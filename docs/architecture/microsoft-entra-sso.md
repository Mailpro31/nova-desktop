# Microsoft Entra SSO — Authorization Code + PKCE

Premier flux d'authentification Organization moderne de Nova. Il complète
[`organization-identity.md`](./organization-identity.md), qui définit le modèle
d'identité, et ne remplace ni le code par adresse, ni le Device Code.

Implémentation : `src-tauri/src/entra_pkce.rs` (poste),
`nova-server/main.py` § *SSO Entra : PKCE* (autorité),
`src/lib/organization/ssoErrors.ts` (libellés).

---

## 1. Le flux, de bout en bout

```
Nova Desktop
  ├─ génère code_verifier, code_challenge (S256), state, nonce
  ├─ ouvre un écouteur sur 127.0.0.1:<port éphémère>
  ├─ POST /api/auth/entra/pkce/start  {code_challenge, nonce, redirect_uri}
  │     └─ le serveur retient le nonce attendu, renvoie l'URL d'autorisation
  ├─ ajoute son state à l'URL, ouvre le NAVIGATEUR SYSTÈME
  │
  │   Microsoft Entra /authorize → l'utilisateur s'authentifie (MFA compris)
  │
  ├─ retour sur 127.0.0.1:<port>/callback?code=…&state=…
  ├─ vérifie le state, ferme l'écouteur
  └─ POST /api/auth/entra/pkce/exchange  {flow_id, code, code_verifier}
        │
        Serveur Nova (AUTORITÉ)
        ├─ échange le code auprès de Microsoft (client public, sans secret)
        ├─ valide l'id_token : signature JWKS, alg, iss, aud, exp, nbf, nonce
        ├─ tid vérifié → organisation Nova (mapping EXPLICITE)
        ├─ retrouve / rattache / crée le membre
        ├─ vérifie le statut du compte
        └─ émet une session Nova opaque
              ↓
Desktop : trousseau système → GET /api/me → OrganizationContext
```

### Qui prouve quoi

Le poste **ne prouve rien**. Il ne dit jamais au serveur « fais-moi confiance,
tid=X, oid=Y » : le serveur redeem le code lui-même et obtient la preuve
directement de Microsoft. Un poste modifié peut au pire tenter une connexion,
jamais en fabriquer une.

Conséquence : **aucun jeton Microsoft ne transite par le poste.** Il n'y a donc
rien à effacer côté client, et aucun jeton de rafraîchissement Microsoft n'est
conservé nulle part — Microsoft prouve l'identité, son rôle s'arrête là, et
Nova gère ensuite son propre cycle de session.

---

## 2. Client public — aucun secret

Nova Desktop est un client public OAuth 2.0 : **aucun `client_secret`** dans
`Nova.exe`, dans un fichier de configuration, ni sur le chemin du serveur vers
Microsoft. Un test vérifie que la requête d'échange ne contient pas ce champ.

Ce qui prouve qu'un code d'autorisation revient bien à celui qui l'a demandé,
c'est le `code_verifier` — un secret créé pour l'occasion, jamais persisté.

L'identifiant d'application (`client_id`) est public par nature et se configure
normalement, côté serveur.

---

## 3. PKCE

| | |
|---|---|
| `code_verifier` | 32 octets d'aléa cryptographique → 43 caractères base64url |
| `code_challenge` | `BASE64URL(SHA256(verifier))` |
| `code_challenge_method` | `S256` — jamais `plain` |

Le vérificateur vit dans une variable de fonction et meurt avec elle : succès,
échec ou délai dépassé. Il n'est ni écrit sur disque, ni journalisé, ni transmis
ailleurs qu'au serveur de l'établissement au moment de l'échange.

Le calcul est verrouillé par le **vecteur de test de la RFC 7636, annexe B** :
une divergence produirait un rejet Microsoft que rien d'autre ne signalerait.

## 4. `state`

Aléatoire (24 octets), propre à la tentative, **détenu par le poste** — c'est sa
protection, pas celle du serveur. Vérifié au retour **avant** d'exploiter le
code : un retour qui ne correspond pas à la tentative en cours n'a rien à faire
là, même s'il porte un code valide.

Usage unique : l'écouteur se ferme dès qu'une réponse est produite, et le flux
serveur est retiré de la table dès l'échange.

## 5. `nonce`

Aléatoire, généré par le poste, transmis au serveur au démarrage puis à
Microsoft dans l'URL d'autorisation. Le serveur le confronte au `nonce` du jeton
d'identité validé. Il lie ce jeton à **cette** tentative : sans lui, un jeton
valide capté ailleurs pourrait être rejoué.

---

## 6. Redirection de bouclage

`http://127.0.0.1:<port éphémère>/callback`

- **`127.0.0.1`, jamais `0.0.0.0`** : le retour vient du navigateur de cette
  machine et de nulle part ailleurs. Un écouteur exposé au réseau local
  permettrait à un voisin d'y déposer un code ;
- `localhost` est refusé côté serveur — il dépend d'une résolution de noms que
  l'on ne maîtrise pas ; seules les adresses littérales sont acceptées ;
- port choisi par le système, ouvert **uniquement** pendant la connexion, fermé
  au retour comme au délai dépassé (5 minutes) ;
- analyse volontairement étroite : première ligne de requête, trois paramètres
  (`code`, `state`, `error`). Tout ce qu'un serveur accepte en plus est une
  surface offerte ;
- le serveur vérifie lui aussi que la redirection est bien une adresse de
  bouclage, au démarrage **et** à l'échange.

### Page de retour

> Authentication complete. You can return to Nova.

Ni jeton, ni code, ni adresse, ni tenant. La page est vue par le navigateur,
conservée dans son historique et parfois lue par une extension : elle ne dit
rien d'autre que « c'est terminé ». Un test le vérifie.

---

## 7. Validation du jeton d'identité — le P1 refermé

Tout est vérifié avant que quoi que ce soit ne devienne autoritatif :

| Contrôle | Détail |
|---|---|
| Signature | JWKS du tenant, via PyJWT + `cryptography` |
| Algorithme | **imposé** `RS256` — accepter celui annoncé par le jeton laisserait passer `none` et les confusions HMAC/RSA |
| Émetteur | `https://login.microsoftonline.com/{tid}/v2.0` |
| Audience | `client_id` de l'application |
| Expiration | `exp`, tolérance d'horloge 120 s |
| Entrée en vigueur | `nbf` |
| `nonce` | égal à celui de la tentative |
| Tenant | `tid` présent, rapproché du mapping |
| Sujet | `oid` présent |

**JWKS** : l'URL est dérivée du **tenant**, jamais d'un champ du jeton — un
en-tête `jku` fourni par un attaquant ne joue aucun rôle. Cache d'une heure par
tenant ; un `kid` inconnu déclenche **un** rechargement contrôlé, parce qu'une
clé inconnue est le plus souvent une rotation, pas une attaque.

La bibliothèque fait le travail cryptographique : aucun analyseur JWT maison.

---

## 8. Autorité et stratégie de tenant

Point d'entrée : `https://login.microsoftonline.com/organizations/oauth2/v2.0`.

- **`organizations`** et non `common` : comptes professionnels et scolaires
  uniquement. Nova Organization n'a pas de sens pour un compte Microsoft
  personnel, et l'accepter au point d'entrée n'ajouterait qu'un chemin d'erreur ;
- et non un point d'entrée dédié à un tenant : Nova doit pouvoir servir
  plusieurs établissements. **Le point d'entrée ne fait entrer personne — le
  mapping, si.**

```
tid vérifié → table organizations (colonne entra_tenant_id) → organization_id Nova
```

Deux contrôles successifs :

1. tenant inconnu de Nova → `TENANT_NOT_ALLOWED` ;
2. tenant connu mais rattaché à **une autre** organisation → `TENANT_NOT_ALLOWED`
   également. Cette instance sert une organisation ; sans ce second contrôle,
   un annuaire voisin déclaré sur le même Control Plane entrerait chez cet
   établissement.

Aucune organisation n'est créée automatiquement depuis le poste, et il n'existe
**aucune** fonction rattachant une organisation à partir d'un domaine
d'adresse — cela donnerait son accès à quiconque contrôle une adresse dans ce
domaine.

---

## 9. Identité fédérée : `verified`

| Flux | Niveau |
|---|---|
| Device Code hérité | `transport_only` — signature jamais vérifiée |
| **Authorization Code + PKCE** | **`verified`** — signature, émetteur, audience, expiration, nonce et tenant vérifiés |

Le sujet externe retenu est `oid` : il identifie l'objet utilisateur dans le
tenant et survit à un changement de nom ou d'adresse, là où `sub` ne serait
stable que par couple (application, utilisateur).

L'adresse reste un attribut de profil. Jamais une clé.

---

## 10. Rattachement de compte

Trois cas, dans cet ordre :

1. **identité fédérée connue** → on retrouve le compte par `(provider, oid)`.
   Le seul chemin qui ne repose sur aucune adresse ; il fonctionne encore après
   un changement d'adresse côté Microsoft ;
2. **compte historique correspondant** → rattachement **contrôlé**, seulement
   si le tenant est vérifié, que l'organisation correspond, que l'adresse
   correspond et qu'aucune autre identité fédérée n'occupe déjà ce compte
   (sinon `IDENTITY_CONFLICT`). Une correspondance d'adresse seule ne suffit
   jamais — c'est précisément la déduction qui permettrait à un tenant voisin de
   s'approprier un compte ;
3. **nouveau membre autorisé** → création selon la politique d'admission
   actuelle, la même que pour le code par adresse.

Un compte d'une autre organisation n'est jamais repris : `ORGANIZATION_MISMATCH`.
Un compte suspendu ou retiré ne se connecte pas : `ACCOUNT_DISABLED`.

### Ce que le SSO ne donne pas

S'authentifier chez Microsoft établit **l'identité**, rien d'autre. Le
`memberType`, le `securityRole`, les groupes et les capacités viennent de Nova.
Un utilisateur dont le jeton porte `roles: ["GlobalAdministrator"]` ou
`jobTitle: "Manager"` reste `member` — un test le vérifie explicitement.

Aucun groupe Microsoft n'est demandé à cette étape : pas de scope Graph, donc
pas de consentement administrateur pour se connecter. Les cohortes et
appartenances actuelles continuent de s'appliquer.

---

## 11. Session et stockage

Le serveur émet une session Nova **opaque**, hachée en base (voir
`organization-identity.md` § 9). Le poste ne conserve durablement que cette
session, dans le trousseau du système (Windows Credential Manager).

## 12. Annulation, délai, concurrence

| Situation | Comportement |
|---|---|
| Navigateur fermé, consentement refusé | `AUTH_CANCELLED`, aucun message affiché |
| Aucun retour en 5 minutes | `AUTH_TIMEOUT`, écouteur fermé |
| Deuxième tentative pendant la première | `AUTH_ALREADY_IN_PROGRESS` |
| Retour tardif ou d'une autre tentative | `STATE_MISMATCH` |
| Rejeu d'un flux déjà consommé | `AUTH_TIMEOUT` (flux à usage unique) |
| Deux instances de Nova | ports et `state` distincts — un retour n'authentifie jamais l'autre |

Une seule tentative active par poste, garantie par un verrou libéré même en cas
de panique ou de retour anticipé. Pas de flux zombie : les tentatives expirées
sont purgées côté serveur à chaque démarrage de flux.

---

## 13. Modèle d'erreurs

Codes stables côté poste (`AUTH_CANCELLED`, `AUTH_TIMEOUT`, `STATE_MISMATCH`,
`LOOPBACK_UNAVAILABLE`, `NETWORK_ERROR`, `AUTH_ALREADY_IN_PROGRESS`) et côté
serveur (`PROVIDER_NOT_CONFIGURED`, `REDIRECT_URI_INVALID`, `PKCE_INVALID`,
`TOKEN_EXCHANGE_FAILED`, `ID_TOKEN_INVALID`, `TENANT_NOT_ALLOWED`,
`ORGANIZATION_MISMATCH`, `IDENTITY_CONFLICT`, `ACCOUNT_DISABLED`,
`MEMBERSHIP_NOT_FOUND`, `JWKS_UNAVAILABLE`).

L'utilisateur reçoit une phrase, jamais un code : « ce compte Microsoft ne fait
pas partie de votre établissement » lui dit quoi faire, `TENANT_NOT_ALLOWED`
non. Une annulation ne produit aucun message. Trois tests vérifient qu'aucun
message n'expose tenant, jeton, adresse de bouclage, `nonce` ou vocabulaire
OAuth.

Le détail Microsoft (`invalid_grant`, code expiré, code déjà utilisé) n'est pas
renvoyé au poste : il ne changerait pas sa conduite et décrirait l'état d'un
secret.

## 14. Journalisation

Enregistré : fournisseur, résultat, code de raison, identifiant d'organisation
après résolution, horodatage, huit premiers caractères de l'identifiant de flux.

Jamais enregistré : code d'autorisation, `code_verifier`, `state`, `nonce`,
jetons Microsoft, session Nova, jeton brut.

---

## 15. Cohabitation

| Fournisseur | Statut |
|---|---|
| `microsoft_entra` (PKCE) | **chemin principal** dès que l'établissement l'a configuré |
| Device Code | **hérité / repli** — conservé, plus jamais principal ; aucune architecture nouvelle ne s'appuie dessus |
| `legacy_email_code` | conservé, sans aucune régression |

Le poste ne décide pas seul quoi proposer : `GET /api/auth/entra/pkce/available`
dit ce que le serveur sait faire, et n'annonce Microsoft que si l'identifiant
d'application **et** le rattachement de tenant sont configurés. Un serveur plus
ancien ne connaît pas cette route : le code par adresse reste alors le seul
chemin, exactement comme aujourd'hui. Aucun bouton Microsoft inopérant ne peut
donc s'afficher.

L'utilisateur ne voit ni adresse de serveur, ni tenant, ni identifiant
d'application, ni le mot « OAuth » ou « PKCE ». Un seul bouton — *Continue with
Microsoft* — derrière lequel le flux moderne ou le Device Code s'exécute selon
la configuration.

---

## 16. Enregistrement d'application Entra — étapes manuelles

Ces étapes se font dans le portail Entra et **n'ont pas été exécutées** : elles
demandent un tenant réel.

1. **Entra ID → App registrations → New registration**
   - nom : `Nova Desktop` ;
   - *Supported account types* : **Accounts in any organizational directory
     (Any Microsoft Entra ID tenant – Multitenant)** — cohérent avec l'autorité
     `organizations` et le multi-tenant Nova. **Pas** de comptes personnels ;
2. **Authentication → Add a platform → Mobile and desktop applications**
   - *Allow public client flows* : **Oui** ;
   - URI de redirection : **`http://127.0.0.1/callback`** — voir l'encadré
     ci-dessous, le chemin n'est pas optionnel ;
   - facultatif, par prudence : ajouter aussi `http://localhost/callback`.

> ### ⚠️ Enregistrer l'adresse de bouclage correctement
>
> Deux règles Microsoft rendent cette étape moins évidente qu'elle n'en a
> l'air. Les ignorer produit un `AADSTS50011: The reply URL specified in the
> request does not match the reply URLs configured for the application` à la
> première connexion réelle — et rien avant.
>
> **1. Seul le *port* est ignoré lors de la comparaison.** Pour une adresse de
> bouclage, Entra compare le schéma, l'hôte et **le chemin** à l'identique ; il
> n'ignore que le port, précisément pour permettre les ports éphémères. Nova
> émet `http://127.0.0.1:<port>/callback` : l'enregistrement doit donc porter
> `http://127.0.0.1/callback`, **chemin compris**. Un enregistrement réduit à
> `http://127.0.0.1` ne correspondrait pas. La comparaison du chemin est
> **sensible à la casse**.
>
> **2. Le portail refuse les adresses de bouclage en `http`.** Le champ
> *Redirect URIs* rejette le schéma `http` sur `127.0.0.1`. Il faut passer par
> **Manage → Manifest** et ajouter l'entrée dans `replyUrlsWithType` :
>
> ```jsonc
> "replyUrlsWithType": [
>   { "url": "http://127.0.0.1/callback", "type": "InstalledClient" }
> ]
> ```
>
> **Pourquoi `127.0.0.1` et pas `localhost`** : la RFC 8252 et Microsoft
> recommandent tous deux l'adresse littérale, qui ne dépend d'aucune résolution
> de noms — donc ni d'un fichier `hosts` modifié, ni d'une interface renommée.
> La documentation Microsoft formule toutefois la règle du port ignoré en
> parlant de « localhost ». Si une première tentative réelle échouait malgré un
> enregistrement correct, ajouter `http://localhost/callback` au manifeste est
> le repli à essayer — et il faudrait alors assouplir `is_loopback_redirect()`
> côté serveur, qui n'accepte aujourd'hui que l'adresse littérale.
>
> **Ce point n'a pas été vérifié contre un tenant réel** : il vient de la
> documentation officielle, pas d'une observation.
3. **API permissions** : `openid`, `profile`, `email` (déléguées, consentement
   utilisateur). **Aucune** permission Graph, donc aucun consentement
   administrateur requis pour se connecter ;
4. **Ne pas créer de secret client.**
5. Relever l'**Application (client) ID** et le **Directory (tenant) ID**.
6. Côté serveur Nova, dans `.env` (jamais versionné) :
   ```
   NOVA_ENTRA_CLIENT_ID=<application (client) ID>
   NOVA_ENTRA_ALLOWED_TENANT_ID=<directory (tenant) ID>
   ```
   Le second alimente `organizations.entra_tenant_id` au démarrage : c'est le
   mapping explicite tenant → organisation. Sans lui, le SSO moderne reste
   annoncé indisponible, même avec un identifiant d'application valide.
7. Redémarrer le serveur, puis vérifier
   `GET /api/auth/entra/pkce/available` → `{"available": true}`.

> **Note d'exploitation.** `NOVA_ENV` vaut `production` par défaut. Sur un poste
> de développement sans SMTP, le code par adresse échoue alors volontairement
> plutôt que d'imprimer le code dans les journaux : déclarer
> `NOVA_ENV=development` pour retrouver ce repli pendant la recette.

### Recette manuelle

App registration → client ID → redirect URI → type de comptes → client public →
mapping de tenant côté serveur → lancer Nova → *Continue with Microsoft* → MFA
éventuel → retour automatique → `/api/me` → redémarrer Nova et vérifier que la
session tient.

---

## 17. Modèle de menace — ce qui est couvert, ce qui ne l'est pas

| Menace | Réponse |
|---|---|
| Interception du code d'autorisation | PKCE S256 : le code est inutilisable sans le vérificateur |
| Injection d'un code d'une autre session | `state` vérifié avant exploitation |
| Rejeu d'un jeton d'identité | `nonce` lié à la tentative, flux à usage unique |
| Jeton forgé | signature JWKS, algorithme imposé |
| Confusion d'algorithme (`none`, HMAC avec la clé publique) | algorithme imposé — testé |
| `jku` hostile | URL JWKS dérivée du tenant, jamais du jeton |
| Tenant voisin s'appropriant un compte | mapping explicite + contrôle d'organisation + refus du rattachement en conflit |
| Poste modifié revendiquant un rôle | le serveur ne lit ni rôle ni organisation dans la requête |
| Écouteur atteint depuis le réseau local | bouclage littéral uniquement, port éphémère, fermé hors connexion |
| Secret extrait du binaire | aucun secret client n'y figure |
| **Hameçonnage du consentement** | **non couvert** — l'utilisateur reste responsable de ce qu'il approuve dans un vrai écran Microsoft |
| **Poste déjà compromis** | **hors périmètre** — un poste dont l'attaquant a le contrôle peut observer la session émise |

---

## 18. REAL ENTRA VALIDATION

| | |
|---|---|
| **Date** | 17 août 2026 |
| **Résultat** | ✅ **RÉUSSIE** — flux complet, tenant réel |
| **Type de tenant** | établissement d'enseignement supérieur, tenant Entra réel (domaines vérifiés `*.fr`) |
| **Flux testé** | Authorization Code + PKCE S256, de bout en bout |
| **Environnement** | `tauri dev` (build packagé : voir plus bas) |
| **MFA** | déclenché par le tenant, effectué par l'utilisateur |
| **Consentement** | écran affiché, portant uniquement `openid profile email` |
| **Redirect réel** | `http://127.0.0.1:<port éphémère>/callback` — accepté par Entra |

### Enregistrement d'application effectivement utilisé

Créé via Microsoft Graph (Azure CLI), le portail refusant le schéma `http` sur
une adresse de bouclage :

```
signInAudience            AzureADMultipleOrgs
publicClient.redirectUris ["http://127.0.0.1/callback"]   ← chemin compris
isFallbackPublicClient    true      (garde le Device Code hérité utilisable)
passwordCredentials       0         aucun secret
keyCredentials            0         aucun certificat
requiredResourceAccess    []        aucune permission Graph
```

La correction du § 16 s'est révélée nécessaire : sans le chemin `/callback`
dans l'enregistrement, Entra aurait refusé la redirection.

### Chaîne vérifiée, maillon par maillon

| Maillon | Preuve |
|---|---|
| Autorisation Microsoft | URL réelle vers `login.microsoftonline.com/organizations/…/authorize`, `code_challenge_method=S256`, sans `client_secret` |
| Callback loopback | retour reçu, `state` validé |
| Échange du code | effectué **par le serveur**, jamais par le poste |
| Validation JWKS | signature RS256 vérifiée contre les clés du tenant ; un échec aurait produit `ID_TOKEN_INVALID` et aucune session |
| `nonce`, `iss`, `aud`, `exp`, `tid`, `oid` | tous exigés par le validateur ; la session n'existe que s'ils sont passés |
| Mapping de tenant | `organizations.entra_tenant_id` ← tenant réel, rapproché en base |
| Identité fédérée | 1 ligne, `provider=microsoft_entra`, **`verification=verified`** |
| Sujet externe | GUID de 36 caractères, **sans `@`**, différent de l'adresse |
| Session Nova | jeton opaque de 43 caractères, stocké haché en base (`h:<empreinte>`) |
| `/api/me` | contrat legacy **et** v2 cohérents |
| Trousseau | contient **uniquement** le jeton Nova |

### Membership réel

`member_type = student`, **`security_role = member`**, `status = active`,
0 groupe, `identity.provider = microsoft_entra`. Se connecter par Microsoft n'a
accordé **aucun** privilège d'administration : le rôle vient de Nova.

Type de rattachement observé : **création d'un nouveau membre** (aucun compte
historique ni identité fédérée préexistants).

### Redémarrage

Nova fermé puis relancé, serveur laissé en marche : session retrouvée depuis le
trousseau, **aucune nouvelle authentification Microsoft demandée** (0 occurrence
dans les journaux), session toujours active côté serveur.

### Écouteur de bouclage

Après la connexion, **aucun port en écoute** n'appartient au processus Nova : le
listener est bien refermé.

### Journaux

Aucun code d'autorisation, jeton Microsoft, `code_verifier`, `nonce` ni jeton de
session dans les journaux. Le seul marqueur est
`[auth] provider=microsoft_entra result=success`.

> Observation annexe, sans rapport avec le SSO : en mode `DEBUG`, le vidage des
> réglages au démarrage inclut `free_token` et `license_key`. Défaut d'hygiène
> de journalisation préexistant, à traiter séparément.

### Réseau

Poste → serveur Nova ; navigateur → `login.microsoftonline.com` ; serveur →
point de terminaison de jeton Microsoft ; serveur → métadonnées/JWKS Microsoft.
**Aucun appel Microsoft Graph.**

### Déconnexion et seconde connexion

Les deux ont été effectuées réellement, et la base le confirme :

| | |
|---|---|
| Sessions en base | 2 : la première **révoquée** (`active=0`), la seconde active |
| Trousseau | contient exactement la **seconde** session — l'empreinte du jeton du trousseau correspond à la ligne active, pas à l'ancienne |
| Identité fédérée | **1 seule ligne**, `last_seen` postérieur à `created_at` → **réutilisée**, pas recréée |
| Comptes | **1 seul**, même `user_id`, même organisation, même `member_type` |
| Rôle de sécurité | reste `member` après reconnexion |
| Marqueurs | deux `[auth] provider=microsoft_entra result=success`, à 20 minutes d'intervalle |

La déconnexion révoque donc bien côté serveur **et** efface le trousseau ; la
reconnexion retrouve l'identité par `(provider, oid)` au lieu d'en créer une
seconde.

### Build Windows packagé

Produit en 19 min 54 s :

```
bundle/nsis/Nova_<version>_x64-setup.exe    22,5 Mo
bundle/msi/Nova_<version>_x64_en-US.msi     55,4 Mo
```

`!define INSTALLMODE "perMachine"` confirmé dans le script NSIS généré — la
configuration Organization est bien appliquée.

Audit des artefacts, sans installation : **aucun** identifiant de tenant, **aucun**
identifiant d'application, **aucun** `.env`, **aucune** URL de serveur de test,
et **aucun** `campus-config.json` de développement embarqué. Les seules
occurrences de `localhost` dans le binaire sont les schémas internes de Tauri
(`tauri://localhost`, `asset.localhost`, `ipc.localhost`) ; le motif `8787` est
un fragment de hachage de commit d'une dépendance.

> **Installation non effectuée.** La machine porte déjà deux installations Nova
> de même version — une `perMachine` dans `Program Files` et une `perUser` dans
> le profil. Installer ce paquet écraserait la première. La recette packagée
> demande donc une décision d'exploitation, pas une action automatique : voir
> les étapes humaines dans le compte rendu de phase.

### Éléments non testés

- **multi-tenant réel** : un seul tenant disponible. `REAL SINGLE-TENANT
  VALIDATED` / `MULTI-TENANT REAL VALIDATION NOT TESTED` — l'isolation reste
  couverte par les tests automatisés ;
- réutilisation du cache JWKS lors d'une seconde connexion (non observable de
  l'extérieur, le cache étant en mémoire du processus) ;
- cas d'erreur réels (refus de consentement, tenant non rattaché) ;
- **installation** et connexion depuis le build Windows packagé : le paquet est
  produit et audité, mais non installé (voir l'encadré ci-dessus).

---

## 19. Ce qui n'est pas construit

Google Workspace, OIDC générique, SCIM, Nova Admin, Control Plane, découverte
d'organisation, écrans Business, AI Learn, moteur de policies.
