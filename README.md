# @clearstorm/contact-form

Reusable contact forms for [Astro](https://astro.build) sites (including static
hosts), built from three decoupled pieces:

- **Core** — a framework-agnostic engine (`src/core.ts`): the JSON form spec,
  validation rules for **19 field types**, time normalisation and payload
  normalisation. No framework or DOM dependencies, so the same code can run in
  a browser bundle or a Node worker.
- **Mailers** — transport adapters (`src/mailers/`): `cf7` (Contact Form 7,
  the default) and `json` (generic POST to any endpoint you control).
  A Nodemailer-based delivery adapter is planned as a follow-up release.
- **Components** — self-contained `ContactForm.astro` / `FormField.astro`:
  namespaced `rf-*` markup, styled entirely with `--rf-*` CSS custom
  properties. The shipped theme is a **generic, compact light scheme** —
  override the variables on your own scope and it re-themes without touching
  the markup.

**Nothing is baked in.** Endpoint config is passed explicitly (no env-var
assumptions), and every visitor-facing string — validation messages, submit
label, error text — is consumer-driven via a per-form `copy` object and
per-field `message` overrides, with built-in defaults.

Zero runtime dependencies. No Tailwind required.

> **Want to see it working?** `examples/` holds a runnable Astro demo site (all
> 19 field types, both mailers, `prefill="datetime"`, CSS-only theming) plus
> copy-paste-ready JSON form specs it renders directly. See
> [`examples/README.md`](examples/README.md).

---

## Install

Git dependency (recommended for private packages):

```json
// package.json
{
  "dependencies": {
    "@clearstorm/contact-form": "git+https://github.com/clearstorm/contact-form.git#v0.2.0"
  }
}
```

Tags are immutable — pin to a release and installs are reproducible.

> Private GitHub package? Local `npm install` uses your machine's GitHub
> credentials, but CI runners can't — add a PAT scoped to this repo and point
> git at it before install (covers `https://`, `git+https://` and `git+ssh://`
> forms of the dependency in the lockfile):
>
> ```bash
> git config --global url."https://x-access-token:${{ secrets.GH_PAT }}@github.com/".insteadOf "https://github.com/"
> ```

Or publish to npm and install by version (drop `"private": true` first).

Works with Astro `^4 || ^5 || ^6 || ^7`.

---

## Quickstart

**1. Define the form as JSON** (works with Astro's content collections):

```jsonc
// src/content/pages/contact.json — frontmatter + body
{
  "form": {
    "name": "enquiry",          // identity: data-mail-form, form id, JS hooks
    "submit": "Send message",
    "status": "Thanks — we'll reply shortly.",
    "mailer": "cf7",            // "cf7" (default) | "json"
    "fields": [
      { "type": "text", "id": "first_name", "name": "first_name", "label": "First name", "required": true, "size": 50 },
      { "type": "email", "id": "email", "name": "email", "label": "Email address", "required": true, "size": 50 },
      { "type": "textarea", "id": "message", "name": "message", "label": "Message", "required": true, "size": 100 }
    ]
  }
}
```

**2. Render it**, passing your endpoint config:

```astro
---
import ContactForm from "@clearstorm/contact-form/astro/ContactForm.astro";
import { getEntry } from "astro:content";
const { data } = await getEntry("pages", "contact");
const { PUBLIC_API_URL, PUBLIC_CF7_FORM_ID } = import.meta.env; // your convention
---

<ContactForm
  form={data.form}
  config={{ apiUrl: PUBLIC_API_URL, cf7FormId: PUBLIC_CF7_FORM_ID }}
/>
```

**Config resolution (no env-var assumptions in the package):**
`config` props → the form spec's own block (`cf7: { apiUrl, formId }`, or
`endpoint` for `json`) → a build-time console warning that the form is missing
its endpoint config. How the values reach the component — your env files, CI
secrets, hard-coding, content JSON — is entirely the consumer's business.

---

## CF7 (Contact Form 7) setup

The `cf7` mailer POSTs to the standard REST feedback endpoint:

```
{apiUrl}/wp-json/contact-form-7/v1/contact-forms/{formId}/feedback
```

1. In WordPress, create a CF7 form with these named fields:
   `first_name`, `last_name`, `email`, `contact`, `subject`, `message`.
   Other spec fields are folded into `message` (see payload policy below).
2. Ensure the REST route is reachable on your static host's API base. A
   rewrite may be required on the WordPress host (cPanel example — adjust for
   your host/port):

   ```apache
   # .htaccess (WordPress root), above any WordPress rewrite rules
   RewriteRule ^wp-json/(.*)?$ /index.php?rest_route=/$1 [L,QSA]
   ```

   Without it you'll hit the WordPress homepage (200 + HTML) instead of JSON,
   and submissions will fail with a non-JSON response.
3. CORS: the CMS must echo the static site's `Origin` (CF7's REST endpoint
   sends `Access-Control-Allow-Origin` it echoes back). Add the site origin
   to the WP host's `Access-Control-Allow-Origin` for production lockdown.

**Payload policy (lives in the `cf7` mailer):** the core fields
(`first_name`, `last_name`, `email`, `contact`, `subject`, `message`) go
verbatim; every other spec field folds into `message` as a `Label: value`
line (times normalised to 24h); `subject` becomes
`"{subject} — {first name} {last name}"` so replies can be addressed. A filled
honeypot field is never forwarded; checkbox groups are joined as
`value1, value2`.

---

## JSON transport (Formspree-style / your own endpoint)

For endpoints that accept a plain `multipart/form-data` POST of the spec
fields:

```jsonc
{
  "form": {
    "name": "enquiry",
    "mailer": "json",
    "endpoint": "https://your-worker.example.com/submit",
    // ...fields
  }
}
```

This is the path for **serverless mail-delivery workers** — e.g. a
Cloudflare Worker / Netlify Function that receives the canonical payload and
sends via `nodemailer` or your provider's API. A first-party Nodemailer
delivery adapter for this package is planned.

---

## Field types

| Type | Renders as | Validation |
| --- | --- | --- |
| `text` | `<input type="text">` | required only (unless `pattern`) |
| `email` | `<input type="email">` | email format |
| `tel` | `<input type="tel">` | phone format (7–15 digits/`+-() `) |
| `url` | `<input type="url">` | scheme-ful URL (`https://…`) |
| `password` | `<input type="password">` | required only |
| `search` | `<input type="search">` | required only |
| `number` | `<input type="number">` | numeric + `min`/`max` bounds |
| `date` | `<input type="date">` | required only |
| `time` | `<input type="time">` | required only |
| `datetime-local` | `<input type="datetime-local">` | required only |
| `month` | `<input type="month">` | required only |
| `week` | `<input type="week">` | required only |
| `textarea` | `<textarea>` | min length 10 |
| `select` | `<select>` (from `options`) | required only |
| `checkbox` | single, or group (with `options`) | must be selected when required |
| `radio` | group (requires `options`) | must be selected when required |
| `hidden` | `<input type="hidden">` | never validated |
| `range` | `<input type="range">` | within 0–100 (override via `min`/`max`) |
| `color` | `<input type="color">` | `#rrggbb` hex |

`select` needs `options: string[]`; checkbox/radio groups need `options` too
(a checkbox without `options` is a single toggle next to its label). Input
passthrough attributes — `placeholder`, `value`, `min`, `max`, `step`,
`maxlength`, `pattern` — flow through to the rendered control.

---

## Form structure (headings, descriptions, dividers, sections)

`fields` is the ordered layout of the form — and it may mix real fields with
**structural elements** that shape the page without being fields. They render
static markup only: they carry no `name`/`id`, are dropped from the client
field spec during serialisation, and so never validate, never appear in the
payload, and never reach the shared script.

```jsonc
"fields": [
  { "type": "heading",    "text": "Project details", "align": "center" },  // full-width <h3> title + rule
  { "type": "description", "text": "We reply within a day.", "size": 67 },  // muted helper text (sized)
  { "type": "section",    "label": "Contact details" },                     // section break, centered label
  { "type": "text",       "id": "name", "name": "name", "label": "Name" },  // real field
  { "type": "divider" },                                                     // thin rule
  { "type": "divider",    "visible": false, "min": "2rem" }                 // invisible spacer (rhythm control)
]
```

| Type | Keys | Renders |
| --- | --- | --- |
| `heading` | `text`, optional `align` (`left` \| `center`), optional `line` (default `true`) | full-width section title (`<h3 class="rf-heading">`); the rule follows the alignment — `left` keeps the line on the right of the text, `right` on the left, `center` on both sides — and `line: false` renders text only |
| `description` | `text`, optional `size` (100 \| 90 \| 80 \| 75 \| 70 \| 67 \| 66 \| 60 \| 50 \| 40 \| 33 \| 30 \| 25 \| 20 \| 10, default 100) | muted helper text sharing the field grid spans |
| `divider` | optional `visible` (default `true`), optional `min` (CSS length) | thin rule, or with `visible: false` an invisible spacer |
| `section` | optional `label` | section break; the label sits centered on the rule |

Styling follows the same theme system with dedicated tokens —
`--rf-heading-*`, `--rf-description-*`, `--rf-divider-*`, `--rf-section-*`
(see [Theming](#theming-rf-custom-properties)).

> Live demo: `/structure` renders
> [`examples/specs/structure.json`](examples/specs/structure.json) — all four
> elements in one form.

---

## Multi-step wizard (`step` markers)

A `step` marker splits the form into groups — a wizard. Everything below a
marker belongs to that step until the next marker; there is **no top-level
`steps` key and no per-field step index** — the markers are the layout:

```jsonc
"fields": [
  { "type": "heading", "text": "Project enquiry" },   // before the 1st marker →
  ...                                                 // shared prefix, shown on every step
  { "type": "step", "label": "Contact" },             // step 1
  { "type": "text", "id": "name", "name": "name", "label": "Name", "required": true },
  { "type": "step", "label": "Project", "title": "Tell us about your project",
    "align": "center" },                              // step 2 (header styling)
  { "type": "select", "id": "budget", "name": "budget", "label": "Budget", "options": ["…"] },
  { "type": "step", "label": "Details", "submit": "Send enquiry" },  // step 3 (final)
  { "type": "textarea", "id": "message", "name": "message", "label": "Project brief" },
  { "type": "hidden", "id": "referrer", "name": "referrer", "value": "wizard-demo" }
]
```

Behaviour:

- **Stepper + Back/Next footer** appear only with **≥ 2 markers**. One marker
  (or none) renders a plain single-page form — fully backwards compatible.
- **Shared prefix** — elements before the first marker render once above the
  stepper, stay visible on every step, and are included in every step's
  validation.
- **Hoisted hidden fields** — `type: "hidden"` fields render once outside the
  panes and are present on every step's payload (both fit the honeypot and
  tracking-parameter use-cases).
- **Panes stay in the DOM** (hidden + inert). Cross-step `showWhen` conditions
  keep reading earlier steps' values, and the payload keeps every step's data.
- **Next** validates only the current step's in-scope fields (visibility-aware —
  a hidden conditional field can't block a step); **Back never validates**; the
  **final button** validates the visible form (current step + shared prefix)
  and submits. Only the **last marker's `submit` label** wins on that button —
  `form.submit`'s label is the fallback.
- **Step headers** — every pane opens with a header: a number chip plus the
  step `label` (or a longer `title`) styled like a decorative heading — the
  same `align` set (`left` / `center` / `right` / `full`) and `line` (on by
  default). `"heading": false` on a marker renders a bare pane.
- **Completed steps are clickable** in the stepper — once a step is behind the
  current one, its chip becomes a link back to it (no validation, like Back;
  Next re-validates on the way forward), so the visitor can jump straight back
  to an earlier step to edit it.
- Buttons are the form spec's `submit` / `next` / `prev`, each a plain label
  or `{ "label", "variant" }` with `primary` | `secondary` | `ghost`
  (defaults: `submit`/`next` → primary, `prev` → secondary). Legacy
  `copy.back` / `copy.next` labels are still honoured as fallbacks. The
  stepper theme ships with `--rf-step-*` / `--rf-steps-*` tokens (see
  [Theming](#theming-rf-custom-properties)).

> Live demo: `/wizard` renders
> [`examples/specs/wizard.json`](examples/specs/wizard.json) — three steps (a
> centered step-2 header with its own `title`, a full-rule step-3 header), a
> cross-step conditional reveal and a hoisted hidden field.

---

## Conditional fields (`showWhen`)

Any field can hide and reveal based on the visitor's own input. The condition
is declared in the spec and evaluated entirely client-side by the shared
script — no markup changes, no extra JS:

```jsonc
{
  "type": "text",
  "id": "other_service",
  "name": "other_service",
  "label": "Describe the service",
  "required": true,
  "showWhen": {
    "field": "service",          // controlling field name
    "operator": "equals",        // see operators below
    "value": "Other"
  }
}
```

An **array of conditions means AND** (every one must hold). Operators:
`equals` / `notEquals` (text, select, radio), `in` / `notIn` (value is/isn't in
a list), `includes` (a checkbox group contains the value; an array means "all
of these"), `filled` / `empty`. Unknown operators never match — the field stays
hidden.

Behaviour:

- **Initial state** is computed in the browser on load (the server renders every
  field visible; the script hides the ones whose conditions don't hold).
- Hidden fields are **out of scope**: a hidden `required` field can't block the
  form, hidden fields aren't validated, and they're **excluded from the
  payload** — the backend receives only what the visitor saw. A field that
  becomes hidden never leaks a stale value into a submission, and a hidden
  field doesn't drive other conditions (chains behave predictably).
- Controlling fields update visibility live on `input`/`change`.
- Copy/validation messages work unchanged — a `message` override still applies
  to a revealed field.

```jsonc
// kitchen-sink of every operator
"showWhen": { "field": "service", "operator": "equals",  "value": "Other" }
"showWhen": { "field": "service", "operator": "notEquals", "value": "Other" }
"showWhen": { "field": "plan",    "operator": "in",       "value": ["Pro", "Team"] }
"showWhen": { "field": "plan",    "operator": "notIn",    "value": ["Trial"] }
"showWhen": { "field": "topics",  "operator": "includes", "value": "News" }        // checkbox group
"showWhen": { "field": "rush",    "operator": "filled" }                            // single checkbox
"showWhen": { "field": "notes",   "operator": "empty" }
"showWhen": [ // AND
  { "field": "region", "operator": "equals", "value": "US" },
  { "field": "plan",   "operator": "notEquals", "value": "Trial" }
]
```

> Run every operator live: the demo's `/conditional` page renders
> [`examples/specs/conditions.json`](examples/specs/conditions.json) — one
> self-documenting reveal per operator — alongside the realistic
> [`examples/specs/enquiry.json`](examples/specs/enquiry.json) and an AND
> example ([`examples/specs/and.json`](examples/specs/and.json)).

---

## Copy (text copy is consumer-driven)

Every visitor-facing string resolves **`field.message` → `copy[key]` →
built-in default**. Put project-specific copy in the form spec:

```jsonc
{
  "form": {
    "name": "enquiry",
    // form-level fallbacks:
    "copy": {
      "required": "Please fill this in.",
      "email": "Enter a valid email address.",
      "tel": "Enter a valid phone number.",
      "sending": "Sending…",
      "error": "Something went wrong. Please try again in a moment.",
      "submitError": "Submission failed (HTTP {status})" // {status} replaced at runtime
    },
    "fields": [
      { "type": "select", "name": "subject", "label": "Subject", "required": true,
        "options": ["Table reservation"], "message": "Choose a subject." }
    ]
  }
}
```

| `copy` key | Used for | Default |
| --- | --- | --- |
| `required` | generic empty-required (text-like fields) | `Please fill this in.` |
| `name` | first/last names | `Enter your first/last name (2+ characters).` |
| `email` | email format | `Enter a valid email address.` |
| `tel` | phone format | `Enter a valid phone number.` |
| `url` | URL format | `Enter a valid URL.` |
| `number` | number format / bounds | `Enter a valid number.` |
| `range` | range out-of-bounds | `Choose a value within the range.` |
| `color` | colour format | `Enter a valid colour.` |
| `textarea` | min length | `Message must be at least 10 characters.` |
| `checkbox` | checkbox/radio required | `Please select this option.` |
| `sending` | submit button while in flight | `Sending…` |
| `back` *(deprecated)* | wizard Previous button — use `form.prev` | `Back` |
| `next` *(deprecated)* | wizard Next button — use `form.next` | `Next` |
| `error` | generic submission failure | `Something went wrong. Please try again in a moment.` |
| `invalidForm` | mailer validation failure, no details | `Some fields need your attention. Please check the form.` |
| `configError` | missing endpoint config | varies by mailer |
| `submitError` | HTTP-error fallback (`{status}` token) | `Submission failed (HTTP {status}). Please try again.` |

---

## Theming (`--rf-*` custom properties)

The component ships a **generic, compact light scheme**. Override any variable
by declaring it on a scope that reaches the form — a wrapper, `:root`, or even
the form itself:

```css
:root {
  /* palette */
  --rf-field-bg: #ffffff;
  --rf-field-border: #d1d5db;
  --rf-field-text: #111827;
  --rf-focus: #2563eb;
  --rf-muted: #6b7280;
  --rf-submit-bg: #111827;
  --rf-submit-text: #ffffff;
  --rf-success: #16a34a;
  --rf-success-text: #14532d;
  --rf-danger: #dc2626;
  /* native controls (date pickers, checkboxes, …) */
  --rf-color-scheme: light;
}
```

### Colour tokens

| Variable | Default | Used by |
| --- | --- | --- |
| `--rf-field-bg` | `#ffffff` | input background |
| `--rf-field-border` | `#d1d5db` | input border |
| `--rf-field-text` | `#111827` | input text |
| `--rf-focus` | `#2563eb` | focus ring, checkbox accent |
| `--rf-muted` | `#6b7280` | labels, placeholders |
| `--rf-submit-bg` | `#111827` | submit button background |
| `--rf-submit-text` | `#ffffff` | submit button text |
| `--rf-success` | `#16a34a` | status box success border |
| `--rf-success-text` | `#14532d` | status box success text |
| `--rf-danger` | `#dc2626` | status box error border/text |
| `--rf-step-color` | `#9ca3af` | stepper index bubble + label (pending) |
| `--rf-step-active-color` | `var(--rf-submit-bg)` | stepper current-step bubble |
| `--rf-step-done-color` | `var(--rf-success)` | stepper completed-step bubble |
| `--rf-button-secondary-color` | `var(--rf-submit-bg)` | secondary (outline) button text |
| `--rf-button-secondary-border` | `var(--rf-submit-bg)` | secondary button border |
| `--rf-button-secondary-hover-bg` | `var(--rf-submit-bg)` | secondary hover background |
| `--rf-button-secondary-hover-color` | `var(--rf-submit-text)` | secondary hover text |
| `--rf-button-ghost-color` | `var(--rf-submit-bg)` | ghost (text-only) button text |
| `--rf-button-ghost-hover-bg` | `color-mix(in srgb, … 10%, transparent)` | ghost hover background |
| `--rf-step-header-num-color` | `var(--rf-step-active-color)` | pane header number chip |
| `--rf-color-scheme` | `light` | native form controls (`color-scheme`) |

### Spacing tokens

Every hard-coded size is themeable — compact minimums by default:

| Variable | Default | Used by |
| --- | --- | --- |
| `--rf-gap-x` | `0.75rem` | grid column gap |
| `--rf-gap-y` | `1rem` | grid row gap, button↔status gap |
| `--rf-field-gap` | `0.375rem` | label↔control spacing |
| `--rf-field-padding-y` | `0.5rem` | input vertical padding |
| `--rf-field-padding-x` | `0.75rem` | input horizontal padding |
| `--rf-field-min-height` | `2.75rem` | input min-height |
| `--rf-textarea-min-height` | `7rem` | textarea min-height |
| `--rf-submit-min-height` | `2.75rem` | submit button min-height |
| `--rf-submit-padding-x` | `1.1rem` | submit button horizontal padding |
| `--rf-submit-gap` | `0.5rem` | submit button icon gap |
| `--rf-submit-margin-top` | `0.25rem` | submit-row top margin |
| `--rf-status-padding` | `0.75rem` | status box padding |
| `--rf-step-size` | `1.5rem` | stepper index bubble size |
| `--rf-step-label-size` | `0.78rem` | stepper label font-size |
| `--rf-steps-gap` | `0.5rem 1rem` | stepper item gap |
| `--rf-steps-margin` | `0 0 0.5rem` | stepper margin |
| `--rf-step-footer-gap` | `0.5rem` | Back/Next footer gap |
| `--rf-step-header-gap` | `0.5rem` | pane header number↔title gap |
| `--rf-step-header-num-size` | `1.6rem` | pane header number chip size |

Layout: the form is a 12-column grid — use `size` on each field spec for its
width (default `50`, any of
`100 | 90 | 80 | 75 | 70 | 67 | 66 | 60 | 50 | 40 | 33 | 30 | 25 | 20 | 10`).
Sizes map to the nearest column span. Fields and `description` elements
collapse to a single column below `48rem`.

**Opt-in defaults:** `prefill="datetime"` on the component pre-fills `date` /
`time` inputs with the current local date and near-now time (handy for booking
forms); both fields remain optional in the spec.

---

## Validation

Required-ness comes from the JSON spec (`required: true`); format checks are
shared code keyed by field type (`email`, `tel`, `url`, `number`/`range`
bounds, `color`, `textarea` min length 10, names ≥ 2 letters, checkbox/radio
selection). Errors render inline and clear on input; the honeypot field
absorbs bots (pretend-success, nothing sent).

---

## Project layout

```
src/
├── core.ts                    # spec types, rules, parseTime, canonicalData (no deps)
├── mailers/
│   ├── index.ts               # Mailer types + getMailer registry
│   ├── cf7.ts                 # CF7 REST transport + payload policy
│   └── json.ts                # generic POST transport
└── astro/
    ├── ContactForm.astro      # form shell, data-* serialisation, submit wiring
    └── FormField.astro        # labelled field with rf-* styles
```

Run the test suite (core + both mailers):

```bash
npm install && npm test
```

## License

MIT © clearstorm