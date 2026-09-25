import { PageShell } from "../components/PageShell";
import { FormDemonstration } from "../components/FormDemonstration";
import fieldTypesSpec from "../../../specs/field-types.json";
import { getForm, type NamedForms } from "../lib/forms";

const allFields = getForm(fieldTypesSpec as NamedForms, "All 20 field types");
const structure = getForm(fieldTypesSpec as NamedForms, "Structural field types");
const validationExtras = getForm(fieldTypesSpec as NamedForms, "Validation extras");
const repeaters = getForm(fieldTypesSpec as NamedForms, "Repeat rows");
const pageShellTitle = "every input type · structural types · repeaters";

const typeRows: Array<[string, string]> = [
  ["text", "text input — required (2+ chars applies only to first_name / last_name)"],
  ["email", "email input — email format"],
  ["tel", "tel input — optional here; 7–15 chars of digits / +()- "],
  ["url", "url input — optional here; scheme-ful URL"],
  ["password", "password input — optional here (required only when required)"],
  ["search", "search input — optional here (required only when required)"],
  ["number", "number input — numeric, min 1 / max 10"],
  ["date / time / datetime-local / month / week", "native inputs — optional here (required only when required)"],
  ["textarea", "textarea (rows 6) — min length 10, maxlength 500"],
  ["select", "select — or multi-select with multiple: true (visible rows via rows); required only; multi-select needs at least one option chosen"],
  ["checkbox", "group or single toggle — group: at least one checked; single: must be checked"],
  ["radio", "radio group — one option required"],
  ["hidden", "hidden input — never validated, forwarded as-is"],
  ["range", "range input — within min 0 / max 100 (step 5)"],
  ["color", "color input — optional here; hex #rrggbb"],
  ["file", "file input (single, or multiple with an accept hint) — required: at least one file attached; the canonical payload carries the filename(s)"],
  ["text + options", "text input with a datalist of suggestions — suggestions only, free text still allowed"],
];

const structureRows: Array<[string, string, string]> = [
  [
    "heading",
    '{ "type": "heading", "text": "…", "line": false }',
    "a full-width <h3> title; its rule is on by default (left → line on the right, right → line on the left, center → both sides), line: false renders text only",
  ],
  [
    "description",
    '{ "type": "description", "text": "…", "size": 75 }',
    "muted helper text; size maps onto the 12-column grid (100/75/67/50/40/33/…)",
  ],
  [
    "divider",
    '{ "type": "divider", "visible": false, "min": "2rem" }',
    "a thin rule, or with visible: false an invisible spacer",
  ],
  [
    "section",
    '{ "type": "section", "label": "Contact details" }',
    "a section break; the optional label sits centered on the rule",
  ],
];

export function FieldTypesPage() {
  return (
    <PageShell title={pageShellTitle}>
      <h1>Field types</h1>
      <p className="lead">
        Four named forms in one spec file (<code>examples/specs/field-types.json</code>):
        the full 20-type kitchen sink, the structural field types, a validation-extras
        form and a repeat-rows form — every element a form can render, from a text
        input to a section break.
      </p>

      <h2>All 20 field types</h2>
      <p className="lead">
        Every type the core renders and validates in a single spec — including a
        checkbox <em>group</em> (multi-value, joined into one payload field), a radio
        group, a single consent checkbox, hidden passthrough and per-field{" "}
        <code>message</code> overrides. Every optional-capable type is shown as{" "}
        <code>optional: true</code> here (renders a muted “(optional)” suffix and
        never blocks submit) alongside the required twins. Beyond the 20 types the
        same spec also exercises three field capabilities: a <code>select</code> with{" "}
        <code>multiple: true</code>, <code>options</code> on a text input rendering a{" "}
        <code>datalist</code> of suggestions, and two <code>file</code> inputs (single
        required + <code>multiple</code> with an <code>accept</code> hint — their
        filenames travel in the canonical payload). The fields below span 50 / 67 / 33
        / 100 to show the 12-column row. Submit posts to the local echo server — start
        it with <code>npm run demo:api</code>.
      </p>

      <div className="demo-card">
        <FormDemonstration form={allFields} />
      </div>

      <h3>What each type does</h3>
      <table className="demo-table">
        <thead>
          <tr><th>Type</th><th>Validation in this spec</th></tr>
        </thead>
        <tbody>
          {typeRows.map(([type, validation]) => (
            <tr key={type}>
              <td><code>{type}</code></td>
              <td>{validation}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Structural field types</h2>
      <p className="lead">
        The structural field types shape a form without taking input: headings,
        helper descriptions (width-controllable), thin dividers or invisible spacers,
        and labeled section breaks. They are field types that render static markup
        only — no <code>name</code>, no validation, no payload entry — and never reach{" "}
        <code>data-rules</code>.
      </p>

      <div className="demo-card">
        <FormDemonstration form={structure} />
      </div>

      <h3>The four structural types</h3>
      <table className="demo-table">
        <thead>
          <tr><th>Type</th><th>JSON</th><th>Renders</th></tr>
        </thead>
        <tbody>
          {structureRows.map(([type, json, renders]) => (
            <tr key={type}>
              <td><code>{type}</code></td>
              <td><code>{json}</code></td>
              <td>{renders}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="lead">
        Note the invisible spacer at the end of the structure form, which controls the
        gap before the submit row.
      </p>

      <h2>Repeat rows</h2>
      <p className="lead">
        A <code>repeater</code> renders a row group: any field types nest inside its{" "}
        <code>fields</code>, and the visitor can add and remove rows. Below, a team
        members group is bounded with <code>minRows: 1</code> /{" "}
        <code>maxRows: 3</code> (the add button disables at the ceiling, remove at the
        floor), and an unbounded links group starts as a single row with no limit. Each
        row validates by itself (an empty required field flags only that row), and on
        submit every row group travels in the canonical payload as one structured JSON
        array under its own name — an empty row is dropped (or padded back to{" "}
        <code>minRows</code>). Row labels come from <code>addLabel</code> /{" "}
        <code>removeLabel</code>, falling back to the form-level{" "}
        <code>copy.addRow</code> / <code>copy.removeRow</code> keys.
      </p>

      <div className="demo-card">
        <FormDemonstration form={repeaters} />
      </div>
    </PageShell>
  );
}