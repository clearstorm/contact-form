/**
 * Reusable contact-form engine (framework-agnostic).
 *
 * This module is the core of the contact form solution shared across
 * projects: the JSON field spec, validation rules, time normalisation and
 * payload normalisation. It has no framework or component dependencies of
 * its own (FormData works in browsers and Node ≥ 18), so it can also be
 * reused server-side — e.g. by a mail-delivery worker (see the mailers).
 *
 * Versioned here is behaviour, not copy: every visitor-facing string can be
 * overridden by the consumer via `FormSpec.copy` (form-level) or
 * `FormFieldSpec.message` (per field). The strings baked into this module
 * are only defaults.
 */

/* ---- Field / form spec (the JSON "source of truth") ---- */

/** Input types the form solution can render and validate. */
export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "password"
  | "search"
  | "number"
  | "date"
  | "time"
  | "datetime-local"
  | "month"
  | "week"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "hidden"
  | "range"
  | "color";

/**
 * Field/description width as a percentage of the 12-column form row. Every
 * value maps to its nearest column span (see `gridSpan`) — no per-size CSS
 * required. `66` is a legacy alias of `67` (both round to 8 columns).
 */
export type FieldSize = 100 | 90 | 80 | 75 | 70 | 67 | 66 | 60 | 50 | 40 | 33 | 30 | 25 | 20 | 10;

/**
 * Map a percentage width onto the 12-column grid as its nearest span
 * (clamped 1..12). `undefined` defaults to 50% → 6 columns; this is the one
 * mapping the components use, so any FieldSize renders without extra CSS.
 */
export function gridSpan(size?: number): number {
  if (size === undefined) return 6;
  return Math.min(12, Math.max(1, Math.round((size / 100) * 12)));
}

/** Transport adapters shipped with the form solution. */
export type MailerName = "cf7" | "json";

/**
 * Visitor-facing copy for a form. Every key is optional — when absent the
 * package's built-in default is used. Overrides win per field in this order:
 * `FormFieldSpec.message` → `FormCopy[key]` → built-in default.
 */
export interface FormCopy {
  /** Generic empty-required message (fallback for any field type). */
  required?: string;
  /** First/last name default (overrides both name messages). */
  name?: string;
  email?: string;
  tel?: string;
  url?: string;
  number?: string;
  /** Range fields (also covers out-of-bounds messages). */
  range?: string;
  /** Colour fields. */
  color?: string;
  textarea?: string;
  /** Checkbox/radio groups that must be selected. */
  checkbox?: string;
  /** Submit button label while the request is in flight. */
  sending?: string;
  /** Generic submission failure shown to the visitor. */
  error?: string;
  /** Mailer says the form failed validation but gave no per-field details. */
  invalidForm?: string;
  /** The form is missing its endpoint configuration. */
  configError?: string;
  /** HTTP-error fallback; `{status}` is replaced with the response status. */
  submitError?: string;
}

/* ---- Conditional fields (showWhen) ---- */

/**
 * Conditions that decide whether a field is shown, evaluated client-side from
 * the visitor's current input. Available operators:
 *
 * - `equals` / `notEquals` — the controlling field currently has / doesn't have
 *   exactly this value (text, select, radio).
 * - `in` / `notIn` — the controlling field's current value(s) overlap / don't
 *   overlap the given list.
 * - `includes` — a checkbox group includes the given value(s); an array means
 *   "all of these".
 * - `filled` / `empty` — the controlling field has / has no trimmed non-empty
 *   value.
 *
 * A field whose `showWhen` is an *array* of conditions is shown only when every
 * condition holds (AND). Unknown operators never match (the field stays
 * hidden) — the component logs one warning at wiring time.
 */
export type VisibilityOperator =
  | "equals"
  | "notEquals"
  | "in"
  | "notIn"
  | "includes"
  | "filled"
  | "empty";

export interface VisibilityCondition {
  /** Name of the controlling field whose value drives this condition. */
  field: string;
  operator: VisibilityOperator;
  /** Required by `equals`/`notEquals`/`in`/`notIn`/`includes`; ignored by `filled`/`empty`. */
  value?: string | string[];
}

/** Single condition, or an array of conditions joined with AND. */
export type VisibilityRule = VisibilityCondition | VisibilityCondition[];

export interface FormFieldSpec {
  type?: FieldType;
  id: string;
  name: string;
  label: string;
  autocomplete?: string;
  required?: boolean;
  optional?: boolean;
  rows?: number;
  /** Select options, or the choices of a checkbox/radio group. */
  options?: string[];
  /** Width of the field within the row (defaults to 50). */
  size?: FieldSize;
  /** Per-field validation message override (used for required and invalid). */
  message?: string;
  /** Show this field only while the condition(s) hold (conditional fields). */
  showWhen?: VisibilityRule;
  /** Input passthrough attributes. */
  placeholder?: string;
  /** Static value (hidden fields, pre-filled inputs). */
  value?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  maxlength?: number;
  pattern?: string;
}

/* ---- Structural elements (heading, description, divider, section) ---- */

/**
 * Non-field elements that shape a form's layout. They render static markup
 * only: they carry no `name`/`id`, are dropped from the client field spec
 * during serialisation (see `toFieldSpecs`), and so never validate, never
 * reach the shared client script, and never appear in the payload.
 */
export interface HeadingSpec {
  type: "heading";
  text: string;
  /** Horizontal alignment (defaults to "left"). */
  align?: "left" | "center";
}

export interface DescriptionSpec {
  type: "description";
  text: string;
  /** Width within the row — the same FieldSize as fields (defaults to 100). */
  size?: FieldSize;
}

export interface DividerSpec {
  type: "divider";
  /** False renders an invisible spacer (vertical rhythm control) instead of a rule. */
  visible?: boolean;
  /** Spacer height as a CSS length — only applies when `visible` is false. */
  min?: string;
}

export interface SectionSpec {
  type: "section";
  /** Optional label rendered centered on the section rule. */
  label?: string;
}

export type DecorSpec = HeadingSpec | DescriptionSpec | DividerSpec | SectionSpec;

/** A field or a structural element — the members of `FormSpec.fields`. */
export type FormElement = FormFieldSpec | DecorSpec;

/**
 * True when a fields-array entry is a real field rather than a structural
 * element. Every field carries a `name`; structural elements
 * (`heading`, `description`, `divider`, `section`) never do — that single
 * check is the discriminator used everywhere a field is required
 * (serialisation, rules, payload).
 */
export function isFieldSpec(element: FormElement): element is FormFieldSpec {
  return typeof (element as FormFieldSpec).name === "string";
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
  /** CF7-specific endpoint config (alternative to passing props at render). */
  cf7?: { apiUrl?: string; formId?: string };
  /** Visitor-facing copy overrides for this form. */
  copy?: FormCopy;
  /**
   * The ordered layout of the form: real fields plus (optionally) structural
   * elements — `heading`, `description`, `divider`, `section`.
   */
  fields: FormElement[];
}

/** Client-side serialisation of a field, carried on the form as data-rules. */
export interface FieldSpec {
  name: string;
  type?: string;
  required?: boolean;
  label?: string;
  /** Per-field validation message override. */
  message?: string;
  min?: number | string;
  max?: number | string;
  /**
   * Conditional fields: the normalized (always-array) showWhen conditions.
   * Absent on unconditional fields.
   */
  visibility?: VisibilityCondition[];
  /**
   * Names of the fields whose values the visibility conditions read — the
   * client listens to these to re-evaluate. Absent on unconditional fields.
   */
  dependsOn?: string[];
}

/** The client-side field spec (validation + mailers) for a form's fields. */
export function toFieldSpecs(fields: FormElement[]): FieldSpec[] {
  // Structural elements are render-time only — they never reach the client.
  return fields.filter(isFieldSpec).map((field) => {
    const visibility = field.showWhen
      ? (Array.isArray(field.showWhen) ? field.showWhen : [field.showWhen])
      : undefined;
    return {
      name: field.name,
      type: field.type ?? "text",
      required: Boolean(field.required),
      label: field.label,
      message: field.message,
      min: field.min,
      max: field.max,
      ...(visibility && visibility.length > 0
        ? {
            visibility,
            dependsOn: [...new Set(visibility.map((c) => c.field))],
          }
        : {}),
    };
  });
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

/* ---- Conditional visibility evaluation ---- */

/** Normalise a condition's `value` into a list of option strings (for `in`/`in`-family operators). */
const valueList = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
};

/**
 * Evaluate a field's showWhen conditions against the caller-supplied current
 * values (`values[name]` = trimmed, non-empty values of the controls named
 * `name`; checkbox/radio groups contribute only their checked values). An
 * array of conditions requires every one to hold (AND). Unknown operators and
 * conditions with no usable value never match — the field stays hidden.
 */
export function evaluateVisibility(
  conditions: VisibilityCondition[],
  values: Record<string, string[]>,
): boolean {
  for (const condition of conditions) {
    const field = values[condition.field] ?? [];
    const list = valueList(condition.value);
    switch (condition.operator) {
      case "equals":
        if (list.length !== 1 || field.length !== 1 || field[0] !== list[0]) return false;
        break;
      case "notEquals":
        if (list.length === 1 && field.length === 1 && field[0] === list[0]) return false;
        break;
      case "in":
        if (list.length === 0 || !field.some((v) => list.includes(v))) return false;
        break;
      case "notIn":
        if (list.length !== 0 && field.some((v) => list.includes(v))) return false;
        break;
      case "includes":
        if (list.length === 0 || !list.every((v) => field.includes(v))) return false;
        break;
      case "filled":
        if (field.length === 0) return false;
        break;
      case "empty":
        if (field.length !== 0) return false;
        break;
      default:
        return false; // unknown operator — fail safe to hidden
    }
  }
  return true;
}

/**
 * Names of the fields that should be in scope right now: every unconditional
 * field plus every conditional field whose conditions currently hold. Binary
 * fields (type "hidden") are excluded from validation but still visible — they
 * are plain spec members, so they stay included.
 */
export function visibleNames(
  fields: FieldSpec[],
  values: Record<string, string[]>,
): Set<string> {
  const visible = new Set<string>();
  for (const field of fields) {
    if (!field.visibility?.length || evaluateVisibility(field.visibility, values)) {
      visible.add(field.name);
    }
  }
  return visible;
}

/* ---- Validation ---- */

export interface Rule {
  required?: boolean;
  test: (value: string) => boolean;
  message: string;
}

const NAME_RE = /^[\p{L}\s''-]{2,}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,15}$/;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Build the per-field validation rules from a field spec. Required-ness comes
 * from the JSON spec; the format tests are shared code keyed by field type;
 * every message resolves `field.message` → `copy[key]` → default.
 */
export function buildRules(fields: FieldSpec[], copy: FormCopy = {}): Record<string, Rule> {
  const rules: Record<string, Rule> = {};
  const messageFor = (field: FieldSpec, key: keyof FormCopy, fallback: string): string =>
    field.message ?? copy[key] ?? fallback;

  for (const field of fields) {
    const required = Boolean(field.required);
    const name = field.name;
    // Hidden fields receive no user input — never validate them.
    if (field.type === "hidden") continue;
    if (name === "first_name" || name === "last_name") {
      rules[name] = {
        required,
        test: (value) => NAME_RE.test(value),
        message: messageFor(
          field,
          "name",
          name === "first_name"
            ? "Enter your first name (2+ characters)."
            : "Enter your last name (2+ characters).",
        ),
      };
      continue;
    }
    switch (field.type) {
      case "email":
        rules[name] = {
          required,
          test: (value) => EMAIL_RE.test(value),
          message: messageFor(field, "email", "Enter a valid email address."),
        };
        break;
      case "tel":
        rules[name] = {
          required,
          test: (value) => PHONE_RE.test(value),
          message: messageFor(field, "tel", "Enter a valid phone number."),
        };
        break;
      case "url":
        rules[name] = {
          required,
          test: (value) => URL_RE.test(value),
          message: messageFor(field, "url", "Enter a valid URL."),
        };
        break;
      case "number":
      case "range":
        rules[name] = {
          required,
          test: (value) => {
            if (!NUMBER_RE.test(value)) return false;
            const n = Number(value);
            const min = field.min !== undefined ? Number(field.min) : field.type === "range" ? 0 : undefined;
            const max = field.max !== undefined ? Number(field.max) : field.type === "range" ? 100 : undefined;
            if (min !== undefined && n < min) return false;
            if (max !== undefined && n > max) return false;
            return true;
          },
          message: messageFor(
            field,
            field.type === "range" ? "range" : "number",
            field.type === "range" ? "Choose a value within the range." : "Enter a valid number.",
          ),
        };
        break;
      case "color":
        rules[name] = {
          required,
          test: (value) => COLOR_RE.test(value),
          message: messageFor(field, "color", "Enter a valid colour."),
        };
        break;
      case "checkbox":
      case "radio":
        // The component aggregates selection state into "1" / "" for the rule.
        rules[name] = {
          required,
          test: (value) => value === "1",
          message: messageFor(field, "checkbox", "Please select this option."),
        };
        break;
      case "textarea":
        rules[name] = {
          required,
          test: (value) => value.length >= 10,
          message: messageFor(field, "textarea", "Message must be at least 10 characters."),
        };
        break;
      default:
        rules[name] = {
          required,
          test: () => true,
          message: messageFor(field, "required", "Please fill this in."),
        };
    }
  }
  return rules;
}

/**
 * Validate one value against a rule. The value should already represent the
 * field's current state (checkbox/radio groups are collapsed to "1" / "" by
 * the component before calling this). Returns the message to show, or null
 * when the value passes.
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
 * spec (e.g. a honeypot) are never forwarded. Multi-value fields (checkbox
 * groups) are joined into a single comma-separated value.
 */
export function canonicalData(data: FormData, fields: FieldSpec[]): FormData {
  const payload = new FormData();
  for (const field of fields) {
    const values = data
      .getAll(field.name)
      .map((value) => String(value).trim())
      .filter(Boolean);
    payload.set(field.name, values.length > 1 ? values.join(", ") : (values[0] ?? ""));
  }
  return payload;
}