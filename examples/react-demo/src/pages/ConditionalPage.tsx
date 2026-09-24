import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import conditionalSpec from "../../../specs/conditional.json";
import { getForm, type NamedForms } from "../lib/forms";

const enquiryForm = getForm(conditionalSpec as NamedForms, "Realistic enquiry");
const conditionsForm = getForm(conditionalSpec as NamedForms, "All seven operators");
const andForm = getForm(conditionalSpec as NamedForms, "AND — every condition must hold");
const pageShellTitle = "showWhen conditions";

const operatorRows: Array<[string, string, string]> = [
  ["equals", '{ "operator": "equals", "value": "Other" }', "svc is exactly “Other” → svc_other"],
  ["notEquals", '{ "operator": "notEquals", "value": "New site" }', "project isn't “New site” → current_url"],
  ["in", '{ "operator": "in", "value": ["Starter", "Not sure"] }', "priority is one of the list → priority_hint"],
  ["notIn", '{ "operator": "notIn", "value": ["Over R60k"] }', "budget isn't in the list → budget_note"],
  ["includes", '{ "operator": "includes", "value": "Other" }', "topics group contains “Other” → topics_other"],
  ["filled", '{ "operator": "filled" }', "rush is ticked → deadline"],
  ["empty", '{ "operator": "empty" }', "call is unticked → email_note"],
];

export function ConditionalPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Conditional fields</h1>
      <p className="lead">
        Fields hide and reveal from the visitor's own input — declared as JSON (
        <code>showWhen</code>), evaluated live by the shared engine. No markup
        changes, no extra JS on the page. Three forms below: a realistic enquiry (two
        conditions), all seven operators and an AND reveal.
      </p>

      <h2>Realistic form</h2>
      <div className="demo-card">
        <FormDemonstration form={enquiryForm} />
      </div>

      <table className="demo-table">
        <thead>
          <tr><th>Field</th><th>Condition</th><th>Effect</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>other_service</code></td>
            <td><code>service</code> <em>equals</em> "Other"</td>
            <td>a required text field appears only when the visitor picks "Other"</td>
          </tr>
          <tr>
            <td><code>deadline</code></td>
            <td><code>rush</code> <em>filled</em></td>
            <td>ticking "this is urgent" reveals a required date</td>
          </tr>
        </tbody>
      </table>

      <p className="lead">
        Both revealed fields are <code>required: true</code> — while hidden they are
        out of scope, so they can't block submission; once revealed they validate like
        any other field. And because hidden fields are excluded from the payload, the
        backend receives only what the visitor actually saw.
      </p>

      <h2>All seven operators</h2>
      <div className="demo-card">
        <FormDemonstration form={conditionsForm} />
      </div>

      <table className="demo-table">
        <thead>
          <tr><th>Operator</th><th>JSON condition</th><th>Live example (field → reveal)</th></tr>
        </thead>
        <tbody>
          {operatorRows.map(([operator, condition, example]) => (
            <tr key={operator}>
              <td><code>{operator}</code></td>
              <td><code>{condition}</code></td>
              <td>
                {example.split("→").map((part, i) =>
                  i === 0 ? part : <span key={i}> → <code>{part.trim()}</code></span>,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>AND — every condition must hold</h2>
      <p className="lead">
        An <em>array</em> of conditions means <strong>AND</strong>: the field is shown
        only while every one of them holds. In the form below the note appears only
        when Service is exactly “Other” <em>and</em> “This is urgent” is ticked —
        either on its own keeps it hidden.
      </p>
      <div className="demo-card">
        <FormDemonstration form={andForm} />
      </div>

      <p className="lead">
        Unknown operators never match (the field stays hidden). All three forms live
        in one spec file — <code>examples/specs/conditional.json</code> is a map of
        named forms — for the full specs, or the README for the complete operator
        reference.
      </p>
    </PageShell>
  );
}