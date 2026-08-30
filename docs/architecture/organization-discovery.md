# Organization Discovery

Comment un poste trouve son organisation sans qu'on lui demande une adresse.
Première brique publique du futur Control Plane — complète
[`control-plane-foundation.md`](./control-plane-foundation.md).

Implémentation : `nova-server/main.py` § _Découverte d'organisation_,
`src-tauri/src/organization_discovery.rs`.

---

## 1. Le problème

Un poste apprenait jusqu'ici où joindre son organisation par une **adresse** :
déposée par la DSI dans `campus-config.json`, ou saisie par l'utilisateur.

Une adresse est une mauvaise chose à demander. Elle est longue, elle expose une
topologie, elle change quand l'organisation déménage — et elle se trompe en
silence. La recette réelle de la Phase 16 s'est arrêtée net sur un port erroné,
sans le moindre message utile : les sondes échouaient, aucun bouton
n'apparaissait, et rien n'indiquait pourquoi.

La découverte remplace **« où est votre serveur ? »** par **« quelle est votre
organisation ? »**.

---

## 2. Modèle de menace

L'endpoint de découverte est **public** : personne n'est authentifié quand il
l'appelle. Deux propriétés en découlent.

**Il ne donne aucun accès.** Connaître l'identifiant d'une organisation ne
permet rien — ce n'est pas une donnée d'authentification, et le SSO reste
entièrement devant.

**Il ne doit pas devenir un annuaire des clients de Nova.** C'est le risque
propre à cette brique : un endpoint qui répond différemment selon qu'une
organisation existe, est suspendue ou n'a rien publié devient un oracle. On y
testerait des noms d'entreprises pour savoir lesquelles sont clientes, et
lesquelles ont cessé de payer. Ce n'est l'affaire de personne.

| Menace                                        | Réponse                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Énumération des clients                       | réponse **identique** dans tous les cas négatifs                 |
| Recherche, liste, complétion                  | **n'existent pas** — on demande une organisation précise         |
| Constitution de listes via les journaux       | l'identifiant demandé **n'est pas journalisé**                   |
| Réponse hostile détournant l'authentification | adresse revalidée par le **poste**, pas seulement par le serveur |
| Fuite d'infrastructure                        | réponse réduite à quatre champs                                  |

---

## 3. Identifiant de découverte

Un **slug** court et public : `ecole-exemple`, `acme`. Normalisé, insensible à la
casse et aux espaces — un code recopié depuis un courriel ne doit pas échouer
sur une majuscule.

Ce n'est **pas** une donnée d'authentification. `novaspeak.app/o/ACME` peut
être un lien public sans que cela ouvre quoi que ce soit.

**Immuable une fois la découverte activée.** Le changer invaliderait d'un coup
le code que portent tous les postes déjà déployés, et aucun mécanisme d'alias
n'existe pour amortir cela. Désactiver la découverte d'abord rend le changement
possible — et explicite.

---

## 4. Le contrat public

```
POST /api/discovery/organization
{ "organization": "ecole-exemple" }
```

```jsonc
{
  "contract_version": 1,
  "organization": { "slug": "ecole-exemple", "display_name": "École Exemple" },
  "deployment_mode": "dedicated",
  "service_endpoint": "https://nova.exemple.fr",
}
```

Quatre champs, vérifiés par test. **Absents volontairement** : l'identifiant de
tenant interne, le tenant Microsoft, le domaine Google, l'émetteur OIDC, les
identifiants clients. Rien de tout cela n'aide un poste à joindre son
organisation, et tout cela renseignerait quiconque interroge l'endpoint.

L'identifiant est envoyé dans le **corps** plutôt que dans l'URL : il n'est pas
secret, mais il n'a pas besoin de se retrouver dans les journaux de chaque
intermédiaire réseau.

### Une seule source de vérité pour les fournisseurs

La découverte ne liste **pas** les fournisseurs d'identité. Elle donne l'adresse,
et le poste appelle ensuite `/api/auth/providers` — qui reste l'autorité depuis
la Phase 19. Dupliquer cette liste créerait deux vérités qui divergeraient.

### Toutes les issues négatives se ressemblent

Organisation inconnue, découverte désactivée, organisation suspendue, adresse
absente, adresse invalide → **`404 ORGANIZATION_NOT_AVAILABLE`**, réponse
octet pour octet identique. Un test compare les cinq.

---

## 5. Adresse de service

Validée **deux fois** : par le serveur avant de l'annoncer, par le poste avant
de s'y fier. Les deux contrôles protègent contre des fautes différentes — une
configuration erronée d'un côté, une réponse hostile de l'autre.

| Refusé                                                                         | Motif                |
| ------------------------------------------------------------------------------ | -------------------- |
| `http://` en production                                                        | `scheme_not_https`   |
| `file://`, `ftp://`, `javascript:`, `data:`                                    | `scheme_not_allowed` |
| identifiants dans l'URL                                                        | `credentials_in_url` |
| requête ou fragment                                                            | `not_a_base_url`     |
| `localhost`, `127.0.0.0/8`, `10/8`, `192.168/16`, `172.16-31/12`, `169.254/16` | `local_host`         |

Une adresse locale annoncée en production signifie que quelque chose s'est
substitué au service : le poste ne doit pas y envoyer sa session. Le
développement dispose d'un assouplissement explicite, qui est un **paramètre du
poste** — et, côté serveur, un paramètre d'exploitation. Jamais une valeur venue
du réseau.

Les motifs ci-dessus sont ceux du poste. Le serveur applique la même politique
en réutilisant `host_is_publicly_routable`, le contrôle réseau écrit pour le
SSRF de l'adaptateur OIDC : il résout le nom et refuse dès qu'**une seule** des
adresses obtenues est interne — un nom qui résout à la fois vers une adresse
publique et vers une adresse interne servirait de pont. Il nomme ce refus
`internal_address`, et couvre en plus l'IPv6 link-local, les adresses
non spécifiées, réservées et multicast.

Une différence assumée entre les deux côtés : le serveur **n'exige pas** que le
nom soit résolvable. Il annonce cette adresse, il ne la contacte pas — et un
service peut n'être joignable que depuis le réseau des postes. Refuser sur une
non-résolution rendrait la découverte indisponible pour un déploiement sain.
L'adaptateur OIDC, lui, l'exige, parce qu'il va réellement émettre la requête.
Une IP littérale interne ou un nom en `localhost` restent refusés sans qu'aucun
DNS n'ait à répondre.

---

## 6. Confiance dans la découverte

Le transport suffit : HTTPS vers un domaine Nova authentifie l'origine et
protège l'intégrité. **Aucune signature applicative n'a été ajoutée** — elle
n'apporterait rien tant que le poste fait déjà confiance à TLS pour tout le
reste de ses échanges, et fabriquer une crypto maison pour s'en convaincre
serait un coût sans contrepartie.

Ce qui protège réellement, c'est la validation de l'adresse annoncée : même une
réponse authentique ne peut pas envoyer le poste n'importe où.

---

## 7. Deux modes de déploiement

### A. Dédié — le mode actuel

Une instance sert **une** organisation. Le résolveur le fait respecter
littéralement : même si la base contenait d'autres organisations — import, test,
erreur — il ne résout que celle que l'instance sert. Un serveur dédié qui
répondrait pour ses voisines serait un multi-tenant accidentel, sans aucun des
contrôles qui vont avec. Testé.

### B. Control Plane — à venir

`OrganizationDiscoveryResolver` est un contrat ; `DedicatedOrganizationResolver`
en est la seule implémentation. Un plan de contrôle en ajoutera une seconde sans
changer le contrat public.

---

## 8. Configuration déposée par la DSI

`%ProgramData%\Nova\campus-config.json` accepte désormais **deux schémas** :

```jsonc
// historique — inchangé, les pilotes continuent de fonctionner
{ "server_url": "https://nova.exemple.fr" }

// découverte
{ "organization_code": "ecole-exemple", "bootstrap_mode": "discovery" }
```

Priorité : configuration machine → bootstrap mémorisé → saisie utilisateur. Un
poste géré par la DSI n'a donc rien à saisir du tout.

---

## 9. Trousseau — un défaut corrigé au passage

L'audit a trouvé un défaut que la découverte rendait inévitable.

L'emplacement d'une session dans le trousseau du système était dérivé de
**l'adresse du serveur** : `SHA-256(server_url | email)`. Correct tant qu'une
organisation avait une adresse fixe — mais la découverte rend le déménagement
banal, et un changement d'adresse **perdait silencieusement la session**. Le
poste redemandait une connexion sans que personne comprenne pourquoi.

La clé suit désormais l'**identité de l'organisation**, qui ne change pas quand
son hébergement change.

**Compatibilité** : les sessions créées avant la découverte n'ont pas
d'organisation ; elles gardent leur clé historique et continuent de fonctionner.
Aucune migration forcée, aucune reconnexion imposée. Trois tests couvrent les
trois cas — rotation d'adresse, deux organisations distinctes, session héritée.

---

## 10. Rotation d'adresse et session

Une organisation peut changer d'adresse sans changer d'identité :
`organization_id`, appartenances et identités fédérées sont intacts.

Le poste adopte la nouvelle adresse à la découverte suivante et conserve sa
session — c'est précisément ce que la correction du trousseau rend possible. Si
la session n'était pas reconnue par le nouveau service, le parcours SSO
habituel reprend ; il n'y a pas de boucle de reprise.

---

## 11. Ce que Nova apprend

Appeler la découverte révèle au service que **« ce poste cherche l'organisation
X »**. C'est une métadonnée réelle, et il faut le dire plutôt que prétendre le
contraire.

En revanche, **aucun contenu de travail** ne passe par ce chemin : ni audio, ni
texte dicté, ni prompt. C'est la frontière posée dans
[`control-plane-foundation.md`](./control-plane-foundation.md), et la découverte
est la première brique à devoir la respecter.

Journalisation : résultat générique, mode, version. **Pas** l'identifiant
demandé — accumuler les recherches infructueuses reviendrait à constituer la
liste des organisations que l'on cherche à joindre.

---

## 12. Limitation d'appels

Aucune n'est implémentée, et il ne faut pas prétendre le contraire : un
limiteur en mémoire de processus ne limiterait rien derrière plusieurs workers,
tout en donnant l'illusion d'une protection.

C'est une **exigence de passerelle**, à satisfaire au niveau du reverse proxy ou
du CDN qui exposera l'endpoint. Elle est notée comme telle, sans faux-semblant.

---

## 13. Ce qui n'est pas construit

- **Découverte par domaine d'adresse** (`user@example.com` → ACME). Elle
  supposerait de collecter une adresse avant toute authentification, ouvrirait
  une énumération de domaines et resterait ambiguë pour quiconque appartient à
  plusieurs organisations. Option future, pas un oubli ;
- **passerelle privée / connecteur** : `Desktop → api.novaspeak.app → connecteur
→ service privé`. La découverte y est prête — l'adresse annoncée peut devenir
  celle d'une passerelle sans que le poste change — mais le tunnel n'existe pas ;
- **sélecteur multi-organisations** : changer d'organisation implique de
  déconnecter la session, d'effacer le bootstrap et de recommencer. Le modèle de
  données le supporte (le trousseau est cloisonné par organisation) ; l'interface
  ne le propose pas ;
- **Nova Admin** : la configuration de découverte se lit et se modifie par
  l'API d'administration existante, qui exige depuis la Phase 22 la capacité
  `discovery_manage` — voir
  [`control-plane-admin-auth.md`](./control-plane-admin-auth.md).
