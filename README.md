# @clearstorm/contact-form

Reusable, framework-independent contact forms — a **fat engine, thin bindings**
package: the same JSON form spec drives an Astro component, a React component,
a single-call vanilla JS helper, or an opt-in TanStack Form bridge. Built from
three decoupled pieces:

- **Core** — a framework-agnostic engine (`src/core.ts`): the JSON form spec,
  validation rules for **20 field types**, conditional visibility, time
  normalisation and payload normalisation. No framework or DOM dependencies,
  so the same code can run in a browser bundle or a Node worker.
- **Mailers** — transport adapters (`src/mailers/`): `cf7` (Contact Form 7,
  the default) and `json` (generic POST to any endpoint you control).
  A Nodemailer-based delivery adapter is planned as a follow-up release.
- **Runtime** — the shared client engine and markup builders for every
  binding (`src/runtime/`): namespaced `rf-*` markup and the DOM-driven client
  (`attachForm` / `initForms`), styled entirely with `--rf-*` CSS custom
  properties. The shipped theme is a **generic, compact light scheme** —
  override the variables on your own scope and it re-themes without touching
  the markup.

**Nothing is baked in.** Endpoint config is passed explicitly (no env-var
assumptions), and every visitor-facing string — validation messages, submit
label, error text — is consumer-driven via a per-form `copy` object and
per-field `message` overrides, with built-in defaults.

Zero runtime dependencies. No Tailwind required.

> **Want to see it working?** `examples/` holds a runnable **Astro site** (all
> 20 field types — including file uploads — both mailers, CSS-only theming, a
> multi-form wizard, plus a vanilla-JS page mounting the same specs with
> `renderForm`), a **Vite + React app** with the same seven routes as the Astro
> demo (each rendering the uncontrolled `<ContactForm />`; `/vanilla` mounts
> `renderForm()` *inside* React), a **TanStack Form bridge app** —
> `useContactForm` + `<ContactFormField />` and a **vanilla | Zod validation
> toggle** for the pluggable validation seam — and the copy-paste-ready JSON
> form specs all three demos render directly.
> Each spec file is a **map of named forms** — `{ "Name": FormSpec, … }` — so
> one file can hold several examples and a single page can render them all.
> See [`examples/README.md`](examples/README.md).

---

## Install

Git dependency (recommended for private packages):

```json
// package.json
{
  "dependencies": {
    "@clearstorm/contact-form": "git+https://github.com/clearstorm/contact-form.git#v0.3.0"
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

## Bindings (Astro · React · vanilla JS · TanStack Form)

One package, multiple bindings — all driven by the same `FormSpec`, sharing
the same engine and markup builders via subpath exports:

| Subpath | What you get |
| --- | --- |
| `@clearstorm/contact-form/core` | spec types + framework-less logic (rules, `toSteps`, `canonicalData`, …) |
| `@clearstorm/contact-form/mailers` | `cf7` / `json` transport adapters |
| `@clearstorm/contact-form/runtime` (alias `./vanilla`) | `renderForm`, `attachForm`/`initForms`, `createAnalytics`, markup builders |
| `@clearstorm/contact-form/react` | `ContactForm` + `Field` React components (peer: `react`) |
| `@clearstorm/contact-form/tanstack` | `useContactForm` bridge + `ContactFormField` (peers: `react`, `@tanstack/react-form`) |
| `@clearstorm/contact-form/styles.css` | the shared stylesheet (single source; never auto-injected) |
| `@clearstorm/contact-form/astro/…` | the original `.astro` components, unchanged |

**Styles are imported once**, never auto-injected — every binding shares
`@clearstorm/contact-form/styles.css`. The `rf-*` markup, `data-*`
serialisation and `--rf-*` theming are one source of truth across all of them.

### Astro (unchanged surface)

```astro
---
import ContactForm from "@clearstorm/contact-form/astro/ContactForm.astro";
---
<ContactForm form={form} config={{ apiUrl, cf7FormId }} />
```

### React (uncontrolled — the engine owns the form)

Works in any React framework (Next.js App + Pages Router, TanStack Start,
Vite). Renders the shared shell and hands the mounted DOM to the engine:
**validation, conditional visibility and submission never touch React**
reconciliation, and the engine is detached on unmount (StrictMode-safe).

```tsx
import { ContactForm } from "@clearstorm/contact-form/react";
import "@clearstorm/contact-form/styles.css";

<ContactForm form={spec} config={{ endpoint }} hooks={{ beforeSubmit }} />
```

`hooks` is optional and accepts the engine's lifecycle hooks (plus a named
registry for spec hook-refs); `values` prefills controls at attach (see
[Draft autosave + prefilled values](#draft-autosave--prefilled-values));
`validateOn` and `autoSuccess` override the spec's validation timing and
success presentation; `renderStatus` swaps the whole form for a custom
success screen on submit (see [Validation](#validation) and
[Success state](#success-state--status--statusmode)); `Field` renders a single
field from the spec.

### Vanilla JS (`renderForm`)

Mount a complete, working form into any DOM node — no framework needed:

```js
import { renderForm } from "@clearstorm/contact-form/vanilla";
import "@clearstorm/contact-form/styles.css";

const { form, detach, on } = renderForm("#root", spec, { config: { endpoint } });
on("rf:submit-success", (e) => trackSubmit(e.detail)); // the rf:* event bus
// later — remove all listeners + injected error DOM:
detach();
```

`attachForm(formEl, options)` is the lower-level entry — attach the engine to
existing `rf-*` markup, or pass `options.spec` for the exact rendered form, or
`options.values` to prefill controls at attach. It
returns `{ on(event, handler), detach() }`: `on` subscribes to the `rf:*`
event bus through the engine's detach-safe registry (`detach()` removes
subscriptions with every other listener; native `addEventListener` on the form
sees the same events). `initForms(root?)` scans the DOM once for the Astro
script and returns a combined detach. Conditional fields, wizard state, the
honeypot and both mailers behave identically in every binding.

### TanStack Form (opt-in bridge)

Own the inputs with TanStack Form while the package keeps providing the
validation rules and transport:

```tsx
import { useForm } from "@tanstack/react-form";
import { useContactForm, ContactFormField } from "@clearstorm/contact-form/tanstack";

const bridge = useContactForm(spec, { config: { endpoint } });
const form = useForm({
  defaultValues: bridge.initialValues,
  onSubmit: async ({ value }) => {
    const result = await bridge.submit(value);   // → { ok, message }
    // result.ok ? show success : show result.message
  },
});

<form className="rf-form" onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
  {spec.fields.map((field) =>
    bridge.isVisible(field.name, values) &&
      <ContactFormField key={field.id} form={form} spec={field} bridge={bridge} />
  )}
  <button type="submit">{spec.submit}</button>
</form>
```

- `validators` — per-field TanStack validators mirroring the core rules
  (attach as `validators={{ onChange: bridge.validators[name], onBlur: …,
  onSubmit: … }}`).
- `submit(values)` — builds the canonical payload (only *visible* fields) and
  runs the spec's mailer, exactly like the engine-driven bindings.
- `on(event, handler)` — subscribe to `rf:submit-start` / `rf:submit-success`
  / `rf:submit-error` around `submit()`.
- `beforeSubmit` / `afterSubmit` options — mirror the engine's lifecycle
  hooks: returning `false` from `beforeSubmit` cancels `submit()` (it resolves
  `{ ok: false, message: "" }` with no mailer call, no `rf:submit-start`).
- `isVisible(name, values)` / `visibleFieldNames(values)` — conditional
  visibility read off TanStack state instead of the DOM.
- `<ContactFormField />` renders the shared `rf-*` field markup with values
  and errors owned by TanStack (see `examples/tanstack-demo`).

### Events & lifecycle hooks (the `rf:*` bus)

Every engine-driven form announces its lifecycle on a namespaced **`rf:*`
event bus**. `attachForm` and `renderForm` return an `on(event, handler)` that
subscribes through the engine's detach-safe registry; because the events are
plain `CustomEvent`s dispatched on the `<form>`, native `addEventListener`
receives them too. `detach()` removes subscriptions with every other listener.

| Event | Fires | `detail` |
| --- | --- | --- |
| `rf:fields-change` | a control's `input` / `change` | `{ name, value }` |
| `rf:row-add` / `rf:row-remove` | a repeater row added / removed | `{ name, count }` |
| `rf:step-change` | wizard step transition (Next, Back, stepper jump) | `{ from, to, total }` — `total` counts the *visible* steps, so conditional panes shrink it |
| `rf:submit-start` | after validation passes, before the mailer | `{ name, id, form }` |
| `rf:submit-success` | the mailer accepted the submission | `{ name, id, message }` — `message` is the same success string the status box would show |
| `rf:submit-error` | the mailer failed | `{ name, id, message }` |

Lifecycle **hooks** let a consumer veto or observe those same moments
declaratively by passing them in the attach options:

```js
renderForm("#root", spec, {
  config: { endpoint },
  hooks: {
    beforeValidateStep: () => guard() !== false, // false cancels the "Next" advance
    afterStepChange: ({ from, to }) => setStep(from, to),
    beforeSubmit: () => maybeCancel() === false, // false cancels submission
    afterSubmit: ({ ok, message }) => notify(ok, message),
  },
});
```

A spec can instead carry hook *names* — `hooks: { beforeSubmit: "trackLead" }`
— resolved against the named functions registered in the attach options
(`hooks: { trackLead: fn }`). Specs stay JSON-serialisable, and an
unregistered name is a no-op while the matching event still fires. The React
binding exposes the same seam through its optional `hooks` prop; the TanStack
bridge mirrors the submit hooks (`beforeSubmit` / `afterSubmit` options) and
the `rf:submit-*` events (`bridge.on(...)`).

**Analytics** — `createAnalytics({ adapter })` is the zero-dependency analytics
seam over the same bus. Give it a tracker (`track(event, detail)`) and subscribe
each form once; the whole `rf:*` bus is forwarded with its details (form
identity, step transitions, row counts, submit outcomes):

```js
import { renderForm, createAnalytics } from "@clearstorm/contact-form/vanilla";

const analytics = createAnalytics({ adapter: { track: (e, d) => telemetry(e, d) } });
const { form, detach } = renderForm("#root", spec, { config: { endpoint } });
const stop = analytics.attach(form); // on unmount
```

It only consumes events the engine already emits — no fabricated events, no
`data-*` hooks — and its `attach` uses native `addEventListener`, so it works
even on forms the engine didn't wire. FEATURES tracks it as `analytics-seam`.

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
`value1, value2`. Repeater row groups fold in as **one `Label: …` line per
group** — the row array JSON on a single line — and file fields inside rows
travel best-effort as their filenames (only top-level file fields re-attach
their real bytes).

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
| `text` | `<input type="text">` | required only (unless `pattern` / `minLength` / `maxLength`) |
| `email` | `<input type="email">` | email format (+ optional pattern/length bounds) |
| `tel` | `<input type="tel">` | phone format (7–15 digits/`+-() `) (+ optional pattern/length bounds) |
| `url` | `<input type="url">` | scheme-ful URL (`https://…`) (+ optional pattern/length bounds) |
| `password` | `<input type="password">` | required only (+ optional pattern/length bounds) |
| `search` | `<input type="search">` | required only (+ optional pattern/length bounds) |
| `number` | `<input type="number">` | numeric + `min`/`max` bounds |
| `date` | `<input type="date">` | required only |
| `time` | `<input type="time">` | required only |
| `datetime-local` | `<input type="datetime-local">` | required only |
| `month` | `<input type="month">` | required only |
| `week` | `<input type="week">` | required only |
| `textarea` | `<textarea>` | min length 10 (override via `minLength`, cap via `maxLength` + live counter) |
| `select` | `<select>` — single, or multi with `multiple: true` (`rows` = visible height) | required only; multi needs at least one option chosen (`minSelect`/`maxSelect` bound multi-selects) |
| `checkbox` | single, or group (with `options`) | must be selected when required (`minSelect`/`maxSelect` bound groups) |
| `radio` | group (requires `options`) | must be selected when required |
| `hidden` | `<input type="hidden">` | never validated |
| `range` | `<input type="range">` | within 0–100 (override via `min`/`max`) |
| `color` | `<input type="color">` | `#rrggbb` hex |
| `file` | `<input type="file">` (single, or `multiple` with an `accept` hint) | must have a file selected when required; file bounds via `maxSize` / `allowedTypes` / `minFiles` / `maxFiles` |

`select` needs `options: string[]`; checkbox/radio groups need `options` too
(a checkbox without `options` is a single toggle next to its label). Input
passthrough attributes — `placeholder`, `value`, `min`, `max`, `step`,
`maxlength`, `pattern`, and for file/select `accept` and `multiple` — flow
through to the rendered control.

Beyond those attributes, **validation keys** layer on top of any field's
type rule (see [Custom validation rules](#custom-validation-rules)):
`pattern` (regex — also rendered as the native attribute), `minLength` /
`maxLength` (soft length bounds; `maxLength` draws a live character counter),
`sameAs` (cross-field equality — confirm-password style), `minSelect` /
`maxSelect` (checked/selected counts on checkbox/radio groups and
multi-selects) and — on `file` fields — `maxSize` / `allowedTypes` /
`minFiles` / `maxFiles`.

**`options` on a non-picker input** (e.g. `text`, `email`, `search`, `number`,
… — anything that isn't `select`, checkbox/radio, `textarea` or `hidden`)
renders a `<datalist>` of suggestions on the input. They steer the visitor
without restricting the value — free text stays valid.

**`file` fields** validate their attachments — per-file `maxSize` (bytes or
`"5MB"`-style units), an `allowedTypes` MIME allow-list (`"image/*"` globs
work), and `minFiles` / `maxFiles` count bounds on `multiple` inputs
(`minFiles > 0` implies required). `accept` stays a **picker hint only** — the
enforcement list is explicit. The canonical payload carries the attached
**filename(s)** (`"a.txt, b.txt"` for a `multiple` file input) — a JSON
endpoint receives names, not bytes. The cf7 mailer re-attaches the real
uploads from the multipart body, so the email path gets the actual files.

Every type can be required or optional. `required: false` (the default)
never blocks submit; `optional: true` additionally renders a muted
“(optional)” suffix on the label so visitors know they can skip it.
`/field-types`'s “All 20 field types” form and the wizard's “Every field type” form pair required and
`optional: true` instances of every optional-capable type side by side.

---

## Repeaters (row groups)

A `repeater` element lets any field types repeat as rows the visitor can add
and remove — a team-member list, a set of named links, an order line table:

```jsonc
{
  "type": "repeater",
  "id": "members",
  "name": "members",               // payload key: one JSON array of rows
  "minRows": 1,                     // default 0 — a bound floors the row count;
                                    //   the renderer always starts max(1, minRows)
  "maxRows": 3,                     // omitted = unbounded
  "addLabel": "Add a team member",  // falls back to copy.addRow, then “Add another”
  "fields": [
    { "type": "text",  "name": "member_name", "label": "Name",  "required": true },
    { "type": "email", "name": "member_email", "label": "Email", "required": true }
  ]
}
```

`fields` nests any field types (validation keys included — they resolve per
row). The shared script renders one starter row (or `minRows`) and an
`+ Add` / `Remove` button per row; `maxRows` disables add at the ceiling and
`minRows` disables remove at the floor. Rows validate **in isolation** — an
empty required field flags only its own row, and cross-field rules (`sameAs`,
`minSelect`/`maxSelect`) stay scoped to the row's own values. A submit that
would land outside `minRows`/`maxRows` is blocked with a block-level row-count
error. Repeaters nest the same rules as any other spec field: `showWhen`
conditionally hides a repeater as a whole (its rows validate and submit only
while visible). Repeaters don't nest inside repeaters, and — being a
DOM-engine feature — row groups aren't driven by the TanStack bridge or the
Zod adapter (scalar-only bindings skip the container; the DOM engine owns row
validation).

**Payload:** each row group submits as **one structured JSON array** under its
own `name` — the `json` mailer sends
`"members": "[{\"member_name\":\"Jane\",\"member_email\":\"jane@…\"}, …]"`.
Inner fields keep their plain names inside each row object, multiple values
are comma-joined, and file fields inside rows travel as their filenames.
Entirely empty rows are dropped (a `minRows` bound pads the count back to the
floor). The cf7 mailer folds each array onto one `Label: …` line.

---

## Structural field types (headings, descriptions, dividers, sections)

`fields` is the ordered layout of the form — it mixes data fields with the
**structural field types** that shape the page without taking input. They
render static markup only: they carry no `name`/`id`, are dropped from the
client field spec during serialisation, and so never validate, never appear in
the payload, and never reach the shared script.

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
| `description` | `text`, optional `size` (100 \| 90 \| 80 \| 75 \| 70 \| 67 \| 60 \| 50 \| 40 \| 33 \| 30 \| 25 \| 20 \| 10, default 100) | muted helper text sharing the field grid spans |
| `divider` | optional `visible` (default `true`), optional `min` (CSS length) | thin rule, or with `visible: false` an invisible spacer |
| `section` | optional `label` | section break; the label sits centered on the rule |

Styling follows the same theme system with dedicated tokens —
`--rf-heading-*`, `--rf-description-*`, `--rf-divider-*`, `--rf-section-*`
(see [Theming](#theming-rf-custom-properties)).

> Live demo: `/field-types` renders the “Structural field types” named form in
> [`examples/specs/field-types.json`](examples/specs/field-types.json) — all
> four structural types in one form.

---

## Multi-step wizard (`step` markers)

A `step` marker splits the form into groups — a wizard. Everything below a
marker belongs to that step until the next marker; there is **no top-level
`steps` key and no per-field step index** — the markers are the layout:

```jsonc
"stepper": {
  "nav":    { "variant": "center", "line": "center" },  // opt-in strip styling
  "header": { "align": "center" }                       // pane-header defaults
},
"fields": [
  { "type": "heading", "text": "Project enquiry" },   // before the 1st marker →
  ...                                                 // shared prefix, shown on every step
  { "type": "step", "label": "Contact" },             // step 1
  { "type": "text", "id": "name", "name": "name", "label": "Name", "required": true },
  { "type": "step", "label": "Project",
    "title": "Tell us about your project" },          // step 2 (title overrides label)
  { "type": "select", "id": "budget", "name": "budget", "label": "Budget", "options": ["…"] },
  { "type": "step", "label": "Details", "align": "right",
    "submit": "Send enquiry" },                       // step 3 (per-marker override)
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
  `form.submit`'s label is the fallback. Step advances are unchanged by
  [`validateOn`](#validation-timing-validateon) — a wizard carrying
  `"validateOn": "touched"` (like the flagship demo) validates live only once a
  field has been left or a submit attempt has happened.
- **Step headers + stepper chrome (opt-in `stepper` key)** — a top-level
  `stepper` form key is the one place wizard chrome lives: `nav` styles the
  strip (`variant`: `left` / `center` / `right` / `even`; `line`:
  `none` / `top` / `bottom` / `center` — with `even`, `center` splits the
  strip into equal full-width slices with a rule running between the chips,
  never a centred cluster; `number` / `label` toggle the chip and text;
  `clickable` toggles the jump-back links; `background` fills the whole
  strip with a colour band), and `header` sets the
  pane-header defaults (`show` / `align` / `line`). Every pane opens with a
  header by default — a number chip plus the step `label` (or a longer
  `title`) styled like a decorative heading. A marker's own `show` /
  `title` / `align` / `line` override the `header` defaults per step
  (`"show": false` on a marker renders a bare pane). Without a `stepper`
  key the wizard renders its plain defaults — left-aligned strip, no rules,
  numbered+labelled clickable steps, numeric pane headers.
- **Completed steps are clickable** in the stepper — once a step is behind the
  current one, its chip becomes a link back to it (no validation, like Back;
  Next re-validates on the way forward), so the visitor can jump straight back
  to an earlier step to edit it. `stepper.nav.clickable: false` turns the
  strip into the plain informational stepper.
- Buttons are the form spec's `submit` / `next` / `prev`, each a plain label
  or `{ "label", "variant" }` with `primary` | `secondary` | `ghost`
  (defaults: `submit`/`next` → primary, `prev` → secondary) — the wizard
  button labels come from those specs alone. The stepper theme ships with
  `--rf-step-*` / `--rf-steps-*` tokens (see
  [Theming](#theming-rf-custom-properties)).

#### Conditional steps (skip whole panes)

A `step` marker may carry the same `showWhen` conditions as a field — the
whole pane is **skipped** while its conditions don't hold. Conditions reuse
the field-level operators and AND-array / `anyOf` / `noneOf` / `not`
wrappers, and are evaluated against earlier steps' and the shared prefix's
values (referencing a same-or-later step's fields is a spec warning).

```jsonc
{ "type": "step", "label": "Contact" },
{ "type": "select", "id": "account_type", "name": "account_type",
  "label": "Account type", "options": ["Personal", "Business"] },
{ "type": "step", "label": "Company",
  "showWhen": { "field": "account_type", "operator": "equals", "value": "Business" } },
{ "type": "text", "id": "company", "name": "company", "label": "Company name", "required": true }
```

Behaviour:

- A skipped pane is **hidden + `inert`** and its chip is struck through
  (`rf-step--skipped`) — never current, done or clickable. Its fields are
  fully **out of scope**: a skipped pane's `required` field can't block a
  step, and nothing in it reaches the payload or drives `showWhen` chains.
- **Authored step indices never change** — the engine computes which steps
  are visible and walks that sequence: Next/Back and completed-step jumps
  skip skipped panes, and `rf:step-change`'s `total` counts the *visible*
  steps (so it can be 3, then 4, when a later pane reveals).
- **Reveal is live**: flipping a controller reveals its pane immediately, and
  the final button flips back to "Next" (a re-reveal re-applies the current
  step). If the visitor is standing on a step when it becomes skipped, they
  reflow to the previous visible step.
- Conflicting conditions are a spec error — a pane that can never fulfil its
  conditions is permanently skipped and never blocks navigation.

> Live demo: `/wizard` renders all three named forms in
> [`examples/specs/wizard.json`](examples/specs/wizard.json) on one page —
> the flagship wizard (four step markers including a conditional **Company**
> pane revealed by `account_type = "Business"`, a centered rule-flanked
> stepper, pane-header defaults with per-marker overrides, a cross-step
> conditional reveal, a hoisted hidden field, and `autoSave` progress
> drafts), every field type with required + `optional: true` twins on an
> `even`-slice stepper with a `background` band, and the compact chrome
> options (no numbers, no jump-backs, custom button labels, a `full` header
> rule and a bare `show: false` pane).

---

## Draft autosave + prefilled values

### `autoSave` — localStorage drafts

Progress is cheap to give back. `autoSave` on the spec drafts the form to
`localStorage` and restores it the next time the page loads:

```jsonc
{
  "name": "enquiry",
  "autoSave": true,                // key: rf:draft:{formName}
  // "autoSave": "contact-draft",  // …or an explicit key, verbatim
  "fields": [ … ]
}
```

- **What's saved** — a debounced (~400 ms) snapshot after typing, row
  add/remove or wizard step changes: every visible control's value, the
  current wizard step (so a multi-step form resumes where it was left), and
  repeater row counts + per-row values. File inputs and `type: "hidden"`
  controls are never captured; a form on a skipped step reflows on restore.
- **Restore** happens at attach; **`values` (below) beats a stored draft**,
  and a successful submit clears the draft (a pending debounced save is
  cancelled too).
- localStorage is feature-detected and every interaction is wrapped in
  `try/catch` — persistence can never break a form.

### `values` — prefilled controls at attach

Pass a `values` map to `renderForm`, `attachForm` or the React component to
prefill controls without touching the spec (great for edit forms, query
params, or restoring a rejected submission):

```js
renderForm("#root", spec, {
  config: { endpoint },
  values: {
    name: "Jane",
    topics: ["Design", "Ops"],        // checkbox group
    tier: "Pro",                       // radio
    team: ["A", "C"],                  // multi-select (multiple: true)
    consent: "on",                     // lone checkbox toggle
  },
});
```

Values apply at attach (after any stored `autoSave` draft, so explicit
values win) and are never serialised or persisted — reloading without a draft
starts fresh.

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

An **array of conditions means AND** (every one must hold). For OR/NOR
semantics wrap conditions in `anyOf` / `noneOf`, and negate any single rule
with `not` — all three nest freely. Operators:

- `equals` / `notEquals` — exact match (text, select, radio)
- `in` / `notIn` — the value is/isn't in a list
- `includes` / `containsAll` — a checkbox group contains *every* listed value
- `containsAny` — a checkbox group contains *at least one* listed value
- `greaterThan` / `greaterThanOrEqual` / `lessThan` / `lessThanOrEqual` —
  numeric comparison (`value` as a number); non-numeric values (ISO dates,
  times) compare lexicographically
- `startsWith` / `endsWith` — string prefix/suffix match
- `regex` — the value matches a regular expression (evaluated client-side)
- `filled` / `empty` — the controlling field has / has no trimmed value

Unknown operators never match — the field stays hidden.

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
"showWhen": { "field": "topics",  "operator": "includes", "value": "News" }        // checkbox group — "all of these"
"showWhen": { "field": "topics",  "operator": "containsAll", "value": ["News", "Offers"] }
"showWhen": { "field": "topics",  "operator": "containsAny", "value": ["News", "Offers"] } // at least one
"showWhen": { "field": "team_size", "operator": "greaterThan", "value": 50 }      // numeric
"showWhen": { "field": "date",   "operator": "greaterThanOrEqual", "value": "2026-10-01" } // ISO dates compare lexicographically
"showWhen": { "field": "email",  "operator": "startsWith", "value": "jane@" }
"showWhen": { "field": "email",  "operator": "endsWith",   "value": ".edu" }
"showWhen": { "field": "vat",    "operator": "regex",      "value": "^[A-Z]{2}\\d{9}$" }
"showWhen": { "field": "rush",   "operator": "filled" }                            // single checkbox
"showWhen": { "field": "notes",  "operator": "empty" }
"showWhen": [ // AND
  { "field": "region", "operator": "equals", "value": "US" },
  { "field": "plan",   "operator": "notEquals", "value": "Trial" }
]
"showWhen": { "anyOf": [ // OR — one branch must hold
  { "field": "plan", "operator": "equals", "value": "Enterprise" },
  { "field": "plan", "operator": "equals", "value": "Custom" }
] }
"showWhen": { "noneOf": [ { "field": "plan", "operator": "equals", "value": "Free" } ] } // NOR
"showWhen": { "not": { "field": "opt_out", "operator": "filled" } }                 // negation
```

> Run every operator live: the demo's `/conditional` page renders all four
> named forms in
> [`examples/specs/conditional.json`](examples/specs/conditional.json) — an
> operator-reference form with one self-documenting reveal per operator,
> alongside a realistic enquiry, an AND example and a "Logical combinations"
> form exercising `anyOf`, `not`, numeric comparisons, `endsWith` and
> `containsAll`.

---

## Success state (`status` + `statusMode`)

On success the form shows `form.status` in a box **under the submit button**
and clears its fields — the form stays visible so the visitor can go again.
That's `statusMode: "inline"`, the default.

Pass `"statusMode": "replace"` to collapse the whole form instead, leaving
only the success box — the classic "thanks, we've got it" pattern
(no endpoint round-trip is required to see it on the demo's JSON mailer
form, which uses it). `role="status"` keeps the message announced to screen
readers in both modes.

```jsonc
{
  "name": "enquiry",
  "status": "Thanks — we'll reply shortly.",
  "statusMode": "replace",   // "inline" (default) keeps the cleared form visible
  "fields": []
}
```

### Custom success screens (`autoSuccess` / `renderStatus`)

Set `autoSuccess: false` (as an option to `renderForm` / `attachForm`, or a
React prop) and the engine stops showing the success presentation entirely: no
status box, no `rf-form--success` collapse — nothing changes for submit errors
(the engine default box stays), field-level errors, the form reset, the
lifecycle or `rf:submit-success` (which now carries `{ name, id, message }`).
It suppresses *only* the success display, so a consumer can own success
without fighting the engine:

```js
renderForm("#root", spec, {
  config: { endpoint },
  autoSuccess: false,
});
// the form el never shows a success box — drive your own UI:
form.addEventListener("rf:submit-success", (e) =>
  document.querySelector("#my-success").textContent = e.detail.message,
);
```

The React binding turns this into a component. A `renderStatus` prop renders
your success screen **in place of the whole form** after a successful submit,
with `{ message, name, id, form, reset }` — `reset()` re-mounts the form as a
fresh engine-wired instance:

```tsx
import { ContactForm } from "@clearstorm/contact-form/react";

<ContactForm
  form={spec}
  renderStatus={({ message, reset }) => (
    <div className="success-card">
      <h2>✓ {message}</h2>
      <button onClick={reset}>Fill it in again</button>
    </div>
  )}
/>
```

Success-only: submit errors still use the engine's default status box, which
keeps appearing as long as the form is shown. Prefer a stable function identity
for `renderStatus` (e.g. `useCallback`) — like `hooks`, it is an effect
dependency. The react-demo's `/mailers` page renders the JSON echo form with a
custom `renderStatus` screen (re-keyed as `json-success-custom`).

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
| `pattern` | regex mismatch on text-like fields (falls back to the `required` message for required-empty; format types keep their own key) | `Please fill this in.` |
| `sameAs` | cross-field equality mismatch | `These values must match.` |
| `selection` | `minSelect` / `maxSelect` bounds | `Please select the right number of options.` |
| `checkbox` | checkbox/radio required | `Please select this option.` |
| `file` | file required | `Please attach a file.` |
| `fileSize` | a file exceeds `maxSize` (`{max}` = human-readable limit) | `File is too large (max 2MB).` |
| `fileType` | a file's MIME type isn't in `allowedTypes` | `This file type isn't allowed.` |
| `fileCount` | attached count outside `minFiles`/`maxFiles` (`{min}`/`{max}` placeholders) | `Attach between {min} and {max} files.` |
| `sending` | submit button while in flight | `Sending…` |
| `error` | generic submission failure | `Something went wrong. Please try again in a moment.` |
| `invalidForm` | mailer validation failure, no details | `Some fields need your attention. Please check the form.` |
| `configError` | missing endpoint config | varies by mailer |
| `submitError` | HTTP-error fallback (`{status}` token) | `Submission failed (HTTP {status}). Please try again.` |
| `addRow` | repeater “add a row” button (falls back per-repeater to its `addLabel`, then this key) | `Add another` |
| `removeRow` | repeater “remove this row” button (falls back per-repeater to its `removeLabel`, then this key) | `Remove` |

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
  --rf-label-color: inherit;
  --rf-label-size: 0.82rem;
  --rf-label-weight: 600;
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
| `--rf-muted` | `#6b7280` | optional “(optional)” markers, muted `description`/`section` label fallback |
| `--rf-label-color` | `inherit` | field labels + checkbox/radio option text |
| `--rf-submit-bg` | `#111827` | submit button background |
| `--rf-submit-text` | `#ffffff` | submit button text |
| `--rf-success` | `#16a34a` | status box success border |
| `--rf-success-text` | `#14532d` | status box success text |
| `--rf-danger` | `#dc2626` | status box error border/text |
| `--rf-step-color` | `#9ca3af` | stepper chip text + index bubble (pending) |
| `--rf-step-active-color` | `var(--rf-submit-bg)` | stepper current-step bubble + text |
| `--rf-step-done-color` | `var(--rf-success)` | stepper completed-step bubble |
| `--rf-step-bg` | `transparent` | stepper chip pill background |
| `--rf-step-active-bg` | `var(--rf-step-bg)` | current-step chip background |
| `--rf-step-done-bg` | `var(--rf-step-bg)` | completed-step chip background |
| `--rf-steps-bg` | `transparent` | nav strip band background (`nav.background`) |
| `--rf-button-secondary-color` | `var(--rf-submit-bg)` | secondary (outline) button text |
| `--rf-button-secondary-border` | `var(--rf-submit-bg)` | secondary button border |
| `--rf-button-secondary-hover-bg` | `var(--rf-submit-bg)` | secondary hover background |
| `--rf-button-secondary-hover-color` | `var(--rf-submit-text)` | secondary hover text |
| `--rf-button-ghost-color` | `var(--rf-submit-bg)` | ghost (text-only) button text |
| `--rf-button-ghost-hover-bg` | `color-mix(in srgb, … 10%, transparent)` | ghost hover background |
| `--rf-step-header-num-color` | `var(--rf-step-active-color)` | pane header number chip |
| `--rf-color-scheme` | `light` | native form controls (`color-scheme`) |

### Label tokens

| Variable | Default | Used by |
| --- | --- | --- |
| `--rf-label-color` | `inherit` | field labels, checkbox/radio option text & the single-consent label |
| `--rf-label-size` | `0.82rem` | field label font-size |
| `--rf-label-weight` | `600` | field label font-weight |

The single-consent checkbox keeps its deliberate body-text sizing
(`0.9rem` / `400`); it still follows `--rf-label-color`.

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
| `--rf-steps-padding` | `0.25rem 0.5rem` | nav strip band padding (`nav.background`) |
| `--rf-steps-line-color` | `var(--rf-field-border)` | stepper flanking rule colour |
| `--rf-steps-line-thickness` | `1px` | stepper flanking rule thickness |
| `--rf-steps-line-gap` | `0.75rem` | stepper rule gap (`top`/`bottom` lines; `even` + `center` separator spacing around each chip) |
| `--rf-step-footer-gap` | `0.5rem` | Back/Next footer gap |
| `--rf-step-header-gap` | `0.5rem` | pane header number↔title gap |
| `--rf-step-header-num-size` | `1.6rem` | pane header number chip size |

Layout: the form is a 12-column grid — use `size` on each field spec for its
width (default `50`, any of
`100 | 90 | 80 | 75 | 70 | 67 | 60 | 50 | 40 | 33 | 30 | 25 | 20 | 10`).
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

### Validation timing (`validateOn`)

By default the form fully validates on submit — an *already-flagged* field
clears its error as you fix it, but a pristine field is never checked until the
submit button is pressed. Set `validateOn` on the spec (or pass it to
`renderForm` / `attachForm` / the React `validateOn` prop — options win) to
validate pristine fields earlier:

| Mode | Behaviour |
| --- | --- |
| `"blur"` | Validate a control the moment it loses focus. |
| `"change"` | Validate on every `input` / `change`, even while typing. |
| `"touched"` | Submit normally; a field starts validating live the first time it loses focus, and every in-scope field validates live once a submit attempt has happened. *Don't nag untouched fields.* |

An **array** combines modes — `["blur", "change"]` validates on blur *and* on
every keystroke. Whatever the mode, validation rules still run through the same
[`ValidationProvider`](#validation-is-pluggable) seam (only *when* they run
changes, never which or how), and hidden conditional fields / skipped wizard
panes never validate live.

```jsonc
{ "name": "enquiry", "validateOn": "touched", "fields": [ … ] }
```

The flagship wizard demo opts in via `"validateOn": "touched"`; its wizard
"Next" validation is unchanged.

### Custom validation rules

Beyond the type's own rule, a field spec can layer on four constraints. They
work through the same `Rule` objects as everything else — so the DOM engine,
the React adapter and the TanStack bridge all enforce them identically:

| Spec key | Meaning | Notes |
| --- | --- | --- |
| `pattern` | Regex the value must match (soft validation) | Also rendered as the native `pattern` attribute. The form renders `novalidate`, so **the shared script** checks it and shows the field's message on mismatch. An invalid pattern is a spec error — it's ignored (fails open), never blocking input. |
| `minLength` / `maxLength` | Soft length bounds for text-like values (`text`, `email`, `tel`, `url`, `search`, `password`, `textarea`) | `minLength` overrides the textarea's built-in 10-char minimum. `maxLength` draws a **live character counter** under the control (`0 / 140`) that tracks typing; it's validation-only — set the native `maxlength` attribute too if you also want a hard cap. |
| `sameAs` | The value must equal another field's value (confirm-password style) | `"sameAs": "password"`. The partner field is re-checked live whenever the target changes, so a visible "Passwords don't match" clears as you fix the original. Optional fields only match when both sides are non-empty. |
| `minSelect` / `maxSelect` | Allowed checked/selected count on checkbox/radio groups and multi-selects | `minSelect > 0` implies required (must pick at least one). Errors are counted against the whole group, and changing any option re-checks every flagged member. |

Any of these can be combined — e.g. a VAT field with `pattern`, an email with
`maxLength`, or a "Confirm password" input with `sameAs` plus `required: true`.
Messages resolve as everywhere else: `field.message` → `copy[key]` → default
(see the copy table below for the new `pattern`, `sameAs` and `selection`
keys).

### Validation is pluggable

Core exposes a seam: a `ValidationProvider` is just `{ buildRules(fields, copy) }`
returning per-field `Rule` objects. Every binding validates through that
seam, so swapping the provider changes *which* rules run — never *how* they
run. The default is `vanillaValidation` (the regex rules above); pass your
own provider through any binding:

```ts
import { renderForm } from "@clearstorm/contact-form/vanilla";
import { zodValidation } from "@clearstorm/contact-form/validation";
import { z } from "zod";

renderForm("#root", spec, {
  validation: zodValidation(z.object({
    email: z.string().email("Enter a valid email address."),
    age: z.coerce.number().min(18, "Must be 18 or older."),
  })),
});
```

- **React:** `<ContactForm form={spec} validation={provider} />`
- **TanStack:** `useContactForm(spec, { validation: provider })` (or hand it raw
  `validators` per field to bypass the seam entirely)
- **Engine:** `attachForm(formEl, { validation: provider })`

`zod` is an **optional peer dependency** — it's only loaded when you import the
adapter, and the adapter consumes the schema structurally (`.shape` +
`safeParse`), so zod v3 and v4 both work. Fields present in the schema
validate against it (required-ness, format and messages all come from the
schema — including per-value issue text); fields absent from the schema keep
the vanilla rule, so the two compose instead of replacing each other.

---

## Project layout

```
src/
├── core.ts                    # spec types, rules, parseTime, canonicalData (no deps)
├── mailers/
│   ├── index.ts               # Mailer types + getMailer registry
│   ├── cf7.ts                 # CF7 REST transport + payload policy
│   └── json.ts                # generic POST transport
├── runtime/                   # framework-agnostic layer all bindings share
│   ├── markup.ts              # rf-* markup builders (single source of truth)
│   ├── engine.ts              # attachForm / initForms — DOM-driven client engine
│   ├── render.ts              # renderForm — vanilla JS entry point
│   └── styles.css             # the one stylesheet (import once, never auto-injected)
├── react/
│   ├── ContactForm.tsx        # uncontrolled React adapter (SSR-friendly)
│   └── index.ts
├── tanstack/
│   ├── useContactForm.ts      # opt-in TanStack Form bridge (validators, submit, visibility)
│   ├── Field.tsx              # ContactFormField — controlled rf-* field renderer
│   └── index.ts
├── validation/
│   ├── zod.ts                 # zodValidation — optional Zod adapter (structural)
│   └── index.ts
└── astro/
    ├── ContactForm.astro      # thin shell → renderFormShell + initForms
    ├── FormField.astro        # thin shell → renderField
    ├── FormElements.astro     # thin shell → renderElements
    └── Decor.astro            # thin shell → renderDecor
```

Run the test suite (core + mailers + markup snapshots + client engine under
happy-dom):

```bash
npm install && npm test
npm run typecheck             # strict tsc over src/
```

The markup snapshot suite (`scripts/markup-tests.ts`) pins every binding's
output to `scripts/fixtures/*.html` — after an intentional markup change,
regenerate with `RECORD=1 npm test` and review the diff.

## License

MIT © clearstorm