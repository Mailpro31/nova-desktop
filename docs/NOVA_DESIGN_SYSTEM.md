# Nova Design System — Quiet Engineering

Nova Desktop uses Apple-level product thinking—clarity, restraint, continuity, immediate feedback, and careful motion—without copying Apple UI. The application remains a native-feeling Windows product, built around Nova's glass orb, Nova blue, and the needs of higher education.

## Principles

1. **Clarity before decoration.** Every screen has one obvious purpose, a readable hierarchy, and as few containers as necessary.
2. **One action accent.** Nova blue marks actions, selection, progress, links, toggles, and focus. Status colors only communicate status.
3. **Windows-native foundations.** Segoe UI, familiar keyboard behavior, high-DPI layouts, conventional dialogs, and Windows reading order take priority.
4. **Continuity and feedback.** State changes happen near their cause, preserve spatial context, and never block the next user action.
5. **Accessible by construction.** Keyboard use, visible focus, semantic labels, reduced motion, contrast, scaling, long translations, and RTL are part of the component contract.
6. **Campus is calm and credible.** The managed experience is minimal, professional, and appropriate for an engineering school and its IT department.

## Foundations

`src/styles/theme.css` is the source of truth. Components consume semantic tokens instead of introducing local colors, radii, shadows, or timing values.

### Color roles

| Role                   | Token                  | Use                              |
| ---------------------- | ---------------------- | -------------------------------- |
| Window                 | `--color-background`   | App canvas                       |
| Sidebar                | `--color-sidebar`      | Navigation plane                 |
| Surface                | `--color-surface`      | Cards, dialogs, menus            |
| Inset                  | `--color-inset`        | Inputs and recessed rows         |
| Hairline               | `--color-hairline`     | Quiet separation                 |
| Action                 | `--color-accent`       | Primary action, selection, focus |
| Success/warning/danger | semantic status tokens | Status meaning only              |

Light mode is the reference palette. Dark mode maps every semantic role rather than inverting isolated colors. Do not hard-code white surfaces or use color as the only state signal.

### Typography

- Font stack: `Segoe UI Variable Text`, `Segoe UI`, then `system-ui`.
- Page title: 28px, semibold, compact line height.
- Section title: 16–20px, semibold.
- Body: 14–15px with comfortable line height.
- Metadata: 12–13px; never shrink important labels to compensate for layout.
- Use sentence case. Reserve uppercase for short technical codes when required by the content.

### Spacing, geometry, and depth

- Use a 4px base rhythm; common gaps are 8, 12, 16, 24, 32, and 48px.
- Controls use `--nova-radius-control`; cards use `--nova-radius-card`; dialogs use `--nova-radius-modal`.
- Common controls are 36–40px high. Icon-only actions target at least 36px where the compact overlay does not impose a stricter footprint.
- Use `--nova-shadow-sm` for subtle separation, `--nova-shadow-floating` for menus, and `--nova-shadow-modal` for dialogs.
- Prefer whitespace and hairlines over extra cards. Avoid nested cards unless the inner container is a true independent object.

## Components

- `PageHeader` and `SectionHeader` establish hierarchy and action placement.
- `Button`, `Input`, `Textarea`, `Select`, `Dropdown`, `ToggleSwitch`, `Slider`, and `Badge` define control geometry and focus behavior.
- `Dialog` owns title semantics, focus trapping, Escape dismissal, backdrop behavior, and focus return.
- `Tooltip` supplements a visible label; it never replaces the accessible name.
- `Kbd` represents keyboard shortcuts consistently.

New UI should extend these primitives instead of adding local variants. Destructive actions use the danger role and require confirmation when irreversible.

## Navigation and page composition

Campus navigation is ordered Home, Styles, History, Campus, Settings. Icons stay neutral; the active item uses a restrained selected surface and text treatment. A single organization/status region appears at the bottom of the desktop navigation.

Pages use a maximum readable width around 760px for settings and content-heavy forms. Home may use a wider shell while keeping its primary dictation action centered. Use progressive disclosure for advanced or managed details.

## Motion

| Purpose        | Token                            | Guidance                         |
| -------------- | -------------------------------- | -------------------------------- |
| Micro feedback | `--nova-motion-micro` (120ms)    | Press, hover, small state change |
| Standard       | `--nova-motion-standard` (180ms) | Selection, fade, menu            |
| Panel          | `--nova-motion-panel` (220ms)    | Dialog or panel geometry         |

Animate from the interaction's origin and keep transitions interruptible. Springs are reserved for direct manipulation or organic orb behavior when settling communicates state. Avoid long fades, decorative scaling, and broad `transition-all`. Under `prefers-reduced-motion`, nonessential motion is removed; under reduced transparency, translucent surfaces become opaque.

## Accessibility and internationalization checklist

- Navigate every action, tab, menu, and dialog with the keyboard alone.
- Keep a visible 2px focus indicator and restore focus after dialogs close.
- Associate labels and descriptions with inputs; name icon-only buttons.
- Expose progress, selection, errors, and live states semantically.
- Verify 200% zoom, narrow windows, high contrast, and reduced motion.
- Test long French and German copy plus Arabic and Hebrew direction.
- Never embed new user-facing copy outside i18n resources.

## Validation contract

For shared visual changes, run lint, type checking, translation validation, Campus and Personal production builds, focused unit tests, and the critical Playwright flows. Review Home, Styles, History, Campus, Settings, onboarding, dialogs, and recording overlay states in both light and dark themes. Remove or optimize unused heavy visual assets before release.
