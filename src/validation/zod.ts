/**
 * Optional Zod adapter for the package's validation seam.
 *
 * `zodValidation(schema)` turns a consumer's Zod object schema into a
 * `ValidationProvider`. The DOM engine, React adapter and TanStack bridge all
 * validate through opaque per-field `Rule` objects, so swapping the provider
 * never changes *how* validation runs — only *which* rules run. With this
 * adapter, the schema (not the package's regex defaults) is the source of
 * truth for required-ness, format and messages.
 *
 * ```ts
 * import { z } from "zod";
 * import { zodValidation } from "@clearstorm/contact-form/validation";
 *
 * // DOM path:
 * renderForm("#root", spec, { validation: zodValidation(z.object({
 *   email: z.string().email("Enter a valid email address."),
 * })) });
 *
 * // React path:
 * <ContactForm form={spec} validation={zodValidation(schema)} />
 *
 * // TanStack path:
 * useContactForm(spec, { validation: zodValidation(schema) });
 * ```
 *
 * Semantics: fields reach the engine as *strings* (an untouched DOM control is
 * `""`), so a field is required exactly when the schema rejects `""` —
 * `z.string().min(2)` is required, `z.string().email().or(z.literal(""))` is
 * not. Values are tested as-is against the schema; number/boolean inputs
 * arrive as strings, so coerce them (`z.coerce.number()`) in the schema.
 * Messages come from the schema's own issue text, resolved per value.
 *
 * The schema is consumed *structurally* (`.shape` + `.safeParse`), so this
 * module neither imports nor type-checks against zod itself: zod is an
 * optional peer dependency that only loads when a consumer builds a schema.
 * Fields present in the schema validate against it; fields absent from the
 * schema keep the package's vanilla rules — the two compose, nothing is
 * dropped.
 */
import {
  vanillaValidation,
  type FieldSpec,
  type FormCopy,
  type Rule,
  type ValidationProvider,
} from "../core";

interface ZodIssue {
  message: string;
}

interface ZodFieldLike {
  safeParse(value: unknown):
    | { success: true }
    | { success: false; error: { issues: ZodIssue[] } };
}

/** The structural shape of a `z.object({ … })` schema (zod v3 + v4). */
export interface ZodObjectLike {
  shape: Record<string, ZodFieldLike | undefined>;
}

/** Per-value message: the schema's first issue *for exactly this value*. */
const zodMessage = (field: ZodFieldLike): ((value: string) => string) => {
  return (value) => {
    const result = field.safeParse(value);
    if (result.success) return "";
    return result.error.issues[0]?.message ?? "Invalid value.";
  };
};

/**
 * Build a `ValidationProvider` whose per-field rules come from a Zod schema.
 * Required-ness follows the schema (the field is required exactly when the
 * schema rejects `"", the untouched-DOM value); format and messages follow the
 * schema's own checks and issue text. Fields missing from the schema keep
 * their vanilla rule.
 */
export function zodValidation(schema: ZodObjectLike): ValidationProvider {
  return {
    buildRules(fields: FieldSpec[], copy: FormCopy = {}): Record<string, Rule> {
      // Vanilla first — fields absent from the schema keep their default rules.
      const rules = vanillaValidation.buildRules(fields, copy);
      for (const field of fields) {
        if (field.type === "hidden") continue;
        const zodField = schema.shape[field.name];
        if (!zodField) continue;
        rules[field.name] = {
          // Required exactly when the schema rejects the untouched value.
          required: !zodField.safeParse("").success,
          test: (value) => zodField.safeParse(value).success,
          message: zodMessage(zodField),
        };
      }
      return rules;
    },
  };
}