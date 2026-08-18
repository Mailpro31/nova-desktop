# Gestion des membres

Le cycle de vie d'un compte dans une organisation Nova — et la frontière qui
sépare administrer des accès de surveiller des personnes.

Complète [`admin-identity-management.md`](./admin-identity-management.md) et
[`nova-admin-foundation.md`](./nova-admin-foundation.md).
Implémentation : `nova-server/main.py` § *Membres de l'organisation*,
`nova-server/admin-web/src/pages/Members.tsx`.

---

## 1. La frontière, d'abord

Cet écran montre des **identités et des accès**. Il ne montre jamais ce que les
gens dictent : ni audio, ni transcription, ni prompt, ni presse-papiers, ni
« activité », ni « productivité ».

C'est ici que la tentation serait la plus forte. Un onglet de plus — « dernières
transcriptions », « fil d'activité » — et la console d'administration devient un
outil de surveillance des salariés. Techniquement à portée ; hors produit.

La frontière tient à trois endroits, pas seulement dans l'intention :

- la réponse serveur ne porte aucun champ de contenu ;
- l'écran l'affirme à l'écran, en tête de page ;
- des tests inspectent le code source, commentaires retirés, et échouent si un
  de ces mots apparaît dans un usage réel.

---

## 2. Ce que Nova Admin gère désormais

| Fonction | Route moderne |
|---|---|
| Liste et recherche | `GET …/members?query=&status=&limit=` |
| Fiche d'un membre | `GET …/members/{user_id}` |
| Suspendre / réactiver | `POST …/members/{user_id}/status` |
| Métier, groupe, note | `POST …/members/{user_id}/profile` |
| Déconnecter partout | `POST …/members/{user_id}/sessions/revoke` |
| Supprimer | `DELETE …/members/{user_id}` |

Toutes exigent `identity_manage`, donc `organization_admin`. `it_admin` gère la
machine, pas les personnes — la matrice de la Phase 22 tient sans exception
ajoutée.

**Toutes désignent un `user_id`.** Aucune route moderne ne vise une personne par
son adresse : depuis la Phase 23 elle est mutable et n'est unique que dans une
organisation.

### Liste sans terme : permise, mais bornée

Administrer suppose de voir qui est là — un listing vide sans recherche serait
inutilisable. Il est donc permis, **paginé et plafonné** (25 par défaut, 100 au
maximum). Ce qui reste interdit, c'est l'export : pas de « tout renvoyer », pas
de curseur illimité.

*(La recherche introduite en Phase 26 a fusionné avec cette route : deux
définitions pour la même URL se seraient disputé le routage, et une seule aurait
gagné en silence.)*

---

## 3. Métier et privilège, toujours séparés

```
users.role            → métier      student, teacher, staff, partner
users.security_role   → privilège   member, organization_admin, it_admin, read_only
```

L'écran des membres change le **métier**. Il ne peut pas toucher au privilège, et
ce n'est pas un oubli : les rôles d'administration se gèrent depuis leur propre
écran. Deux endroits qui modifient le même privilège finissent par diverger, et
l'un des deux oublie un garde-fou.

Un test parcourt les quatre métiers et vérifie qu'aucun n'élève quoi que ce soit.
C'est la règle posée en Phase 13, éprouvée là où on serait tenté de la contourner.

### Groupes

Le modèle actuel n'a qu'une notion : la **cohorte** historique, exposée comme un
groupe portant `source: "legacy_cohort"`. La source est explicite pour qu'un
futur groupe d'annuaire ne s'y confonde pas — et pour qu'il n'y ait jamais deux
sources de vérité.

Pas de synchronisation d'annuaire, pas de SCIM : ce sera une autre phase.

---

## 4. Suspendre, réactiver, supprimer

Trois gestes, trois portées, et il est facile de les confondre.

| | Suspendre | Déconnecter partout | Supprimer |
|---|---|---|---|
| Sessions coupées | ✅ | ✅ | ✅ |
| Peut se reconnecter | ❌ | ✅ **immédiatement** | ❌ |
| Compte conservé | ✅ | ✅ | ❌ |
| Identité fédérée | conservée | conservée | effacée |
| Journal d'audit | conservé | conservé | **conservé** |

**Réactiver ne restaure aucune session.** La personne se reconnecte. Lui rendre
ses anciens jetons serait la mauvaise façon de lui rendre son accès.

**Supprimer conserve le journal d'audit**, et c'est délibéré : il porte des actes
d'administration — qui a suspendu qui, quand — et non des données de dictée.
L'effacer reviendrait à effacer la trace de ce qui a été fait.

### Pourquoi la suppression existe malgré tout

Suspendre vaut mieux dans presque tous les cas. Mais « presque » n'est pas
« toujours » : une demande d'effacement est un droit, et sans chemin prévu elle
se ferait en SQL, à la main, sans trace. L'écran dit clairement que suspendre est
généralement le meilleur choix.

---

## 5. Ne pas se verrouiller dehors

Le garde-fou de la Phase 26 s'étend ici. Le dernier compte capable de
`identity_manage` ne peut être ni **suspendu**, ni **supprimé** — un compte
suspendu ne peut plus administrer, donc le suspendre ferme la porte aussi
sûrement que lui retirer son rôle.

```
409 ADMIN_LAST_IDENTITY_MANAGER
```

Côté serveur, toujours. L'interface désactive le bouton et explique ; c'est une
politesse, pas la protection.

---

## 6. Ce qui a disparu

La console héritée `admin.html` est **supprimée**, pas désactivée. Avec elle
partent sept routes et le drapeau `NOVA_LEGACY_ADMIN_UI` :

```
GET    /admin
GET    /api/admin/overview
GET    /api/admin/user/{email}
POST   /api/admin/user/{email}
POST   /api/admin/user/{email}/revoke-machines
DELETE /api/admin/user/{email}
POST   /api/admin/cohort/{cohort}/disable
```

Toutes désignaient une personne par son adresse. Toutes ont un équivalent
moderne, sauf la désactivation de cohorte — qui n'avait aucun appelant, pas même
dans la console qu'elle servait.

Garder un fichier mort « au cas où » finit par le voir revenir. Il est dans
l'historique Git si besoin.

### `require_admin`, code mort depuis la Phase 22

La fonction existait encore mais **aucune route ne l'utilisait** : la Phase 22
avait tout migré vers `require_admin_capability`. Elle donnait l'illusion d'un
second chemin d'autorisation. Retirée.

### Le compteur de sièges, restitué

Supprimer `/api/admin/overview` emportait la seule vue sur les sièges consommés.
Il est rendu dans `GET /api/control/organization` — un compteur **réel** : c'est
exactement celui qui refuse une connexion de plus quand le plafond est atteint.
Il compte des personnes, pas des sessions.

---

## 7. `X-Admin-Token` — ce qui le retient

Il n'authentifie plus aucune console : `admin_principal` l'accepte encore comme
chemin d'identification pour les **automatisations** qui en dépendent en mode
dédié.

| | |
|---|---|
| Mode `dedicated` | accepté, désactivable par `NOVA_LEGACY_ADMIN_TOKEN=false` |
| Mode `control_plane` | **refusé par construction** |
| Consommateur connu restant | scripts d'exploitation locaux |

**Condition de suppression** : quand aucun script d'exploitation ne l'utilise
plus. Il n'y a plus d'obstacle produit — seulement la vérification que rien
d'automatisé ne casse. Il ne porte aucune identité, et un journal d'audit
alimenté par lui n'écrit que « quelqu'un qui le détenait ».

---

## 8. Mutation et trace dans la même transaction

Dette P1 de la Phase 26, réglée ici.

`record_admin_action` accepte désormais la connexion de l'appelant : l'écriture
d'audit entre dans **la transaction de la mutation**. Les deux réussissent, ou
aucune.

Auparavant, une panne entre les deux laissait une mutation sans trace. Moins
grave qu'un journal affirmant une action qui n'a pas eu lieu — mais le journal
servira un jour à répondre à « qui a désactivé ce compte ? », et une réponse
incomplète y est mauvaise.

Un test simule l'échec de l'écriture d'audit et vérifie que la mutation ne
subsiste pas.

Les appels qui ne mutent rien — l'ouverture d'une session d'administration —
gardent leur connexion propre.

---

## 9. Provisionnement

Nova Admin **ne crée personne**. Les comptes naissent à la première connexion
SSO, selon la politique d'admission existante : identité vérifiée, organisation
autorisée, domaine d'adresse admis. La console n'en contourne aucune étape.

Inviter, importer, synchroniser un annuaire : autant de choses qui relèvent du
provisionnement, et qui viendront avec SCIM.

---

## 10. Événements d'audit ajoutés

`member.disable`, `member.enable`, `member.type_change`, `member.group_change`,
`member.sessions_revoke`, `member.delete`.

Métadonnées : noms de champs, statuts, nombre d'appareils. Jamais de secret, de
jeton, ni le moindre contenu.

---

## 11. Ce qui n'est pas construit

- **SCIM et synchronisation d'annuaire** (§ 9) ;
- **groupes réels** — la cohorte historique reste la seule notion (§ 3) ;
- **invitation, import de masse** ;
- **suppression de `X-Admin-Token`** — il ne tient plus qu'à la vérification des
  automatisations (§ 7) ;
- **step-up par action** pour les gestes destructeurs ;
- **Policies, Packages, Nova Control, passerelle privée.**
