/**
 * Vanilla JS render helper — the "no framework" entry point.
 *
 * Mount a complete working form into any DOM node (or selector):
 *
 * ```js
 * import { renderForm } from "@clearstorm/contact-form/vanilla";
 * import "@clearstorm/contact-form/styles.css";
 *
 * const { form, detach } = renderForm("#root", spec, { config: { endpoint } });
 * // later: detach(); // remove listeners + injected error DOM
 * ```
 *
 * Styles are intentionally NOT auto-injected (import styles.css once, or link
 * it directly for script-tag / plain-HTML use).
 */
import { attachForm, type FormEventName, type HookRegistry } from "./engine";
import { renderFormShell, type ShellOptions } from "./markup";
import type { FormSpec, ValidateOn, ValidationProvider } from "../core";

export interface RenderOptions extends Omit<ShellOptions, "form"> {
  /**
   * Optional CSS to inject once as a `<style>` element (e.g. the contents of
   * `@clearstorm/contact-form/styles.css`). Prefer importing the stylesheet;
   * this option exists for script-tag / no-bundler consumers.
   */
  styles?: string;
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
   * Pre-fill matching controls after render: `{ name: value }` (or a list for
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
   * event stay engine-driven). Pair with a `rf:submit-success` listener to
   * swap in a custom success UI. Defaults to `true`.
   */
  autoSuccess?: boolean;
}

export interface RenderedForm {
  /** The mounted `<form>` element. */
  form: HTMLFormElement;
  /** Subscribe to a `rf:*` event on the form — removed by `detach()`. */
  on: (event: FormEventName, handler: (event: CustomEvent) => void) => void;
  /** Remove all listeners (incl. `on` subscriptions) and injected error DOM. */
  detach: () => void;
}

let styleInjected = false;

const injectStyles = (css: string): void => {
  if (styleInjected || !document.querySelector("style[data-rf-styles]")) {
    const style = document.createElement("style");
    style.setAttribute("data-rf-styles", "");
    style.textContent = css;
    document.head.appendChild(style);
  }
};

/** Mount `spec` into `container` (element or CSS selector) and wire it up. */
export function renderForm(
  container: HTMLElement | string,
  form: FormSpec,
  options: RenderOptions = {},
): RenderedForm {
  const root =
    typeof container === "string" ? document.querySelector<HTMLElement>(container) : container;
  if (!root) throw new Error(`[renderForm] container not found: ${String(container)}`);

  if (options.styles) injectStyles(options.styles);

  const html = renderFormShell({ form, config: options.config, prefill: options.prefill });
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const formEl = template.content.firstElementChild as HTMLFormElement | null;
  if (!(formEl instanceof HTMLFormElement)) {
    throw new Error("[renderForm] internal error: shell did not render a <form>");
  }

  root.appendChild(formEl);
  const attached = attachForm(formEl, {
    spec: form,
    validation: options.validation,
    hooks: options.hooks,
    values: options.values,
    validateOn: options.validateOn,
    autoSuccess: options.autoSuccess,
  });
  return {
    form: formEl,
    on: (event, handler) => attached.on(event, handler),
    detach: () => attached.detach(),
  };
}