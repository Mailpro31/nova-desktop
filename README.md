<div align="center">

<img src=".github/assets/nova-logo.png" alt="Nova" width="120" />

# Nova

**La dictée vocale qui écrit à votre place — partout, instantanément, en privé.**

Appuyez sur une touche, parlez, et votre texte apparaît dans n'importe quel
champ. Nova transcrit puis, si vous le souhaitez, reformule automatiquement
selon le contexte — e-mail, message, prompt, note, ticket… Le tout sur votre
ordinateur, sans envoyer votre voix sur Internet.

[novaspeak.app](https://novaspeak.app) · Windows

</div>

---

## Sommaire

- [Aperçu](#aperçu)
- [Ce que fait Nova](#ce-que-fait-nova)
- [Comment ça marche](#comment-ça-marche)
- [Les moteurs d'intelligence](#les-moteurs-dintelligence)
- [Les Styles](#les-styles)
- [Paliers](#paliers)
- [Installation](#installation)
- [Mises à jour automatiques](#mises-à-jour-automatiques)
- [Confidentialité](#confidentialité)
- [Développement](#développement)
- [Architecture](#architecture)

---

## Aperçu

Nova est une application de bureau qui transforme la parole en texte propre,
directement là où se trouve votre curseur. Contrairement à une simple dictée,
Nova peut **reformuler** ce que vous dites selon l'endroit où vous écrivez :
une phrase jetée à l'oral devient un e-mail soigné, un ticket structuré ou une
liste de tâches — automatiquement.

<div align="center">
<img src=".github/assets/nova-bulle.png" alt="La bulle d'écoute Nova" width="440" />
</div>

Une bulle discrète confirme que Nova vous écoute. Un clic sur l'orbe ouvre le
menu des Styles ; la roue crantée ouvre les réglages.

---

## Ce que fait Nova

- **Dicter partout** — dans n'importe quelle application : navigateur,
  messagerie, éditeur de code, traitement de texte. Le texte est collé là où
  vous écrivez.
- **Reformuler intelligemment** — chaque dictée peut être réécrite selon un
  **Style** (E-mail, Messages, Prompt IA, To-do list, Prise de notes…) ou
  laissée brute.
- **Détection automatique du Style** — Nova regarde l'application (ou l'onglet)
  au premier plan et choisit le bon Style tout seul. La fenêtre active est lue
  au moment de la dictée puis oubliée — rien n'est conservé.
- **Fonctionner hors ligne** — le moteur **Intelligence privée** transcrit et
  reformule entièrement sur votre machine, sans connexion.
- **Ne jamais laisser le curseur vide** — si la reformulation échoue pour une
  raison quelconque, Nova colle le texte brut. Jamais de perte.
- **Se lancer avec Windows** — Nova est prête dès l'ouverture de session.

<div align="center">
<img src=".github/assets/nova-styles-menu.png" alt="Le menu des Styles" width="380" />
</div>

---

## Comment ça marche

1. **Maintenez** votre touche de dictée (par défaut `F9`) — ou activez le mode
   « appuyer une fois ».
2. **Parlez** pendant que la touche est active. La bulle affiche « Je t'écoute… ».
3. **Relâchez.** Nova transcrit votre voix, applique le Style choisi (ou le
   détecte), puis **colle** le résultat dans le champ actif.

Le silence est filtré automatiquement (détection d'activité vocale), de sorte
que seul ce que vous dites réellement est transcrit.

---

## Les moteurs d'intelligence

Nova propose deux moteurs, choisis dans les réglages :

| Moteur | Description |
| --- | --- |
| **Intelligence privée** | Transcription et reformulation **100 % locales**, hors ligne. Rien ne quitte votre ordinateur. |
| **Turbo** | La vitesse maximale, via le réseau. Bascule automatiquement sur l'Intelligence privée si le réseau manque. |

Trois **profils de puissance** ajustent la qualité selon votre machine —
**Nova Air** (léger et vif), **Nova Aura** (le meilleur équilibre) et
**Nova Apex** (l'intelligence maximale). Les profils trop lourds pour la
machine sont automatiquement verrouillés.

<div align="center">
<img src=".github/assets/nova-general.png" alt="Réglages généraux Nova" width="720" />
</div>

---

## Les Styles

Un **Style** est une façon de reformuler votre dictée. Nova est livrée avec des
Styles prêts à l'emploi (E-mail, Messages, Prompt IA, To-do list, Prise de
notes, Normal) et vous pouvez créer les vôtres : un nom, des mots-clés
d'application/onglet, et une consigne de reformulation.

> Exemple : sur Jira, chaque dictée est automatiquement reformulée en ticket
> structuré ; sur votre CRM, en note commerciale.

<div align="center">
<img src=".github/assets/nova-styles-reglages.png" alt="Styles sur mesure" width="720" />
</div>

Quand l'application ou l'onglet actif contient l'un de vos mots-clés, votre
consigne prend le relais — sans que vous ayez à choisir.

---

## Paliers

| Palier | Inclus |
| --- | --- |
| **Gratuit** | Dictée locale illimitée · Styles E-mail, To-do list et Prompt IA · quota hebdomadaire de reformulation |
| **Nova Pro** | Reformulation sans limite · tous les Styles · moteur Turbo |
| **Nova Ultra** | Création et modification de Styles sur mesure · profil de puissance maximal · détection automatique avancée |

L'abonnement est géré en ligne ; votre licence débloque les fonctions
correspondantes directement dans l'application.

---

## Installation

1. Téléchargez la dernière version depuis **[novaspeak.app](https://novaspeak.app)**
   ou la [page des releases](https://github.com/Mailpro31/nova-desktop/releases/latest).
2. Lancez l'installateur `Nova_x.y.z_x64-setup.exe`.
3. Accordez à Nova l'accès au micro au premier lancement.
4. Choisissez votre touche de dictée dans les réglages, et commencez.

---

## Mises à jour automatiques

Nova se met à jour toute seule. À chaque nouvelle version publiée, l'application
détecte la nouveauté (via l'endpoint updater) et propose l'installation en un
clic. Les paquets de mise à jour sont **signés** (minisign) : Nova refuse toute
mise à jour dont la signature ne correspond pas à sa clé publique intégrée —
impossible de lui pousser un binaire falsifié.

La chaîne de publication (compilation Windows, signature, `latest.json`) est
entièrement automatisée par GitHub Actions (`.github/workflows/nova-release.yml`).

---

## Confidentialité

- Avec le moteur **Intelligence privée**, votre voix et vos textes **ne
  quittent jamais** votre ordinateur.
- La fenêtre active, utilisée pour la détection automatique du Style, est lue au
  moment de la dictée puis immédiatement oubliée. Les applications sensibles
  (banque, gestionnaires de mots de passe) sont exclues par défaut et vous
  pouvez en ajouter.
- Aucun enregistrement audio n'est conservé après transcription.

---

## Développement

Nova est une application [Tauri 2](https://tauri.app) : interface **React +
TypeScript** (Vite), cœur natif **Rust**.

### Prérequis

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) (stable)
- Les dépendances système Tauri pour votre plateforme (voir [BUILD.md](BUILD.md)).

### Commandes

```bash
bun install          # installer les dépendances front
bun run dev          # lancer l'app en développement (Tauri + Vite)
bun run build        # build du front
bun tauri build      # produire l'installateur de bureau
```

### Qualité

```bash
bun run check:translations   # toutes les langues couvrent les clés de l'anglais
bun run lint                 # eslint (dont i18next/no-literal-string)
bun run format:check         # prettier + cargo fmt --check
```

---

## Architecture

```
src/                  Interface React (dock, bulle, réglages, onboarding)
  components/          Composants UI (Apple/macOS, minimaliste premium)
  stores/              État applicatif (modèles, styles, licence…)
  lib/                 Logique front (branding des moteurs, utilitaires)
  i18n/                Traductions (français par défaut, 20+ langues)
src-tauri/            Cœur natif Rust
  src/                 Transcription, reformulation, raccourcis, overlay,
                       licence, quota, empreinte machine
  tauri.conf.json      Configuration Tauri (updater, bundle, identité Nova)
.github/workflows/    CI (qualité de code) + release Windows signée
```

Le langage visuel — orbe « bille de verre », barre latérale à catégories,
interrupteurs macOS, accent bleu Apple unique — est décrit dans
[`CLAUDE.md`](CLAUDE.md) et s'applique à toute nouvelle surface.

---

<div align="center">
<sub>Nova — dictez, Nova écrit.</sub>
</div>
