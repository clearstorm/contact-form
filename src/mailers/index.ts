/**
 * Transport adapters for the contact form solution.
 *
 * A mailer turns collected + validated form data into a submission. The
 * component picks one per form via `FormSpec.mailer` (a `MailerSpec`:
 * provider shorthand or a `MailerConfig` object; "cf7" is the default, the
 * generic `"custom"` / legacy `"json"` transport covers arbitrary endpoints).
 * Each mailer returns a plain `{ ok, message }` result, so the component never
 * needs to know the backend's wire protocol.
 *
 * Providers split into two tiers:
 * - **direct** — the client talks to the provider's public endpoint with only
 *   client-safe config (`cf7`, `wpforms`, `formspree`, `formkeep`, `getform`,
 *   `custom`/`json`).
 * - **proxy-only** — `resend`, `postmark`, `sendgrid` POST provider-shaped
 *   JSON to the consumer's `/api/contact` endpoint (see
 *   `docs/transport-proxies.md`); master keys never appear in the browser.
 */
import type { FieldSpec, FormCopy, MailerProvider, MailerSpec, MailTarget } from "../core";
import { cf7Mailer } from "./cf7";
import { jsonMailer } from "./json";
import { wpformsMailer } from "./wpforms";
import { formspreeMailer } from "./formspree";
import { formkeepMailer } from "./formkeep";
import { getformMailer } from "./getform";
import { proxyMailer } from "./proxy";

export interface MailerResult {
  ok: boolean;
  /** Human-readable error to show the visitor when ok is false. */
  message: string;
}

/** The resolved, client-safe transport config handed to a mailer on submit. */
export interface MailerConfig {
  /** Resolved transport id (the `data-mailer` value; "json" stays a legacy alias of "custom"). */
  provider?: MailerProvider | "json";
  /** Generic endpoint / site base the adapter posts to. */
  endpoint?: string;
  /** CF7: site API base URL. */
  apiUrl?: string;
  /** Provider form reference (CF7/WPForms form id, Formspree/FormKeep/Getform slug…). */
  formId?: string;
  /** HTTP method for the generic transport (defaults to "POST"). */
  method?: "POST" | "PUT";
  /** Extra request headers (client-safe only — never Authorization / Cookie). */
  headers?: Record<string, string>;
  /** Public form-access token (Formspree-style). */
  formToken?: string;
  /** Optional recipient hint forwarded to a proxy mail-delivery worker. */
  to?: string;
  /**
   * Explicit server-side dispatch target for the generic `custom` transport —
   * the proxy's `provider` tag. When set, the transport sends the JSON proxy
   * envelope `{ provider: target, formId, to, payload }`; absent, it posts the
   * plain canonical payload (see `MailTarget` in `src/core.ts`).
   */
  target?: MailTarget;
  /**
   * Copy overrides threaded through from the form spec — the mailers fall
   * back to these for their visitor-facing messages before built-in defaults.
   */
  copy?: FormCopy;
}

export interface MailerContext {
  /** The raw collected form data. */
  data: FormData;
  /** The client-side field spec (from data-rules). */
  fields: FieldSpec[];
  config: MailerConfig;
}

export interface Mailer {
  name: MailerProvider | "json";
  submit(context: MailerContext): Promise<MailerResult>;
}

const mailers: Record<string, Mailer> = {
  cf7: cf7Mailer,
  json: jsonMailer,
  custom: jsonMailer,
  wpforms: wpformsMailer,
  formspree: formspreeMailer,
  formkeep: formkeepMailer,
  getform: getformMailer,
  resend: proxyMailer("resend"),
  postmark: proxyMailer("postmark"),
  sendgrid: proxyMailer("sendgrid"),
};

/** Resolve a mailer by transport id; unknown names fall back to CF7. */
export function getMailer(name?: string): Mailer {
  return mailers[name ?? "cf7"] ?? cf7Mailer;
}

/**
 * Normalise a `MailerSpec` to its transport id (the `data-mailer` value):
 * a shorthand string passes through ("json" stays "json"), a config object
 * yields its `provider`. `undefined` → `undefined` (callers default to "cf7").
 */
export function mailerSpecName(spec: MailerSpec | undefined): string | undefined {
  if (typeof spec === "string") return spec;
  if (spec && typeof spec === "object") return spec.provider;
  return undefined;
}

/** The default `configError` copy used when a mailer is missing its endpoint config. */
export function configErrorMessage(copy: FormCopy | undefined, detail: string): string {
  return copy?.configError ?? `Form configuration error: ${detail}`;
}

/**
 * Surface a provider's failure message from a (JSON) response body — the
 * `message` / `error` fields first, then the `submitError` copy with the
 * `{status}` token, then a built-in fallback.
 */
export async function errorMessage(response: Response, copy: FormCopy | undefined): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const message = [record.message, record.error]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
      if (message) return message;
    }
  } catch {
    /* non-JSON body */
  }
  return (copy?.submitError ?? "Submission failed (HTTP {status}). Please try again.").replace(
    "{status}",
    String(response.status),
  );
}

export { cf7Mailer, jsonMailer, wpformsMailer, formspreeMailer, formkeepMailer, getformMailer, proxyMailer };