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
import { attachForm } from "./engine";
import { renderFormShell, type ShellOptions } from "./markup";
import type { FormSpec } from "../core";

export interface RenderOptions extends Omit<ShellOptions, "form"> {
  /**
   * Optional CSS to inject once as a `<style>` element (e.g. the contents of
   * `@clearstorm/contact-form/styles.css`). Prefer importing the stylesheet;
   * this option exists for script-tag / no-bundler consumers.
   */
  styles?: string;
}

export interface RenderedForm {
  /** The mounted `<form>` element. */
  form: HTMLFormElement;
  /** Remove all listeners and injected error DOM. */
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
  const detach = attachForm(formEl, { spec: form });
  return { form: formEl, detach };
}