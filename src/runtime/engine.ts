/**
 * Client-side contact-form engine (framework-agnostic).
 *
 * This is the runtime that used to live inside ContactForm.astro's `<script>`:
 * validation wiring, the conditional-field visibility engine, the wizard state
 * machine, the honeypot and the submit → mailer dispatch. It is plain DOM code
 * with no framework or bundler assumptions, so any framework binding can render
 * the `rf-*` markup (see `markup.ts`) and hand it over with `attachForm`.
 *
 * Two entry points:
 * - `attachForm(form, opts?)` — wire one rendered form; returns
 *   `{ on(event, handler), detach() }` — a detached-safe `rf:*` event bus plus
 *   a detach that removes every listener (safe for React StrictMode / hot
 *   reload).
 * - `initForms(root?)` — wire every `form[data-mail-form]` under a root
 *   (used by the Astro shell's script tag).
 *
 * A form normally carries everything the engine needs serialised on its
 * `data-*` attributes (rendered by `renderFormShell`); `attachForm` accepts an
 * optional `spec`/`config` override for forms rendered outside the shell.
 */
import {
  buttonLabel,
  buttonVariant,
  evaluateVisibility,
  parseFieldSpec,
  toFieldSpecs,
  toSteps,
  validateValue,
  vanillaValidation,
  visibilityFields,
  visibleNames,
  type ButtonVariant,
  type FieldSpec,
  type FormCopy,
  type FormSpec,
  type HookName,
  type Rule,
  type RuleContext,
  type ValidateOn,
  type ValidationProvider,
  type VisibilityConditionLike,
} from "../core";
import { getMailer, type MailerConfig } from "../mailers";
import {
  applyDraft,
  applyValues,
  captureDraft,
  countRepeaterRows,
  createDraftStore,
  type DraftEntry,
} from "./persist";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Status = HTMLElement | null;
type Handler = (event: Event) => void;

/* ---- Live validation timing (`validateOn`) ---- */

/** The proactive validation events `FormSpec.validateOn` can select. */
export type LiveValidateMode = "blur" | "change" | "touched";

/**
 * Normalise a `validateOn` value (spec key, runtime override or the space-
 * joined `data-validate-on` attribute) into the set of live modes to run.
 * `"submit"` / absence means the empty set — submit-only validation.
 */
const normalizeValidateOn = (raw: ValidateOn | string | undefined): Set<LiveValidateMode> =>
  new Set(
    (
      raw === undefined
        ? []
        : Array.isArray(raw)
          ? raw
          : raw.split(/\s+/).filter(Boolean)
    ).filter((mode): mode is LiveValidateMode => mode !== "submit"),
  );

/* ---- Events (the `rf:*` bus) + lifecycle hooks ---- */

/** Context shared by the step lifecycle hooks. */
export interface StepHookContext {
  /** Step being left (or the current step for `beforeValidateStep`). */
  from: number;
  /** Step being entered (or `from + 1` for a "Next" advance). */
  to: number;
  /** The form being driven. */
  form: HTMLFormElement;
}

/** Context for `beforeSubmit` (and the `rf:submit-start` event detail). */
export interface BeforeSubmitContext {
  form: HTMLFormElement;
  /** The form's identity (`data-mail-form` name) — a stable analytics id. */
  name: string;
  /** The form element's DOM id (may be empty). */
  id: string;
}

/** Context for `afterSubmit`. */
export interface AfterSubmitContext extends BeforeSubmitContext {
  /** `true` when the mailer accepted the submission. */
  ok: boolean;
  /** The success or error message shown to the visitor. */
  message: string;
}

export type StepHook = (ctx: StepHookContext) => boolean | void;
export type SubmitHook = (ctx: BeforeSubmitContext) => boolean | void;
export type AfterSubmitHook = (ctx: AfterSubmitContext) => void;

/**
 * Lifecycle hooks available on the attach options. Every hook is optional and
 * the step/submit hooks are **veto-capable**: returning `false` cancels the
 * operation (the step doesn't advance / the form doesn't submit).
 */
export interface WizardHooks {
  /** Runs before "Next" validates the current step; `false` cancels the advance. */
  beforeValidateStep?: StepHook;
  /** Runs after a step change completes (stepper jump, Next, Back). */
  afterStepChange?: StepHook;
  /** Runs after validation passes, before the mailer; `false` cancels submission. */
  beforeSubmit?: SubmitHook;
  /** Runs after the mailer resolves (success or error; never on a veto). */
  afterSubmit?: AfterSubmitHook;
}

/**
 * The `hooks` field on attach options: the four lifecycle hooks plus a named
 * registry the spec's hook-ref *names* resolve against — `{ "trackLead": fn }`
 * lets a spec's `hooks: { beforeSubmit: "trackLead" }` wire a declarative
 * callback (specs stay JSON-serialisable: names, never functions).
 */
export type HookRegistry = WizardHooks & Record<string, StepHook | SubmitHook | AfterSubmitHook>;

/** Event names the attach result's `on()` accepts — the namespaced `rf:*` bus. */
export type FormEventName =
  | "rf:fields-change"
  | "rf:row-add"
  | "rf:row-remove"
  | "rf:step-change"
  | "rf:submit-start"
  | "rf:submit-success"
  | "rf:submit-error";

/** The result of `attachForm`: a detach-safe event subscription + cleanup. */
export interface AttachedForm {
  /** Subscribe to a `rf:*` event on the form. Removed by `detach()` like every listener. */
  on(event: FormEventName, handler: (event: CustomEvent) => void): void;
  /** Remove every listener (incl. `on` subscriptions) and injected error DOM. */
  detach(): void;
}

/* ---- Field error state ---- */

// Error lookup is scoped to the field's own `.rf-field` wrapper — a control with
// no wrapper (the honeypot lives directly under the form) can never see or
// disturb another field's error.
const findError = (control: Control): HTMLElement | null =>
  control.closest(".rf-field")?.querySelector(".rf-field-error") ?? null;

const clearError = (control: Control): void => {
  findError(control)?.remove();
  control.removeAttribute("aria-invalid");
  control.classList.remove("rf-input-invalid");
};

const setInvalid = (control: Control, message: string): void => {
  let el = findError(control);
  if (!el) {
    el = document.createElement("p");
    el.className = "rf-field-error";
    control.parentElement?.appendChild(el);
  }
  el.textContent = message;
  control.setAttribute("aria-invalid", "true");
  control.classList.add("rf-input-invalid");
};

// Checkbox/radio groups share a name — the "value" is whether any option is
// selected, collapsed to "1" / "" before validation. When `row` is given (a
// repeater row), only that row's members count, so parallel rows don't leak
// into each other's group state.
const selectionState = (form: HTMLFormElement, name: string, row: HTMLElement | null = null): string => {
  const scope = row ?? form;
  const checked = Array.from(scope.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)).some(
    (el) => el.checked,
  );
  return checked ? "1" : "";
};

/**
 * Trimmed, non-empty values of the controls named `name` within `root` (the
 * form, or a single repeater row). Checkbox/radio groups contribute only
 * their checked option values; controls inside a hidden wrapper contribute
 * nothing (so chains stay predictable); file inputs can't drive values.
 */
const valuesWithin = (root: ParentNode, name: string, isHidden: (control: Control) => boolean): string[] => {
  const values: string[] = [];
  for (const control of root.querySelectorAll<Control>("input, select, textarea")) {
    if (control.name !== name || isHidden(control)) continue;
    if (control instanceof HTMLInputElement && control.type === "file") continue;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      if (control.checked && control.value.trim()) values.push(control.value.trim());
    } else {
      const value = control.value.trim();
      if (value) values.push(value);
    }
  }
  return values;
};

/* ---- Conditional fields (showWhen) ---- */

interface VisibilityEngine {
  /** Re-evaluate every conditional field against the current control values. */
  apply: () => void;
  /** True when the named control is a driving field of some condition. */
  isController: (name: string) => boolean;
  /** True when the control sits inside a currently-hidden field wrapper. */
  isHiddenControl: (control: Control) => boolean;
  /** The spec fields the visitor currently sees — what gets validated and sent. */
  visibleFields: () => FieldSpec[];
  /**
   * Trimmed, non-empty values of every in-scope control (hidden wrappers and
   * file inputs excluded) — the context cross-field validation rules
   * (`sameAs`) read.
   */
  allValues: () => Record<string, string[]>;
}

const createVisibilityEngine = (
  form: HTMLFormElement,
  fields: FieldSpec[],
): VisibilityEngine => {
  const visibilityByField = new Map<string, VisibilityConditionLike[]>();
  const controllerNames = new Set<string>();
  for (const field of fields) {
    if (field.visibility?.length) {
      visibilityByField.set(field.name, field.visibility);
      // Recursive through anyOf/noneOf/not wrappers — every controlling field
      // gets an input/change listener, whatever its depth.
      for (const name of visibilityFields(field.visibility)) controllerNames.add(name);
    }
  }

  // Trimmed, non-empty values of the controls named `name`. Checkbox/radio
  // groups contribute only their checked option values; controls inside a
  // currently-hidden wrapper contribute nothing (so chains stay predictable).
  const valuesOf = (name: string): string[] => valuesWithin(form, name, isHiddenControl);

  const currentValues = (): Record<string, string[]> =>
    Object.fromEntries([...controllerNames].map((name) => [name, valuesOf(name)]));

  const allValues = (): Record<string, string[]> => {
    const names = new Set<string>();
    for (const control of form.querySelectorAll<Control>("input, select, textarea")) {
      if (isHiddenControl(control)) continue;
      if (control instanceof HTMLInputElement && control.type === "file") continue;
      names.add(control.name);
    }
    return Object.fromEntries([...names].map((name) => [name, valuesOf(name)]));
  };

  // A control is out of scope while its field wrapper is hidden — it is not
  // validated, not sent, and does not drive other conditions. Repeater rows
  // carry their controls in `.rf-repeater-row` wrappers rather than a
  // `.rf-field`, so a hidden repeater fieldset hides every row's controls too.
  // A control inside a *skipped* wizard pane (`data-step-skipped`, set by the
  // engine when a step's `showWhen` doesn't hold) is equally out of scope —
  // conditional steps and conditional fields share the same semantics.
  const isHiddenControl = (control: Control): boolean => {
    const wrapper = control.closest<HTMLElement>(".rf-field");
    if (wrapper !== null && (wrapper.hidden || wrapper.classList.contains("rf-field--hidden"))) return true;
    const repeater = control.closest<HTMLElement>("[data-repeater]");
    if (repeater !== null && (repeater.hidden || repeater.classList.contains("rf-field--hidden"))) return true;
    return control.closest<HTMLElement>("[data-pane][data-step-skipped]") !== null;
  };

  const apply = (): void => {
    if (visibilityByField.size === 0) return;
    const values = currentValues();
    for (const [fieldName, conditions] of visibilityByField) {
      const field = fields.find((candidate) => candidate.name === fieldName);
      // Scalar fields live in a `.rf-field` wrapper; repeater fields wrap
      // themselves in a `<fieldset data-repeater="…">`. Both toggle the same
      // hidden state and clear their in-scope errors when hidden.
      const control = form.querySelector<Control>(`[name="${CSS.escape(fieldName)}"]`);
      const wrapper =
        field?.type === "repeater"
          ? form.querySelector<HTMLElement>(`[data-repeater="${CSS.escape(fieldName)}"]`)
          : (control?.closest<HTMLElement>(".rf-field") ?? null);
      if (!wrapper) continue;
      const visible = evaluateVisibility(conditions, values);
      const wasHidden = wrapper.hidden || wrapper.classList.contains("rf-field--hidden");
      wrapper.hidden = !visible;
      wrapper.classList.toggle("rf-field--hidden", !visible);
      // Freshly hidden — drop any stale error state the visitor is no longer
      // meant to see (it will re-validate when the field returns).
      if (!wasHidden && !visible) {
        for (const fieldControl of Array.from(wrapper.querySelectorAll<Control>("input, select, textarea"))) {
          clearError(fieldControl);
        }
      }
    }
  };

  const visibleFields = (): FieldSpec[] => {
    if (visibilityByField.size === 0) return fields;
    const visible = visibleNames(fields, currentValues());
    return fields.filter((field) => visible.has(field.name));
  };

  return {
    apply,
    isController: (name) => controllerNames.has(name),
    isHiddenControl,
    visibleFields,
    allValues,
  };
};

/**
 * The field's own current values for RuleContext.selfValues: every checked
 * option of a checkbox/radio group, every selected option of a multi-select,
 * else the single trimmed value. Required by the `minSelect`/`maxSelect`
 * rules; the collapsed "1"/"" string is what the required check reads. When
 * `row` is given (a repeater row), the group's members are those of that row
 * only, so parallel rows validate their own selections.
 */
const selfValuesFor = (control: Control, form: HTMLFormElement, row: HTMLElement | null = null): string[] => {
  if (control instanceof HTMLSelectElement) {
    return control.multiple
      ? Array.from(control.selectedOptions).map((o) => o.value.trim()).filter(Boolean)
      : [control.value.trim()].filter(Boolean);
  }
  if (control instanceof HTMLInputElement && control.type === "file") return [];
  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
    const scope = row ?? form;
    return Array.from(
      scope.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(control.name)}"]`),
    )
      .filter((el) => el.checked)
      .map((el) => el.value.trim())
      .filter(Boolean);
  }
  return [control.value.trim()].filter(Boolean);
};

const validateField = (
  control: Control,
  rule: Rule | undefined,
  form: HTMLFormElement,
  getValues?: () => Record<string, string[]>,
  row: HTMLElement | null = null,
): boolean => {
  clearError(control);
  let value: string;
  if (control instanceof HTMLInputElement && control.type === "file") {
    // A file field is "filled" when at least one file is attached.
    value = control.files && control.files.length > 0 ? "1" : "";
  } else if (
    control instanceof HTMLInputElement &&
    (control.type === "checkbox" || control.type === "radio")
  ) {
    value = selectionState(form, control.name, row);
  } else {
    value = control instanceof HTMLSelectElement ? control.value : control.value.trim();
  }
  const ctx: RuleContext = {
    values: getValues?.() ?? {},
    selfValues: selfValuesFor(control, form, row),
    // File bounds (maxSize / allowedTypes / minFiles / maxFiles) read the
    // attached files' descriptors — never the bytes, so no payload copies.
    files:
      control instanceof HTMLInputElement && control.type === "file" && control.files
        ? Array.from(control.files).map((file) => ({ name: file.name, size: file.size, type: file.type }))
        : undefined,
  };
  const message = validateValue(rule, value, ctx);
  if (message) {
    setInvalid(control, message);
    return false;
  }
  return true;
};

/** Keep a `maxLength` character counter in sync with the control's input. */
const updateCounter = (control: Control): void => {
  const counter = control.closest<HTMLElement>(".rf-field")?.querySelector<HTMLElement>(".rf-counter");
  const max = counter?.dataset.max;
  if (!counter || max === undefined) return;
  counter.textContent = `${String(control.value).length} / ${max}`;
};

/* ---- Repeaters (dynamic row groups) ---- */

// A block-level error pinned to a repeater fieldset (its row count left
// minRows..maxRows). It is appended straight under the fieldset — outside any
// `.rf-field` — so it never collides with a row's per-control error.
const findRepeaterError = (repeater: HTMLElement): HTMLElement | null =>
  Array.from(repeater.children).find(
    (el): el is HTMLElement => el.classList.contains("rf-repeater-error"),
  ) ?? null;

const clearRepeaterErrors = (scope: ParentNode): void => {
  scope.querySelectorAll(".rf-repeater-error").forEach((el) => el.remove());
};

const showRepeaterError = (repeater: HTMLElement, message: string): void => {
  let el = findRepeaterError(repeater);
  if (!el) {
    el = document.createElement("p");
    el.className = "rf-field-error rf-repeater-error";
    repeater.appendChild(el);
  }
  el.textContent = message;
};

/**
 * Re-index a cloned repeater row. The markup stamps each row's ids with a
 * `-row{i}__` token (`{prefix}__{repeater}-row{i}__{field}`), so a clone must
 * rewrite that token — plus its own `data-row` and sentinel value — to its new
 * index, keeping ids unique across rows. `for` / `aria-labelledby` / `list`
 * point at ids, so they are rewritten too.
 */
const reindexRow = (clone: HTMLElement, index: number): void => {
  const from = clone.dataset.row ?? "0";
  clone.dataset.row = String(index);
  const sentinel = clone.querySelector<HTMLInputElement>("[data-repeater-sentinel]");
  if (sentinel) sentinel.value = String(index);
  const token = `-row${from}__`;
  const next = `-row${index}__`;
  const rewrite = (el: Element): void => {
    for (const attrName of ["id", "for", "aria-labelledby", "list"] as const) {
      const attr = el.getAttribute(attrName);
      if (attr && attr.includes(token)) el.setAttribute(attrName, attr.split(token).join(next));
    }
  };
  clone.querySelectorAll<Element>("[id]").forEach(rewrite);
  clone.querySelectorAll<Element>("[for]").forEach(rewrite);
  clone.querySelectorAll<Element>("[aria-labelledby]").forEach(rewrite);
  clone.querySelectorAll<Element>("[list]").forEach(rewrite);
};

/* ---- Status box ---- */

const showSuccess = (status: Status, message: string): void => {
  if (!status) return;
  status.classList.remove("rf-status--error");
  status.hidden = false;
  status.textContent = message;
};

const showError = (status: Status, message: string): void => {
  if (!status) return;
  status.classList.add("rf-status--error");
  status.hidden = false;
  status.textContent = message;
};

const hideStatus = (status: Status): void => {
  if (!status) return;
  status.classList.remove("rf-status--error");
  status.hidden = true;
};

async function handleSubmit(
  event: Event,
  fields: FieldSpec[],
  rules: Record<string, Rule>,
  mailerName: string,
  successMessage: string,
  copy: FormCopy,
  visibility: VisibilityEngine,
  scopedControls?: Control[],
  /** Row-aware per-control validation (supplied by `attachForm`). */
  validateControl?: (control: Control) => boolean,
  /** Resolved submit lifecycle hooks (see `attachForm`). */
  hooks?: { beforeSubmit?: SubmitHook; afterSubmit?: AfterSubmitHook },
  /**
   * `false` — the consumer owns the success presentation: the engine never
   * shows the success status box and never collapses a `statusMode:
   * "replace"` form on success (the error box, the reset and the
   * `rf:submit-success` event stay engine-driven). Defaults to `true`.
   */
  autoSuccess = true,
  /** Marks a submit attempt — unlocks "touched" live validation (see attach). */
  markSubmitAttempt?: () => void,
): Promise<void> {
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  const genericError = copy.error ?? "Something went wrong. Please try again in a moment.";

  const status = form.querySelector<HTMLElement>(".rf-status");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  hideStatus(status);

  // Honeypot: a filled hidden field means a bot — pretend success, send nothing.
  const honeypot = form.querySelector<HTMLInputElement>("[data-honeypot]");
  if (honeypot && honeypot.value.trim() !== "") {
    if (autoSuccess) {
      showSuccess(status, successMessage);
      if (form.dataset.statusMode === "replace") form.classList.add("rf-form--success");
    }
    form.reset();
    return;
  }

  // Conditional fields: recompute visibility against the latest values, so
  // validation and the payload reflect exactly what the visitor sees.
  visibility.apply();

  const controls =
    scopedControls ??
    Array.from(form.elements).filter(
      (el): el is Control =>
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement,
    );

  // Fields inside hidden wrappers are out of scope — a hidden conditional
  // field can never block the form, and it never reaches the payload.
  const scoped = controls.filter((control) => !visibility.isHiddenControl(control));

  // A submit attempt unlocks "touched" live validation for every in-scope
  // field (see attachForm's `validateOn` mode) — even a failed attempt.
  markSubmitAttempt?.();

  const validate = validateControl ?? ((control: Control) => validateField(control, rules[control.name], form, () => visibility.allValues()));

  const invalidControls = scoped.filter((control) => !validate(control));

  if (invalidControls.length > 0) {
    invalidControls[0].focus();
    return;
  }

  // Repeaters must hold minRows..maxRows rows — normally enforced by the
  // add/remove button bounds, but a stale clone or a tight spec could get
  // here, so guard the submitted state (defence-in-depth; disabled buttons
  // already prevent it in normal use).
  clearRepeaterErrors(form);
  for (const repeaterEl of Array.from(form.querySelectorAll<HTMLElement>("[data-repeater]"))) {
    if (
      repeaterEl.hidden ||
      repeaterEl.classList.contains("rf-field--hidden") ||
      repeaterEl.closest("[data-pane][data-step-skipped]") !== null
    ) continue;
    const repeaterName = repeaterEl.dataset.repeater ?? "";
    const specField = fields.find((field) => field.name === repeaterName);
    const min = Number(repeaterEl.dataset.repeaterMin ?? 0);
    const max = repeaterEl.dataset.repeaterMax ? Number(repeaterEl.dataset.repeaterMax) : Infinity;
    const count = repeaterEl.querySelectorAll<HTMLElement>("[data-repeater-row]").length;
    if (count < min) {
      const defaultMin =
        min === 1 ? "Please add at least 1 row." : `Please add at least ${min} rows.`;
      showRepeaterError(repeaterEl, specField?.message ?? defaultMin);
      (repeaterEl.querySelector<HTMLElement>("[data-add-row]") ?? repeaterEl.querySelector<HTMLElement>("input, select, textarea"))?.focus();
      return;
    }
    if (count > max) {
      const overshoot = count - max;
      const defaultMax =
        overshoot === 1 ? "Please remove at least 1 row." : `Please remove at least ${overshoot} rows.`;
      showRepeaterError(repeaterEl, specField?.message ?? defaultMax);
      (repeaterEl.querySelector<HTMLElement>("[data-remove-row]") ?? repeaterEl.querySelector<HTMLElement>("input, select, textarea"))?.focus();
      return;
    }
  }

  const originalLabel = button?.textContent ?? "";
  const sendingLabel = copy.sending ?? "Sending…";
  const setSending = (sending: boolean): void => {
    if (!button) return;
    button.disabled = sending;
    button.setAttribute("aria-busy", String(sending));
    button.textContent = sending ? sendingLabel : originalLabel;
  };

  // The `rf:*` submit bus: dispatch named custom events on the form so attach
  // subscribers (and native `addEventListener`) observe the submit lifecycle.
  const formName = form.dataset.mailForm ?? "";
  const formId = form.id;
  const emit = (name: string, detail?: unknown): void => {
    form.dispatchEvent(new CustomEvent(name, { detail }));
  };
  const submitContext: BeforeSubmitContext = { form, name: formName, id: formId };

  // Lifecycle hook — vetoing cancels the submission outright (no mailer call,
  // no `rf:submit-start`).
  if (hooks?.beforeSubmit?.(submitContext) === false) return;
  emit("rf:submit-start", submitContext);

  const config: MailerConfig = {
    endpoint: form.dataset.endpoint,
    apiUrl: form.dataset.wpUrl,
    formId: form.dataset.formId,
    copy,
  };

  setSending(true);
  let ok = false;
  let message = successMessage;
  try {
    const result = await getMailer(mailerName).submit({
      data: new FormData(form),
      // Only the visible fields travel — mailers build the canonical payload
      // from this list, so hidden conditional fields are excluded outright.
      fields: visibility.visibleFields(),
      config,
    });
    if (result.ok) {
      ok = true;
      if (autoSuccess) {
        // replace mode — the success box takes the form's place entirely.
        if (form.dataset.statusMode === "replace") form.classList.add("rf-form--success");
        showSuccess(status, successMessage);
      }
      form.reset();
      controls.forEach((control) => clearError(control));
      clearRepeaterErrors(form);
      emit("rf:submit-success", { name: formName, id: formId, message: successMessage });
    } else {
      message = result.message || genericError;
      showError(status, message);
      emit("rf:submit-error", { name: formName, id: formId, message });
    }
  } catch (error) {
    message = error instanceof Error && error.message ? error.message : genericError;
    showError(status, message);
    emit("rf:submit-error", { name: formName, id: formId, message });
  } finally {
    setSending(false);
  }
  hooks?.afterSubmit?.({ ok, message, form, name: formName, id: formId });
}

/* ---- Attach / detach ---- */

export interface AttachOptions {
  /**
   * Full form spec — used when the form was rendered without the shell's
   * `data-*` serialisation (custom markup). When absent the engine reads the
   * serialised spec off the form's attributes.
   */
  spec?: FormSpec;
  /** Explicit config overrides — win over the form's data-* attributes. */
  config?: Partial<MailerConfig>;
  /**
   * Validation provider — swaps which rules run. Defaults to the package's
   * vanilla rules (`vanillaValidation`); pass e.g. a Zod-derived provider
   * (see `@clearstorm/contact-form/validation`) to validate differently.
   */
  validation?: ValidationProvider;
  /**
   * Lifecycle hooks (`beforeValidateStep` / `afterStepChange` /
   * `beforeSubmit` / `afterSubmit` — the step/submit hooks veto by returning
   * `false`). Named entries here are also the registry the spec's hook-ref
   * *names* resolve against: with `hooks: { "trackLead": fn }`, a spec's
   * `hooks: { beforeSubmit: "trackLead" }` wires `fn`. Inline hooks win.
   */
  hooks?: HookRegistry;
  /**
   * Pre-fill matching controls after attach: `{ name: value }` (or a list for
   * checkbox/radio groups and multi-selects). Applied after draft restore, so
   * explicit values always beat a stored `autoSave` draft. Not serialised —
   * this is a runtime-only option.
   */
  values?: Record<string, string | string[]>;
  /**
   * Override the form's `validateOn` timing at attach time (wins over the
   * spec key and the shell's `data-validate-on`). Not serialised.
   */
  validateOn?: ValidateOn;
  /**
   * `false` — the consumer owns the *success* presentation: the engine never
   * shows the success status box and never adds `rf-form--success` on
   * success (field-level errors, the reset, the error box and the
   * `rf:submit-success` event all stay engine-driven). Pair with an
   * `rf:submit-success` listener — or the React `renderStatus` prop — to
   * swap in your own success UI. Defaults to `true`.
   */
  autoSuccess?: boolean;
}

interface StepsMeta {
  steps: { label: string; submit?: string; showWhen?: VisibilityConditionLike[] }[];
  next: { label: string; variant: ButtonVariant };
  prev: { label: string; variant: ButtonVariant };
  submit: { label: string; variant: ButtonVariant };
}

const stepsMetaFromSpec = (form: FormSpec): StepsMeta => {
  const layout = toSteps(form.fields);
  return {
    steps: layout.steps.map((step) => ({
      label: step.label,
      submit: step.submit,
      ...(step.showWhen ? { showWhen: step.showWhen } : {}),
    })),
    next: { label: buttonLabel(form.next, "Next"), variant: buttonVariant(form.next, "primary") },
    prev: { label: buttonLabel(form.prev, "Back"), variant: buttonVariant(form.prev, "secondary") },
    submit: {
      label: layout.steps[layout.steps.length - 1]?.submit ?? buttonLabel(form.submit, "Submit"),
      variant: buttonVariant(form.submit, "primary"),
    },
  };
};

/** Opt-in: `prefill="datetime"` fills date/time inputs with "now". */
const applyPrefill = (form: HTMLFormElement): void => {
  if (form.dataset.prefill !== "datetime") return;
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const todayValue = localNow.toISOString().slice(0, 10);
  const nowValue = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateInput = form.querySelector<HTMLInputElement>('input[name="date"]');
  if (dateInput && !dateInput.value) {
    dateInput.min = todayValue;
    dateInput.value = todayValue;
  }
  const timeInput = form.querySelector<HTMLInputElement>('input[name="time"]');
  if (timeInput && !timeInput.value) timeInput.value = nowValue;
};

/**
 * Wire a rendered contact form: build rules, visibility engine and wizard
 * state, then attach every listener (submit, controller input/change,
 * per-control re-validation, stepper jumps, footer Back/Next, prefill).
 * Returns `{ on(event, handler), detach() }` — `on` subscribes to the `rf:*`
 * event bus through the same detach-safe registry (native `addEventListener`
 * on the form sees the same events), and `detach` removes every listener and
 * cleans injected error DOM; call it on unmount (React StrictMode / hot
 * reload safe).
 */
export function attachForm(form: HTMLFormElement, opts: AttachOptions = {}): AttachedForm {
  /* Listener registry — every listener added here can be removed on detach. */
  const listeners = new Map<EventTarget, Map<string, Set<Handler>>>();
  const on = (target: EventTarget, type: string, handler: Handler): void => {
    target.addEventListener(type, handler as EventListener);
    let byType = listeners.get(target);
    if (!byType) {
      byType = new Map();
      listeners.set(target, byType);
    }
    let set = byType.get(type);
    if (!set) {
      set = new Set();
      byType.set(type, set);
    }
    set.add(handler);
  };

  applyPrefill(form);

  const spec = opts.spec;
  const fields = spec ? toFieldSpecs(spec.fields) : parseFieldSpec(form.dataset.rules ?? "");
  let copy: FormCopy = {};
  if (spec?.copy) copy = spec.copy;
  else if (form.dataset.copy) {
    try {
      copy = JSON.parse(form.dataset.copy) as FormCopy;
    } catch {
      /* malformed copy — keep defaults */
    }
  }
  const rules = (opts.validation ?? vanillaValidation).buildRules(fields, copy);
  const mailerName = spec?.mailer ?? form.dataset.mailer ?? "cf7";
  const status = form.querySelector<HTMLElement>(".rf-status");
  const successMessage = spec?.status ?? status?.textContent ?? "";

  const visibility = createVisibilityEngine(form, fields);
  const getValues = (): Record<string, string[]> => visibility.allValues();

  /* ---- Live validation timing (`validateOn`) ----
     Resolution order: runtime override → spec key → the shell's serialised
     `data-validate-on`. Modes select which events proactively validate a
     *pristine* control; the submit path and the error-driven re-validation of
     already-flagged controls always run. In "touched" mode a field is only
     validated live once it has been left at least once (its first blur) or a
     submit attempt has been made. */
  const autoSuccess = opts.autoSuccess !== false;
  const validateOn = normalizeValidateOn(opts.validateOn ?? spec?.validateOn ?? form.dataset.validateOn);
  const touchedNames = new Set<string>();
  let submittedOnce = false;
  const markSubmitAttempt = (): void => {
    submittedOnce = true;
  };
  const shouldLiveValidate = (control: Control, kind: LiveValidateMode): boolean => {
    if (visibility.isHiddenControl(control)) return false;
    if (kind === "blur" && validateOn.has("blur")) return true;
    if (kind === "change" && validateOn.has("change")) return true;
    return validateOn.has("touched") && (submittedOnce || touchedNames.has(control.name));
  };

  /* ---- The `rf:*` event bus + lifecycle hooks ---- */

  const emit = (name: string, detail?: unknown): void => {
    form.dispatchEvent(new CustomEvent(name, { detail }));
  };

  // Resolve a lifecycle hook: the inline canonical key wins; else the spec's
  // hook-ref *name*, looked up in the options' named registry.
  const hookFor = (name: HookName): StepHook | SubmitHook | AfterSubmitHook | undefined => {
    const direct = opts.hooks?.[name];
    if (direct) return direct;
    const ref = spec?.hooks?.[name];
    return ref ? opts.hooks?.[ref] : undefined;
  };

  const submitHooks = {
    beforeSubmit: hookFor("beforeSubmit") as SubmitHook | undefined,
    afterSubmit: hookFor("afterSubmit") as AfterSubmitHook | undefined,
  };

  const isControl = (el: Element): el is Control =>
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement;

  /* ---- Repeaters (dynamic row groups): row-scoped validation ---- */

  // Repeater rules are keyed `{repeater}.{inner}` in `buildRules`; the row
  // the control sits in tells us which repeater's qualified lookup to use.
  // Cross-field rules inside a row read the row's *own* values (parallel rows
  // stay separate: a confirm-email matches the email of its own row).
  const repeaterInnerNames = new Map<string, Set<string>>();
  for (const field of fields) {
    if (field.type === "repeater" && field.repeater) {
      repeaterInnerNames.set(field.name, new Set(field.repeater.map((inner) => inner.name)));
    }
  }

  const ruleForControl = (control: Control): Rule | undefined => {
    const row = control.closest<HTMLElement>("[data-repeater-row]");
    const repeater = row?.closest<HTMLElement>("[data-repeater]");
    if (row && repeater) return rules[`${repeater.dataset.repeater}.${control.name}`];
    return rules[control.name];
  };

  const rowValues = (row: HTMLElement): Record<string, string[]> => {
    const innerNames = repeaterInnerNames.get(row.closest<HTMLElement>("[data-repeater]")?.dataset.repeater ?? "");
    const global = visibility.allValues();
    if (!innerNames || innerNames.size === 0) return global;
    const scoped: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(global)) {
      // Keep every cross-repeater/outer value, then override the row's own
      // inner names with this row's values (all rows share inner names).
      if (!innerNames.has(key)) scoped[key] = value;
    }
    for (const innerName of innerNames) {
      const values = valuesWithin(row, innerName, visibility.isHiddenControl);
      if (values.length) scoped[innerName] = values;
    }
    return scoped;
  };

  const validateControl = (control: Control): boolean => {
    const row = control.closest<HTMLElement>("[data-repeater-row]");
    return validateField(control, ruleForControl(control), form, row ? () => rowValues(row) : getValues, row);
  };

  /* ---- Wizard (multi-step) state ----
     Panes and the shared prefix all stay in the DOM (hidden + inert), so
     cross-step showWhen conditions keep reading earlier steps' values and
     every step's fields travel in the payload. "Next" validates only the
     current step's in-scope fields; the final button validates the visible
     form (current step + shared prefix) and submits. */
  let stepsMeta: StepsMeta | null = null;
  if (spec) stepsMeta = stepsMetaFromSpec(spec);
  else if (form.dataset.steps) {
    try {
      stepsMeta = JSON.parse(form.dataset.steps) as StepsMeta;
    } catch {
      /* malformed steps — treat as single-page */
    }
  }
  const stepCount = stepsMeta?.steps.length ?? 0;
  const isWizard = stepCount > 1;
  let currentStep = 0;

  const paneScopeFor = (step: number): Control[] =>
    Array.from(form.elements)
      .filter(isControl)
      .filter((control) => {
        const pane = control.closest<HTMLElement>("[data-pane]");
        return pane === null || Number(pane.dataset.pane) === step;
      });

  /* ---- Conditional steps ----
     A `showWhen` on a step marker makes its whole pane conditional: while its
     conditions don't hold the pane is marked `data-step-skipped` (the markup
     leaves it visible, the engine hides it), and every traversal — Next, Back,
     jumps and the visible sequence — skips it. A skipped pane behaves exactly
     like a hidden field wrapper downstream: `isHiddenControl` reads the marker,
     so its controls never validate and never reach the payload. Authored step
     indices never change — the engine computes a *visible* sequence over them,
     and `rf:step-change`'s `total` counts only visible steps. */
  const skipped = (step: number): boolean =>
    form.querySelector<HTMLElement>(`[data-pane="${step}"]`)?.hasAttribute("data-step-skipped") ===
    true;

  // Step conditions may only read the shared prefix or earlier steps (core
  // warns otherwise); their controllers join the field controllers so the same
  // input/change listener re-evaluates both.
  const stepControllers = new Set<string>();
  for (const meta of stepsMeta?.steps ?? []) {
    if (meta.showWhen?.length) {
      for (const name of visibilityFields(meta.showWhen)) stepControllers.add(name);
    }
  }

  // Recompute the skipped markers + stepper chips against the latest values.
  // Runs before any traversal decides what is visible (shared-prefix values
  // drive every step, and revisiting earlier steps re-reveals later ones).
  // A freshly skipped step is hidden/inert, never current/done, and its jump
  // chip is locked; a freshly revealed one loses the marker again.
  const evaluateStepVisibility = (): void => {
    if (!isWizard) return;
    const values = visibility.allValues();
    for (let i = 0; i < stepCount; i++) {
      const pane = form.querySelector<HTMLElement>(`[data-pane="${i}"]`);
      const conditions = stepsMeta?.steps[i]?.showWhen;
      const visible = !conditions?.length || evaluateVisibility(conditions, values);
      if (!pane) continue;
      if (!visible) {
        pane.setAttribute("data-step-skipped", "");
        pane.hidden = true;
        pane.setAttribute("inert", "");
      } else {
        pane.removeAttribute("data-step-skipped");
      }
      const chip = form.querySelector<HTMLElement>(`[data-step="${i}"]`);
      if (!chip) continue;
      chip.classList.toggle("rf-step--skipped", !visible);
      if (visible) continue;
      chip.classList.remove("rf-step--done");
      chip.removeAttribute("aria-current");
      const jump = chip.querySelector<HTMLButtonElement>("[data-step-jump]");
      if (jump) {
        jump.disabled = true;
        jump.setAttribute("aria-disabled", "true");
      }
    }
  };

  /* ---- Visible-step sequence ----
     Skipped steps keep their authored numbers; these helpers give the engine
     the *visible* ordering: how many steps remain, whether one is last, and
     where Next/Back/jump targets + the draft's saved step land. */
  const visibleStepCount = (): number => {
    let count = 0;
    for (let i = 0; i < stepCount; i++) if (!skipped(i)) count++;
    return count;
  };

  const lastVisibleStep = (): number => {
    for (let i = stepCount - 1; i >= 0; i--) if (!skipped(i)) return i;
    return 0;
  };

  const nextVisibleStep = (step: number): number => {
    for (let i = step + 1; i < stepCount; i++) if (!skipped(i)) return i;
    return -1;
  };

  const prevVisibleStep = (step: number): number => {
    for (let i = step - 1; i >= 0; i--) if (!skipped(i)) return i;
    return -1;
  };

  const firstVisibleStep = (): number => {
    for (let i = 0; i < stepCount; i++) if (!skipped(i)) return i;
    return 0;
  };

  // Draft restore target: the saved step when it's still visible, else the
  // next visible after it, else the nearest visible before it (a stored draft
  // may predate a condition change).
  const clampStep = (saved: number | undefined): number => {
    if (!isWizard || saved === undefined) return firstVisibleStep();
    for (let i = saved; i < stepCount; i++) if (!skipped(i)) return i;
    for (let i = saved; i >= 0; i--) if (!skipped(i)) return i;
    return firstVisibleStep();
  };

  // Controller-change refresh: field visibility, then step visibility. If the
  // step the visitor stands on becomes skipped (e.g. they un-check the toggle
  // that revealed it), reflow to the next visible step in one transition.
  // Otherwise re-apply the current step so labels/chips settle as if the step
  // set had just changed — revealing a later step turns a final-step "Submit"
  // back into "Next".
  const refreshStepVisibility = (): void => {
    if (!isWizard) return;
    evaluateStepVisibility();
    if (skipped(currentStep)) {
      const next = nextVisibleStep(currentStep);
      const fallback = prevVisibleStep(currentStep);
      if (next !== -1 || fallback !== -1) goTo(next !== -1 ? next : fallback);
    } else {
      goTo(currentStep);
    }
  };

  // Skipped-step fields are excluded from the travelled payload. `isHiddenControl`
  // already keeps them out of validation and `allValues`; `visibleFields` needs
  // the extra filter because the core helper only knows field-level conditions.
  const visibilityForSubmit: VisibilityEngine = {
    ...visibility,
    visibleFields: (): FieldSpec[] =>
      visibility.visibleFields().filter((field) => {
        const control = form.querySelector<Control>(`[name="${CSS.escape(field.name)}"]`);
        return control?.closest("[data-pane][data-step-skipped]") === null;
      }),
  };

  /* ---- Draft persistence (opt-in `autoSave` form key) ---- */
  let autoSaveKey: string | undefined;
  if (spec) {
    if (spec.autoSave === true) autoSaveKey = `rf:draft:${spec.name}`;
    else if (typeof spec.autoSave === "string" && spec.autoSave.trim()) autoSaveKey = spec.autoSave.trim();
    else if (spec.autoSave === undefined) autoSaveKey = form.dataset.autosave || undefined;
  } else {
    autoSaveKey = form.dataset.autosave || undefined;
  }
  const draft = autoSaveKey ? createDraftStore(autoSaveKey) : null;

  // Saver is debounced (~400ms) and triggered by the `rf:fields-change` bus,
  // row add/remove and step transitions; the timer is cancelled on detach.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const writeDraft = (): void => {
    if (!draft) return;
    draft.save({
      v: 1,
      savedAt: Date.now(),
      step: isWizard ? currentStep : undefined,
      rows: countRepeaterRows(form),
      values: captureDraft(form, visibility.isHiddenControl),
    });
  };
  const scheduleDraftSave = (): void => {
    if (!draft) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 400);
  };

  const goTo = (step: number, options?: { focus?: boolean }): void => {
    // Step conditions may have changed since the last transition — re-evaluate
    // first so the pane/chip/sequence logic below sees the current step set
    // (shared-prefix values drive every step, and revisiting earlier steps can
    // re-reveal later ones).
    evaluateStepVisibility();
    const from = currentStep;
    currentStep = step;
    const lastVisible = lastVisibleStep();
    form.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane, i) => {
      // Skipped panes stay hidden+inert (evaluateStepVisibility set that);
      // among the visible steps only the target pane is active.
      const active = i === step && !skipped(i);
      pane.hidden = !active;
      if (active) pane.removeAttribute("inert");
      else pane.setAttribute("inert", "");
    });
    form.querySelectorAll<HTMLElement>("[data-step]").forEach((item, i) => {
      item.classList.toggle("rf-step--done", !skipped(i) && i < step);
      if (i === step && !skipped(i)) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    // Completed, non-skipped steps become clickable to jump back (no
    // validation — the forward path always re-validates, so order is never
    // bypassed). Skipped steps are never navigable.
    form.querySelectorAll<HTMLButtonElement>("[data-step-jump]").forEach((btn) => {
      const target = Number(btn.dataset.stepJump);
      const done = target < step && !skipped(target);
      btn.disabled = !done;
      btn.setAttribute("aria-disabled", String(!done));
    });
    const back = form.querySelector<HTMLButtonElement>("[data-step-back]");
    if (back) back.hidden = prevVisibleStep(currentStep) === -1;
    const next = form.querySelector<HTMLButtonElement>("[data-step-next]");
    const nextLabel = next?.querySelector<HTMLElement>("[data-next-label]");
    if (nextLabel) {
      nextLabel.textContent =
        step < lastVisible ? (stepsMeta?.next.label ?? "Next") : (stepsMeta?.submit.label ?? "");
    }
    // On the final visible step the button also takes the submit button's
    // variant.
    if (next && stepsMeta) {
      next.classList.toggle(`rf-submit--${stepsMeta.next.variant}`, step < lastVisible);
      next.classList.toggle(`rf-submit--${stepsMeta.submit.variant}`, step === lastVisible);
    }
    visibility.apply();
    if (options?.focus) {
      form.querySelector<HTMLElement>(`[data-pane="${step}"] .rf-step-header`)?.focus();
    }
    // Announce the transition on the bus (the initial `goTo(0)` at attach is
    // from === to, so it never emits) and run the `afterStepChange` hook.
    // `total` counts the *visible* steps — skipped panes are not part of the
    // sequence a visitor walks.
    if (from !== step) {
      emit("rf:step-change", { from, to: step, total: visibleStepCount() });
      (hookFor("afterStepChange") as StepHook | undefined)?.({ from, to: step, form });
      scheduleDraftSave();
    }
  };

  on(form, "submit", (event) => {
    if (!isWizard) {
      void handleSubmit(event, fields, rules, mailerName, successMessage, copy, visibilityForSubmit, undefined, validateControl, submitHooks, autoSuccess, markSubmitAttempt);
      return;
    }
    // Wizard: the submit button advances to the next *visible* step; the last
    // visible step submits (skipped steps are never valid destinations).
    // Latest visibility always applies first.
    visibility.apply();
    evaluateStepVisibility();
    const stepControls = paneScopeFor(currentStep).filter(
      (control) => !visibility.isHiddenControl(control),
    );
    if (currentStep < lastVisibleStep()) {
      event.preventDefault();
      const nextStep = nextVisibleStep(currentStep);
      if (nextStep === -1) return;
      // Lifecycle hook — vetoing cancels the step advance before validation.
      if ((hookFor("beforeValidateStep") as StepHook | undefined)?.({ from: currentStep, to: nextStep, form }) === false) return;
      const invalid = stepControls.filter((control) => !validateControl(control));
      if (invalid.length > 0) {
        invalid[0].focus();
        return;
      }
      goTo(nextStep);
      return;
    }
    void handleSubmit(event, fields, rules, mailerName, successMessage, copy, visibilityForSubmit, stepControls, validateControl, submitHooks, autoSuccess, markSubmitAttempt);
  });

  // Stepper: completed steps are clickable and jump back without validation
  // (same semantics as Back — Next re-validates whatever it crosses).
  form.querySelectorAll<HTMLButtonElement>("[data-step-jump]").forEach((btn) => {
    on(btn, "click", () => {
      const target = Number(btn.dataset.stepJump);
      if (!btn.disabled && target < currentStep) goTo(target, { focus: true });
    });
  });

  // Footer Back/Previous — never validates (locked spec); focuses the target
  // pane header like a stepper jump. Goes to the previous *visible* step.
  const backButton = form.querySelector<HTMLButtonElement>("[data-step-back]");
  if (backButton) {
    on(backButton, "click", () => {
      const prev = prevVisibleStep(currentStep);
      if (prev !== -1) goTo(prev, { focus: true });
    });
  }

  // Conditional fields + conditional steps: re-evaluate whenever a controlling
  // control changes. Step controllers join the field controllers (a toggle on
  // the shared prefix can skip/reveal a whole pane).
  const onControllerInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (visibility.isController(target.name) || stepControllers.has(target.name)) {
      visibility.apply();
      refreshStepVisibility();
    }
  };
  on(form, "input", onControllerInput);
  on(form, "change", onControllerInput);

  // The `rf:fields-change` bus: announce every control interaction. Both
  // `input` and `change` fire — they carry distinct moments a consumer may
  // care about (analytics adapters typically throttle these).
  const onBusFieldChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    emit("rf:fields-change", { name: target.name, value: target.value });
    scheduleDraftSave();
  };
  on(form, "input", onBusFieldChange);
  on(form, "change", onBusFieldChange);

  // Initial visibility — the server renders every field visible; the script
  // hides the ones whose conditions don't hold yet.
  visibility.apply();

  // Cross-field equality: which in-scope fields read each control's value as
  // their `sameAs` target — re-checking a flagged dependent when the target
  // changes (e.g. editing the password re-checks a visible "Confirm" error).
  const sameAsDependents = new Map<string, string[]>();
  for (const field of fields) {
    if (field.sameAs && field.sameAs !== field.name) {
      const list = sameAsDependents.get(field.sameAs) ?? [];
      list.push(field.name);
      sameAsDependents.set(field.sameAs, list);
    }
  }

  // Per-control re-validation: wiring is extracted into `wireControl` so
  // cloned repeater rows can wire their controls the same way. Group lookups
  // (checkbox/radio siblings, `sameAs` dependents) scope to the control's
  // repeater row when it lives in one.
  const wireControl = (control: Control): void => {
    const onInput = (): void => {
      // Live validation: `validateOn` may demand a pristine field be checked
      // on everyday typing ("change" mode, or "touched" once the field is
      // live); the submit path always re-validates already-flagged controls.
      if (shouldLiveValidate(control, "change")) {
        validateControl(control);
      } else if (control.hasAttribute("aria-invalid")) {
        validateControl(control);
      }
      // Shared-name groups (checkbox/radio): selection count is group-level,
      // so re-check flagged siblings too when one member changes.
      const row = control.closest<HTMLElement>("[data-repeater-row]");
      const group =
        control instanceof HTMLInputElement &&
        (control.type === "checkbox" || control.type === "radio")
          ? (row ?? form).querySelectorAll<Control>(`input[name="${CSS.escape(control.name)}"]`)
          : null;
      if (group) {
        for (const sibling of Array.from(group)) {
          if (sibling === control || !sibling.hasAttribute("aria-invalid")) continue;
          validateControl(sibling);
        }
      }
      updateCounter(control);
      // A `sameAs` target changed — re-check flagged dependents, which only
      // had their first error without a live peer to compare against. Inside
      // a repeater the dependent lives in the same row as its target.
      const dependents = sameAsDependents.get(control.name);
      if (dependents) {
        const scope = row ?? form;
        for (const depName of dependents) {
          const depControl = scope.querySelector<Control>(`[name="${CSS.escape(depName)}"]`);
          if (!depControl || !depControl.hasAttribute("aria-invalid")) continue;
          validateControl(depControl);
        }
      }
    };
    const onBlur = (): void => {
      // "touched": leaving a field at least once makes it live-validated
      // from then on ("blur" mode validates the blurred control directly).
      touchedNames.add(control.name);
      if (shouldLiveValidate(control, "blur")) validateControl(control);
    };
    on(control, "input", onInput);
    on(control, "change", onInput);
    on(control, "blur", onBlur);
  };

  form.querySelectorAll<Control>("input, select, textarea").forEach((control) => wireControl(control));

  /* ---- Repeaters (dynamic row groups): row add/remove ---- */

  // The markup renders the initial rows (max(1, minRows)) already; the engine
  // owns row add/remove. The first row is the clone template — cloned rows
  // re-index their ids, drop values/errors, wire their controls and re-sync
  // the button bounds.
  const configureRepeater = (repeaterEl: HTMLElement): void => {
    const name = repeaterEl.dataset.repeater ?? "";
    const minRows = Number(repeaterEl.dataset.repeaterMin ?? 0);
    const maxRows = repeaterEl.dataset.repeaterMax ? Number(repeaterEl.dataset.repeaterMax) : Infinity;
    const rowsRoot = repeaterEl.querySelector<HTMLElement>("[data-repeater-rows]");
    const addBtn = repeaterEl.querySelector<HTMLButtonElement>("[data-add-row]");
    if (!rowsRoot) return;

    const rowCount = (): number => rowsRoot.querySelectorAll<HTMLElement>("[data-repeater-row]").length;

    const sync = (): void => {
      const count = rowCount();
      if (addBtn) {
        const atMax = count >= maxRows;
        addBtn.disabled = atMax;
        addBtn.setAttribute("aria-disabled", String(atMax));
      }
      for (const removeBtn of Array.from(rowsRoot.querySelectorAll<HTMLButtonElement>("[data-remove-row]"))) {
        const atMin = count <= minRows;
        removeBtn.disabled = atMin;
        removeBtn.setAttribute("aria-disabled", String(atMin));
      }
      clearRepeaterErrors(repeaterEl);
    };

    const addRow = (): void => {
      if (rowCount() >= maxRows) return;
      const template = rowsRoot.querySelector<HTMLElement>("[data-repeater-row]");
      if (!template) return;
      const clone = template.cloneNode(true) as HTMLElement;
      // Reset the template row's state first: values, selection, errors,
      // flags, counters — the visitor's input (or row 0's errors) must not
      // copy. Re-index afterwards so the rewire (ids, row markers, sentinel)
      // reflects the clone's final index.
      for (const control of Array.from(clone.querySelectorAll<Control>("input, select, textarea"))) {
        if (control instanceof HTMLInputElement && control.type === "file") control.value = "";
        else if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) control.checked = false;
        else control.value = "";
        updateCounter(control);
      }
      clone.querySelectorAll(".rf-field-error, .rf-repeater-error").forEach((el) => el.remove());
      clone.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
      clone.querySelectorAll(".rf-input-invalid").forEach((el) => el.classList.remove("rf-input-invalid"));
      reindexRow(clone, rowCount());
      rowsRoot.appendChild(clone);
      for (const control of Array.from(clone.querySelectorAll<Control>("input, select, textarea"))) wireControl(control);
      sync();
      emit("rf:row-add", { name, count: rowCount() });
      scheduleDraftSave();
    };

    if (addBtn) on(addBtn, "click", addRow);
    // Restore path (autoSave draft): rows are re-created via these adders so
    // cloned rows get fully wired (controls, counters, button bounds) exactly
    // as if the visitor had clicked "Add".
    repeaterAdders.set(name, addRow);

    // Delegated remove on the persistent rows container — one listener covers
    // every row, present and cloned (no per-row rebinding on add).
    on(rowsRoot, "click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const removeBtn = target.closest<HTMLElement>("[data-remove-row]");
      if (!removeBtn) return;
      const row = removeBtn.closest<HTMLElement>("[data-repeater-row]");
      if (!row || rowCount() <= minRows) return;
      row.remove();
      sync();
      emit("rf:row-remove", { name, count: rowCount() });
      scheduleDraftSave();
    });

    sync();
  };

  // Repeater adders by name — used by the draft restore to re-create rows.
  const repeaterAdders = new Map<string, () => void>();
  form.querySelectorAll<HTMLElement>("[data-repeater]").forEach(configureRepeater);

  /* ---- Draft restore + explicit prefill (`values` option) ----
     A saved draft re-creates repeater rows (via the adders wired above), fills
     its captured values and, on a wizard, resumes the saved step (clamped to
     the visible sequence). Explicit `values` are applied AFTER the draft, so
     consumers always win over a stored copy. Conditional fields and steps both
     re-evaluate against the hydrated values inside the initial `goTo`. */
  let draftStep: number | undefined;
  if (draft) {
    const entry = draft.load();
    if (entry) {
      applyDraft(form, entry, (repeaterName) => repeaterAdders.get(repeaterName)?.());
      draftStep = isWizard ? entry.step : undefined;
    }
  }
  if (opts.values && Object.keys(opts.values).length > 0) applyValues(form, opts.values);

  // Step forms start on the first *visible* step (or the restored draft step):
  // normalise the stepper state, the footer labels and any conditional steps.
  if (isWizard) goTo(clampStep(draftStep));

  // A successful submit clears the draft — persistence never outlives the
  // form. Also cancel any pending (debounced) save so a timer scheduled by the
  // pre-submit input can't resurrect a cleared draft moments later.
  on(form, "rf:submit-success", () => {
    if (saveTimer) clearTimeout(saveTimer);
    draft?.clear();
    // Fresh form = submit-only again: drop the "touched" memory and the
    // submit-attempt unlock so the next visit gets vanilla "don't nag"
    // behaviour under `validateOn: "touched"`.
    touchedNames.clear();
    submittedOnce = false;
  });

  return {
    on(event, handler) {
      // The bus rides the same registry as every internal listener, so
      // `detach()` removes subscriptions with everything else.
      on(form, event, handler as Handler);
    },
    detach() {
      if (saveTimer) clearTimeout(saveTimer);
      for (const [target, byType] of listeners) {
        for (const [type, handlers] of byType) {
          for (const handler of handlers) target.removeEventListener(type, handler as EventListener);
        }
      }
      listeners.clear();
      // Remove injected error state so the form returns to its pristine DOM.
      form.querySelectorAll<Control>("input, select, textarea").forEach((control) => {
        control.removeAttribute("aria-invalid");
        control.classList.remove("rf-input-invalid");
      });
      form.querySelectorAll(".rf-field-error").forEach((el) => el.remove());
    },
  };
}

/**
 * Wire every contact form under `root` (default: the whole document). Returns a
 * detach function for all of them. This is what the Astro shell's script tag
 * calls; framework bindings normally call `attachForm` per form instead.
 */
export function initForms(root: ParentNode = document): () => void {
  const detachers: Array<() => void> = [];
  root.querySelectorAll<HTMLFormElement>("form[data-mail-form]").forEach((form) => {
    const attached = attachForm(form);
    detachers.push(() => attached.detach());
  });
  return () => detachers.forEach((detach) => detach());
}