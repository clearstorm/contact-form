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
| `field-types-20` | 20 field types | `text`, `email`, `tel`, `url`, `password`, `search`, `number`, `date`, `time`, `datetime-local`, `month`, `week`, `textarea`, `select`, `checkbox`, `radio`, `hidden`, `range`, `color`, `file` — each with required/format validation | implemented |
| `structural-types` | Structural field types | `heading`, `description`, `divider`, `section` — static render-only markup, never validated or sent, dropped from the client spec | implemented |
| `wizard-steps` | Multi-step wizard via `step` markers | `toSteps` layout: shared prefix, hoisted hidden fields, pane-per-step, step-scoped "Next" validation, final-step submit | implemented |
| `stepper-chrome` | Opt-in `stepper` key | `nav` strip (`variant`/`line`/`number`/`label`/`clickable`/`background`) + `header` pane-header defaults, per-marker overrides, clickable completed steps | implemented |
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
| `mailer-json` | Generic JSON/FormData mailer | POSTs the canonical payload to any `endpoint`; 2xx = success; body `message`/`error` surfaced on failure (Formspree-style / serverless worker path) | implemented |
| `mailer-nodemailer` | Nodemailer delivery adapter | First-party serverless mail-delivery adapter for the `json` path — documented as a planned follow-up release | planned |

## Validation

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `validation-vanilla` | Built-in vanilla rules | Regex rules keyed by field type (`email`, `tel`, `url`, `number`/`range` bounds, `color`, `textarea` ≥ 10 chars, names ≥ 2 letters, checkbox/radio/file selection) | implemented |
| `validation-zod` | Optional Zod adapter | `zodValidation(schema)` — schema drives required-ness, format and per-value messages; consumed structurally so zod v3 and v4 both work; `zod` is an optional peer | implemented |

## UX & theming

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `ux-copy` | Consumer-driven copy | `FormCopy` keys + per-field `message`; resolution `field.message` → `copy[key]` → built-in default; `{status}` token in `submitError` | implemented |
| `ux-status-mode` | Success state | `statusMode: "inline"` (default; box under submit, cleared form stays) or `"replace"` (form collapses to the success box); `role="status"` announced | implemented |
| `ux-honeypot` | Honeypot anti-bot field | Hidden field absorbs bots — pretend success, nothing sent | implemented |
| `ux-theming-tokens` | `--rf-*` theming tokens | Color, label and spacing token sets; compact light defaults, re-themes by overriding variables; native controls via `--rf-color-scheme` | implemented |
| `ux-prefill` | Opt-in `prefill="datetime"` | Pre-fills `date` / `time` inputs with today's local date and near-now time | implemented |
| `ux-file-uploads` | File uploads | Single + `multiple` file inputs; validated when required; canonical payload carries filenames; cf7 mailer re-attaches real bytes | implemented |
| `ux-multi-select` | Multi-select | `select` with `multiple: true` (`rows` = visible height); at least one option required | implemented |
| `ux-datalist` | Datalist suggestions | `options` on non-picker inputs renders a `<datalist>` — steers, never restricts | implemented |
| `ux-a11y` | Accessibility | Inline errors + `aria-invalid`, `role="status"`, `aria-busy`/`aria-current`, `inert` hidden panes, focus management on stepper jumps | implemented |

## Quality & release

| ID | Feature | Scope | Status |
| --- | --- | --- | --- |
| `quality-test-suite` | Test suite | `npm test`: core + mailers (no DOM), markup snapshots pinned to `scripts/fixtures/*.html` (`RECORD=1` regen), TanStack bridge + Zod adapter (no DOM), client engine under happy-dom | implemented |
| `quality-typecheck` | Strict typecheck | `npm run typecheck` — `tsc --noEmit` over `src/` | implemented |
| `quality-examples` | Runnable demos | `examples/astro-demo` (7 routes), `examples/react-demo` (route parity), `examples/tanstack-demo` (bridge + vanilla\|Zod toggle), `examples/specs/*.json` single source for the demos | implemented |
| `release-tags` | Immutable release tags | `v0.1.0`, `v0.2.0`, `v0.3.0` git tags for reproducible installs | implemented |
| `release-npm-publish` | npm publishing | Package currently `private: true` and installed via git dependency; publish path is dropping `private` and releasing a versioned build | planned |