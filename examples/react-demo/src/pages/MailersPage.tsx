import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import mailersSpec from "../../../specs/mailers.json";
import { getForm, type NamedForms } from "../lib/forms";

const cf7 = getForm(mailersSpec as NamedForms, "Contact — CF7 mailer");
const json = getForm(mailersSpec as NamedForms, "JSON mailer echo");
const pageShellTitle = "cf7 · json transports";

// Endpoint config is the consumer's business — the engine never reads env. The
// demo reads the Vite convention (VITE_*) for the same PUBLIC_* story the
// Astro demo tells with import.meta.env.
const apiUrl: string | undefined = import.meta.env.VITE_API_URL;
const cf7FormId: string | undefined = import.meta.env.VITE_CF7_FORM_ID;
const target = apiUrl
  ? `${apiUrl.replace(/\/$/, "")}/wp-json/contact-form-7/v1/contact-forms/${cf7FormId ?? "5"}/feedback`
  : null;

// The payload the `json` mailer sends is governed by the *client* field spec
// (the data-rules serialised from the JSON), not by however the browser wired
// the DOM — honeypot excluded, checkbox groups joined, values trimmed.
const payloadPreview = `POST /submit  (multipart/form-data)
  first_name : Jane
  last_name  : Doe
  email      : jane@example.com
  interests  : Newsletter, Events      ← checkbox group, comma-joined
  message    : Hello from the demo
  # honeypot field (name="website") is dropped by canonicalData()`;

const responsePreview = `200 OK  application/json
  { "ok": true, "message": "Payload received by the demo echo server." }`;

export function MailersPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Mailers</h1>
      <p className="lead">
        <code>@clearstorm/contact-form</code> ships two transports today — the default{" "}
        <code>cf7</code> (WordPress Contact Form 7 REST feedback endpoint) and the
        generic <code>json</code> (POST the canonical payload to any endpoint). Both
        forms below live in one spec file — <code>examples/specs/mailers.json</code>,
        a map of named forms.
      </p>

      <h2>
        <code>cf7</code> — WordPress Contact Form 7
      </h2>
      <p className="lead">
        Core fields go verbatim; anything else would fold into the message as labelled
        lines and the subject carries the sender name. This form passes the endpoint
        via the <code>config</code> prop, read from <code>VITE_API_URL</code> /{" "}
        <code>VITE_CF7_FORM_ID</code>.
      </p>

      <div className="demo-note">
        {target ? (
          <p>Resolved target: <code>{target}</code></p>
        ) : (
          <>
            <p>
              <strong>Endpoint not configured.</strong> Set the two env vars when
              running the demo to point at a real WordPress install:
            </p>
            <pre>{`VITE_API_URL=https://cms.example.com VITE_CF7_FORM_ID=5 npm run dev`}</pre>
            <p>
              Without them the form still renders and validates — the mailer just
              refuses to send (see the config-error copy).
            </p>
          </>
        )}
      </div>

      <div className="demo-card">
        <FormDemonstration form={cf7} config={{ apiUrl, cf7FormId }} />
      </div>

      <p className="lead" style={{ marginBlock: "0.4rem 0.2rem" }}>
        The <code>cf7</code> mailer sends <code>first_name, last_name, email,
        contact, subject, message</code> verbatim, appends <code>_wpcf7</code> /{" "}
        <code>_wpcf7_unit_tag</code>, and reads the CF7 <code>status</code> response.
        A filled honeypot is never forwarded.
      </p>

      <h2>
        <code>json</code> — generic endpoint
      </h2>
      <p className="lead">
        The <code>json</code> mailer posts the <strong>canonical payload</strong> —
        exactly the spec fields, trimmed, honeypot excluded — to the endpoint in the
        form spec. Run the bundled echo server and submit the form below to watch the
        wire format appear in your terminal. A 2xx response is success; on failure the
        mailer surfaces a <code>message</code>/<code>error</code> field from the JSON
        body.
      </p>

      <div className="demo-note">
        <p>
          <code>npm run demo:api</code> in a second terminal, then submit the form
          below. The canonical payload is printed to that server's console.
        </p>
      </div>

      <div className="demo-card">
        <FormDemonstration form={json} />
      </div>

      <h2>What travels over the wire</h2>
      <pre>{payloadPreview}</pre>
      <pre>{responsePreview}</pre>
    </PageShell>
  );
}