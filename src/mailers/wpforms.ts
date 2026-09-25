/**
 * WPForms transport — a direct public adapter for the WordPress WPForms
 * plugin.
 *
 * POSTs the canonical payload to the WPForms REST submit route
 * (`/wp-json/wpforms/v1/forms/{formId}/submit`, the public endpoint the
 * front-end uses) with the provider's book-keeping fields (`form_id`,
 * `page_url`, `page_id`). Configuration is client-safe only: the site
 * `endpoint` (or the legacy `apiUrl`) + the form id. No secret keys are sent
 * — WPForms REST submissions are anonymous, visitor-driven posts.
 */
import { canonicalData } from "../core";
import { configErrorMessage, errorMessage, type Mailer, type MailerResult } from "./index";

export const wpformsMailer: Mailer = {
  name: "wpforms",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const site = (config.endpoint ?? config.apiUrl ?? "").replace(/\/$/, "");
    const formId = config.formId ?? "";
    if (!site || !formId) {
      return {
        ok: false,
        message: configErrorMessage(config.copy, "WPForms needs a site endpoint and a form id."),
      };
    }

    const payload = canonicalData(data, fields);
    payload.set("form_id", formId);
    payload.set("page_url", typeof location !== "undefined" ? location.href : "");
    payload.set("page_id", config.formToken ?? "");

    const response = await fetch(`${site}/wp-json/wpforms/v1/forms/${formId}/submit`, {
      method: "POST",
      body: payload,
    });

    if (response.ok) return { ok: true, message: "" };
    return { ok: false, message: await errorMessage(response, config.copy) };
  },
};