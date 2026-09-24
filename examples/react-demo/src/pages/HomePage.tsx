import { Link } from "react-router";
import { PageShell } from "../components/PageShell";

const pages = [
  {
    to: "/field-types",
    title: "Field types",
    blurb:
      "Every element a form can render — two named forms in one file: the all-20 field types kitchen sink (including file uploads, a multi-select and a datalist) and the four structural field types.",
  },
  {
    to: "/conditional",
    title: "Conditional fields",
    blurb:
      "Fields reveal from the visitor's own input — three named forms in one spec file: a realistic enquiry, all seven showWhen operators, and an AND reveal.",
  },
  {
    to: "/wizard",
    title: "Multi-step wizard",
    blurb:
      "Three named forms from one spec file — a flagship wizard, every field type on an even-slice stepper, and the compact chrome options.",
  },
  {
    to: "/mailers",
    title: "Mailers",
    blurb:
      "Both transports on one page — the default cf7 mailer (WordPress CF7 endpoint, env-configurable) and the json mailer posting the canonical payload to a local echo server.",
  },
  {
    to: "/theming",
    title: "Theming",
    blurb:
      "Both themes — light and dark — as two named forms in one spec file, re-themed purely via CSS custom properties.",
  },
  {
    to: "/vanilla",
    title: "Vanilla JS",
    blurb:
      "The same spec mounted with a single renderForm() call — inside a React component — plus the detach() lifecycle for removing a form cleanly.",
  },
];

export function HomePage() {
  return (
    <PageShell title="Reference deployment">
      <h1>@clearstorm/contact-form demo</h1>
      <p className="lead">
        A Vite + React app exercising the package end to end: the JSON form spec,
        every field type and validation rule, both transport mailers,
        consumer-driven copy and CSS-only theming — using the same{" "}
        <code>examples/specs/*.json</code> files as the Astro demo, one route per
        page.
      </p>

      <nav className="demo-grid" aria-label="Demo pages">
        {pages.map((page) => (
          <Link key={page.to} className="demo-tile" to={page.to}>
            <h3>{page.title}</h3>
            <p>{page.blurb}</p>
          </Link>
        ))}
      </nav>

      <div className="demo-card">
        <h2>Quickstart</h2>
        <p className="lead" style={{ marginBlock: "0 1rem" }}>
          The forms are live in this repo — no WordPress or backend required
          unless you open the cf7 demo on the Mailers page. Forms using the{" "}
          <code>json</code> mailer post to a local echo server.
        </p>
        <pre>{`# terminal 1 — payload inspector for the json-mailer forms
cd examples/react-demo
npm install
npm run demo:api

# terminal 2 — the demo site
npm run dev           # http://localhost:5173`}</pre>
      </div>
    </PageShell>
  );
}