# @clearstorm/contact-form

Reusable contact forms for [Astro](https://astro.build) sites (including static
hosts), built from three decoupled pieces:

- **Core** — a framework-agnostic engine (`src/core.ts`): the JSON form spec,
  client-side validation rules, time normalisation and payload normalisation.
  No framework or DOM dependencies, so the same code can run in a browser
  bundle or a Node worker.
- **Mailers** — transport adapters (`src/mailers/`): `cf7` (Contact Form 7,
  the default) and `json` (generic POST to any endpoint you control).
  A Nodemailer-based delivery adapter is planned as a follow-up release.
- **Components** — self-contained `ContactForm.astro` / `FormField.astro`:
  namespaced `rf-*` markup, styled entirely with `--rf-*` CSS custom
  properties. The shipped theme is dark + warm (the Romi look) — override the
  variables on your own scope and it re-themes without touching the markup.

Zero runtime dependencies. No Tailwind required.

---

## Install

Git dependency (recommended for private packages):

```json
// package.json
{
  "dependencies": {
    "@clearstorm/contact-form": "github:clearstorm/contact-form#v0.1.0"
  }
}
```

> Private GitHub package? Local `npm install` uses your machine's GitHub
> credentials, but CI runners can't — add a PAT scoped to this repo and point
> git at it before install:
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

**2. Render it:**

```astro
---
import ContactForm from "@clearstorm/contact-form/astro/ContactForm.astro";
import { getEntry } from "astro:content";
const { data } = await getEntry("pages", "contact");
---

<ContactForm form={data.form} />
```

**Config resolution order:** explicit `config` props → build-time env
(`PUBLIC_API_URL` + `PUBLIC_CF7_FORM_ID` for `cf7`; the spec's `endpoint` for
`json`). The component logs a console warning at build time when a form is
missing its endpoint config.

---

## CF7 (Contact Form 7) setup

The `cf7` mailer POSTs to the standard REST feedback endpoint:

```
{apiUrl}/wp-json/contact-form-7/v1/contact-forms/{formId}/feedback
```

1. In WordPress, create a CF7 form with these named fields:
   `first_name`, `last_name`, `email`, `contact`, `subject`, `message`
   (the current Romi integration also collects `date`, `time`, `guests`
   via extra form fields).
2. Ensure the REST route is reachable on your static host's API base. A
   rewrite may be required on the WordPress host (cPanel example — adjust for
   your host/port):

   ```apache
   # .htaccess (WordPress root), above any WordPress rewrite rules
   RewriteRule ^wp-json/(.*)?$ /index.php?rest_route=/$1 [L,QSA]
   ```

   Without it you'll hit the WordPress homepage (200 + HTML) instead of JSON,
   and submissions will fail with a non-JSON response.
3. Configure the site:
   - `.env.production` / CI secrets: `PUBLIC_API_URL=https://your-cms.example.com`
     (no trailing `/`), `PUBLIC_CF7_FORM_ID=5`
   - CORS: the CMS must echo the static site's `Origin` (CF7's REST endpoint
     sends `Access-Control-Allow-Origin` it echoes back). Add the site origin
     to the WP host's `Access-Control-Allow-Origin` for production lockdown.

**Payload policy (lives in the `cf7` mailer):** the core fields
(`first_name`, `last_name`, `email`, `contact`, `subject`, `message`) go
verbatim; every other spec field folds into `message` as a `Label: value`
line (times normalised to 24h); `subject` becomes
`"{subject} — {first name} {last name}"` so replies can be addressed. A filled
honeypot field is never forwarded.

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

## Theming (`--rf-*` custom properties)

The component ships its own default (the Romi look). Override any variable by
declaring it on a scope that reaches the form — a wrapper, `:root`, or even
the form itself:

```css
:root {
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
}
```

| Variable | Default | Used by |
| --- | --- | --- |
| `--rf-field-bg` | `#1b1512` | input background |
| `--rf-field-border` | `#3a302b` | input border |
| `--rf-field-text` | `#faf5ee` | input text |
| `--rf-focus` | `#f0bd79` | focus ring / border colour |
| `--rf-muted` | `#b9ada2` | labels, placeholders |
| `--rf-submit-bg` | `#eedbc3` | submit button background |
| `--rf-submit-text` | `#120e0c` | submit button text |
| `--rf-success` | `#79b98a` | status box success border |
| `--rf-success-text` | `#bce0c4` | status box success text |
| `--rf-danger` | `#e56b65` | status box error border/text |

Layout: the form is a 12-column grid — use `size` (`100 | 66 | 50 | 33 | 25`)
on each field spec for its width (default `50`). Fields collapse to a single
column below `48rem`.

**Opt-in defaults:** `prefill="datetime"` on the component pre-fills `date` /
`time` inputs with the current local date and near-now time (handy for
booking forms); both fields remain optional in the spec.

---

## Validation

Required-ness comes from the JSON spec (`required: true`); format checks are
shared code keyed by field type (`email`, `tel`, `textarea` min length 10,
`first_name`/`last_name` ≥ 2 letters, `subject`/`guests` = pick from options).
Errors render inline and clear on input; the honeypot field absorbs bots
(pretend-success, nothing sent).

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