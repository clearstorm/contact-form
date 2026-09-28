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
  - Explicit dispatch `target` + generic multi-provider proxy (`8ca46d9`) — a
    `mailer` config object can carry `target` (`MailTarget`: every
    `MailerProvider` + `mailchimp`/`mailgun`/`fluentforms`/… + `(string &
    {})` for private backends). With a target the generic `custom`/`json`
    transport POSTs the proxy envelope `{ provider: target, formId, to,
    payload }` (default `/api/contact`), so **one** `/api/contact` route fans
    out to any backend while provider URLs + keys stay server-side in `.env`
    (optional `ALLOWED_FORM_IDS` → 403; 400 on missing `provider`/`formId`;
    normalized `{ success }`/`{ error }`). Absent `target` the transport posts
    the plain canonical payload unchanged. Wire format is the legacy envelope —
    resend/postmark/sendgrid untouched. Serialised `data-mailer-target`,
    overridable at attach; `docs/transport-proxies.md` rewritten as the
    Generic multi-provider dispatch (Next.js App Router + Astro, cf7 / resend /
    postmark / sendgrid / mailchimp cases); README updated; no-DOM + happy-dom
    tests cover the envelope, default endpoint, override and failure surfacing.
  - Declarative `FormSpec.analytics` + `rf:validation-error` (`5def710`) — an
    optional spec block (`{ enabled?, provider: "dataLayer" |
    "customEvent" | "plausible" | "posthog", eventName?, trackSteps?,
    trackFieldErrors? }`) auto-resolves into the existing `createAnalytics`
    seam whenever a spec is in scope (`attachForm({ spec })`, `renderForm`,
    React). An explicit `analytics` option overrides, `false` opts out,
    `enabled: false` disables; the block is **not** serialised into `data-*`
    (specless `initForms` wiring never auto-resolves). Routing (consumer-loaded
    globals only, zero deps): `rf:step-change` → `form_step_view`
    (`formName`/`formId`/`stepTo`/`stepTotal`), `rf:validation-error` →
    `form_validation_error` (`failedFields`), `rf:submit-success` →
    `eventName ?? "form_submitted"`, `rf:submit-error` → same + `outcome:
    "error"`; a missing global is a silent no-op. New bus event
    `rf:validation-error` (`{ name, id, errors: [{ name, message }], count }`,
    visitor-facing messages) fires on every validation gate failure — submit
    path incl. repeater min/max, wizard "Next" gates, and live `validateOn`
    runs leaving a control invalid — no new `data-*`, fixtures untouched;
    `AnalyticsTracker.track(event, detail, form?)` takes the form as an
    optional third arg. Tests cover routing, auto-attach/override/opt-out,
    specless no-resolve, live blur-gate emission and detach cleanup.
  - Structural `callout` + `html` elements (`2a9eeee`) — two new render-only
    `FormElement`s routed through the shared `renderDecor`/`renderElement`
    builders (no engine change; both carry no `name`, so they never
    serialise into `data-rules`, never validate, never reach the payload).
    `callout` (`text` + `variant: info|warning|success|danger`) renders
    `<div class="rf-callout rf-callout--{variant}" role="note">` with
    escaped text and `--rf-callout-*` theme tokens per variant; `html`
    wraps its string verbatim in `<div class="rf-html rf-span-12">` — the
    package's one documented carve-out from escape-everywhere, with
    sanitization explicitly the consumer's responsibility. Fixtures pin
    both (`struct-callout*`, `struct-html*`, `shell-struct`); the README +
    examples document the carve-out, and the demos exercise a callout on
    `/field-types` and a consent `details`/`summary` `html` block +
    `success` callout in the wizard's last pane.
  - Expanded mailer schema + transport resolution + proxy docs (`02c4e16`) —
    `mailer` becomes a `MailerSpec` (provider shorthand or a `MailerConfig`
    object: `provider` / `endpoint` / `formId` / `method` / `headers` /
    public `formToken` / `to`; master keys are typed off the client surface).
    New adapters: direct publics `wpforms` / `formspree` / `formkeep` /
    `getform` (client → provider, config/URL shaping only, no secrets) plus
    proxy-only `resend` / `postmark` / `sendgrid` that POST provider-shaped
    JSON `{ provider, formId, to, payload }` to the consumer's `/api/contact`
    endpoint; the generic transport gains a `"custom"` alias of `"json"` and
    honours `method` / `headers`. Resolution: config props → mailer config
    object → legacy `endpoint`/`cf7` blocks → per-provider build-time warning.
    The shell serialises provider + client-safe config onto `data-mailer` and
    `data-mailer-method` / `data-mailer-headers` / `data-form-token` /
    `data-to` (specless `initForms` resolves config-object mailers);
    `AttachOptions.config` now merges on submit (runtime overrides win).
    `docs/transport-proxies.md` ships Next.js + Astro raw-`fetch` proxy
    boilerplate (env keys, no new deps) and absorbs the Nodemailer/SMTP idea
    as a worker variant. Fixtures +3 (`shell-mailer-config`,
    `shell-mailer-wpforms`; diff reviewed); the `/mailers` demos show a
    provider-config tab + a resend proxy envelope against the echo server.
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

- **54 implemented** / **2 planned** of 56 tracked features (see
  FEATURES.md). Implemented means shipped, exercised by the test suite
  (`npm test`) and demonstrated in `examples/`.
- The 2 planned features: the **Nodemailer mail-delivery adapter**
  (`mailer-nodemailer` — re-scoped: a first-party SDK would break the
  zero-runtime-dependency rule; the SMTP worker is a consumer-side variant in
  `docs/transport-proxies.md`) and **npm publishing** (`release-npm-publish`).

## Health

- `npm test` green — core + mailers, markup snapshots, TanStack bridge, Zod
  adapter, client engine under happy-dom.
- `npm run typecheck` clean (strict `tsc --noEmit` over `src/`).
- Zero runtime dependencies; `react`, `@tanstack/react-form` and `zod` are
  optional peers.

## Immediate next work

The top item on [ROADMAP.md](ROADMAP.md): **npm publishing** — drop
`private: true`, publish the versioned build to the npm registry (flipping
`release-npm-publish` to implemented). See the roadmap for sequencing and
dependencies.