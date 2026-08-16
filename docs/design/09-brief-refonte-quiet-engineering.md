# Nova Campus — Redesign brief (source of truth for the redesign)

> Author: the product owner. This document supersedes stylistic choices visible
> in the current code. Where it conflicts with the existing product, see the
> annotated section at the end of this file.

Completely redesign the visual experience of a **Windows desktop application**
called **Nova Campus**.

This is not a landing page. This is not a conceptual Dribbble shot. This must be
a **realistic, implementable, high-fidelity product design** for an actual
Windows desktop application. It will be used as the reference for the production
React/Tauri application.

## Product

Nova is an intelligent voice writing application. The user holds a keyboard
shortcut, speaks, and Nova writes wherever the cursor is.

Nova can also: rewrite selected text; adapt writing style; transcribe audio
files; maintain writing history; use personal dictionaries; use voice snippets;
apply formatting rules; work locally; connect to a university Campus
infrastructure.

Nova Campus is the institutional edition designed for students, teachers,
university staff, engineering schools and universities. The first pilot
institution is **IPSA Paris**, an aerospace engineering school.

**Do not design the product specifically for IPSA.** The architecture and visual
system must work for any university.

## Primary design goal

Nova must look significantly more **real, professional, beautiful, mature,
precise and premium** than a typical AI-generated application. It should feel
like a product developed by an experienced product design team.

Avoid the recognizable generic AI-generated SaaS aesthetic. Do not create: beige
startup dashboards; random gradients; huge rounded cards; giant marketing
typography; meaningless analytics; colorful feature tiles; purple AI gradients;
excessive glassmorphism; dozens of pills; floating decorative blobs; generic
shadcn dashboard aesthetics.

## Art direction — QUIET ENGINEERING

Three principles: **Calm. Precise. Intelligent.**

The product should combine Apple-level attention to detail + the precision of an
engineering tool + the calm of a premium educational product + the familiarity
expected from a Windows desktop application.

### Apple reference

Apply the principles from
<https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md>.

Apple-quality **product thinking**, **not** an Apple clone. Do not reproduce:
macOS traffic lights; macOS Settings; iOS controls; Apple proprietary UI; fake
Mac window chrome. Nova runs on Windows — translate the principles into a modern
Windows desktop application.

### The experience should feel like

A tool that could plausibly be used by an aerospace engineering student today,
and by an Airbus, Safran, Thales or ArianeGroup engineer tomorrow.

It must **never** look childish or school-like. Education should appear through
clarity, structure, progress, knowledge and trust — not through cartoons,
mascots, school icons, bright colors or gamification clichés.

### Brand hierarchy

```
NOVA
Campus
Managed by IPSA
```

Nova always remains the primary brand. Do not make the application look like an
IPSA-branded portal.

## Scope — design the entire product

Not only the Home screen. A coherent complete product system covering:

01. Campus login · 02. Verification code · 03. Connection success ·
04. First-run welcome · 05. AI Essentials introduction · 06. AI Skills module ·
07. AI Skills quiz · 08. AI Skills progression · 09. Smart Setup ·
10. Microphone setup · 11. Recommended configuration · 12. Custom setup ·
13. First dictation tutorial · 14. Main Home · 15. Dictation active state ·
16. Processing state · 17. Rewrite · 18. File transcription · 19. Styles ·
20. Style selection · 21. History · 22. Campus page · 23. Privacy information ·
24. Organization information · 25. Settings · 26. Writing settings ·
27. Dictionary · 28. Snippets · 29. Formatting rules · 30. Advanced settings ·
31. Offline Campus state · 32. Local fallback state · 33. Errors ·
34. Empty states · 35. Dialogs · 36. Toasts · 37. Tooltips ·
38. Recording overlay · 39. Dark mode · 40. Small-window layout.

Every screen must look like part of the **same product**.

## Design system first

Before designing pages, establish and visually document a coherent system:
colors, typography, spacing, radius, borders, shadows, icons, buttons, inputs,
selects, toggles, segmented controls, badges, status, tooltips, dialogs, cards,
lists, navigation, empty states, progress, keyboard shortcuts, motion.

### Color philosophy

**Light-first.**

- Main application background: approximately `#F5F5F7`
- Primary surfaces: white
- Primary text: near black
- Secondary text: neutral cool gray
- Primary interactive accent: **Nova Blue, approximately `#0A84FF`**

There must be **one** main action color. Do not create a color for every feature.

### Semantic colors

- **Green** — only for success / connected / ready
- **Amber** — warning / degraded / local fallback
- **Red** — error / destructive

Do not use these colors as decoration.

### Dark mode

Design a **true** dark theme — intentional, not a light UI with inverted colors.
Deep neutral charcoal / very subtle blue-black background. Surfaces must remain
distinguishable without heavy borders.

### Typography

System-oriented type direction appropriate for Windows: **Segoe UI Variable /
system UI**, with Apple-like care in weight, tracking, line height, hierarchy and
optical balance. No trendy display font — Nova is a tool.

| Role | Size | Weight |
|---|---|---|
| Hero | 30–32 px | Semibold |
| Page title | 26–28 px | Semibold |
| Section title | 16–17 px | Semibold |
| Body | 14–15 px | Regular |
| UI | 13–14 px | Medium |
| Metadata | 12–13 px | — |

Avoid excessive bold text.

### Spacing

Strict **4 px** foundation. Rhythm: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
Every alignment should feel intentional.

### Radius

Do not make everything extremely round.

- controls: 8–10 px
- cards: 12–14 px
- large panels / dialogs: 16 px
- pill: only when semantically appropriate

The engineering identity should feel slightly more precise than a mobile consumer
application.

### Borders, shadows, depth

Subtle hairlines. Prefer structure through **spacing + typography + subtle
borders** over big shadows and cards.

Shadows extremely restrained — most surfaces need none. Use depth only for
dialogs, floating panels, the recording overlay and menus. Depth communicates
hierarchy, never decoration.

### Translucency

Extremely selective. Potentially appropriate: recording overlay, floating menu,
small transient panel. **Not** appropriate: every card, every page, every setting.

### Motion

- micro interaction: ~120 ms
- standard: ~180 ms
- panel: ~220 ms

Responsive and interruptible. Springs only where they improve physicality.
Respect reduced motion.

## Home screen

Home is the most important screen. Within 3 seconds it must answer: *What does
Nova do? How do I use it? Is it ready?*

Suggested hierarchy:

```
Nova Campus                              ● Campus connected

Speak. Nova writes.

Hold F9 and speak naturally.
Nova writes wherever your cursor is.

                    [Nova orb]

                Hold F9 to dictate

Rewrite      Transcribe file      Style: Auto


Recent
Project notes...                              14:32
Email to professor...                         13:58

View history →


AI Skills
Foundation · 4 / 6 complete

Continue →
```

**Do not turn Home into a dashboard.** No analytics. No 8 feature cards. No four
equally important buttons. Dictation is the primary behavior; everything else is
visually subordinate.

## Nova orb

An important brand object. Design a beautiful restrained orb: intelligent, calm,
precise, slightly physical. Not gaming, neon, metaverse or a Siri clone.

Used primarily in Home, onboarding and the recording overlay.

**States to design:** Idle · Listening · Processing · Success · Error. The visual
distinction must be instantly understandable.

## Recording overlay

One of the most important pieces of the application. A compact floating overlay
shown while dictating, extremely polished.

States: **IDLE · LISTENING · PROCESSING · DONE · ERROR**.

It should feel almost like a physical instrument responding to the user's voice.
Use motion and depth intelligently. Keep it compact.

## First connection experience

After Campus verification, a simple success screen with a small Nova orb / check:

```
You're connected to IPSA

Organization      IPSA Paris
Account           s••••@eleves.ipsa.fr
Processing        Campus infrastructure

                                    [ Continue ]
```

## First-run welcome

```
Welcome to Nova Campus

Learn how to work with AI responsibly,
or start using Nova right away.

PRIMARY:    Start with AI Essentials      Recommended · about 6 min
SECONDARY:  Set up Nova now
TERTIARY:   Skip for now
```

Inviting without creating pressure.

## AI Skills

A premium education experience — **not an LMS**. Small intelligent learning
experiences. Visually closer to a professional certification interface than to a
school app.

### AI Skills home

```
AI Skills

Learn to work with AI effectively and responsibly.

Foundation

██████████████░░

4 of 6 skills completed

Working with AI                ✓
Better prompting               ✓
Verify outputs                 In progress
Privacy                        ✓
AI in engineering              Next
Responsible use                —
```

### Gamification

Use: progress, mastery, milestones, skills, completion, certificates.
Avoid: XP, coins, gems, leaderboards, mascots, confetti, streak anxiety.

### Module screen

A lesson focuses on one idea:

```
Verify the output

AI can produce convincing answers that are still wrong.

SCENARIO
An AI has calculated the load on a structural component.
What should you do?

[ Use it directly ]
[ Verify assumptions, units and calculations ]
[ Ask the model if it is certain ]

Progress: 3 / 6
```

Answering must feel immediate.

### Module feedback

```
Correct

In engineering work, assumptions and units should always be
verified independently.

Continue →
```

No massive green success screen. No confetti.

## Smart Setup

Critical screen. Nova must feel intelligent **before** the user even uses AI.

```
Set up Nova

We've prepared the recommended setup for you.

Microphone            AirPods Pro          ✓ Ready
Language              French               ✓ Detected
Dictation shortcut    F9                   ✓ Available
Writing style         Auto                 ✓ Recommended
Processing            IPSA Campus          ✓ Connected

[ Use recommended setup ]
Customize
```

The main idea: **one-click setup**.

### Customize setup

Not a huge preferences wizard. At most a few meaningful questions, e.g.:

```
What do you use Nova for most?

Classes & notes · Engineering projects · Emails · Coding · A bit of everything
```

Simple selection interface.

## First dictation

```
Try Nova

Hold F9 and say:
"Send the project update tomorrow morning."
```

Then show the resulting text, then:

```
That's it.
Nova works anywhere your cursor is.

[ Open Nova ]
```

## Campus page

Professional institutional information. No dashboard.

```
Campus

IPSA Paris
Student · AERO 2
Managed by IPSA

Organization        IPSA Paris
Processing          Campus infrastructure
Privacy             Your dictated content isn't stored by Nova Campus.

Available features  Dictation · Rewrite · Styles · File transcription
```

## Managed settings

Settings controlled by the university:

```
Cloud processing            Off
                            🔒 Managed by IPSA
```

It must be immediately clear the setting is **intentionally locked** — not that
the app is broken.

## Settings

Exceptionally calm. Boring in the best possible way. Structure: **General ·
Writing · Campus · Advanced**. Use rows, groups and subtle separators instead of
dozens of cards.

- **General** — microphone, language, shortcuts, sound feedback, theme
- **Writing** — dictionary, snippets, formatting rules, default Style
- **Advanced** — logs, app data, debug, server details, diagnostics
  (must not appear in normal everyday settings)

## Styles

One of Nova's differentiating features. Categories: Auto · Professional · Email ·
Technical Notes · Meeting Notes · Lab Report · Project Brief. Only treat features
as active if supported by product data.

**Style card:** compact — name, one-line description, small visual identity.
Selected state: subtle Nova Blue border / check. Do **not** make every Style a
different colorful card.

## History

Professional list grouped by date:

```
TODAY
14:32   Project notes
13:58   Email to professor

YESTERDAY
17:22   Lab observations
```

Use whitespace and typography. Do not wrap every entry in a large card.

## File transcription

A realistic file picker modal: FileAudio icon, "Drop audio here" or "Select a
file", supported MP3 / WAV / M4A. Keep the drop zone subtle.

## Status language

- Connected — small green dot, "Campus connected"
- Fallback — small amber dot, "Nova Local active"
- Error — "Campus temporarily unavailable · Nova continues locally"

Never show HTTP errors to normal users.

## Navigation

Explore the best desktop navigation. Likely:

```
Nova

Home
AI Skills
Styles
History
Campus

Settings

Managed by IPSA
```

Extremely compact. Do not over-design the sidebar.

## Window and layout

Design for **1200 × 780**, supporting approximately **900 × 620 minimum**.
Consider Windows scaling at 100 %, 125 % and 150 %.

**Centering:** everything optically aligned. Do not mathematically center against
the full window when a sidebar exists — center primary content within the actual
content area.

## Controls

- **Buttons** — Primary (Nova Blue), Secondary, Ghost, Danger, Icon. One primary
  color only. Consistent heights, approximately **36–40 px**.
- **Inputs** — professional desktop controls, **36–40 px** height, subtle
  background, hairline border, clear focus. No giant mobile-style inputs.
- **Keyboard shortcuts** — beautiful subtle `<kbd>` elements (`F9`,
  `Ctrl + Shift + R`). Physical but restrained.
- **Progress** — thin and precise bars. Avoid giant progress rings without a
  strong reason.

## Empty, error, toast, tooltip

- **Empty:** "No recent dictations · Your recent dictations will appear here."
  No giant illustration.
- **Error:** always answer *what happened* and *what can I do* —
  "Campus is temporarily unavailable. Nova is using local processing for now."
- **Toasts:** compact — "Copied to clipboard", "Style changed to Auto",
  "Campus reconnected".
- **Tooltips:** short, fast, useful.

## Microcopy

Nova speaks like a precise tool. Never childish.

Avoid: *Awesome! Amazing! Great job! You're crushing it!*
Use: **Ready · Connected · Module complete · Saved · Continue · Try again.**

## Accessibility

Keyboard navigation, visible focus, high contrast, screen reader structure, large
Windows scaling, reduced motion.

## Content rules

- **Real content only** — no Lorem Ipsum. Realistic Nova content throughout. The
  product should look ready to ship.
- **No fake features** — do not invent a giant AI assistant chat. Nova is
  voice → writing, not a chatbot. Do not make the product look like ChatGPT.
- **No marketing UI** — this is the application, not the website. No hero
  marketing sections, no slogans everywhere, no CTA-heavy layouts.

## Deliverables, in order

1. **Visual foundation board** — Nova colors, typography scale, spacing, radius,
   buttons, inputs, navigation, surface hierarchy, Nova orb, status language.
   Then apply that exact system to every page; individual screens must not drift.
2. **Complete application flow** — Campus login → verify → connected → welcome →
   AI Essentials or Smart Setup → first dictation → Home. Then all major product
   screens.
3. **Component library** of all recurring primitives.
4. **State matrix** — Normal · Hover · Pressed · Focus · Disabled · Loading ·
   Error · Success · Offline · Managed.
5. **High-fidelity production-ready screens.** No wireframe quality, no
   conceptual placeholders.

Light and dark variants for key screens: Home, AI Skills, Campus, Styles,
Settings, Onboarding, Recording overlay.

## Design quality test

For every screen ask: What is the primary action? What can be removed? Is
everything aligned? Does every element have a reason to exist? Would a first-year
student understand it? Would an IT director trust it? Would an engineer find it
professional? Does this look like a real shipping product rather than an
AI-generated mockup?

### AI design anti-pattern to avoid

Huge cards · soft beige · oversized serif headlines · random orange accents ·
rounded-everything · decorative gradients · random floating widgets.

## Final art direction

The result should feel like **an intelligent writing instrument built for the
next generation of engineers**:

precise without being cold; premium without being luxurious; educational without
being school-like; technological without being futuristic; minimal without
feeling empty; beautiful without sacrificing usability.

Most importantly: **it must look like Nova.** Not Apple. Not Linear. Not Notion.
Not ChatGPT. Not a generic AI-generated dashboard. Use those products only as
quality benchmarks.

---

# Annexe — écarts avec le produit actuel

Relevé factuel établi en comparant ce brief au code de la branche `campus`.
Ce ne sont pas des objections : ce sont les points que la refonte doit trancher
explicitement, parce que le code dit aujourd'hui autre chose.

## Le brief est déjà aligné sur les tokens existants

Deux valeurs du brief correspondent **exactement** aux tokens Nova en place :

- `#F5F5F7` = `--nova-light-window` (fond de fenêtre de la palette claire) ;
- `#0A84FF` = `--nova-accent` (accent d'action unique).

La direction « light-first » n'invente donc pas une palette : elle **promeut la
palette claire existante au rang de défaut** pour l'édition Campus. Les surfaces
blanches, le texte encre et le gris froid secondaire existent déjà
(`--nova-light-surface`, `--nova-light-text`, `--nova-light-text-secondary`).

## Points à trancher

| Sujet | Ce que dit le code | Ce que dit le brief |
|---|---|---|
| **Thème par défaut** | sombre — identité « bleu nuit », `theme.css` | clair d'abord, sombre comme vrai thème |
| **Raccourci de dictée** | `Ctrl+Espace` (défaut Campus documenté) | `F9`, affiché partout dans les maquettes |
| **Étapes après connexion** | doctrine « zéro friction » : **aucune** étape après la connexion, aucun réglage obligatoire | Welcome → AI Essentials / Smart Setup → première dictée |
| **Entrées de navigation** | règle « 4 entrées maximum » | Home · AI Skills · Styles · History · Campus + Settings = 6 |
| **Pile typographique** | `-apple-system, "SF Pro Display", "SF Pro Text", "Segoe UI", Inter, system-ui` | Segoe UI Variable / system UI, Windows d'abord |
| **Échelle de titres** | base 15 px, titres jusqu'à `text-3xl` sur l'accueil Campus | échelle explicite 30-32 / 26-28 / 16-17 / 14-15 / 13-14 / 12-13 |
| **Vocabulaire de repli** | « Serveur injoignable — texte collé sans reformulation » | « Nova Local active » / « Campus temporarily unavailable » |

Sur les étapes d'onboarding et le nombre d'entrées de navigation, le brief
assouplit délibérément la doctrine « zéro friction » (§05) : les étapes sont
présentées comme sautables (« Skip for now », « Set up Nova now ») et la
configuration recommandée tient en un clic. C'est un arbitrage produit assumé,
pas un oubli — mais il doit être conscient, car §05 reste par ailleurs la règle.

## Ce qui n'existe pas encore dans le code

Aucune implémentation actuelle, à concevoir de zéro : **AI Essentials**,
**AI Skills** (accueil, module, quiz, progression, certificats), **Smart Setup**,
**configuration recommandée en un clic**, **choix des usages**, **Organization**
comme écran, **Rewrite** comme écran autonome, **réglages verrouillés par
l'établissement** (« Managed by IPSA »), **détection automatique** du micro, de
la langue et de la disponibilité du raccourci.

Les rôles existent côté serveur (`student` · `teacher` · `staff` · `partner`,
plus `cohort` et `organization`) mais **ne sont pas exploités** par l'interface :
« Student · AERO 2 » sur la page Campus suppose de les brancher.

## Contrainte technique à ne pas perdre de vue

`Ctrl+Espace` ou `F9` : le raccourci est **global** et fonctionne hors de la
fenêtre. Sur macOS il exige l'autorisation d'accessibilité, sur Windows
l'autorisation du microphone. Ces demandes restent un écran d'onboarding à part
entière, avant même la connexion Campus — le brief ne les mentionne pas.
