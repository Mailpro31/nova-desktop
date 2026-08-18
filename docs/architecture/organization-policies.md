# Policies produit de l'organisation

Ce qu'une organisation autorise à ses membres dans Nova — et pourquoi ce n'est
pas la même chose que ce qu'un administrateur a le droit de modifier.

Complète [`control-plane-admin-auth.md`](./control-plane-admin-auth.md) et
[`organization-foundation.md`](./organization-foundation.md).
Implémentation : `nova-server/main.py` § *Policies produit de l'organisation*,
`nova-server/admin-web/src/pages/Rest.tsx`, `src/lib/organization/policy.ts`.

---

## 1. Deux dictionnaires de booléens, deux mondes

C'est la confusion qu'il fallait éviter en premier, parce qu'elle est facile :

| | Capacité d'administration | Policy produit |
|---|---|---|
| Exemple | `policy_manage` | `ai_skills_enabled` |
| Répond à | qu'un **administrateur** peut-il modifier ? | que l'**organisation** autorise-t-elle à ses membres ? |
| Vit dans | `CAPABILITIES_BY_ROLE` | `POLICY_SETTINGS` |
| Protège | la console | rien — elle **configure** |

`policy_manage` dit qui peut changer `ai_skills_enabled`. Il n'entre jamais dans
le calcul de ce que voit un membre. Les fusionner produirait un système où
cocher une case de configuration pourrait rouvrir la console — et un test
vérifie que les deux ensembles de noms ne se croisent pas.

---

## 2. La formule

```
capacité de base  ∩  policy de l'organisation  =  capacité effective
```

| base | policy | effective |
|:--:|:--:|:--:|
| ❌ | ❌ | ❌ |
| ❌ | ✅ | ❌ |
| ✅ | ❌ | ❌ |
| ✅ | ✅ | ✅ |

La deuxième ligne est la règle fondamentale : **une policy n'invente jamais une
capacité**. Si une organisation pouvait ouvrir ce que le produit ne fournit pas,
le catalogue produit cesserait d'être la référence et chaque tenant pourrait
s'attribuer des fonctions inexistantes.

L'intersection ne va donc que dans un sens : une policy **restreint**.

---

## 3. Ce qui n'est pas gouvernable

Aucune policy ne touche — et aucune clé n'existe pour :

```
Microsoft SSO · Google SSO · OIDC · step-up · sessions d'administration
fournisseurs · découverte · rôles · audit · accès à Nova Admin
```

Ce sont des fonctions du **plan d'identité**. Une policy produit capable de les
éteindre serait un moyen de se verrouiller dehors depuis un écran de
configuration — ou, pire, de désarmer la traçabilité.

La séparation est structurelle, pas déclarative : ces notions n'ont pas de clé,
et un test échoue si l'une d'elles apparaît dans un nom de policy. La console le
dit aussi à l'écran, pour qu'un administrateur puisse s'en assurer sans lire ce
document.

### La dictée n'est pas gouvernable non plus

`dictation.enabled=false` n'existe pas, et son absence est délibérée. La dictée
est le produit ; une policy mal réglée qui l'éteindrait ferait d'une erreur de
configuration une panne totale — sans recours pour le membre, et sans que le
support puisse distinguer une panne d'une décision. Si ce besoin apparaît, il
demandera son propre examen : connexion, récupération, support, hors ligne,
interface.

---

## 4. Cinq clés, et c'est un choix

Phase 29 en avait posé une ; la Phase 30 en ajoute quatre. Pas quarante
interrupteurs « pour plus tard ».

Une policy n'est légitime que si **trois** conditions tiennent :

1. la fonction existe vraiment ;
2. on sait exactement ce que son refus signifie ;
3. le refus peut s'appliquer ailleurs que dans l'affichage.

| Candidat | Verdict |
|---|---|
| **AI Skills** | ✅ `/api/ai-skills` — Phase 29 |
| **Vocabulaire d'organisation** | ✅ `/api/vocabulary`, `/api/dictionary/*` |
| **Commandes vocales** | ✅ `/api/command` |
| **Notes d'ingénierie** | ✅ `/api/engineering-notes` |
| **Import de fichier audio** | ✅ `/api/import/transcribe` — route créée pour cela, § 9 |
| Styles personnels | ❌ la capacité `personalStyles` n'est lue **nulle part** — le refus ne s'appliquerait à rien |
| Styles d'organisation | ❌ aucun serveur n'en distribue ; c'est du contenu, pas une règle (§ 10) |
| Historique | ❌ essentiellement local ; une policy serveur n'efface pas ce qui est déjà sur le poste, et le prétendre serait une fausse promesse |
| Repli local | ❌ son refus signifie « plus de dictée hors ligne » — voir § 3 |
| Learning | ❌ **la fonction n'existe pas** ; `learning` vaut `false` en dur |

Chacune des cinq retenues gouverne une **route serveur réelle** : le refus est
donc opposable à n'importe quel client, pas seulement à l'interface.

Un panneau de configuration dont la plupart des lignes ne font rien est pire
qu'un panneau court : on n'y sait bientôt plus lesquelles comptent.

---

## 5. Le schéma appartient au serveur

```
POLICY_SCHEMA_VERSION = 2

organization_policies(
  organization_id     TEXT PRIMARY KEY,   -- une policy active, la clé l'impose
  schema_version      INTEGER NOT NULL,
  revision            INTEGER NOT NULL,
  settings            TEXT NOT NULL,      -- JSON, jamais arbitraire
  updated_at          REAL NOT NULL,
  updated_by_user_id  TEXT
)
```

Le document est stocké en JSON mais **chaque clé est déclarée**. À l'écriture,
une clé inconnue ou un type invalide est refusé — `POLICY_KEY_UNKNOWN:…`,
`POLICY_VALUE_INVALID:…`. Il n'y a pas d'éditeur JSON dans Nova Admin, et il n'y
en aura pas : le serveur possède le schéma, l'interface propose des contrôles
typés.

> `isinstance(True, int)` vaut vrai en Python. Sans contrôle dédié, `1`
> passerait pour un booléen — et un `0` bien intentionné fermerait une fonction
> par accident de typage.

### Lecture tolérante, écriture stricte

La dissymétrie est voulue :

- **écriture** — refuser. Un administrateur attend une confirmation ; une clé
  mal orthographiée qui disparaît en silence lui donne la certitude d'avoir
  configuré quelque chose qui ne s'appliquera jamais ;
- **lecture** — se dégrader. Une ligne écrite par une version ultérieure, ou
  abîmée, doit rester lisible. La refuser priverait l'organisation de service à
  cause d'un champ qu'on ne comprend pas.

---

## 6. Les défauts protègent l'existant — et seules les surcharges sont stockées

```python
DEFAULT_ORGANIZATION_POLICY = {
    "ai_skills_enabled":              True,
    "organization_vocabulary_enabled": True,
    "voice_commands_enabled":          True,
    "engineering_notes_enabled":       True,
    "file_import_enabled":             True,
}
```

**La base ne contient que les surcharges explicites.** Recopier les défauts les
figerait : le jour où un défaut produit change, les organisations qui n'avaient
rien demandé garderaient l'ancien comportement sans l'avoir choisi.

Une console qui renvoie l'état complet obtient donc gratuitement le « revenir au
défaut » — reposer une valeur sur son défaut efface la surcharge. L'API expose
les trois formes : `overrides` (ce qui a été décidé), `defaults`, et `settings`
(ce qui s'applique).

**Tous les défauts sont permissifs**, et un test parcourt le dictionnaire pour
s'en assurer. C'est ce qui garantit qu'une organisation déjà déployée ne perd
rien : sans ligne en base, elle obtient les défauts, et son comportement est
identique à celui d'avant cette phase.

Un défaut restrictif éteindrait une fonction chez tout le monde à la première
mise à jour du serveur — une migration qui casse est une panne, pas une
livraison.

L'absence de ligne porte la **révision 0** : « personne n'a jamais rien
changé ». La console l'affiche plutôt que de laisser croire à un choix
délibéré.

---

## 7. Révision et concurrence

Chaque écriture incrémente une révision monotone. Elle sert à deux choses, et la
seconde est celle qui compte :

- savoir qu'une policy a changé sans comparer le document ;
- **refuser une écriture partie d'une version périmée**.

```
admin A lit la révision 4
admin B écrit           → révision 5
admin A enregistre depuis 4 → 409 POLICY_REVISION_CONFLICT
```

Jamais d'écrasement silencieux : l'administrateur qui perdrait ainsi le travail
de son collègue ne saurait même pas qu'il a existé. La console affiche le
conflit et propose de recharger. Elle ne réessaie **pas** automatiquement avec
la révision fraîche — ce serait l'écrasement, avec une étape de plus.

Une écriture refusée ne laisse rien : ni policy à moitié écrite, ni ligne
d'audit.

---

## 8. API

| | |
|---|---|
| `GET /api/control/organization/policy` | `organization_read` — tout administrateur |
| `PUT /api/control/organization/policy` | `policy_manage` |
| `GET /api/organization/policy` | session **utilisateur** ordinaire |

`policy_manage` va à `organization_admin`, et **pas** à `it_admin` : décider ce
que l'organisation offre à ses membres est une décision d'organisation, pas
d'exploitation. La frontière posée en Phase 22 — `it_admin` gère la machine —
tient sans exception ajoutée.

### Isolation

Aucune de ces routes ne prend d'identifiant d'organisation. C'est la protection
la plus sûre : **ce qu'on ne peut pas désigner, on ne peut pas l'atteindre par
erreur de contrôle**. L'administrateur écrit dans l'organisation de son
principal ; le membre lit celle de son compte. Un paramètre client est sans
effet, et c'est testé.

### Ce que le membre reçoit

`schema_version`, `revision`, `settings`, `effective_capabilities`. Rien
d'autre — ni qui a changé la policy, ni quand. Un membre n'a pas à connaître la
gouvernance ; il a besoin de savoir ce qu'il peut utiliser.

---

## 8 bis. Composition avec le mode du déploiement

```
support produit  ∩  policy d'organisation  ∩  restriction de contexte
                                           =  capacité effective
```

Le mode pédagogique du déploiement — `normal`, `classroom`, `assessment` — vit
**dans la capacité de base**. L'intersection le préserve donc sans traitement
particulier : `classroom` ferme les commandes et les notes d'ingénierie, et une
policy permissive ne les rouvre pas, parce que `False and True` vaut `False`.

C'est la propriété qui compte, et elle vaut mieux qu'une règle de priorité
écrite quelque part : **il n'y a rien à se rappeler**. Une policy ne peut
qu'ôter, jamais rendre.

| mode | policy | effectif |
|---|:--:|:--:|
| `normal` | ✅ | ✅ |
| `normal` | ❌ | ❌ |
| `classroom` | ✅ | ❌ *(commandes, notes)* |
| `classroom` | ❌ | ❌ |
| `assessment` | ✅ | ❌ |

---

## 9. Application réelle

La policy n'est pas un panneau décoratif. `ai_skills_enabled=false` produit :

```
GET /api/ai-skills                → 403 CAPABILITY_NOT_AVAILABLE
/api/config → capabilities.aiSkills → false
/api/config → ai_skills.enabled     → false
/api/me     → aiSkills               absent
poste       → entrée de menu fermée
```

Le refus serveur est le point important. Le poste masque déjà l'entrée quand la
capacité est fermée, mais **un poste est une interface** : il peut être ancien,
modifié, ou appeler la route directement. Le catalogue vient du serveur — c'est
donc au serveur de ne pas le donner.

Les cinq refus partagent un contrat :

```jsonc
403 { "code": "ORGANIZATION_POLICY_DISABLED", "feature": "file_import" }
```

Le nom de la fonction, et rien d'autre — ni état interne, ni configuration.
Cinq codes différents auraient obligé chaque client à les traiter un par un.

### La dictée n'est jamais gouvernée

`/api/transcribe` servait **à la fois** la dictée au micro et l'import de
fichier. Gouverner l'import y aurait coupé la dictée — le cœur du produit — sur
une case cochée dans un panneau d'import.

```
/api/transcribe          dictée micro    aucune policy ne la ferme
/api/import/transcribe   import fichier  file_import_enabled
```

Deux routes, **un seul moteur** : `transcribe_audio()`. Rien n'est dupliqué —
ni le modèle, ni le comptage d'usage, ni la gestion d'erreur — et les deux
usages redeviennent distinguables, ce qu'ils n'auraient jamais dû cesser
d'être. Un test vérifie que fermer l'import laisse la dictée répondre.

---

## 10. Policies ≠ Packages

- **Policy** = une règle. « Les membres peuvent-ils utiliser les AI Skills ? »
- **Package** = du contenu distribué. Styles d'organisation, vocabulaire,
  modules publiés.

Les confondre ferait de la table de configuration un dépôt de contenu. Les
Packages viendront séparément.

---

## 11. Côté poste

```ts
resolveEffectiveCapabilities(base, policy)   // src/lib/organization/policy.ts
```

Le miroir exact de `resolve_effective_product_capabilities`. **Idempotent** : le
serveur filtre déjà ce qu'il annonce, et reposer la formule ne change rien — ce
qui permet de l'appliquer sans craindre un double effet.

Ce module n'est pas un second avis. Le serveur reste l'autorité pour toute
action qui passe par lui ; le poste s'en sert pour son interface et pour ce qui
se décide localement.

### Personal n'est jamais gouverné

```ts
if (input.edition === "personal") { /* input.policy est ignoré */ }
```

Nova Personal ne dépend d'aucun plan de contrôle. Lui laisser subir une
gouvernance d'organisation ferait dépendre le produit individuel d'un serveur
qu'il n'a pas. Deux tests le verrouillent.

### Version inconnue

Un poste qui reçoit un `schema_version` supérieur au sien **ne devine pas** : il
retombe sur les défauts permissifs et marque la policy `known: false`.
Interpréter des règles écrites selon un schéma qu'on ne connaît pas, ce serait
appliquer une gouvernance imaginaire — en ouvrant ce qui devait être fermé, ou
l'inverse.

---

## 12. Récupération, cache et hors ligne — dit honnêtement

Il n'y a **aucun nouveau cache**, et c'est délibéré.

Le poste conserve déjà la dernière réponse de `/api/config`, et cette réponse
porte des capacités **déjà filtrées par la policy**. Hors ligne, il applique
donc la dernière policy connue, sans qu'aucune infrastructure n'ait été ajoutée
pour cela.

Ses limites, sans les farder :

- ce n'est **pas** une application cryptographique. Un poste hors ligne applique
  ce qu'il a reçu ; qui contrôle la machine contrôle ce qu'elle affiche ;
- un poste resté longtemps hors ligne applique une policy périmée ;
- un poste **jamais** connecté n'a aucune policy et applique les défauts
  permissifs.

Ce qui tient dans tous les cas, c'est le refus serveur : les AI Skills viennent
du serveur, et un poste hors ligne n'en obtient aucune de toute façon.

Le rafraîchissement suit le cycle existant — démarrage, connexion, changement de
session. Pas de WebSocket, pas de SSE, pas de temps réel : une règle
d'organisation ne change pas à la seconde.

---

## 13. Audit

```
organization_policy.update
  { old_revision, new_revision, changed_keys }
```

**Enregistrer sans rien changer n'est pas un événement** : ni révision, ni ligne
d'audit. Une révision qui avance sans qu'aucune valeur ne bouge rend le compteur
illisible, et un journal qui note des non-événements finit par ne plus être lu.

Modifier quatre interrupteurs produit **une** révision et **une** ligne, dont
`changed_keys` porte exactement les quatre noms.

Les **noms** des clés modifiées, pas le document. Savoir que `ai_skills_enabled`
a bougé suffit ; recopier la configuration entière à chaque écriture ferait
grossir le journal sans rien apprendre de plus.

La mutation et sa trace partagent une transaction — les deux réussissent, ou
aucune. Un test simule l'échec de l'écriture d'audit et vérifie que la policy ne
subsiste pas.

---

## 14. Vie privée

Une policy est une **règle**. Elle ne contient aucune donnée de personne : ni
audio, ni texte dicté, ni prompt, ni presse-papiers, ni historique.

Ce n'est pas qu'une intention : le schéma n'accepte que des booléens déclarés.
Il est structurellement impossible d'y glisser du texte, donc impossible d'y
glisser des données. Un test tente d'y écrire une note libre et vérifie le
refus.

---

## 15. Ce qui n'est pas construit

- **historique, retour arrière, brouillons, déploiement progressif** — une
  révision n'est pas un versionnage produit ;
- **policies par groupe, par cohorte, par personne, par machine** — pas de
  moteur de précédence ; l'organisation entière, et rien d'autre ;
- **Packages, Styles publiés, vocabulaire distribué** (§ 10) ;
- **Nova Control, SCIM, SAML, passerelle privée.**
