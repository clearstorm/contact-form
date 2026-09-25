import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import { ContactForm, type SubmitStatusContext } from "@clearstorm/contact-form/react";
import mailersSpec from "../../../specs/mailers.json";
import { getForm, type NamedForms } from "../lib/forms";

const cf7 = getForm(mailersSpec as NamedForms, "Contact — CF7 mailer");
const json = getForm(mailersSpec as NamedForms, "JSON mailer echo");
const proxy = getForm(mailersSpec as NamedForms, "Resend proxy envelope");
const pageShellTitle = "cf7 · json · config-object mailers";

// Same form data, re-keyed with its own `name` slug so the second rendering
// on this page never collides ids with the demo above it. A custom success
// screen (`renderStatus`) takes over the whole card on submit.
const customSuccess = { ...json, name: "json-success-custom" };
const customSuccessStatus = (ctx: SubmitStatusContext) => (
  <div className="demo-success-screen">
    <h4 className="demo-success-title">✓ {ctx.message}</h4>
    <p className="demo-success-meta">
      <code>{ctx.name}</code> · <code>id={ctx.id}</code> · the echo server logged
      the canonical payload.
    </p>
    <button type="button" className="rf-submit rf-submit--secondary" onClick={ctx.reset}>
      Fill it in again
    </button>
  </div>
);

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

// The proxy-only mailers (resend / postmark / sendgrid) swap multipart for a
// small JSON envelope the consumer's /api/contact worker turns into email —
// no API key ever lives in the browser.
const envelopePreview = `POST /api/contact  (application/json)
  {
    "provider": "resend",
    "formId": "demo-form",
    "to": "team@example.test",
    "payload": {
      "first_name": "Jane",
      "email": "jane@example.com",
      "message": "Hello from the demo"
    }
  }
  # server-side: forward with Bearer \`RESEND_API_KEY\` (see docs/transport-proxies.md)`;

export function MailersPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Mailers</h1>
      <p className="lead">
        <code>@clearstorm/contact-form</code> ships a transport per provider — the
        default <code>cf7</code> (WordPress REST feedback), the generic{" "}
        <code>custom</code>/<code>json</code>, direct publics <code>wpforms</code> /{" "}
        <code>formspree</code> / <code>formkeep</code> / <code>getform</code>, and the
        proxy-only <code>resend</code> / <code>postmark</code> / <code>sendgrid</code>.
        The forms below live in one spec file — <code>examples/specs/mailers.json</code>,
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

      <h2>
        <code>{`{ provider: "custom", … }`}</code> — a config-object mailer
      </h2>
      <p className="lead">
        A <code>mailer</code> config object serialises onto the shell as{" "}
        <code>data-mailer</code> plus <code>data-mailer-method</code> /{" "}
        <code>data-mailer-headers</code> / <code>data-form-token</code> /{" "}
        <code>data-to</code>, so the specless <code>initForms</code> path resolves the
        same provider. The generic <code>custom</code> transport honours
        <code>method</code> / <code>headers</code>; the direct publics and proxies all
        take their settings from the same shape (see the envelope demo below).
      </p>
      <div className="demo-card">
        <pre style={{ margin: 0, overflow: "auto" }}>{`"mailer": {
  "provider": "custom",
  "endpoint": "https://your-worker.example.com/submit",
  "method": "PUT",
  "headers": { "x-channel": "website" }
}`}</pre>
      </div>

      <h2>
        <code>resend</code> — proxy envelope (no secrets client-side)
      </h2>
      <p className="lead">
        <code>resend</code> / <code>postmark</code> / <code>sendgrid</code> never see
        an API key in the browser: the client posts a small JSON envelope to your{" "}
        <code>/api/contact</code> endpoint, and a worker forwards it (the envelope is
        what the echo server prints below). Runnable Next.js + Astro boilerplate:
        <code> docs/transport-proxies.md</code>.
      </p>

      <div className="demo-card">
        <FormDemonstration form={proxy} />
      </div>

      <h2>
        <code>renderStatus</code> — a custom success screen
      </h2>
      <p className="lead">
        The same JSON echo form, re-keyed as <code>json-success-custom</code> and
        given a <code>renderStatus</code> prop. On success the whole card swaps to
        your component (here driven straight from the spec JSON, theme tokens and
        the <code>reset</code> callback); the engine keeps everything up to — but
        not including — the success presentation. Submit it and the default
        success box never appears.
      </p>

      <div className="demo-card">
        <ContactForm form={customSuccess} renderStatus={customSuccessStatus} />
      </div>

      <h2>What travels over the wire</h2>
      <pre>{payloadPreview}</pre>
      <pre>{responsePreview}</pre>
      <p className="lead" style={{ marginBlock: "0.6rem 0.2rem" }}>
        The proxy-only mailers replace that multipart body with the JSON envelope:
      </p>
      <pre>{envelopePreview}</pre>
    </PageShell>
  );
}