# Nova Control Plane — fondation

Ce document définit la frontière entre ce qui **administre** Nova et ce qui
**traite la parole des utilisateurs**. Il ne décrit aucun service construit :
c'est un contrat d'architecture, écrit maintenant pour éviter qu'il se décide
tout seul, plus tard, par accumulation.

Rien de ce qui suit n'existe encore, sauf mention explicite du contraire.

---

## 1. Deux plans, et pourquoi ils doivent rester séparés

```
┌─────────────────────────── CONTROL PLANE ────────────────────────────┐
│  métadonnées de tenant       configurations SSO       policies       │
│  déploiement                 packages                 administration │
│  audit                       facturation                            │
└──────────────────────────────────────────────────────────────────────┘
                                   │ configure
                                   ▼
┌──────────────────────────── DATA / AI PLANE ─────────────────────────┐
│  transcription    reformulation    commandes    services IA de l'org  │
└──────────────────────────────────────────────────────────────────────┘
```

**Le Control Plane décide ; le Data Plane exécute.**

Le Control Plane manipule des métadonnées : qui est l'organisation, quels
fournisseurs d'identité elle utilise, quelles règles s'appliquent, quelle
version est déployée. Le Data Plane manipule ce que les gens disent — leur
audio, leur texte, leurs prompts.

### La faute à ne pas commettre

Un plan de contrôle centralisé est commode. Il est donc tentant d'y faire
transiter « juste » la transcription, « juste » la reformulation — et de se
retrouver, sans l'avoir décidé, avec un service central par lequel passe la
parole de tous les établissements clients.

**Le Control Plane ne doit jamais devenir le lieu où passe le contenu
utilisateur.** Cette règle est le point de ce document. Elle a une conséquence
pratique immédiate : un établissement qui héberge son propre serveur garde son
audio chez lui, même le jour où Nova gère ses configurations depuis un plan de
contrôle mutualisé.

| | Control Plane | Data / AI Plane |
|---|---|---|
| Audio dicté | **jamais** | oui |
| Texte à reformuler | **jamais** | oui |
| Prompts, contexte d'écran | **jamais** | oui |
| Identifiant d'organisation | oui | oui |
| Configuration SSO | oui | lue |
| Compteurs d'usage | agrégés | produits |
| Secrets de fournisseur | oui | non |

---

## 2. Objets du Control Plane

| Objet | Rôle | État |
|---|---|---|
| **Organization** | tenant Nova, identifiant immuable | ✅ existe |
| **OrganizationProviderConfig** | fournisseurs d'identité de l'organisation | ✅ existe |
| **OrganizationMembership** | appartenance, métier, rôle de sécurité | ✅ existe |
| **Deployment** | où tourne le Data Plane de l'organisation, quelle version | ❌ à venir |
| **Policy** | ce que l'organisation autorise, hiérarchie de précédence | ❌ à venir |
| **Package** | Styles, vocabulaire, AI Skills distribués | ❌ à venir |
| **Admin / audit** | qui a changé quoi, et quand | ❌ à venir |

Les trois premiers existent déjà en base : c'est ce que les phases 12 à 19 ont
construit, sans jamais l'appeler Control Plane.

---

## 3. Deux modes de déploiement — à ne pas mélanger

### A. Serveur d'organisation dédié — **le mode actuel**

Une instance sert **une** organisation. Son identifiant est persisté dans
`server_state.organization_id` (voir
[`organization-identity.md`](./organization-identity.md)), et toutes les
configurations chargées lui appartiennent. Une configuration d'une autre
organisation est inaccessible — l'organisation fait partie de chaque requête,
pas d'un contrôle qui suivrait.

Le poste connaît son serveur par `campus-config.json`, déposé par la DSI.

### B. Control Plane mutualisé — **à venir**

Une instance sert plusieurs organisations. L'organisation n'est plus implicite :
elle doit être déterminée **avant** de savoir quels fournisseurs proposer.

```
identifiant d'organisation, invitation, ou domaine
        ↓  découverte
organization_id
        ↓
configurations de fournisseur
        ↓
boutons de connexion
```

C'est le seul point réellement nouveau, et il n'est pas résolu ici. La
découverte n'est **pas** construite : ni endpoint public global, ni résolution
par domaine d'adresse — cette dernière serait d'ailleurs contraire à tout ce que
le modèle d'identité impose depuis la Phase 13.

**Ne pas mélanger les deux modes.** Un serveur dédié qui commencerait à
répondre pour des organisations qu'il ne sert pas serait un multi-tenant
accidentel, sans les contrôles qui vont avec.

---

## 4. Adresse du service

Direction visée :

```
Desktop → point d'entrée logique Nova → service privé de l'organisation
```

plutôt que :

```
Desktop → adresse IP saisie par l'utilisateur
```

Dit sans illusion : une adresse à laquelle le poste doit se connecter n'est pas
un secret, et rien ne la rendra telle. L'objectif est de supprimer une friction
d'usage et de réduire la surface — pas d'IP interne dans l'interface, pas de
serveur arbitraire saisissable — non de fabriquer une confidentialité.

`campus-config.json` reste pris en charge et ne sera pas retiré avant que la
découverte existe.

---

## 5. Ce qui manque avant un Control Plane réel

1. ~~**État de flux partagé.**~~ ✅ **Fait en Phase 20** — l'état des tentatives
   vit en base, et `start` peut atterrir sur un worker différent d'`exchange`.
   Voir [`shared-sso-flow-state.md`](./shared-sso-flow-state.md). Reste une
   exception documentée : le Device Code hérité, toujours lié à son processus ;
2. ~~**Découverte d'organisation.**~~ ✅ **Fait en Phase 21** — endpoint public,
   réponse identique dans tous les cas négatifs, adresse de service validée des
   deux côtés. Voir [`organization-discovery.md`](./organization-discovery.md).
   Reste à faire au niveau de la passerelle : la limitation d'appels ;
3. **Références de secret** plutôt que des secrets en base (voir
   [`organization-provider-configs.md`](./organization-provider-configs.md)) ;
4. **Journal d'audit** : `created_by` / `updated_by` existent déjà, vides ;
5. **Authentification d'administration** digne de ce nom — `X-Admin-Token` est
   un jeton unique partagé, acceptable pour une instance dédiée, insuffisant
   pour un plan de contrôle mutualisé.

---

## 6. Ce que cette fondation n'autorise pas

Écrire ce document ne construit ni Nova Admin, ni le Control Plane, ni les
policies, ni les packages, ni SCIM. Il fixe une frontière pour que, le jour où
ces briques arriveront, la question « et si on faisait passer la transcription
par le plan de contrôle ? » ait déjà sa réponse.
