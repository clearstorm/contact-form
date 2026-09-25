# Transport proxies — server-side mail delivery (Resend / Postmark / Sendgrid)

The `resend`, `postmark` and `sendgrid` mailers are **proxy-only**: they need a
server-side secret, so the browser never holds a key and never talks to the
provider directly. Instead the client POSTs a small JSON envelope to *your*
endpoint (default `/api/contact`), and a worker on your origin forwards it to
the provider with its API key from the environment.

The envelope the client sends:

```jsonc
{
  "provider": "resend",          // "resend" | "postmark" | "sendgrid"
  "formId": "7c9d…",             // from mailer.config.formId (optional)
  "to": "team@example.test",     // from mailer.config.to (optional recipient hint)
  "payload": {                   // canonical form data as a JSON object
    "first_name": "Jane",
    "email": "jane@example.test",
    "message": "…"
  }
}
```

Configuring the client side (no secrets anywhere in the spec):

```jsonc
{
  "name": "enquiry",
  "mailer": {
    "provider": "resend",
    "formId": "7c9d…",
    "to": "hello@yoursite.com"
  }
  // "endpoint" defaults to "/api/contact" (same origin); to point elsewhere:
  // "endpoint": "https://yoursite.com/api/contact"
}
```

The examples below are **raw `fetch` only** — zero package dependencies, so the
binding's zero-runtime-dependency rule extends to your worker too. Each reads
its key from the environment and never returns it to the browser.

---

## Next.js (App Router) — `app/api/contact/route.ts`

```ts
// app/api/contact/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // or "edge" — fetch works on both

export async function POST(request: Request) {
  const { provider, formId, to, payload } = await request.json();
  const origin = request.headers.get("origin") ?? "";

  switch (provider) {
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Contact form <onboarding@resend.dev>",
          to: to ?? "you@example.com",
          subject: `New enquiry from ${String(payload.first_name ?? "")}`.trim(),
          html: `<p>${formatFieldList(payload)}</p>`,
          reply_to: String(payload.email ?? ""),
        }),
      });
      if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    case "postmark": {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          From: "contact@yoursite.com",
          To: to ?? "you@example.com",
          Subject: `New enquiry from ${String(payload.first_name ?? "")}`.trim(),
          TextBody: formatFieldList(payload),
          ReplyTo: String(payload.email ?? ""),
        }),
      });
      if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    case "sendgrid": {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to ?? "you@example.com" }], subject: `New enquiry from ${payload.first_name ?? ""}` }],
          from: { email: "contact@yoursite.com" },
          content: [{ type: "text/plain", value: formatFieldList(payload) }],
          reply_to: { email: String(payload.email ?? "") },
        }),
      });
      if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
}

function formatFieldList(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, value]) => value !== "" && value != null)
    .map(([name, value]) => `${label(name)}: ${String(value)}`)
    .join("\n");
}

const label = (name: string) => name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
```

> The client's `origin` echo + a `Referrer-Policy` header can be used to
> reject submissions from other sites; add `cors()`/CSRF protection to taste.
> This is a starting point, not a security audit.

---

## Astro — `src/pages/api/contact.ts`

```ts
// src/pages/api/contact.ts
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { provider, formId, to, payload } = await request.json();

  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Contact form <onboarding@resend.dev>",
        to: to ?? "you@example.com",
        subject: `New enquiry from ${String(payload.first_name ?? "").trim()}`,
        html: `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`,
      }),
    });
    const body = await res.text();
    if (!res.ok) return new Response(body, { status: res.status });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // postmark: POST https://api.postmarkapp.com/email with
  //   X-Postmark-Server-Token: process.env.POSTMARK_SERVER_TOKEN
  // sendgrid: POST https://api.sendgrid.com/v3/mail/send with
  //   Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`
  // See the Next.js example above for the body shapes.

  return new Response(JSON.stringify({ error: "unknown provider" }), { status: 400 });
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
```

Astro needs the endpoint at the built site's origin:

```astro
---
// ContactForm.astro or any page hosting the form
import layout from "../../layouts/Base.astro"; // whatever you use
---
<ContactForm form={contactSpec} />
```

With the spec's `mailer.endpoint` left at the default (`/api/contact`), the
client posts to your Astro site's own `/api/contact` route — same origin, no
CORS.

---

## Environment variables

All three examples read secrets only server-side:

| Provider | Variable |
| --- | --- |
| Resend | `RESEND_API_KEY` |
| Postmark | `POSTMARK_SERVER_TOKEN` |
| Sendgrid | `SENDGRID_API_KEY` |

## SMTP / Nodemailer variant

The old Nodemailer idea maps onto the same worker contract: keep the JSON
envelope endpoint, but deliver via `nodemailer` (or any SMTP client) instead of
a provider API — see the roadmap's v0.4.0 note. The package itself stays
zero-runtime-dependency; the SMTP worker is consumer-side.