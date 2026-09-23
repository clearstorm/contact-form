/**
 * CF7 transport — the default mailer.
 *
 * POSTs to the Contact Form 7 REST feedback endpoint, adding CF7's
 * book-keeping fields (`_wpcf7`, `_wpcf7_unit_tag`), and treats a
 * `mail_sent` response as success. CF7 only accepts a fixed set of named
 * fields, so the payload policy lives here: the core fields go verbatim and
 * every other collected field folds into `message` as a labelled line (times
 * normalised), with the subject carrying the sender's name.
 */
import { canonicalData, parseTime, type FieldSpec } from "../core";
import type { Mailer, MailerResult } from "./index";

/** CF7 accepts only these named fields; anything else is folded into `message`. */
export const CORE_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "contact",
  "subject",
  "message",
];

/**
 * Shape the canonical payload for CF7: core fields verbatim, extras folded
 * into the message as `Label: value` lines, subject suffixed with the
 * sender's name. Exported for testing.
 */
export function cf7Payload(data: FormData, fields: FieldSpec[]): FormData {
  const payload = canonicalData(data, fields);

  // File fields: canonicalData reduced them to filenames — swap those back
  // for the real File objects so CF7's attachment handling sees the bytes.
  for (const field of fields) {
    if (field.type !== "file") continue;
    const files = data.getAll(field.name).filter((value): value is File => value instanceof File);
    if (files.length === 0) continue;
    payload.delete(field.name);
    for (const file of files) payload.append(field.name, file, file.name);
  }

  const message = String(payload.get("message") ?? "").trim();
  const details = fields
    .map((field) => {
      if (CORE_FIELDS.includes(field.name)) return "";
      const raw = String(payload.get(field.name) ?? "").trim();
      if (!raw) return "";
      const value = field.type === "time" ? parseTime(raw) : raw;
      return `${field.label ?? field.name}: ${value}`;
    })
    .filter(Boolean);
  payload.set(
    "message",
    [message, ...(details.length ? ["", ...details] : [])].join("\n"),
  );

  // Subject carries the sender's name so the reply can be addressed:
  // "{subject} — {first name} {last name}". The suffix collapses away if a
  // name is somehow missing.
  const rawSubject = String(payload.get("subject") ?? "").trim();
  const sender = [
    `${String(payload.get("first_name") ?? "").trim()} ${String(payload.get("last_name") ?? "").trim()}`.trim(),
  ].filter(Boolean);
  payload.set("subject", [rawSubject, ...sender].filter(Boolean).join(" — "));

  return payload;
}

interface Cf7Result {
  status: string;
  message?: string;
  invalid_fields?: Array<{ field?: string; into?: string; message?: string }>;
}

export const cf7Mailer: Mailer = {
  name: "cf7",
  async submit({ data, fields, config }): Promise<MailerResult> {
    const { apiUrl, formId, copy } = config;
    if (!apiUrl || !formId) {
      return {
        ok: false,
        message: copy?.configError ?? "Form configuration error: missing API URL or form ID.",
      };
    }

    const payload = cf7Payload(data, fields);
    payload.append("_wpcf7", formId);
    payload.append("_wpcf7_unit_tag", `wpcf7-f${formId}-o1`);

    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`,
      { method: "POST", body: payload },
    );

    let result: Cf7Result = { status: "" };
    try {
      result = await response.json();
    } catch {
      /* non-JSON response — treated as a failed submission below */
    }

    if (result.status === "mail_sent") return { ok: true, message: "" };

    if (result.status === "validation_failed" && result.invalid_fields?.length) {
      const messages = result.invalid_fields
        .map((field) => field.message)
        .filter(Boolean)
        .join(" ");
      return {
        ok: false,
        message: messages || copy?.invalidForm || "Some fields need your attention. Please check the form.",
      };
    }

    return {
      ok: false,
      message:
        result.message || copy?.error || "There was an error sending your message. Please try again.",
    };
  },
};