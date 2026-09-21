/**
 * Reusable contact-form engine (framework-agnostic).
 *
 * This module is the core of the contact form solution shared across
 * projects: the JSON field spec, validation rules, time normalisation and
 * payload normalisation. It has no framework or component dependencies of
 * its own (FormData works in browsers and Node ≥ 18), so it can also be
 * reused server-side — e.g. by a mail-delivery worker (see the mailers).
 */

/* ---- Field / form spec (the JSON "source of truth") ---- */

export type FieldType = "text" | "email" | "tel" | "date" | "time" | "select" | "textarea";

/** Field width as a percentage of the (12-column) form row. */
export type FieldSize = 100 | 66 | 50 | 33 | 25;

/** Transport adapters shipped with the form solution. */
export type MailerName = "cf7" | "json";

export interface FormFieldSpec {
  type?: FieldType;
  id: string;
  name: string;
  label: string;
  autocomplete?: string;
  required?: boolean;
  optional?: boolean;
  rows?: number;
  options?: string[];
  /** Width of the field within the row (defaults to 50). */
  size?: FieldSize;
}

export interface FormSpec {
  /** Baked form identity (e.g. "enquiry" | "booking") — keys data-mail-form, the form id and the JS hooks. */
  name: string;
  submit: string;
  status: string;
  /**
   * Transport adapter used on submit (defaults to "cf7"). "json" posts the
   * canonical payload to `endpoint` — use it for Formspree-style endpoints,
   * your own API, or a serverless mail-delivery worker.
   */
  mailer?: MailerName;
  /** Where the form data is sent — required by the "json" mailer. */
  endpoint?: string;
  fields: FormFieldSpec[];
}

/** Client-side serialisation of a field, carried on the form as data-rules. */
export interface FieldSpec {
  name: string;
  type?: string;
  required?: boolean;
  label?: string;
}

/** The client-side field spec (validation + mailers) for a form's fields. */
export function toFieldSpecs(fields: FormFieldSpec[]): FieldSpec[] {
  return fields.map((field) => ({
    name: field.name,
    type: field.type ?? "text",
    required: Boolean(field.required),
    label: field.label,
  }));
}

/** Serialise the field spec for the data-rules attribute. */
export function serializeRules(fields: FieldSpec[]): string {
  return JSON.stringify(fields);
}

/** Parse the data-rules attribute back into a field spec. */
export function parseFieldSpec(json: string): FieldSpec[] {
  try {
    return JSON.parse(json) as FieldSpec[];
  } catch {
    return [];
  }
}

/* ---- Validation ---- */

export interface Rule {
  required?: boolean;
  test: (value: string) => boolean;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,15}$/;
const NAME_RE = /^[\p{L}\s''-]{2,}$/u;

/**
 * Build the per-field validation rules from a field spec. Required-ness comes
 * from the JSON spec; the format tests are shared code keyed by field type.
 */
export function buildRules(fields: FieldSpec[]): Record<string, Rule> {
  const rules: Record<string, Rule> = {};
  for (const field of fields) {
    const required = Boolean(field.required);
    const name = field.name;
    if (name === "first_name" || name === "last_name") {
      rules[name] = {
        required,
        test: (value) => NAME_RE.test(value),
        message:
          name === "first_name"
            ? "Enter your first name (2+ characters)."
            : "Enter your last name (2+ characters).",
      };
      continue;
    }
    switch (field.type) {
      case "email":
        rules[name] = {
          required,
          test: (value) => EMAIL_RE.test(value),
          message: "Enter a valid email address.",
        };
        break;
      case "tel":
        rules[name] = {
          required,
          test: (value) => PHONE_RE.test(value),
          message: "Enter a valid phone number.",
        };
        break;
      case "textarea":
        rules[name] = {
          required,
          test: (value) => value.length >= 10,
          message: "Message must be at least 10 characters.",
        };
        break;
      default:
        rules[name] = {
          required,
          test: () => true,
          message:
            name === "subject"
              ? "Choose a subject."
              : name === "guests"
                ? "Choose the number of guests."
                : "Please fill this in.",
        };
    }
  }
  return rules;
}

/**
 * Validate one (already-trimmed) value against a rule. Returns the message to
 * show, or null when the value passes.
 */
export function validateValue(rule: Rule | undefined, value: string): string | null {
  if (!rule) return null;
  if (rule.required && !value) return rule.message;
  if (value && !rule.test(value)) return rule.message;
  return null;
}

/* ---- Time normalisation ---- */

/**
 * Normalise a booking time to 24-hour "HH:MM" for the email. Accepts
 * 12-hour ("7:00 pm", "07:00PM") and 24-hour ("19:30") input; anything
 * unrecognised is returned unchanged so the form never blocks on format.
 */
export function parseTime(raw: string): string {
  const value = raw.trim();
  const h24 = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (h24) {
    const hour = Number(h24[1]);
    if (hour <= 23) return `${String(hour).padStart(2, "0")}:${h24[2]}`;
  }
  const h12 = /^(\d{1,2}):([0-5]\d)\s*([ap])\.?m\.?$/i.exec(value);
  if (h12) {
    const hour12 = Number(h12[1]);
    if (hour12 >= 1 && hour12 <= 12) {
      const pm = h12[3].toLowerCase() === "p";
      const hour = hour12 === 12 ? (pm ? 12 : 0) : pm ? hour12 + 12 : hour12;
      return `${String(hour).padStart(2, "0")}:${h12[2]}`;
    }
  }
  return value;
}

/* ---- Payload normalisation ---- */

/**
 * Build a FormData containing exactly the spec fields' (trimmed) values —
 * the canonical payload that transport adapters send. Fields outside the
 * spec (e.g. a honeypot) are never forwarded.
 */
export function canonicalData(data: FormData, fields: FieldSpec[]): FormData {
  const payload = new FormData();
  for (const field of fields) {
    payload.set(field.name, String(data.get(field.name) ?? "").trim());
  }
  return payload;
}