---
name: nova-design
description: Apply Nova Desktop's Quiet Engineering design system to UX/UI audits, React/Tailwind implementation, interaction design, accessibility reviews, onboarding, settings, Campus screens, and the recording overlay. Use whenever changing or reviewing Nova's visual hierarchy, components, navigation, motion, responsive behavior, or Windows desktop experience.
---

# Nova Design

Design with Apple-level care for hierarchy, restraint, continuity, feedback, and perceived performance. Keep the result unmistakably Nova and native to Windows; never reproduce macOS or iOS chrome, patterns, typography, or ornament.

## Work from the system

1. Inspect the existing screen, shared primitives, both product modes, and nearby tests before editing.
2. Reuse semantic tokens from `src/styles/theme.css`. Add a token only when a real reusable role is missing.
3. Prefer one clear page structure and progressive disclosure over nested cards or dashboard grids.
4. Extend shared primitives before creating a local control variant.
5. Validate Campus and Personal modes after changing shared code.

## Keep the visual language quiet

- Use `Segoe UI Variable` or `Segoe UI` first. Keep page titles near 28px, section titles near 16–20px, body text near 14–15px, and metadata near 12–13px.
- Build spacing on a 4px rhythm. Prefer 8, 12, 16, 24, 32, and 48px gaps.
- Use the shared control, card, and dialog radii. Reserve pills for tags, statuses, or genuinely pill-shaped controls.
- Use the window, sidebar, surface, and inset levels intentionally. Let dividers and whitespace group content before adding a card.
- Reserve Nova blue for primary actions, selection, links, toggles, progress, and focus. Use success, warning, and danger colors only for status meaning.
- Keep icons neutral unless color communicates state. Avoid rainbow category identities, decorative gradients, glow, and heavy shadows.
- Make light mode the reference composition and verify the complete dark counterpart.

## Build coherent controls

- Use the shared `Button`, `Input`, `Textarea`, `Select` or `Dropdown`, `ToggleSwitch`, `Badge`, `Dialog`, `Tooltip`, `PageHeader`, `SectionHeader`, and `Kbd` primitives.
- Keep common controls approximately 36–40px high and icon-only targets at least 36px where layout permits.
- Give every field a visible label, every icon-only action an accessible name, and every modal a title, focus trap, Escape behavior, and focus return.
- Show progress and processing in place. Preserve content position across state changes when possible.
- Keep destructive actions explicit and semantically red; request confirmation for irreversible operations.

## Design motion as feedback

- Use about 120ms for micro-feedback, 180ms for standard transitions, and 220ms for panels or dialogs.
- Animate from the interaction's origin and preserve spatial continuity. Keep animations interruptible and avoid blocking input.
- Use springs only for direct manipulation or an organic Nova surface when the settling behavior explains state. Do not add bounce to ordinary buttons, tabs, or page transitions.
- Prefer opacity, transform, and tightly scoped dimension transitions. Avoid broad `transition-all`, long fades, and decorative hover scaling.
- Disable nonessential motion under `prefers-reduced-motion`. Remove blur or transparency effects under reduced-transparency preferences when available.

## Design for Windows and access

- Follow Windows reading order, keyboard expectations, high-DPI scaling, system font metrics, and conventional close/minimize behavior.
- Keep focus rings visible at 200% zoom and with increased contrast. Do not rely on color alone.
- Support keyboard-only use, screen-reader semantics, long translations, narrow windows, RTL direction, and light/dark system preferences.
- Avoid Apple-specific chrome such as traffic-light controls, SF typography, macOS settings replicas, or mobile navigation patterns.

## Validate before handoff

- Run lint, type checking, both Campus and Personal production builds, translation checks, focused unit tests, and critical Playwright flows.
- Inspect Home, Styles, History, Campus, Settings, onboarding, dialogs, and overlay states at narrow and wide Windows sizes.
- Capture stable light and dark screenshots of critical Campus screens when the test environment permits.
- Check for unused heavy assets, hard-coded surfaces, inconsistent radii, long motion, missing focus states, and Personal regressions.
