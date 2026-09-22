import { createServer } from "node:http";
import {
  cf7Payload,
  cf7Mailer,
  CORE_FIELDS,
} from "../src/mailers/cf7.ts";
import { jsonMailer } from "../src/mailers/json.ts";
import {
  buildRules,
  buttonLabel,
  buttonVariant,
  canonicalData,
  evaluateVisibility,
  gridSpan,
  isFieldSpec,
  parseFieldSpec,
  parseTime,
  serializeRules,
  stepperModifiers,
  toFieldSpecs,
  toSteps,
  validateValue,
  visibleNames,
} from "../src/core.ts";

let failures = 0;
const check = (label, cond, extra = "") => {
  if (cond) console.log(`  ok: ${label}`);
  else { failures++; console.log(`  FAIL: ${label} ${extra}`); }
};

// --- fixture: booking spec (mirrors content/pages/contact.json) ---
// subject/guests carry per-field `message` overrides (Romi-specific copy).
const bookingSpec = {
  name: "booking",
  submit: "Request table",
  status: "Thanks — we'll be in touch.",
  mailer: "cf7",
  fields: [
    { type: "text", id: "first_name", name: "first_name", label: "First name", required: true, size: 50 },
    { type: "text", id: "last_name", name: "last_name", label: "Last name", required: true, size: 50 },
    { type: "email", id: "email", name: "email", label: "Email address", required: true, size: 50 },
    { type: "tel", id: "contact", name: "contact", label: "Mobile number", required: true, size: 50 },
    { type: "select", id: "subject", name: "subject", label: "Subject", required: true, options: ["Table reservation"], message: "Choose a subject.", size: 100 },
    { type: "date", id: "date", name: "date", label: "Date", size: 33 },
    { type: "time", id: "time", name: "time", label: "Preferred time", size: 33 },
    { type: "select", id: "guests", name: "guests", label: "Guests", required: true, options: ["2 guests"], message: "Choose the number of guests.", size: 33 },
    { type: "textarea", id: "message", name: "message", label: "Occasion or message", size: 100 },
  ],
};

const fields = toFieldSpecs(bookingSpec.fields);
const specFields = new Map(fields.map((f) => [f.name, f]));

// --- 1. CF7 payload: fold extras + subject suffix ---
const raw = new FormData();
raw.set("first_name", "  Jane ");
raw.set("last_name", "Doe");
raw.set("email", "jane@example.com");
raw.set("contact", "071 234 5678");
raw.set("subject", "Table reservation");
raw.set("date", "2026-09-21");
raw.set("time", "7:00 pm");
raw.set("guests", "4 guests");
raw.set("message", "Window seat please");
raw.set("website", ""); // honeypot — must never be forwarded

const out = cf7Payload(raw, fields);
const values = Object.fromEntries(out.entries());
check("honeypot `website` dropped", !("website" in values));
check("subject suffixed", values.subject === "Table reservation — Jane Doe", JSON.stringify(values.subject));
check("date folded", values.message.includes("Date: 2026-09-21"));
check("time folded + normalised to 24h", values.message.includes("Preferred time: 19:00"), values.message);
check("guests folded", values.message.includes("Guests: 4 guests"));
check("message kept on top", values.message.startsWith("Window seat please"));
check("core fields verbatim", values.email === "jane@example.com" && values.first_name === "Jane", JSON.stringify(values.first_name));

// empty names → suffix collapses
const raw2 = new FormData();
raw2.set("subject", "Table reservation");
raw2.set("first_name", " ");
raw2.set("last_name", "");
const out2 = cf7Payload(raw2, fields);
check("empty names → plain subject", out2.get("subject") === "Table reservation", String(out2.get("subject")));

// --- 2. Rules / validation ---
const rules = buildRules(fields);
check("guests required (JSON)", rules.guests?.required === true);
check("date optional (JSON)", rules.date?.required === false);
check("time optional (JSON)", rules.time?.required === false);
check("message optional (JSON)", rules.message?.required === false);
check("contact required + format error", validateValue(rules.contact, "x") === "Enter a valid phone number.");
check("contact passes", validateValue(rules.contact, "+27 82 123 4567") === null);
check("email format", validateValue(rules.email, "nope@") === "Enter a valid email address.");
check("empty required rejected", validateValue(rules.first_name, "") === "Enter your first name (2+ characters).");
check("per-field message for guests", validateValue(rules.guests, "") === "Choose the number of guests.");
check("per-field message for subject", validateValue(rules.subject, "") === "Choose a subject.");

// --- 2.5. Copy resolution: field.message → copy[key] → default ---
const emSpec = toFieldSpecs([{ type: "email", name: "em", label: "E", required: true }]);
check("default email copy", buildRules(emSpec).em.message === "Enter a valid email address.");
check("copy overrides default", buildRules(emSpec, { email: "Bad email." }).em.message === "Bad email.");
check(
  "per-field message beats copy",
  buildRules(toFieldSpecs([{ type: "email", name: "em", label: "E", required: true, message: "Fix your email." }]), { email: "Bad email." }).em.message === "Fix your email.",
);
const requiredCopy = buildRules(toFieldSpecs([{ type: "text", name: "topic", label: "T", required: true }]), { required: "Pick something." });
check("generic required copy", validateValue(requiredCopy.topic, "") === "Pick something.");

// --- 2.6. New field types (url / number / range / color / checkbox / radio / hidden) ---
const demoSpec = [
  { type: "url", name: "site", label: "Website", required: true },
  { type: "number", name: "qty", label: "Quantity", required: true, min: 1, max: 10 },
  { type: "range", name: "level", label: "Level" },
  { type: "color", name: "accent", label: "Accent" },
  { type: "checkbox", name: "consent", label: "I agree", required: true },
  { type: "checkbox", name: "topics", label: "Topics", options: ["News", "Offers"] },
  { type: "radio", name: "plan", label: "Plan", required: true, options: ["Basic", "Premium"] },
  { type: "hidden", name: "site_id", label: "", value: "42" },
];
const demoFields = toFieldSpecs(demoSpec);
const demoRules = buildRules(demoFields);
check("url passes", validateValue(demoRules.site, "https://example.com") === null);
check("url rejects bare word", validateValue(demoRules.site, "example") !== null);
check("number in bounds", validateValue(demoRules.qty, "5") === null);
check("number over max", validateValue(demoRules.qty, "11") !== null);
check("number non-numeric", validateValue(demoRules.qty, "abc") !== null);
check("range mid (0-100 default)", validateValue(demoRules.level, "42") === null);
check("range over 100", validateValue(demoRules.level, "150") !== null);
check("color ok", validateValue(demoRules.accent, "#ff0000") === null);
check("color rejects", validateValue(demoRules.accent, "red") !== null);
check("required checkbox empty", validateValue(demoRules.consent, "") !== null);
check("required checkbox ticked", validateValue(demoRules.consent, "1") === null);
check("checkbox group not required", demoRules.topics.required === false);
check("radio empty rejected", validateValue(demoRules.plan, "") !== null);
check("hidden skips rules", !("site_id" in demoRules));

// --- 2.7. Conditional fields (showWhen) ---
const condRaw = [
  { type: "text", name: "other_service", label: "Other service", required: true, showWhen: { field: "service", operator: "equals", value: "Other" } },
  { type: "text", name: "other_topic", label: "Other topic", showWhen: [{ field: "service", operator: "equals", value: "Other" }, { field: "topic", operator: "includes", value: "Custom" }] },
  { type: "text", name: "plain", label: "Plain" },
];
const condFields = toFieldSpecs(condRaw);
const byName = (n) => condFields.find((f) => f.name === n);
const serialized = parseFieldSpec(serializeRules(condFields));

check("showWhen single → visibility array of 1", JSON.stringify(byName("other_service").visibility) === JSON.stringify([{ field: "service", operator: "equals", value: "Other" }]));
check("showWhen single → dependsOn", JSON.stringify(byName("other_service").dependsOn) === JSON.stringify(["service"]));
check("showWhen array (AND) kept", byName("other_topic").visibility.length === 2, String(byName("other_topic").visibility?.length));
check("showWhen array → dependsOn deduped", JSON.stringify(byName("other_topic").dependsOn) === JSON.stringify(["service", "topic"]));
check("unconditional field has no visibility/dependsOn", !("visibility" in byName("plain")) && !("dependsOn" in byName("plain")));
check("data-rules round-trip keeps visibility", JSON.stringify(serialized.find((f) => f.name === "other_service").visibility) === JSON.stringify(byName("other_service").visibility));
check("data-rules round-trip keeps dependsOn", JSON.stringify(serialized.find((f) => f.name === "other_topic").dependsOn) === JSON.stringify(["service", "topic"]));

check("equals matches", evaluateVisibility([{ field: "service", operator: "equals", value: "Other" }], { service: ["Other"] }));
check("equals misses", !evaluateVisibility([{ field: "service", operator: "equals", value: "Other" }], { service: ["Web"] }));
check("notEquals matches on different value", evaluateVisibility([{ field: "service", operator: "notEquals", value: "Other" }], { service: ["Web"] }));
check("notEquals matches when empty", evaluateVisibility([{ field: "service", operator: "notEquals", value: "Other" }], { service: [] }));
check("notEquals misses on equal value", !evaluateVisibility([{ field: "service", operator: "notEquals", value: "Other" }], { service: ["Other"] }));
check("in matches", evaluateVisibility([{ field: "plan", operator: "in", value: ["Pro", "Team"] }], { plan: ["Team"] }));
check("in misses", !evaluateVisibility([{ field: "plan", operator: "in", value: ["Pro", "Team"] }], { plan: ["Free"] }));
check("in accepts single string value", evaluateVisibility([{ field: "plan", operator: "in", value: "Pro" }], { plan: ["Pro"] }));
check("notIn", !evaluateVisibility([{ field: "plan", operator: "notIn", value: ["Pro", "Team"] }], { plan: ["Pro"] }));
check("includes string in group", evaluateVisibility([{ field: "topic", operator: "includes", value: "News" }], { topic: ["Design", "News"] }));
check("includes misses", !evaluateVisibility([{ field: "topic", operator: "includes", value: "News" }], { topic: ["Design"] }));
check("includes array = all-of", evaluateVisibility([{ field: "topic", operator: "includes", value: ["News", "Design"] }], { topic: ["News", "Design"] }));
check("includes array misses partial", !evaluateVisibility([{ field: "topic", operator: "includes", value: ["News", "Business"] }], { topic: ["News", "Design"] }));
check("filled", evaluateVisibility([{ field: "rush", operator: "filled" }], { rush: ["on"] }));
check("filled misses", !evaluateVisibility([{ field: "rush", operator: "filled" }], { rush: [] }));
check("empty", evaluateVisibility([{ field: "rush", operator: "empty" }], { rush: [] }));
check("array = AND, both hold", evaluateVisibility([{ field: "service", operator: "equals", value: "Other" }, { field: "topic", operator: "includes", value: "Custom" }], { service: ["Other"], topic: ["Custom"] }));
check("array = AND, one fails", !evaluateVisibility([{ field: "service", operator: "equals", value: "Other" }, { field: "topic", operator: "includes", value: "Custom" }], { service: ["Other"], topic: ["Default"] }));
check("unknown operator never matches", !evaluateVisibility([{ field: "x", operator: "equalsX", value: "y" }], { x: ["y"] }));
check("missing controller values → empty", evaluateVisibility([{ field: "rush", operator: "empty" }], {}));

// visibleNames → the fields a submission actually carries.
const visible = visibleNames(condFields, { service: ["Web"], topic: ["Default"] });
check("visibleNames keeps unconditional", visible.has("plain"));
check("visibleNames hides unmet condition", !visible.has("other_service"));
check("visibleNames evaluates AND", visible.has("other_topic") === false);
const visibleOther = visibleNames(condFields, { service: ["Other"], topic: ["Custom"] });
check("visibleNames shows matching condition", visibleOther.has("other_service") && visibleOther.has("other_topic"));

// Hidden conditional fields never reach the canonical payload.
const condRaw2 = new FormData();
condRaw2.set("service", "Other");
condRaw2.set("other_service", "event consulting");
condRaw2.set("plain", "hello");
const kept = condFields.filter((f) => visibleNames(condFields, { service: ["Other"], topic: [] }).has(f.name));
const payloadCond = canonicalData(condRaw2, kept);
check("payload carries visible conditional field", payloadCond.get("other_service") === "event consulting");
const dropped = condFields.filter((f) => visibleNames(condFields, { service: ["Web"], topic: [] }).has(f.name));
const payloadDropped = canonicalData(condRaw2, dropped);
check("payload drops hidden conditional field", !("other_service" in Object.fromEntries(payloadDropped.entries())));

// A required conditional field is validated like any other when visible.
const condRules = buildRules(toFieldSpecs([{ type: "email", name: "alt_email", label: "Alt email", required: true, showWhen: { field: "plain", operator: "filled" } }]));
check("conditional field still builds rules", "alt_email" in condRules && condRules.alt_email.required === true);

// --- 2.8. Structural elements (heading / description / divider / section) ---
const structRaw = [
  { type: "text", id: "full_name", name: "full_name", label: "Name", required: true },
  { type: "heading", text: "Project details", align: "center" },
  { type: "description", text: "Helper copy", size: 66 },
  { type: "divider", visible: false, min: "2rem" },
  { type: "section", label: "Contact details" },
  { type: "email", id: "email2", name: "email2", label: "Email" },
];
check("isFieldSpec true for fields", isFieldSpec(structRaw[0]) && isFieldSpec(structRaw[5]));
check("isFieldSpec false for structural elements", !isFieldSpec(structRaw[1]) && !isFieldSpec(structRaw[2]) && !isFieldSpec(structRaw[3]) && !isFieldSpec(structRaw[4]));
const structSpecs = toFieldSpecs(structRaw);
check("toFieldSpecs drops all structural elements", structSpecs.length === 2, String(structSpecs.length));
check("toFieldSpecs keeps field order", structSpecs.map((f) => f.name).join(",") === "full_name,email2", structSpecs.map((f) => f.name).join(","));
const structSerialized = serializeRules(structSpecs);
check("serialized rules are field-only (no decor keys)", !structSerialized.includes('"text":') && !structSerialized.includes('"align"') && !structSerialized.includes('"visible"'), structSerialized);
check("round-trip carries only fields", parseFieldSpec(structSerialized).length === 2);
check("buildRules only sees fields", Object.keys(buildRules(structSpecs)).sort().join(",") === "email2,full_name");

// --- 2.9. gridSpan: percentage size → nearest 12-column span ---
const gridSpans = [[100, 12], [90, 11], [80, 10], [75, 9], [70, 8], [67, 8], [66, 8], [60, 7], [50, 6], [40, 5], [33, 4], [30, 4], [25, 3], [20, 2], [10, 1]];
check("gridSpan maps the full 12-grid size set", gridSpans.every(([size, span]) => gridSpan(size) === span), JSON.stringify(gridSpans.map(([s]) => [s, gridSpan(s)])));
check("gridSpan default (undefined) → 6", gridSpan(undefined) === 6);
check("gridSpan clamps out-of-range high", gridSpan(150) === 12 && gridSpan(1000) === 12);
check("gridSpan clamps out-of-range low", gridSpan(0) === 1 && gridSpan(-20) === 1);

// --- 2.10. toSteps: wizard step markers ---
const wizardFixture = {
  name: "wizard",
  submit: "Send",
  status: "ok",
  fields: [
    { type: "heading", text: "Enquiry" },
    { type: "step", label: "Contact", submit: "Go" },
    { type: "text", id: "name", name: "name", label: "Name", required: true },
    { type: "step", label: "Project" },
    { type: "select", id: "budget", name: "budget", label: "Budget", options: ["a"] },
    { type: "step", label: "Details", submit: "Send enquiry" },
    { type: "textarea", id: "msg", name: "msg", label: "Message" },
    { type: "hidden", id: "ref", name: "referrer", label: "Referrer", value: "demo" },
  ],
};
const wizardLayout = toSteps(wizardFixture.fields);
check("toSteps: 3 markers → 3 steps", wizardLayout.steps.length === 3);
check(
  "toSteps: steps keep their labels in order",
  wizardLayout.steps.map((s) => s.label).join() === "Contact,Project,Details",
);
check(
  "toSteps: prefix before first marker is the shared zone",
  wizardLayout.shared.length === 1 && wizardLayout.shared[0].type === "heading",
);
check(
  "toSteps: elements group under their marker",
  wizardLayout.steps[1].elements.length === 1 &&
    wizardLayout.steps[1].elements[0].type === "select" &&
    wizardLayout.steps[2].elements.length === 1,
);
check(
  "toSteps: hidden fields hoist outside the panes",
  wizardLayout.hoisted.length === 1 &&
    wizardLayout.steps.every((s) => !s.elements.some((e) => e.type === "hidden")),
);
check(
  "toSteps: only the last marker keeps its submit label",
  wizardLayout.steps[0].submit === undefined &&
    wizardLayout.steps[1].submit === undefined &&
    wizardLayout.steps[2].submit === "Send enquiry",
);
const flatLayout = toSteps([
  { type: "heading", text: "Hi" },
  { type: "text", id: "x", name: "x", label: "X" },
  { type: "hidden", id: "h", name: "h", label: "H" },
]);
check(
  "toSteps: no markers → flat single-page layout",
  flatLayout.steps.length === 0 && flatLayout.shared.length === 3 && flatLayout.hoisted.length === 0,
);
check(
  "toSteps: no markers leaves hidden fields in place",
  flatLayout.shared[2].type === "hidden",
);
check("step markers are never fields", !isFieldSpec({ type: "step", label: "S" }));
const wizardSpecNames = toFieldSpecs(wizardFixture.fields).map((f) => f.name);
check(
  "toFieldSpecs skips step markers",
  wizardSpecNames.length === 4 &&
    wizardSpecNames.sort().join() === "budget,msg,name,referrer",
);

// --- 2.11. Buttons (submit / next / prev) + step headers ---
check("buttonLabel: plain string passes through", buttonLabel("Send", "Submit") === "Send");
check("buttonLabel: object label wins", buttonLabel({ label: "Go", variant: "primary" }, "Submit") === "Go");
check("buttonLabel: object without label → fallback", buttonLabel({ variant: "primary" }, "Submit") === "Submit");
check("buttonLabel: undefined → fallback", buttonLabel(undefined, "Submit") === "Submit");
check("buttonVariant: plain string → fallback variant", buttonVariant("Send", "ghost") === "ghost");
check("buttonVariant: object variant wins", buttonVariant({ label: "Go", variant: "ghost" }, "primary") === "ghost");
check("buttonVariant: object without variant → fallback", buttonVariant({ label: "Go" }, "primary") === "primary");
check("buttonVariant: undefined → fallback", buttonVariant(undefined, "primary") === "primary");

const headerWizard = toSteps([
  { type: "step", label: "A", title: "Alpha", align: "center", line: false },
  { type: "text", id: "a", name: "a", label: "A" },
  { type: "step", label: "B", show: false, align: "full" },
  { type: "text", id: "b", name: "b", label: "B" },
]);
check(
  "toSteps: step header keys flow onto FormStep",
  headerWizard.steps[0].title === "Alpha" &&
    headerWizard.steps[0].align === "center" &&
    headerWizard.steps[0].line === false &&
    headerWizard.steps[0].show === undefined,
);
check(
  "toSteps: show:false and full align carried",
  headerWizard.steps[1].show === false && headerWizard.steps[1].align === "full",
);

// --- 2.12. Stepper chrome (nav strip modifiers) ---
check("stepperModifiers: undefined → none", stepperModifiers(undefined) === "");
check(
  "stepperModifiers: no nav / left+none → none",
  stepperModifiers({}) === "" &&
    stepperModifiers({ nav: {} }) === "" &&
    stepperModifiers({ nav: { variant: "left", line: "none" } }) === "",
);
check(
  "stepperModifiers: variants",
  stepperModifiers({ nav: { variant: "center" } }) === "rf-steps--center" &&
    stepperModifiers({ nav: { variant: "right" } }) === "rf-steps--right" &&
    stepperModifiers({ nav: { variant: "even" } }) === "rf-steps--even",
);
check(
  "stepperModifiers: line positions",
  stepperModifiers({ nav: { line: "top" } }) === "rf-steps--line-top" &&
    stepperModifiers({ nav: { line: "bottom" } }) === "rf-steps--line-bottom" &&
    stepperModifiers({ nav: { line: "center" } }) === "rf-steps--line-center",
);
check(
  "stepperModifiers: combined variant + line",
  stepperModifiers({ nav: { variant: "center", line: "center" } }) ===
    "rf-steps--center rf-steps--line-center",
);
check(
  "stepperModifiers: header-only stepper → none",
  stepperModifiers({ header: { align: "center", line: false } }) === "",
);

// --- 3. parseTime ---
check("parseTime 12h pm", parseTime("7:00 pm") === "19:00");
check("parseTime 12h am", parseTime("10:30am") === "10:30");
check("parseTime 24h", parseTime("19:30") === "19:30");
check("parseTime weird passthrough", parseTime("whenever") === "whenever");

// --- 4. canonicalData (json mailer payload) ---
const canon = canonicalData(raw, fields);
check("canonical has only spec fields", [...canon.keys()].every((k) => specFields.has(k)), [...canon.keys()].join(","));
check("canonical trimmed", canon.get("first_name") === "Jane", String(canon.get("first_name")));

// multi-value canonicalisation (checkbox groups)
const multi = new FormData();
multi.set("topics", "News");
multi.append("topics", "Offers");
multi.set("consent", "on");
check(
  "checkbox group joined",
  canonicalData(multi, demoFields.filter((f) => f.name === "topics")).get("topics") === "News, Offers",
  String(canonicalData(multi, demoFields.filter((f) => f.name === "topics")).get("topics")),
);
check(
  "single checkbox kept verbatim",
  canonicalData(multi, demoFields.filter((f) => f.name === "consent")).get("consent") === "on",
);
check(
  "absent hidden → empty (not dropped)",
  canonicalData(multi, demoFields.filter((f) => f.name === "site_id")).get("site_id") === "",
);

// --- 5. jsonMailer against a real local server ---
const server = createServer((req, res) => {
  if (req.url === "/ok") { res.writeHead(200); res.end("{}"); }
  else if (req.url === "/bad") { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "mail provider timeout" })); }
  else { res.writeHead(404); res.end("<h1>nope</h1>"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const ok = await jsonMailer.submit({ data: raw, fields, config: { endpoint: `http://127.0.0.1:${port}/ok` } });
check("json mailer 2xx → ok", ok.ok === true, JSON.stringify(ok));
const bad = await jsonMailer.submit({ data: raw, fields, config: { endpoint: `http://127.0.0.1:${port}/bad` } });
check("json mailer 5xx → error body surfaced", bad.ok === false && bad.message === "mail provider timeout", JSON.stringify(bad));
const noEp = await jsonMailer.submit({ data: raw, fields, config: {} });
check("json mailer missing endpoint → config error", noEp.ok === false && /endpoint/i.test(noEp.message), JSON.stringify(noEp));

// --- 5.5. Mailers honour FormCopy overrides ---
const badWithCopy = await jsonMailer.submit({
  data: raw,
  fields,
  config: { endpoint: `http://127.0.0.1:${port}/nope`, copy: { submitError: "Oops (HTTP {status})" } },
});
check("json mailer honours copy.submitError token", badWithCopy.ok === false && badWithCopy.message === "Oops (HTTP 404)", JSON.stringify(badWithCopy));
const noEpCopy = await jsonMailer.submit({ data: raw, fields, config: { copy: { configError: "Setup incomplete." } } });
check("json mailer honours copy.configError", noEpCopy.ok === false && noEpCopy.message === "Setup incomplete.", JSON.stringify(noEpCopy));
const cf7NoCfg = await cf7Mailer.submit({ data: raw, fields, config: { copy: { configError: "CF7 not configured." } } });
check("cf7 mailer honours copy.configError", cf7NoCfg.ok === false && cf7NoCfg.message === "CF7 not configured.", JSON.stringify(cf7NoCfg));

server.close();

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);