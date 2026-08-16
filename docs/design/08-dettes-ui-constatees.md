# Dettes d'interface constatées dans le code actuel

Relevé factuel effectué en lisant la branche `campus` au moment de la
synchronisation. Ce sont des incohérences réelles, pas des opinions de style :
la refonte devrait les résoudre plutôt que les reconduire.

## Cohérence des thèmes

- **`bg-white` et `bg-black/30` codés en dur** dans les écrans Campus
  (`CampusHomeSettings`, cartes d'action, pastilles de raccourci, panneau
  latéral). Ces écrans sont donc **cassés en thème sombre**, alors que le
  sombre est l'identité par défaut de Nova. Le token à employer est
  `--color-surface`.
- Le mode Campus a été conçu « thème clair » et le mode personnel « thème
  sombre » : les deux modes ne partagent plus le même langage de surface.

## Rayons et formes

- Trois familles de rayons cohabitent sans règle : `rounded-lg` (8 px) sur les
  boutons et champs, `rounded-[13px]` sur les conteneurs de réglage,
  `rounded-2xl` / `rounded-3xl` (16–24 px) sur les cartes Campus. La demande
  produit exclut désormais les grandes cartes très arrondies.

## Couleur

- **Deux systèmes d'accent coexistent** : `--color-accent` (bleu `#0A84FF`) et
  `--color-logo-primary` (même valeur, autre nom), employés indifféremment
  selon les composants. Un seul devrait subsister comme couleur d'action.
- `SECTION_COLORS` attribue **une couleur par section** (gris, violet, vert,
  rose, indigo, orange, cyan) — exactement ce que la nouvelle direction
  artistique refuse (« pas de couleurs différentes pour chaque feature »).
- Les cartes d'action de l'accueil Campus reprennent ces couleurs par
  fonctionnalité (`#0A84FF`, `#FF9F0A`, `#BF5AF2`, `#30D158`).
- `Alert` et `Badge` utilisent des couleurs Tailwind brutes
  (`text-red-400`, `bg-green-500/20`, `bg-yellow-500/10`) au lieu des tokens
  `--color-danger` / `--color-success`. En thème clair, le contraste du texte
  d'alerte est faible.
- `Badge` en variante `primary` pose un texte sombre sur le bleu d'accent :
  contraste insuffisant.

## Navigation

- En mode Campus, **la barre latérale et le panneau latéral déclenché par la
  roue crantée exposent la même liste de sections**. Deux mécanismes de
  navigation redondants pour cinq entrées, alors que la règle produit en
  autorise quatre au maximum.
- L'entrée active se signale différemment selon le mode : bleu plein et texte
  blanc en personnel, pilule grise en Campus.

## Internationalisation

- Chaînes non traduites relevées dans les composants : « Copy » et
  « Copy to clipboard » (`TextDisplay`), « Downloading... » et
  « N downloading... » (`ProgressBar`), « Select an option... » (valeur par
  défaut de `Dropdown`), « Nova » (accepté, c'est la marque).
- Le mot-symbole « Nova » de la barre latérale Campus est un texte HTML alors
  que le mode personnel utilise le logo vectoriel.

## Contrats de composants

- **`ResetIcon` déclare une prop `color` qu'il n'applique jamais** : le tracé
  est toujours dessiné en `currentColor`. La coloration ne fonctionne que par
  héritage CSS depuis le parent. Les autres icônes (`MicrophoneIcon`,
  `CancelIcon`, `TranscriptionIcon`) appliquent bien la prop.
- `Dropdown` accepte `onRefresh` : c'est un rappel déclenché à l'ouverture de
  la liste, **sans aucun rendu propre** — rien ne le signale à l'utilisateur.
- `ProgressBar` ignore les libellés en mode multiple : il n'affiche que des
  mini-barres et un décompte en anglais.
- `SettingContainer` porte quatre axes indépendants (`layout`,
  `descriptionMode`, `grouped`, `disabled`), soit huit combinaisons visuelles
  pour un même composant — source d'incohérences entre écrans.
- La grammaire est double : certains composants (`ToggleSwitch`, `Slider`,
  `TextDisplay`) embarquent leur `SettingContainer` et prennent `label` +
  `description`, d'autres (`Select`, `Input`, `Dropdown`) doivent être
  enveloppés manuellement. Les auteurs d'écrans se trompent régulièrement.

## Densité et échelle

- La base typographique est fixée à **15 px** et de nombreuses tailles sont
  écrites en pixels absolus (`text-[11px]`, `min-h-8`, `w-12 h-14`,
  `h-[22px]`). À 150 % de mise à l'échelle Windows, ces valeurs ne suivent pas
  le texte.
- L'accueil Campus emploie un titre en `text-3xl` là où le reste du produit
  plafonne à `text-base` : deux échelles typographiques sans transition.
