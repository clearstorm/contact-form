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

import { useMemo, useRef } from "react";
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
  type RuleContext,
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

/**
 * The extra props TanStack Form forwards to field validators in v1 — vendored
 * shape, so the package never type-checks against TanStack itself (it is an
 * optional peer). `values` is the full form state when the host supplies it.
 */
export interface ValidatorClientProps {
  values?: FormValues;
  formApi?: { state?: { values?: FormValues } };
}

/** A TanStack-compatible per-field validator: `(props) => message | undefined`. */
export type FieldValidator = (props: { value: FieldValue } & ValidatorClientProps) => string | undefined;

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
  /**
   * Runs inside `submit()` before the mailer. Returning `false` cancels the
   * submission: `submit` resolves `{ ok: false, message: "" }` without a
   * mailer call and without `rf:submit-start`. (Mirror of the engine's
   * `attachForm` `beforeSubmit` hook.)
   */
  beforeSubmit?: (ctx: { values: FormValues }) => boolean | void;
  /**
   * Runs after the mailer resolves — `ok` true on success, false on failure.
   * Never runs on a `beforeSubmit` veto. (Mirror of the engine's
   * `attachForm` `afterSubmit` hook.)
   */
  afterSubmit?: (ctx: { ok: boolean; message: string; values: FormValues }) => void;
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

/** The RuleContext a per-field validator gets: sibling values + own entries. */
const ruleContextFor = (field: FieldSpec, value: FieldValue, values?: FormValues): RuleContext => {
  let selfValues: string[];
  if (field.type === "file") {
    selfValues = [];
  } else if (Array.isArray(value)) {
    // Checkbox/radio groups and multi-selects — every checked/selected option.
    selfValues = value.map((v) => String(v).trim()).filter(Boolean);
  } else if (field.type === "checkbox" || field.type === "radio") {
    selfValues = value ? ["1"] : [];
  } else {
    selfValues = [String(value ?? "").trim()].filter(Boolean);
  }
  return { values: values ? valuesToLists(values) : {}, selfValues };
};

/**
 * Run a core rule against one field's TanStack value. Pass the full form
 * values (`values`) when the host can supply them (TanStack forwards
 * `formApi.state.values` to validators) so cross-field rules like `sameAs`
 * compare live siblings; without them such rules match only against the
 * field's own entry.
 */
export function validateFieldValue(
  rule: Rule | undefined,
  field: FieldSpec,
  value: FieldValue,
  values?: FormValues,
): string | undefined {
  return validateValue(rule, normalizeValue(field, value), ruleContextFor(field, value, values)) ?? undefined;
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
    // Repeaters are row-group containers, not scalar inputs — their rules
    // flatten under `{repeater}.{inner}` and the bridge tracks one value per
    // name, so a repeater gets no validator here (TanStack-driven repeaters
    // are a documented non-goal; consumers manage those values themselves).
    if (field.type === "repeater") continue;
    const rule = rules[field.name];
    validators[field.name] = (props) => {
      // TanStack v1 forwards the whole form state on formApi.state.values —
      // cross-field rules (sameAs, minSelect/maxSelect against siblings) read
      // live values through it.
      const values = props.values ?? props.formApi?.state?.values;
      return validateFieldValue(rule, field, props.value, values);
    };
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
  /** Subscribe to a `rf:submit-*` event emitted around `submit()`. */
  on: (
    event: "rf:submit-start" | "rf:submit-success" | "rf:submit-error",
    handler: (event: CustomEvent) => void,
  ) => void;
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
  // Repeaters are a DOM-engine feature (row add/remove, row-scoped
  // validation); this bridge tracks one scalar value per field name, so row
  // groups are excluded from validators, initial values and the payload.
  const scalarFields = useMemo(() => fields.filter((field) => field.type !== "repeater"), [fields]);
  const scalarNames = useMemo(() => new Set(scalarFields.map((field) => field.name)), [scalarFields]);
  const copy = form.copy ?? {};
  const validators = useMemo(
    () => options.validators ?? buildValidators(scalarFields, copy, options.validation),
    [scalarFields, copy, options.validators, options.validation],
  );
  const initialValues = useMemo(
    () => buildInitialValues(fieldSpecs.filter((field) => scalarNames.has(field.name))),
    [fieldSpecs, scalarNames],
  );
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

  const submitBus = useRef(new Map<string, Set<(event: CustomEvent) => void>>()).current;
  const on: ContactFormBridge["on"] = (event, handler) => {
    let set = submitBus.get(event);
    if (!set) {
      set = new Set();
      submitBus.set(event, set);
    }
    set.add(handler);
  };
  const emit = (name: string, detail?: unknown): void => {
    const set = submitBus.get(name);
    if (!set || set.size === 0) return;
    const ev = new CustomEvent(name, { detail });
    for (const handler of set) handler(ev);
  };

  const submit = useMemo(
    () => async (values: FormValues): Promise<MailerResult> => {
      // Lifecycle hook — vetoing cancels the submission outright (no mailer
      // call, no `rf:submit-start`; the caller gets a non-ok empty result).
      if (options.beforeSubmit?.({ values }) === false) return { ok: false, message: "" };
      const name = form.name;
      const id = "";
      emit("rf:submit-start", { name, id });
      // Only what the visitor currently sees is validated and sent — hidden
      // conditional fields stay out of the payload (same contract as the
      // engine's DOM-driven path).
      const visible = visibleFieldNames(fields, values);
      const mailerFields = scalarFields.filter((field) => visible.has(field.name));
      const data = valuesToFormData(values, scalarFields);
      let result: MailerResult;
      try {
        result = await getMailer(form.mailer).submit({ data, fields: mailerFields, config: mailerConfig });
      } catch (error) {
        // Keep the bridge's throwing contract (callers may still catch), but
        // announce the failure on the bus and run `afterSubmit` regardless.
        const message = error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
        emit("rf:submit-error", { name, id, message });
        options.afterSubmit?.({ ok: false, message, values });
        throw error;
      }
      if (result.ok) emit("rf:submit-success", { name, id });
      else emit("rf:submit-error", { name, id, message: result.message });
      options.afterSubmit?.({ ok: result.ok, message: result.message, values });
      return result;
    },
    [scalarFields, form.mailer, mailerConfig, options.beforeSubmit, options.afterSubmit, fields, form.name],
  );

  return {
    fields,
    validators,
    initialValues,
    isVisible,
    visibleFieldNames: (values) => visibleFieldNames(fields, values),
    toFormData: (values) => valuesToFormData(values, scalarFields),
    submit,
    on,
    mailerConfig,
  };
}