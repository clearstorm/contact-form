# Project Status

Concise current-state snapshot for ContactForm. For what each feature *means*
and its status vocabulary, see [FEATURES.md](FEATURES.md) (and its
machine-readable twin [project.state.json](project.state.json)). For what's
coming next, see [ROADMAP.md](ROADMAP.md) — this file points at the roadmap's
next item instead of duplicating it.

## Current state

- **Latest release:** `v0.3.0` — file uploads, multi-selects and datalist
  suggestions, 12-column field sizing, structural field types, multi-step
  wizard (`step` markers + `stepper` chrome), `showWhen` conditionals,
  `statusMode: "replace"`, framework-independent bindings (Astro · React ·
  vanilla · TanStack). Immutable tags: `v0.1.0`, `v0.2.0`, `v0.3.0`.
- **Branch:** `dev` (ahead of `main`), working tree clean.
- **Most recent work (HEAD):**
  - Wizard hooks + the `rf:*` event bus (`5107a64`) — `attachForm` /
    `renderForm` now return `{ on(event, handler), detach() }`: the
    namespaced `rf:*` event bus (`rf:fields-change`, `rf:row-add` /
    `rf:row-remove`, `rf:step-change`, `rf:submit-start` / `submit-success` /
    `submit-error`) rides the engine's detach-safe listener registry, so
    `detach()` removes subscriptions with everything else and native
    `addEventListener` on the form sees the same events. Veto-capable
    lifecycle hooks (`beforeValidateStep` / `afterStepChange` /
    `beforeSubmit` / `afterSubmit`) across `attachForm` / `renderForm`
    options, the React `hooks` prop and the TanStack bridge; `FormSpec.hooks`
    hook-ref *names* resolve against the options' named registry (specs stay
    serialisable).
  - Repeaters — dynamic row groups (`f006672`) — `type: "repeater"` specs
    holding any field types, visitor add/remove rows bounded by `minRows` /
    `maxRows` (the add button disables at the ceiling, remove at the floor),
    row-scoped validation (cross-field rules stay inside the row's own
    values), and a canonical payload that groups each repeater's rows into
    one structured JSON-array entry (empty rows dropped, or padded back to
    `minRows`; files as filenames). The scalar-only TanStack bridge and Zod
    adapter skip row groups (documented non-goal).
  - File upload bounds (`2c8bd54`) — `maxSize` (bytes or `"5MB"`-style units),
    `allowedTypes` MIME allow-list with `image/*` globs, and `minFiles` /
    `maxFiles` count bounds on file fields — all read `ctx.files`; a
    `minFiles > 0` bound implies required. (Diff stats for the M3 tip scan are
    under **HEAD commit** below.)
  - Validation rule expansion (`1ea47bc`) — `pattern` (regex), `minLength` /
    `maxLength` soft bounds (with a live `N / max` character counter),
    `sameAs` cross-field equality and `minSelect` / `maxSelect` selection
    bounds; a `RuleContext` seam (`values`, `selfValues`) threads sibling
    values through the DOM engine and the TanStack bridge.
  - Conditional logic expansion (`2dcf3cc`) — 9 new `showWhen` operators
    (`containsAny`, numeric + lexicographic comparisons, `startsWith` /
    `endsWith` / `regex`, …) and `anyOf` / `noneOf` / `not` wrappers that nest
    freely; `visibilityFields()` powers both serialisation (`dependsOn`) and
    the engine's controller listeners.
  - Pluggable validation seam + optional Zod adapter (`94bc42e`) — every
    binding now validates through a `ValidationProvider`; `zodValidation`
    consumes schemas structurally (zod v3 + v4), so `zod` stays an optional
    peer.
  - Framework-independent bindings refactor (`ae187c6`) — markup builders in
    `src/runtime/markup.ts` are the single source of truth; React/vanilla/
    TanStack bindings all render through them.
  - React-router parity app + the TanStack/Zod demo (`5559979`) — the
    `react-demo` mirrors the Astro demo route for route; the `tanstack-demo`
    proves the validation seam swaps only *which* rules run.

## Feature summary

- **40 implemented** / **2 planned** of 42 tracked features (see
  FEATURES.md). Implemented means shipped, exercised by the test suite
  (`npm test`) and demonstrated in `examples/`.
- The 2 planned features: the **Nodemailer mail-delivery adapter**
  (`mailer-nodemailer`) and **npm publishing** (`release-npm-publish`).

## Health

- `npm test` green — core + mailers, markup snapshots, TanStack bridge, Zod
  adapter, client engine under happy-dom.
- `npm run typecheck` clean (strict `tsc --noEmit` over `src/`).
- Zero runtime dependencies; `react`, `@tanstack/react-form` and `zod` are
  optional peers.

## Immediate next work

The next milestone on [ROADMAP.md](ROADMAP.md): **M6 — analytics +
deprecation cleanup** — a zero-dependency `createAnalytics({ adapter })`
seam subscribed to the M5 `rf:*` bus, then removing the legacy `copy.back` /
`copy.next` label fallbacks and the `66` size alias (keep `67`). After that
the roadmap's separate release track is the Nodemailer-based mail-delivery
adapter (v0.4.0 target) — the serverless worker half of the `json` mailer
path.