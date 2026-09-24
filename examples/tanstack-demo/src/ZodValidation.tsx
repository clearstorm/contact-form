/**
 * The Phase 5 seam in action: the exact same form spec, rendered by the exact
 * same `<ControlledForm />`, with only the *validation provider* swapped. The
 * package validates through opaque per-field `Rule` objects, so swapping the
 * provider never changes *how* validation runs — only *which* rules run: the
 * copy, required-ness and format checks below come from the consumer's Zod
 * schema (not the package's vanilla regex defaults), while the DOM, the
 * payload and the mailer transport stay identical.
 *
 * `zodValidation(schema)` consumes the schema structurally (`.shape` +
 * `.safeParse`); required-ness follows the schema (a field is required exactly
 * when the schema rejects `""` — the untouched-DOM value), and values arrive
 * as strings, so the schema coerce/allow "" where appropriate.
 */
import { useMemo, useState } from "react";
import { z } from "zod";
import { vanillaValidation, type ValidationProvider } from "@clearstorm/contact-form/core";
import { zodValidation } from "@clearstorm/contact-form/validation";
import { ControlledForm } from "./components/ControlledForm";
import conditionalSpec from "../../specs/conditional.json";
import type { FormSpec } from "@clearstorm/contact-form/core";

const spec = conditionalSpec["Realistic enquiry"] as FormSpec;

type Mode = "vanilla" | "zod";

/** The schema that drives zod mode — exported so tests/probes reuse the exact schema. */
export const zodSchema = z.object({
  first_name: z.string().min(2, "Your first name needs 2+ characters."),
  last_name: z.string().min(2, "Your last name needs 2+ characters."),
  email: z.string().email("That doesn't look like an email address."),
  // optional in the spec — accepts "" so it never blocks submit.
  phone: z
    .string()
    .regex(/^[\d+()\-.\s]{7,15}$/, "Phone: 7–15 digits (spaces, +, ( ), - ok).")
    .or(z.literal("")),
  service: z.string().min(1, "Choose a service."),
  // required in the spec — only ever validated while visible (Service = Other).
  other_service: z.string().min(2, "Describe the service in 2+ characters."),
  // a single checkbox — any of "" / "1" is fine, never blocks.
  rush: z.string(),
  // only validated while visible (This is urgent = filled).
  deadline: z.string().min(1, "Pick your ideal deadline."),
  message: z.string().min(10, "Your message needs 10+ characters.").max(500, "500 characters max."),
});

const zodSchemaListing = `z.object({
  first_name: z.string().min(2, "Your first name needs 2+ characters."),
  last_name:  z.string().min(2, "Your last name needs 2+ characters."),
  email:      z.string().email("That doesn't look like an email address."),
  phone:      z.string().regex(/^[\\d+()\\-.\\s]{7,15}$/, "Phone: 7–15 digits…")
                .or(z.literal("")),                      // optional — "" passes
  service:    z.string().min(1, "Choose a service."),
  other_service: z.string().min(2, "Describe the service in 2+ characters."),
  rush:       z.string(),                                 // checkbox — "" / "1"
  deadline:   z.string().min(1, "Pick your ideal deadline."),
  message:    z.string().min(10, "Your message needs 10+ characters.")
                .max(500, "500 characters max."),
})`;

export function ZodValidationDemo() {
  const [mode, setMode] = useState<Mode>("vanilla");

  const provider = useMemo<ValidationProvider>(
    () => (mode === "zod" ? zodValidation(zodSchema) : vanillaValidation),
    [mode],
  );

  return (
    <>
      <p className="demo-kicker">@clearstorm/contact-form/validation</p>
      <h1>Pluggable validation — vanilla | Zod</h1>
      <p className="lead">
        Validators don't have to come from the package's vanilla rules. Pass any{" "}
        <code>ValidationProvider</code> — the one below is{" "}
        <code>zodValidation(schema)</code> from{" "}
        <code>@clearstorm/contact-form/validation</code> — and the same form is
        validated by the schema instead. The DOM, the error UI, the payload and the
        mailer are unchanged; only <em>which rules run</em> differs.
      </p>

      <p className="lead">
        <strong>Try it:</strong> type <code>john..doe@example.com</code> as the
        email in either mode and submit — the vanilla rule's relaxed pattern
        accepts it, the Zod schema's <code>.email()</code> rejects the
        consecutive dots. Clear the message and compare how each provider words its
        rejection. Toggling keeps your values; the new rules apply on the next
        validation pass.
      </p>

      <div className="demo-toggle" role="group" aria-label="Validation provider">
        <button
          type="button"
          className={`demo-copy${mode === "vanilla" ? " demo-copy--active" : ""}`}
          onClick={() => setMode("vanilla")}
        >
          vanilla rules
        </button>
        <button
          type="button"
          className={`demo-copy${mode === "zod" ? " demo-copy--active" : ""}`}
          onClick={() => setMode("zod")}
        >
          zod schema
        </button>
      </div>

      <div className="demo-note">
        <p>
          <strong>Active provider:</strong>{" "}
          {mode === "vanilla"
            ? "the package's vanilla regex rules (default)."
            : "zodValidation(zodSchema) — copy, required-ness and format from the schema."}
        </p>
      </div>

      <div className="demo-card">
        <h2>Realistic enquiry — spec unchanged, provider swapped</h2>
        <ControlledForm spec={spec} validation={provider} />
      </div>

      <h2>The schema driving zod mode</h2>
      <pre>{zodSchemaListing}</pre>

      <p className="lead" style={{ marginBottom: 0 }}>
        Fields absent from the schema keep their vanilla rule — the adapter composes,{" "}
        nothing is dropped. The schema is consumed structurally (no zod import inside
        the package module); zod stays an optional peer dependency that only loads
        when a consumer builds a schema.
      </p>
    </>
  );
}