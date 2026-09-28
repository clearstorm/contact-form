# `astro-proxy/` — Astro hybrid host for the generic transport proxy

A runnable, copy-paste-ready **Astro** host for the generic multi-provider
transport proxy: one `/api/contact` route that receives the
`{ provider, formId, to, payload }` envelope from any ContactForm client and
forwards it to the right backend (CF7, Resend, Postmark, Sendgrid, Mailchimp)
with credentials/URLs read from `.env` — never from the browser.

Most of the route is transport-agnostic: the `custom` + `target` transport and
the proxy-only mailers (`resend` / `postmark` / `sendgrid`) both post the same
envelope, so the same server route serves every `MailTarget`.

## Output mode — hybrid-style (static + on-demand)

`astro.config.mjs` sets `output: "static"` — Astro 7's unified mode that now
covers what `output: "hybrid"` used to mean: the landing page is static, and
the `/api/contact` route is on-demand (`export const prerender = false`). The
`@astrojs/node` adapter (`mode: "standalone"`) provides the local server; swap
it for a host-specific adapter (`@astrojs/vercel`, `@astrojs/cloudflare`, …)
at deploy time.

## Run it

Requires Node ≥ 23.6 (the verify harness uses native TS type-stripping; dev
runs on Node 24).

```bash
npm install   # required first — see the warning below
cp .env.example .env     # fill in at least one provider
npm run dev              # http://localhost:4321
```

> **Run `npm install` in this folder first.** The repo root declares `astro`
> as a required peer dependency, so if you skip the example-level install,
> `astro dev` silently resolves the *root* copy of astro and fails with
> `Cannot find module '@astrojs/node'`. The `predev` / `prebuild` /
> `prepreview` scripts check for the local install and print this hint if it's
> missing.

Now POST the exact envelope the client produces:

```bash
curl -XPOST http://localhost:4321/api/contact \
  -H 'content-type: application/json' \
  -d '{"provider":"cf7","formId":"z10","payload":{"first_name":"Jane","email":"jane@example.test"}}'
```

## Verify the route (no dependencies)

`npm run verify` imports the **real** `src/pages/api/contact.ts` (Node type
stripping), stubs `fetch` and `process.env`, and asserts the contract:

- 400 — missing `provider` / `formId`, unknown provider, CF7
  `validation_failed`, Mailchimp missing email
- 403 — `formId` outside `ALLOWED_FORM_IDS` (and that guarded ids never touch
  a backend)
- 500 — CF7 / Resend env misconfiguration
- 200 — CF7 `mail_sent` (correct WordPress URL + `_wpcf7_unit_tag` payload),
  Resend to the envelope recipient, Postmark, Sendgrid, Mailchimp fresh +
  "Member Exists" idempotence

Full walkthrough, the dispatch contract and the env-variable table:
[`docs/transport-proxies.md`](../../docs/transport-proxies.md).