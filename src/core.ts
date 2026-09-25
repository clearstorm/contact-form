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
  | "color"
  | "file";

/**
 * Field/description width as a percentage of the 12-column form row. Every
 * value maps to its nearest column span (see `gridSpan`) — no per-size CSS
 * required.
 */
export type FieldSize = 100 | 90 | 80 | 75 | 70 | 67 | 60 | 50 | 40 | 33 | 30 | 25 | 20 | 10;

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
  /** Regex `pattern` mismatch on string fields. */
  pattern?: string;
  /** `sameAs` cross-field mismatch (e.g. "Confirm password" ≠ password). */
  sameAs?: string;
  /** `minSelect` / `maxSelect` bounds on checkbox/radio groups and multi-selects. */
  selection?: string;
  /** File fields that require an upload. */
  file?: string;
  /** A file exceeds `maxSize` — `{max}` renders the human-readable limit. */
  fileSize?: string;
  /** A file's MIME type isn't in `allowedTypes`. */
  fileType?: string;
  /** The number of attached files is outside `minFiles`/`maxFiles` — `{min}`/`{max}` placeholders. */
  fileCount?: string;
  /** Repeater "add row" button label (spec `addLabel` beats it). */
  addRow?: string;
  /** Repeater "remove row" button label (spec `removeLabel` beats it). */
  removeRow?: string;
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
 * - `includes` / `containsAll` (identical) — a checkbox group contains every
 *   listed value ("all of these"); `containsAny` — it contains at least one of
 *   the listed values.
 * - `greaterThan` / `greaterThanOrEqual` / `lessThan` / `lessThanOrEqual` —
 *   numeric comparison against the given number (non-numeric ISO values —
 *   dates/times — compare lexicographically).
 * - `startsWith` / `endsWith` — the controlling value starts/ends with the
 *   given string; `regex` — it matches the given regular expression (tested
 *   client-side only).
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
  | "containsAny"
  | "containsAll"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "startsWith"
  | "endsWith"
  | "regex"
  | "filled"
  | "empty";

export interface VisibilityCondition {
  /** Name of the controlling field whose value drives this condition. */
  field: string;
  operator: VisibilityOperator;
  /**
   * Required by `equals`/`notEquals`/`in`/`notIn`/`includes`/`containsAny`/
   * `containsAll`/`startsWith`/`endsWith`/`regex` (a number for the numeric
   * comparison operators); ignored by `filled`/`empty`.
   */
  value?: string | number | Array<string | number>;
}

/**
 * A single condition, or a logical wrapper combining conditions:
 * `anyOf` (OR — one inner rule must hold), `noneOf` (NOR — none must hold) or
 * `not` (negation of the inner rule). Wrappers nest freely — an `anyOf` can
 * contain `noneOf`s, `not`s and AND arrays.
 */
export type VisibilityConditionLike =
  | VisibilityCondition
  | { anyOf: VisibilityConditionLike[] }
  | { noneOf: VisibilityConditionLike[] }
  | { not: VisibilityConditionLike };

/**
 * A field's `showWhen`: a single condition/wrapper, or an array of them joined
 * with AND (the pre-1.x array-is-AND semantics are unchanged).
 */
export type VisibilityRule = VisibilityConditionLike | VisibilityConditionLike[];

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
  /**
   * Custom regex pattern for string fields — enforced as *soft* validation by
   * the client (the form renders `novalidate`, so the shared script checks it
   * and shows the field's message on mismatch). Also rendered as the native
   * `pattern` attribute for assistive tech.
   */
  pattern?: string;
  /**
   * Soft minimum length for text-like values (`text`, `email`, `tel`, `url`,
   * `search`, `password`, `textarea`). Overrides the textarea's built-in
   * 10-character default.
   */
  minLength?: number;
  /** Soft maximum length — renders a live character counter on text-like inputs. */
  maxLength?: number;
  /**
   * Another field's name this field's value must equal, e.g.
   * `{ "name": "confirm_password", "sameAs": "password" }`. Re-validated
   * whenever the other field changes.
   */
  sameAs?: string;
  /**
   * Minimum number of selected options before a checkbox/radio group or
   * multi-select passes (a single checkbox: 0 or 1 by nature).
   */
  minSelect?: number;
  /** Maximum number of selected options before it fails. */
  maxSelect?: number;
  /**
   * Accept hint for `file` inputs (e.g. `"image/*,.pdf"`). No validation
   * implied — the picker hint only.
   */
  accept?: string;
  /**
   * Multiple values: `file` inputs accept several files; `select` renders a
   * multi-select (`rows` controls its visible height).
   */
  multiple?: boolean;
  /**
   * Per-file maximum size for `file` inputs. A plain number is bytes; a string
   * accepts size units (`"512KB"`, `"5MB"`). Any attached file larger than this
   * fails the field. Unparseable values fail open, the same way an invalid
   * `pattern` does.
   */
  maxSize?: number | string;
  /**
   * MIME allow-list for attached files — exact types (`"application/pdf"`) or
   * globs (`"image/*"`). This is the *enforcement* list; `accept` stays the
   * picker hint only. A file with an empty/unknown MIME type fails when a list
   * is configured.
   */
  allowedTypes?: string[];
  /** Minimum number of attached files (a `multiple` file input). `> 0` implies required. */
  minFiles?: number;
  /** Maximum number of attached files (a `multiple` file input). */
  maxFiles?: number;
}

/* ---- Repeaters (dynamic row groups) ---- */

/**
 * A repeater — an array-valued field (e.g. "team members" or "work entries")
 * whose rows the visitor can add and remove on the client.
 *
 * A repeater is a layout *container*, not an input primitive: each row repeats
 * the same row-template fields (`fields`), and the canonical payload carries
 * the rows as a JSON array (`[{…}, …]`), which is what separates it from the
 * scalar 20 input types. It is deliberately not a `FieldType` — it sits next
 * to the structural elements in `FormElement`, but unlike them it has a
 * `name`, validates its rows and reaches the payload.
 *
 * The rows are rendered by the markup builders (`.rf-repeater` +
 * `data-add-row` / `data-remove-row`) and wired by the client engine, which
 * also enforces `minRows`/`maxRows` (the add button disables at `maxRows`, the
 * remove buttons at `minRows`).
 */
export interface RepeaterSpec {
  type: "repeater";
  id: string;
  /** Key in the canonical payload — the JSON-array entry name. */
  name: string;
  /** Fieldset legend; optional (a bare repeater renders no label). */
  label?: string;
  /** Width within the row — the same FieldSize as fields (defaults to 100). */
  size?: FieldSize;
  /**
   * Minimum number of rows (default 0 — an empty repeater is valid and yields
   * `[]`). Remove buttons disable at this count; a submit below it is a block
   * error (defence-in-depth — the buttons normally prevent it).
   */
  minRows?: number;
  /**
   * Maximum number of rows (default unlimited). The add button disables at
   * this count.
   */
  maxRows?: number;
  /**
   * Add-row button label override — resolution order is `addLabel` →
   * `copy.addRow` → "Add another".
   */
  addLabel?: string;
  /**
   * Remove-row button label override — resolution order is `removeLabel` →
   * `copy.removeRow` → "Remove".
   */
  removeLabel?: string;
  /**
   * The row template: standard fields (the 20 input types) repeated per
   * row; structural elements are allowed as static row chrome. Wizard `step`
   * markers are dropped.
   */
  fields: FormElement[];
  /** Show the whole repeater only while the condition(s) hold (conditional fields). */
  showWhen?: VisibilityRule;
  /** Per-repeater message override (used for the min/max-rows block error). */
  message?: string;
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
  /**
   * Horizontal alignment (defaults to "left"). "full" renders the title on its
   * own line with a full-width rule beneath it (instead of flanking rules).
   */
  align?: "left" | "center" | "right" | "full";
  /** Flanking rule — on by default; `false` renders the title text only. */
  line?: boolean;
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

/** Global defaults for a wizard step pane's header (see `StepHeaderSpec`). */
export interface StepHeaderDefaults {
  /** Render the pane header (number + title + rule) — default true. */
  show?: boolean;
  /**
   * Header alignment (defaults to "left") — the heading set, including "full"
   * (title on its own line, full-width rule beneath).
   */
  align?: "left" | "center" | "right" | "full";
  /** Header rule — on by default; `false` hides it. */
  line?: boolean;
}

/**
 * Header options for a wizard step pane: a number chip plus a title with the
 * same rule/alignment styling as decorative headings. Rendered above the
 * step's fields by default; `show: false` opts out. A marker's own keys
 * override the global `stepper.header` defaults.
 */
export interface StepHeaderSpec extends StepHeaderDefaults {
  /**
   * Pane header title — falls back to `label`, which stays short for the
   * stepper (e.g. label "Details", title "Tell us about your details").
   */
  title?: string;
}

/**
 * A wizard step boundary (`{ "type": "step", "label": "…" }`). Everything in
 * `FormSpec.fields` below a marker belongs to that step's group until the next
 * marker; elements before the first marker are shared across every step. Like
 * all structural elements it carries no `name`, so it never validates, never
 * serialises into `data-rules`, and never reaches the payload.
 */
export interface StepSpec extends StepHeaderSpec {
  type: "step";
  /** Short label shown in the stepper (e.g. "Contact details"). */
  label: string;
  /**
   * Submit-button label for the final step. Only the LAST marker's `submit` is
   * honoured — earlier ones are ignored (`form.submit` is the fallback).
   */
  submit?: string;
  /**
   * Conditional step: the whole pane is skipped (hidden + inert, dropped from
   * validation and the payload) while these conditions don't hold. Takes the
   * same shape as a field's `showWhen` — a single condition/wrapper or an AND
   * array. Conditions may only read the shared prefix or *earlier* steps (the
   * engine warns once about same/later-step references); authored step numbers
   * never change — the engine computes a visible sequence over them.
   */
  showWhen?: VisibilityRule;
}

/**
 * A member of `FormSpec.fields`: a field, a structural element, a wizard
 * `step` marker, or a repeater (dynamic row group).
 */
export type FormElement = FormFieldSpec | DecorSpec | StepSpec | RepeaterSpec;

/**
 * True when a fields-array entry is a payload-bearing field rather than a
 * structural element. Every field — the 20 scalar input types plus the
 * `repeater` row group — carries a `name`; structural elements (`heading`,
 * `description`, `divider`, `section`) and wizard `step` markers never do —
 * that single check is the discriminator used everywhere a field is required
 * (serialisation, rules, payload).
 */
export function isFieldSpec(element: FormElement): element is FormFieldSpec {
  return typeof (element as FormFieldSpec).name === "string";
}

/* ---- Buttons (submit / next / prev) ---- */

/** A button's look — themeable via the `--rf-button-*` tokens. */
export type ButtonVariant = "primary" | "secondary" | "ghost";

/**
 * A visitor-facing button: a plain label shorthand, or `{ label, variant }`
 * when styling control is needed. Strings keep working — the object form only
 * adds the variant (labelled buttons fall back to these defaults per role:
 * submit/next → "primary", prev → "secondary").
 */
export type ButtonSpec =
  | string
  | { label?: string; variant?: ButtonVariant };

/** Resolve a button spec to its label, falling back when absent. */
export function buttonLabel(spec: ButtonSpec | undefined, fallback: string): string {
  return typeof spec === "string" ? spec : (spec?.label ?? fallback);
}

/** Resolve a button spec to its variant, falling back when absent. */
export function buttonVariant(spec: ButtonSpec | undefined, fallback: ButtonVariant): ButtonVariant {
  return typeof spec === "string" ? fallback : (spec?.variant ?? fallback);
}

/* ---- Stepper (wizard chrome: navigation strip + pane headers) ---- */

/**
 * The wizard navigation strip itself (the `<ol class="rf-steps">`). Every key
 * is optional — defaults reproduce the plain left-aligned strip with numbered
 * labelled chips and clickable completed steps.
 */
export interface StepperNavSpec {
  /** Show the step number chip — default true. */
  number?: boolean;
  /** Show the step label — default true. */
  label?: boolean;
  /** Horizontal alignment of the strip — default "left". */
  variant?: "left" | "center" | "right" | "even";
  /**
   * Rule position — default "none". "top" / "bottom" draw a full-width rule
   * above / below the strip. "center" flanks the chips like a pane header,
   * weighted by `variant` (left → rule fills the right of the row, right →
   * rule on the left, center → both sides); with `variant: "even"` a flank
   * can't flex, so the rules run vertically between the chips instead.
   */
  line?: "none" | "top" | "bottom" | "center";
  /** Completed steps clickable to jump back — default true. */
  clickable?: boolean;
  /**
   * Background colour for the whole strip (any CSS colour). Renders as a
   * `--rf-steps-bg` inline token (plus a pill band); the chips themselves
   * stay uncoloured unless the `--rf-step-bg` / `-active-bg` / `-done-bg`
   * tokens are themed.
   */
  background?: string;
}

/**
 * Opt-in configuration for the wizard chrome. Defaults reproduce the plain
 * wizard — a left-aligned step strip, and a number-chip header on each pane.
 */
export interface StepperSpec {
  /** The navigation strip. */
  nav?: StepperNavSpec;
  /** Global pane-header defaults; per-marker keys override them per step. */
  header?: StepHeaderDefaults;
}

/** Modifier classes for the stepper ("rf-steps--…"), empty when default. */
export function stepperModifiers(stepper: StepperSpec | undefined): string {
  const nav = stepper?.nav;
  if (!nav) return "";
  const parts: string[] = [];
  if (nav.variant && nav.variant !== "left") parts.push(`rf-steps--${nav.variant}`);
  if (nav.line && nav.line !== "none") parts.push(`rf-steps--line-${nav.line}`);
  return parts.join(" ");
}

/**
 * The lifecycle hook names the wizard / submit seam supports. A hook is a
 * consumer-supplied *function*; a `FormSpec` may reference it by name (the
 * spec JSON stays serialisable — never a function in a spec). The engine
 * resolves a spec's hook name against the named functions registered in the
 * attach options, so declarative specs can wire analytics callbacks without
 * shipping code in the JSON.
 */
export type HookName = "beforeValidateStep" | "afterStepChange" | "beforeSubmit" | "afterSubmit";

export interface FormSpec {
  /** Baked form identity (e.g. "enquiry" | "booking") — keys data-mail-form, the form id and the JS hooks. */
  name: string;
  /**
   * Final submit button: a plain label, or `{ label, variant }`. `variant`
   * defaults to "primary". In a wizard, a final marker's `submit` label
   * overrides this label.
   */
  submit: string | ButtonSpec;
  /** Wizard Next button — label (default "Next") + optional variant (default "primary"). */
  next?: ButtonSpec;
  /** Wizard Previous button — the Back control (default "secondary"). */
  prev?: ButtonSpec;
  /** Opt-in wizard chrome config (stepper strip + pane-header defaults). */
  stepper?: StepperSpec;
  status: string;
  /**
   * What happens after a successful submit:
   * - `"inline"` (default) — the status box appears under the submit button
   *   and the fields are cleared; the form stays visible.
   * - `"replace"` — the whole form hides and only the success status box
   *   remains (a "thanks, we've got it" pattern).
   */
  statusMode?: "inline" | "replace";
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
   * Lifecycle hooks, referenced by *name*: `{ beforeSubmit: "trackLead" }`.
   * The engine resolves each name against the functions registered in the
   * attach options (`attachForm(opts.hooks)`, `renderForm(options.hooks)`) —
   * inline hook functions there win over the spec's names. A name that isn't
   * registered is a no-op, but the matching `rf:*` event still fires, so
   * analytics never loses visibility (see FEATURES `event-bus`).
   */
  hooks?: Partial<Record<HookName, string>>;
  /**
   * Opt-in draft persistence: the engine saves the visitor's in-scope values
   * (plus the current wizard step) to localStorage as they type, restores them
   * on the next load, and clears the draft on a successful submit.
   * - `true` → the key `rf:draft:{name}` (auto-scoped per form).
   * - a string → an explicit localStorage key to share/split drafts by.
   *
   * Storage is guarded (feature-detect + try/catch), so a blocked `localStorage`
   * quietly disables persistence. The draft never survives a successful submit.
   */
  autoSave?: boolean | string;
  /**
   * The ordered layout of the form: real fields plus (optionally) structural
   * elements — `heading`, `description`, `divider`, `section` — and wizard
   * `step` markers that group the fields after them into multi-step panes.
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
  /** Regex pattern — soft validation on string fields. */
  pattern?: string;
  /** Soft minimum length for text-like values. */
  minLength?: number;
  /** Soft maximum length — renders a live character counter. */
  maxLength?: number;
  /** Another field whose value this must equal (cross-match). */
  sameAs?: string;
  /** Minimum selected options for groups / multi-selects. */
  minSelect?: number;
  /** Maximum selected options for groups / multi-selects. */
  maxSelect?: number;
  /** Multiple files / multi-select flag. */
  multiple?: boolean;
  /** Per-file maximum size (bytes or a `"5MB"`-style units string). */
  maxSize?: number | string;
  /** MIME allow-list for attached files — exact types or `image/*` globs. */
  allowedTypes?: string[];
  /** Minimum attached files (`multiple` file inputs). */
  minFiles?: number;
  /** Maximum attached files (`multiple` file inputs). */
  maxFiles?: number;
  /**
   * Repeater rows: the client-side specs of the row-template fields. Present
   * only on `type: "repeater"` specs — the engine validates each row's
   * controls against these (row-scoped) and the canonical payload groups them
   * into a JSON array.
   */
  repeater?: FieldSpec[];
  /** Minimum row count for a repeater (default 0). */
  minRows?: number;
  /** Maximum row count for a repeater (default: unlimited). */
  maxRows?: number;
  /**
   * Conditional fields: the normalized (always-array) showWhen rules —
   * conditions and/or `anyOf` / `noneOf` / `not` wrappers. Absent on
   * unconditional fields.
   */
  visibility?: VisibilityConditionLike[];
  /**
   * Names of the fields whose values the visibility rules read — the
   * client listens to these to re-evaluate. Absent on unconditional fields.
   */
  dependsOn?: string[];
}

/**
 * The names of every controlling field a rule set reads — recursing through
 * `anyOf` / `noneOf` / `not` wrappers. The client listens to exactly these to
 * re-evaluate a conditional field (serialised as `dependsOn`).
 */
export function visibilityFields(rules: VisibilityConditionLike[]): string[] {
  const out: string[] = [];
  const walk = (rule: VisibilityConditionLike): void => {
    if ("anyOf" in rule) {
      rule.anyOf.forEach(walk);
      return;
    }
    if ("noneOf" in rule) {
      rule.noneOf.forEach(walk);
      return;
    }
    if ("not" in rule) {
      walk(rule.not);
      return;
    }
    out.push(rule.field);
  };
  rules.forEach(walk);
  return [...new Set(out)];
}

/** The client-side field spec (validation + mailers) for a form's fields. */
export function toFieldSpecs(fields: FormElement[]): FieldSpec[] {
  // Structural elements are render-time only — they never reach the client.
  return fields
    .filter((field): field is RepeaterSpec | FormFieldSpec => isFieldSpec(field))
    .map((field) => {
      const visibility = field.showWhen
        ? (Array.isArray(field.showWhen) ? field.showWhen : [field.showWhen])
        : undefined;
      const visibilityKeys = visibility && visibility.length > 0
        ? { visibility, dependsOn: visibilityFields(visibility) }
        : {};
      // A repeater is a container, not a scalar input: the row template
      // serialises as nested client specs (`repeater`) plus the row bounds.
      // `addLabel`/`removeLabel` are render-time only — the engine never
      // re-renders the buttons, so they don't ride in data-rules.
      if (field.type === "repeater") {
        return {
          name: field.name,
          type: "repeater",
          required: false,
          label: field.label,
          message: field.message,
          repeater: toFieldSpecs(field.fields),
          ...(field.minRows !== undefined ? { minRows: field.minRows } : {}),
          ...(field.maxRows !== undefined ? { maxRows: field.maxRows } : {}),
          ...visibilityKeys,
        };
      }
      return {
        name: field.name,
        type: field.type ?? "text",
        required: Boolean(field.required),
        label: field.label,
        message: field.message,
        min: field.min,
        max: field.max,
        pattern: field.pattern,
        minLength: field.minLength,
        maxLength: field.maxLength,
        sameAs: field.sameAs,
        minSelect: field.minSelect,
        maxSelect: field.maxSelect,
        multiple: field.multiple,
        maxSize: field.maxSize,
        allowedTypes: field.allowedTypes,
        minFiles: field.minFiles,
        maxFiles: field.maxFiles,
        ...visibilityKeys,
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

/* ---- Multi-step (wizard) layout ---- */

/** One wizard step: its stepper label and the elements it groups. */
export interface FormStep extends StepHeaderSpec {
  label: string;
  /** Submit label for this step's button — kept only on the final step. */
  submit?: string;
  /**
   * Conditional-step conditions, normalised to an AND array (a single
   * condition is wrapped) — mirrors `FieldSpec.visibility`. When present and
   * unsatisfied the step's pane is skipped by the engine.
   */
  showWhen?: VisibilityConditionLike[];
  elements: FormElement[];
}

/** The layout a form's fields resolve into. */
export interface FormLayout {
  /** Rendered once above the panes — visible on every step. */
  shared: FormElement[];
  /** Hidden-type fields hoisted outside the panes (active on every step). */
  hoisted: FormElement[];
  /** Ordered groups opened by `step` markers. Empty = single-page form. */
  steps: FormStep[];
}

/**
 * Split a form's elements into wizard layout. Elements before the first
 * `step` marker become the shared prefix (shown on every step); everything
 * below a marker belongs to that step's group until the next marker.
 * `type: "hidden"` fields are hoisted outside the panes. Only the LAST
 * marker keeps its `submit` label. Step header options (`show`, `title`,
 * `align`, `line`) flow through onto each `FormStep`, and a marker's
 * `showWhen` flows through normalised to an AND array (single conditions
 * wrapped) — the same shape field conditions serialise as. With no markers the
 * result is a single-page layout — the elements unchanged, hidden fields left
 * in place — so the renderer stays fully backwards compatible.
 */
export function toSteps(elements: FormElement[]): FormLayout {
  const hasMarkers = elements.some((element) => element.type === "step");
  if (!hasMarkers) return { shared: [...elements], hoisted: [], steps: [] };

  const shared: FormElement[] = [];
  const hoisted: FormElement[] = [];
  const steps: FormStep[] = [];
  const markerIndex: number[] = [];
  let current: FormStep | undefined;

  for (const [index, element] of elements.entries()) {
    if (element.type === "step") {
      current = {
        label: element.label,
        submit: element.submit,
        show: element.show,
        title: element.title,
        align: element.align,
        line: element.line,
        ...(element.showWhen !== undefined
          ? { showWhen: Array.isArray(element.showWhen) ? element.showWhen : [element.showWhen] }
          : {}),
        elements: [],
      };
      steps.push(current);
      markerIndex.push(index);
      continue;
    }
    if (element.type === "hidden") {
      hoisted.push(element);
      continue;
    }
    if (current) current.elements.push(element);
    else shared.push(element);
  }

  // Only the final step's submit label is honoured.
  const last = steps[steps.length - 1];
  for (const step of steps) {
    if (step !== last) step.submit = undefined;
  }

  // Conditional steps may only read the shared prefix or earlier steps — a
  // condition aimed at its own pane (or a later one) has no stable value when
  // the engine computes the visible sequence. Warn once per offending field;
  // downstream evaluation is best-effort from whatever values exist.
  const conditional = steps.some((step) => step.showWhen && step.showWhen.length > 0);
  if (conditional) {
    const nameAt = new Map<string, number>();
    elements.forEach((element, index) => {
      if (typeof (element as FormFieldSpec).name === "string") nameAt.set((element as FormFieldSpec).name, index);
    });
    const warned = new Set<string>();
    steps.forEach((step, i) => {
      if (!step.showWhen) return;
      for (const name of visibilityFields(step.showWhen)) {
        const at = nameAt.get(name);
        if (at === undefined || at <= markerIndex[i] || warned.has(name)) continue;
        warned.add(name);
        console.warn(
          `[ContactForm] step "${step.label}" showWhen reads "${name}", which sits on the same or a later step — ` +
            "step conditions may only read the shared prefix or earlier steps.",
        );
      }
    });
  }
  return { shared, hoisted, steps };
}

/* ---- Conditional visibility evaluation ---- */

/** Normalise a rule's `value` into a list of option strings (for value-family operators). */
const valueList = (value: string | number | Array<string | number> | undefined): string[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
};

/** Compare a controlling value against the target string. Numeric values compare numerically; non-numeric ISO dates/times compare lexicographically. */
const compareValues = (
  operator: "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual",
  a: string,
  b: string,
): boolean => {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    switch (operator) {
      case "greaterThan": return na > nb;
      case "greaterThanOrEqual": return na >= nb;
      case "lessThan": return na < nb;
      default: return na <= nb;
    }
  }
  switch (operator) {
    case "greaterThan": return a > b;
    case "greaterThanOrEqual": return a >= b;
    case "lessThan": return a < b;
    default: return a <= b;
  }
};

/**
 * Evaluate one leaf condition against the caller-supplied current values
 * (`values[name]` = trimmed, non-empty values of the controls named `name`;
 * checkbox/radio groups contribute only their checked values). Comparison and
 * string-pattern operators match when *at least one* present value satisfies
 * them; unknown operators and conditions with no usable value never match — the
 * field stays hidden.
 */
const evaluateCondition = (
  condition: VisibilityCondition,
  values: Record<string, string[]>,
): boolean => {
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
    case "containsAll":
      if (list.length === 0 || !list.every((v) => field.includes(v))) return false;
      break;
    case "containsAny":
      if (list.length === 0 || !field.some((v) => list.includes(v))) return false;
      break;
    case "greaterThan":
    case "greaterThanOrEqual":
    case "lessThan":
    case "lessThanOrEqual": {
      const operator = condition.operator; // narrowed by the switch — closures lose it
      if (list.length === 0 || !field.some((v) => compareValues(operator, v, list[0]))) {
        return false;
      }
      break;
    }
    case "startsWith":
      if (list.length === 0 || !field.some((v) => v.startsWith(list[0]))) return false;
      break;
    case "endsWith":
      if (list.length === 0 || !field.some((v) => v.endsWith(list[0]))) return false;
      break;
    case "regex":
      if (list.length === 0) return false;
      try {
        if (!field.some((v) => new RegExp(list[0]).test(v))) return false;
      } catch {
        return false; // invalid regex — fail safe to hidden
      }
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
  return true;
};

/** Evaluate one rule (a condition or an `anyOf` / `noneOf` / `not` wrapper). */
const evaluateRule = (
  rule: VisibilityConditionLike,
  values: Record<string, string[]>,
): boolean => {
  if ("anyOf" in rule) return rule.anyOf.some((inner) => evaluateRule(inner, values));
  if ("noneOf" in rule) return !rule.noneOf.some((inner) => evaluateRule(inner, values));
  if ("not" in rule) return !evaluateRule(rule.not, values);
  return evaluateCondition(rule, values);
};

/**
 * Evaluate a field's showWhen rules against the caller-supplied current
 * values (`values[name]` = trimmed, non-empty values of the controls named
 * `name`; checkbox/radio groups contribute only their checked values). An
 * array of rules requires every one to hold (AND); `anyOf` requires at least
 * one (OR), `noneOf` requires none (NOR) and `not` negates the inner rule.
 * Unknown operators and rules with no usable value never match — the field
 * stays hidden.
 */
export function evaluateVisibility(
  rules: VisibilityConditionLike[],
  values: Record<string, string[]>,
): boolean {
  for (const rule of rules) {
    if (!evaluateRule(rule, values)) return false;
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

/**
 * The context a rule gets besides the field's own value. Built by the DOM
 * engine (the TanStack bridge builds it too, minus `files`, which has no
 * FileList in API-land — file bounds idle there); the vanilla rules mostly
 * ignore it — the cross-field rules (`sameAs`, `minSelect`/`maxSelect`) and
 * the file bounds (`maxSize`/`allowedTypes`/`minFiles`/`maxFiles` via `files`)
 * are what read it.
 */
export interface RuleContext {
  /**
   * Trimmed, non-empty values of every in-scope control, keyed by field name.
   * Checkbox/radio groups contribute only their checked option values.
   */
  values: Record<string, string[]>;
  /**
   * The field's own current values — every checked option of a checkbox/radio
   * group, every selected option of a multi-select, else the single value.
   */
  selfValues: string[];
  /** Attached files for `file` fields — name/size/type descriptors (no bytes). */
  files?: { name: string; size: number; type: string }[];
}

export interface Rule {
  required?: boolean;
  test: (value: string, ctx?: RuleContext) => boolean;
  /**
   * The message to show on failure. A static string works everywhere; the
   * function form is for adapters (e.g. the optional Zod bridge) that want to
   * surface the exact error for the current value.
   */
  message: string | ((value: string, ctx?: RuleContext) => string);
}

const NAME_RE = /^[\p{L}\s''-]{2,}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,15}$/;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Length bounds for text-like values (`minLength`/`maxLength`), no-ops when
 * unset. The textarea's own 10-character default is applied in its case.
 */
const lengthOk = (field: FieldSpec, value: string): boolean => {
  if (field.minLength !== undefined && value.length < field.minLength) return false;
  if (field.maxLength !== undefined && value.length > field.maxLength) return false;
  return true;
};

/**
 * Custom regex pattern on string fields. An invalid pattern is a spec error —
 * fail open, so a broken pattern never blocks valid input (the field's own
 * type rule still validates). The pattern is tested client-side against the
 * trimmed value exactly as the visitor typed it.
 */
const patternOk = (field: FieldSpec, value: string): boolean => {
  if (!field.pattern) return true;
  try {
    return new RegExp(field.pattern).test(value);
  } catch {
    return true;
  }
};

/** `sameAs`: the field's value must equal the target field's first value. */
const matchesTarget = (target: string, value: string, ctx?: RuleContext): boolean =>
  ctx?.values?.[target]?.[0] === value;

/**
 * Size-units parsing for `maxSize`: a plain number is bytes, a string accepts
 * `"512KB"` / `"5MB"` style units. Unparseable strings return undefined — the
 * rule then fails open, the same way an invalid `pattern` does.
 */
const parseMaxSize = (max?: number | string): number | undefined => {
  if (max === undefined) return undefined;
  if (typeof max === "number") return max;
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(max.trim());
  if (!match) return undefined;
  const units: Record<string, number> = { b: 0, kb: 1, mb: 2, gb: 3 };
  return Math.round(Number(match[1]) * 1024 ** units[match[2].toLowerCase()]);
};

/** Render byte counts human-readably for the `{max}` token — "512KB", "2MB". */
const formatSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(/\.0$/, "")}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/, "")}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")}KB`;
  return `${bytes}B`;
};

/** True when a file's MIME type matches the allow-list (exact or `image/*`). */
const matchesAllowed = (allowed: string[], type: string): boolean =>
  allowed.some((entry) => entry === type || (entry.endsWith("/*") && type.startsWith(entry.slice(0, -1))));

/** Replace `{key}` placeholders in a visitor-facing string. */
const tokens = (text: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), text);

/**
 * The attached files satisfy the field's file bounds (`maxSize` /
 * `allowedTypes` / `minFiles` / `maxFiles`). An empty selection is the
 * required check's business — file bounds only judge files that exist.
 */
const filesOk = (field: FieldSpec, ctx?: RuleContext): boolean => {
  const files = ctx?.files;
  if (!files || files.length === 0) return true;
  const max = parseMaxSize(field.maxSize);
  if (max !== undefined && files.some((file) => file.size > max)) return false;
  if (field.allowedTypes?.length && files.some((file) => !matchesAllowed(field.allowedTypes!, file.type))) return false;
  if (field.minFiles !== undefined && files.length < field.minFiles) return false;
  if (field.maxFiles !== undefined && files.length > field.maxFiles) return false;
  return true;
};

/**
 * Build the per-field validation rules from a field spec. Required-ness comes
 * from the JSON spec (plus `minSelect` on groups/multi-selects, which implies
 * selecting at least one); the format tests are shared code keyed by field
 * type; every message resolves `field.message` → `copy[key]` → default.
 */
export function buildRules(fields: FieldSpec[], copy: FormCopy = {}): Record<string, Rule> {
  const rules: Record<string, Rule> = {};
  const messageFor = (field: FieldSpec, key: keyof FormCopy, fallback: string): string =>
    field.message ?? copy[key] ?? fallback;

  /**
   * Resolve the message for a file failure — which bound broke decides which
   * copy key wins (fileSize / fileType / fileCount), so a single per-field
   * `message` override covers every case for that field.
   */
  const fileMessageFor = (field: FieldSpec): ((value: string, ctx?: RuleContext) => string) => {
    return (value, ctx) => {
      const files = ctx?.files;
      if (files && files.length > 0) {
        const max = parseMaxSize(field.maxSize);
        if (max !== undefined && files.some((file) => file.size > max)) {
          const raw = copy.fileSize ?? `File is too large (max ${formatSize(max)}).`;
          return field.message ?? tokens(raw, { max: formatSize(max) });
        }
        if (field.allowedTypes?.length && files.some((file) => !matchesAllowed(field.allowedTypes!, file.type))) {
          return messageFor(field, "fileType", "This file type isn't allowed.");
        }
        const min = field.minFiles;
        const maximum = field.maxFiles;
        if ((min !== undefined && files.length < min) || (maximum !== undefined && files.length > maximum)) {
          const defaultText =
            min !== undefined && maximum !== undefined
              ? "Attach between {min} and {max} files."
              : min !== undefined
                ? "Attach at least {min} files."
                : "Attach at most {max} files.";
          const raw = copy.fileCount ?? defaultText;
          return field.message ?? tokens(raw, { min: min ?? 0, max: maximum ?? 0 });
        }
      }
      return messageFor(field, "file", "Please attach a file.");
    };
  };

  for (const field of fields) {
    // Repeaters are row-group containers, not scalar inputs: no rule exists
    // under the repeater's own name — instead the row template's inner rules
    // flatten under `{repeater}.{inner}` keys. The engine looks those up per
    // row, so two repeaters whose rows share an inner field name can't
    // collide, and cross-row `sameAs` targets stay row-local.
    if (field.type === "repeater" && field.repeater) {
      for (const [innerName, rule] of Object.entries(buildRules(field.repeater, copy))) {
        rules[`${field.name}.${innerName}`] = rule;
      }
      continue;
    }
    const name = field.name;
    // Hidden fields receive no user input — never validate them.
    if (field.type === "hidden") continue;
    // minSelect > 0 implies the group/multi-select must have a selection;
    // minFiles > 0 implies a file field must have at least one attachment.
    const required =
      Boolean(field.required) ||
      ((field.type === "checkbox" || field.type === "radio" || field.type === "select") &&
        (field.minSelect ?? 0) > 0) ||
      (field.type === "file" && (field.minFiles ?? 0) > 0);
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
          test: (value) => EMAIL_RE.test(value) && lengthOk(field, value) && patternOk(field, value),
          message: messageFor(field, "email", "Enter a valid email address."),
        };
        break;
      case "tel":
        rules[name] = {
          required,
          test: (value) => PHONE_RE.test(value) && lengthOk(field, value) && patternOk(field, value),
          message: messageFor(field, "tel", "Enter a valid phone number."),
        };
        break;
      case "url":
        rules[name] = {
          required,
          test: (value) => URL_RE.test(value) && lengthOk(field, value) && patternOk(field, value),
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
      case "file":
        // The component aggregates file-selection into "1" / "" for the
        // rule; the actual files ride in ctx.files so the size/type/count
        // bounds (maxSize / allowedTypes / minFiles / maxFiles) can run.
        rules[name] = {
          required,
          test: (value, ctx) => value === "1" && filesOk(field, ctx),
          message: fileMessageFor(field),
        };
        break;
      case "checkbox":
      case "radio":
        // The component aggregates selection state into "1" / "" for the
        // rule; with minSelect/maxSelect the rule counts every checked
        // option of the group via the RuleContext instead.
        if (field.minSelect !== undefined || field.maxSelect !== undefined) {
          rules[name] = {
            required,
            test: (value, ctx) => {
              const count = ctx?.selfValues?.length ?? (value === "1" ? 1 : 0);
              if (field.minSelect !== undefined && count < field.minSelect) return false;
              if (field.maxSelect !== undefined && count > field.maxSelect) return false;
              return true;
            },
            message: messageFor(field, "selection", "Please select the right number of options."),
          };
        } else {
          rules[name] = {
            required,
            test: (value) => value === "1",
            message: messageFor(field, "checkbox", "Please select this option."),
          };
        }
        break;
      case "select":
        rules[name] = {
          required,
          test: (value, ctx) => {
            // Plain selects only need required-ness; bounds matter for
            // multi-selects, where ctx.selfValues is every selected option.
            if (field.minSelect === undefined && field.maxSelect === undefined) return true;
            const count = ctx?.selfValues?.length ?? 0;
            if (field.minSelect !== undefined && count < field.minSelect) return false;
            if (field.maxSelect !== undefined && count > field.maxSelect) return false;
            return true;
          },
          message: messageFor(field, "selection", "Please select the right number of options."),
        };
        break;
      case "textarea":
        rules[name] = {
          required,
          test: (value) =>
            value.length >= (field.minLength ?? 10) &&
            (field.maxLength === undefined || value.length <= field.maxLength) &&
            patternOk(field, value),
          message: messageFor(field, "textarea", "Message must be at least 10 characters."),
        };
        break;
      default:
        rules[name] = {
          required,
          test: (value) => lengthOk(field, value) && patternOk(field, value),
          // One message per field: a pattern mismatch and an empty required
          // field resolve through the same string. Fields with a `pattern`
          // resolve copy via the dedicated `pattern` key so consumers can
          // phrase "wrong shape" without a per-field message.
          message: messageFor(field, field.pattern ? "pattern" : "required", "Please fill this in."),
        };
    }

    // Cross-field equality: wrap whatever the type rule built. The base rule
    // still runs (format/length), then the value must equal the target's. An
    // empty confirm stays a pure required-check (you can't "match" a blank).
    const base = rules[name];
    if (base && field.sameAs && field.sameAs !== name) {
      const target = field.sameAs;
      rules[name] = {
        ...base,
        test: (value, ctx) => {
          if (!base.test(value, ctx)) return false;
          if (value === "") return true;
          return matchesTarget(target, value, ctx);
        },
        message: messageFor(field, "sameAs", "These values must match."),
      };
    }
  }
  return rules;
}

/**
 * Validate one value against a rule. The value should already represent the
 * field's current state (checkbox/radio groups are collapsed to "1" / "" by
 * the component before calling this); `ctx` supplies the sibling values and
 * the field's own entries that cross-field rules read. Returns the message to
 * show, or null when the value passes.
 */
export function validateValue(rule: Rule | undefined, value: string, ctx?: RuleContext): string | null {
  if (!rule) return null;
  const message = typeof rule.message === "function" ? rule.message(value, ctx) : rule.message;
  if (rule.required && !value) return message;
  if (value && !rule.test(value, ctx)) return message;
  return null;
}

/* ---- Validation seam ---- */

/**
 * Pluggable rule builder. The default (`vanillaValidation`) derives per-field
 * rules from the spec's type/required/min/max/message — everything downstream
 * (the DOM engine, React adapter, TanStack bridge) validates through opaque
 * `Rule` objects, so swapping the provider changes *which* rules run, never
 * *how* they run.
 *
 * ```ts
 * const provider: ValidationProvider = {
 *   buildRules(fields, copy) { …your rules, e.g. derived from a Zod schema… },
 * };
 * renderForm("#root", spec, { validation: provider });
 * ```
 */
export interface ValidationProvider {
  /** Build the per-field rules a form's client field specs validate against. */
  buildRules(fields: FieldSpec[], copy?: FormCopy): Record<string, Rule>;
}

/** The built-in provider — the regex rules `buildRules` ships with. */
export const vanillaValidation: ValidationProvider = { buildRules };

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
    // Repeaters group their rows into one JSON-array entry. Each rendered
    // row contributes a sentinel entry (`name` = the repeater's name, emitted
    // by the markup builders), so row boundaries reconstruct from the
    // FormData's tree-ordered iteration without renaming the row fields
    // themselves. Files inside a row travel as their filenames, exactly like
    // scalar file fields.
    if (field.type === "repeater" && field.repeater) {
      const innerNames = new Set(field.repeater.map((inner) => inner.name));
      const rows: Record<string, string>[] = [];
      let current: Record<string, string> | null = null;
      for (const [key, value] of data.entries()) {
        if (key === field.name) {
          current = {};
          rows.push(current);
          continue;
        }
        if (!current || !innerNames.has(key)) continue;
        const text = value instanceof File ? value.name : String(value).trim();
        if (!text) continue;
        current[key] = current[key] ? `${current[key]}, ${text}` : text;
      }
      // Entirely-empty rows (e.g. an untouched starter row) don't pollute the
      // array — unless the spec mandates a floor, in which case the earliest
      // blank rows pad the output back up to `minRows`, preserving order.
      const empty = (row: Record<string, string>): boolean => Object.keys(row).length === 0;
      const floor = field.minRows ?? 0;
      let pad = 0;
      if (floor > 0) {
        const nonEmpty = rows.filter((row) => !empty(row)).length;
        if (nonEmpty < floor) pad = floor - nonEmpty;
      }
      const kept: Record<string, string>[] = [];
      for (const row of rows) {
        if (!empty(row)) kept.push(row);
        else if (pad > 0) {
          kept.push(row);
          pad--;
        }
      }
      payload.set(field.name, JSON.stringify(kept));
      continue;
    }
    const values = data
      .getAll(field.name)
      // File fields travel as the attached filename(s) in the canonical
      // payload — a JSON endpoint gets names, not bytes ("a.txt, b.txt" for
      // a multiple file input). The cf7 mailer re-attaches the real File
      // objects from `data`, so the email path still gets the upload.
      .map((value) => (value instanceof File ? value.name : value))
      .map((value) => String(value).trim())
      .filter(Boolean);
    payload.set(field.name, values.length > 1 ? values.join(", ") : (values[0] ?? ""));
  }
  return payload;
}