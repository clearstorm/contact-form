# Roadmap

This roadmap describes intended sequencing. It does **not** determine whether
a feature is currently implemented. See [FEATURES.md](FEATURES.md) and
[project.state.json](project.state.json) for current status, and
[PROJECT_STATUS.md](PROJECT_STATUS.md) for immediate next work.

The items below are proposals derived from the README's stated follow-ups and
the code's deprecation markers — reorder, rename or drop them freely.

---

## Delivered milestones (sequencing so far)

The milestone sequence pursued in the current development cycle, each tracked
in [FEATURES.md](FEATURES.md) as implemented:

- **M1 — conditional logic expansion.** The newer `showWhen` operators plus
  the `anyOf` / `noneOf` / `not` wrappers that nest freely.
- **M2 — validation rule expansion.** `pattern`, `minLength` / `maxLength`
  (with live character counters), `sameAs`, `minSelect` / `maxSelect`.
- **M3 — file-upload rule bounds.** `maxSize` (bytes or `"5MB"` units),
  `allowedTypes` MIME globs, `minFiles` / `maxFiles` counts.
- **M4 — repeaters (row groups).** `type: "repeater"` containers holding any
  field types, visitor add/remove rows with `minRows` / `maxRows` bounds,
  row-scoped validation, and one structured JSON-array canonical payload
  entry per row group.
- **M5 — wizard hooks + event bus.** Lifecycle hooks (`beforeValidateStep` /
  `afterStepChange` / `beforeSubmit` / `afterSubmit` — the step/submit hooks
  veto by returning `false`) across `attachForm` / `renderForm` and the
  TanStack bridge, plus the namespaced `rf:*` event bus (`rf:fields-change`,
  `rf:row-add` / `rf:row-remove`, `rf:step-change`, `rf:submit-start` /
  `submit-success` / `submit-error`). `FormSpec.hooks` hook-ref *names*
  resolve against the attach options' named registry, so specs stay
  serialisable.
- **M6 — analytics seam + deprecation cleanup.** `createAnalytics({ adapter })`
  — a zero-dependency seam that forwards the `rf:*` bus to a consumer-supplied
  tracker (`attach(form)` via native `addEventListener`, returns a detach),
  flipping `analytics-seam` to implemented. Plus the cleanup: the legacy
  `copy.back` / `copy.next` label fallbacks are gone (`FormSpec.prev` /
  `FormSpec.next` are the only way to label wizard buttons) and the `66` size
  alias was removed (keep `67`).
- **M7 — conditional wizard steps + draft persistence & prefill.** `step`
  markers accept `showWhen`: a pane whose conditions don't hold is skipped
  (hidden + `inert`, struck-through `rf-step--skipped` chip, out of
  validation, the payload and cross-field chains) while authored step indices
  never change — the engine walks a *visible* sequence for Next/Back/jumps,
  a step that collapses underfoot reflows to a visible neighbour, and
  re-revealing a later step flips the final button back to a submit. Plus
  `autoSave` — debounced localStorage drafts (current wizard step, repeater
  row counts, every visible value; restored on attach, cleared on
  `rf:submit-success`) — and the runtime `values` prefill option that beats a
  stored draft. The demo flagship wizard grows a conditional "Company" pane
  and opts into `autoSave`.
- **M8 — validation timing + custom success screens.** `FormSpec.validateOn`
  selects *when* pristine controls live-validate before submit — `"blur"`,
  `"change"`, `"touched"` (no nagging until a field is first left or a submit
  attempt happens) or an array combining modes — serialised as
  `data-validate-on`, overridable at attach via `renderForm` / `attachForm` /
  the React `validateOn` prop, and running through the same `ValidationProvider`
  seam (rules never change, only their timing). Plus `autoSuccess: false`:
  the engine stops showing the success box / `rf-form--success` collapse so a
  consumer owns the success presentation (the error box, the reset and
  `rf:submit-success` — now `{ name, id, message }` — stay engine-driven);
  the React binding's `renderStatus` prop renders a custom success screen in
  place of the form with `{ message, name, id, form, reset }`. The flagship
  wizard demo opts into `"validateOn": "touched"`; the react-demo `/mailers`
  page demos a `renderStatus` success screen.

---

## v0.4.0 — expanded mailer schema, transport resolution & proxy boilerplate (M9)

The spec-driven mailer expansion: `mailer` becomes a `MailerSpec`
(`MailerProvider` shorthand or a `MailerConfig` object — `endpoint`, `formId`,
`method`, `headers`, public `formToken`), with new first-class adapters:
direct publics (`wpforms`, `formspree`, `formkeep`, `getform`; `cf7` and the
generic `custom`/`"json"` transport stay) and proxy-only payload builders
(`resend`, `postmark`, `sendgrid`) that POST provider-shaped JSON to a
consumer `/api/contact` endpoint — master keys / `serverToken` never leave the
server. `docs/transport-proxies.md` ships runnable Next.js (App Router) +
Astro proxy boilerplate (raw `fetch` + `Bearer` keys from environment), which
also covers the old Nodemailer/SMTP delivery idea as a worker variant. When it
lands, flip `mailer-config`, `mailer-direct-providers` and
`mailer-proxy-docs` to `implemented` in FEATURES.md + project.state.json.
(`mailer-nodemailer` stays planned — the package cannot ship a first-party
Nodemailer SDK under the zero-runtime-dependency rule.)

## M10 — structural additions: `callout` + `html`

Decor-style, render-only elements: `type: "callout"` (`variant: "info" |
"warning" | "success" | "danger"`, `--rf-callout-*` tokens) and `type: "html"`
(verbatim pass-through; sanitization is the consumer's responsibility). Both
go through the `markup.ts` builders + fixture snapshots and are dropped from
the client spec like the other structural types. Flip `struct-callout` and
`struct-html` when done.

## M11 — declarative `FormSpec.analytics` block (hybrid with the seam)

An optional `analytics` spec block (`provider: "dataLayer" | "customEvent" |
"plausible" | "posthog"`, `eventName`, `trackSteps`, `trackFieldErrors`)
auto-resolves into the existing `createAnalytics` seam when the spec is wired
in scope by `attachForm(form, { spec })` / `renderForm`; an explicit analytics
option on attach overrides the block, `false` opts out. The block is **not**
serialised into `data-*`, so specless wiring (`initForms`, a bare
`attachForm(form)`) never auto-resolves. Adds the `rf:validation-error` bus
event (the `trackFieldErrors` signal). Flip `analytics-block` and
`validation-error-event` when done.

## M12 — explicit dispatch target + generic multi-provider proxy

An optional `MailerConfig.target` (`MailTarget`: an open-ended union covering
every `MailerProvider` plus backend-only targets — `mailchimp`, `mailgun`,
`fluentforms`, `(string & {})` for private backends) lets the generic
`custom`/`json` transport POST the proxy envelope `{ provider, formId, to,
payload }` with `provider` = `target` (default endpoint `/api/contact`), so a
**single generic `/api/contact` route** fans out to any backend and provider
URLs + keys stay server-side in `.env` (`CF7_BACKEND_URL`, `RESEND_API_KEY`,
`MAILCHIMP_*`, optional `ALLOWED_FORM_IDS` → 403). Absent `target`, the
transport posts the plain canonical payload exactly as before. Serialised as
`data-mailer-target`, overridable at attach; `docs/transport-proxies.md`
becomes the generic dispatcher (Next.js + Astro, cf7/resend/postmark/sendgrid/
mailchimp cases). Flip `mailer-target` when done.

## M13 — CAPTCHA / anti-bot protection (v0.4.0)

An optional top-level `captcha` block on the FormSpec (`provider: turnstile |
recaptcha-v3 | hcaptcha`, public `siteKey`, optional `theme` / `action` /
`onPendingSubmit`) mounts a challenge widget into the builder-emitted
`[data-rf-captcha]` slot and gates the submit on a provider-verified token.
Serialised as `data-captcha` (present keys only) so the specless `initForms`
path resolves it; the engine's gate sits after validation — `onPendingSubmit:
"block"` (default) shows the `captchaRequired` copy and holds, `"auto"`
queues the submit and re-runs the full path via `requestSubmit()` when the
widget resolves (expiry/error clear the queue). reCAPTCHA v3 is invisible and
executes `{ action }` inline. Tokens are single-use (resigned on
`rf:submit-success`) and travel in the proxy envelope as `captchaToken` /
`captchaProvider`; both `/api/contact` routes verify them with the provider's
`siteverify` (server `*_SECRET_KEY` env, `remoteip` from `x-forwarded-for`)
before dispatch — a rejected token never reaches a backend. Flip
`captcha-block`, `captcha-engine` and `captcha-proxy-verify` when done.

## npm publishing

The package is currently `private: true` and installed via immutable git tags.
Ship a versioned build to the npm registry (drop `private`, publish with the
existing `files: ["src"]` layout) so consumers can install `@clearstorm/
contact-form` by version. Flip `release-npm-publish` when done.

## v1.0 stabilization

- Freeze the `FormSpec` surface (types, serialisation, payload shapes) for a
  1.x contract.
- Final README / FEATURES.md / API-docs pass across all four bindings.
- Consider a dedicated proxy-worker example once the M9 boilerplate ships.