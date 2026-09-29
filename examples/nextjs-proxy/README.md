# `nextjs-proxy/` — Next.js host for the generic transport proxy

A runnable, copy-paste-ready **Next.js (App Router)** host for the generic
multi-provider transport proxy: one `/api/contact` route that receives the
`{ provider, formId, to, payload }` envelope from any ContactForm client and
forwards it to the right backend (CF7, Fluent Forms, Resend, Postmark,
Sendgrid, Mailchimp) with credentials/URLs read from `.env` — never from the
browser.

Most of the route is transport-agnostic: the `custom` + `target` transport and
the proxy-only mailers (`resend` / `postmark` / `sendgrid`) both post the same
envelope, so the same server route serves every `MailTarget`.

## Try the forms on `/`

The landing page renders seven live forms from `content/forms/proxy.json` —
proxied **CF7**, **Fluent Forms** and **Mailchimp** targets (the `custom` +
`target` transport), a **Resend** proxy-only envelope, and three captcha-
protected CF7 forms (**Turnstile**, **reCAPTCHA v3**, **hCaptcha**) running on
each provider's always-pass test keys. All seven submit same-origin to
`/api/contact`; each card has a Spec tab showing the exact JSON.
Submit one with `.env` left empty and the route answers **500** (server
misconfiguration) — the form's error copy names the missing variable. The spec
is an identical copy of the one in `astro-proxy` — keep them in lockstep.

## Output mode — hybrid (static pages + on-demand route)

Next.js App Router is hybrid by default: pages render at build time, and route
handlers are server functions. This route is explicitly **on-demand** —
`export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`
— so it always runs per request and reads `.env` fresh. `btoa` (not `Buffer`)
in the Mailchimp case keeps edge runtimes a drop-in swap.

## Run it

```bash
npm install   # required first
cp .env.example .env     # fill in at least one provider
npm run dev              # http://localhost:3000
```

> **Run `npm install` in this folder first** — `next` and `react` are
> example-level dependencies, so `npm run dev` won't resolve without the local
> install.

Now POST the exact envelope the client produces:

```bash
curl -XPOST http://localhost:3000/api/contact \
  -H 'content-type: application/json' \
  -d '{"provider":"cf7","formId":"z10","payload":{"first_name":"Jane","email":"jane@example.test"}}'
```

The route implements the identical contract and cases as
`examples/astro-proxy/src/pages/api/contact.ts` — that project ships
`npm run verify`, a no-dependency harness that drives the real route and
asserts the 400/403/500 contract (CF7 URL + `_wpcf7_unit_tag` payload,
Mailchimp member-exists, env-guardrails).

Full walkthrough, the dispatch contract and the env-variable table:
[`docs/transport-proxies.md`](../../docs/transport-proxies.md).