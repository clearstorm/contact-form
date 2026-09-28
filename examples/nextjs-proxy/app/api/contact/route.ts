/**
 * Generic multi-provider transport proxy (Next.js App Router route handler).
 *
 * Receives the `{ provider, formId, to, payload }` envelope the client sends
 * for the `custom` + `target` transport and for the proxy-only mailers
 * (`resend` / `postmark` / `sendgrid`) and forwards it to the matching backend
 * using server-side credentials — raw `fetch` only, zero package dependencies.
 * Private backends can be added with extra `case`s without the browser ever
 * learning their identity or URL.
 *
 * Contract: 400 missing `provider`/`formId`, unknown provider, or backend
 * rejection; 403 `formId` not in `ALLOWED_FORM_IDS`; 500 server
 * misconfiguration; success is always `{ success: true }` and failure always
 * `{ error }` with a status. Read the fixture `.env.example` for the
 * variables each case expects.
 *
 * Exports: `POST` route handler. `runtime: "nodejs"` + `dynamic:
 * "force-dynamic"` keep it on-demand (App Router hybrids: static pages
 * alongside a per-request API route) — `btoa` keeps the Mailchimp case
 * edge-runtime-compatible too.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // or "edge" — fetch + btoa work on both
export const dynamic = "force-dynamic"; // never pre-generated at build time

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
            // btoa (not Buffer) so this case also runs on edge runtimes.
            Authorization: `Basic ${btoa(`anystring:${apiKey}`)}`,
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