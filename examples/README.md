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

Every page renders the named forms from **one spec file** — pages like
`/wizard`, `/conditional` and `/theming` show several forms on a single page.

| Route | Demonstrates |
| --- | --- |
| `/` | Index + quickstart |
| `/kitchen-sink` | **All 19 field types** — one form: rendering and every validation rule; checkbox groups, radio, single consent toggle, hidden passthrough; required and `optional: true` twins of every optional-capable type; per-field `message` overrides; column sizes spanning the 12-column grid |
| `/conditional` | **Conditional fields (`showWhen`)** — three named forms from one file: a realistic enquiry (`equals` service → other, `filled` rush → deadline), an operator-reference form exercising all seven operators (`equals`, `notEquals`, `in`, `notIn`, `includes`, `filled`, `empty`), and an AND form where a reveal needs two conditions to hold; hidden fields are out of scope and out of the payload |
| `/wizard` | **Multi-step wizard (`step` markers)** — three named forms from one file: the flagship three-step wizard (centered rule-flanked stepper, pane-header defaults + per-marker overrides, step-scoped "Next" validation, a cross-step `showWhen` reveal, a hoisted hidden field), every field type on an `even`+`center` stepper with a `background` band, and the compact chrome options (`nav` without numbers / jump-backs, custom "Continue" + `ghost` "Back", a `full` pane-header rule, a bare `show: false` pane) |
| `/structure` | **Form structure** — `heading`, `description` (sized helper text), `divider` (rule or invisible spacer) and `section` (labeled break) interleaved with real fields; structural elements never reach `data-rules` or the payload |
| `/contact` | **`cf7` mailer** — endpoint via `config` prop read from `PUBLIC_API_URL` / `PUBLIC_CF7_FORM_ID`; shows the resolved CF7 endpoint (or a friendly config-error note) |
| `/booking` | **`prefill="datetime"`** — date/time pre-filled and still optional; required guests select; optional extras that fold into the payload |
| `/json` | **`json` mailer** — posts the canonical payload to the echo server so you can inspect the exact wire format (honeypot dropped, checkbox groups comma-joined, values trimmed) |
| `/theming` | **CSS-only re-theming** — two named forms from one file (`theme-light` / `theme-dark` slugs); the light side uses the shipped default theme + a brand accent, the dark side a full `--rf-*` override block |

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

Every file is a **map of named forms** — `{ "Form name": FormSpec, … }` — so
one file can hold several examples and one page can render them all (`/wizard`,
`/conditional` and `/theming` show exactly that). A form's display name is the
map key; its `name` slug stays unique per file so every rendered `<form id>`
on a page is distinct. The demo pages import these files directly, so they
double as both reference and the app's data — edit a spec and the page
changes. When a page renders several forms, the shared script attaches per
form and the component scopes every field `id` as `{name}__{field}` (see
`FormElements.astro`), so forms on one page can share field names freely.

| File | Named forms + highlights |
| --- | --- |
| `wizard.json` | **`Flagship wizard`** — three `step` markers (only the last carries a `submit` label), `submit`/`next`/`prev` as `{ label, variant }` button specs, `stepper` chrome (`nav` strip: variant/line/clickable; `header` pane-header defaults) with per-marker overrides, a shared prefix, a cross-step `showWhen` field, and a hoisted hidden field · **`Every field type`** — 19 types across three panes with required + `optional: true` twins; `nav` `variant: "even"` + `line: "center"` + `background`; a cross-step `showWhen` and a hoisted hidden field · **`Compact chrome`** — `nav` without numbers / jump-backs, custom `next` label + `ghost` `prev`, a `full` pane-header rule and a bare `show: false` pane |
| `conditional.json` | **`Realistic enquiry`** — a required "other service" reveal (`service` equals `"Other"`) and a required deadline reveal (urgent checkbox `filled`) · **`All seven operators`** — every `showWhen` operator, one self-documenting reveal per row (`equals`, `notEquals`, `in`, `notIn`, `includes`, `filled`, `empty`) · **`AND — every condition must hold`** — a reveal driven by an array of two conditions (`service` equals `"Other"` **and** `rush` filled) |
| `theming.json` | **`Light — default + brand accent`** / **`Dark — full override`** — identical field shapes under distinct `name` slugs (each renders with its own form id); the theming page swaps the CSS scope, not the spec |
| `all-fields.json` | **`All 19 field types`** — every core type; per-field `message` overrides; a form-level `copy` bag; a `hidden` field with a static value |
| `structure.json` | **`Structure + decor`** — all four structural elements (`heading`, `description`, `divider`, `section`) interleaved with real fields; none of them reach `data-rules` or the payload |
| `contact-cf7.json` | **`Contact — CF7 mailer`** — the classic CF7 shape (the reference site's general-enquiry form); `mailer` omitted, so it defaults to `cf7` |
| `booking.json` | **`Booking (prefill)`** — `prefill="datetime"` companion: optional date/time, required guests, optional message |
| `json-endpoint.json` | **`JSON mailer echo`** — `mailer: "json"` with an `endpoint`; a checkbox group to show multi-value joining |