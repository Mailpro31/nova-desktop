# Organization Provider Configs

Comment un fournisseur d'identité cesse d'être une propriété de l'instance pour
devenir une propriété de l'organisation. Complète
[`organization-identity.md`](./organization-identity.md) et les trois documents
de fournisseurs.

Implémentation : `nova-server/main.py` § *Configurations de fournisseur par
organisation*, `src-tauri/src/organization_sso.rs`,
`src/lib/organization/ssoProviders.ts`.

---

## 1. Ce qui change

Avant, un fournisseur se configurait par variables d'environnement globales :
une organisation Google, un émetteur OIDC, par instance. C'était suffisant pour
un serveur d'établissement dédié, et cela interdisait deux choses que la suite
exige — plusieurs organisations sur un même plan de contrôle, et plusieurs IdP
pour une même organisation.

```
Organization
    ↓
OrganizationProviderConfig[]
    ├── microsoft_entra
    ├── google_workspace
    ├── oidc  (Okta)
    └── oidc  (Keycloak)
```

Chaque configuration porte un identifiant Nova immuable — `provider_config_id`.
`provider_type` ne suffit plus à désigner une instance.

---

## 2. Global contre par-organisation

La distinction n'est pas cosmétique, et l'audit a tranché différemment selon les
fournisseurs :

| | Global à Nova | Par organisation |
|---|---|---|
| **Microsoft Entra** | l'App Registration multi-tenant | le `tid` autorisé |
| **Google Workspace** | le client OAuth Nova | le domaine hébergé (`hd`) |
| **OIDC** | rien | émetteur, identifiant client, secret, méthode d'authentification |

Autrement dit : **l'identité de Nova auprès du fournisseur est globale ; le
rattachement d'une organisation est per-organisation.**

Dupliquer une App Registration Microsoft par client n'apporterait rien et
multiplierait les consentements à obtenir. L'OIDC est le seul cas où tout
appartient à l'organisation — et c'est celui qui justifie
`provider_config_id`.

---

## 3. Le modèle

```sql
organization_provider_configs(
  id                        TEXT PRIMARY KEY,   -- UUID Nova, immuable
  organization_id           TEXT NOT NULL,
  provider_type             TEXT NOT NULL,      -- microsoft_entra|google_workspace|oidc
  display_name              TEXT,               -- libellé du bouton, affichage seul
  enabled                   INTEGER NOT NULL DEFAULT 1,
  entra_tenant_id           TEXT,
  google_hosted_domain      TEXT,
  oidc_issuer               TEXT,
  oidc_client_id            TEXT,
  oidc_client_secret        TEXT,               -- serveur uniquement
  oidc_client_auth_method   TEXT DEFAULT 'none',
  oidc_allow_private_issuer INTEGER NOT NULL DEFAULT 0,
  oidc_required_claim       TEXT,
  oidc_required_claim_value TEXT,
  created_at, updated_at    REAL,
  created_by, updated_by    TEXT                -- nullables, pour Nova Admin
)
UNIQUE(organization_id, provider_type, oidc_issuer)
```

Colonnes structurées plutôt qu'un JSON opaque : une colonne se valide,
s'indexe et se lit. La contrainte d'unicité empêche qu'un même émetteur soit
déclaré deux fois pour une organisation — ce seraient deux chemins vers la même
identité.

---

## 4. Source de vérité et dépréciation

```
configuration en base
        ↓  (si aucune, au premier démarrage seulement)
variables d'environnement héritées
        ↓
fournisseur indisponible
```

L'import est fait **une fois**. Un redémarrage ne recrée pas de ligne, et une
configuration corrigée en base n'est pas écrasée au démarrage suivant : c'est la
différence entre importer et imposer. Quatre tests le verrouillent.

**Trajectoire de dépréciation** : les variables `NOVA_ENTRA_ALLOWED_TENANT_ID`,
`NOVA_GOOGLE_ALLOWED_HOSTED_DOMAIN` et `NOVA_OIDC_*` ne servent plus qu'à
l'amorçage. Elles disparaîtront quand le Control Plane distribuera les
configurations. Les variables d'**application** — `NOVA_ENTRA_CLIENT_ID`,
`NOVA_GOOGLE_CLIENT_ID`/`_SECRET` — restent, elles : ce sont les identités de
Nova, pas celles d'une organisation.

---

## 5. Résolution

Un seul point d'entrée, jamais de recherche dispersée :

```
provider_config_by_id(config_id, organization_id)   → cadré par l'organisation
default_provider_config(provider_type, org_id)      → compatibilité par type
usable_provider_configs()                           → ce que le poste voit
```

L'organisation fait partie de la **requête**, pas d'un contrôle qui suivrait :
un identifiant appartenant à une autre organisation ne renvoie rien, quelle que
soit la manière dont il a été obtenu.

---

## 6. Validation et cycle de vie

`validate_provider_config()` renvoie un motif ou `None`. Une configuration
désactivée **ou invalide** n'est jamais annoncée au poste : mieux vaut aucun
bouton qu'un bouton menant à une erreur incompréhensible.

Motifs : `missing_tenant`, `missing_hosted_domain`, `missing_issuer`,
`missing_client_id`, `missing_client_secret`,
`unsupported_client_auth_method`, `missing_global_client_id`,
`missing_global_client`, `unknown_provider_type`.

**Désactiver plutôt que supprimer.** Une configuration désactivée cesse de
servir mais reste lisible : les identités fédérées qu'elle a créées gardent leur
contexte, et un retour arrière ne demande pas de tout ressaisir.

---

## 7. Secrets

Un secret OIDC est stocké dans la table, **côté serveur uniquement**. Il
n'apparaît ni dans `/api/config`, ni dans `/api/me`, ni dans
`/api/auth/providers`, ni dans l'API d'administration, ni dans les journaux.
L'administration expose `has_secret: true` — un secret qu'une API peut relire
finit par être relu.

Une mise à jour sans champ secret **conserve** l'ancien : sans cette règle, une
correction de libellé effacerait silencieusement le secret et couperait toute
une organisation.

> **Pas de coffre-fort maison.** Le serveur ne dispose d'aucun mécanisme de
> chiffrement au repos, et en fabriquer un donnerait une fausse assurance. Le
> secret est aujourd'hui protégé exactement comme le reste de la base — par les
> droits d'accès au fichier. La direction visée est une **référence de secret**
> (`secret_ref`) pointant vers un magasin externe (Vault, KMS, secrets du
> conteneur), la colonne actuelle devenant le repli historique. Rien de tout
> cela n'est construit ici.

---

## 8. Contrat public

`GET /api/auth/providers` :

```jsonc
{
  "provider_configs": [
    { "id": "…", "type": "microsoft_entra", "display_name": "Microsoft" },
    { "id": "…", "type": "oidc",            "display_name": "Company SSO" }
  ],
  // formes historiques, pour les postes déployés
  "providers": ["microsoft_entra", "oidc", "legacy_email_code"],
  "display_names": { "microsoft_entra": "Microsoft", "oidc": "Company SSO" }
}
```

Trois champs par configuration : identifiant, type, libellé. Ni émetteur, ni
identifiant client, ni tenant — rien de cela n'aide à dessiner un bouton, et
tout cela renseignerait un attaquant sur l'infrastructure de l'organisation.

Un test vérifie que la vue publique contient **exactement** ces trois clés.

---

## 9. Démarrage d'une connexion

Le poste envoie `provider_config_id`, tel que le serveur le lui a annoncé. Il ne
le fabrique jamais. Le serveur vérifie que la configuration appartient à
l'organisation active, qu'elle est activée et valide, puis charge l'adaptateur
correspondant.

Le poste ne choisit ni émetteur, ni tenant, ni organisation, ni identifiant
client.

### Liaison du flux

L'état d'une tentative retient `provider_config_id`, `provider_type` et
`organization_id`. Un retour ne peut compléter ni un autre fournisseur, ni **une
autre configuration du même fournisseur** — le cas de deux IdP OIDC. Trois
tests couvrent ces croisements.

---

## 10. Registre d'adaptateurs

`PROVIDERS` est devenu `ADAPTERS` : il ne porte plus que du **comportement** —
points de terminaison statiques, résolution d'émetteur et de clés, revendication
de sujet, algorithmes. La **configuration** vit en base. C'est la distinction qui
manquait, et elle rend le registre réutilisable pour un serveur multi-tenant.

---

## 11. Administration interne

Quatre routes sur l'organisation active uniquement : lister (y compris le cassé,
avec son motif), créer, mettre à jour, désactiver.

Depuis la Phase 22, elles exigent la capacité `provider_manage` — en lecture,
`organization_read` — et leurs mutations sont auditées. Le jeton partagé qui y
donnait accès a été retiré en Phase 28 : seule une session d'administration
ouvre ces routes. Voir
[`control-plane-admin-auth.md`](./control-plane-admin-auth.md).

Ce n'est toujours pas Nova Admin : pas d'interface, pas de gestion des
administrateurs. Juste de quoi ne pas manipuler SQLite à la main.

---

## 12. Dettes

- **`SSO_FLOWS` en mémoire** : inchangé, et toujours bloquant avant un
  déploiement horizontal. Cette phase n'a ajouté **aucune** nouvelle dépendance
  mémoire : les configurations sont persistées ;
- **`created_by` / `updated_by`** restent nuls : Nova Admin les remplira ;
- **un seul `organization_id` actif par instance** — c'est le mode serveur
  dédié, décrit dans
  [`control-plane-foundation.md`](./control-plane-foundation.md).
