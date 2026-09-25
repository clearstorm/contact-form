# Project Status

Concise current-state snapshot for ContactForm. For what each feature *means*
and its status vocabulary, see [FEATURES.md](FEATURES.md) (and its
machine-readable twin [project.state.json](project.state.json)). For what's
coming next, see [ROADMAP.md](ROADMAP.md) — this file points at the roadmap's
next item instead of duplicating it.

## Current state

- **Latest release:** `v0.3.0` — file uploads, multi-selects and datalist
  suggestions, 12-column field sizing, structural field types, multi-step
  wizard (`step` markers + `stepper` chrome), conditional wizard steps,
  `showWhen` conditionals, localStorage `autoSave` drafts, `statusMode:
  "replace"`, framework-independent bindings (Astro · React ·
  vanilla · TanStack). Immutable tags: `v0.1.0`, `v0.2.0`, `v0.3.0`.
- **Branch:** `dev` (ahead of `main`), working tree clean.
- **Most recent work (HEAD):**
  - Validation timing + custom success screens (`d563dfa`) —
    `FormSpec.validateOn: "submit" | "blur" | "change" | "touched" |
    Array<…>` selects *when* pristine controls live-validate before submit
    (serialised as `data-validate-on`, overridable at attach — options
    win — and always through the same `ValidationProvider` rules, only the
    timing changes). `"touched"` is the don't-nag mode: a field validates
    the first time it loses focus, a submit attempt unlocks live
    validation for every in-scope field, and both reset on
    `rf:submit-success`; hidden conditional fields and skipped panes never
    live-validate, wizard Next is unchanged. `autoSuccess: false`
    suppresses only the success presentation (no box, no
    `rf-form--success` collapse) while the error box, the reset and
    `rf:submit-success` — now `{ name, id, message }` — stay
    engine-driven; the React `renderStatus` prop renders a custom success
    screen in place of the form with `{ message, name, id, form, reset }`
    (`reset()` re-mounts a fresh form). The Flagship wizard opts into
    `"validateOn": "touched"`; the react-demo `/mailers` page demonstrates
    `renderStatus`.
  - Conditional wizard steps + draft autosave & prefill (`601152a`) —
    `step` markers accept `showWhen`: a pane whose conditions don't hold is
    skipped (hidden + `inert`, struck-through `rf-step--skipped` chip, out of
    validation, the payload and cross-field chains) while authored step
    indices never change — Next/Back/jumps and `rf:step-change`'s `total`
    follow a computed *visible* sequence, a step that collapses underfoot
    reflows, and re-revealing a later step flips the final button back to a
    submit. `autoSave` (boolean or explicit key) drafts the current step,
    repeater row counts and every visible value to localStorage on a ~400ms
    debounce, restores on attach (explicit `values` win) and clears on
    `rf:submit-success`; the runtime `values` option prefills controls at
    attach in every binding. The Flagship wizard example demonstrates all of
    it with a conditional "Company" pane.
  - Analytics seam + deprecation cleanup (`aa130a6`) —
    `createAnalytics({ adapter })`: a zero-dependency seam over the `rf:*`
    bus whose `attach(form)` forwards every event (plus its detail — form
    identity, step transitions, row counts, submit outcomes) to a
    consumer-supplied tracker via native `addEventListener` and returns a
    detach — no fabricated events, no new `data-*` hooks. Also removed the
    legacy `copy.back` / `copy.next` label fallbacks (`form.prev` /
    `form.next` are the only way to label wizard buttons) and the `66` size
    alias (keep `67`); `shell-single.html`'s `data-copy` drops the removed
    keys (regenerated, diff reviewed).
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

- **46 implemented** / **2 planned** of 48 tracked features (see
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

The top item on [ROADMAP.md](ROADMAP.md): the **Nodemailer-based
mail-delivery adapter** (v0.4.0 target) — the serverless worker half of the
`json` mailer path, completing the browser → worker → email story. See the
roadmap for sequencing and dependencies.