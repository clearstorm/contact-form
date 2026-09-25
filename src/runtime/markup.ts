/**
 * Markup builders — the single source of truth for the contact form's DOM.
 *
 * Every framework binding (Astro shells, React, vanilla JS) renders through
 * these string builders, so the `rf-*` markup, `data-*` serialisation and the
 * class/data-attribute hooks the client engine relies on can never drift
 * between frameworks.
 *
 * The output mirrors what the former `.astro` templates emitted, exactly:
 * same classes, same attributes, same attribute hooks (`data-rules`,
 * `data-copy`, `data-steps`, `data-pane`, `data-step-jump`, …).
 */
import {
  buttonLabel,
  buttonVariant,
  gridSpan,
  isFieldSpec,
  serializeRules,
  stepperModifiers,
  toFieldSpecs,
  toSteps,
  type DecorSpec,
  type FormElement,
  type FormFieldSpec,
  type FormSpec,
  type MailerName,
  type StepHeaderSpec,
} from "../core";

/* ---- HTML helpers ---- */

/** HTML-escape text or attribute content (mirrors Astro's automatic escaping). */
const esc = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/**
 * Render one attribute. Omitted when the value is undefined/null/false (or the
 * condition is false). `true` renders the bare boolean attribute (`hidden`,
 * `required`, …). Everything else renders ` name="escaped"`.
 */
const attr = (name: string, value: unknown, when = true): string => {
  if (!when || value === undefined || value === null || value === false) return "";
  return value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
};

/* ---- Field markup (was FormField.astro) ---- */

export interface RenderFieldProps {
  label: string;
  id: string;
  name: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  autocomplete?: string;
  rows?: number;
  /** Select options, or the choices of a checkbox/radio group. */
  options?: string[];
  /** Grid span in 12-column columns (from `gridSpan`) — renders as `rf-span-{n}`. */
  span?: number;
  /** Input passthrough attributes. */
  placeholder?: string;
  value?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  maxlength?: number;
  /**
   * Soft maximum length — renders a live character counter below the control
   * (validation-only; the native `maxlength` attribute stays an independent
   * hard limit when you set it too).
   */
  maxLength?: number;
  pattern?: string;
  /** Accept hint for file inputs (picker filter only). */
  accept?: string;
  /** Multiple files / multi-select. */
  multiple?: boolean;
}

/**
 * Render one field wrapper (`<div class="rf-field rf-span-{n}">`) with its
 * label and control. `span` must be a grid span (1..12), not a percentage —
 * use `gridSpan(el.size)` (or `renderElements`, which does it for you).
 */
export function renderField(prop: RenderFieldProps): string {
  const {
    label,
    id,
    name,
    type = "text",
    required = false,
    optional = false,
    autocomplete,
    rows = 6,
    options,
    span = 6,
    placeholder,
    value,
    min,
    max,
    step,
    maxlength,
    maxLength,
    pattern,
    accept,
    multiple,
  } = prop;

  const isGroup = (type === "checkbox" || type === "radio") && (options?.length ?? 0) > 0;
  const isSingleCheckbox = type === "checkbox" && !((options?.length ?? 0) > 0);
  // Live character counter — text-like controls only, driven by the new
  // soft `maxLength` validation key (not the native `maxlength` attribute).
  const showCounter =
    maxLength !== undefined &&
    (type === "text" ||
      type === "email" ||
      type === "tel" ||
      type === "url" ||
      type === "search" ||
      type === "password" ||
      type === "textarea");
  const counter = showCounter
    ? `<span class="rf-counter" data-max="${esc(maxLength)}" aria-live="polite">${esc(String(value ?? "").length)} / ${esc(maxLength)}</span>`
    : "";

  let out = `<div class="rf-field rf-span-${span}${type === "hidden" ? " rf-field--hidden" : ""}">`;

  if (type !== "hidden") {
    if (isGroup) {
      out +=
        `<span class="rf-label" id="${esc(id)}-label">${esc(label)}` +
        (optional ? `<span class="rf-optional"> Optional</span>` : "") +
        `</span>`;
    } else if (!isSingleCheckbox) {
      out +=
        `<label for="${esc(id)}" class="rf-label">${esc(label)}` +
        (optional ? `<span class="rf-optional"> Optional</span>` : "") +
        `</label>`;
    }
  }

  if (type === "hidden") {
    out += `<input type="hidden" id="${esc(id)}" name="${esc(name)}"${attr("value", value ?? "")} />`;
  } else if (isGroup) {
    out += `<div class="rf-options" role="group" aria-labelledby="${esc(id)}-label">`;
    for (let i = 0; i < (options?.length ?? 0); i++) {
      const option = options![i];
      out +=
        `<label class="rf-option">` +
        `<input type="${type === "checkbox" ? "checkbox" : "radio"}" name="${esc(name)}" value="${esc(option)}"${attr("required", required)} id="${esc(id)}-${i}" />` +
        `<span>${esc(option)}</span>` +
        `</label>`;
    }
    out += `</div>`;
  } else if (isSingleCheckbox) {
    out +=
      `<label class="rf-option rf-option--single">` +
      `<input type="checkbox" id="${esc(id)}" name="${esc(name)}"${attr("required", required)} />` +
      `<span class="rf-label">${esc(label)}${optional ? `<span class="rf-optional"> Optional</span>` : ""}</span>` +
      `</label>`;
  } else if (type === "textarea") {
    out +=
      `<textarea` +
      `${attr("id", id)}${attr("name", name)}${attr("rows", rows)}${attr("required", required)}${attr("placeholder", placeholder)}${attr("maxlength", maxlength)}` +
      ` class="rf-input rf-textarea"></textarea>`;
    out += counter;
  } else if (type === "select") {
    out +=
      `<select` +
      `${attr("id", id)}${attr("name", name)}${attr("required", required)}` +
      ` class="rf-input"${attr("multiple", multiple)}${attr("size", multiple ? rows : undefined)}>`;
    for (const option of options ?? []) out += `<option>${esc(option)}</option>`;
    out += `</select>`;
  } else {
    out +=
      `<input` +
      `${attr("id", id)}${attr("name", name)}${attr("type", type)}${attr("autocomplete", autocomplete)}` +
      `${attr("required", required)}${attr("placeholder", placeholder)}${attr("value", type === "file" ? undefined : value)}` +
      `${attr("min", min)}${attr("max", max)}${attr("step", step)}${attr("maxlength", maxlength)}` +
      `${attr("pattern", pattern)}${attr("accept", accept)}${attr("multiple", multiple)}` +
      `${attr("list", options?.length ? `${id}-list` : undefined)}` +
      ` class="rf-input" />`;
    out += counter;
  }

  // `options` on a non-picker input renders a <datalist> of suggestions.
  if (
    type !== "hidden" &&
    type !== "select" &&
    type !== "textarea" &&
    !isGroup &&
    !isSingleCheckbox &&
    (options?.length ?? 0) > 0
  ) {
    out += `<datalist id="${esc(id)}-list">${options!.map((o) => `<option value="${esc(o)}" />`).join("")}</datalist>`;
  }

  out += `</div>`;
  return out;
}

/* ---- Structural markup (was Decor.astro) ---- */

/** Render a structural element (`heading`, `description`, `divider`, `section`). */
export function renderDecor(decor: DecorSpec): string {
  switch (decor.type) {
    case "heading": {
      const align = decor.align ?? "left";
      const line = decor.line !== false;
      return `<h3 class="rf-heading rf-heading--${align}${line ? " rf-heading--rule" : ""}">${esc(decor.text)}</h3>`;
    }
    case "description":
      return `<p class="rf-description rf-span-${gridSpan(decor.size ?? 100)}">${esc(decor.text)}</p>`;
    case "divider":
      return decor.visible === false
        ? `<div class="rf-divider rf-divider--spacer"${attr("style", decor.min ? `min-height: ${decor.min}` : undefined)}></div>`
        : `<hr class="rf-divider" />`;
    case "section":
      return (
        `<div class="rf-section${decor.label ? " rf-section--labeled" : ""}" role="separator">` +
        (decor.label ? `<span class="rf-section-label">${esc(decor.label)}</span>` : "") +
        `</div>`
      );
    default:
      return "";
  }
}

/* ---- Element lists (was FormElements.astro) ---- */

/**
 * Scopes a rendered element `id` (plus derived ids) under `idPrefix` — several
 * forms on one page can share field names without colliding. Only `id` is
 * prefixed; `name` attributes (and therefore payloads) are untouched.
 */
export const scopedId = (element: { id?: string; name: string }, idPrefix: string): string => {
  const raw = element.id ?? element.name;
  return idPrefix ? `${idPrefix}__${raw}` : raw;
};

/** Turn a spec field into the props `renderField` needs (id scoped, span resolved). */
export const fieldRenderProps = (field: FormFieldSpec, idPrefix: string): RenderFieldProps => ({
  label: field.label,
  id: scopedId(field, idPrefix),
  name: field.name,
  type: field.type,
  autocomplete: field.autocomplete,
  required: field.required,
  optional: field.optional,
  rows: field.rows,
  options: field.options,
  span: gridSpan(field.size),
  placeholder: field.placeholder,
  value: field.value,
  min: field.min,
  max: field.max,
  step: field.step,
  maxlength: field.maxlength,
  maxLength: field.maxLength,
  pattern: field.pattern,
  accept: field.accept,
  multiple: field.multiple,
});

/** Render one form element — a field via `renderField`, structural via `renderDecor`. */
export function renderElement(element: FormElement, idPrefix = ""): string {
  if (isFieldSpec(element)) return renderField(fieldRenderProps(element, idPrefix));
  // Step markers are consumed by `toSteps` during layout — they never render.
  if (element.type === "step") return "";
  return renderDecor(element);
}

/** Render an ordered list of elements (the layout zones: shared, panes, hoisted). */
export function renderElements(elements: FormElement[], idPrefix = ""): string {
  return elements.map((element) => renderElement(element, idPrefix)).join("");
}

/* ---- Form shell (was ContactForm.astro frontmatter + template) ---- */

export interface ShellOptions {
  form: FormSpec;
  /** Explicit endpoint overrides — take precedence over the form spec. */
  config?: {
    endpoint?: string;
    apiUrl?: string;
    cf7FormId?: string;
  };
  /** "datetime" pre-fills date/time inputs with the current local date/time. */
  prefill?: "datetime";
}

/** Warn once per shell render when the form is missing its endpoint config. */
export function warnMissingConfig(
  formName: string,
  mailerName: MailerName,
  wpUrl?: string,
  cf7FormId?: string,
  formEndpoint?: string,
): void {
  if (
    (mailerName === "cf7" && (!wpUrl || !cf7FormId)) ||
    (mailerName === "json" && !formEndpoint)
  ) {
    console.warn(
      `[ContactForm] "${formName}" (mailer: ${mailerName}) is missing its endpoint config — ` +
        (mailerName === "cf7"
          ? "pass config.apiUrl / config.cf7FormId, or set cf7.apiUrl / cf7.formId in the form spec."
          : "add an `endpoint` to the form spec, or pass config.endpoint."),
    );
  }
}

/**
 * Render the complete `<form class="rf-form">` shell — the shared prefix,
 * step panes/stepper (wizard) or flat layout, hoisted hidden fields, footer
 * buttons, honeypot and status box — with every `data-*` attribute the client
 * engine reads (`data-rules`, `data-copy`, `data-steps`, endpoint config…).
 * This string is what every binding mounts into the page.
 */
export function renderFormShell({ form, config = {}, prefill }: ShellOptions): string {
  const formName = form.name;
  const formId = `${form.name}-form`;
  const mailerName: MailerName = form.mailer ?? "cf7";
  const statusMode = form.statusMode ?? "inline";

  // JSON is the source of truth for which fields are required and how extra
  // fields fold into the message; the shared engine rebuilds per-form
  // behaviour from this serialised spec.
  const fieldConfig = toFieldSpecs(form.fields);

  // Wizard layout — `step` markers split the fields into step panes; elements
  // before the first marker are a shared prefix shown on every step. With zero
  // or one marker the form renders single-page (backwards compatible).
  const layout = toSteps(form.fields);
  const isWizard = layout.steps.length > 1;
  const flatElements =
    layout.steps.length <= 1
      ? [...layout.shared, ...(layout.steps[0]?.elements ?? []), ...layout.hoisted]
      : [];

  // Buttons: form.submit / form.next / form.prev accept a plain label or
  // `{ label?, variant? }`. Only the last marker's submit label is honoured
  // (enforced in `toSteps`); legacy copy.back / copy.next stay label-only.
  const singleSubmitLabel = buttonLabel(form.submit, "Submit");
  const finalSubmitLabel = layout.steps[layout.steps.length - 1]?.submit ?? singleSubmitLabel;
  const nextLabel = buttonLabel(form.next, form.copy?.next ?? "Next");
  const prevLabel = buttonLabel(form.prev, form.copy?.back ?? "Back");
  const submitVariant = buttonVariant(form.submit, "primary");
  const nextVariant = buttonVariant(form.next, "primary");
  const prevVariant = buttonVariant(form.prev, "secondary");
  const stepsMeta = layout.steps.map((step) => ({ label: step.label, submit: step.submit }));

  // Wizard chrome (opt-in `stepper` form key): nav strip flags and pane-header
  // defaults. Marker-level keys override per step.
  const stepper = form.stepper;
  const stepsNav = stepper?.nav ?? {};
  const navNumber = stepsNav.number !== false;
  const navLabel = stepsNav.label !== false;
  const navClickable = stepsNav.clickable !== false;
  const navBackground = stepper?.nav?.background;
  const headerDefaults = stepper?.header ?? {};
  const stepHeader = (step: StepHeaderSpec) => ({
    show: step.show ?? headerDefaults.show ?? true,
    align: (step.align ?? headerDefaults.align ?? "left") as "left" | "center" | "right" | "full",
    line: step.line ?? headerDefaults.line ?? true,
  });
  const stepperMods = stepperModifiers(stepper);

  // Endpoint config — explicit props win, else the form spec's own block.
  const wpUrl = config.apiUrl ?? form.cf7?.apiUrl;
  const cf7FormId = config.cf7FormId ?? form.cf7?.formId;
  const formEndpoint = config.endpoint ?? form.endpoint;

  warnMissingConfig(formName, mailerName, wpUrl, cf7FormId, formEndpoint);

  /* ---- form open tag ---- */

  let out =
    `<form id="${esc(formId)}" class="rf-form" data-mail-form="${esc(formName)}" data-mailer="${esc(mailerName)}"` +
    `${attr("data-status-mode", statusMode === "inline" ? undefined : statusMode)}` +
    `${attr("data-prefill", prefill)}${attr("data-endpoint", formEndpoint)}` +
    `${attr("data-wp-url", wpUrl)}${attr("data-form-id", cf7FormId)}` +
    ` data-rules="${esc(serializeRules(fieldConfig))}"` +
    `${attr("data-copy", form.copy ? JSON.stringify(form.copy) : undefined)}` +
    `${attr("data-steps", isWizard
      ? JSON.stringify({
          steps: stepsMeta,
          next: { label: nextLabel, variant: nextVariant },
          prev: { label: prevLabel, variant: prevVariant },
          submit: { label: finalSubmitLabel, variant: submitVariant },
        })
      : undefined)}` +
    ` novalidate>`;

  /* ---- wizard ---- */

  if (isWizard) {
    if (layout.shared.length > 0) {
      out += `<div class="rf-shared" data-shared>${renderElements(layout.shared, form.name)}</div>`;
    }

    out +=
      `<ol class="rf-steps${stepperMods ? ` ${stepperMods}` : ""}${navBackground ? " rf-steps--band" : ""}"` +
      ` data-steps-nav aria-label="Form progress"` +
      `${attr("style", navBackground ? `--rf-steps-bg: ${navBackground}` : undefined)}>`;
    layout.steps.forEach((step, i) => {
      out += `<li class="rf-step" data-step="${i}"${attr("aria-current", i === 0 ? "step" : undefined)}>`;
      if (navClickable) {
        out += `<button class="rf-step-btn" type="button" data-step-jump="${i}" disabled aria-disabled="true" aria-label="Go to step ${i + 1}: ${esc(step.label)}">`;
      } else {
        out += `<span class="rf-step-btn" aria-label="Step ${i + 1}: ${esc(step.label)}">`;
      }
      if (navNumber) out += `<span class="rf-step-index" aria-hidden="true">${i + 1}</span>`;
      if (navLabel) out += `<span class="rf-step-label">${esc(step.label)}</span>`;
      out += navClickable ? `</button>` : `</span>`;
      out += `</li>`;
    });
    out += `</ol>`;

    layout.steps.forEach((step, i) => {
      const header = stepHeader(step);
      out += `<section class="rf-pane" data-pane="${i}"${attr("hidden", i !== 0)}${attr("inert", i !== 0 ? "true" : undefined)}>`;
      if (header.show) {
        out +=
          `<header class="rf-step-header" tabindex="-1">` +
          `<span class="rf-step-header-num" aria-hidden="true">${i + 1}</span>` +
          `<h3 class="rf-heading rf-heading--${header.align}${header.line ? " rf-heading--rule" : ""}">${esc(step.title ?? step.label)}</h3>` +
          `</header>`;
      }
      out += renderElements(step.elements, form.name);
      out += `</section>`;
    });

    if (layout.hoisted.length > 0) {
      out += renderElements(layout.hoisted, form.name);
    }

    out +=
      `<div class="rf-step-footer" data-step-footer>` +
      `<button class="rf-submit rf-submit--${prevVariant}" type="button" data-step-back hidden><span aria-hidden="true">←</span> ${esc(prevLabel)}</button>` +
      `<button class="rf-submit rf-submit--${nextVariant}" type="submit" data-step-next><span data-next-label>${esc(nextLabel)}</span> <span aria-hidden="true">→</span></button>` +
      `</div>`;
  } else {
    /* ---- single-page ---- */
    out += renderElements(flatElements, form.name);
    out +=
      `<div class="rf-submit-row">` +
      `<button class="rf-submit rf-submit--${submitVariant}" type="submit">${esc(singleSubmitLabel)} <span aria-hidden="true">→</span></button>` +
      `</div>`;
  }

  /* ---- honeypot + status (both modes) ---- */

  out += `<input type="text" name="website" data-honeypot="true" tabindex="-1" autocomplete="off" aria-hidden="true" class="rf-honeypot" />`;
  out += `<p class="rf-status" role="status" hidden>${esc(form.status)}</p>`;
  out += `</form>`;

  return out;
}