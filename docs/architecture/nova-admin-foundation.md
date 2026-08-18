# Nova Admin — fondation

La console web d'administration d'une organisation Nova : ce qu'elle est, ce
qu'elle n'est pas, et comment elle s'authentifie.

Implémentation : `nova-server/admin-web/`. Complète
[`control-plane-admin-auth.md`](./control-plane-admin-auth.md) et
[`admin-step-up.md`](./admin-step-up.md).

---

## 1. Nova Admin ≠ Nova Control

La distinction est la plus importante du document, parce qu'elle est facile à
franchir par accident — il suffit d'ajouter une page « toutes les organisations ».

| | **Nova Admin** | **Nova Control** |
|---|---|---|
| Pour qui | l'administrateur d'une organisation cliente | l'équipe Nova |
| Portée | **une** organisation | la plateforme, les tenants |
| Existe | ✅ cette phase | ❌ pas construit |

Aucune page de Nova Admin ne parle de plusieurs organisations, de tenants ou
d'opérateur de plateforme. Des tests le vérifient sur le code source — une
frontière qui ne tient que par la discipline finit par céder.

---

## 2. Où elle vit

`nova-server/admin-web/` — une application web indépendante, pas une page Tauri.

Le choix mérite d'être justifié, parce que ce n'est pas un dépôt à part :

- la console **consomme le Control Plane**, et elle en suit le contrat. Les
  versionner ensemble évite qu'un champ change d'un côté sans l'autre ;
- le serveur sert déjà une page `/admin` (l'ancienne console à jeton partagé,
  vouée à disparaître) : les deux vivent au même endroit le temps de la bascule ;
- l'alternative — un dépôt `nova-admin` séparé — reste ouverte et sans coût : le
  dossier est autonome, avec son `package.json`, son build et ses tests. Elle
  attend surtout qu'un dépôt distant existe.

Rien n'est ajouté au produit Desktop, dont ce n'est pas le sujet.

---

## 3. Stack

React 18 + TypeScript + Vite, comme Nova Desktop. `react-router-dom` pour le
routage, et **rien d'autre** : quatre dépendances d'exécution.

Pas de bibliothèque de composants. La feuille de style tient en un écran, et un
framework pèserait plus que ce qu'il rendrait pour six pages de formulaires et de
listes de faits.

**Direction visuelle** : sobre, dense, lisible. Une console d'administration se
lit longtemps et se parcourt vite : elle a besoin de hiérarchie et de contraste,
pas de couleur. La couleur ne sert qu'à porter un sens — un état, un danger —
sinon elle cesse d'en porter aucun. Pas de tableau de bord à quarante cartes, pas
de note de sécurité sur 100.

---

## 4. Le parcours d'authentification

```
identifiant d'organisation
        ↓  découverte (Phase 21)
adresse du service
        ↓  SSO de l'organisation
session utilisateur Nova
        ↓  réauthentification (Phase 24)
session d'administration
        ↓
console
```

L'utilisateur ne saisit **jamais** une adresse : il donne un identifiant
d'organisation, et la découverte répond. Il n'y a **aucun mot de passe Nova**.

Administrer exige une authentification *récente*. Une session utilisateur seule
mène à l'écran de réauthentification, jamais à la console — c'est la propriété de
la Phase 24, et elle est visible ici : `POST /api/admin/session` répond
`ADMIN_STEP_UP_REQUIRED`.

L'écran de step-up dit ce qu'il fait : « votre fournisseur d'identité va vous
demander de vous authentifier à nouveau ». Il ne présente pas cela comme un
« MFA Nova » — Nova n'ajoute aucun facteur et ne sait pas lequel a été demandé.

---

## 5. Où vivent les jetons

**Le jeton d'administration vit en mémoire, et nulle part ailleurs.**

Un jeton d'administration écrit dans `localStorage` est lisible par tout script
qui parvient à s'exécuter dans la page, et il y survit à la fermeture de
l'onglet : le vol devient permanent. En mémoire, il disparaît au
rafraîchissement — l'administrateur repasse par la réauthentification, ce qui
coûte quelques secondes et vaut largement la propriété obtenue. Les sessions
d'administration durent de toute façon quatre heures.

### Le sas de transit

Une redirection vers le fournisseur d'identité **détruit la page** : tout ce qui
vivait en mémoire disparaît. La première version l'ignorait, et le parcours
échouait en silence — le retour ne trouvait plus ni `code_verifier`, ni
tentative, ni session, et l'utilisateur retombait sur l'écran de départ sans
explication. Un état purement en mémoire est incompatible avec une redirection
complète.

`handoff.ts` est la réponse minimale : un **sas**, pas un coffre.

| | |
|---|---|
| Contenu | `code_verifier`, identifiant de tentative, adresse de retour, organisation, et le jeton **utilisateur** pour une réauthentification |
| Durée | le seul aller-retour — **vidé dès qu'il est lu** |
| Jamais | **le jeton d'administration** |
| Support | `sessionStorage`, qui meurt avec l'onglet — jamais `localStorage` |

Le jeton d'administration est obtenu au dernier retour, n'a aucune redirection à
traverser, et ne passe donc jamais par le sas. C'est la propriété qui compte :
un script qui lirait ce stockage n'y trouverait pas de quoi administrer. Trois
tests la verrouillent, dont un qui inspecte tous les fichiers source.

### CSRF

**Il n'y en a pas à défendre sur ce chemin.** Rien n'est ambiant : le navigateur
n'envoie aucun identifiant automatiquement, et une page tierce qui déclenche une
requête ne peut pas y joindre le jeton. `credentials: "omit"` est explicite dans
le client, et un test le verrouille.

Le jour où la console passera au cookie `HttpOnly` + `Secure` + `SameSite` — la
cible recommandée depuis la Phase 22 — cela changera : il faudra alors une
défense CSRF explicite, jeton anti-rejeu ou en-tête personnalisé, car `SameSite`
seul ne couvre pas les mutations. Le passage sera un vrai changement, pas un
réglage.

### CORS

Le serveur déclare une **liste explicite** d'origines
(`NOVA_ADMIN_ORIGINS`), vide par défaut : un déploiement sans console web
n'ouvre rien. `allow_credentials` reste faux, cohérent avec l'absence de cookie.
Jamais de joker — `*` avec identifiants est refusé par les navigateurs, et
l'accepterait-on qu'il laisserait n'importe quelle page appeler l'administration
au nom de son visiteur.

---

## 6. Routage et portée

```
/                              identifiant d'organisation
/o/:slug                       découverte, puis connexion
/o/:slug/overview              …identity, deployment, configuration,
                               security, diagnostics
/callback                      retour d'autorisation
```

Deux contraintes ne sont pas négociables, et la recette réelle les a rappelées :

- **l'origine doit être `http://127.0.0.1:<port>`**, jamais `localhost`. Le
  serveur écarte les noms d'hôte pour les redirections d'autorisation, parce que
  leur résolution ne se maîtrise pas ;
- **le chemin de retour est `/callback`**, celui que l'App Registration connaît
  déjà par l'application de bureau. Entra compare l'URI **chemin compris** : un
  chemin inventé produit un `AADSTS50011`, et il faudrait alors modifier
  l'enregistrement plutôt que la console.

Le slug est public et lisible ; **aucun identifiant interne n'apparaît dans
l'URL**. Le code d'autorisation est retiré de la barre d'adresse dès qu'il est
consommé (`replace: true`) : il n'a pas à rester dans l'historique.

Changer de slug repart de zéro — découverte, session, portée. Aucun jeton d'un
tenant ne peut servir pour un autre.

---

## 7. Garde d'accès

Une seule porte, dans `SessionProvider`. La console n'est **montée** que lorsque
la session d'administration existe : il n'y a donc aucun instant où un écran
sensible s'affiche avant une redirection.

Les pages ne vérifient rien elles-mêmes. Une vérification dispersée — `if
(token)` répété — finirait par manquer un écran, et ce serait justement le plus
sensible.

**Le serveur reste l'autorité.** Ce garde évite des appels voués à l'échec et
n'affiche pas ce qui serait refusé ; il ne protège rien à lui seul, et le code le
dit.

---

## 8. Capacités, pas rôles

L'interface se règle sur les **capacités** renvoyées à l'ouverture de session :
`provider_manage`, `discovery_manage`, `identity_manage`, `deployment_manage`,
`security_manage`, `organization_read`, `diagnostics_read`.

Comparer des noms de rôle dans les composants recréerait la matrice
d'autorisation côté client, et elle finirait par diverger de celle du serveur.
Un `read_only` ne voit aucun bouton de mutation ; un `it_admin` gère la machine,
un `organization_admin` les personnes.

Masquer un bouton n'est pas une protection : c'est une politesse.

---

## 9. Les pages

| Page | Contenu |
|---|---|
| **Overview** | organisation, statut, modes, résumé des fournisseurs, votre accès |
| **Identity** | fournisseurs d'identité, état, détail, remplacement de secret, désactivation |
| **Administrators** | qui administre, attribution et retrait de rôle — Phase 26 |
| **Deployment** | mode, adresse de service, identifiant de découverte |
| **Configuration** | découverte : état, identifiant, adresse annoncée et son éventuel refus |
| **Security** | rôle, capacités, expiration de session, authentification moderne, MFA amont |
| **Diagnostics** | santé de l'API, version, découverte, fournisseurs |

**Aucune donnée fabriquée.** Pas de nombre d'utilisateurs, pas de taux de
disponibilité, pas de « santé » synthétique : le serveur ne les fournit pas. Une
console qui invente un chiffre devient impossible à croire sur les autres. Là où
il n'y a rien, la page dit « pas encore configuré » — c'est une information, un
faux chiffre n'en est pas une.

Chaque page a ses quatre états — chargement, erreur, vide, données — parce
qu'`AsyncSection` les impose : aucune ne peut produire un écran blanc.

---

## 10. Les secrets

Un secret client n'est **jamais lu, jamais affiché, jamais prérempli**.

Le serveur ne le renvoie pas — il dit seulement s'il en existe un
(`has_secret`). La console affiche donc :

```
Client secret   [ Configured ]
                [ Replace secret ]
```

Champ vide, aucun bouton « afficher ». Des astérisques masquant une valeur
réellement récupérée seraient pires que rien : ils signalent que la valeur a
voyagé.

---

## 11. Ne pas se verrouiller dehors

Depuis la Phase 24, ouvrir une session d'administration exige une
réauthentification auprès d'un fournisseur. Désactiver le **dernier** fournisseur
actif fermerait donc la porte à tous les administrateurs, y compris à celui qui
vient de cliquer.

L'audit a montré qu'aucun garde-fou n'existait. Il a été ajouté **côté serveur** —
une protection qui ne vivrait que dans l'interface ne serait pas une protection :

```
POST /api/admin/provider-configs/{id}/disable
→ 409 PROVIDER_LAST_ACTIVE
```

Le refus n'empêche pas de remplacer un fournisseur : il suffit de déclarer le
nouveau avant de retirer l'ancien. Le jeton hérité offre bien un chemin de
secours en mode dédié, mais s'y fier serait fragile — il peut être éteint
ensuite, et il est destiné à disparaître.

La désactivation demande par ailleurs une confirmation explicite, parce qu'elle
empêche des gens de se connecter. Les changements ordinaires n'en demandent pas :
une confirmation partout ne se lit plus.

---

## 12. Client d'API

Un seul endroit sait parler au serveur : l'URL de base, le port du jeton, la
traduction des échecs. Des `fetch` dispersés finiraient par diverger — l'un
oubliant le 401, l'autre affichant une trace brute.

Les échecs sont classés par ce qu'ils **changent pour l'utilisateur**, pas par
leur statut HTTP : le code renvoyé par le serveur prime, parce que
`ADMIN_STEP_UP_REQUIRED` et `ADMIN_ROLE_REQUIRED` partagent un statut sans
appeler la même réaction. Aucun message technique n'atteint l'écran.

**Version de contrat** : le serveur annonce `contract_version`. Une console plus
ancienne que le serveur le dit clairement plutôt que de lire de travers des
champs qu'elle ne connaît pas.

---

## 13. Frontière du plan de données

Nova Admin gère de la **configuration**. Audio dicté, transcriptions, prompts,
réponses de l'IA, historique d'un utilisateur : rien de cela n'y transite, et
aucune page ne l'affiche.

C'est la frontière posée dans
[`control-plane-foundation.md`](./control-plane-foundation.md), et c'est ici
qu'on serait tenté de la franchir — « juste un flux d'activité », « juste les
dernières transcriptions ». La page Diagnostics le rappelle à l'écran, et un test
vérifie qu'aucun appel ne vise le plan de données.

Il n'y aura pas de page « ce que les employés ont tapé ». Ce n'est pas une
limite technique, c'est une décision de produit.

---

## 14. Accessibilité et langue

Navigation au clavier, focus visible partout, boutons sémantiques, libellés liés
à leurs champs, contraste tenu en clair comme en sombre. Une console
d'administration s'utilise beaucoup au clavier.

**Anglais uniquement**, avec toutes les chaînes rassemblées dans un module. Nova
Desktop porte 21 langues avec un contrôle de complétude ; les dupliquer pour une
console sans utilisateur reviendrait à faire traduire 21 fois des libellés qui
bougeront à chaque phase. Le jour où la traduction sera utile, ce module devient
le catalogue par défaut et rien d'autre ne change.

---

## 15. En-têtes web

CSP, `frame-ancestors`, `Referrer-Policy`, `nosniff`, HSTS : ils relèvent de
**l'hébergeur ou du reverse proxy**. Vite ne les applique pas à un build statique,
et prétendre le contraire donnerait une confiance imméritée.

Ce qui est fait ici : `Referrer-Policy` déclaré en `<meta>`, aucun script inline,
aucun `eval`, aucune ressource externe — donc une CSP stricte sera posable sans
rien casser. Le reste attend un hébergement réel.

---

## 16. Ce qui n'est pas construit

- ~~**Audit à l'écran**~~ ✅ **fait en Phase 26** — lecture paginée dans Security,
  voir [`admin-identity-management.md`](./admin-identity-management.md) ;
- ~~**gestion des administrateurs**~~ ✅ **faite en Phase 26** — le premier
  administrateur naît toujours de la ligne de commande, qui reste aussi le
  chemin de récupération ;
- **parc de postes, canaux de mise à jour, télémétrie de déploiement** : le
  serveur n'en sait rien ;
- **Policies, Packages, SCIM, Learn, Nova Control, passerelle privée, SAML** ;
- **modèle cookie + CSRF** (§ 5), **en-têtes de production** (§ 15).
