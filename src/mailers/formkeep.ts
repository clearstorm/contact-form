/**
 * FormKeep transport — a direct public adapter.
 *
 * POSTs the canonical payload to `https://formkeep.com/f/{formId}` (or an
 * explicit `endpoint`) as multipart form data. FormKeep's submission
 * endpoints are public by design (the `a-`/`f-` slugs live on the page), so
 * no secret belongs here. A 2xx response counts as success.
 */
import { canonicalData } from "../core";
import { configErrorMessage, errorMessage, type Mailer, type MailerResult } from "./index";

export const formkeepMailer: Mailer = {
  name: "formkeep",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const formId = (config.formId ?? "").trim();
    if (!config.endpoint && !formId) {
      return {
        ok: false,
        message: configErrorMessage(config.copy, "FormKeep needs a form id (or an endpoint)."),
      };
    }
    const endpoint = config.endpoint ?? `https://formkeep.com/f/${formId}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: canonicalData(data, fields),
    });

    if (response.ok) return { ok: true, message: "" };
    return { ok: false, message: await errorMessage(response, config.copy) };
  },
};