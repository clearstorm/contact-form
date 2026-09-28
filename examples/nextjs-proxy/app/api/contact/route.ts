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
 * Contract: 400 missing `provider`/`formId`, unknown provider, missing
 * captcha token, or backend rejection; 403 `formId` not in
 * `ALLOWED_FORM_IDS`, or a `siteverify` rejection; 500 server
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
    const captchaToken = body.captchaToken as string | undefined;
    const captchaProvider = body.captchaProvider as string | undefined;

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

    // 2b. Anti-bot gate — a `FormSpec.captcha` block sends a challenge token
    // in the envelope; verify it against the provider's `siteverify` before
    // any backend is touched. A captcha-claiming envelope without a token is
    // itself a red flag — reject it, never dispatch uninspected.
    if (captchaProvider) {
      if (!captchaToken) {
        return NextResponse.json({ error: "Security token missing" }, { status: 400 });
      }
      const verified = await verifyCaptchaToken(captchaProvider, captchaToken, request);
      if (verified !== null) return NextResponse.json({ error: verified.error }, { status: verified.status });
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

      case "fluentforms": {
        const backendUrl = process.env.FLUENT_FORMS_BACKEND_URL;
        if (!backendUrl) {
          return NextResponse.json({ error: "Server misconfiguration: FLUENT_FORMS_BACKEND_URL missing" }, { status: 500 });
        }
        // Public submit endpoint Fluent Forms' own JS posts to: FormData with
        // `form_id` + the field names. Response shape differs across versions,
        // so treat 2xx plus a non-failure body as success.
        const ffFormData = new FormData();
        for (const [key, value] of Object.entries(payload)) ffFormData.append(key, String(value));
        ffFormData.append("form_id", formId);

        const ffRes = await fetch(`${backendUrl}/wp-json/fluentform/v1/form-submit`, {
          method: "POST",
          body: ffFormData,
        });
        const ffBody = (await ffRes.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          data?: { result?: { success?: boolean } };
        };
        const rejected = !ffRes.ok || ffBody.success === false || ffBody.data?.result?.success === false;
        if (rejected) {
          return NextResponse.json({ error: ffBody.message || `Fluent Forms rejected the submission (HTTP ${ffRes.status})` }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: ffBody.message });
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

/**
 * Run a provider's `siteverify` for a client challenge token. Returns `null`
 * on success or `{ status, error }` mapped from the failure kind: 400 unknown
 * provider, 500 missing server secret / verification unavailable, 403 the
 * provider rejected the token. `remoteip` is forwarded from
 * `x-forwarded-for` (first hop — the visitor's public IP) so the provider can
 * pin score signals; a fresh token is single-use, so replays fail verify.
 */
async function verifyCaptchaToken(
  provider: string,
  token: string,
  request: Request,
): Promise<{ status: number; error: string } | null> {
  const verifyUrl = CAPTCHA_VERIFY[provider];
  if (!verifyUrl) return { status: 400, error: `Unsupported captcha provider: ${provider}` };
  const secretKey = process.env[CAPTCHA_SECRET_ENV[provider]];
  if (!secretKey) return { status: 500, error: `Server misconfiguration: ${CAPTCHA_SECRET_ENV[provider]} missing` };
  const body = new URLSearchParams();
  body.append("secret", secretKey);
  body.append("response", token);
  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteIp) body.append("remoteip", remoteIp);
  let res: Response;
  try {
    res = await fetch(verifyUrl, { method: "POST", body });
  } catch {
    return { status: 500, error: "Captcha verification unavailable" };
  }
  const outcome = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  if (outcome.success === true) return null;
  return { status: 403, error: "Bot verification failed" };
}

/** Provider `siteverify` endpoints + the env var holding each matching secret. */
const CAPTCHA_VERIFY: Record<string, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v1/siteverify",
  "recaptcha-v3": "https://www.google.com/recaptcha/api/siteverify",
  hcaptcha: "https://hcaptcha.com/siteverify",
};
const CAPTCHA_SECRET_ENV: Record<string, string> = {
  turnstile: "TURNSTILE_SECRET_KEY",
  "recaptcha-v3": "RECAPTCHA_SECRET_KEY",
  hcaptcha: "HCAPTCHA_SECRET_KEY",
};

function formatFieldList(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, value]) => value !== "" && value != null)
    .map(([name, value]) => `${label(name)}: ${String(value)}`)
    .join("\n");
}

const label = (name: string) => name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());