import { createServer } from "node:http";
import {
  cf7Payload,
  cf7Mailer,
  CORE_FIELDS,
} from "../src/mailers/cf7.ts";
import { jsonMailer } from "../src/mailers/json.ts";
import {
  buildRules,
  validateValue,
  parseTime,
  toFieldSpecs,
  canonicalData,
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