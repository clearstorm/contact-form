# Examples

Everything you need to see `@clearstorm/contact-form` working end to end.

| Path | What it is |
| --- | --- |
| `astro-demo/` | A minimal standalone **Astro site** consuming the package (linked live via a `file:` dependency) — every classic feature in a browser, plus a **vanilla JS** page (`/vanilla`) mounting the same specs with `renderForm` |
| `react-demo/` | A **Vite + React app** (Vite 6 + React 19) with **route parity with the Astro demo** — the same seven paths (`/`, `/field-types`, `/conditional`, `/wizard`, `/mailers`, `/theming`, `/vanilla`), each rendering the named forms from the same `examples/specs/*.json` via the uncontrolled `<ContactForm />` |
| `tanstack-demo/` | A **Vite + React app** for the opt-in **TanStack Form** bridge (`useContactForm` + `<ContactFormField />`) and the pluggable-validation seam — a vanilla | Zod provider toggle proving only *which rules run* changes |
| `specs/` | Copy-paste-ready **JSON form specs** the demos actually render (single source of truth) |

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
`/field-types`, `/wizard`, `/conditional`, `/mailers` and `/theming` show
several forms on a single page. Every form renders with **Form | Spec tabs**:
the Spec tab shows — and copies — the exact JSON driving it, so each example
doubles as a copy-paste-ready reference.

| Route | Demonstrates |
| --- | --- |
| `/` | Index + quickstart |
| `/field-types` | **Field types** — three named forms from one file: the **all 20 field types** kitchen sink (rendering + every validation rule; checkbox groups, radio, single consent toggle, hidden passthrough, file uploads single + `multiple`, a multi-select, a `datalist`-suggesting text input; required and `optional: true` twins; per-field `message` overrides; `rf-span-*` column sizes), the **structural field types** (`heading`, `description`, `divider`, `section` — field types that render static markup, never reaching `data-rules` or the payload) and the **validation extras** form (custom rules layered on any field: `pattern`, `minLength`/`maxLength` with live character counters, `sameAs`, `minSelect`/`maxSelect`) |
| `/conditional` | **Conditional fields (`showWhen`)** — four named forms from one file: a realistic enquiry (`equals` service → other, `filled` rush → deadline), an operator-reference form exercising the equality/value operators, an AND form where a reveal needs two conditions to hold, and a "Logical combinations" form exercising logical wrappers and the newer operators (`anyOf` OR, `not` negation, `greaterThan` numeric comparison, `endsWith` string match, `containsAll` on a checkbox group); hidden fields are out of scope and out of the payload |
| `/wizard` | **Multi-step wizard (`step` markers)** — three named forms from one file: the flagship three-step wizard (centered rule-flanked stepper, pane-header defaults + per-marker overrides, step-scoped "Next" validation, a cross-step `showWhen` reveal, a hoisted hidden field), every field type on an `even`+`center` stepper with a `background` band, and the compact chrome options (`nav` without numbers / jump-backs, custom "Continue" + `ghost` "Back", a `full` pane-header rule, a bare `show: false` pane) |
| `/mailers` | **Both transports** — the `cf7` mailer (`config` prop read from `PUBLIC_API_URL` / `PUBLIC_CF7_FORM_ID`; resolved CF7 endpoint or a friendly config-error note) and the `json` mailer (canonical payload to the echo server — honeypot dropped, checkbox groups comma-joined, values trimmed), two named forms from one file |
| `/theming` | **CSS-only re-theming** — two named forms from one file (`theme-light` / `theme-dark` slugs); the light side uses the shipped default theme + a brand accent, the dark side a full `--rf-*` override block |
| `/vanilla` | **Vanilla JS binding** — the "JSON mailer echo" spec mounted with a single `renderForm("#mount", spec)` call (no framework), plus the `detach()` lifecycle: Detach leaves the markup but unwires the engine, Re-mount wires it again |

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

## `react-demo/` — run it

Vite 6 + React 19 app consuming the same `file:../..` package link. It mirrors
the Astro demo **route for route** — the same seven paths, each rendering the
named forms from the same spec JSON with the uncontrolled `<ContactForm />`:

| Route | Demonstrates |
| --- | --- |
| `/` | Index + quickstart |
| `/field-types` | The all-20 field types kitchen sink + the structural field types |
| `/conditional` | Realistic enquiry, all seven `showWhen` operators, and an AND reveal |
| `/wizard` | The three wizard forms from one spec file (step markers + stepper) |
| `/mailers` | Both transports — `cf7` (env-configurable endpoint) and `json` (echo server) |
| `/theming` | Light/dark scope re-theming with `--rf-*` variables |
| `/vanilla` | `renderForm()` mounted *inside* a React component, with the `detach()` lifecycle |

Every form renders with **Form | Spec tabs** (the Spec tab shows — and copies —
the exact JSON driving it), just like the Astro demo. React never re-renders the
form internals: the engine owns validation, conditional visibility, wizard state
and submission, and is detached on unmount (StrictMode-safe).

```bash
npm install
npm run demo:api    # terminal 1 — echo server (localhost:8787) — lives in this repo
npm run dev         # terminal 2 — http://localhost:5173
```

`npm run build` emits a static bundle in `react-demo/dist/` (Vite serves the
`index.html` fallback for every route). The `json` mailer forms expect the echo
server; everything else (validation, conditional visibility) works without it.

The `cf7` form on `/mailers` reads `VITE_API_URL` / `VITE_CF7_FORM_ID`.
Point them at a real WordPress install (see the Wiring section above) to watch a
real CF7 submission: `VITE_API_URL=https://cms.example.com VITE_CF7_FORM_ID=5 npm run dev`.

---

## `tanstack-demo/` — run it

A focused app for the opt-in **TanStack Form** bridge and the pluggable
validation seam (Vite 6 + React 19 + TanStack Form + Zod):

- **TanStack bridge** — `useContactForm(spec)` maps the core rules to per-field
  validators and the mailer to `onSubmit`; `<ContactFormField />` renders the
  shared `rf-*` markup with values / errors owned by TanStack Form. Conditional
  fields hide via `bridge.isVisible(name, values)`.
- **Vanilla | Zod validation** — the same "Realistic enquiry" form, rendered by
  the exact same component, with only the validation provider swapped:
  `validation: vanillaValidation` vs `validation: zodValidation(schema)` from
  `@clearstorm/contact-form/validation`. Copy, required-ness and format come
  from the consumer's Zod schema; the DOM, payload and mailer stay identical.

```bash
npm install
npm run demo:api    # terminal 1 — echo server (localhost:8787)
npm run dev         # terminal 2 — http://localhost:5174
```

`zod` is an optional peer of the package — in the demo it's a real dependency
because the demo builds schemas. Toggle providers, type `a@b` as the email, and
submit to feel the difference. The schema is consumed structurally
(`.shape` + `.safeParse`), so the package module itself never imports zod.

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
| `conditional.json` | **`Realistic enquiry`** — a required "other service" reveal (`service` equals `"Other"`) and a required deadline reveal (urgent checkbox `filled`) · **`All seven operators`** — the equality/value operators, one self-documenting reveal per row (`equals`, `notEquals`, `in`, `notIn`, `includes`, `filled`, `empty`) · **`AND — every condition must hold`** — a reveal driven by an array of two conditions (`service` equals `"Other"` **and** `rush` filled) · **`Logical combinations`** — `anyOf` (Plan is Enterprise **or** Custom), `not` (visible while "Opt out" is unticked), `greaterThan` (team size > 50), `endsWith` (email ends `.edu`) and `containsAll` (On-premise **and** Hardware Support ticked) |
| `theming.json` | **`Light — default + brand accent`** / **`Dark — full override`** — identical field shapes under distinct `name` slugs (each renders with its own form id); the theming page swaps the CSS scope, not the spec |
| `field-types.json` | **`All 20 field types`** — every core type; per-field `message` overrides; a form-level `copy` bag; a `hidden` field with a static value; a multi-select (`multiple: true`), a `datalist`-suggesting text input (`options` on a non-picker type) and two `file` fields (required single with an `accept` hint, and an optional `multiple` upload) · **`Structural field types`** — all four structural field types (`heading`, `description`, `divider`, `section`) interleaved with real fields; none of them reach `data-rules` or the payload · **`Validation extras`** — custom rules on top of every type rule: `pattern` (regex + per-field message), `minLength`/`maxLength` soft bounds with live `N / max` character counters, a `sameAs` confirm-password pair, and `minSelect`/`maxSelect` bounds on a checkbox group and a multi-select; form-level `copy` overrides for the `sameAs` and `selection` messages |
| `mailers.json` | **`Contact — CF7 mailer`** — the classic CF7 shape (the reference site's general-enquiry form); `mailer` omitted, so it defaults to `cf7` · **`JSON mailer echo`** — `mailer: "json"` with an `endpoint`; `statusMode: "replace"` (after a successful submit the form collapses to the success box only); a checkbox group to show multi-value joining |