# Nova Organization Foundation

Ce document définit le vocabulaire commun à toutes les éditions de Nova. Il
décrit ce qui **existe** aujourd'hui, ce qui est **déclaré** pour la suite, et
ce qui n'est volontairement **pas** construit.

Implémentation : `src/lib/organization/` (frontend) et
`src-tauri/src/organization.rs` (backend).

La couche **identité** — qui se connecte, à quelle organisation, avec quels
droits, et où vont les jetons — fait l'objet d'un document dédié :
[`organization-identity.md`](./organization-identity.md).

---

## 1. Le déplacement du modèle mental

Avant :

```
Personal
Campus
```

Après :

```
Personal
Organization
    ├── Education   ← Campus, tel qu'il existe déjà
    └── Business    ← déclaré, non construit
```

Campus n'est pas remplacé. Il devient le **premier cas** d'une organisation de
type éducation. Aucun écran, aucun flux, aucune capacité ne change à cette
étape.

---

## 2. Nova Core

**Règle d'architecture.** Appartiennent au Nova Core : la qualité de
transcription, la latence, la dictée, le presse-papiers, l'overlay, les Styles,
Automatic, l'historique, l'IA locale, les performances, la stabilité et l'UX
générale.

Toute amélioration du Core bénéficie **par défaut** à Personal, Campus et
Business. Une édition Organization ne perd une capacité Core que si une policy
explicite l'impose — et ce mécanisme n'existe pas encore.

La conséquence pratique : on n'écrit pas de code Core derrière une condition
d'édition. Si une capacité Core doit disparaître quelque part, c'est une
décision de politique d'organisation, pas une propriété du build.

Les capacités Core sont énumérées dans `CORE_CAPABILITIES`
(`src/lib/organization/model.ts`) et vérifiées par test dans les deux éditions.

---

## 3. Les quatre notions, et pourquoi elles ne se confondent pas

| Notion | Question | Exemple | Source aujourd'hui |
|---|---|---|---|
| `MemberType` | quelle est la nature métier de la personne ? | `student` | `users.role` de `nova-server` |
| `SecurityRole` | de quels droits Nova dispose-t-elle ? | `member` | **aucune** |
| `Group` | dans quel segment est-elle ? | `AERO2` | `users.cohort` |
| `Capability` | qu'est-ce que l'application ouvre ? | `aiSkills` | `/api/config` |

Trois déductions sont interdites dans tout le code de la fondation :

1. **un métier ne donne jamais un droit.** Un enseignant n'est pas
   administrateur ; un responsable non plus. `security_role_from_campus_role`
   renvoie `Member` pour toute valeur, et un test le vérifie explicitement pour
   `teacher` et `staff` ;
2. **une adresse e-mail n'est pas une identité.** Le domaine sert au serveur à
   filtrer les inscriptions, il ne définit pas un statut ;
3. **un nom d'affichage n'est pas un identifiant.** « IPSA Paris » est un
   libellé.

### Valeurs

```
Edition           : personal | organization
OrganizationType  : education | business
MemberType        : student | teacher | staff | employee | manager | other
SecurityRole      : member | organization_admin | it_admin
Group             : { id, label, source: cohort | directory }
```

`employee` et `manager` n'ont aucune source : ils attendent Business.
`organization_admin` et `it_admin` n'ont aucune source : ils attendent un
serveur qui les annonce. `directory` attend SSO/SCIM.

---

## 4. Capabilities

Une capacité répond à « cette surface est-elle ouverte ? ». Elle **ne répond
pas** à « cet utilisateur y a-t-il droit ? » — c'est la question des paliers de
licence (`src-tauri/src/licensing.rs`, `TierBadge`), qui reste séparée.

Lecture :

```ts
import { can, useOrganizationContext } from "@/lib/organization";

const context = useOrganizationContext();
if (can(context, "aiSkills")) { … }
```

| Capacité | Personal | Organization / Education |
|---|---|---|
| `dictation` | ✅ | politique établissement |
| `rewrite` | ✅ | politique établissement |
| `writingStyles` | ✅ | politique établissement (`styles`) |
| `personalStyles` | ✅ | politique établissement (`personalization`) |
| `fileTranscription` | ✅ | politique établissement |
| `personalization` | ✅ | politique établissement |
| `localFallback` | ✅ | ✅ toujours |
| `commands` | ❌ (expérimental) | politique établissement |
| `screenContext` | ✅ (verrou de licence) | politique établissement |
| `cloudInference` | ✅ | politique établissement |
| `engineeringNotes` | ❌ | politique établissement |
| `organizationVocabulary` | ❌ | politique établissement (`dictionary`) |
| `organizationSnippets` | ❌ | politique établissement (`snippets`) |
| `organizationFormattingRules` | ❌ | politique établissement (`formattingRules`) |
| `organizationStyles` | ❌ | ❌ — aucun serveur n'en distribue |
| `aiSkills` | ❌ | politique établissement, fermé par défaut |
| `learning` | ❌ | ❌ — non construit |

`organizationStyles` et `learning` restent fermés partout : les annoncer
ouverts serait une promesse que rien ne tient.

---

## 5. Compatibilité Campus

La fondation est une **couche de traduction**, pas une réécriture.

```
campus-config.json / GET /api/config
        ↓  resolveCampusContext()          ← inchangé
   CampusContext
        ↓  resolveOrganizationContext()    ← nouveau
   OrganizationContext
```

- `isCampusMode()` existe toujours et se comporte à l'identique ; il est
  simplement exprimé comme « édition organisation, de type éducation »
  (`src/lib/mode.ts`). C'est le seul point de contact entre les deux
  vocabulaires ;
- `CampusConfig`, `CampusContext`, `CampusMeResponse`, `campusStore` et les
  ~40 commandes Tauri `*_campus_*` sont inchangés — aucun renommage de masse ;
- la **cohorte devient un groupe de compatibilité** (`source: "cohort"`), tout
  en restant exploitable telle quelle par le code Campus existant ;
- le mode examen (`assessment`) continue de fermer reformulation, Styles et
  transcription de fichier — les capacités Organization le reflètent.

---

## 6. Identifiant d'organisation

C'est le point le plus sensible pour le futur multi-tenant.

Ce qui existe : `/api/config` renvoie `organization.id`, alimenté par la
variable d'environnement `NOVA_ORGANIZATION_ID` du serveur de l'établissement.
C'est un identifiant **configuré**, pas dérivé d'un nom — il est donc retenu
tel quel.

Ce qui n'existe pas : un identifiant de tenant **attribué et immuable**, unique
à l'échelle de Nova. `NOVA_ORGANIZATION_ID` vaut ce que l'administrateur y met ;
rien ne garantit son unicité entre deux établissements.

Règles appliquées :

- `OrganizationIdentity.id` est **nullable** et le reste tant qu'aucune source
  ne fournit d'identifiant ;
- le bouchon client `nova-campus` (`DEFAULT_CAMPUS_ORGANIZATION`) n'est jamais
  retenu comme identifiant : c'est un défaut de l'application ;
- le nom d'affichage n'est jamais transformé en identifiant.

Un véritable identifiant de tenant arrivera avec le Control Plane. D'ici là,
`id` peut légitimement être `null` et le code appelant doit le supporter.

---

## 7. Build ≠ identité

Aujourd'hui `VITE_NOVA_MODE=campus` détermine à la fois le mode de déploiement
et la nature de l'organisation. C'est une coïncidence de l'étape actuelle.

Les deux questions sont déjà séparées dans `src/lib/organization/edition.ts` :

- `currentEdition()` — ce que le **paquet installé** déclare ;
- `currentOrganizationType()` — ce que l'**organisation** est.

Le jour où un build Organization servira aussi Business, seule la seconde
change de source (configuration DSI ou serveur). Le code neuf ne doit pas
introduire de nouvelle dépendance à `VITE_NOVA_MODE === "campus"` quand une
capacité ou l'édition répond mieux à la question posée.

Packaging : Personal reste `currentUser`, Organization/Campus reste
`perMachine`. `tauri.campus.conf.json` garde son nom à cette étape — le
renommer n'apporterait rien et casserait la CI.

---

## 8. Licences

Comportement actuel préservé : en mode campus, `licensing::current_tier`
renvoie `Ultra` et `has()` renvoie `true` pour tout. L'établissement paie, donc
aucun argumentaire d'achat ne s'affiche à un étudiant — sept tests le
garantissent dans `licensing.rs`.

Direction visée : la source de vérité fonctionnelle d'une organisation devrait
être ses **capacités et policies**, pas un palier `Ultra` de compatibilité. Le
faux palier reste en place tant que rien ne le remplace — le retirer avant
serait une régression pour chaque poste Campus déployé.

---

## 9. Contrat serveur

`GET /api/me` **n'est pas modifié**. Il renvoie aujourd'hui `email`, `role`,
`cohort`.

> Écart constaté pendant l'audit : le client déclare aussi un champ
> `organization` (`CampusMeResponse`, avec `#[serde(default)]`), que le serveur
> actuel ne renvoie pas sur cette route. Le repli côté client — un libellé
> dérivé de l'hôte, marqué non faisant autorité — est donc toujours actif. Rien
> n'est cassé ; le nom faisant autorité vient de `/api/config`.

Ce qu'un contrat futur devrait pouvoir renvoyer, sans qu'aucun de ces champs ne
soit inventé côté client tant que le serveur ne les fournit pas :

```jsonc
{
  "organization_id":   "…",  // tenant immuable, attribué par le Control Plane
  "organization_type": "education" | "business",
  "member_type":       "student" | "employee" | …,
  "security_role":     "member" | "organization_admin" | "it_admin",
  "groups":            [{ "id": "…", "label": "…" }],
  "capabilities":      { "aiSkills": true, … }
}
```

Aucune modification n'a été apportée à `nova-server` dans cette étape.

> **Mise à jour (Phase 13).** Ce contrat a depuis été étendu de façon
> strictement additive, et `nova-server` fournit maintenant un identifiant
> d'organisation immuable. Voir
> [`organization-identity.md`](./organization-identity.md) — la forme retenue
> diffère du JSON ci-dessus : `organization` reste une **chaîne** pour ne pas
> casser les postes déployés.

---

## 10. Prêt pour SSO (non construit)

Le modèle déclare `FederatedIdentity` (forme détaillée en Phase 13, voir
[`organization-identity.md`](./organization-identity.md)) :

```ts
{ provider, externalSubject, externalTenantId, organizationId }
```

Le point structurel : l'identifiant principal est le couple
(fournisseur, `sub`), **pas l'adresse e-mail**. Une adresse change, se
réattribue, et n'existe pas dans certains annuaires. Aucun code ne produit ces
valeurs — elles viendront d'un serveur.

Ni Microsoft SSO, ni Google SSO, ni interface OAuth ne sont construits ici. Le
flux Entra Device Code déjà présent côté Campus reste inchangé.

---

## 11. Prêt pour SCIM (non construit)

`DirectoryLink` déclare `externalUserId`, `externalGroupIds`, `active` — de quoi
accueillir un provisionnement et un déprovisionnement ultérieurs. `Group.source`
distingue déjà `cohort` (champ libre actuel) de `directory` (annuaire), pour
qu'un groupe provisionné ne puisse pas se faire passer pour une cohorte saisie à
la main. Aucun endpoint SCIM n'existe.

---

## 12. Policies futures (non construites)

Ordre de priorité prévu, du plus fort au plus faible :

```
Contraintes de sécurité Nova
        ↓
Policy d'organisation
        ↓
Policy de groupe
        ↓
Préférence utilisateur
```

Le moteur n'est pas construit. La fondation se contente de ne pas le rendre
impossible : les capacités sont résolues en **un seul endroit**
(`resolveOrganizationContext`) à partir d'un contexte explicite, et non
dispersées en conditions d'édition. Insérer une couche de policy revient donc à
insérer une étape dans cette résolution.

---

## 13. Ce qui n'est pas construit à cette étape

Microsoft SSO, Google SSO, interface OAuth, Nova Admin, Nova Control Plane,
écrans Business, AI Learn, distribution de Styles d'organisation, distribution
d'AI Skills d'organisation, SCIM, moteur de policies, analytique.
