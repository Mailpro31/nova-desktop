# /design-sync — notes pour la prochaine synchronisation

## Forme du dépôt

- Nova est une **application privée**, pas une bibliothèque publiée : ni `dist/`
  de composants, ni champ `exports`. Le design system est défini
  explicitement par le barrel `.design-sync/entry.tsx` (24 composants :
  `src/components/ui/*`, `shared/ProgressBar`, `icons/*`), passé au converter
  via `--entry`.
- `componentSrcMap` liste donc les 24 composants **à la main** : sans `.d.ts`
  livré, c'est la seule source de la liste. Ajouter un composant au design
  system = l'exporter dans `entry.tsx` **et** l'ajouter à `componentSrcMap`.
- `entry.tsx` exporte aussi `NovaProvider` (contexte `react-i18next`), déclaré
  dans `cfg.provider`. Le module i18n de l'app (`src/i18n/index.ts`) n'est pas
  réutilisable : il dépend de Tauri (`@tauri-apps/plugin-os`, `@/bindings`) et
  de `import.meta.glob` (Vite). `entry.tsx` initialise donc sa propre instance
  i18next avec les locales `fr` et `en`, langue par défaut `fr`.

## Commande d'exécution

```sh
# depuis la racine du dépôt
mkdir -p .ds-sync && cp -r "<skill>/package-build.mjs" "<skill>/package-validate.mjs" \
  "<skill>/package-capture.mjs" "<skill>/resync.mjs" "<skill>/lib" "<skill>/storybook" .ds-sync/
echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json
(cd .ds-sync && npm i esbuild ts-morph @types/react @tailwindcss/cli tailwindcss @fontsource-variable/inter)

# CSS (cfg.buildCmd), puis build, puis validate
node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs -i .design-sync/ds.css -o .design-sync/.cache/ds-styles.css
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/entry.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

- `@fontsource-variable/inter` **fait partie des dépendances à installer** :
  `.design-sync/fonts/inter.css` pointe vers ses `.woff2` dans
  `.ds-sync/node_modules/`. Sans cette installation, `[FONT_DANGLING]`.
- `@tailwindcss/cli` + `tailwindcss` servent à compiler `cfg.cssEntry`. Le CSS
  livré est **Tailwind compilé sur l'usage réel de l'app** : une classe
  utilitaire qu'aucun fichier scanné n'emploie n'existe pas dans le bundle.
  `.design-sync/ds.css` élargit le scan à `.design-sync/previews`.
- Sur Windows, `package-build.mjs` peut échouer une fois sur
  `EPERM … rm ds-bundle` (verrou transitoire de l'indexeur/antivirus). Relancer
  la même commande suffit.

## Aperçus

- Les 24 aperçus sont **rédigés à la main** dans `.design-sync/previews/` et
  notés `good`. Contenu réaliste en français (domaine : dictée vocale, modèles,
  micro, styles).
- **Mise en page des cellules en styles inline uniquement.** Une classe
  Tailwind employée seulement dans un aperçu obligerait à recompiler le CSS
  avant chaque rebuild d'aperçu — les styles inline évitent ce couplage.
- En JSX, un attribut entre guillemets **ne traite pas** les échappements :
  un chemin Windows doit passer par des accolades
  (`path={"C:\\Users\\…"}`), sinon les `\\` s'affichent littéralement.
- `Dialog` et `Tooltip` sont en `cardMode: "single"` avec viewport dédié : ils
  se rendent dans un portail et s'échapperaient de leur cellule.
- `Tooltip` exige un `targetRef` renseigné : l'aperçu ne monte la bulle
  qu'après le premier rendu (`useEffect` → `setMounted(true)`).
- Plusieurs composants (`ToggleSwitch`, `Slider`, `TextDisplay`) **embarquent
  déjà** `SettingContainer` : ils prennent `label` + `description`, on ne les
  imbrique pas dans un `SettingContainer`.

## Avertissements connus (attendus, ne pas rechercher)

- `[FONT_MISSING] "SF Pro Display", "SF Pro Text"` — polices Apple
  propriétaires, non embarquables. Décision utilisateur : embarquer **Inter**
  (SIL OFL), maillon libre de la pile typographique de Nova, comme relais. Sur
  macOS et Windows, SF Pro / Segoe UI restent prioritaires : le rendu de l'app
  n'est pas modifié.
- `tokens/` reste vide : `copyTokens` exige un `tokensPkg` dans
  `node_modules`, or les tokens Nova vivent dans `src/styles/theme.css`, déjà
  compilé dans `_ds_bundle.css`. `tokensGlob` seul est inopérant — inutile de
  le remettre dans la config.

## Écarts relevés dans le produit (signalés à l'utilisateur)

- `ResetIcon` déclare une prop `color` **qu'il n'applique pas** (tracé toujours
  en `currentColor`). L'aperçu montre la coloration par héritage CSS.
- `Dropdown.onRefresh` n'a **aucun rendu propre** (rappel à l'ouverture).
- `ProgressBar` en mode multiple ignore les libellés et affiche un décompte
  non traduit (« N downloading... »). `TextDisplay` affiche « Copy » en dur.
- Détail complet dans `guidelines/08-dettes-ui-constatees.md`.

## Contexte fonctionnel livré à Claude Design

`docs/design/*.md` (8 fichiers) est copié dans `guidelines/` du
projet et lisible par l'agent de design : produit, navigation et inventaire
d'écrans, flux Campus et états réseau, états/messages/écrans vides, règles UX
« zéro friction », contraintes de plateforme, direction artistique
« Quiet Engineering », dettes d'interface constatées.
Sources internes utilisées : `nova-server/SPEC_NOVA_CAMPUS.md`,
`nova-server/REGLES_UX_ZERO_FRICTION.md`, `NOVA_CAMPUS_PROGRESS.md`
(`nova-server/` est gitignoré — le contenu utile a été reformulé dans les
guidelines, qui sont, elles, committées).

## Risques de re-synchronisation

- **Les guidelines sont rédigées à la main et datent du 16 août 2026.** Elles
  décrivent la branche `campus` à cet instant. Toute évolution produit (écrans
  Campus, rôles exploités, refonte appliquée) les rend obsolètes sans qu'aucun
  contrôle automatique ne le signale. À relire à chaque synchronisation.
- `conventions.md` énumère des classes utilitaires **vérifiées présentes** dans
  `_ds_bundle.css` au moment de la synchronisation. Comme le CSS est compilé
  sur l'usage, une classe abandonnée par l'app disparaît du bundle et le
  document devient faux. Revalider par `grep` sur `ds-bundle/_ds_bundle.css`.
- La liste des composants ne bouge que si `entry.tsx` et `componentSrcMap`
  bougent : un composant ajouté à `src/components/ui/` ne sera **pas** repris
  automatiquement.
- Le CSS dépend de la version de `tailwindcss` installée dans `.ds-sync/`
  (4.3.3 à la synchronisation) alors que l'app épingle `^4.1.16`. Un écart
  majeur de version changerait le CSS livré.
- Périmètre volontairement restreint aux **primitives** : les écrans
  (`Campus*`, `settings/*`, `onboarding/*`, `RecordingOverlay`) ne sont pas
  synchronisés — trop couplés à Tauri, aux stores et à i18n pour rendre en
  aperçu. Leur description vit dans `guidelines/`, pas dans le bundle.
