/**
 * Transport adapters for the contact form solution.
 *
 * A mailer turns collected + validated form data into a submission. The
 * component picks one per form via `form.mailer` ("cf7" is the default,
 * "json" covers generic endpoints). Each mailer returns a plain
 * `{ ok, message }` result, so the component never needs to know the
 * backend's wire protocol.
 */
import type { FieldSpec } from "../core";
import { cf7Mailer } from "./cf7";
import { jsonMailer } from "./json";

export interface MailerResult {
  ok: boolean;
  /** Human-readable error to show the visitor when ok is false. */
  message: string;
}

export interface MailerConfig {
  /** Generic endpoint for the "json" mailer (e.g. Formspree-style or a mail-delivery worker). */
  endpoint?: string;
  /** CF7: site API base URL. */
  apiUrl?: string;
  /** CF7: WordPress Contact Form 7 form id. */
  formId?: string;
}

export interface MailerContext {
  /** The raw collected form data. */
  data: FormData;
  /** The client-side field spec (from data-rules). */
  fields: FieldSpec[];
  config: MailerConfig;
}

export interface Mailer {
  name: "cf7" | "json";
  submit(context: MailerContext): Promise<MailerResult>;
}

const mailers: Record<string, Mailer> = {
  cf7: cf7Mailer,
  json: jsonMailer,
};

/** Resolve a mailer by spec name; unknown names fall back to CF7. */
export function getMailer(name?: string): Mailer {
  return mailers[name ?? "cf7"] ?? cf7Mailer;
}

export { cf7Mailer, jsonMailer };