/**
 * Getform transport — a direct public adapter.
 *
 * POSTs the canonical payload (multipart) to the given `endpoint` or, when
 * only a `formId` is set, to `https://getform.io/f/{formId}`. Getform
 * submission URLs are public page-level endpoints, so the config stays
 * client-safe. A 2xx response counts as success.
 */
import { canonicalData } from "../core";
import { configErrorMessage, errorMessage, type Mailer, type MailerResult } from "./index";

export const getformMailer: Mailer = {
  name: "getform",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const formId = (config.formId ?? "").trim();
    if (!config.endpoint && !formId) {
      return {
        ok: false,
        message: configErrorMessage(config.copy, "Getform needs an endpoint (or a form id)."),
      };
    }
    const endpoint = config.endpoint ?? `https://getform.io/f/${formId}`;

    const response = await fetch(endpoint, {
      method: "POST",
      body: canonicalData(data, fields),
    });

    if (response.ok) return { ok: true, message: "" };
    return { ok: false, message: await errorMessage(response, config.copy) };
  },
};