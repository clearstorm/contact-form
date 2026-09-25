/**
 * Markup snapshot tests — lock the shared builders' DOM output so the Astro
 * shells, React binding and vanilla JS binding can never drift again.
 *
 * Each snapshot renders `renderFormShell` (plus standalone field/decor cases)
 * and compares byte-for-byte with the committed fixture:
 *
 *   scripts/fixtures/<name>.html
 *
 * If a fixture is missing or stale, regenerate it deliberately with:
 *
 *   RECORD=1 npm test
 *
 * (then review the diff in git before committing).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseFieldSpec, serializeRules, toFieldSpecs, type FormSpec } from "../src/core";
import { renderDecor, renderField, renderFormShell, renderRepeater } from "../src/runtime/markup";

const RECORD = process.env.RECORD === "1";

let failures = 0;
const check = (label: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.log(`  FAIL: ${label} ${extra}`);
  }
};

/* ---- representative specs ---- */

const singleSpec: FormSpec = {
  name: "snapshot",
  mailer: "json",
  submit: "Send message",
  status: "Thanks — we'll be in touch.",
  endpoint: "https://example.test/send",
  copy: { sending: "Sending…" },
  fields: [
    { type: "heading", text: "Project details", align: "left" },
    { type: "description", text: "Tell us about the project & budget." },
    {
      type: "section",
      label: "Contact",
    },
    {
      type: "text",
      id: "name",
      name: "name",
      label: "Full name",
      required: true,
      placeholder: "Jane Doe",
      autocomplete: "name",
      size: 50,
    },
    {
      type: "email",
      id: "email",
      name: "email",
      label: "Email",
      required: true,
      autocomplete: "email",
      size: 50,
      optional: true,
    },
    { type: "heading", text: "Budget & timing", align: "right", line: false },
    {
      type: "select",
      id: "budget",
      name: "budget",
      label: "Budget",
      options: ["Under 5k", "5–15k", "15k+"],
      required: true,
      size: 50,
    },
    {
      type: "checkbox",
      id: "interests",
      name: "interests",
      label: "Interests",
      options: ["Design", "Build", "Support"],
    },
    {
      type: "radio",
      id: "source",
      name: "source",
      label: "How did you hear?",
      options: ["Referral", "Search", "Other"],
      required: true,
    },
    {
      type: "checkbox",
      id: "consent",
      name: "consent",
      label: "I agree to the privacy policy",
      required: true,
    },
    { type: "divider" },
    { type: "divider", visible: false, min: "2rem" },
    {
      type: "textarea",
      id: "message",
      name: "message",
      label: "Message",
      required: true,
      rows: 5,
      maxlength: 500,
      placeholder: "How can we help?",
      size: 100,
    },
    {
      type: "url",
      id: "website",
      name: "website_url",
      label: "Your website",
      placeholder: "https://…",
    },
    {
      type: "number",
      id: "players",
      name: "players",
      label: "Headcount",
      min: 1,
      max: 50,
      step: 1,
    },
    {
      type: "tel",
      id: "phone",
      name: "phone",
      label: "Phone",
      pattern: "[0-9+\\s-]{7,}",
      size: 50,
    },
    {
      type: "file",
      id: "brief",
      name: "brief",
      label: "Attach a brief",
      accept: ".pdf,.docx",
      multiple: true,
    },
    {
      type: "hidden",
      id: "referrer",
      name: "referrer",
      value: "sf",
    },
    {
      type: "text",
      id: "other_source",
      name: "other_source",
      label: "Other source",
      required: true,
      showWhen: { field: "source", operator: "equals", value: "Other" },
    },
  ],
};

const wizardSpec: FormSpec = {
  name: "snapshot-wizard",
  submit: "Submit",
  status: "Submitted.",
  endpoint: "https://example.test/send",
  validateOn: "touched",
  stepper: {
    nav: { variant: "right", line: "under" },
    header: { show: true, align: "left" },
  },
  fields: [
    { type: "step", label: "Contact", title: "Who are we talking to?" },
    {
      type: "text",
      id: "name",
      name: "name",
      label: "Name",
      required: true,
      size: 50,
    },
    { type: "step", label: "Details", submit: "Send enquiry" },
    {
      type: "textarea",
      id: "message",
      name: "message",
      label: "Message",
      size: 100,
    },
    {
      type: "hidden",
      id: "campaign",
      name: "campaign",
      value: "wiz",
    },
  ],
};

const replacePrefillSpec: FormSpec = {
  name: "snapshot-replace",
  submit: { label: "Book", variant: "secondary" },
  status: "Request received.",
  statusMode: "replace",
  endpoint: "https://example.test/book",
  next: { label: "Continue", variant: "primary" },
  prev: { label: "Go back", variant: "secondary" },
  fields: [
    { type: "heading", text: "Booking times", align: "center" },
    {
      type: "datetime-local",
      id: "date",
      name: "date",
      label: "Date",
      required: true,
      size: 50,
    },
    {
      type: "text",
      id: "notes",
      name: "notes",
      label: "Notes",
      optional: true,
    },
  ],
};

const repeaterSpec: FormSpec = {
  name: "snapshot-team",
  mailer: "json",
  submit: "Send",
  status: "Saved.",
  endpoint: "https://example.test/team",
  copy: { addRow: "Add member", removeRow: "Drop" },
  fields: [
    { type: "heading", text: "Team" },
    {
      type: "repeater",
      id: "members",
      name: "members",
      label: "Team members",
      minRows: 1,
      maxRows: 3,
      addLabel: "Add teammate",
      fields: [
        {
          type: "text",
          id: "member_name",
          name: "member_name",
          label: "Name",
          required: true,
          size: 50,
        },
        {
          type: "email",
          id: "member_email",
          name: "member_email",
          label: "Email",
          required: true,
          size: 50,
        },
      ],
    },
    // Bounds-less repeater — defaults (minRows 0 → one starter row, no max).
    {
      type: "repeater",
      id: "links",
      name: "links",
      fields: [{ type: "url", id: "link_url", name: "link_url", label: "Link" }],
    },
  ],
};

// Conditional wizard — step markers with `showWhen` (M7): the "Company" and
// "Details" panes only appear for Business accounts. Steps keep authored
// numbers; the engine computes the visible sequence.
const conditionalStepsSpec: FormSpec = {
  name: "snapshot-conditional-steps",
  mailer: "json",
  submit: "Send enquiry",
  status: "Submitted.",
  endpoint: "https://example.test/send",
  fields: [
    { type: "heading", text: "Project enquiry" },
    {
      type: "select",
      id: "account_type",
      name: "account_type",
      label: "Account type",
      required: true,
      options: ["Personal", "Business"],
      size: 50,
    },
    { type: "step", label: "Contact" },
    {
      type: "text",
      id: "name",
      name: "name",
      label: "Name",
      required: true,
      size: 50,
    },
    {
      type: "step",
      label: "Company",
      title: "Your company",
      showWhen: { field: "account_type", operator: "equals", value: "Business" },
    },
    {
      type: "text",
      id: "company",
      name: "company",
      label: "Company name",
      optional: true,
    },
    {
      type: "step",
      label: "Details",
      submit: "Send enquiry",
      showWhen: [
        { field: "account_type", operator: "equals", value: "Business" },
        { field: "company", operator: "filled" },
      ],
    },
    {
      type: "textarea",
      id: "message",
      name: "message",
      label: "Project brief",
      size: 100,
    },
  ],
};

// Opt-in draft persistence (M7): `autoSave: true` resolves to the auto-scoped
// `rf:draft:{name}` key; a string names an explicit key (asserted separately).
const autoSaveSpec: FormSpec = {
  name: "snapshot-autosave",
  mailer: "json",
  submit: "Send",
  status: "Saved.",
  endpoint: "https://example.test/send",
  autoSave: true,
  fields: [
    {
      type: "text",
      id: "name",
      name: "name",
      label: "Name",
      required: true,
      size: 50,
    },
    { type: "step", label: "Details", submit: "Send" },
    {
      type: "textarea",
      id: "message",
      name: "message",
      label: "Message",
      size: 100,
    },
  ],
};

/* ---- standalone builder cases ---- */

const fieldCases: [string, string][] = [
  ["field-text", renderField({ label: "Name", id: "n", name: "name", type: "text", required: true, placeholder: "Jane", span: 6 })],
  ["field-single-checkbox", renderField({ label: "I agree", id: "c", name: "consent", type: "checkbox", required: true })],
  ["field-textarea", renderField({ label: "Message", id: "m", name: "message", type: "textarea", rows: 4, maxlength: 100 })],
  ["field-group", renderField({ label: "Pick one", id: "p", name: "pick", type: "radio", options: ["A", "B"], required: true })],
  ["field-hidden", renderField({ label: "", id: "h", name: "hid", type: "hidden", value: "x" })],
  ["field-counter", renderField({ label: "Promo code", id: "c", name: "code", type: "text", maxLength: 8, value: "ab", span: 6 })],
  ["field-counter-textarea", renderField({ label: "Message", id: "m2", name: "message", type: "textarea", maxLength: 120, span: 8 })],
  [
    "field-repeater",
    renderRepeater({
      type: "repeater",
      id: "members",
      name: "members",
      label: "Members",
      minRows: 2,
      maxRows: 4,
      fields: [
        { type: "text", id: "name", name: "name", label: "Name", required: true, size: 50 },
        { type: "email", id: "email", name: "email", label: "Email", size: 50 },
      ],
    }),
  ],
];

const decorCases: [string, string][] = [
  ["decor-heading", renderDecor({ type: "heading", text: "Hello" })],
  ["decor-heading-ruleless", renderDecor({ type: "heading", text: "Hello", line: false, align: "center" })],
  ["decor-description", renderDecor({ type: "description", text: "A short description" })],
  ["decor-divider", renderDecor({ type: "divider" })],
  ["decor-spacer", renderDecor({ type: "divider", visible: false, min: "3rem" })],
  ["decor-section", renderDecor({ type: "section" })],
  ["decor-section-labeled", renderDecor({ type: "section", label: "Details" })],
];

/* ---- run ---- */

// The bundle may run from anywhere (e.g. /tmp), so anchor the fixtures on the
// project root passed in by the runner rather than import.meta.url.
const fixtureDirUrl = process.env.FIXTURES_DIR
  ? new URL(process.env.FIXTURES_DIR.endsWith("/") ? process.env.FIXTURES_DIR : process.env.FIXTURES_DIR + "/", "file://")
  : new URL("./fixtures/", import.meta.url);
const fixtureDir = fixtureDirUrl;
mkdirSync(fixtureDir, { recursive: true });

interface Snapshot {
  name: string;
  html: string;
}

const snapshots: Snapshot[] = [
  { name: "shell-single", html: renderFormShell({ form: singleSpec }) },
  { name: "shell-wizard", html: renderFormShell({ form: wizardSpec }) },
  { name: "shell-replace-prefill", html: renderFormShell({ form: replacePrefillSpec, prefill: "datetime" }) },
  { name: "shell-repeater", html: renderFormShell({ form: repeaterSpec }) },
  { name: "shell-conditional-steps", html: renderFormShell({ form: conditionalStepsSpec }) },
  { name: "shell-autosave", html: renderFormShell({ form: autoSaveSpec }) },
  ...fieldCases.map(([name, html]) => ({ name, html })),
  ...decorCases.map(([name, html]) => ({ name, html })),
];

if (RECORD) {
  for (const s of snapshots) writeFileSync(new URL(`${s.name}.html`, fixtureDir), s.html);
  console.log(`recorded ${snapshots.length} snapshots into scripts/fixtures/`);
} else {
  for (const s of snapshots) {
    const file = new URL(`${s.name}.html`, fixtureDir);
    if (!existsSync(file)) {
      failures++;
      console.log(`  FAIL: ${s.name} has no fixture — run RECORD=1 npm test to create it`);
      continue;
    }
    const existing = readFileSync(file, "utf8");
    if (existing !== s.html) {
      failures++;
      // Compact first-difference report.
      let i = 0;
      const max = Math.min(existing.length, s.html.length);
      while (i < max && existing[i] === s.html[i]) i++;
      const from = Math.max(0, i - 60);
      console.log(
        `  FAIL: ${s.name} differs from fixture (offset ${i})\n` +
          `    fixture: …${existing.slice(from, i + 60).replace(/\n/g, " ")}…\n` +
          `    actual:  …${s.html.slice(from, i + 60).replace(/\n/g, " ")}…`,
      );
    } else {
      console.log(`  ok: ${s.name} matches fixture`);
    }
  }

  /* ---- invariant: data-rules round-trips to the same field config ---- */
  const shell = snapshots.find((s) => s.name === "shell-single")!.html;
  const rulesAttr = /data-rules="([^"]*)"/.exec(shell)?.[1] ?? "";
  const parsed = parseFieldSpec(rulesAttr.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const expected = serializeRules(toFieldSpecs(singleSpec.fields));
  check("shell data-rules round-trips to spec fields", serializeRules(parsed) === expected);
  check("shell carries endpoint + mailer", shell.includes("data-mailer=\"json\"") && shell.includes("data-endpoint=\"https://example.test/send\""));
  check("single-page shell has no data-steps", !shell.includes("data-steps="));

  /* ---- lifecycle hooks never serialise into the shell ---- */
  check(
    "spec hooks stay out of the shell (byte-identical to the plain spec)",
    renderFormShell({
      form: { ...singleSpec, hooks: { beforeValidateStep: "onStep", beforeSubmit: "trackLead" } },
    }) === shell,
  );
  check("no data-hooks attribute leaks into markup", !shell.includes("data-hooks"));

  /* ---- legacy copy.back / copy.next no longer reach markup ---- */
  const legacyCopyShell = renderFormShell({
    form: { ...wizardSpec, copy: { back: "Legacy Back", next: "Legacy Next" } },
  });
  const legacyBackLabel = /←<\/span> ([^<]+)/.exec(legacyCopyShell)?.[1];
  const legacyNextLabel = /data-next-label>([^<]*)<\/span>/.exec(legacyCopyShell)?.[1];
  check(
    "legacy copy.back / copy.next no longer leak into wizard footer labels",
    legacyBackLabel === "Back" && legacyNextLabel === "Next",
    `back=${legacyBackLabel} next=${legacyNextLabel}`,
  );

  /* ---- repeater invariants ---- */
  const repeaterShell = snapshots.find((s) => s.name === "shell-repeater")!.html;
  const repeaterRulesAttr = /data-rules="([^"]*)"/.exec(repeaterShell)?.[1] ?? "";
  const repeaterRulesJson = repeaterRulesAttr.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const repeaterParsed = parseFieldSpec(repeaterRulesJson);
  const repeaterExpected = serializeRules(toFieldSpecs(repeaterSpec.fields));
  check("repeater data-rules round-trips to spec fields", serializeRules(repeaterParsed) === repeaterExpected);
  check(
    "repeater rules carry the row template + bounds",
    repeaterRulesJson.includes("\"member_name\"") &&
      repeaterRulesJson.includes("\"member_email\"") &&
      repeaterRulesJson.includes("\"minRows\":1") &&
      repeaterRulesJson.includes("\"maxRows\":3"),
  );
  const firstRepeater =
    /<fieldset class="rf-repeater[^"]*" data-repeater="members" data-repeater-min="1"[^>]*>/.exec(repeaterShell)?.[0] ?? "";
  check("bounded repeater renders data-repeater-max", firstRepeater.includes("data-repeater-max=\"3\""));
  const linksRepeater =
    /<fieldset class="rf-repeater[^"]*" data-repeater="links" data-repeater-min="0"[^>]*>/.exec(repeaterShell)?.[0] ?? "";
  check("unbounded repeater omits data-repeater-max", linksRepeater !== "" && !linksRepeater.includes("data-repeater-max"));
  check(
    "repeater row sentinels carry the repeater name",
    (repeaterShell.match(/<input type="hidden" name="members" value="\d" data-repeater-sentinel \/>/g) ?? []).length === 1,
  );
  check(
    "repeater rows stamp row-scoped ids",
    repeaterShell.includes("id=\"snapshot-team__members-row0__member_name\"") &&
      repeaterShell.includes("id=\"snapshot-team__members-row0__member_email\""),
  );
  check(
    "copy + spec labels resolve onto the add/remove buttons",
    repeaterShell.includes(">+ Add teammate</button>") &&
      repeaterShell.includes(">Drop</button>") &&
      repeaterShell.includes("aria-label=\"Drop\""),
  );

  /* ---- conditional steps (M7): data-steps carries showWhen ---- */
  const conditionalShell = snapshots.find((s) => s.name === "shell-conditional-steps")!.html;
  const stepsAttr = /data-steps="([^"]*)"/.exec(conditionalShell)?.[1] ?? "";
  const stepsJson = stepsAttr.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  check(
    "conditional data-steps normalises a single step condition to an array",
    stepsJson.includes('"showWhen":[{"field":"account_type","operator":"equals","value":"Business"}]'),
  );
  check(
    "conditional data-steps carries a step condition AND array",
    stepsJson.includes(
      '"showWhen":[{"field":"account_type","operator":"equals","value":"Business"},{"field":"company","operator":"filled"}]',
    ),
  );
  check(
    "conditional steps serialise two of three steps",
    (stepsJson.match(/"showWhen"/g) ?? []).length === 2,
  );
  check(
    "unconditional steps stay showWhen-free in data-steps",
    !stepsJson.includes('"label":"Contact","showWhen"'),
  );
  check(
    "conditional wizard still renders a pane + chip per authored step",
    (conditionalShell.match(/<section class="rf-pane" data-pane=/g) ?? []).length === 3 &&
      (conditionalShell.match(/<li class="rf-step" data-step=/g) ?? []).length === 3,
  );

  /* ---- autoSave (M7): data-autosave resolution ---- */
  const autoSaveShell = snapshots.find((s) => s.name === "shell-autosave")!.html;
  const wizardShell = snapshots.find((s) => s.name === "shell-wizard")!.html;
  check(
    "autoSave: true resolves to the auto-scoped rf:draft:{name} key",
    autoSaveShell.includes('data-autosave="rf:draft:snapshot-autosave"'),
  );
  check(
    "autoSave: absent → no data-autosave leaks into unstyled shells",
    !shell.includes("data-autosave") && !wizardShell.includes("data-autosave"),
  );
  check(
    "autoSave: explicit string key renders verbatim",
    renderFormShell({ form: { ...autoSaveSpec, autoSave: "shared-hello-draft" } }).includes(
      'data-autosave="shared-hello-draft"',
    ),
  );
  check(
    "autoSave: false renders no data-autosave",
    !renderFormShell({ form: { ...autoSaveSpec, autoSave: false } }).includes("data-autosave"),
  );

  /* ---- validateOn (M8): data-validate-on serialisation ---- */
  const wizardShellW = snapshots.find((s) => s.name === "shell-wizard")!.html;
  check(
    "validateOn: a string mode renders on the shell",
    wizardShellW.includes(' data-validate-on="touched"'),
  );
  check(
    "validateOn: an array renders space-joined",
    renderFormShell({ form: { ...singleSpec, validateOn: ["blur", "change"] } }).includes(
      ' data-validate-on="blur change"',
    ),
  );
  check(
    "validateOn: absent (submit-only) serialises nothing",
    !shell.includes("data-validate-on") &&
      !renderFormShell({ form: { ...singleSpec, validateOn: "submit" } }).includes("data-validate-on"),
  );
}

console.log(failures === 0 ? "MARKUP ALL PASS" : `MARKUP ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);