import type { ReactNode } from "react";
import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import wizardSpec from "../../../specs/wizard.json";
import { getForms, type NamedForms } from "../lib/forms";

const forms = getForms(wizardSpec as NamedForms);
const pageShellTitle = "step markers · stepper · pane grouping";

const demoRows: Array<[string, string]> = [
  ["Flagship wizard", "a conditional Company pane revealed by account_type = “Business” (skipped → hidden + inert, struck-through chip, out of validation and the payload); a centered rule-flanked stepper; global stepper.header defaults with per-marker overrides; step-scoped “Next” validation; a cross-step showWhen reveal and a hoisted hidden field; autoSave progress drafts"],
  ["Every field type", "all 19 types across three panes with required + optional: true twins; variant: \"even\" + line: \"center\" stepper (equal full-width slices with rules between the chips) on a background band; a cross-step showWhen reveal and a hoisted hidden field"],
  ["Compact chrome", "nav.number: false and nav.clickable: false; custom “Continue” button label with a ghost “Back”; an align: \"full\" pane-header rule; a bare show: false pane"],
];

const markerRows: Array<[string, string, string]> = [
  ["step marker + pane header", '{ "type": "step", "label": "Contact" }', "opens a new step pane; by default the pane renders its own header — number chip + label (or a longer title) — styled globally via stepper.header and overridable per marker (show / align / line)"],
  ["final submit", '{ "type": "step", "label": "Details", "submit": "Send enquiry" }', "only the LAST marker's submit labels the final button; form.submit is the fallback"],
  ["stepper nav", '"stepper": { "nav": { "variant": "center", "line": "center" } }', "the strip: number / label visibility, variant alignment (left / center / right / even), line position (none / top / bottom / center — with even, center draws rules between the chips), background band colour, and completed-step clickable jumps back (no validation)"],
  ["button specs", '"submit": { "label": "Send enquiry", "variant": "primary" }', "submit / next / prev each accept a label or { label, variant } — primary | secondary | ghost"],
  ["shared prefix", "{fields before the first «step» marker}", "rendered once above the stepper — visible on every step, included in every step's validation"],
  ["hoisted hidden", '{ "type": "hidden", "name": "referrer", "value": "wizard-demo" }', "hidden fields render once outside the panes and are present on every step's payload"],
  ["cross-step showWhen", '{ "showWhen": { "field": "rush", "operator": "filled" } }', "a field on a later step whose conditions read a checkbox from an earlier step"],
  ["conditional step", '{ "type": "step", "label": "Company", "showWhen": { "field": "account_type", "operator": "equals", "value": "Business" } }', "a marker's showWhen skips its whole pane — hidden + inert, struck-through chip, out of validation, the payload and cross-field chains; authored indices never change, so rf:step-change reports the visible total and a step that collapses underfoot reflows"],
];

function markCode(text: string) {
  // `code` spans (backticks) and «…» spans both render as <code>.
  const out: Array<ReactNode> = [];
  const re = /`([^`]+)`|«([^»]+)»/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<code key={key++}>{m[1] ?? m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function WizardPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Multi-step wizard</h1>
      <p className="lead">
        A <code>step</code> marker turns the form into a wizard: everything below the
        marker belongs to its group. There is no top-level <code>steps</code> key and
        no per-field step index — the markers themselves are the layout. “Next”
        validates only the current step; “Back” never validates; the final button
        submits the whole visible form.
      </p>
      <p className="lead">
        The three wizard examples below all ship from <em>one</em> spec file —{" "}
        <code>examples/specs/wizard.json</code> is a map of named forms and this
        single page renders each of them.
      </p>

      {forms.map(([name, form]) => (
        <section key={name}>
          <h2>{name}</h2>
          <div className="demo-card">
            <FormDemonstration form={form} />
          </div>
        </section>
      ))}

      <h2>What each form demonstrates</h2>
      <table className="demo-table">
        <thead>
          <tr><th>Form</th><th>Demonstrates</th></tr>
        </thead>
        <tbody>
          {demoRows.map(([name, showcases]) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td>{markCode(showcases)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>The marker model</h2>
      <table className="demo-table">
        <thead>
          <tr><th>Type</th><th>JSON</th><th>Behaviour</th></tr>
        </thead>
        <tbody>
          {markerRows.map(([type, json, renders]) => (
            <tr key={type}>
              <td><code>{type}</code></td>
              <td><code>{json}</code></td>
              <td>{markCode(renders)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="lead">
        See <code>examples/specs/wizard.json</code> for all three specs. The flagship
        form walks the marker model end to end: a conditional Company pane that only
        appears for Business accounts, a centered, rule-flanked stepper, step-scoped
        validation, a hoisted hidden field and auto-saved progress. Pick “Business”
        on the first step to reveal the extra pane, switch back to collapse it again
        (the submit returns), and reload mid-wizard to watch the draft restore. Try
        leaving a required field empty and pressing “Next”, then come back with
        “Previous” or by clicking a completed chip in the stepper.
      </p>
    </PageShell>
  );
}