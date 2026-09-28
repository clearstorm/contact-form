/**
 * Generic JSON/FormData transport — POSTs the canonical spec-field payload
 * (trimmed) to any endpoint. Use it for Formspree-style endpoints, your own
 * API, or a serverless mail-delivery worker (the client posts here; the
 * worker runs the email adapter). A 2xx response counts as success; on
 * failure any `message`/`error` field in the (JSON) body is surfaced.
 *
 * When the config carries an explicit `target` (see `MailTarget` in
 * `src/core.ts`), the transport becomes proxy-dispatch mode: it POSTs the
 * same JSON envelope the proxy-only adapters use —
 * `{ provider: target, formId, to, payload }` where `payload` is the
 * canonical data as a JSON object — to the consumer's `/api/contact` endpoint
 * (default, same origin). The proxy owns the provider hand-off, so the
 * browser never sees a provider URL or key. Absent `target`, the transport
 * posts the plain canonical payload exactly as before.
 */
import { canonicalData, canonicalObject } from "../core";
import type { Mailer, MailerResult } from "./index";

export const jsonMailer: Mailer = {
  name: "json",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const endpoint = config.endpoint ?? (config.target ? "/api/contact" : undefined);
    if (!endpoint) {
      return {
        ok: false,
        message: config.copy?.configError ?? "Form configuration error: the submit endpoint is not configured.",
      };
    }

    const response = config.target
      ? await fetch(endpoint, {
          method: config.method ?? "POST",
          headers: { "content-type": "application/json", ...(config.headers ?? {}) },
          body: JSON.stringify({
            provider: config.target,
            formId: config.formId,
            to: config.to,
            payload: canonicalObject(data, fields),
          }),
        })
      : await fetch(endpoint, {
          method: config.method ?? "POST",
          headers: config.headers,
          body: canonicalData(data, fields),
        });

    if (response.ok) return { ok: true, message: "" };

    let message = "";
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        message = [record.message, record.error]
          .filter((value): value is string => typeof value === "string")
          .join(" ");
      }
    } catch {
      /* non-JSON body */
    }

    return {
      ok: false,
      message:
        message ||
        (config.copy?.submitError ?? `Submission failed (HTTP ${response.status}). Please try again.`).replace(
          "{status}",
          String(response.status),
        ),
    };
  },
};