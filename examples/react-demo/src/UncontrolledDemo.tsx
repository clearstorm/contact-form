/**
 * Uncontrolled binding: `<ContactForm form={spec} />` renders the shared shell
 * markup server-side and hands the mounted DOM to the framework-agnostic
 * engine — validation, conditional visibility and submission are all engine
 * controlled, so React never re-renders the form internals. StrictMode-safe
 * (the engine is detached on unmount).
 */
import { useState } from "react";
import { ContactForm } from "@clearstorm/contact-form/react";
import type { FormSpec } from "@clearstorm/contact-form/core";
import mailersSpec from "../../specs/mailers.json";
import conditionalSpec from "../../specs/conditional.json";

export function UncontrolledDemo() {
  const [jsonForm] = useState<FormSpec>(() => mailersSpec["JSON mailer echo"] as FormSpec);
  const [conditionalForm] = useState<FormSpec>(() => conditionalSpec["Realistic enquiry"] as FormSpec);

  return (
    <>
      <h2>1 · Uncontrolled — &lt;ContactForm /&gt;</h2>
      <p className="lead">
        Works in any React framework (Next.js App + Pages Router, TanStack
        Start, Vite). Pass the spec and an optional <code>config</code>;
        conditional fields, the honeypot and the mailer payload all match the
        engine-driven bindings.
      </p>

      <div>
        <h3 style={{ marginTop: 0 }}>JSON mailer echo</h3>
        <div className="demo-card">
          <ContactForm form={jsonForm} />
        </div>
      </div>

      <div>
        <h3>Conditional fields</h3>
        <div className="demo-card">
          <ContactForm form={conditionalForm} />
        </div>
      </div>
    </>
  );
}