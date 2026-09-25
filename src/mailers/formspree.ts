/**
 * Formspree transport — a direct public adapter.
 *
 * POSTs the canonical payload to `https://formspree.io/f/{formId}` (or an
 * explicit `endpoint`) with `Accept: application/json` so the response comes
 * back machine-readable. The `formId` is your Formspree form slug; a public
 * `formToken` can be sent as `_replyto`-style metadata when the form needs
 * it. A 2xx response counts as success; Formspree's `errors` array is
 * surfaced on failure.
 */
import { canonicalData } from "../core";
import { configErrorMessage, type Mailer, type MailerResult } from "./index";

export const formspreeMailer: Mailer = {
  name: "formspree",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const formId = (config.formId ?? "").trim();
    if (!config.endpoint && !formId) {
      return {
        ok: false,
        message: configErrorMessage(config.copy, "Formspree needs a form id (or an endpoint)."),
      };
    }
    const endpoint = config.endpoint ?? `https://formspree.io/f/${formId}`;

    const payload = canonicalData(data, fields);
    if (config.formToken) payload.set("_replyto", config.formToken);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: payload,
    });

    if (response.ok) return { ok: true, message: "" };

    let message = "";
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        const errors = Array.isArray(record.errors)
          ? (record.errors as Array<{ message?: string }>)
              .map((error) => error.message)
              .filter(Boolean)
              .join(" ")
          : "";
        message =
          errors || [record.message, record.error]
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
        (config.copy?.submitError ?? "Submission failed (HTTP {status}). Please try again.").replace(
          "{status}",
          String(response.status),
        ),
    };
  },
};