# Transport proxies — generic multi-provider dispatch

One `/api/contact` route on your origin can receive submissions from **every**
form and fan them out to any backend. The browser never holds a key and never
sees a provider URL: the client POSTs the same small JSON envelope to *your*
endpoint (default `/api/contact`, same origin), and a worker forwards it with
its API key / backend URL from the environment.

## The envelope

```jsonc
{
  "provider": "cf7",             // the dispatch key — see `MailTarget`
  "formId": "z10",               // from mailer.config.formId (required by the route)
  "to": "team@example.test",     // from mailer.config.to (optional recipient hint)
  "payload": {                   // canonical form data as a JSON object
    "first_name": "Jane",
    "email": "jane@example.test",
    "message": "…"
  }
}
```

Two client paths produce this envelope:

1. **Proxy-only mailers** (`resend` / `postmark` / `sendgrid`) — the client
   fills `provider` itself and never holds the key.
2. **Generic `custom` transport with an explicit `target`** — `mailer.target`
   names the server-side backend (`"cf7"`, `"mailchimp"`, `"fluentforms"`, …
   see `MailTarget`), and the transport sends the envelope with `provider` =
   `target`. This is the path to use when you don't want the provider's URL or
   even its identity discoverable from the browser. Endpoint defaults to
   `/api/contact` when a target is set.

## Configuring the client side (no secrets anywhere in the spec)

```jsonc
{
  "name": "general_contact",
  "mailer": {
    "provider": "custom",
    "endpoint": "/api/contact",   // optional — defaults to /api/contact with a target
    "formId": "z10",
    "target": "cf7"
  }
}
```

The `formId` can be any string your proxy understands — a Mailchimp-campaign-ish
reference (`"30-4d-al"`), a demo id (`"demo-form"`), etc. It is the value the
route's whitelist guardrail checks and, for CF7, the id that ends up in the
WordPress endpoint path — **CF7 form ids are the numeric ids from wp-admin**
(the id in the form's shortcode), not arbitrary strings.

## Server-side environment (`.env`)

Server secrets never live in the spec or the client bundle — the route reads
them from its own environment. Copy the multi-provider example file into your
project and fill in the providers you host:

- [`examples/astro-proxy/.env.example`](../examples/astro-proxy/.env.example)
- [`examples/nextjs-proxy/.env.example`](../examples/nextjs-proxy/.env.example)

```env
# --- Route whitelist guardrail (optional) ---
ALLOWED_FORM_IDS="z10,10,30-4d-al,demo-form"

# --- Target: Contact Form 7 (WordPress) ---
CF7_BACKEND_URL="https://internal-cms.yourdomain.com"

# --- Target: Fluent Forms (WordPress) ---
FLUENT_FORMS_BACKEND_URL="https://internal-cms.yourdomain.com"

# --- Target: Resend ---
RESEND_API_KEY="re_123456789"
RESEND_TO_EMAIL="sales@yourdomain.com"

# --- Target: Postmark ---
POSTMARK_SERVER_TOKEN="…"

# --- Target: Sendgrid ---
SENDGRID_API_KEY="…"

# --- Target: Mailchimp (newsletter subscriptions) ---
MAILCHIMP_API_KEY="…"
MAILCHIMP_AUDIENCE_ID="a1b2c3d4e5"
MAILCHIMP_SERVER_PREFIX="us1"
```

The routes are **raw `fetch` only** — zero package dependencies, so the
binding's zero-runtime-dependency rule extends to your worker too. Each reads
its secrets from the environment and never returns them (or the backend URLs)
to the browser.

How each framework reads `.env` differs — the Next.js route uses `process.env`
(Next auto-loads `.env` into it at startup); the Astro route uses
`import.meta.env` (Astro never writes `.env` into `process.env`), with a
`process.env` fallback so its zero-dependency verify harness can import the
same file under plain Node. In both examples `cp .env.example .env` is enough
for local dev; at deploy time expose the same names as real environment
variables on the host.

---

## Generic multi-provider dispatch

Two runnable, copy-paste-ready reference implementations of the same route —
identical `{ provider, formId, to, payload }` contract, cases and status codes:

| Example | Framework | Route file | Output mode |
| --- | --- | --- | --- |
| [`examples/astro-proxy/`](../examples/astro-proxy/README.md) | Astro | `src/pages/api/contact.ts` | hybrid-style — `output: "static"` (Astro 7 unified mode) + `prerender = false` |
| [`examples/nextjs-proxy/`](../examples/nextjs-proxy/README.md) | Next.js App Router | `app/api/contact/route.ts` | on-demand — `runtime: "nodejs"`, `dynamic: "force-dynamic"` |

Run them:

```bash
# Astro (http://localhost:4321) — also `npm run verify`
cd examples/astro-proxy
npm install && cp .env.example .env && npm run dev

# Next.js (http://localhost:3000)
cd examples/nextjs-proxy
npm install && cp .env.example .env && npm run dev
```

Both landing pages render the **client side** of the story — four forms from
`content/forms/proxy.json` (proxied **CF7**, **Fluent Forms** and **Mailchimp**
targets via the generic `custom` + `target` transport, plus a **Resend**
proxy-only envelope) — and each form submits the envelope same-origin to its
own `/api/contact`. Submit one with `.env` left empty and the route answers the
documented **500** (server misconfiguration) — the form's error copy points at
the missing variable. The two spec copies are kept identical.

Both routes implement the same contract:

- **400** — missing `provider` or `formId`; unknown provider; the provider
  rejected the submission (e.g. CF7 responds with `status !== "mail_sent"`).
- **403** — `ALLOWED_FORM_IDS` is set and the envelope's `formId` is not in it.
- **500** — server misconfiguration (the case exists but its env vars are
  missing) or an unexpected error.
- Every success is `{ success: true }`, every failure `{ error }` (with a
  status) — provider keys, backend URLs and raw error bodies are never
  returned to the browser.
- `cf7` forwards `payload` as `FormData` to
  `${CF7_BACKEND_URL}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`
  (with a `_wpcf7_unit_tag`); `fluentforms` posts `form_id` + the field names
  as `FormData` to `${FLUENT_FORMS_BACKEND_URL}/wp-json/fluentform/v1/form-submit`
  (tolerant of the response-shape differences across Fluent Forms versions);
  `resend` / `postmark` / `sendgrid` email
  `to ?? <env recipient>`; `mailchimp` subscribes `payload.email` to the
  audience and treats a "Member Exists" response as success. Mailchimp's basic
  auth uses `btoa` (not `Buffer`), so the Next.js route also runs on edge
  runtimes.

Sending the exact envelope the client produces:

```bash
curl -XPOST http://localhost:4321/api/contact \
  -H 'content-type: application/json' \
  -d '{"provider":"cf7","formId":"5","payload":{"first_name":"Jane","last_name":"Doe","email":"jane@example.com","subject":"Proxy test","message":"Sent through the proxy."}}'
```

### CF7 integration notes

Two WordPress-side behaviours routinely confuse first-time setups:

- **`formId` must be a real CF7 form id.** A formId that names no form on the
  site makes the feedback route answer `rest_no_route` — *"No route was found
  matching the URL and request method."* (HTTP 404).
- **The payload field names must match the CF7 form's own field tags.** CF7
  silently drops payload keys it doesn't recognize and runs validation over
  the rest, so a missing required field surfaces CF7's own `validation_failed`
  message — *"One or more fields have an error. Please check and try again."*
  — with the offending field names in `invalid_fields`. The proxy forwards
  that message verbatim. Add/rename spec fields until the form answers
  `status: "mail_sent"`; CF7's `email` rule also rejects malformed addresses
  (e.g. `a@b.c`), so use a real email when testing. The routes already append
  the `_wpcf7_unit_tag` the feedback endpoint expects.

> Security notes: the client sends `formId` + `provider` plus the canonical
> fields only — backend URLs and master keys never leave the server. The
> `ALLOWED_FORM_IDS` guardrail rejects unknown forms with **403**; missing
> `provider`/`formId` is a **400**; every success is `{ success: true }` and
> every failure a `{ error }` with a status. Add an `origin` echo /
> `Referrer-Policy`/CSRF check to taste — this is a starting point, not a
> security audit.

With the spec's `mailer.endpoint` left at the default (`/api/contact`) the
client posts to your origin's own `/api/contact` route — same origin, no CORS,
in both setups. The `custom` + `target` path behaves identically (it defaults
to `/api/contact` too), so moving a form from a direct adapter to a proxied
one is a spec-only change: set `provider: "custom"` and add `target`.

---

## Environment variables

All examples read secrets only server-side:

| Target | Variables |
| --- | --- |
| Guardrail | `ALLOWED_FORM_IDS` |
| Contact Form 7 (WordPress) | `CF7_BACKEND_URL` |
| Fluent Forms (WordPress) | `FLUENT_FORMS_BACKEND_URL` |
| Resend | `RESEND_API_KEY`, `RESEND_TO_EMAIL` |
| Postmark | `POSTMARK_SERVER_TOKEN` |
| Sendgrid | `SENDGRID_API_KEY` |
| Mailchimp | `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `MAILCHIMP_SERVER_PREFIX` |

The client spec only ever names targets by identifier (`MailTarget`), never by
URL — a target with no server-side case is a route-level 400, and no backend
topology is ever visible in the browser's network tab.

## SMTP / Nodemailer variant

The old Nodemailer idea maps onto the same worker contract: keep the JSON
envelope endpoint, but deliver via `nodemailer` (or any SMTP client) instead
of a provider API — see the roadmap's v0.4.0 note. The package itself stays
zero-runtime-dependency; the SMTP worker is consumer-side. With the generic
dispatch it is just another `case`: read `MAIL_TRANSPORT`-style env config and
call your SMTP client instead of a provider API.