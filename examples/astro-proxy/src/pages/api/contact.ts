/**
 * Generic multi-provider transport proxy (Astro hybrid API route).
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
 * Exports: `POST` (`APIRoute`), `prerender = false` (on-demand under
 * `output: "hybrid"`).
 *
 * Env access: Astro surfaces `.env` files through `import.meta.env` — it never
 * writes them into `process.env`. The zero-dependency verify harness imports
 * this module under plain Node (no `import.meta.env`), so fall back to
 * `process.env` there. `environment` is a live reference to whichever object
 * the runtime provides.
 */
import type { APIRoute } from "astro";

// Astro reads `.env` via `import.meta.env` (checks the server environment
// first, then `.env` files). Plain Node — the verify harness's case — has no
// `import.meta.env`, so fall back to `process.env` (which the harness stubs).
const environment: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ??
  process.env;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { provider, formId, to, payload } = await request.json();

    // 1. Validation — both identifiers are required in the envelope.
    if (!provider || !formId) {
      return json({ error: "Missing required 'provider' or 'formId'" }, 400);
    }

    // 2. Optional form-id whitelist guardrail → 403.
    const allowedIds = environment.ALLOWED_FORM_IDS;
    if (allowedIds) {
      const allowed = allowedIds.split(",").map((id) => id.trim());
      if (!allowed.includes(formId)) {
        return json({ error: `Unauthorized formId: ${formId}` }, 403);
      }
    }

    // 3. Generic provider dispatch — add a `case` per `MailTarget` you host.
    switch (provider) {
      case "cf7": {
        const backendUrl = environment.CF7_BACKEND_URL;
        if (!backendUrl) {
          return json(
            { error: "Server misconfiguration: CF7_BACKEND_URL missing" },
            500,
          );
        }
        const wpFormData = new FormData();
        for (const [key, value] of Object.entries(payload ?? {}))
          wpFormData.append(key, String(value));
        wpFormData.append("_wpcf7_unit_tag", `wpcf7-f${formId}-o1`);

        const wpRes = await fetch(
          `${backendUrl}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`,
          { method: "POST", body: wpFormData },
        );
        const wpBody = (await wpRes.json()) as {
          status?: string;
          message?: string;
        };
        if (wpBody.status !== "mail_sent") {
          return json(
            { error: wpBody.message || "Submission rejected by WordPress" },
            400,
          );
        }
        return json({ success: true, message: wpBody.message });
      }

      case "resend": {
        const apiKey = environment.RESEND_API_KEY;
        const recipient = to ?? environment.RESEND_TO_EMAIL;
        if (!apiKey || !recipient) {
          return json(
            {
              error:
                "Server misconfiguration: RESEND_API_KEY/RESEND_TO_EMAIL missing",
            },
            500,
          );
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Contact form <onboarding@resend.dev>",
            to: [recipient],
            subject: `New submission for form ${formId}`,
            text: `Form: ${formId}\n\n${formatFieldList(payload)}`,
            reply_to: String(payload?.email ?? ""),
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, res.status);
        return json({ success: true });
      }

      case "postmark": {
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "X-Postmark-Server-Token": environment.POSTMARK_SERVER_TOKEN ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            From: "contact@yoursite.com",
            To: to ?? environment.POSTMARK_TO_EMAIL ?? "you@example.com",
            Subject: `New submission for form ${formId}`,
            TextBody: formatFieldList(payload),
            ReplyTo: String(payload?.email ?? ""),
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, res.status);
        return json({ success: true });
      }

      case "sendgrid": {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${environment.SENDGRID_API_KEY ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [
              {
                to: [{ email: to ?? "you@example.com" }],
                subject: `New submission for form ${formId}`,
              },
            ],
            from: { email: "contact@yoursite.com" },
            content: [{ type: "text/plain", value: formatFieldList(payload) }],
            reply_to: { email: String(payload?.email ?? "") },
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, res.status);
        return json({ success: true });
      }

      case "fluentforms": {
        const backendUrl = environment.FLUENT_FORMS_BACKEND_URL;
        if (!backendUrl) {
          return json(
            {
              error:
                "Server misconfiguration: FLUENT_FORMS_BACKEND_URL missing",
            },
            500,
          );
        }
        // Public submit endpoint Fluent Forms' own JS posts to: FormData with
        // `form_id` + the field names. Response shape differs across versions,
        // so treat 2xx plus a non-failure body as success.
        const ffFormData = new FormData();
        for (const [key, value] of Object.entries(payload ?? {}))
          ffFormData.append(key, String(value));
        ffFormData.append("form_id", formId);

        const ffRes = await fetch(
          `${backendUrl}/wp-json/fluentform/v1/form-submit`,
          {
            method: "POST",
            body: ffFormData,
          },
        );
        const ffBody = (await ffRes.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          data?: { result?: { success?: boolean } };
        };
        const rejected =
          !ffRes.ok ||
          ffBody.success === false ||
          ffBody.data?.result?.success === false;
        if (rejected) {
          return json(
            {
              error:
                ffBody.message ||
                `Fluent Forms rejected the submission (HTTP ${ffRes.status})`,
            },
            400,
          );
        }
        return json({ success: true, message: ffBody.message });
      }

      case "mailchimp": {
        const apiKey = environment.MAILCHIMP_API_KEY;
        const audienceId = environment.MAILCHIMP_AUDIENCE_ID;
        const serverPrefix = environment.MAILCHIMP_SERVER_PREFIX;
        if (!apiKey || !audienceId || !serverPrefix) {
          return json(
            { error: "Server misconfiguration: MAILCHIMP_* missing" },
            500,
          );
        }
        const email = String(payload?.email ?? "");
        if (!email)
          return json({ error: "A valid email address is required" }, 400);
        const res = await fetch(
          `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members`,
          {
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
                FNAME: String(payload?.first_name ?? ""),
                LNAME: String(payload?.last_name ?? ""),
              },
            }),
          },
        );
        const mcBody = (await res.json()) as {
          title?: string;
          detail?: string;
        };
        if (res.ok || mcBody.title === "Member Exists")
          return json({ success: true });
        return json(
          { error: mcBody.detail || "Mailchimp subscription failed" },
          400,
        );
      }

      default:
        return json({ error: `Unsupported provider: ${provider}` }, 400);
    }
  } catch {
    return json({ error: "Internal server proxy error" }, 500);
  }
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const formatFieldList = (payload: Record<string, unknown>): string =>
  Object.entries(payload ?? {})
    .filter(([, value]) => value !== "" && value != null)
    .map(([name, value]) => `${label(name)}: ${String(value)}`)
    .join("\n");

const label = (name: string) =>
  name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
