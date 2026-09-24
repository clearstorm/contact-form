/**
 * Vanilla page — the framework-agnostic binding mounted *inside* a React
 * component. The form below is `renderForm(container, spec)` from
 * `@clearstorm/contact-form/vanilla`: the engine owns validation, conditional
 * fields, the honeypot and mailer dispatch, while React simply owns the mount
 * node. The effect's cleanup calls `detach()`, so the engine is unwired on
 * unmount — including StrictMode's double-invoke. This proves the engine and
 * React coexist: the React adapter's `<ContactForm />` does exactly this under
 * the hood. (Port of astro-demo's `/vanilla` page.)
 */
import { useEffect, useRef, useState } from "react";
import { renderForm } from "@clearstorm/contact-form/vanilla";
import { PageShell } from "../components/PageShell";
import mailersSpec from "../../../specs/mailers.json";
import { getForm, type NamedForms } from "../lib/forms";

const spec = getForm(mailersSpec as NamedForms, "JSON mailer echo");

export function VanillaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(true);
  const [status, setStatus] = useState("mounted");

  useEffect(() => {
    const root = mountRef.current;
    if (!root || !mounted) return;
    root.innerHTML = "";
    const { detach } = renderForm(root, spec);
    setStatus("mounted");
    return () => {
      detach();
      setStatus("detached — markup left in place, engine unwired");
    };
  }, [mounted]);

  return (
    <PageShell title="@clearstorm/contact-form/vanilla">
      <h1>Vanilla JS, inside React</h1>
      <p className="lead">
        The same form spec is just <em>data + one function call</em>.{" "}
        <code>renderForm(container, spec)</code> mounts a fully working form
        (validation, conditional fields, honeypot, mailer dispatch) into any DOM
        node and returns <code>{"{ form, detach }"}</code>. The form below is{" "}
        <code>"JSON mailer echo"</code> from <code>examples/specs/mailers.json</code>{" "}
        — the identical spec the Mailers page renders through the React adapter — and
        it is mounted here by a plain <code>useEffect</code>, not by the adapter.
      </p>

      <div className="demo-card">
        <h2>Usage</h2>
        <pre>{`import { renderForm } from "@clearstorm/contact-form/vanilla";
import "@clearstorm/contact-form/styles.css"; // once, anywhere

const { form, detach } = renderForm(document.querySelector("#mount"), spec);

// later — remove listeners and injected error DOM:
detach();`}</pre>

        <p className="lead" style={{ marginBlock: "0.4rem 0.2rem" }}>
          Styles are deliberately <em>not</em> auto-injected — import{" "}
          <code>@clearstorm/contact-form/styles.css</code> once (see App.tsx). Try
          the lifecycle: <strong>Detach</strong> leaves the markup in place but inert
          (submission and validation stop — the React adapter's cleanup calls{" "}
          <code>detach()</code> on unmount for StrictMode safety), then{" "}
          <strong>Re-mount</strong> wires it up again.
        </p>

        <div ref={mountRef} />

        <div className="demo-actions">
          <button type="button" className="demo-copy" onClick={() => setMounted(false)}>
            Detach
          </button>
          <button type="button" className="demo-copy" onClick={() => setMounted(true)}>
            Re-mount
          </button>
          <span className="demo-status" role="status" aria-live="polite">
            {status}
          </span>
        </div>
      </div>

      <p className="lead">
        Nothing about the spec is framework-specific — the same JSON drives the Astro
        shell, the React adapter and this vanilla mount; all three run the exact same
        engine under the hood.
      </p>
    </PageShell>
  );
}