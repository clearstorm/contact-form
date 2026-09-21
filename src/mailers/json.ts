/**
 * Generic JSON/FormData transport — POSTs the canonical spec-field payload
 * (trimmed) to any endpoint. Use it for Formspree-style endpoints, your own
 * API, or a serverless mail-delivery worker (the client posts here; the
 * worker runs the email adapter). A 2xx response counts as success; on
 * failure any `message`/`error` field in the (JSON) body is surfaced.
 */
import { canonicalData } from "../core";
import type { Mailer, MailerResult } from "./index";

export const jsonMailer: Mailer = {
  name: "json",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const endpoint = config.endpoint;
    if (!endpoint) {
      return {
        ok: false,
        message: config.copy?.configError ?? "Form configuration error: the submit endpoint is not configured.",
      };
    }

    const payload = canonicalData(data, fields);
    const response = await fetch(endpoint, { method: "POST", body: payload });

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