# Rapport de validation Windows — pilote Nova Campus

Ce rapport enregistre l'**exécution** de `docs/PILOT_WINDOWS_VALIDATION.md`, qui
reste la source de vérité des tests. Il ne la remplace pas et ne la simplifie
pas.

Règle de remplissage : un test ne passe à **PASS** que s'il a été réellement
observé. Tant qu'il ne l'a pas été, il reste **NOT TESTED**. Un test impossible
à exécuter faute d'environnement est **BLOCKED**, jamais PASS.

| Statut         | Signification                                          |
| -------------- | ------------------------------------------------------ |
| **PASS**       | exécuté et observé conforme                            |
| **FAIL**       | exécuté, résultat non conforme                         |
| **BLOCKED**    | non exécutable (environnement, accès, build manquants) |
| **NOT TESTED** | pas encore exécuté                                     |

---

## 1. Identité du build

### Desktop

| Champ   | Valeur                                     |
| ------- | ------------------------------------------ |
| Dépôt   | `C:\Users\sash\nova-desktop`               |
| Branche | `campus`                                   |
| Commit  | `4e1de36f6adc693b130279e7a507461ac140c68b` |
| Version | `1.0.36`                                   |

### Serveur

| Champ   | Valeur                                     |
| ------- | ------------------------------------------ |
| Dépôt   | `C:\Users\sash\Documents\nova-server`      |
| Remote  | `github.com/Mailpro31/nova-server`         |
| Branche | `feat/campus-platform`                     |
| Commit  | `5186cdd20c50c1c801e3074234289415bf02503f` |

> Le dossier `nova-desktop/nova-server` est un **clone obsolète** (branche
> `master`, dernier commit du 14/08) ignoré par `.gitignore`. Il n'est pas la
> source de vérité et n'a pas été utilisé pour ce build.

### Build

| Champ                | Valeur                                                           |
| -------------------- | ---------------------------------------------------------------- |
| Configuration        | `VITE_NOVA_MODE=campus`, `bun run tauri build`                   |
| Date / heure         | _à compléter à l'issue du build_                                 |
| Type d'installateur  | _à compléter_                                                    |
| Nom du fichier       | _à compléter_                                                    |
| Taille               | _à compléter_                                                    |
| Chemin absolu        | _à compléter_                                                    |
| Endpoint Campus visé | **NON DÉFINI** — aucun `campus-config.json` de production fourni |

> Nova n'a pas deux binaires : le mode Campus s'active à l'exécution par la
> présence d'un `campus-config.json` déposé à côté de l'exécutable. `VITE_NOVA_MODE`
> ne conditionne que la surface d'interface (`src/lib/mode.ts`).

---

## 2. Environnement de test

| Champ                | Valeur                     |
| -------------------- | -------------------------- |
| Version de Windows   | Windows 11 Home 10.0.26200 |
| Mise à l'échelle DPI | NOT TESTED                 |
| Nombre d'écrans      | NOT TESTED                 |
| Droits utilisateur   | NOT TESTED                 |

---

## 3. Validation automatique

| Vérification                         | Statut     | Détail                                                                                                                                                        |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test --lib`                   | PASS       | 260 passés, 0 échec                                                                                                                                           |
| `cargo clippy --all-targets`         | PASS       | code 0, avertissements seulement                                                                                                                              |
| `cargo fmt -- --check`               | PASS       | —                                                                                                                                                             |
| `bun run lint`                       | PASS       | —                                                                                                                                                             |
| `bun run test:unit`                  | PASS       | 31 passés, 0 échec                                                                                                                                            |
| `bun run test` (politique Campus)    | PASS       | 9 passés, 0 échec                                                                                                                                             |
| `bun run check:translations`         | PASS       | 21 langues complètes                                                                                                                                          |
| `bun run format:check`               | FAIL       | uniquement `.impeccable/hook.cache.json`, fichier d'outillage **local non versionné** (exclu via `.git/info/exclude`) — invisible de la CI, hors code produit |
| Tests serveur (`unittest test_main`) | PASS       | 14 passés, 0 échec                                                                                                                                            |
| Build Windows Campus                 | NOT TESTED |                                                                                                                                                               |
| Build Windows Personal               | NOT TESTED |                                                                                                                                                               |
| Inspection statique du bundle        | NOT TESTED |                                                                                                                                                               |
| Bindings TypeScript (specta)         | NOT TESTED |                                                                                                                                                               |

### Configuration de production — inspection statique

| Vérification                             | Statut | Détail                                                                                                       |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Aucune URL `localhost` de développement  | PASS   | seuls `127.0.0.1` du LLM local en sous-processus (`local_llm.rs`, `screen_vlm.rs`), jamais exposés au réseau |
| Nova Commands désactivé par défaut       | PASS   | `nova_commands_enabled: false` (`settings.rs:1559`)                                                          |
| Nova Commands sans raccourci par défaut  | PASS   | binding `command` : `default_binding` vide (`settings.rs:1493`)                                              |
| Nova Commands inaccessible à un étudiant | PASS   | panneau visible seulement en mode debug (`Ctrl+Shift+D`) **et** en mode Campus                               |
| Expérimental désactivé par défaut        | PASS   | `experimental_enabled: false`                                                                                |
| Marque et version                        | PASS   | `productName: Nova`, `1.0.36` cohérent entre `package.json`, `tauri.conf.json`, `Cargo.toml`                 |

---

## 4. Bloc A — Pilot Core (tests Windows GUI)

Aucun test de ce bloc ne peut être exécuté par l'agent : ils exigent
l'observation réelle de l'interface Windows.

| Section                              | Statut     |
| ------------------------------------ | ---------- |
| A1. Installation                     | NOT TESTED |
| A1bis. Persistance après redémarrage | NOT TESTED |
| A2. Dictée — matrice par application | NOT TESTED |
| A3. Repli presse-papiers             | NOT TESTED |
| A4. Overlay                          | NOT TESTED |
| A5. Cohérence des états              | NOT TESTED |
| A6. Campus — cycle complet           | NOT TESTED |
| A7. Réseau contraint                 | NOT TESTED |
| A8. Mise à jour                      | NOT TESTED |
| A9. Installateur et marque           | NOT TESTED |
| A10. Inspection des journaux         | NOT TESTED |
| A11. Compte Windows standard         | NOT TESTED |
| A12. Bindings TypeScript             | NOT TESTED |

### Détail A2 — matrice par application

| Application            | Démarre    | Écoute     | Arrêt      | Traitement | Insertion  | Ctrl+Z     | Focus      | Historique |
| ---------------------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- |
| Bloc-notes             | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Chrome — `<textarea>`  | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Chrome — champ enrichi | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Google Docs            | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| VS Code                | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Discord                | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Outlook                | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

### Environnements (§0 du document de validation)

| Environnement                | Statut     |
| ---------------------------- | ---------- |
| Windows 11 · 100 % · 1 écran | NOT TESTED |
| Windows 11 · 125 % · 1 écran | NOT TESTED |
| Windows 11 · 150 % · 1 écran | NOT TESTED |
| Windows 11 · 2 écrans        | NOT TESTED |
| Compte Windows standard      | NOT TESTED |

---

## 5. Bloc B — Nova Commands

**Expérimental · désactivé par défaut · hors périmètre du pilote.**

Non exécuté, volontairement. Un échec ou une absence de validation ici ne bloque
pas PILOT READY.

| Section                     | Statut                                                  |
| --------------------------- | ------------------------------------------------------- |
| B1. Matrice par application | HORS PÉRIMÈTRE                                          |
| B2. Cas limites             | HORS PÉRIMÈTRE                                          |
| B3. Réglage `PASTE_SETTLE`  | HORS PÉRIMÈTRE                                          |
| B4. Régression de la dictée | NOT TESTED (à faire seulement si le bloc B est exécuté) |

---

## 6. Bugs trouvés

| #   | Sévérité | Description      | Statut |
| --- | -------- | ---------------- | ------ |
| —   | —        | aucun à ce stade | —      |

## 7. Correctifs

| #   | Commit    | Dépôt       | Description                                                                                                                          |
| --- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `5186cdd` | nova-server | `/api/command` ne reçoit plus que le vocabulaire ; règles de formatage et raccourcis vocaux retirés, texte sélectionné non prétraité |

## 8. Retests

| #   | Test | Résultat |
| --- | ---- | -------- |
| —   | —    | —        |

## 9. Risques connus

| Risque                                                               | Impact                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Aucun `campus-config.json` de production n'est disponible localement | tout le cycle Campus (A6, A7, A8, connexion, repli) est **BLOCKED** sans serveur joignable |
| Installateur local non signé                                         | SmartScreen se comportera différemment de la distribution finale signée par la CI          |
| Aucune version antérieure installable disponible                     | A8 (mise à jour) est **BLOCKED**                                                           |

---

## Verdict

**PILOT CANDIDATE**

Les conditions de PILOT READY ne sont pas réunies : aucun test Windows GUI n'a
encore été exécuté. Une CI verte ne suffit jamais à déclarer PILOT READY.
