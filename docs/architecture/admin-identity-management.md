# Gestion des administrateurs

Qui peut nommer un administrateur, comment on l'empêche de fermer la porte
derrière lui, et ce que le journal d'audit retient.

Complète [`control-plane-admin-auth.md`](./control-plane-admin-auth.md) et
[`nova-admin-foundation.md`](./nova-admin-foundation.md).
Implémentation : `nova-server/main.py` § *Administrateurs de l'organisation*,
`nova-server/admin-web/src/pages/Administrators.tsx`.

---

## 1. Deux chemins, deux rôles

```
LIGNE DE COMMANDE (opérateur)        NOVA ADMIN (client)
        ↓                                    ↓
  premier administrateur            administrateurs suivants
  récupération d'urgence            gestion courante
```

Le **premier** administrateur continue de naître de `admin_cli.py`, sur le
serveur. Deux raisons, et la seconde est la moins évidente :

- un endpoint « faites de moi un administrateur » reste une porte dérobée,
  quelles que soient les conditions qu'on lui ajoute ;
- c'est **le chemin de récupération**. Quand plus personne ne peut se connecter —
  fournisseur cassé, dernier administrateur parti sans successeur — il faut une
  issue qui ne dépende ni du SSO ni d'une session.

Nova Admin gère tout le reste : nommer, changer, retirer. La console l'annonce à
l'écran, sans quoi on chercherait un bouton qui n'existera jamais.

---

## 2. Ce que la console fait, et ne fait pas

| | |
|---|---|
| Attribuer un rôle à un compte existant | ✅ |
| Changer le rôle d'un administrateur | ✅ |
| Retirer l'accès d'administration | ✅ |
| **Créer** une personne | ❌ |
| Inviter, provisionner, SCIM | ❌ |

Un `user_id` inconnu renvoie `404`. Créer des comptes relève du provisionnement,
pas de la gestion des privilèges — mélanger les deux ferait de cet écran l'endroit
où l'on crée des gens, et ce n'est pas ce qu'il est.

**Retirer l'accès n'est pas supprimer.** La personne garde son compte Nova et
continue de dicter ; elle cesse d'administrer. Le texte de confirmation le dit,
parce que les deux gestes se confondent facilement dans une console.

---

## 3. Tout passe par `user_id`

L'adresse est **affichée** — sans elle, on ne saurait pas de qui il s'agit — mais
elle n'identifie rien. Chaque mutation désigne un `user_id`.

Depuis la Phase 23, une adresse est un attribut mutable et n'est unique que dans
une organisation. Muter un privilège en la désignant reviendrait à viser une
cible qui bouge, et en multi-tenant à viser l'homonyme d'un autre tenant.

Ce que la liste ne renvoie **jamais** : jeton, secret, sujet externe, tenant.
Rien de tout cela n'aide à décider qui doit administrer.

---

## 4. Le client nomme un rôle, le serveur en déduit les capacités

```jsonc
{ "security_role": "it_admin" }     // tout ce que le navigateur envoie
```

Aucune capacité ne transite depuis le client. En accepter reviendrait à laisser
le navigateur écrire la matrice d'autorisation. Un test envoie délibérément une
liste de capacités avec la requête et vérifie qu'elle est ignorée.

### Pas d'auto-élévation, sans contrôle spécial

Attribuer un rôle exige `identity_manage`, que seul `organization_admin` possède.
Un `it_admin` ne peut donc pas s'élever lui-même — **la matrice l'interdit, pas
une règle ajoutée**. C'est mieux ainsi : une règle spéciale s'oublie, une matrice
se relit.

| | `organization_admin` | `it_admin` | `read_only` |
|---|:--:|:--:|:--:|
| Gérer les administrateurs | ✅ | — | — |
| Lire le journal d'audit | ✅ | — | — |

---

## 5. Le dernier gestionnaire ne peut pas partir

```
POST …/administrators/{user_id}/role  →  409 ADMIN_LAST_IDENTITY_MANAGER
```

Retirer `identity_manage` au dernier compte qui le porte fermerait la porte à
toute nomination future — y compris pour celui qui vient de cliquer. La seule
issue serait la ligne de commande, sur le serveur.

Ce n'est pas de la prudence excessive : le cas arrive naturellement quand un
administrateur unique se rétrograde « pour voir ». Trois subtilités :

- **passer à `it_admin` compte aussi** : ce rôle n'a pas `identity_manage` ;
- **un compte suspendu ne compte pas** — il ne peut plus administrer, il ne peut
  donc pas justifier le départ du dernier gestionnaire actif ;
- **la protection vit dans le serveur.** L'interface désactive le bouton et
  affiche pourquoi, mais ce n'est qu'une politesse : le serveur refuse de toute
  façon.

Se retirer reste possible **après** avoir nommé un successeur — l'ordre naturel.

---

## 6. Changer un rôle ferme les sessions

Une session d'administration ouverte porte des capacités devenues fausses. Elle
est donc révoquée immédiatement, et la personne repasse par une
réauthentification qui relira son rôle réel.

L'alternative — laisser vivre une session avec des droits qu'elle n'a plus —
serait exactement ce que la Phase 22 s'est employée à éviter.

---

## 7. Nova Admin n'est pas Nova Control

`organization_admin` gère **son** organisation. Aucune route de cette phase ne
liste, ne cherche ni ne modifie quoi que ce soit ailleurs : un identifiant venu
d'un autre tenant renvoie `404`, indistinguable d'un identifiant faux.

L'outil de l'équipe Nova — celui qui verrait plusieurs organisations — reste non
construit, et le restera séparément.

### Recherche de comptes, volontairement étroite

Choisir qui nommer suppose de le trouver. La recherche partage désormais sa
route avec la liste des membres (Phase 27) : **paginée et plafonnée**, elle se
restreint quand on lui donne un terme. Ce qui reste interdit, c'est l'export —
un annuaire complet exporté est exactement ce qu'on ne veut pas laisser derrière
soi. Voir [`member-management.md`](./member-management.md).

---

## 8. Journal d'audit

```
GET …/audit?limit=25&before=<timestamp>&action=<action>
```

Lecture seule, `security_manage` exigé. Pas de capacité dédiée : lire qui a
changé quoi relève de la surveillance de la sécurité, et ajouter une capacité par
écran finirait par rendre la matrice illisible.

**Pagination obligatoire** — 50 par défaut, 100 au maximum. Renvoyer la table
entière marcherait le premier mois puis deviendrait un téléchargement, et un
journal qu'on ne peut pas parcourir n'est pas consulté. Le curseur est un
horodatage, plus stable qu'un décalage numérique que chaque nouvelle ligne
décalerait.

**Actions lisibles** : `admin_role.grant` s'affiche « Granted administrator
role ». Un identifiant technique seul obligerait à connaître le code pour lire
son propre journal.

Événements ajoutés : `admin_role.grant`, `admin_role.change`,
`admin_role.revoke`, avec l'ancien et le nouveau rôle. Les rôles ne sont pas des
secrets, et les inscrire rend le journal utile. L'adresse, elle, n'y est pas :
`user_id` suffit à retrouver la personne, et une adresse peut changer.

### Ce qui n'y entre jamais

Secret, jeton, code d'autorisation, `id_token`, `nonce`, `auth_time`, audio,
texte dicté, prompt. Le filtrage a lieu **à l'écriture**, depuis la Phase 22 : la
vue ne fait que lire ce qui a déjà été jugé sûr.

### Immuabilité, dite honnêtement

Le journal est en ajout seul **par l'application** : aucune route ne le modifie
ni ne le supprime, et l'interface l'affiche. Mais SQLite ne protège pas un
fichier de celui qui le détient, et la console le dit à l'écran plutôt que de
laisser croire à une garantie qui n'existe pas.

### Écriture et transaction

Depuis la **Phase 27**, `record_admin_action` accepte la connexion de l'appelant :
la mutation et sa trace partagent une transaction, et les deux réussissent ou
aucune. Les appels qui ne mutent rien gardent leur connexion propre.

---

## 9. La console héritée — supprimée

`admin.html` a été **supprimée en Phase 27**, avec ses sept routes et le drapeau
`NOVA_LEGACY_ADMIN_UI`. Sa condition de départ — que Nova Admin gère les
membres — était remplie. Voir [`member-management.md`](./member-management.md).

Le jeton partagé a été retiré en **Phase 28** : l'administration n'a plus qu'un
seul chemin. Voir
[`control-plane-admin-auth.md`](./control-plane-admin-auth.md) § 10.

---

## 10. Réauthentification par action

Les mutations de rôle utilisent la session d'administration déjà obtenue par
step-up. Redemander une authentification à chaque changement rendrait la gestion
courante pénible sans rien ajouter : la session est déjà courte et révocable.

Certaines actions mériteront un step-up dédié — se nommer soi-même, faire tourner
un secret, une opération destructrice. Le mécanisme existe depuis la Phase 24 ;
la granularité, non.

---

## 11. Ce qui n'est pas construit

- ~~**gestion des membres**~~ ✅ **faite en Phase 27** ;
- **invitation et provisionnement** de personnes, SCIM ;
- **step-up par action** (§ 10) ;
- ~~**audit dans la même transaction que la mutation**~~ ✅ **fait en Phase 27** ;
- **filtres d'audit avancés** : action et curseur seulement, pas de moteur de
  recherche ;
- **Policies, Packages, Nova Control, passerelle privée.**
