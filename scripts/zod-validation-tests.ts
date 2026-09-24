/**
 * Zod adapter tests — the `zodValidation` provider deriving per-field rules
 * from a consumer's Zod schema, composed over the vanilla defaults, verified
 * through the core `validateValue` path (the exact function the DOM engine and
 * the TanStack bridge both run). Bundled under Node; no DOM required.
 */
import { z } from "zod";
import { zodValidation } from "../src/validation/zod";
import { validateValue, vanillaValidation, type FieldSpec } from "../src/core";

let failures = 0;
const check = (label: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.log(`  FAIL: ${label} ${extra}`);
  }
};

const fields: FieldSpec[] = [
  { type: "text", id: "first_name", name: "first_name", label: "Name", required: true },
  { type: "email", id: "email", name: "email", label: "Email", required: true },
  { type: "text", id: "code", name: "code", label: "Code", required: false },
  { type: "text", id: "nick", name: "nick", label: "Nick", required: false },
  { type: "email", id: "opt_email", name: "opt_email", label: "Optional email", required: false },
  // Not in the schema — must keep the vanilla rule (composition).
  { type: "textarea", id: "note", name: "note", label: "Note", required: true },
];

const schema = z.object({
  first_name: z.string().min(3, "Too short, friend."),
  email: z.string().email("Enter a valid email address."),
  // min(2) rejects "" → required even though the spec says required: false.
  code: z.string().regex(/^[A-Z]{3}$/, "Code must be 3 uppercase letters."),
  // .optional() means "undefined allowed"; "" still fails min(2) — required.
  nick: z.string().min(2, "Nick needs 2+ characters.").optional(),
  // Genuinely optional in the DOM: "" is explicitly allowed.
  opt_email: z.string().email("Bad email.").or(z.literal("")),
});

const rules = zodValidation(schema).buildRules(fields);
const v = (name: string, value: string) => validateValue(rules[name], value);

/* ---- required-ness + messages from the schema ---- */

check(
  "zod: required field — empty fails with the schema's message",
  v("first_name", "") === "Too short, friend.",
  `got=${v("first_name", "")}`,
);
check(
  "zod: required field — too short fails per value",
  v("first_name", "ab") === "Too short, friend.",
);
check("zod: required field — valid passes", v("first_name", "Sibonelo") === null);

/* ---- format from the schema ---- */

check(
  "zod: email — invalid fails with the schema's message",
  v("email", "not-an-email") === "Enter a valid email address.",
  `got=${v("email", "not-an-email")}`,
);
check("zod: email — valid passes", v("email", "sibonelo@example.com") === null);
check(
  "zod: regex — mismatch reports the schema message",
  v("code", "ab1") === "Code must be 3 uppercase letters.",
  `got=${v("code", "ab1")}`,
);
check("zod: regex — match passes", v("code", "ABC") === null);

/* ---- required-ness wins over the spec (schema is the source of truth) ---- */

check(
  "zod: spec required:false → schema rejects \"\" so empty fails",
  v("code", "") === "Code must be 3 uppercase letters.",
  `got=${String(v("code", ""))}`,
);
check(
  "zod: .optional() doesn't pass empty when the inner schema rejects it",
  v("nick", "") !== null && v("nick", "x") !== null,
);
check("zod: .optional() field — valid long value passes", v("nick", "Sibo") === null);

/* ---- genuinely optional ("" allowed) ---- */

check("zod: or(z.literal(\"\")) — empty passes", v("opt_email", "") === null);
check(
  "zod: or(z.literal(\"\")) — non-empty still validates",
  v("opt_email", "bad") === "Bad email." && v("opt_email", "s@s.io") === null,
  `got=${String(v("opt_email", "bad"))}`,
);

/* ---- composition with the vanilla defaults ---- */

const vanillaNote = vanillaValidation.buildRules(fields, {})["note"];
check(
  "zod: field absent from the schema keeps its vanilla rule",
  typeof vanillaNote !== "undefined" &&
    v("note", "") === vanillaNote.message &&
    v("note", "a sufficiently long message here") === null,
  `got=${String(v("note", ""))}`,
);
check(
  "zod: derived rules carry a per-value message resolver (seam widened)",
  typeof rules.email.message === "function" && typeof rules.first_name.message === "function",
);
const extraRule = zodValidation(schema).buildRules([
  ...fields,
  { type: "text", id: "ghost", name: "ghost", label: "G" },
]);
check(
  "zod: building twice is independent (no shared state)",
  "ghost" in extraRule &&
    validateValue(extraRule.first_name, "ab") === "Too short, friend." &&
    validateValue(rules.first_name, "ab") === "Too short, friend.",
);

console.log(failures === 0 ? "\nZOD VALIDATION ALL PASS" : `\nZOD VALIDATION ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);