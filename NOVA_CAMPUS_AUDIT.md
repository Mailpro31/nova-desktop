# Nova Campus pilot-readiness audit

Audit updated on 2026-08-16 for `nova-desktop/campus` (PR #96) and
`nova-server/feat/campus-platform`.

## Delivered experience

- Campus authentication by email code or Microsoft Entra device code.
- OS credential storage for the Nova bearer token; JavaScript never receives it.
- A dedicated, resumable first-run flow: Welcome, AI Essentials, Smart Setup,
  first dictation, and confirmation.
- AI Essentials as a maintainable six-module learning track with local,
  organization-scoped progress and no leaderboard, points, or streaks.
- One-click recommended setup with an offline-safe local fallback and an optional
  three-question customization path.
- Stable Campus navigation: Home, AI Skills, Styles, Personalization, History,
  Campus, and Settings. Entries remain governed by institution capabilities.
- Server-backed vocabulary, personal dictionary, snippets, formatting rules,
  command mode, and engineering-note formatting.
- A functional Debug switch that reveals the log-level selector and live logs.
- Local processing fallback, remote session logout/revocation, expiring tokens,
  domain/seat/machine enforcement, and an administrator console.

The Personal edition keeps its original onboarding and does not expose Campus
navigation.

## Architecture

- `CampusOrganization`, capabilities, authentication methods, privacy policy,
  education mode, and AI Skills policy are resolved centrally in
  `src/lib/campusPolicy.ts`.
- `campusStore.ts` loads the server's public `/api/config` document and keeps one
  source of truth for organization, capabilities, session metadata, and status.
- All authenticated HTTP calls are Tauri commands. Rust retrieves the bearer
  token from the operating-system credential store and handles 401 cleanup.
- Curriculum and progress types live in `src/lib/aiSkills.ts`; the same module
  player is reused during first run and in the permanent AI Skills section.
- First-run and course progress use separate versioned, per-organization and
  per-user local records. Detailed answers are not sent to administrators.
- Institution policy may disable AI Skills, make the foundation required, or
  disable progress tracking. Required training is clearly explained and is the
  only case where the course cannot be skipped.

## First-run paths

1. **Recommended:** complete one short AI module, apply Smart Setup, try Nova,
   and reach Home.
2. **Fast:** skip AI, apply recommended setup, try Nova, and reach Home.
3. **Immediate:** skip both optional steps and reach Home.

An interrupted module resumes at the exact active module. Smart Setup can still
complete when the Campus server is unavailable. Motion is reduced when the
operating-system preference requests it.

## Security and privacy

- Email and Microsoft identities are validated server-side against configured
  domains. Entra uses OAuth device authorization with `User.Read`; no client
  secret is embedded in the desktop application.
- Nova tokens expire and can be revoked on logout. A new login on the same
  machine replaces the prior token and does not consume another seat.
- The server enforces distinct active-user seats and per-user machine limits.
- The client only displays a no-storage claim when the institution configuration
  marks it as verified.
- AI Skills progress is local. The administrator receives neither quiz answers
  nor detailed learning behavior.

## Accessibility and interaction quality

- Primary controls have visible focus, semantic labels, and at least 44 px hit
  targets on the redesigned flow.
- Keyboard navigation, modal focus containment, Escape behavior, and narrow/RTL
  layouts are covered by browser tests.
- Motion is short, interruptible, and disabled or simplified under
  `prefers-reduced-motion`.
- Hierarchy, spacing, typography, feedback, and restraint follow Apple-level
  design thinking while retaining Windows-native controls and Nova identity.

Manual NVDA, Windows 125%/150% scaling, calibrated contrast, and real hardware
microphone checks remain release checks.

## Automated verification

- Frontend lint, production build, translation parity, and unit tests.
- Rust formatting, compilation, and Campus command tests.
- Campus Playwright coverage for email and Entra authentication, all three
  first-run paths, resume, offline setup, navigation, keyboard, narrow layouts,
  and RTL languages.
- Personal-mode Playwright regression coverage.
- Server tests for public config/health, email authentication, Entra device flow,
  authenticated features, administrator access, and logout.

## Ready for pilot

- The signed-in Campus product journey and policy-gated feature set.
- Local Docker deployment and a documented Microsoft Entra test configuration.
- A Windows Campus prerelease build for controlled test devices.
- Administrator access, capability configuration, and a complete manual test
  matrix in `nova-server/TESTING_CAMPUS.md`.

## Still required before broad production deployment

- Production DNS, TLS certificate, SMTP, Entra tenant registration, and secrets.
- A documented retention/privacy decision for every configured Whisper and LLM
  provider.
- Load, failover, GPU-concurrency, backup, restore, and monitoring validation on
  the target infrastructure.
- Code signing and SmartScreen reputation for the Windows installer.
- Manual assistive-technology, scaling, institutional security, and DSI acceptance
  testing on managed school devices.
