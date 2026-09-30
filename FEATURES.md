# Features

This file is the authoritative human-readable feature matrix for ContactForm.
[project.state.json](project.state.json) is the synchronized machine-readable
representation of the same current state.

A feature status change must update both files in the same pull request.
Roadmap placement is maintained separately in [ROADMAP.md](ROADMAP.md).

Status vocabulary: `implemented` · `partial` · `planned` · `deprecated`.

---

## Core engine — `src/core.ts` (no dependencies)

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `json-spec` | JSON form spec (`FormSpec` / `FormFieldSpec` / `FormElement`) | The source of truth: fields, structural elements, wizard `step` markers, `copy`, `mailer`, button specs, `status`/`statusMode`, `stepper` | implemented |
| `field-types` | All field types | `text`, `email`, `tel`, `url`, `password`, `search`, `number`, `date`, `time`, `datetime-local`, `month`, `week`, `textarea`, `select`, `checkbox`, `radio`, `hidden`, `range`, `color`, `file` — each with required/format validation | implemented |
| `structural-types` | Structural field types | `heading`, `description`, `divider`, `section`, `callout`, `html` — static render-only markup, never validated or sent, dropped from the client spec | implemented |
| `struct-callout` | `callout` note block | `{ type: "callout", text, variant: "info" \| "warning" \| "success" \| "danger" }` — `<div class="rf-callout rf-callout--{variant}" role="note">`, text escaped, tinted entirely via `--rf-callout-*` theme tokens (each variant has its own bg/border/color token triple) | implemented |
| `struct-html` | `html` embed block | `{ type: "html", html }` — `<div class="rf-html rf-span-12">` wrapping the string **verbatim** (the package's one documented carve-out from escape-everywhere; sanitization is the consumer's responsibility, no auto-sanitizer on purpose), pinned by the `struct-html*` fixtures; never validates, never enters the payload | implemented |
| `wizard-steps` | Multi-step wizard via `step` markers | `toSteps` layout: shared prefix, hoisted hidden fields, pane-per-step, step-scoped "Next" validation, final-step submit | implemented |
| `stepper-chrome` | Opt-in `stepper` key | `nav` strip (`variant`/`line`/`number`/`label`/`clickable`/`background`) + `header` pane-header defaults, per-marker overrides, clickable completed steps | implemented |
| `conditional-steps` | Conditional wizard steps (`showWhen` on `step` markers) | A marker's `showWhen` skips its entire pane — hidden + `inert`, struck-through `rf-step--skipped` chip, excluded from validation, the payload and cross-field chains. Authored indices never change: the engine walks a *visible* sequence (Next/Back/jumps and `rf:step-change`'s `total` follow it), a current step that becomes skipped reflows to a visible neighbour, and re-revealing a later step flips the final button back to a submit | implemented |
| `showwhen` | Conditional fields (`showWhen`) | 16 operators (equality, value-in-list, multi-value `includes`/`containsAny`/`containsAll`, numeric + lexicographic comparisons, `startsWith`/`endsWith`/`regex`, `filled`/`empty`); `anyOf` (OR) / `noneOf` (NOR) / `not` wrappers that nest; arrays AND together; hidden fields out of scope (not validated, not in payload, don't drive chains); unknown operators fail safe to hidden | implemented |
| `parsetime` | Time normalisation | `parseTime` — 12h ("7:00 pm") and 24h ("19:30") input → 24-hour `HH:MM` for the email path | implemented |
| `canonical-data` | Payload normalisation | `canonicalData` — trimmed values, multi-value fields comma-joined, file fields as filenames, honeypot never forwarded | implemented |
| `validation-seam` | Pluggable `ValidationProvider` | `{ buildRules(fields, copy) }` seam; every binding validates through opaque `Rule` objects; default `vanillaValidation` | implemented |
| `rules-pattern` | Regex `pattern` validation | Custom regex on string fields — enforced soft by the shared script (the form renders `novalidate`), fails open on a broken pattern; message via `field.message` → `copy.pattern` → default | implemented |
| `rules-length` | Length bounds + live counter | `minLength` / `maxLength` soft bounds on text-like values; `maxLength` renders a live `N / max` character counter under the control; `minLength` overrides the textarea's 10-character default | implemented |
| `rules-cross-match` | Cross-field equality | `sameAs` — the value must equal another field's (confirm-password style); the partner re-checks live when the target changes; optional fields match only while both sides are non-empty | implemented |
| `rules-selection-bounds` | Selection bounds | `minSelect` / `maxSelect` on checkbox/radio groups and multi-selects; `minSelect > 0` implies required; group counting re-checks every flagged member when one option changes | implemented |
| `rules-file-bounds` | File upload bounds | `maxSize` (bytes or `"5MB"` units) and `allowedTypes` (MIME allow-list, `image/*` globs) per file, plus `minFiles` / `maxFiles` count bounds on `multiple` file inputs — all read `ctx.files`; `minFiles > 0` implies required | implemented |
| `button-specs` | Button specs | `submit` / `next` / `prev` as plain label or `{ label, variant }` (`primary` \| `secondary` \| `ghost`), default variants per role | implemented |
| `grid-sizing` | 12-column field sizing | `size` percentage → nearest column span via `gridSpan` (`rf-span-1..12`); fields collapse below `48rem` | implemented |
| `repeaters` | Repeaters (row groups) | `type: "repeater"` containers holding any field types; dynamic add/remove rows with `minRows`/`maxRows` bounds, per-row validate-by-row, and a structured JSON-array canonical payload per group | implemented |

## Events & hooks — `src/runtime/engine.ts`

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `event-bus` | `rf:*` event bus | Namespaced `rf:*` `CustomEvent`s on the form — `rf:fields-change`, `rf:row-add` / `rf:row-remove`, `rf:step-change`, `rf:validation-error`, `rf:submit-start` / `rf:submit-success` / `rf:submit-error`. `attachForm` / `renderForm` return `on(event, handler)` riding the detach-safe listener registry (native `addEventListener` parity); `initForms` collects everything | implemented |
| `wizard-hooks` | Lifecycle hooks | `beforeValidateStep` / `afterStepChange` / `beforeSubmit` / `afterSubmit` in `attachForm` / `renderForm` options and the `react` `hooks` prop (step/submit hooks veto by returning `false`); `FormSpec.hooks` hook-ref *names* resolve against the options' named registry (specs stay serialisable); the TanStack bridge mirrors the submit hooks + `rf:submit-*` events | implemented |
| `analytics-seam` | `createAnalytics({ adapter })` | Zero-dependency analytics seam over the `rf:*` bus: a consumer-supplied tracker (`track(event, detail, form?)` — the originating form is a third, optional arg) receives every event with its detail via `attach(form)` through native `addEventListener`; returns a detach. No fabricated events, no new `data-*` hooks — it only consumes the bus the engine emits | implemented |
| `analytics-block` | Declarative `FormSpec.analytics` | `{ enabled?, provider, eventName?, trackSteps?, trackFieldErrors? }` auto-resolves into the `createAnalytics` seam when a spec is in scope (`attachForm(form, { spec })` / `renderForm`); explicit `analytics` option overrides, `false` opts out, `enabled: false` disables. Routes `rf:step-change` → `form_step_view`, `rf:validation-error` → `form_validation_error`, `rf:submit-success` → `eventName` (default `"form_submitted"`), `rf:submit-error` → same + `outcome: "error"`. Providers are consumer-loaded globals — `dataLayer` push / `customEvent` dispatch / `plausible`(`.plausible(name,{props})`) / `posthog`(`.capture`) — never loaded, never fabricated, missing = no-op. **Not serialised** into `data-*`, so specless wiring never auto-resolves | implemented |
| `validation-error-event` | `rf:validation-error` bus event | Emitted at every validation gate failure — the submit path, a wizard "Next" gate, and live `validateOn` runs leaving a control invalid — with `{ name, id, errors: [{ name, message }], count }` (the messages visitors see). New event only: no new `data-*`, fixtures unaffected; feeds `form_validation_error` above | implemented |

## Persistence & prefill — `src/runtime/persist.ts`

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `autosave` | localStorage draft persistence (`autoSave`) | `autoSave: true` → key `rf:draft:{formName}`, or an explicit string key. Debounced (~400 ms) saves capture the current wizard step, repeater row counts and every visible control's value; drafts restore on attach (explicit `values` win) and clear on `rf:submit-success` (a pending save is cancelled too). localStorage is feature-detected and wrapped in try/catch — persistence never throws | implemented |
| `prefill-values` | Runtime `values` prefill | `values?: Record<string, string \| string[]>` on `renderForm` / `attachForm` / the React `<ContactForm />` fills text-like controls, checkbox/radio groups, multi-selects and lone toggles at attach; applied after any stored draft, never serialised | implemented |

## Bindings

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `binding-astro` | Astro components | `ContactForm.astro`, `FormField.astro`, `FormElements.astro`, `Decor.astro` — thin shells over the runtime builders + `initForms` | implemented |
| `binding-react` | React adapter (uncontrolled) | `<ContactForm />` + `<Field />` — server-renders the shared shell, hands the DOM to the engine; engine detached on unmount (StrictMode-safe) | implemented |
| `binding-vanilla` | Vanilla JS entry | `renderForm` / `attachForm` / `initForms` from `@clearstorm/contact-form/vanilla` (alias `./runtime`); `detach()` lifecycle | implemented |
| `binding-tanstack` | TanStack Form bridge | `useContactForm` (validators, `initialValues`, `isVisible`, `submit` via the package mailers) + `<ContactFormField />` | implemented |

## Mailers / transport — `src/mailers/`

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `mailer-cf7` | Contact Form 7 mailer (default) | POSTs to the CF7 REST feedback endpoint; payload policy: core fields verbatim, extras folded into `message`, subject carries sender's name, file bytes re-attached | implemented |
| `mailer-json` | Generic JSON/FormData mailer | POSTs the canonical payload to any `endpoint`; 2xx = success; body `message`/`error` surfaced on failure (Formspree-style / serverless worker path); the `"custom"` provider is an alias of the same transport, extended to honour `method` (`POST`/`PUT`) and client-safe `headers` (`"json"` stays the legacy shorthand) | implemented |
| `mailer-config` | `MailerSpec` / `MailerConfig` | `mailer` takes a provider shorthand or a config object (`provider`, `endpoint`, `formId`, `method`, `headers`, public `formToken`, `to`, `target` — master keys are typed out of the client surface on purpose); resolution precedence: config props → mailer config object → legacy top-level `endpoint`/`cf7` blocks → build-time console warning; the shell serialises the resolved provider + client-safe config into `data-mailer` plus `data-mailer-method` / `data-mailer-headers` / `data-form-token` / `data-to` / `data-mailer-target`, so the specless `initForms` path resolves config-object mailers too | implemented |
| `mailer-direct-providers` | Direct public adapters | Client → provider with config/URL shaping only, no secrets: `wpforms` (REST submit route `{endpoint}/wp-json/wpforms/v1/forms/{formId}/submit`), `formspree` (`https://formspree.io/f/{formId}`, `Accept: application/json`), `formkeep` (`https://formkeep.com/f/{formId}` or explicit `endpoint`), `getform` (explicit `endpoint` or `https://getform.io/f/{formId}`) | implemented |
| `mailer-proxy-docs` | Proxy-only adapters + proxy boilerplate | `resend` / `postmark` / `sendgrid` POST provider-shaped JSON (`{ provider, formId, to, payload }` — canonical data as a JSON object, never FormData) to a consumer `/api/contact` endpoint (default) — master keys never leave the server; `docs/transport-proxies.md` ships raw-`fetch` Next.js (App Router) + Astro workers reading `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` / `SENDGRID_API_KEY` from the environment | implemented |
| `mailer-target` | Explicit dispatch target (`MailTarget`) | `MailerConfig.target` — an open-ended `MailTarget` (`"cf7"`…`"fluentforms"`, `(string & {})` for any private/self-hosted backend) names the server-side provider the generic `custom` transport should dispatch to. With a `target`, the `custom`/`json` transport POSTs the proxy envelope with `provider` = `target` (default endpoint `/api/contact`), so a **single generic `/api/contact` route** fans out to any backend while provider URLs + keys stay in the proxy `.env` (`CF7_BACKEND_URL`, `RESEND_API_KEY`, `MAILCHIMP_*`, `ALLOWED_FORM_IDS`…). Absent `target`, the transport posts the plain canonical payload exactly as before. Client-safe identifiers only — no URLs, no secrets; serialised as `data-mailer-target`, overridable at attach | implemented |
| `mailer-nodemailer` | Nodemailer delivery adapter | First-party serverless mail-delivery adapter for the `json` path — stays planned (a first-party Nodemailer SDK would violate the zero-runtime-dependency rule); the SMTP/Nodemailer idea lives as a consumer-side worker variant inside `docs/transport-proxies.md` | planned |

## Validation

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `validation-vanilla` | Built-in vanilla rules | Regex rules keyed by field type (`email`, `tel`, `url`, `number`/`range` bounds, `color`, `textarea` ≥ 10 chars, names ≥ 2 letters, checkbox/radio/file selection) | implemented |
| `validation-zod` | Optional Zod adapter | `zodValidation(schema)` — schema drives required-ness, format and per-value messages; consumed structurally so zod v3 and v4 both work; `zod` is an optional peer | implemented |
| `validation-timing` | Validation timing (`validateOn`) | `validateOn: "submit" \| "blur" \| "change" \| "touched" \| Array<...>` on the spec — *when* pristine controls live-validate before submit (blur / change / touched — no nagging until a field is first left or a submit attempt happens). Runs through the same `ValidationProvider` seam (only *when* rules run, never which/how), serialised as `data-validate-on`, overridable at attach through `renderForm` / `attachForm` / the React `validateOn` prop (options win over the spec); hidden conditional fields and skipped panes never live-validate; success resets the touched/unlock state; wizard "Next" step validation is unchanged | implemented |

## UX & theming

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `ux-copy` | Consumer-driven copy | `FormCopy` keys + per-field `message`; resolution `field.message` → `copy[key]` → built-in default; `{status}` token in `submitError` | implemented |
| `ux-status-mode` | Success state | `statusMode: "inline"` (default; box under submit, cleared form stays) or `"replace"` (form collapses to the success box); `role="status"` announced | implemented |
| `status-renderer` | Custom success screen | `autoSuccess: false` on `renderForm` / `attachForm` options (and React props) suppresses *only* the success presentation — no success box, no `rf-form--success` collapse — while the error box, the reset, the lifecycle and `rf:submit-success` (now `{ name, id, message }`) stay engine-driven; the React `renderStatus` prop renders a custom success screen in place of the form with `{ message, name, id, form, reset }`, and `reset()` re-mounts the form as a fresh engine-wired instance (submit errors keep the default box) | implemented |
| `ux-honeypot` | Honeypot anti-bot field | Hidden field absorbs bots — pretend success, nothing sent | implemented |
| `ux-theming-tokens` | `--rf-*` theming tokens | Color, label and spacing token sets; compact light defaults, re-themes by overriding variables; native controls via `--rf-color-scheme` | implemented |
| `ux-prefill` | Opt-in `prefill="datetime"` | Pre-fills `date` / `time` inputs with today's local date and near-now time | implemented |
| `ux-file-uploads` | File uploads | Single + `multiple` file inputs; validated when required; canonical payload carries filenames; cf7 mailer re-attaches real bytes | implemented |
| `ux-multi-select` | Multi-select | `select` with `multiple: true` (`rows` = visible height); at least one option required | implemented |
| `ux-datalist` | Datalist suggestions | `options` on non-picker inputs renders a `<datalist>` — steers, never restricts | implemented |
| `ux-a11y` | Accessibility | Inline errors + `aria-invalid`, `role="status"`, `aria-busy`/`aria-current`, `inert` hidden panes, focus management on stepper jumps | implemented |

## Anti-bot — `src/runtime/captcha.ts`

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `captcha-block` | Declarative `FormSpec.captcha` block | Top-level `captcha` on the spec (`provider: "turnstile" \| "recaptcha-v3" \| "hcaptcha"`, public `siteKey`, optional `theme` / `action` / `onPendingSubmit`) — serialised as `data-captcha` (present keys only, engine fills the `"block"` default) so the specless `initForms` path resolves it; the builders emit the `[data-rf-captcha]` slot (before the submit row / inside the final wizard pane); `--rf-captcha-*` tokens + `.rf-captcha` reserved height in the shared stylesheet; three `FormCopy` keys (`captchaRequired` / `captchaFailed` / `captchaExpired`) with built-in defaults | implemented |
| `captcha-engine` | Engine gate + widget lifecycle + `rf:captcha-error` | Zero-dependency `captcha.ts` runtime: idempotent lazy provider-script injection (one `<script>` per URL), widget mount (`turnstile` / `hcaptcha`) with token/expired/error callbacks, reCAPTCHA v3 inline `{ action }` execute (default `"submit"`), per-form controller (`token()` / `reset()` / `destroy()`). Submit gate sits after validation: `onPendingSubmit: "block"` shows `captchaRequired` and never dispatches; `"auto"` queues the submit and re-runs the full path via `requestSubmit()` when the widget resolves — expiry/error clear the queue and inform. Tokens are single-use — the widget resigns on `rf:submit-success`, `destroy()` on `detach()`. A captcha paired with a direct (non-proxy) mailer dev-warns at attach. New bus event `rf:captcha-error` (`{ name, id, message }`) | implemented |
| `captcha-proxy-verify` | Proxy `siteverify` gate + demo forms | Both `/api/contact` routes verify `captchaToken` / `captchaProvider` via the provider's `siteverify` (form-encoded `secret` + `response`, `remoteip` from `x-forwarded-for`) before dispatch: 400 unsupported provider / token missing, 500 missing server secret or verify outage, 403 provider rejection — a rejected token never reaches a backend. `MailerContext.captcha` threads the token into the proxy-only + `custom`+`target` envelopes; the direct json path never leaks captcha fields. Secrets only in `.env` (`TURNSTILE_SECRET_KEY` / `RECAPTCHA_SECRET_KEY` / `HCAPTCHA_SECRET_KEY`); captcha demo forms for all three providers in both proxy examples (`Contact — Turnstile-protected CF7`, `Contact — reCAPTCHA v3-hidden CF7`, `Contact — hCaptcha-protected CF7`; each provider's always-pass test keys); Astro `verify` harness + engine/mailer suites cover the matrix | implemented |

## Quality & release

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `quality-test-suite` | Test suite | `npm test`: core + mailers (no DOM), markup snapshots pinned to `scripts/fixtures/*.html` (`RECORD=1` regen), TanStack bridge + Zod adapter (no DOM), client engine under happy-dom | implemented |
| `quality-typecheck` | Strict typecheck | `npm run typecheck` — `tsc --noEmit` over `src/` | implemented |
| `quality-examples` | Runnable demos | `examples/astro-demo` (7 routes), `examples/react-demo` (route parity), `examples/tanstack-demo` (bridge + vanilla\|Zod toggle), `examples/specs/*.json` single source for the demos | implemented |
| `release-tags` | Immutable release tags | `v0.1.0`, `v0.2.0`, `v0.3.0`, `v0.3.1`, `v0.4.0` git tags for reproducible installs | implemented |
| `release-npm-publish` | npm publishing | Package currently `private: true` and installed via git dependency; publish path is dropping `private` and releasing a versioned build | planned |