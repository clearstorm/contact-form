/**
 * Proxy-only transports — the client shape for `resend` / `postmark` /
 * `sendgrid`.
 *
 * These providers need a server-side secret (API key) that must never run in
 * the browser, so the client's job ends at the consumer's proxy: it POSTs a
 * small JSON envelope — `{ provider, formId, to, payload }` where `payload`
 * is the canonical form data as a JSON object — to `config.endpoint`
 * (default `/api/contact`, same origin). The proxy worker (see
 * `docs/transport-proxies.md`) reads the `provider` tag, forwards to the
 * provider's REST API with its `Bearer` key from the environment and returns
 * a 2xx/JSON-error contract. The provider id is carried in the envelope so a
 * single proxy route can fan out.
 */
import { canonicalObject } from "../core";
import { configErrorMessage, errorMessage, type Mailer, type MailerResult } from "./index";

export function proxyMailer(provider: "resend" | "postmark" | "sendgrid"): Mailer {
  return {
    name: provider,
    async submit({ data, fields, config }): Promise<MailerResult> {
      const endpoint = config.endpoint ?? "/api/contact";

      const response = await fetch(endpoint, {
        method: config.method ?? "POST",
        headers: { "content-type": "application/json", ...(config.headers ?? {}) },
        body: JSON.stringify({
          provider,
          formId: config.formId,
          to: config.to,
          payload: canonicalObject(data, fields),
        }),
      });

      if (response.ok) return { ok: true, message: "" };
      return {
        ok: false,
        message: response.status === 404
          ? configErrorMessage(config.copy, `no proxy at ${endpoint} — add an /api/contact route.`)
          : await errorMessage(response, config.copy),
      };
    },
  };
}