// The package styles are imported exactly once (they are never auto-injected).
// The `rf-*` classes come from the same stylesheet every binding shares.
import "@clearstorm/contact-form/styles.css";

import { UncontrolledDemo } from "./UncontrolledDemo";
import { TanStackDemo } from "./TanStackDemo";

export function App() {
  return (
    <>
      <header className="demo-header">
        <div className="demo-shell demo-header__inner">
          <span className="demo-brand">@clearstorm/contact-form · React demo</span>
        </div>
      </header>

      <main className="demo-shell demo-main">
        <p className="demo-kicker">@clearstorm/contact-form/react</p>
        <h1>React, two ways</h1>
        <p className="lead">
          Both forms below are driven by the <em>same</em> spec objects from{" "}
          <code>examples/specs/*.json</code> — the identical JSON the Astro and
          vanilla demos mount. The first renders the package's uncontrolled{" "}
          <code>&lt;ContactForm /&gt;</code> (the shared engine owns validation
          and submission). The second hands values and errors to{" "}
          <strong>TanStack Form</strong> via the opt-in bridge.
        </p>

        <UncontrolledDemo />

        <TanStackDemo />
      </main>

      <footer className="demo-footer">
        <div className="demo-shell">
          <p>
            Demo app inside the package repo — the package is linked live via{" "}
            <code>file:../..</code>, so edits to <code>src/</code> hot-reload.
            Run <code>npm run demo:api</code> in <code>examples/astro-demo</code>{" "}
            to watch the json mailer payloads arrive.
          </p>
        </div>
      </footer>
    </>
  );
}