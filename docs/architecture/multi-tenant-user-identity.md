# Identité multi-tenant

Pourquoi une adresse e-mail ne peut pas être l'identité d'une personne, et ce
que Nova utilise à la place.

Implémentation : `nova-server/main.py` § _Accès aux comptes_,
`nova-server/test_identity_migration.py`.

---

## 1. Le défaut

`users.email` était la **clé primaire globale**.

Tant qu'une instance servait une organisation, cela ne se voyait pas. Mais le
schéma affirmait une chose fausse : qu'une adresse désigne une personne, partout
et pour toujours. Deux conséquences.

**Deux organisations ne pouvaient pas compter chacune une `alex@example.com`.**
Ce sont pourtant deux personnes sans le moindre rapport — un lycée et un cabinet
d'architectes n'ont pas à se disputer une adresse. Aucun Control Plane
multi-tenant n'était possible tant que ce point tenait.

**Changer d'adresse revenait à changer d'identité.** Une personne qui se marie,
un établissement qui passe de `prenom.nom@` à `p.nom@`, et toute la ligne
bascule : sessions, appareils, dictionnaire, identités fédérées, journal d'audit.

---

## 2. Le modèle

```
user_id                              →  identité Nova, stable, opaque
(organization_id, normalized_email)  →  unicité, locale au tenant
email                                →  attribut, mutable
```

```sql
CREATE TABLE users(
    user_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL,             -- tel que saisi, casse d'affichage
    normalized_email TEXT NOT NULL,  -- forme de recherche et d'unicité
    ...
);
CREATE UNIQUE INDEX idx_users_org_email
    ON users(organization_id, normalized_email);
```

Aucune contrainte globale sur l'adresse. C'est l'objet de tout ce qui suit.

`user_id` n'est **jamais** dérivé de l'adresse : un identifiant calculé à partir
d'un attribut mutable n'est pas stable, il est seulement déguisé en stable. Un
test vérifie qu'aucune forme de l'adresse n'y apparaît.

---

## 3. Normalisation

**Espaces retirés, casse abaissée. Rien d'autre.**

La tentation serait d'aller plus loin : ignorer les points de Gmail, couper au
`+alias`, appliquer telle règle de tel opérateur. Ce serait une faute. Ces règles
appartiennent à un fournisseur, changent sans préavis, et ne valent pas dans un
domaine d'entreprise : `prenom.nom@exemple.fr` et `prenomnom@exemple.fr` y
désignent deux personnes. Normaliser au-delà du sûr **fusionne des comptes
distincts** — et l'on ne s'en aperçoit qu'une fois les données mélangées.

`lower()` et non `casefold()` : ce dernier applique des replis linguistiques
(`ß` → `ss`) qui, sur une adresse, changent le destinataire.

Conséquence directe : dans une même organisation, `alex@example.com` et
`Alex@Example.com` sont la même personne. Dans deux organisations, ce sont deux
personnes.

---

## 4. La migration

SQLite ne sait pas changer une clé primaire : la table est reconstruite.

1. lecture de tous les comptes ;
2. **contrôles préalables, avant toute écriture** (§ 5) ;
3. `user_id` manquant généré — un `user_id` existant n'est **jamais** régénéré ;
4. `normalized_email` calculé ;
5. table neuve, données recopiées, index unique créé ;
6. tables liées rattachées au `user_id` ;
7. bascule.

**Idempotente** : au second démarrage, la migration constate et sort. Trois
démarrages consécutifs laissent la base identique — testé.

**Sans perte** : aucune ligne supprimée, aucun `user_id` régénéré, aucune session
invalidée.

**Transactionnelle** : tout se déroule dans la transaction ouverte par `db()`.
Une exception avant le `commit` laisse la base exactement dans son état
d'origine — un test vérifie qu'après un arrêt sur collision, ni table de travail
ni compte disparu ne subsistent.

> **Avant une migration en production, sauvegardez la base.** Nova ne fabrique
> pas de sauvegarde automatique : le projet n'en fait nulle part ailleurs, et
> une sauvegarde bricolée donne une confiance qu'elle ne mérite pas.

---

## 5. Collisions : la migration s'arrête

L'ancienne clé primaire était sensible à la casse. `alex@example.com` et
`Alex@Example.com` pouvaient donc coexister — et deviennent, après
normalisation, un conflit.

| Situation                                                | Comportement           |
| -------------------------------------------------------- | ---------------------- |
| deux comptes, même adresse normalisée, même organisation | **arrêt**              |
| `user_id` dupliqué                                       | **arrêt**              |
| compte sans adresse                                      | **arrêt**              |
| même adresse, organisations différentes                  | accepté — c'est le but |

**Aucun gagnant n'est choisi.** Décider lequel des deux comptes perd son
historique n'est pas une décision technique, et personne ne s'en apercevrait
avant longtemps. Le message d'erreur porte une **empreinte tronquée** de
l'adresse, jamais l'adresse : un diagnostic ne doit pas recopier des données
personnelles dans les journaux d'exploitation.

---

## 6. Ce qui suit l'identité

| Table                                                          | Lien                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `tokens` (sessions)                                            | `user_id` + `organization_id`                                 |
| `admin_sessions`                                               | `user_id` + `organization_id` (depuis la Phase 22)            |
| `federated_identities`                                         | `user_id`                                                     |
| `usage`, `personal_dictionary`, `snippets`, `formatting_rules` | `user_id`                                                     |
| `admin_audit_log`                                              | `actor_user_id`                                               |
| `auth_codes`                                                   | `organization_id` — l'identité n'existe pas encore à ce stade |

L'adresse reste présente là où elle sert de repère lisible — un instantané, pas
un lien d'intégrité.

Le contrôle d'authentification part désormais du jeton et arrive directement au
compte : plus de recherche intermédiaire par adresse, qui pourrait tomber sur
l'homonyme d'un autre tenant.

**Sessions héritées** : les jetons écrits avant cette phase ne portent pas de
`user_id`. `backfill_user_references` les rattache au démarrage ; ceux dont le
compte n'existait pas encore restent résolus par adresse, mais **cadrés par
l'organisation du jeton**. Personne n'est déconnecté par la migration.

---

## 7. Identités fédérées

Inchangé dans son principe, et c'est le point : le rattachement ne reposait déjà
pas sur l'adresse.

```
microsoft_entra + tenant + oid       →  user_id
google_workspace + sub               →  user_id
oidc + issuer + sub                  →  user_id
```

Ce qui change : la recherche du compte à rattacher est **cadrée par
l'organisation du flux**. Chercher globalement rattacherait une identité
Microsoft au compte homonyme d'un autre tenant — deux personnes fusionnées en
silence, sans qu'aucune alerte ne se déclenche.

---

## 8. Rattachement de comptes

| Situation                                          | Décision                                                 |
| -------------------------------------------------- | -------------------------------------------------------- |
| identité fédérée connue                            | `user_id` exact                                          |
| compte historique, même organisation, même adresse | rattachement contrôlé                                    |
| identité fédérée d'une **autre** organisation      | `403 ORGANIZATION_MISMATCH`                              |
| même adresse dans une autre organisation           | **aucun rattachement** — un compte distinct est créé ici |
| même adresse chez deux fournisseurs                | jamais de fusion automatique                             |

La quatrième ligne est un **changement de comportement**. Avant, un compte
homonyme dans une autre organisation provoquait un refus. Désormais, la
connexion aboutit et crée un compte distinct dans l'organisation du flux.

La garantie est plus forte, pas plus faible : ce qui doit être impossible, c'est
qu'une connexion dans A **reprenne** le compte de B. Le test vérifie maintenant
que le compte de B est intact, que les deux `user_id` diffèrent, et qu'aucune
identité fédérée n'a été rattachée à B.

---

## 9. Changer d'adresse

`update_user_email(conn, user_id, email)` : le `user_id` ne bouge pas.

Sessions, identités fédérées, appareils, dictionnaire, rôle de sécurité et
journal d'audit restent rattachés à la même personne. L'interface n'existe pas
encore ; le modèle, lui, le permet — et des tests le verrouillent.

---

## 10. Rôle de sécurité

Le rôle appartient au compte, donc à l'organisation.

```
Org A : alex@example.com  →  organization_admin
Org B : alex@example.com  →  member
```

Aucune contamination. Accorder un rôle dans A ne change rien dans B ; le CLI
d'opérateur agit sur une organisation, jamais sur « le premier
`alex@example.com` trouvé ».

```bash
python admin_cli.py grant <email> <role> --organization <slug|id>
```

En mode `control_plane`, `--organization` devient **obligatoire** : une adresse
ne désigne une personne qu'à l'intérieur d'une organisation.

---

## 11. Dédié et Control Plane

En mode **dédié**, l'organisation active est injectée implicitement : le
comportement utilisateur ne change pas.

En mode **Control Plane**, aucune recherche de compte par adresse seule ne doit
subsister. La garantie est portée par la signature elle-même :

```python
def user_by_email(conn, organization_id: str, email: str):
    if not organization_id:
        raise ValueError("user_by_email exige une organisation")
```

L'organisation n'a pas de valeur par défaut. Une signature qui l'aurait rendue
facultative aurait laissé revenir, par distraction, exactement le défaut que
cette phase corrige.

---

## 12. Routes d'administration

`/api/admin/user/{email}` reste : en mode dédié, l'organisation active la
verrouille, et l'ambiguïté n'existe pas. Ces routes résolvent désormais le compte
puis agissent **par `user_id`** — un `DELETE ... WHERE email = ?` sans
organisation effacerait l'homonyme d'un autre tenant.

Pour le Control Plane, la forme cible est
`/api/control/organizations/{organization_id}/users/{user_id}`. Elle n'est pas
construite : cette phase migre le modèle de données, elle ne crée pas une API
utilisateurs.

---

## 13. Vers PostgreSQL

Rien dans ce schéma ne dépend de SQLite : `user_id` est un UUID généré par
l'application, l'unicité est un index explicite, aucun `rowid` implicite ni
`AUTOINCREMENT` n'entre dans l'identité.

La reconstruction de table décrite au § 4 est en revanche un **contournement
propre à SQLite** — PostgreSQL sait modifier une clé primaire en place. Le jour
du portage, la migration se réécrit ; le schéma cible, lui, ne bouge pas.

---

## 14. Ce qui n'est pas fait

- **interface de changement d'adresse** — le modèle est prêt, l'écran n'existe
  pas ;
- **API utilisateurs du Control Plane** (§ 12) ;
- **appartenances multiples** : une personne appartient à une organisation. Une
  même personne présente dans deux organisations, ce sont deux comptes avec deux
  `user_id`. Une table `organization_memberships` distincte serait nécessaire
  pour aller plus loin, et créerait une seconde source d'`organization_id` —
  à traiter comme une décision à part entière, pas comme un effet de bord ;
- **PostgreSQL, SCIM, policies, Nova Admin UI**.
