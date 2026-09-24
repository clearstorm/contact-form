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
import { renderDecor, renderField, renderFormShell } from "../src/runtime/markup";

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
  copy: { sending: "Sending…", back: "Back", next: "Continue" },
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

/* ---- standalone builder cases ---- */

const fieldCases: [string, string][] = [
  ["field-text", renderField({ label: "Name", id: "n", name: "name", type: "text", required: true, placeholder: "Jane", span: 6 })],
  ["field-single-checkbox", renderField({ label: "I agree", id: "c", name: "consent", type: "checkbox", required: true })],
  ["field-textarea", renderField({ label: "Message", id: "m", name: "message", type: "textarea", rows: 4, maxlength: 100 })],
  ["field-group", renderField({ label: "Pick one", id: "p", name: "pick", type: "radio", options: ["A", "B"], required: true })],
  ["field-hidden", renderField({ label: "", id: "h", name: "hid", type: "hidden", value: "x" })],
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
}

console.log(failures === 0 ? "MARKUP ALL PASS" : `MARKUP ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);