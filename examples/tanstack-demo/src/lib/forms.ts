import type { FormSpec } from "@clearstorm/contact-form/core";

/**
 * Every example spec file is a **map of named forms** — see examples/specs.
 * Shared with the react-demo (same helper as astro-demo's `src/lib/forms.ts`).
 */
export type NamedForms = Record<string, FormSpec>;

/** One named form, for pages with a bespoke narrative around each form. */
export function getForm(spec: NamedForms, name: string): FormSpec {
  const form = spec[name];
  if (!form) throw new Error(`Missing named form "${name}" in spec file.`);
  return form;
}