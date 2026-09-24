import type { FormSpec } from "@clearstorm/contact-form/core";

/**
 * Every example spec file is a **map of named forms** —
 * `{ "Form name": FormSpec, … }` — so a single JSON file can hold several
 * examples and one page can render more than one form (see `/wizard`,
 * `/conditional` and `/theming`). A form's display name is the map key; its
 * `name` slug stays unique per file so each rendered `<form id>` never
 * collides on a page. (Port of astro-demo's `src/lib/forms.ts`.)
 */
export type NamedForms = Record<string, FormSpec>;

/** All named forms, in file order — loop-style pages render one card each. */
export function getForms(spec: NamedForms): Array<[string, FormSpec]> {
  return Object.entries(spec);
}

/** One named form, for pages with a bespoke narrative around each form. */
export function getForm(spec: NamedForms, name: string): FormSpec {
  const form = spec[name];
  if (!form) throw new Error(`Missing named form "${name}" in spec file.`);
  return form;
}