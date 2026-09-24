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
 * - `attachForm(form, opts?)` — wire one rendered form; returns a detach
 *   function (safe for React StrictMode / hot reload).
 * - `initForms(root?)` — wire every `form[data-mail-form]` under a root
 *   (used by the Astro shell's script tag).
 *
 * A form normally carries everything the engine needs serialised on its
 * `data-*` attributes (rendered by `renderFormShell`); `attachForm` accepts an
 * optional `spec`/`config` override for forms rendered outside the shell.
 */
import {
  buildRules,
  buttonLabel,
  buttonVariant,
  evaluateVisibility,
  parseFieldSpec,
  toFieldSpecs,
  toSteps,
  validateValue,
  visibleNames,
  type ButtonVariant,
  type FieldSpec,
  type FormCopy,
  type FormSpec,
  type Rule,
  type VisibilityCondition,
} from "../core";
import { getMailer, type MailerConfig } from "../mailers";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Status = HTMLElement | null;
type Handler = (event: Event) => void;

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
// selected, collapsed to "1" / "" before validation.
const selectionState = (form: HTMLFormElement, name: string): string => {
  const checked = Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)).some(
    (el) => el.checked,
  );
  return checked ? "1" : "";
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
}

const createVisibilityEngine = (
  form: HTMLFormElement,
  fields: FieldSpec[],
): VisibilityEngine => {
  const visibilityByField = new Map<string, VisibilityCondition[]>();
  const controllerNames = new Set<string>();
  for (const field of fields) {
    if (field.visibility?.length) {
      visibilityByField.set(field.name, field.visibility);
      for (const condition of field.visibility) controllerNames.add(condition.field);
    }
  }

  // Trimmed, non-empty values of the controls named `name`. Checkbox/radio
  // groups contribute only their checked option values; controls inside a
  // currently-hidden wrapper contribute nothing (so chains stay predictable).
  const valuesOf = (name: string): string[] => {
    const values: string[] = [];
    for (const control of form.querySelectorAll<Control>("input, select, textarea")) {
      if (control.name !== name || isHiddenControl(control)) continue;
      // File inputs can't sensibly drive conditions — skip them.
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

  const currentValues = (): Record<string, string[]> =>
    Object.fromEntries([...controllerNames].map((name) => [name, valuesOf(name)]));

  // A control is out of scope while its field wrapper is hidden — it is not
  // validated, not sent, and does not drive other conditions.
  const isHiddenControl = (control: Control): boolean => {
    const wrapper = control.closest<HTMLElement>(".rf-field");
    return wrapper !== null && (wrapper.hidden || wrapper.classList.contains("rf-field--hidden"));
  };

  const apply = (): void => {
    if (visibilityByField.size === 0) return;
    const values = currentValues();
    for (const [fieldName, conditions] of visibilityByField) {
      const control = form.querySelector<Control>(`[name="${CSS.escape(fieldName)}"]`);
      const wrapper = control?.closest<HTMLElement>(".rf-field");
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
  };
};

const validateField = (
  control: Control,
  rule: Rule | undefined,
  form: HTMLFormElement,
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
    value = selectionState(form, control.name);
  } else {
    value = control instanceof HTMLSelectElement ? control.value : control.value.trim();
  }
  const message = validateValue(rule, value);
  if (message) {
    setInvalid(control, message);
    return false;
  }
  return true;
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
  mailerName: string,
  successMessage: string,
  copy: FormCopy,
  visibility: VisibilityEngine,
  scopedControls?: Control[],
): Promise<void> {
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  const rules = buildRules(fields, copy);
  const genericError = copy.error ?? "Something went wrong. Please try again in a moment.";

  const status = form.querySelector<HTMLElement>(".rf-status");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  hideStatus(status);

  // Honeypot: a filled hidden field means a bot — pretend success, send nothing.
  const honeypot = form.querySelector<HTMLInputElement>("[data-honeypot]");
  if (honeypot && honeypot.value.trim() !== "") {
    showSuccess(status, successMessage);
    form.reset();
    if (form.dataset.statusMode === "replace") form.classList.add("rf-form--success");
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

  const invalidControls = scoped.filter(
    (control) => !validateField(control, rules[control.name], form),
  );

  if (invalidControls.length > 0) {
    invalidControls[0].focus();
    return;
  }

  const originalLabel = button?.textContent ?? "";
  const sendingLabel = copy.sending ?? "Sending…";
  const setSending = (sending: boolean): void => {
    if (!button) return;
    button.disabled = sending;
    button.setAttribute("aria-busy", String(sending));
    button.textContent = sending ? sendingLabel : originalLabel;
  };

  const config: MailerConfig = {
    endpoint: form.dataset.endpoint,
    apiUrl: form.dataset.wpUrl,
    formId: form.dataset.formId,
    copy,
  };

  setSending(true);
  try {
    const result = await getMailer(mailerName).submit({
      data: new FormData(form),
      // Only the visible fields travel — mailers build the canonical payload
      // from this list, so hidden conditional fields are excluded outright.
      fields: visibility.visibleFields(),
      config,
    });
    if (result.ok) {
      showSuccess(status, successMessage);
      form.reset();
      controls.forEach((control) => clearError(control));
      // replace mode — the success box takes the form's place entirely.
      if (form.dataset.statusMode === "replace") {
        form.classList.add("rf-form--success");
      }
    } else {
      showError(status, result.message || genericError);
    }
  } catch (error) {
    showError(
      status,
      error instanceof Error && error.message ? error.message : genericError,
    );
  } finally {
    setSending(false);
  }
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
}

interface StepsMeta {
  steps: { label: string; submit?: string }[];
  next: { label: string; variant: ButtonVariant };
  prev: { label: string; variant: ButtonVariant };
  submit: { label: string; variant: ButtonVariant };
}

const stepsMetaFromSpec = (form: FormSpec): StepsMeta => {
  const layout = toSteps(form.fields);
  return {
    steps: layout.steps.map((step) => ({ label: step.label, submit: step.submit })),
    next: { label: buttonLabel(form.next, form.copy?.next ?? "Next"), variant: buttonVariant(form.next, "primary") },
    prev: { label: buttonLabel(form.prev, form.copy?.back ?? "Back"), variant: buttonVariant(form.prev, "secondary") },
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
 * Returns a detach function that removes every listener and cleans injected
 * error DOM — call it on unmount (React StrictMode / hot reload safe).
 */
export function attachForm(form: HTMLFormElement, opts: AttachOptions = {}): () => void {
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
  const rules = buildRules(fields, copy);
  const mailerName = spec?.mailer ?? form.dataset.mailer ?? "cf7";
  const status = form.querySelector<HTMLElement>(".rf-status");
  const successMessage = spec?.status ?? status?.textContent ?? "";

  const visibility = createVisibilityEngine(form, fields);

  const isControl = (el: Element): el is Control =>
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement;

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

  const goTo = (step: number, options?: { focus?: boolean }): void => {
    currentStep = step;
    form.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane, i) => {
      const active = i === step;
      pane.hidden = !active;
      if (active) pane.removeAttribute("inert");
      else pane.setAttribute("inert", "");
    });
    form.querySelectorAll<HTMLElement>("[data-step]").forEach((item, i) => {
      const done = i < step;
      item.classList.toggle("rf-step--done", done);
      if (i === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    // Completed steps become clickable to jump back (no validation — the
    // forward path always re-validates, so order is never bypassed).
    form.querySelectorAll<HTMLButtonElement>("[data-step-jump]").forEach((btn) => {
      const done = Number(btn.dataset.stepJump) < step;
      btn.disabled = !done;
      btn.setAttribute("aria-disabled", String(!done));
    });
    const back = form.querySelector<HTMLButtonElement>("[data-step-back]");
    if (back) back.hidden = step === 0;
    const next = form.querySelector<HTMLButtonElement>("[data-step-next]");
    const nextLabel = next?.querySelector<HTMLElement>("[data-next-label]");
    if (nextLabel) {
      nextLabel.textContent =
        step < stepCount - 1 ? (stepsMeta?.next.label ?? copy.next ?? "Next") : (stepsMeta?.submit.label ?? "");
    }
    // On the final step the button also takes the submit button's variant.
    if (next && stepsMeta) {
      next.classList.toggle(`rf-submit--${stepsMeta.next.variant}`, step < stepCount - 1);
      next.classList.toggle(`rf-submit--${stepsMeta.submit.variant}`, step === stepCount - 1);
    }
    visibility.apply();
    if (options?.focus) {
      form.querySelector<HTMLElement>(`[data-pane="${step}"] .rf-step-header`)?.focus();
    }
  };

  on(form, "submit", (event) => {
    if (!isWizard) {
      void handleSubmit(event, fields, mailerName, successMessage, copy, visibility);
      return;
    }
    // Wizard: the submit button advances the current step; the last step
    // submits. Latest visibility always applies first.
    visibility.apply();
    const stepControls = paneScopeFor(currentStep).filter(
      (control) => !visibility.isHiddenControl(control),
    );
    if (currentStep < stepCount - 1) {
      event.preventDefault();
      const invalid = stepControls.filter((control) => !validateField(control, rules[control.name], form));
      if (invalid.length > 0) {
        invalid[0].focus();
        return;
      }
      goTo(currentStep + 1);
      return;
    }
    void handleSubmit(event, fields, mailerName, successMessage, copy, visibility, stepControls);
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
  // pane header like a stepper jump.
  const backButton = form.querySelector<HTMLButtonElement>("[data-step-back]");
  if (backButton) {
    on(backButton, "click", () => {
      if (currentStep > 0) goTo(currentStep - 1, { focus: true });
    });
  }

  // Conditional fields: re-evaluate whenever a controlling control changes.
  const onControllerInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (visibility.isController(target.name)) visibility.apply();
  };
  on(form, "input", onControllerInput);
  on(form, "change", onControllerInput);

  // Initial visibility — the server renders every field visible; the script
  // hides the ones whose conditions don't hold yet.
  visibility.apply();

  form.querySelectorAll<Control>("input, select, textarea").forEach((control) => {
    const fieldRules = rules[control.name];
    const onInput = (): void => {
      // Re-validate on change once a field has been flagged invalid.
      if (control.hasAttribute("aria-invalid")) validateField(control, fieldRules, form);
    };
    on(control, "input", onInput);
    on(control, "change", onInput);
  });

  // Step forms start on the first step: normalise the stepper state, the
  // footer labels ("Next" until the final step) and any conditional fields.
  if (isWizard) goTo(0);

  return () => {
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
    detachers.push(attachForm(form));
  });
  return () => detachers.forEach((detach) => detach());
}