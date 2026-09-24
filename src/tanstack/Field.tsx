/**
 * A controlled, TanStack-driven field renderer for the package's markup
 * classes — the "small component wrapper" of the bridge. Renders the same
 * `rf-field` / `rf-label` / `rf-option` / `rf-input` structure the engine
 * bindings use, but with values and errors owned by TanStack Form, validated
 * by the bridge's per-field validators (which mirror the core rules).
 *
 * ```tsx
 * import { useForm } from "@tanstack/react-form";
 * import { useContactForm, ContactFormField } from "@clearstorm/contact-form/tanstack";
 *
 * const bridge = useContactForm(spec);
 * const form = useForm({ defaultValues: bridge.initialValues, … });
 *
 * {spec.fields.map((field) => (
 *   <ContactFormField key={field.id} form={form} spec={field} bridge={bridge} />
 * ))}
 * ```
 *
 * The wrapper trades TanStack's full generic inference for ergonomics; use
 * `form.Field` directly when you need exact per-form types.
 */
"use client";

import { useField, type ReactFormExtendedApi } from "@tanstack/react-form";
import type { ChangeEvent, ReactElement } from "react";
import { gridSpan, type FieldSize, type FormFieldSpec } from "../core";
import { scopedId } from "../runtime/markup";
import type { ContactFormBridge, FieldValidator, FormValues } from "./useContactForm";

/** Loose form shape accepted by the wrapper (see file docstring). */
type AnyForm = ReactFormExtendedApi<FormValues, any, any, any, any, any, any, any, any, any, any, any>;

export interface ContactFormFieldProps {
  form: AnyForm;
  spec: FormFieldSpec;
  bridge: ContactFormBridge;
  /** Width within the row (defaults to 50 → `rf-span-6`), same as the shell. */
  size?: FieldSize;
  /** Scope for derived ids (pass the form name for shell-level id parity). */
  idPrefix?: string;
}

const spanClass = (size: FieldSize | undefined, fallback: number): string =>
  `rf-field rf-span-${gridSpan(size ?? fallback)}`;

/** The label fragment used by single-input fields. */
const fieldLabel = (spec: FormFieldSpec, id: string): ReactElement => (
  <label htmlFor={id} className="rf-label">
    {spec.label}
    {spec.optional && <span className="rf-optional"> Optional</span>}
  </label>
);

/** One controlled field, wired to the bridge's validator for the field. */
function FieldControl({
  form,
  spec,
  id,
  validate,
}: {
  form: AnyForm;
  spec: FormFieldSpec;
  id: string;
  validate?: FieldValidator;
}): ReactElement {
  const field = useField({
    form,
    name: spec.name,
    // FieldValidator mirrors TanStack's `(props) => unknown` shape, but the
    // wrapper's loose `form: AnyForm` typing can't carry TanStack's per-form
    // generics — cast the validators object (the runtime contract is exact:
    // `props.value` is the field's current value).
    validators: validate
      ? ({ onChange: validate, onBlur: validate, onSubmit: validate } as never)
      : undefined,
  });
  const error = (field.state.meta.errors as unknown[])[0];
  const errorText = typeof error === "string" ? error : undefined;
  const invalid = errorText !== undefined;
  const inputClass = `rf-input${invalid ? " rf-input-invalid" : ""}${spec.type === "textarea" ? " rf-textarea" : ""}`;
  const errorNode =
    errorText !== undefined ? (
      <p className="rf-field-error" id={`${id}-error`}>
        {errorText}
      </p>
    ) : null;

  switch (spec.type) {
    case "textarea":
      return (
        <div className={spanClass(spec.size, 12)}>
          {fieldLabel(spec, id)}
          <textarea
            id={id}
            name={spec.name}
            rows={spec.rows ?? 6}
            required={spec.required || undefined}
            placeholder={spec.placeholder}
            value={String(field.state.value ?? "")}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            className={inputClass}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
          />
          {errorNode}
        </div>
      );
    case "select": {
      const multi = spec.multiple === true;
      const selected = multi
        ? Array.isArray(field.state.value)
          ? field.state.value
          : []
        : String(field.state.value ?? "");
      const selectChanged = (e: ChangeEvent<HTMLSelectElement>): void =>
        multi
          ? field.handleChange(Array.from(e.target.selectedOptions).map((o) => o.value))
          : field.handleChange(e.target.value);
      return (
        <div className={spanClass(spec.size, 6)}>
          {fieldLabel(spec, id)}
          <select
            id={id}
            name={spec.name}
            required={spec.required || undefined}
            multiple={multi || undefined}
            size={multi ? spec.rows : undefined}
            value={selected as never}
            onChange={selectChanged}
            onBlur={field.handleBlur}
            className={inputClass}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
          >
            {(spec.options ?? []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          {errorNode}
        </div>
      );
    }
    case "checkbox":
    case "radio": {
      const options = spec.options ?? [];
      if (options.length === 0) {
        // Standalone checkbox — a boolean switch.
        return (
          <div className={spanClass(spec.size, 6)}>
            <label className="rf-option rf-option--single">
              <input
                type="checkbox"
                id={id}
                name={spec.name}
                required={spec.required || undefined}
                checked={field.state.value === true}
                onChange={(e) => field.handleChange(e.target.checked)}
                onBlur={field.handleBlur}
                className={invalid ? "rf-input-invalid" : undefined}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${id}-error` : undefined}
              />
              <span className="rf-label">
                {spec.label}
                {spec.optional && <span className="rf-optional"> Optional</span>}
              </span>
            </label>
            {errorNode}
          </div>
        );
      }
      const labelId = `${id}-label`;
      const selected = Array.isArray(field.state.value) ? field.state.value : [];
      const changed = (option: string, checked: boolean): void => {
        if (spec.type === "radio") field.handleChange(option);
        else field.handleChange(checked ? [...selected, option] : selected.filter((v) => v !== option));
      };
      return (
        <div className={spanClass(spec.size, 6)}>
          <span className="rf-label" id={labelId}>
            {spec.label}
            {spec.optional && <span className="rf-optional"> Optional</span>}
          </span>
          <div className="rf-options" role="group" aria-labelledby={labelId}>
            {options.map((option, i) => (
              <label key={option} className="rf-option">
                <input
                  type={spec.type === "radio" ? "radio" : "checkbox"}
                  name={spec.name}
                  value={option}
                  id={`${id}-${i}`}
                  checked={
                    spec.type === "radio" ? field.state.value === option : selected.includes(option)
                  }
                  onChange={(e) => changed(option, e.target.checked)}
                  onBlur={field.handleBlur}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {errorNode}
        </div>
      );
    }
    case "file":
      return (
        <div className={spanClass(spec.size, 6)}>
          {fieldLabel(spec, id)}
          <input
            id={id}
            name={spec.name}
            type="file"
            required={spec.required || undefined}
            accept={spec.accept}
            multiple={spec.multiple || undefined}
            className={inputClass}
            onChange={(e) => field.handleChange(e.target.files ?? [])}
            onBlur={field.handleBlur}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
          />
          {errorNode}
        </div>
      );
    case "hidden":
      // Hidden values live purely in TanStack Form state.
      return <></>;
    default:
      return (
        <div className={spanClass(spec.size, 6)}>
          {fieldLabel(spec, id)}
          <input
            id={id}
            name={spec.name}
            type={spec.type ?? "text"}
            value={String(field.state.value ?? "")}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            className={inputClass}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            required={spec.required || undefined}
            placeholder={spec.placeholder}
            autoComplete={spec.autocomplete}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            maxLength={spec.maxlength}
            pattern={spec.pattern}
            accept={spec.accept}
            multiple={spec.multiple || undefined}
          />
          {errorNode}
        </div>
      );
  }
}

/**
 * Render one spec field as a controlled TanStack field using the package's
 * `rf-*` markup classes (same look as the shell-rendered forms). Structural
 * elements (heading, description, divider, section) are not fields — render
 * them with the shell's `renderDecor` instead.
 */
export function ContactFormField({
  form,
  spec,
  bridge,
  size,
  idPrefix = "",
}: ContactFormFieldProps): ReactElement {
  // Fields always carry a `name`; structural elements (heading, description,
  // divider, section) and wizard step markers never do — guard for untyped
  // (JS) callers. TypeScript already rejects them via `FormFieldSpec`.
  if (typeof spec.name !== "string") {
    throw new Error(
      "[contact-form/tanstack] ContactFormField only renders spec fields — pass a field (with a `name`), not a structural element.",
    );
  }
  const id = scopedId(spec, idPrefix);
  // An explicit `size` prop overrides the spec's own width.
  const sized = size !== undefined ? { ...spec, size } : spec;
  return <FieldControl form={form} spec={sized} id={id} validate={bridge.validators[spec.name]} />;
}