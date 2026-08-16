# Nova — conventions du design system

Nova est une application **desktop Tauri (Windows-first)** de dictée vocale.
Ce n'est pas un site web : pas de page marketing, pas de scroll infini, des
fenêtres redimensionnables souvent étroites, et un affichage Windows à 125 %
ou 150 % fréquent. Concevez des écrans d'application.

## Enveloppe obligatoire

Plusieurs composants appellent `useTranslation()` (`Dropdown`, `PathDisplay`…)
et lèvent une erreur sans contexte i18n. Enveloppez toujours la racine :

```jsx
<NovaProvider>
  <SettingsGroup title="Enregistrement">
    <ToggleSwitch
      grouped
      checked={pushToTalk}
      onChange={setPushToTalk}
      label="Appuyer pour parler"
      description="Maintenir le raccourci pour enregistrer."
    />
  </SettingsGroup>
</NovaProvider>
```

`NovaProvider` est exporté par le bundle. Il ne porte ni thème ni couleur : le
thème vit entièrement dans le CSS.

## Thème : sombre par défaut, clair pris en charge

L'identité Nova est **sombre (« bleu nuit »)** — c'est le défaut de
l'application. La palette claire s'active via `prefers-color-scheme: light` ou
`:root[data-theme="light"]`; `:root[data-theme="dark"]` force le sombre.
Toute maquette doit tenir dans les deux. Ne codez jamais une couleur en dur :
`bg-white` et `#fff` cassent le thème sombre (l'écran d'accueil Campus actuel
souffre exactement de ce défaut).

## L'idiome de style : tokens d'abord, utilitaires ensuite

Le CSS livré est **Tailwind v4 compilé sur l'usage réel de l'application** :
une classe utilitaire que l'app n'emploie pas aujourd'hui **n'existe pas** dans
`_ds/<dossier>/styles.css`. La voie sûre est donc la variable CSS — toutes sont
définies dans `:root` et basculent avec le thème :

| Token | Rôle |
|---|---|
| `--color-background` | fond de fenêtre |
| `--color-sidebar` | barre latérale |
| `--color-surface` | cartes, groupes de réglages |
| `--color-inset` | champs, zones en creux |
| `--color-text` / `--color-text-secondary` | texte principal / secondaire |
| `--color-hairline` | filets de séparation (1 px) |
| `--color-accent` / `--color-accent-hover` | **bleu Apple `#0A84FF` — action, et rien d'autre** |
| `--color-success` / `--color-danger` | statut |
| `--color-ultra` | verrou de palier « Nova Ultra » (mode personnel uniquement) |
| `--color-mid-gray` | gris neutre, base des voiles `color-mix` |
| `--orb-s0` … `--orb-s4`, `--orb-glow` | dégradé de l'orbe de marque |

Règle d'accent : **une seule couleur d'action**, l'accent bleu. Les couleurs de
section (`SECTION_COLORS`) sont des repères de catégorie, jamais des actions.

Utilitaires effectivement livrés, sûrs à réutiliser : `bg-background`,
`bg-sidebar`, `bg-surface`, `bg-inset`, `bg-accent`, `text-accent`,
`text-text-secondary`, `border-hairline`, `bg-success`, `text-success`,
`text-danger`, `bg-mid-gray/10` (et ses paliers d'opacité), `bg-logo-primary`,
`divide-mid-gray/20`. Pour tout le reste, écrivez `style={{ … var(--color-*) }}`.

## Typographie

Pile système Apple d'abord, `Inter` embarquée comme relais :
`-apple-system, "SF Pro Display", "SF Pro Text", "Segoe UI", Inter, system-ui`.
Base **15 px / 24 px, `letter-spacing: -0.01em`** — c'est elle qui règle le
rythme d'espacement `rem`. Resserrez le tracking sur les grands titres,
laissez le corps à zéro. Employez `rem`, jamais des tailles fixes en px pour le
texte : Windows à 150 % doit rester lisible sans casser la mise en page.

## Où lire la vérité

- `_ds/<dossier>/styles.css` et son `@import` `_ds_bundle.css` : toutes les
  valeurs de tokens et les utilitaires réellement disponibles.
- `components/<groupe>/<Nom>/<Nom>.d.ts` : le contrat de props exact.
- `components/<groupe>/<Nom>/<Nom>.prompt.md` : usage et exemples.
- `guidelines/docs/design/` : le produit — écrans, flux Campus, états réseau, règles UX
  « zéro friction », contraintes plateforme, direction artistique attendue.
  **Lisez `guidelines/` avant de concevoir un écran.**

## Grammaire de réglage

Un réglage n'est jamais un champ nu : c'est un `SettingContainer` (titre,
description, contrôle à droite ou empilé), regroupé dans un `SettingsGroup`
avec `grouped`. `ToggleSwitch`, `Slider` et `TextDisplay` intègrent déjà ce
conteneur — ils prennent `label` + `description`, pas un enfant de mise en page.
