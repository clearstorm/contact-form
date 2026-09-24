/**
 * TanStack Form bridge tests — the pure helpers of `src/tanstack/`
 * (`buildInitialValues`, `buildValidators`, `normalizeValue`,
 * `valuesToFormData`, `visibleFieldNames`) plus the canonical-payload
 * round-trip. No DOM required — FormData exists globally in modern Node.
 *
 * Bundled by scripts/test.mjs like the rest of the suite.
 */
import {
  buildInitialValues,
  buildValidators,
  normalizeValue,
  valuesToFormData,
  visibleFieldNames,
} from "../src/tanstack/useContactForm";
import { canonicalData, toFieldSpecs, vanillaValidation, type FormSpec } from "../src/core";

let failures = 0;
const check = (label: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.log(`  FAIL: ${label} ${extra}`);
  }
};

/* ---- fixture spec (mirrors the demo's "Realistic enquiry") ---- */

const spec: FormSpec = {
  name: "tanstack-test",
  submit: "Send",
  mailer: "json",
  endpoint: "https://example.test/send",
  fields: [
    {
      type: "text",
      id: "first_name",
      name: "first_name",
      label: "First name",
      required: true,
    },
    {
      type: "email",
      id: "email",
      name: "email",
      label: "Email",
      required: true,
    },
    {
      type: "select",
      id: "service",
      name: "service",
      label: "Service",
      required: true,
      options: ["Website", "Other"],
    },
    {
      type: "text",
      id: "other_service",
      name: "other_service",
      label: "Describe the service",
      required: true,
      showWhen: { field: "service", operator: "equals", value: "Other" },
    },
    {
      type: "checkbox",
      id: "rush",
      name: "rush",
      label: "This is urgent",
    },
    {
      type: "checkbox",
      id: "interests",
      name: "interests",
      label: "Interests",
      options: ["Newsletter", "Events"],
    },
    {
      type: "hidden",
      id: "referrer",
      name: "referrer",
      value: "tanstack-test",
    },
  ],
};

const fields = toFieldSpecs(spec.fields);
const validators = buildValidators(fields, spec.copy);
const initial = buildInitialValues(spec.fields);

/* ---- buildInitialValues ---- */

check(
  "initial values: strings default to ''",
  initial.first_name === "" && initial.email === "" && initial.service === "",
);
check(
  "initial values: checkbox group → [], single checkbox → false",
  Array.isArray(initial.interests) && (initial.interests as string[]).length === 0 && initial.rush === false,
);
check(
  "initial values: hidden keeps its spec value",
  (initial.referrer as string) === "tanstack-test",
);

/* ---- buildValidators ---- */

check(
  "validator: empty required text fails",
  validators.first_name({ value: "" }) !== undefined,
);
check(
  "validator: invalid email fails",
  validators.email({ value: "not-an-email" }) !== undefined,
);
check(
  "validator: valid values pass",
  validators.first_name({ value: "Jane" }) === undefined &&
    validators.email({ value: "jane@example.com" }) === undefined,
);
check(
  "validator: optional single checkbox doesn't force a choice",
  validators.rush({ value: false }) === undefined,
);

/* ---- buildValidators with a custom validation provider ---- */

const strictProvider = {
  ...vanillaValidation,
  buildRules(flds: Parameters<typeof vanillaValidation.buildRules>[0], cpy: Parameters<typeof vanillaValidation.buildRules>[1]) {
    const built = vanillaValidation.buildRules(flds, cpy);
    // Mimics a Zod-backed adapter: email bypassed, name's per-value message.
    if (built.email) built.email.test = () => true;
    if (built.first_name) built.first_name.message = (value: string) => `Name must shout (had "${value}")`;
    return built;
  },
};
const providerValidators = buildValidators(fields, spec.copy, strictProvider);
check(
  "buildValidators: custom provider routes into per-field validators",
  providerValidators.email({ value: "any-old-thing" }) === undefined &&
    providerValidators.first_name({ value: "" }) === 'Name must shout (had "")',
  `got=${providerValidators.first_name({ value: "" })}`,
);
check(
  "buildValidators: raw validators still derive when provider omitted",
  typeof buildValidators(fields, spec.copy).first_name === "function",
);

/* ---- normalizeValue ---- */

check(
  "normalize: text trims",
  normalizeValue(fields[0]!, "  Jane Doe  ") === "Jane Doe",
);
check(
  "normalize: checkbox group collapses to 1/''",
  normalizeValue(fields.find((f) => f.name === "interests")!, ["Newsletter"]) === "1" &&
    normalizeValue(fields.find((f) => f.name === "interests")!, []) === "",
);
check(
  "normalize: boolean switch",
  normalizeValue(fields.find((f) => f.name === "rush")!, true) === "1" &&
    normalizeValue(fields.find((f) => f.name === "rush")!, false) === "",
);

/* ---- values → FormData → canonical payload ---- */

const values = {
  first_name: "Jane",
  email: "jane@example.com",
  service: "Other",
  other_service: "Event consulting",
  rush: false,
  interests: ["Newsletter", "Events"],
  referrer: "tanstack-test",
};

const visible = visibleFieldNames(fields, values);
check(
  "visibility: conditional field visible when its controller matches",
  visible.has("other_service"),
);
check(
  "visibility: unconditional fields always in scope",
  visible.has("first_name") && visible.has("referrer"),
);
check(
  "visibility: field hidden when controller doesn't match",
  !visibleFieldNames(fields, { ...values, service: "Website" }).has("other_service"),
);

const data = valuesToFormData(values, fields);
check("form data carries each spec field", data.getAll("first_name").length === 1);
check(
  "form data folds checkbox group entries",
  data.getAll("interests").sort().join(",") === "Events,Newsletter",
);

const payload = canonicalData(data, fields.filter((f) => visible.has(f.name)));
check(
  "canonical payload round-trips (group joined, hidden kept, strings trimmed)",
  payload.get("interests") === "Newsletter, Events" &&
    payload.get("referrer") === "tanstack-test" &&
    payload.get("first_name") === "Jane",
);

console.log(failures === 0 ? "TANSTACK ALL PASS" : `TANSTACK ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);