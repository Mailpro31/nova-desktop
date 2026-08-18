# Réauthentification d'administration

Pourquoi une session Nova valide ne suffit pas à administrer une organisation, et
ce que Nova exige à la place.

Complète [`control-plane-admin-auth.md`](./control-plane-admin-auth.md).
Implémentation : `nova-server/main.py` § *Réauthentification (step-up)*.

---

## 1. Le défaut corrigé

Jusqu'ici, ouvrir une session d'administration demandait deux choses : une
session Nova valide, et un rôle d'administration.

Une session Nova vit trente jours. Elle prouve qu'une authentification a eu lieu
— peut-être il y a trois semaines, sur un poste depuis prêté, éteint, ou volé.
Elle ne prouve pas qu'une personne est là.

```
session utilisateur vieille de 3 semaines
    → POST /api/admin/session
    → session d'administration   ← ce qu'il ne faut plus
```

Le jeton de session était donc suffisant pour reconfigurer l'organisation : le
faire fuiter — par un cache, une sauvegarde, un poste non verrouillé —
équivalait à donner les clés de l'administration.

---

## 2. Modèle de menace

**L'attaquant détient le jeton de session Nova d'un administrateur.** Rien de
plus : il n'a pas les identifiants de la personne chez son fournisseur
d'identité, et ne peut pas s'y authentifier à sa place.

| Ce qu'il obtient | Ce qu'il n'obtient pas |
|---|---|
| dicter, lire son profil | ouvrir une session d'administration |
| **commencer** un step-up (une URL) | produire une preuve d'identité |
| — | une preuve *fraîche* |
| — | une preuve résolvant *le même compte* |

Cette nuance est volontaire : démarrer un step-up ne donne rien. La preuve doit
venir de l'IdP, être récente, et désigner exactement le même `user_id`. Un test
dédié en fait la propriété centrale de la phase.

---

## 3. Le parcours

```
session Nova valide
    ↓  POST /api/admin/step-up/start
rôle, statut du compte, statut de l'organisation vérifiés
    ↓  flux OIDC avec max_age + prompt=login
navigateur → l'IdP réauthentifie la personne
    ↓  POST /api/admin/step-up/complete
signature, émetteur, audience, nonce, tenant vérifiés
    ↓
auth_time récent          ← le contrôle qui porte la phase
même identité fédérée → même user_id
rôle et statut relus une seconde fois
    ↓
session d'administration
```

**Aucun jeton intermédiaire** entre la preuve et la session. Un secret de plus
serait un secret de plus à voler, sans rien apporter : la session peut être
créée là où la preuve est vérifiée.

Une confirmation d'interface — « Êtes-vous sûr ? [Continuer] » — ne serait
évidemment pas une réauthentification. Ce n'est pas ce qui est construit ici.

---

## 4. `auth_time`, et non « le jeton est récent »

C'est le cœur du mécanisme, et la distinction se manque facilement.

Un IdP peut réémettre un jeton d'identité **parfaitement valide, à l'instant**,
à partir d'une session de navigateur ouverte depuis plusieurs jours, sans rien
demander à personne. « Le jeton vient d'être émis » ne dit donc rien sur la
présence de la personne.

Seule la revendication `auth_time` dit **quand elle s'est authentifiée**.

| Cas | Décision |
|---|---|
| `auth_time` frais | accepté |
| `auth_time` absent | **refusé** — `ADMIN_STEP_UP_TOO_OLD` |
| `auth_time` trop ancien | refusé |
| `auth_time` dans le futur au-delà de la tolérance | refusé |
| valeur illisible | refusé |

Le refus sur **absence** mérite d'être justifié : OpenID Connect impose à l'OP
de renvoyer `auth_time` dès lors que `max_age` a été demandé. Un fournisseur qui
ne le fait pas ne permet pas de vérifier la fraîcheur — et l'on ne peut pas
accorder une élévation de privilège sur une propriété invérifiable. **La sécurité
passe avant la compatibilité**, et le prix est explicite : un IdP non conforme ne
peut pas servir à administrer Nova.

---

## 5. `max_age` et `prompt`

Les deux paramètres sont envoyés, et ils ne jouent pas le même rôle.

- **`max_age=300`** est celui qui compte. Standard OpenID Connect : il oblige
  l'OP à réauthentifier si la dernière authentification est plus ancienne, **et**
  à renvoyer `auth_time`. C'est lui qui rend la fraîcheur vérifiable ;
- **`prompt=login`** demande une interaction. Microsoft et Google le documentent
  tous deux, et il évite qu'un OP interprète `max_age` avec largesse.

Mais le serveur ne vérifie jamais la *présence* du paramètre — un IdP hostile ou
négligent pourrait l'ignorer. **Il vérifie `auth_time`**, la seule chose qui soit
une preuve plutôt qu'une demande.

Fenêtre : 300 s par défaut, bornée entre 60 et 900 s
(`NOVA_ADMIN_STEP_UP_MAX_AGE_SECONDS`). Assez pour traverser un parcours MFA sans
se presser ; trop court pour qu'une session de navigateur de la veille passe pour
une présence. Tolérance d'horloge : 60 s — les horloges divergent, mais au-delà
un `auth_time` futur n'est pas une dérive, c'est une revendication qui ment.

Une connexion ordinaire n'envoie ni l'un ni l'autre : redemander une
authentification à chaque dictée serait absurde.

---

## 6. La même personne

Le navigateur peut très bien être connecté à un autre compte de la même
organisation — c'est même le cas de figure le plus courant sur un poste partagé.

**Même organisation ne suffit pas. Même adresse ne suffit pas.** L'identité
fédérée prouvée doit résoudre exactement le même `user_id` que celui qui a ouvert
le parcours.

| Fournisseur | Ce qui est comparé |
|---|---|
| Microsoft Entra | `oid` + tenant déclaré |
| Google Workspace | `sub` |
| OIDC générique | `issuer` + `sub` |

L'adresse n'intervient jamais : elle n'a jamais été un identifiant, et depuis la
Phase 23 elle est même mutable.

### Aucun rattachement pendant un step-up

Si l'identité prouvée est inconnue, elle le reste. Le step-up **ne crée jamais**
un compte, une identité fédérée ou une appartenance. Une élévation de privilège
est le pire moment concevable pour lier un compte en silence — un test vérifie
qu'après une tentative avec une identité inconnue, ni la table des comptes ni
celle des identités n'ont bougé.

---

## 7. Le fournisseur n'est pas choisi par le client

Il est déterminé par l'identité **vérifiée** que le compte possède déjà.

Laisser le client le désigner permettrait de contourner l'IdP réel de
l'organisation en pointant vers un fournisseur plus complaisant. La requête de
step-up ne comporte donc aucun champ de fournisseur.

Seules les identités `verified` comptent — celles dont la signature, l'émetteur,
l'audience et le `nonce` ont été vérifiés.

---

## 8. Ce qui ne permet pas d'administrer

**Code à usage unique par courriel** (`legacy_email_code`) →
`ADMIN_STEP_UP_UNSUPPORTED`.

Un code reçu par courriel prouve l'accès à une boîte aux lettres, pas une
authentification d'entreprise : ni MFA, ni accès conditionnel, ni politique
d'organisation. C'est acceptable pour dicter ; ce ne l'est pas pour reconfigurer
une organisation.

**Le compromis est assumé et il a un prix** : un pilote qui n'utiliserait que le
code e-mail n'a aucun administrateur moderne. La réponse est de déclarer un
fournisseur SSO, pas d'affaiblir l'élévation de privilège.

**Device Code hérité** → même refus. Il produit des identités `transport_only` :
des revendications lues sans vérifier la signature. Elles ne prouvent rien. Un
compte qui possède par ailleurs une identité Microsoft vérifiée passera par le
parcours moderne de ce même fournisseur.

---

## 9. Séparation des flux

Le flux SSO partagé porte désormais un **but** : `login` ou `admin_step_up`.

Un retour de connexion ordinaire ne devient jamais une preuve d'administration ;
un retour de step-up n'ouvre jamais une session utilisateur. Les deux sens sont
testés, et le refus est explicite (`FLOW_PURPOSE_MISMATCH`) plutôt que silencieux.

La tentative retient aussi le `user_id` attendu : un parcours ouvert par
quelqu'un d'autre ne peut pas être terminé à sa place.

**Usage unique**, par la même réservation atomique que la Phase 20 : un second
retour avec le même identifiant échoue. Deux step-up simultanés restent
possibles et indépendants — ils ne partagent ni `nonce`, ni `state`.

Un parcours abandonné — navigateur fermé — expire simplement. Aucune session
n'est ouverte, et il n'y a rien de plus à faire.

---

## 10. L'état est relu à la fin

Entre le début et la fin du parcours, tout peut changer. Le rôle, le statut du
compte, celui de l'organisation et la configuration du fournisseur sont donc
revérifiés **après** la preuve.

Une réauthentification réussie ne rattrape pas un privilège retiré entre-temps.
Quatre tests : rôle révoqué, compte désactivé, organisation suspendue,
configuration de fournisseur désactivée — aucun n'ouvre de session.

---

## 11. Après le step-up

La session d'administration garde ses durées de la Phase 22 : 4 h absolues,
30 min d'inactivité. **Une authentification fraîche n'achète pas une session
éternelle.**

`auth_time` **n'est pas** revérifié à chaque appel : il sert à *ouvrir* la
session, laquelle prend ensuite le relais avec ses propres expirations et
révocations. Redemander une preuve à chaque requête rendrait l'administration
inutilisable sans rien ajouter.

### À venir : step-up par action

Certaines actions mériteront une nouvelle preuve **pendant** une session
d'administration — accorder un rôle d'administration, faire tourner un secret,
déclencher une opération destructrice. La granularité n'est pas construite ; le
mécanisme, lui, existe désormais.

---

## 12. MFA : ce que Nova sait, et ce qu'il ne sait pas

**Nova ne sait pas** si l'IdP a demandé un mot de passe, un second facteur, une
clé d'accès, ou rien du tout.

**Nova sait** qu'une authentification valide auprès de l'IdP a eu lieu récemment,
selon `auth_time` et les paramètres demandés.

La politique reste chez le fournisseur, et c'est le bon endroit : il la connaît,
la met à jour, et l'applique uniformément. Pour Microsoft Entra, l'accès
conditionnel s'applique pendant le step-up — Nova ne tente pas de le reproduire,
ce qui reviendrait à en réimplémenter une version périmée.

---

## 13. Limite : `X-Admin-Token`

Le jeton d'administration hérité **contourne nécessairement le step-up**. Il
n'est rattaché à aucune personne, donc à aucune identité à reprouver.

**Jeton hérité ≠ sécurité d'administration moderne.** Tant qu'il est activé, la
propriété décrite ici ne vaut pas pour lui : c'est un P1 connu, et il est refusé
par construction en mode Control Plane.

Recommandation explicite : en production dédiée, `NOVA_LEGACY_ADMIN_TOKEN=false`
une fois le premier administrateur déclaré.

Le CLI d'opérateur, lui, ne change pas : il attribue un rôle, il n'ouvre aucune
session. Son titulaire devra ensuite se connecter par SSO puis passer le step-up.

---

## 14. Modèle web futur

```
Nova Admin (web) → SSO → session utilisateur
                       → ouverture de la console → step-up
                       → session d'administration en cookie HttpOnly
```

Le backend expose aujourd'hui un jeton `Bearer`, ce qui convient aux tests et à
une console qui garde son jeton en mémoire. La cible reste le cookie
`HttpOnly` + `Secure` + `SameSite`, avec protection CSRF explicite — voir
[`control-plane-admin-auth.md`](./control-plane-admin-auth.md) § 15. Rien de ce
choix n'affecte le Desktop, qui n'appelle aucune de ces routes.

---

## 15. Journalisation

Journalisé : le but, le type de fournisseur, l'issue, le motif de refus, un
`user_id` tronqué, l'identifiant de corrélation.

Jamais : code d'autorisation, `id_token`, jeton d'accès, `nonce`, `flow_id`,
jeton d'administration, adresse e-mail, ni la valeur exacte d'`auth_time`.

Audit : `admin_step_up.success` et `admin_session.create`. Les échecs sont
journalisés avec leur motif mais **pas** écrits dans l'audit — un parcours
abandonné ou une horloge décalée produiraient un volume qui noierait ce qui
compte.

---

## 16. Ce qui n'est pas fait

- **validation réelle Google et OIDC** : ils empruntent le même moteur, et les
  tests couvrent la sélection du fournisseur et le cadrage par émetteur, mais
  aucun environnement réel n'était disponible ;
- **step-up par action** (§ 11) ;
- **Nova Admin UI** — le backend est prêt, l'interface n'existe pas ;
- **acr / amr** : Nova pourrait à terme exiger une méthode d'authentification
  précise (`acr_values`). Cela suppose de connaître les valeurs publiées par
  chaque IdP, et de les configurer par organisation. `auth_time` d'abord ;
- **limitation d'appels** sur le démarrage de step-up : exigence de passerelle,
  comme ailleurs.
