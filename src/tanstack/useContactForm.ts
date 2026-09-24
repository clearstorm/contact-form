/**
 * Opt-in TanStack Form bridge for @clearstorm/contact-form.
 *
 * TanStack Form owns the inputs (controlled values, its own error map and
 * submission lifecycle); this bridge maps the package's core rules into
 * TanStack field validators and sends submissions through the package's
 * mailers, so validation copy, canonical payloads and transport stay the
 * same as the engine-driven bindings (Astro shell, React adapter, vanilla
 * `renderForm`).
 *
 * ```tsx
 * import { useForm } from "@tanstack/react-form";
 * import { useContactForm } from "@clearstorm/contact-form/tanstack";
 *
 * const bridge = useContactForm(spec);          // validators, initialValues…
 * const form = useForm({
 *   defaultValues: bridge.initialValues,
 *   onSubmit: async ({ value }) => {            // mailer via the bridge
 *     const result = await bridge.submit(value);
 *     if (!result.ok) setStatus(result.message); else setStatus("Sent!");
 *   },
 * });
 *
 * // per field:
 * // <form.Field name="email" validators={{ onChange: bridge.validators.email }} … />
 * ```
 *
 * All of this is optional: without TanStack Form the same spec drives the
 * uncontrolled `@clearstorm/contact-form/react` adapter instead.
 */
"use client";

import { useMemo } from "react";
import {
  evaluateVisibility,
  isFieldSpec,
  toFieldSpecs,
  validateValue,
  vanillaValidation,
  visibleNames,
  type FieldSpec,
  type FormFieldSpec,
  type FormSpec,
  type Rule,
  type ValidationProvider,
} from "../core";
import { getMailer, type MailerConfig, type MailerResult } from "../mailers";

/* ---- value shapes ---- */

/**
 * The value shape each field's input drives. Strings for text-ish controls,
 * `boolean` for a standalone checkbox, `string[]` for checkbox/radio groups
 * and multi-selects, a `FileList` for file inputs, `File` for single files.
 */
export type FieldValue = string | boolean | string[] | File | FileList | null | undefined;

/** Field values as TanStack Form drives them. */
export type FormValues = Record<string, FieldValue>;

/** A TanStack-compatible per-field validator: `(props) => message | undefined`. */
export type FieldValidator = (props: { value: FieldValue }) => string | undefined;

/** Explicit endpoint overrides — take precedence over the form spec. */
export interface TanStackBridgeOptions {
  config?: {
    endpoint?: string;
    apiUrl?: string;
    cf7FormId?: string;
  };
  /**
   * Validation provider — swaps which rules the per-field validators run.
   * Defaults to the package's vanilla rules; pass e.g. a Zod-derived provider
   * (see `@clearstorm/contact-form/validation`) to validate differently.
   */
  validation?: ValidationProvider;
  /**
   * Fully replace the derived validators, keyed by field name. When present,
   * `validation` is ignored — these win for every field they name.
   */
  validators?: Record<string, FieldValidator>;
}

/* ---- pure helpers (exported for non-hook use) ---- */

/**
 * True for a browser `FileList`. Referenced guardedly because `FileList` is
 * not a Node global — these helpers run in SSR/Node too (File is, `FileList`
 * isn't).
 */
const isFileList = (value: unknown): value is FileList =>
  typeof FileList !== "undefined" && value instanceof FileList;

/** Map one field's value to the trimmed-string form the core rules validate. */
export function normalizeValue(field: FieldSpec, value: FieldValue): string {
  switch (field.type) {
    case "checkbox":
    case "radio": {
      if (typeof value === "boolean") return value ? "1" : "";
      const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
      return list.length > 0 ? "1" : "";
    }
    case "file":
      if (isFileList(value)) return value.length > 0 ? "1" : "";
      if (Array.isArray(value)) return value.length > 0 ? "1" : "";
      return value ? "1" : "";
    default:
      return String(value ?? "").trim();
  }
}

/** Run a core rule against one field's TanStack value. */
export function validateFieldValue(rule: Rule | undefined, field: FieldSpec, value: FieldValue): string | undefined {
  return validateValue(rule, normalizeValue(field, value)) ?? undefined;
}

/**
 * Derive per-field TanStack validators from a field spec (+ copy overrides).
 * Pass a custom `ValidationProvider` to drive the rules from your own source
 * (e.g. a Zod schema via the adapter in `@clearstorm/contact-form/validation`);
 * defaults to the package's vanilla rules.
 */
export function buildValidators(
  fields: FieldSpec[],
  copy: FormSpec["copy"] = {},
  provider: ValidationProvider = vanillaValidation,
): Record<string, FieldValidator> {
  const rules = provider.buildRules(fields, copy);
  const validators: Record<string, FieldValidator> = {};
  for (const field of fields) {
    const rule = rules[field.name];
    validators[field.name] = (props) => validateFieldValue(rule, field, props.value);
  }
  return validators;
}

/** Default starting values for every spec field (mirrors an empty form). */
export function buildInitialValues(fields: FormFieldSpec[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (field.type === "hidden") {
      values[field.name] = field.value ?? "";
      continue;
    }
    if (field.type === "checkbox" || field.type === "radio") {
      // A standalone checkbox is a boolean switch; a group tracks its selection.
      values[field.name] = field.options !== undefined && field.options.length > 0 ? [] : false;
      continue;
    }
    if (field.type === "file") {
      values[field.name] = [];
      continue;
    }
    values[field.name] = "";
  }
  return values;
}

/** Flatten TanStack values into the `Record<name, string[]>` core visibility reads. */
export function valuesToLists(values: FormValues): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(values)) {
    if (isFileList(value) || value instanceof File) {
      out[name] = [];
      continue;
    }
    if (Array.isArray(value)) {
      out[name] = value.map((v) => String(v).trim()).filter(Boolean);
      continue;
    }
    if (typeof value === "boolean") {
      out[name] = value ? ["1"] : [];
      continue;
    }
    const s = String(value ?? "").trim();
    out[name] = s ? [s] : [];
  }
  return out;
}

/** Which spec fields the visitor currently sees, given the current values. */
export function visibleFieldNames(fields: FieldSpec[], values: FormValues): Set<string> {
  return visibleNames(fields, valuesToLists(values));
}

/**
 * Build the FormData a mailer expects from TanStack values. Multi-value fields
 * append one entry per selection so `canonicalData` folds them into the same
 * comma-separated payload the DOM-driven engine produces; hidden fields keep
 * their raw spec value; unchecked checkboxes serialize as empty.
 */
export function valuesToFormData(values: FormValues, fields: FieldSpec[]): FormData {
  const data = new FormData();
  for (const field of fields) {
    const value = values[field.name];
    if (isFileList(value)) {
      for (const file of value) data.append(field.name, file, file.name);
    } else if (value instanceof File) {
      data.append(field.name, value, value.name);
    } else if (Array.isArray(value)) {
      if (value.length === 0) data.append(field.name, "");
      for (const item of value) data.append(field.name, String(item));
    } else if (typeof value === "boolean") {
      data.append(field.name, value ? "1" : "");
    } else {
      data.append(field.name, String(value ?? ""));
    }
  }
  return data;
}

/* ---- the hook ---- */

export interface ContactFormBridge {
  /** Client-side field spec (validation + payload shape). */
  fields: FieldSpec[];
  /** Per-field TanStack validators keyed by field name. */
  validators: Record<string, FieldValidator>;
  /** Starting values for `useForm({ defaultValues })`. */
  initialValues: FormValues;
  /**
   * Read conditional visibility off current values — mirror of the engine's
   * DOM-driven visibility. `true` when the field is unconditional.
   */
  isVisible: (name: string, values: FormValues) => boolean;
  /** Names of the fields currently in scope (visible + unconditional). */
  visibleFieldNames: (values: FormValues) => Set<string>;
  /** Values → FormData for the mailers (canonical payload). */
  toFormData: (values: FormValues) => FormData;
  /** Run the spec's mailer against the current values — TanStack `onSubmit`. */
  submit: (values: FormValues) => Promise<MailerResult>;
  /** Resolved transport config (spec + explicit overrides). */
  mailerConfig: MailerConfig;
}

/**
 * Wire a `FormSpec` into a TanStack Form. Returns everything a `useForm` call
 * needs — `defaultValues`, per-field validators, an `onSubmit` that sends the
 * canonical payload through the package's mailer — plus visibility helpers so
 * conditional fields can be hidden by TanStack or left DOM-driven.
 */
export function useContactForm(form: FormSpec, options: TanStackBridgeOptions = {}): ContactFormBridge {
  const fieldSpecs = useMemo(() => form.fields.filter(isFieldSpec), [form]);
  const fields = useMemo(() => toFieldSpecs(form.fields), [form]);
  const copy = form.copy ?? {};
  const validators = useMemo(
    () => options.validators ?? buildValidators(fields, copy, options.validation),
    [fields, copy, options.validators, options.validation],
  );
  const initialValues = useMemo(() => buildInitialValues(fieldSpecs), [fieldSpecs]);
  const mailerConfig: MailerConfig = useMemo(
    () => ({
      endpoint: options.config?.endpoint ?? form.endpoint,
      apiUrl: options.config?.apiUrl ?? form.cf7?.apiUrl,
      formId: options.config?.cf7FormId ?? form.cf7?.formId,
      copy,
    }),
    [options.config, form.endpoint, form.cf7?.apiUrl, form.cf7?.formId, copy],
  );

  const isVisible = useMemo(
    () => (name: string, values: FormValues) => {
      const field = fields.find((f) => f.name === name);
      if (!field?.visibility?.length) return true;
      return evaluateVisibility(field.visibility, valuesToLists(values));
    },
    [fields],
  );

  const submit = useMemo(
    () => async (values: FormValues): Promise<MailerResult> => {
      // Only what the visitor currently sees is validated and sent — hidden
      // conditional fields stay out of the payload (same contract as the
      // engine's DOM-driven path).
      const visible = visibleFieldNames(fields, values);
      const mailerFields = fields.filter((field) => visible.has(field.name));
      const data = valuesToFormData(values, fields);
      return getMailer(form.mailer).submit({ data, fields: mailerFields, config: mailerConfig });
    },
    [fields, form.mailer, mailerConfig],
  );

  return {
    fields,
    validators,
    initialValues,
    isVisible,
    visibleFieldNames: (values) => visibleFieldNames(fields, values),
    toFormData: (values) => valuesToFormData(values, fields),
    submit,
    mailerConfig,
  };
}