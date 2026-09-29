"use client";

import { ContactForm } from "@clearstorm/contact-form/react";
import type { FormSpec } from "@clearstorm/contact-form/core";
import "@clearstorm/contact-form/styles.css"; // the shared theme — imported once
import proxySpec from "../content/forms/proxy.json";

const forms = Object.entries(proxySpec as Record<string, FormSpec>);

export default function HomePage() {
  return (
    <main style={styles.main}>
      <h1>Next.js transport proxy</h1>
      <p>
        The forms below render from <code>content/forms/proxy.json</code> and
        POST the <code>{"{ provider, formId, to, payload }"}</code> envelope to{" "}
        <code>/api/contact</code>. Server secrets live in <code>.env</code> —
        see the README and <code>docs/transport-proxies.md</code>.
      </p>

      {forms.map(([title, form]) => (
        <section key={title} style={styles.card}>
          <h2>{title}</h2>
          <ContactForm form={form} />
          <details>
            <summary>Spec — content/forms/proxy.json</summary>
            <pre>{JSON.stringify(form, null, 2)}</pre>
          </details>
        </section>
      ))}
    </main>
  );
}

const styles = {
  main: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: "70rem",
    margin: "2rem auto",
    padding: "0 1rem",
    color: "#1a202c",
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.5rem",
    padding: "1rem 1.25rem",
    margin: "1.5rem 0",
  },
} as const;
