/**
 * React binding for @clearstorm/contact-form.
 *
 * Renders the shared shell markup server-side (SSR-friendly — works with
 * Next.js App + Pages Router, TanStack Start and Vite) and hands the mounted
 * DOM to the framework-agnostic engine on the client. After mount the form is
 * uncontrolled: the engine alone owns validation, conditional visibility,
 * wizard state and submission — React never re-renders the form internals, so
 * the engine's DOM mutations (errors, pane toggling, status box) are never at
 * odds with reconciliation. Cleanup detaches the engine (StrictMode-safe).
 *
 * The optional `renderStatus` prop flips submission success to a component of
 * yours: the engine is told `autoSuccess: false` (it never shows its own
 * success box), a `rf:submit-success` subscription stores the result, and the
 * rendered output swaps from the form to your success screen. `reset()` on the
 * context re-mounts the form as a fresh engine-wired instance. Submit errors
 * keep the engine's default status box.
 */
"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { fieldRenderProps, renderField, renderFormShell } from "../runtime/markup";
import { attachForm, type HookRegistry } from "../runtime/engine";
import type { FormFieldSpec, FormSpec, ValidateOn, ValidationProvider } from "../core";

export interface ContactFormProps {
  form: FormSpec;
  /** Explicit endpoint overrides — take precedence over the form spec. */
  config?: { endpoint?: string; apiUrl?: string; cf7FormId?: string };
  /** "datetime" pre-fills date/time inputs with the current local date/time. */
  prefill?: "datetime";
  /**
   * Validation provider — swaps which rules run. Defaults to the package's
   * vanilla rules; pass e.g. a Zod-derived provider (see
   * `@clearstorm/contact-form/validation`) to validate differently.
   */
  validation?: ValidationProvider;
  /**
   * Lifecycle hooks (`beforeValidateStep` / `afterStepChange` /
   * `beforeSubmit` / `afterSubmit` — veto-capable) plus a named registry for
   * the spec's hook-ref *names* (see `attachForm` options).
   */
  hooks?: HookRegistry;
  /**
   * Pre-fill matching controls after mount: `{ name: value }` (or a list for
   * checkbox/radio groups and multi-selects). Applied after any stored
   * `autoSave` draft, so explicit values win. Not serialised; runtime-only.
   */
  values?: Record<string, string | string[]>;
  /**
   * Override the form's `validateOn` timing (wins over the spec key / the
   * shell's `data-validate-on`). Not serialised; runtime-only.
   */
  validateOn?: ValidateOn;
  /**
   * `false` — the consumer owns the *success* presentation: the engine never
   * shows the success status box and never adds `rf-form--success` on success
   * (field errors, the reset, the error box and the `rf:submit-success`
   * event stay engine-driven). Use it with `renderStatus`. Defaults to `true`.
   */
  autoSuccess?: boolean;
  /**
   * Success-only render prop: when a submit succeeds the form is replaced in
   * place by this component (mounted with the success context below); when
   * `reset()` is called the form re-mounts as a fresh engine-wired instance.
   * Submit errors keep the engine's default status box. Prefer a stable
   * function identity (e.g. `useCallback`) to avoid re-attaching the engine
   * on every render.
   */
  renderStatus?: (ctx: SubmitStatusContext) => ReactElement;
}

/** Context handed to the `renderStatus` success screen. */
export interface SubmitStatusContext {
  /** The spec's `status` string — the same success message the engine box would show. */
  message: string;
  /** The form's `data-mail-form` name (from the spec). */
  name: string;
  /** The rendered `<form>` element's id. */
  id: string;
  /** The `<form>` element that just submitted (detached once the success screen is shown). */
  form: HTMLFormElement;
  /** Re-mount the form as a fresh engine-wired instance and leave the success screen. */
  reset: () => void;
}

/** The state a successful submit leaves behind for the `renderStatus` branch. */
interface SubmitSuccessState {
  message: string;
  form: HTMLFormElement;
}

/** Server-rendered, engine-wired contact form for any React-based framework. */
export function ContactForm({ form, config, prefill, validation, hooks, values, validateOn, autoSuccess, renderStatus }: ContactFormProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [success, setSuccess] = useState<SubmitSuccessState | null>(null);
  const [resetKey, setResetKey] = useState(0);

  // A different spec arriving mid-flight (route change) must drop the stale
  // success screen synchronously — correcting state during render, the React
  // sanctioned pattern for deriving from a changing prop.
  const [lastForm, setLastForm] = useState(form);
  if (form !== lastForm) {
    setLastForm(form);
    setSuccess(null);
  }

  useEffect(() => {
    const root = rootRef.current;
    const formEl = root?.querySelector<HTMLFormElement>("form[data-mail-form]");
    if (!root || !formEl) return;
    // `spec` is passed explicitly so the engine never depends on the shell's
    // data-rules serialisation being present on a custom mount point.
    const attached = attachForm(formEl, {
      spec: form,
      validation,
      hooks,
      values,
      validateOn,
      // With a custom success screen the engine owns everything up to (not
      // including) the success presentation.
      autoSuccess: renderStatus ? false : autoSuccess,
    });
    if (renderStatus) {
      attached.on("rf:submit-success", (event) => {
        const detail = (event as CustomEvent).detail as { message?: string } | undefined;
        setSuccess({ message: detail?.message ?? "", form: formEl });
      });
    }
    return () => attached.detach();
  }, [form, validation, hooks, values, validateOn, autoSuccess, renderStatus, resetKey]);

  if (success && renderStatus) {
    return (
      <div ref={rootRef}>
        {renderStatus({
          message: success.message,
          name: form.name,
          id: `${form.name}-form`,
          form: success.form,
          reset: () => {
            setSuccess(null);
            setResetKey((key) => key + 1);
          },
        })}
      </div>
    );
  }

  return (
    <div
      key={resetKey}
      ref={rootRef}
      dangerouslySetInnerHTML={{ __html: renderFormShell({ form, config, prefill }) }}
    />
  );
}

export interface FieldProps {
  /** A single field spec to render. */
  spec: FormFieldSpec;
  /** Score scope for derived ids (see renderElements). */
  idPrefix?: string;
}

/**
 * Render a single spec field standalone. The wrapper uses `display: contents`
 * so the `<div class="rf-field">` stays a direct grid child when composed
 * inside a form's layout (mirrors what the shell does for whole forms).
 */
export function Field({ spec, idPrefix = "" }: FieldProps): ReactElement {
  return (
    <div
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: renderField(fieldRenderProps(spec, idPrefix)) }}
    />
  );
}