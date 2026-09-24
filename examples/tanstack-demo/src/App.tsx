// The package styles are imported exactly once (they are never auto-injected).
// The `rf-*` classes come from the same stylesheet every binding shares.
import "@clearstorm/contact-form/styles.css";

import { useState } from "react";
import { TanStackBridgeDemo } from "./TanStackBridge";
import { ZodValidationDemo } from "./ZodValidation";

type Demo = "bridge" | "validation";

export function App() {
  const [demo, setDemo] = useState<Demo>("bridge");

  return (
    <>
      <header className="demo-header">
        <div className="demo-shell demo-header__inner">
          <span className="demo-brand">@clearstorm/contact-form · TanStack demo</span>
          <nav className="demo-nav" aria-label="Demos">
            <button
              type="button"
              className={`demo-copy${demo === "bridge" ? " demo-copy--active" : ""}`}
              onClick={() => setDemo("bridge")}
            >
              TanStack bridge
            </button>
            <button
              type="button"
              className={`demo-copy${demo === "validation" ? " demo-copy--active" : ""}`}
              onClick={() => setDemo("validation")}
            >
              Vanilla | Zod validation
            </button>
          </nav>
        </div>
      </header>

      <main className="demo-shell demo-main">
        {demo === "bridge" ? <TanStackBridgeDemo /> : <ZodValidationDemo />}
      </main>

      <footer className="demo-footer">
        <div className="demo-shell">
          <p>
            Demo app inside the package repo — the package is linked live via{" "}
            <code>file:../..</code>, so edits to <code>src/</code> hot-reload. The
            spec here is <code>examples/specs/conditional.json</code> → "Realistic
            enquiry". The json mailer posts to <code>http://localhost:8787</code> —
            start it with <code>npm run demo:api</code>.
          </p>
        </div>
      </footer>
    </>
  );
}