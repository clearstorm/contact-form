/**
 * Opt-in TanStack Form binding: values and errors are owned by TanStack Form
 * (controlled inputs, its own error map and submit lifecycle), while the
 * package's core rules drive validation and its mailer sends the submission —
 * the bridge keeps validation copy, canonical payloads and transport identical
 * to the engine-driven bindings.
 */
import { useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { ContactFormField, useContactForm } from "@clearstorm/contact-form/tanstack";
import { isFieldSpec, type FormSpec } from "@clearstorm/contact-form/core";
import conditionalSpec from "../../specs/conditional.json";

export function TanStackDemo() {
  const [spec] = useState<FormSpec>(() => conditionalSpec["Realistic enquiry"] as FormSpec);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const bridge = useContactForm(spec);

  const form = useForm({
    defaultValues: bridge.initialValues,
    onSubmit: async ({ value }) => {
      const result = await bridge.submit(value);
      setStatus({
        text: result.ok ? spec.status ?? "Sent." : result.message,
        error: !result.ok,
      });
    },
  });

  // React to TanStack state so conditional fields render/hide and the submit
  // button reflects in-flight submission.
  const values = useStore(form.store, (s) => s.values);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  const submitLabel = typeof spec.submit === "string" ? spec.submit : (spec.submit?.label ?? "Send");

  return (
    <>
      <h2>2 · TanStack Form — the opt-in bridge</h2>
      <p className="lead">
        <code>useContactForm(spec)</code> maps the package's core rules to
        TanStack validators and the mailer to <code>onSubmit</code>;{" "}
        <code>&lt;ContactFormField /&gt;</code> renders each field with the
        shared <code>rf-*</code> markup. Conditional fields are toggled by
        TanStack state via <code>bridge.isVisible(name, values)</code> instead
        of the DOM-driven engine.
      </p>

      <form
        className="rf-form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
      >
        {spec.fields.map((element) => {
          if (!isFieldSpec(element)) return null;
          if (!bridge.isVisible(element.name, values)) return null;
          return (
            <ContactFormField
              key={element.id}
              form={form}
              spec={element}
              bridge={bridge}
              idPrefix={spec.name}
            />
          );
        })}

        <div className="rf-submit-row">
          <button
            type="submit"
            className="rf-submit rf-submit--primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending…" : submitLabel}
          </button>
        </div>

        {status && (
          <p className={`rf-status${status.error ? " rf-status--error" : ""}`} role="status">
            {status.text}
          </p>
        )}
      </form>

      <p className="lead">
        Toggle <strong>Service → Other</strong> to reveal the "Describe the
        service" field, or tick <strong>This is urgent</strong> for the deadline
        date — visibility is purely TanStack state. Submitting runs the
        package's <code>json</code> mailer with only the <em>visible</em>{" "}
        fields in the payload (run <code>npm run demo:api</code> in
        <code>examples/astro-demo</code> to watch it arrive).
      </p>
    </>
  );
}