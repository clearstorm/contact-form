/**
 * The shared bridge renderer used by both tanstack-demo pages: given a spec
 * (and an optional validation provider) it wires `useContactForm` → `useForm`,
 * renders every *visible* field through `<ContactFormField />`, and submits
 * through the package's mailer. Both demos pass the same spec — ZodValidation
 * only swaps the `validation` provider, proving which rules run is the seam.
 */
import { useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { ContactFormField, useContactForm } from "@clearstorm/contact-form/tanstack";
import { isFieldSpec, type FormSpec, type ValidationProvider } from "@clearstorm/contact-form/core";

interface Props {
  spec: FormSpec;
  /** Optional validation provider — swaps which rules the validators run. */
  validation?: ValidationProvider;
}

export function ControlledForm({ spec, validation }: Props) {
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const bridge = useContactForm(spec, validation ? { validation } : {});

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
  );
}