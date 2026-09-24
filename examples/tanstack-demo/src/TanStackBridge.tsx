/**
 * Opt-in TanStack Form binding: values and errors are owned by TanStack Form
 * (controlled inputs, its own error map and submit lifecycle), while the
 * package's core rules drive validation and its mailer sends the submission —
 * the bridge keeps validation copy, canonical payloads and transport identical
 * to the engine-driven bindings. (Moved from the react-demo when it grew into
 * the route-parity app.)
 */
import { ControlledForm } from "./components/ControlledForm";
import conditionalSpec from "../../specs/conditional.json";
import type { FormSpec } from "@clearstorm/contact-form/core";

const spec = conditionalSpec["Realistic enquiry"] as FormSpec;

export function TanStackBridgeDemo() {
  return (
    <>
      <p className="demo-kicker">@clearstorm/contact-form/tanstack</p>
      <h1>TanStack Form — the opt-in bridge</h1>
      <p className="lead">
        <code>useContactForm(spec)</code> maps the package's core rules to
        TanStack validators and the mailer to <code>onSubmit</code>;{" "}
        <code>&lt;ContactFormField /&gt;</code> renders each field with the shared{" "}
        <code>rf-*</code> markup. Conditional fields are toggled by TanStack state
        via <code>bridge.isVisible(name, values)</code> instead of the DOM-driven
        engine.
      </p>

      <div className="demo-card">
        <h2>Realistic enquiry — via the bridge</h2>
        <ControlledForm spec={spec} />
      </div>

      <p className="lead">
        Toggle <strong>Service → Other</strong> to reveal the "Describe the service"
        field, or tick <strong>This is urgent</strong> for the deadline date —
        visibility is purely TanStack state. Submitting runs the package's{" "}
        <code>json</code> mailer with only the <em>visible</em> fields in the payload
        (run <code>npm run demo:api</code> in this directory to watch it arrive).
      </p>
    </>
  );
}