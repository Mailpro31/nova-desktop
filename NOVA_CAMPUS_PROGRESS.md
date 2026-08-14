# NOVA CAMPUS — Notes de progression pour l'agent suivant

> Source de vérité : `nova-server/SPEC_NOVA_CAMPUS.md` (NE PAS modifier `nova-server/`).
> Discipline : `bun run build` + `bun run lint` verts entre chaque phase. Ne passer
> à la phase suivante qu'après validation utilisateur.

## État général (IMPORTANT)

Le working tree contient **déjà toute l'implémentation campus, NON COMMITÉE**
(≈20 fichiers modifiés/ajoutés, voir `git status`). Elle couvre toutes les
phases (1 à 5). Le travail de l'agent consiste donc à **auditer/valider** chaque
phase contre la spec et à corriger les écarts réels — PAS à réimplémenter.

Commits : rien n'est commité. Ne pas committer sans demande explicite.

## Validé — Phase 1 (Fondations + auth)

Tout présent et vert. Déviation acceptée par l'utilisateur :
- `campusApi.ts` passe par des **commandes Rust** (`invoke` → reqwest, Bearer
  côté Rust) au lieu d'un `fetch` JS direct. Équivalent fonctionnel, évite
  CORS/mixed-content. NE PAS réécrire en fetch.

Éléments clés :
- `src/lib/mode.ts` — flag `VITE_NOVA_MODE` (défaut `personal`), typé dans `vite-env.d.ts`.
- `src/lib/campusApi.ts` — zod schemas, `isServerReachable` cache 30 s.
- `src/lib/campusSession.ts` — wrappers bindings.
- `src-tauri/src/commands/campus.rs` — session store (`campus_session`),
  `get_campus_config` (lit `campus-config.json` à côté de l'exe), auth request/verify.
- `src/components/onboarding/CampusOnboarding.tsx` — Bienvenue/Email/Code/Prêt,
  cooldown 60 s, champ serveur verrouillé si config IT, `machine`=`hostname()`.

## Audité + corrigé — Phase 2 (Pipeline Feature B)

Pipeline `actions.rs` (l. ~2151+) : campus session + serveur joignable →
`/api/transcribe` (multipart WAV) puis `/api/reformulate` avec le prompt du
Style résolu **localement** (seule la consigne part au serveur). `campus_used`
désactive la reformulation locale (pas de double traitement). 401 → session
supprimée + retour onboarding. Fallback local en cas d'échec (jamais de perte).

**Correction appliquée ce jour** (écart vs spec Feature B) :
- Avant : notification « Serveur injoignable » seulement si AUCUN secours local.
- Maintenant : notification discrète émise dès que le serveur est injoignable
  et qu'on bascule sur le repli local.
  - `campus.rs` : ajout `has_campus_session()`.
  - `actions.rs` : émission `CAMPUS_SERVER_UNREACHABLE_EVENT` quand session
    présente mais serveur injoignable (branche `else` de `should_use_campus`),
    et pour les erreurs `CampusError::Network(_)`.
  - `App.tsx` : handler passé de `showAttentionToast` (persistant, s'empile) à
    `toast.warning` discret, id fixe `campus-server-unreachable`, durée 4 s.
  - Les erreurs 502 (reformulate/transcribe, serveur joignable) restent
    silencieuses avec texte brut collé (pas de notification trompeuse).

Vérifications vertes : `bun run build` (personal + campus), `bun run lint`,
`cargo check` (exit 0, warnings préexistants uniquement).

## Audité + corrigé — Phase 3 (Feature D + Feature C)

8 écarts identifiés et corrigés contre la spec :

### Feature D — Sidebar + masquage (5 écarts)
- **D1** (CRITIQUE) : `home.campusVisible` était `false` → Accueil absent de la
  sidebar campus. Corrigé → `true`.
- **D2** (CRITIQUE) : `meeting.campusVisible` était `true` → Meeting visible en
  campus alors que la spec impose 4 entrées. Corrigé → `false`.
- **D3** (MODÉRÉ) : `about.campusVisible` était `true` → entrée séparée alors que
  la spec dit « À propos dans Réglages si nécessaire ». Corrigé → `false` ;
  contenu d'About intégré comme section dans `CampusGeneralSettings` (version,
  site web, répertoire de données, logs, debug toggle).
- **D4** (MODÉRÉ) : l'ordre des entrées campus était Réglages/Styles/Historique
  au lieu de Accueil/Styles/Historique/Réglages. Ajouté `CAMPUS_SIDEBAR_ORDER`
  avec tri explicite.
- **D5** (MODÉRÉ) : déconnexion sans confirmation. Ajouté `window.confirm()` avec
  clés i18n `campus.account.logoutConfirmDescription` en `en` + `fr`.

### Feature C — Styles (3 écarts)
- **C1** (BUG) : `CampusStylesSettings.startEdit()` cherchait `prompt.id ===
  editing` (état, `null` au moment de l'appel) au lieu de `prompt.id === id`
  (paramètre). L'édition de styles personnalisés était cassée. Corrigé.
- **C2** (MINEUR) : les cartes de styles campus ne montraient pas les badges
  « Intégré »/« Personnalisé ». Ajouté badge semi-transparent (texte blanc sur
  fond noir/30%, `backdrop-blur`) sur chaque carte.
- **C3** (MODÉRÉ) : `actions.rs:2027` — la reformulation campus dépendait de
  `post_process_enabled` (toggle masqué mais pas forcé). Si le toggle était coupé
  (debug, migration), la reformulation campus était sautée. Ajouté
  `|| crate::licensing::is_campus_enabled()` pour forcer la reformulation en
  campus, conformément à « Reformulation toujours active ».

Vérifications vertes : `bun run build` (campus + personal), `bun run lint`,
`cargo check` (exit 0, 4 warnings préexistants uniquement, aucun nouveau).

## Audité + implémenté — Phase 4 (Features E, F, G, H, I)

Implémentation complète des 5 fonctionnalités avancées :

### Feature E — Dictionnaire (dans Réglages)
- Section `CampusDictionarySection.tsx` intégrée dans `CampusGeneralSettings.tsx`.
- **Partagé** : liste en lecture seule du vocabulaire de l'établissement.
- **Personnel** : ajout/suppression de termes (`terme` → `correction`), badge visuel « Appris » (`source: learned`) vs « Personnel ».
- Boutons **Importer / Exporter CSV** (`/api/dictionary/export`, `/api/dictionary/import`).
- Bouton **« Analyser un document »** (`/api/dictionary/analyze`) : extraction automatique du vocabulaire spécifique par l'IA sans stockage du document.
- API Backend Rust : `get_campus_vocabulary`, `add_campus_dictionary_entry`, `delete_campus_dictionary_entry`, `learn_campus_dictionary`, `export_campus_dictionary`, `import_campus_dictionary`, `analyze_campus_document`.

### Feature F — Snippets vocaux (dans Réglages)
- Section `CampusSnippetsSection.tsx` intégrée dans `CampusGeneralSettings.tsx`.
- Liste des snippets existants + formulaire d'ajout rapide (« expression » → « contenu »).
- Suppression de snippets.
- Carte d'astuce de découverte : « Dites 'mon lien visio' pour insérer vos infos ».
- API Backend Rust : `add_campus_snippet`, `delete_campus_snippet`.

### Feature G — Règles de formatage (dans Réglages)
- Section `CampusFormattingSection.tsx` intégrée dans `CampusGeneralSettings.tsx`.
- **Règles partagées** : liste en lecture seule imposée par la charte de l'établissement.
- **Règles personnelles** : ajout et suppression (`/api/formatting-rules`).
- API Backend Rust : `get_campus_formatting_rules`, `add_campus_formatting_rule`, `delete_campus_formatting_rule`.

### Feature H — Mode commande
- Commande Backend Rust `execute_campus_command` connectée à `POST /api/command {instruction, text}`.
- Méthode frontend `executeCommand` dans `CampusApi`.

### Feature I — Transcription de fichiers
- Bouton / carte d'action **« Transcrire un fichier »** sur l'Accueil campus (`CampusHomeSettings.tsx`).
- Modal `CampusFileTranscribeModal.tsx` avec zone de glisser-déposer / sélecteur audio (WAV, MP3, M4A, OGG).
- Envoi vers `/api/transcribe` via la commande Rust `transcribe_campus_audio_file`.
- Copie automatique du résultat dans le presse-papiers avec toast de confirmation.

Vérifications vertes : `bun run build` (campus + personal), `bun run lint`, `cargo check` (0 erreurs, 4 warnings préexistants uniquement).

## Audité + validé — Phase 5 (Feature J + Feature K)

- **Feature J (Refonte graphique campus)** :
  - Thème clair épuré avec fond gris très pâle et cartes blanches aux coins arrondis (24-32px) et ombres douces.
  - Sidebar 4 entrées avec pilule active gris clair et orbe Nova.
  - Page d'accueil : grand titre (« Dictez, n'écrivez plus »), 4 cartes d'action (Dicter, Annuler, Style, Transcrire un fichier), grille de styles avec pastilles de couleur, carte de statut avec pastille de connexion et note de confidentialité réseau établissement.
  - Page Réglages : structure aérée en cartes de sections claires (Raccourcis, Son, Dictionnaire, Snippets vocaux, Règles de formatage, Compte, Bulle, À propos).
  - Footer : pastille d'état réseau et nom de serveur (suppression du sélecteur de modèle).

- **Feature K (Fix overlay les deux modes)** :
  - Icônes d'engrenage (`.sgear`) et d'étoile (`.sstar`) ajustées dans `RecordingOverlay.css` avec contraste renforcé (88% opacité / plein contraste blanc sur fond sombre en `prefers-color-scheme: dark`) garantissant une parfaite lisibilité.

Vérifications vertes : `bun run build` (campus + personal), `bun run lint`, `cargo check` (0 erreurs, 4 warnings préexistants uniquement).

## À faire — Phase 6 (Validation finale)

1. **Validation contre la checklist PARTIE 4 de la spec** :
   - [x] Flag de mode `VITE_NOVA_MODE=campus|personal` fonctionnel
   - [x] Session persistée et protégée contre les redémarrages
   - [x] 401 géré avec réinitialisation de session et retour onboarding
   - [x] Style Automatique + fallback Transcription améliorée opérationnel
   - [x] Zéro mention Pro/Ultra/palier/quota en mode campus
   - [x] Dictionnaire, snippets vocaux, formatage, mode commande, transcription de fichiers implémentés
   - [x] Refonte graphique complète appliquée, icônes overlay contrastées
   - [x] `bun run build` + `bun run lint` verts en campus ET personal
   - [x] Mode personal strictement préservé sans régression
2. **Phase 2 test manuel** : lancer `cd nova-server && docker compose up -d` pour valider le flux audio réel sur GPU quand prêt.
3. **Commit** : préparer le commit git des modifications propres.

## Fichiers campus (carte)

- Backend Rust : `src-tauri/src/commands/campus.rs`, hooks dans `actions.rs`,
  `licensing.rs` (bypass palier), enregistrées dans `lib.rs`.
- Frontend : `src/lib/mode.ts`, `src/lib/campusApi.ts`, `src/lib/campusSession.ts`,
  `src/components/onboarding/CampusOnboarding.tsx`, `CampusStatusBubble.tsx`,
  `src/components/footer/CampusStatusFooter.tsx`, `src/components/settings/*/Campus*.tsx`,
  `src/stores/campusBubbleStore.ts`, `src/bindings.ts`.
- i18n : clés `campus.*` dans `en` + `fr` (déjà présentes).