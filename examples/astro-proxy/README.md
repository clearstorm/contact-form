# `astro-proxy/` — Astro hybrid host for the generic transport proxy

A runnable, copy-paste-ready **Astro** host for the generic multi-provider
transport proxy: one `/api/contact` route that receives the
`{ provider, formId, to, payload }` envelope from any ContactForm client and
forwards it to the right backend (CF7, Fluent Forms, Resend, Postmark,
Sendgrid, Mailchimp) with credentials/URLs read from `.env` — never from the
browser.

Most of the route is transport-agnostic: the `custom` + `target` transport and
the proxy-only mailers (`resend` / `postmark` / `sendgrid`) both post the same
envelope, so the same server route serves every `MailTarget`.

## Try the forms on `/`

The landing page renders four live forms from `content/forms/proxy.json` —
proxied **CF7**, **Fluent Forms** and **Mailchimp** targets (the `custom` +
`target` transport) plus a **Resend** proxy-only envelope. All four submit
same-origin to `/api/contact`; each card has a Spec tab showing the exact JSON.
Submit one with `.env` left empty and the route answers **500** (server
misconfiguration) — the form's error copy names the missing variable. The spec
is an identical copy of the one in `nextjs-proxy` — keep them in lockstep.

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

### Environment variables

Astro never writes `.env` into `process.env` — it exposes `.env` through
`import.meta.env` (it checks the server's real environment first, then `.env`
files). The route therefore reads env the Astro way: `import.meta.env`, with a
`process.env` fallback so the zero-dependency verify harness can import the
same file under plain Node (the fallback is inert in Astro).

So `cp .env.example .env` is all you need locally — no exports or `loadEnv`
calls. At deploy time, expose the same names as real environment variables on
the host process (or next to the built server); the fallback only matters
inside `npm run verify`.

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
- 500 — CF7 / Fluent Forms / Resend env misconfiguration
- 200 — CF7 `mail_sent` (correct WordPress URL + `_wpcf7_unit_tag` payload),
  Fluent Forms `form_id` FormData to the form-submit endpoint, Resend to the
  envelope recipient, Postmark, Sendgrid, Mailchimp fresh + "Member Exists"
  idempotence

Full walkthrough, the dispatch contract and the env-variable table:
[`docs/transport-proxies.md`](../../docs/transport-proxies.md).