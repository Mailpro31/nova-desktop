# Packages d'organisation

Ce qu'une organisation **distribue** à ses membres — Styles, AI Skills,
vocabulaire — et pourquoi ce n'est pas la même chose que ce qu'elle
**autorise**.

Complète [`organization-policies.md`](./organization-policies.md).
Implémentation : `nova-server/main.py` § _Packages d'organisation_,
`nova-server/admin-web/src/pages/Packages.tsx`,
`src/lib/organization/packages.ts`.

---

## 1. Package et Policy répondent à deux questions

|          | Policy                              | Package                                        |
| -------- | ----------------------------------- | ---------------------------------------------- |
| Exemple  | `organization_vocabulary_enabled`   | « Vocabulaire Ingénierie v3 »                  |
| Répond à | cette capacité est-elle autorisée ? | quel contenu l'organisation distribue-t-elle ? |
| Vit dans | `organization_policies`             | `organization_packages`                        |

Les confondre produirait un système où désactiver une fonction demanderait de
dépublier du contenu, et où publier du contenu accorderait une permission.

**Un package ne porte donc aucun `enabled`.** La permission vit dans la policy,
et un package actif reste sans effet si la policy est fermée. La console le dit
à l'écran — sans quoi on chercherait longtemps pourquoi un contenu publié
n'arrive pas.

Un test vérifie qu'aucun champ nommé `enabled` ne survit à la validation.

---

## 2. Package et Version

```
Package   « Vocabulaire Ingénierie »    ce qui a un nom et une identité
Version   v1, v2, v3                    ce qui a un contenu
```

Un package existe **avant** d'avoir quoi que ce soit à dire : il naît sans
version active. Une seule version est active à la fois.

```
draft ──publish──> published ──activate──> active
                        │
                        └── reste intacte pour toujours
```

---

## 3. Une version publiée est immuable

Modifier demande un **nouveau brouillon**. Revenir en arrière ne réécrit rien :
c'est l'active qui redésigne une version antérieure, restée intacte.

C'est ce qui rend le retour arrière sûr — **on republie exactement ce qui avait
été publié**, pas une reconstruction de mémoire. Il n'y a donc pas deux
mécanismes, un pour avancer et un pour reculer, mais un seul pointeur.

Tenté sur une version publiée :

```
PUT    …/versions/{id}   →  409 PACKAGE_VERSION_IMMUTABLE
DELETE …/versions/{id}   →  409 PACKAGE_VERSION_IMMUTABLE
```

**Un seul brouillon à la fois** (`409 PACKAGE_DRAFT_EXISTS`) : deux brouillons
concurrents poseraient la question « lequel devient v4 ? », et toute réponse
serait arbitraire.

**Archiver, pas supprimer.** Un package archivé cesse d'être distribué mais
reste lisible, et un retour en arrière ne demande pas de tout ressaisir — le
même choix qu'en Phase 22 pour les fournisseurs d'identité.

---

## 4. Deux versions, deux notions

|                  |                                   |
| ---------------- | --------------------------------- |
| `version_number` | 1, 2, 3 — compte les publications |
| `schema_version` | décrit la **forme** du contenu    |

Les lier obligerait à republier pour changer de format, ou à changer de format
pour republier. La version 8 d'un package peut parfaitement porter un contenu
de schéma 1.

---

## 5. Valider structurellement, pas syntaxiquement

« Le JSON se parse » ne veut rien dire : un document vide se parse aussi. Chaque
type déclare ses champs, ses limites et ses interdits, et ce qui ressort est un
document **normalisé** — pas celui qui est entré.

| Type            | Champs                                                      |
| --------------- | ----------------------------------------------------------- |
| **Style**       | `name`, `instruction`                                       |
| **AI Skill**    | `title`, `summary`, `practice`, `duration_minutes`, `steps` |
| **Vocabulaire** | `entries[{term, replacement}]`                              |

Les champs inconnus sont **écartés**, pas stockés. Les doublons de vocabulaire
sont refusés plutôt que dédupliqués : deux lignes pour le même terme signifient
que quelqu'un attend deux résultats différents, et en choisir un sans le dire
produirait un comportement que personne ne saurait expliquer.

Refus structuré, jamais une trace d'exécution :

```jsonc
400 { "code": "PACKAGE_VALIDATION_FAILED", "reason": "duplicate",
      "field": "entries[3].term", "message": "'Nova' appears twice." }
```

### Aucun contenu exécutable

Un package est du contenu distribué à des postes. Lui laisser porter du code —
script, URL à exécuter, interpolation de secret — ferait de la console
d'administration **un moyen d'exécuter du code chez chaque membre**. Ce n'est
pas une fonction produit, c'est une porte.

Le format est déclaratif, et la validation ne conserve que les champs déclarés.
Un test envoie délibérément `script`, `url` et `eval`, et vérifie qu'ils ne
survivent pas.

### Limites, appliquées par le serveur

```
nom 120 · description 500 · document 256 Ko
vocabulaire 2000 entrées, 200 caractères par champ
Style 8000 caractères · AI Skill 4000, 20 étapes
```

Une limite dans l'interface seule n'est pas une limite : elle indique une
intention à qui veut bien la lire.

---

## 6. Identifiants impossibles à confondre

```
nova_style_email        preset intégré
mon-style               Style personnel
org_style_<package_id>  Style d'organisation
```

Sans préfixe, un package pourrait masquer un preset intégré — ou en hériter les
privilèges de palier.

---

## 7. Autorisation

|                                    |                                           |
| ---------------------------------- | ----------------------------------------- |
| Lire                               | `organization_read` — tout administrateur |
| Créer, modifier, publier, archiver | `content_manage`                          |

`content_manage` va à `organization_admin` seul. **Pas `it_admin`** : publier du
contenu aux membres est une décision d'organisation, pas d'exploitation — la
frontière posée en Phase 22 tient sans exception ajoutée.

Une seule capacité pour les trois types : une par type ferait grossir la matrice
sans répondre à une question différente.

---

## 8. Isolation

Toutes les routes d'administration sont **cadrées par l'organisation**, qui fait
partie de la requête et non d'un contrôle qui suivrait. Un identifiant
appartenant à une autre organisation renvoie `404` — indistinguable d'un
identifiant faux.

`organization_id` est **dénormalisé** sur la table des versions : toute lecture
peut ainsi être cadrée sans jointure, et une jointure oubliée est exactement la
faute qui produit une fuite entre tenants.

---

## 9. Distribution

```
GET /api/organization/packages     session utilisateur ordinaire
```

Ne renvoie que ce qui est **publié et actif**, d'un package non archivé, dont la
policy est ouverte. Jamais un brouillon, jamais une version publiée mais
inactive, jamais de métadonnée d'administration — ni auteur, ni statut, ni état
de validation.

L'organisation vient du **compte**, jamais d'un paramètre.

### Composition avec les policies

```
package actif  ∩  policy ouverte  =  contenu distribué
```

Le contenu existe, la permission non — et réciproquement. Les deux doivent
tenir.

> Un défaut trouvé en Phase 31 : le mapping portait `writingStyles`, le nom du
> **poste**, alors que le serveur nomme cette capacité `styles`. Aucun package
> de Style n'était distribué, et le `.get()` faisait passer la faute de frappe
> pour un refus de policy. Le serveur lève désormais plutôt que de se taire, et
> un test confronte chaque nom au catalogue réel.

### Cache

`ETag` et `304` sur le catalogue. Une empreinte de l'ensemble distribué —
identifiants, numéros de version, empreintes de contenu — suffit : le poste sait
qu'il détient déjà la bonne chose sans comparer chaque document, et **aucune
infrastructure de cache n'a été construite** pour cela.

### Hors ligne

Le poste peut appliquer le dernier catalogue reçu. Les limites, sans les
farder :

- ce n'est **pas** une application cryptographique. L'empreinte détecte la
  corruption, elle ne prouve pas qui a publié ;
- un poste resté longtemps hors ligne applique un contenu périmé ;
- un poste jamais connecté n'a aucun contenu.

Une signature véritable demanderait une gestion de clés ; en fabriquer une à
moitié donnerait une assurance que le mécanisme ne tient pas.

---

## 10. Côté poste

`src/lib/organization/packages.ts` — types, lecture tolérante, filtrage par
capacité, précédence du vocabulaire.

**Le catalogue porte son organisation.** Changer d'organisation ou se
déconnecter ne doit jamais laisser le contenu de la précédente s'appliquer, et
un cache sans cette identité rendrait la faute invisible.

Un package d'un type inconnu, ou d'un schéma plus récent, est **ignoré** — pas
deviné. Un poste qui interpréterait un format qu'il ne connaît pas distribuerait
du contenu déformé, ce qui est pire que de ne rien distribuer.

### Précédence du vocabulaire

```
vocabulaire d'organisation  puis  vocabulaire personnel
```

**La personne l'emporte en cas de collision.** Un membre qui a corrigé un terme
pour son propre usage l'a fait en connaissance de cause ; le lui reprendre à la
prochaine publication serait un contenu qui se défait tout seul. L'organisation
fournit une base, elle ne réécrit pas les choix individuels.

Les Styles d'organisation **complètent** les Styles personnels, ils ne les
remplacent pas — le préfixe rend la confusion impossible.

### Personal n'en consomme aucun

Nova Personal n'a pas d'organisation, donc pas de catalogue. Les surfaces
d'organisation y restent fermées.

---

## 11. Audit

```
package.create · package.draft_create · package.draft_update
package.draft_discard · package.version_publish
package.version_activate · package.version_rollback · package.archive
```

Métadonnées : type, numéros de version. **Jamais le contenu** — un journal qui
recopierait un dictionnaire entier à chaque publication cesserait d'être
lisible, et porterait du contenu qu'il n'a pas à porter.

Un retour en arrière est nommé comme tel (`version_rollback`) et non comme une
activation ordinaire : le journal doit dire ce qui s'est passé.

Mutation et trace partagent une transaction. Une publication à moitié appliquée
laisserait l'organisation dans un état que personne n'a choisi.

---

## 11 bis. Câblage runtime — état réel

| Type            | Publié | Distribué |             **Consommé**              |
| --------------- | :----: | :-------: | :-----------------------------------: |
| **Vocabulaire** |   ✅   |    ✅     | ✅ **oui — dans `writing_context()`** |
| Styles          |   ✅   |    ✅     |      ❌ bloqué, voir ci-dessous       |
| AI Skills       |   ✅   |    ✅     |      ❌ bloqué, voir ci-dessous       |

### Vocabulaire — câblé

Le vocabulaire actif entre dans la consigne de reformulation, à sa place dans
l'ordre de composition :

```
héritage partagé  →  package d'organisation  →  personnel
```

Un dictionnaire, pas une concaténation : sans lui, un terme présent dans deux
sources apparaîtrait deux fois dans la consigne avec deux remplacements
différents, et le modèle choisirait.

Testé jusqu'au bout de la chaîne — publication, nouvelle version, retour
arrière, archivage et policy fermée se voient tous dans la consigne réelle, pas
seulement dans la réponse de l'API de distribution.

### Styles — bloqué sur une décision de licence

Le poste résout un Style par `settings.post_process_prompts`, en Rust, et
applique ensuite une règle de palier :

```rust
is_builtin_style(id) ? "all_styles" : "custom_styles"
```

Un Style d'organisation n'étant pas intégré, il exigerait **`custom_styles`,
c'est-à-dire Nova Ultra**. Un établissement qui distribue un Style à ses
étudiants leur imposerait donc d'acheter Ultra pour l'utiliser.

C'est une décision de tarification, pas un détail de câblage. Trois issues
existent — exempter les Styles d'organisation du palier, créer un palier
Organization, ou les réserver aux membres Ultra — et aucune ne peut être prise
en écrivant du code.

### AI Skills — bloqué sur deux modèles incompatibles

Le catalogue serveur et l'écran du poste ne décrivent pas la même chose :

```
serveur   { id, title, summary, practice, duration_minutes }   texte
poste     { titleKey, promptKey, options[], correctOptionId }  clés i18n + quiz
```

`getAiSkills()` et sa commande Rust existent — et **rien ne les appelle**.
L'écran consomme `AI_ESSENTIALS_TRACK`, une piste d'apprentissage locale avec
questions à choix multiples.

Distribuer un AI Skill d'organisation demanderait donc un second chemin de
rendu pour du texte simple, ou de rapprocher les deux modèles. Ce n'est pas du
câblage : c'est une surface produit à définir.

---

## 12. Legacy — `shared_dictionary`

Une table existante joue déjà le rôle d'un vocabulaire d'organisation :

```sql
shared_dictionary(id, term, replacement)   -- aucune colonne organization_id
```

Sans versionnage, sans brouillon, sans publication — et **sans organisation**.
En mono-tenant c'est indolore ; le jour où deux organisations partagent une
base, chacune lirait le vocabulaire de l'autre.

**La table n'est lue qu'en mode dédié.** C'est la décision prise : en mode
dédié, l'instance sert une seule organisation et la table lui appartient
entièrement ; en Control Plane, elle appartiendrait à tout le monde à la fois,
et chaque organisation recevrait le vocabulaire de ses voisines.

Cette fuite serait d'autant plus difficile à voir qu'elle ne produirait que des
remplacements inattendus — jamais un message d'erreur.

```python
if NOVA_SERVER_MODE != SERVER_MODE_DEDICATED:
    return []
```

Un refus explicite plutôt qu'une migration : déplacer ces entrées vers un
package changerait leur comportement sans que personne ne l'ait demandé. La
trajectoire est qu'une organisation publie son propre package — et un test
vérifie qu'un package publié le remplace proprement en Control Plane.

---

## 13. Ce qui n'est pas construit

- **câblage des Styles** — bloqué sur la règle de palier (§ 11 bis) ;
- **câblage des AI Skills** — bloqué sur deux modèles de contenu
  incompatibles (§ 11 bis) ;
- **migration de `shared_dictionary`** vers un package (§ 12) ;
- **signature cryptographique** des packages (§ 9) ;
- **import / export** de fichiers de package ;
- **`minimum_client_version`** — reporté faute de besoin démontré ;
- **place de marché, partage entre organisations, approbation en plusieurs
  temps, déploiement progressif.**
