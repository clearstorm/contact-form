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

The `formId` can be any string your proxy understands — a CF7 form id
(`"z10"`), a Mailchimp-campaign-ish reference (`"30-4d-al"`), etc. It is the
value the route's whitelist guardrail checks and, for CF7, the id that ends up
in the WordPress endpoint path.

## Server-side environment (`.env`)

```env
# --- Route whitelist guardrail (optional) ---
ALLOWED_FORM_IDS="z10,20,30-4d-al"

# --- Target: Contact Form 7 (WordPress) ---
CF7_BACKEND_URL="https://internal-cms.yourdomain.com"

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

The examples below are **raw `fetch` only** — zero package dependencies, so the
binding's zero-runtime-dependency rule extends to your worker too. Each reads
its secrets from the environment and never returns them (or the backend URLs)
to the browser.

---

## Generic multi-provider dispatch

### Next.js (App Router) — `app/api/contact/route.ts`

```ts
// app/api/contact/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // or "edge" — fetch works on both

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const provider = body.provider as string | undefined;
    const formId = body.formId as string | undefined;
    const to = body.to as string | undefined;
    const payload = (body.payload ?? {}) as Record<string, unknown>;

    // 1. Validation — both identifiers are required in the envelope.
    if (!provider || !formId) {
      return NextResponse.json({ error: "Missing required 'provider' or 'formId'" }, { status: 400 });
    }

    // 2. Optional form-id whitelist guardrail → 403.
    const allowedIds = process.env.ALLOWED_FORM_IDS;
    if (allowedIds) {
      const allowed = allowedIds.split(",").map((id) => id.trim());
      if (!allowed.includes(formId)) {
        return NextResponse.json({ error: `Unauthorized formId: ${formId}` }, { status: 403 });
      }
    }

    // 3. Generic provider dispatch — add a `case` per `MailTarget` you host.
    switch (provider) {
      case "cf7": {
        const backendUrl = process.env.CF7_BACKEND_URL;
        if (!backendUrl) {
          return NextResponse.json({ error: "Server misconfiguration: CF7_BACKEND_URL missing" }, { status: 500 });
        }
        const wpFormData = new FormData();
        for (const [key, value] of Object.entries(payload)) wpFormData.append(key, String(value));
        wpFormData.append("_wpcf7_unit_tag", `wpcf7-f${formId}-o1`);

        const wpRes = await fetch(
          `${backendUrl}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`,
          { method: "POST", body: wpFormData },
        );
        const wpBody = (await wpRes.json()) as { status?: string; message?: string };
        if (wpBody.status !== "mail_sent") {
          return NextResponse.json({ error: wpBody.message || "Submission rejected by WordPress" }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: wpBody.message });
      }

      case "resend": {
        const apiKey = process.env.RESEND_API_KEY;
        const recipient = to ?? process.env.RESEND_TO_EMAIL;
        if (!apiKey || !recipient) {
          return NextResponse.json({ error: "Server misconfiguration: RESEND_API_KEY/RESEND_TO_EMAIL missing" }, { status: 500 });
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Contact form <onboarding@resend.dev>",
            to: [recipient],
            subject: `New submission for form ${formId}`,
            text: `Form: ${formId}\n\n${formatFieldList(payload)}`,
            reply_to: String(payload.email ?? ""),
          }),
        });
        if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
        return NextResponse.json({ success: true });
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
            To: to ?? process.env.POSTMARK_TO_EMAIL ?? "you@example.com",
            Subject: `New submission for form ${formId}`,
            TextBody: formatFieldList(payload),
            ReplyTo: String(payload.email ?? ""),
          }),
        });
        if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
        return NextResponse.json({ success: true });
      }

      case "sendgrid": {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to ?? "you@example.com" }], subject: `New submission for form ${formId}` }],
            from: { email: "contact@yoursite.com" },
            content: [{ type: "text/plain", value: formatFieldList(payload) }],
            reply_to: { email: String(payload.email ?? "") },
          }),
        });
        if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
        return NextResponse.json({ success: true });
      }

      case "mailchimp": {
        const apiKey = process.env.MAILCHIMP_API_KEY;
        const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
        const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
        if (!apiKey || !audienceId || !serverPrefix) {
          return NextResponse.json({ error: "Server misconfiguration: MAILCHIMP_* missing" }, { status: 500 });
        }
        const email = String(payload.email ?? "");
        if (!email) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
        const res = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: email,
            status: "subscribed",
            merge_fields: {
              FNAME: String(payload.first_name ?? ""),
              LNAME: String(payload.last_name ?? ""),
            },
          }),
        });
        const mcBody = (await res.json()) as { title?: string; detail?: string };
        if (res.ok || mcBody.title === "Member Exists") return NextResponse.json({ success: true });
        return NextResponse.json({ error: mcBody.detail || "Mailchimp subscription failed" }, { status: 400 });
      }

      default:
        return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server proxy error" }, { status: 500 });
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

> Security notes: the client sends `formId` + `provider` plus the canonical
> fields only — backend URLs and master keys never leave the server. The
> `ALLOWED_FORM_IDS` guardrail rejects unknown forms with **403**; missing
> `provider`/`formId` is a **400**; every success is `{ success: true }` and
> every failure a `{ error }` with a status. Add an `origin` echo /
> `Referrer-Policy`/CSRF check to taste — this is a starting point, not a
> security audit.

### Astro — `src/pages/api/contact.ts`

```ts
// src/pages/api/contact.ts
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { provider, formId, to, payload } = await request.json();

    if (!provider || !formId) {
      return new Response(JSON.stringify({ error: "Missing required 'provider' or 'formId'" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const allowedIds = process.env.ALLOWED_FORM_IDS;
    if (allowedIds) {
      const allowed = allowedIds.split(",").map((id) => id.trim());
      if (!allowed.includes(formId)) {
        return new Response(JSON.stringify({ error: `Unauthorized formId: ${formId}` }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (provider === "cf7") {
      const backendUrl = process.env.CF7_BACKEND_URL;
      const wpFormData = new FormData();
      for (const [key, value] of Object.entries(payload ?? {})) wpFormData.append(key, String(value));
      wpFormData.append("_wpcf7_unit_tag", `wpcf7-f${formId}-o1`);
      const wpRes = await fetch(`${backendUrl}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`, {
        method: "POST",
        body: wpFormData,
      });
      const wpBody = await wpRes.json();
      return new Response(JSON.stringify({ success: true }), {
        status: wpBody.status === "mail_sent" ? 200 : 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Contact form <onboarding@resend.dev>",
          to: [to ?? process.env.RESEND_TO_EMAIL],
          subject: `New submission for form ${formId}`,
          text: `Form: ${formId}\n\n${formatFieldList(payload)}`,
          reply_to: String(payload.email ?? ""),
        }),
      });
      const body = await res.text();
      return new Response(body, { status: res.ok ? 200 : res.status, headers: { "content-type": "application/json" } });
    }

    if (provider === "mailchimp") {
      const apiKey = process.env.MAILCHIMP_API_KEY;
      const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
      const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
      const res = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: String(payload.email ?? ""),
          status: "subscribed",
          merge_fields: { FNAME: String(payload.first_name ?? ""), LNAME: String(payload.last_name ?? "") },
        }),
      });
      const mcBody = await res.json();
      const ok = res.ok || mcBody.title === "Member Exists";
      return new Response(JSON.stringify(ok ? { success: true } : { error: mcBody.detail }), {
        status: ok ? 200 : 400,
        headers: { "content-type": "application/json" },
      });
    }

    // postmark / sendgrid: mirror the Next.js example's bodies above.

    return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server proxy error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

const formatFieldList = (payload: Record<string, unknown>): string =>
  Object.entries(payload ?? {})
    .filter(([, value]) => value !== "" && value != null)
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join("\n");
```

Astro needs the endpoint at the built site's origin. With the spec's
`mailer.endpoint` left at the default (`/api/contact`), the client posts to
your Astro site's own `/api/contact` route — same origin, no CORS. The
`custom` + `target` path behaves identically (it defaults to `/api/contact`
too), so moving a form from a direct adapter to a proxied one is a spec-only
change: set `provider: "custom"` and add `target`.

---

## Environment variables

All examples read secrets only server-side:

| Target | Variables |
| --- | --- |
| Guardrail | `ALLOWED_FORM_IDS` |
| Contact Form 7 (WordPress) | `CF7_BACKEND_URL` |
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