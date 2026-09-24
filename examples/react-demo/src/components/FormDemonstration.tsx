/**
 * Demo wrapper for a named form: renders the live `<ContactForm>` next to a
 * **Spec** tab showing the exact JSON driving it. Every page uses this, so each
 * form on the demo doubles as a copy-paste-ready reference — the same shape as
 * astro-demo's `FormDemo.astro`.
 *
 * The tabs are CSS-only (a hidden radio pair keyed on the form's `name` slug,
 * toggled by the generic `[id$="-tab-form"]:checked ~ …` rules in styles.css).
 * The radios are uncontrolled (`defaultChecked`), so React never fights the
 * native toggle. `config` passes straight through to `<ContactForm>`.
 */
import { useState, type FormEvent } from "react";
import { ContactForm } from "@clearstorm/contact-form/react";
import type { FormSpec, ValidationProvider } from "@clearstorm/contact-form/core";

interface Props {
  form: FormSpec;
  /** Explicit endpoint overrides — forwarded to ContactForm. */
  config?: { endpoint?: string; apiUrl?: string; cf7FormId?: string };
  /** Validation provider — swaps which rules run (see the tanstack-demo). */
  validation?: ValidationProvider;
}

export function FormDemonstration({ form, config, validation }: Props) {
  // The form's own name slug is unique per spec file (and per page), so the
  // tab radios never collide — even when a page renders several forms.
  const tabBase = form.name;
  const specJson = JSON.stringify(form, null, 2);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const copy = async (e: FormEvent<HTMLButtonElement>) => {
    const pre = e.currentTarget.closest(".demo-tabpanel")?.querySelector("pre");
    const text = pre?.textContent ?? "";
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setCopyLabel(ok ? "Copied ✓" : "Copy failed");
    window.setTimeout(() => setCopyLabel("Copy"), 1500);
  };

  return (
    <div className="demo-tabs">
      <input
        className="demo-tabs-radio"
        type="radio"
        name={tabBase}
        id={`${tabBase}-tab-form`}
        defaultChecked
      />
      <input
        className="demo-tabs-radio"
        type="radio"
        name={tabBase}
        id={`${tabBase}-tab-spec`}
      />

      <div className="demo-tabbar" role="tablist" aria-label="View">
        <label className="demo-tab" role="tab" htmlFor={`${tabBase}-tab-form`}>
          Form
        </label>
        <label className="demo-tab" role="tab" htmlFor={`${tabBase}-tab-spec`}>
          Spec
        </label>
      </div>

      <div
        className="demo-tabpanel demo-tabpanel--form"
        id={`${tabBase}-panel-form`}
        role="tabpanel"
      >
        <ContactForm form={form} config={config} validation={validation} />
      </div>

      <div
        className="demo-tabpanel demo-tabpanel--spec"
        id={`${tabBase}-panel-spec`}
        role="tabpanel"
      >
        <div className="demo-spec-head">
          <span className="demo-spec-title">Spec — {tabBase}.json</span>
          <button className="demo-copy" type="button" onClick={copy}>
            {copyLabel}
          </button>
        </div>
        <pre className="demo-spec">{specJson}</pre>
      </div>
    </div>
  );
}