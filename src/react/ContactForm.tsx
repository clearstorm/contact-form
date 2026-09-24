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
 */
"use client";

import { useEffect, useRef, type ReactElement } from "react";
import { fieldRenderProps, renderField, renderFormShell } from "../runtime/markup";
import { attachForm } from "../runtime/engine";
import type { FormFieldSpec, FormSpec } from "../core";

export interface ContactFormProps {
  form: FormSpec;
  /** Explicit endpoint overrides — take precedence over the form spec. */
  config?: { endpoint?: string; apiUrl?: string; cf7FormId?: string };
  /** "datetime" pre-fills date/time inputs with the current local date/time. */
  prefill?: "datetime";
}

/** Server-rendered, engine-wired contact form for any React-based framework. */
export function ContactForm({ form, config, prefill }: ContactFormProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const formEl = root?.querySelector<HTMLFormElement>("form[data-mail-form]");
    if (!root || !formEl) return;
    // `spec` is passed explicitly so the engine never depends on the shell's
    // data-rules serialisation being present on a custom mount point.
    return attachForm(formEl, { spec: form });
  }, [form]);

  return (
    <div
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