/**
 * Framework-agnostic runtime for @clearstorm/contact-form.
 *
 * Everything a non-Astro binding needs lives here: the shared `rf-*` markup
 * builders (`renderFormShell`, `renderElements`, …), the client engine
 * (`attachForm` / `initForms`) and the vanilla JS entry (`renderForm`).
 * Styles live in `./styles.css` — import it once in your bundle.
 *
 * ```js
 * import { renderForm } from "@clearstorm/contact-form/runtime";
 * import "@clearstorm/contact-form/styles.css";
 * const { form, detach } = renderForm("#root", spec, options);
 * ```
 */
import { attachForm, initForms, type AttachOptions } from "./engine";
import {
  renderDecor,
  renderElement,
  renderElements,
  renderField,
  renderFormShell,
  scopedId,
  type RenderFieldProps,
  type ShellOptions,
} from "./markup";
import { RenderedForm, renderForm, type RenderOptions } from "./render";

import "../mailers"; // transport adapters used by the engine

export {
  // engine
  attachForm,
  initForms,
  type AttachOptions,
  // markup builders
  renderDecor,
  renderElement,
  renderElements,
  renderField,
  renderFormShell,
  scopedId,
  type RenderFieldProps,
  type ShellOptions,
  // vanilla render
  renderForm,
  type RenderedForm,
  type RenderOptions,
};

export type { FormSpec, FormFieldSpec } from "../core";