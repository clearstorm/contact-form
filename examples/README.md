# Examples

Everything you need to see `@clearstorm/contact-form` working end to end.

| Path | What it is |
| --- | --- |
| `astro-demo/` | A minimal standalone **Astro site** consuming the package (linked live via a `file:` dependency) — try every feature in a browser |
| `specs/` | Copy-paste-ready **JSON form specs** the demo actually renders (single source of truth) |

---

## `astro-demo/` — run it

Requires Node ≥ 22.12.

```bash
npm install         # also links the package (file:../..) so src/ edits hot-reload
npm run demo:api    # terminal 1 — log the json-mailer payloads (localhost:8787)
npm run dev         # terminal 2 — http://localhost:4321
```

`npm run build` produces a plain static site in `astro-demo/dist/` — the forms
do all validation and transport client-side, so any static host can serve the
demo.

### Pages

| Route | Demonstrates |
| --- | --- |
| `/` | Index + quickstart |
| `/kitchen-sink` | **All 19 field types** in one spec — rendering and every validation rule; checkbox groups, radio, single consent toggle, hidden passthrough; per-field `message` overrides; 50/66/33/100 column spans |
| `/conditional` | **Conditional fields (`showWhen`)** — a realistic form (`equals` service → other, `filled` rush → deadline), an operator-reference form exercising all seven operators (`equals`, `notEquals`, `in`, `notIn`, `includes`, `filled`, `empty`), and an AND form where a reveal needs two conditions to hold; hidden fields are out of scope and out of the payload |
| `/structure` | **Form structure** — `heading`, `description` (sized helper text), `divider` (rule or invisible spacer) and `section` (labeled break) interleaved with real fields; structural elements never reach `data-rules` or the payload |
| `/contact` | **`cf7` mailer** — endpoint via `config` prop read from `PUBLIC_API_URL` / `PUBLIC_CF7_FORM_ID`; shows the resolved CF7 endpoint (or a friendly config-error note) |
| `/booking` | **`prefill="datetime"`** — date/time pre-filled and still optional; required guests select; optional extras that fold into the payload |
| `/json` | **`json` mailer** — posts the canonical payload to the echo server so you can inspect the exact wire format (honeypot dropped, checkbox groups comma-joined, values trimmed) |
| `/theming` | **CSS-only re-theming** — the same form rendered with the shipped light theme and a full dark `--rf-*` override block |

### Wiring a real backend

- **CF7 (WordPress)**: create a CF7 form with the fields
  `first_name, last_name, email, contact, subject, message`, then run
  `PUBLIC_API_URL=https://your-wp-host PUBLIC_CF7_FORM_ID=5 npm run dev`.
  Ensure `/wp-json/` rewrites to `index.php?rest_route=` on the WP host and
  that the static site's origin is allowed by the CMS's CORS policy.
- **JSON**: any endpoint that accepts a `multipart/form-data` POST and answers
  with JSON. `scripts/echo-server.mjs` is the no-dependency stand-in; a
  serverless mail-delivery worker is the real-world target.

---

## `specs/` — the form specs

Each file is a complete `FormSpec` (see `src/core.ts` for the type). The demo
pages import these directly, so they double as both reference and the app's
data — edit a spec and the page changes.

| File | Highlights |
| --- | --- |
| `all-fields.json` | All 19 field types; per-field `message` overrides; a form-level `copy` bag; a `hidden` field with a static value |
| `enquiry.json` | **Conditional fields (realistic)** — a required "other service" reveal (`service` equals `"Other"`) and a required deadline reveal (urgent checkbox `filled`) |
| `conditions.json` | **Conditional fields (operator reference)** — all seven `showWhen` operators, one self-documenting reveal per row (`equals`, `notEquals`, `in`, `notIn`, `includes`, `filled`, `empty`) |
| `and.json` | **Conditional fields (AND)** — a reveal driven by an array of two conditions (`service` equals `"Other"` **and** `rush` filled) |
| `structure.json` | **Form structure** — all four structural elements (`heading`, `description`, `divider`, `section`) interleaved with real fields; none of them reach `data-rules` or the payload |
| `contact-cf7.json` | The classic CF7 shape (the reference site's general-enquiry form) — `mailer` omitted, so it defaults to `cf7` |
| `booking.json` | `prefill="datetime"` companion — optional date/time, required guests, optional message |
| `json-endpoint.json` | `mailer: "json"` with an `endpoint`; a checkbox group to show multi-value joining |
| `themed-light.json` / `themed-dark.json` | Identical field shapes under distinct `name`s (each renders with its own form id) — the theming page swaps the CSS scope, not the spec |