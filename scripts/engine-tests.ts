/**
 * Client engine tests — run the framework-agnostic runtime (attachForm /
 * initForms) under happy-dom: validation, conditional visibility, wizard
 * state, honeypot, detach/StrictMode safety and the submit → mailer path.
 *
 * Note: this file is `.ts` (not `.mjs`) on purpose — its `querySelector<T>`
 * generics need esbuild's TypeScript pass (a `.mjs` entry would leak the
 * `<T>` as comparison operators and silently break).
 *
 * The mailer's `fetch` is stubbed to avoid HTTP + brand-checked FormData
 * serialisation — the JSON mailer reads `response.ok`/`response.json()`, both
 * of which the stub provides.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Capture the platform Response BEFORE happy-dom registers its globals, then
// drive the fetch stub ourselves.
const NodeResponse = globalThis.Response;

await GlobalRegistrator.register();

// Silence the shell's build-time endpoint-config warnings in tests.
console.warn = () => {};

let failures = 0;
const check = (label: string, cond: boolean, extra = "") => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.log(`  FAIL: ${label} ${extra}`);
  }
};

const { attachForm, initForms } = await import("../src/runtime/engine");
const { renderFormShell } = await import("../src/runtime/markup");

/* ---- fetch stub ---- */

const calls: { url: string; data: Record<string, unknown> }[] = [];
globalThis.fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
  const body = init.body;
  const data =
    body instanceof FormData
      ? Object.fromEntries(body.entries())
      : body instanceof Blob
        ? "<blob>"
        : body;
  calls.push({ url: String(url), data });
  if (String(url).includes("fail")) {
    return new NodeResponse(JSON.stringify({ error: "mail provider timeout" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new NodeResponse("{}", { status: 200, headers: { "content-type": "application/json" } });
};

/** Count error `<p>`s with a raw walk — immune to class-selector index quirks. */
const errorCount = (form: HTMLFormElement): number => {
  let n = 0;
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLElement && child.classList.contains("rf-field-error")) n++;
      walk(child);
    }
  };
  walk(form);
  return n;
};

/* ---- helpers ---- */

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond: () => boolean, tries = 30) => {
  while (tries-- > 0) {
    if (cond()) return true;
    await tick();
  }
  return cond();
};

const root = () => document.querySelector<HTMLElement>("#root");
const mount = (form: string) => {
  document.body.innerHTML = '<div id="root"></div>';
  const r = root();
  if (!r) throw new Error("mount: #root not found after body.innerHTML reset");
  r.innerHTML = form;
  return r.querySelector<HTMLFormElement>("form[data-mail-form]") as HTMLFormElement;
};
const input = (form: HTMLFormElement, name: string) =>
  form.querySelector<HTMLInputElement>(`[name="${name}"]`) as HTMLInputElement;
const find = <T extends Element = HTMLElement>(form: HTMLFormElement, sel: string) =>
  form.querySelector<T>(sel);
const fire = (el: Element, type: string) =>
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
const submit = (form: HTMLFormElement) => fire(form, "submit");

const jsonSpec = (fields: unknown[], extra: Record<string, unknown> = {}) => ({
  name: "engine",
  submit: "Send",
  status: "Thanks!",
  mailer: "json",
  endpoint: "https://example.test/submit",
  ...extra,
  fields,
});

/* ---- 1. validation: errors on submit, success + canonical payload ---- */

const errSpec = jsonSpec([
  { type: "text", id: "full_name", name: "full_name", label: "Name", required: true },
  { type: "email", id: "email", name: "email", label: "Email", required: true },
  { type: "textarea", id: "message", name: "message", label: "Message", required: true },
]);

let form = mount(renderFormShell({ form: errSpec }));
attachForm(form);

submit(form);
await until(() => errorCount(form) === 3);
check("empty required submit flags every field", errorCount(form) === 3, `errors=${errorCount(form)}`);
check("first invalid field focused", document.activeElement === input(form, "full_name"));

input(form, "full_name").value = "  Jane ";
input(form, "email").value = "jane@example.com";
input(form, "message").value = "  hello world  ";
submit(form);
check("success after fixing fields", await until(() => !find(form, ".rf-status")!.hidden));
check("fetch called once", calls.length === 1);
const payload = calls[0].data;
check("payload trimmed", payload.full_name === "Jane" && payload.message === "hello world", JSON.stringify(payload));
check("honeypot never forwarded", !("website" in payload), JSON.stringify(payload));
check("status text = form.status", find(form, ".rf-status")!.textContent!.trim() === "Thanks!");
check("fields cleared after success", input(form, "email").value === "");

// error clears on input once flagged
submit(form);
await until(() => errorCount(form) === 3);
input(form, "email").value = "a@b.co";
fire(input(form, "email"), "input");
check("error clears on input", !input(form, "email").hasAttribute("aria-invalid"));

// mailer failure surfaces the response error text
form = mount(renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { endpoint: "https://example.test/fail" }) }));
attachForm(form);
submit(form);
check(
  "mailer error surfaced",
  await until(() => find(form, ".rf-status--error")?.textContent?.trim() === "mail provider timeout"),
);

/* ---- 2. conditional visibility (showWhen) ---- */

const condSpec = jsonSpec(
  [
    { type: "select", id: "service", name: "service", label: "Service", options: ["Standard", "Other"] },
    {
      type: "text",
      id: "other_service",
      name: "other_service",
      label: "Other service",
      required: true,
      showWhen: { field: "service", operator: "equals", value: "Other" },
    },
  ],
  { name: "engine-cond" },
);

form = mount(renderFormShell({ form: condSpec }));
attachForm(form);
const otherWrap = () => input(form, "other_service").closest(".rf-field") as HTMLElement;
check("conditional field hidden initially (select defaults to first option)", otherWrap().hidden === true);

input(form, "service").value = "Other";
fire(input(form, "service"), "change");
check("conditional field revealed when controller equals", otherWrap().hidden === false);

submit(form);
await until(() => errorCount(form) === 1);
check("revealed required field blocks submit", errorCount(form) === 1, `errors=${errorCount(form)}`);

input(form, "other_service").value = "event consulting";
fire(input(form, "other_service"), "input");
submit(form);
check("submit succeeds with visible field", await until(() => !find(form, ".rf-status")!.hidden));
check("visible conditional field in payload", calls[calls.length - 1].data.other_service === "event consulting");

// re-hide, then submit again — the hidden field must not travel
input(form, "service").value = "Standard";
fire(input(form, "service"), "change");
check("field re-hides", otherWrap().hidden === true);
submit(form);
await until(() => !find(form, ".rf-status")!.hidden);
const payloadAfterHide = calls[calls.length - 1].data;
check("payload only carries what the visitor saw", !("other_service" in payloadAfterHide), JSON.stringify(payloadAfterHide));

/* ---- 2b. conditional logic expansion: anyOf wrappers + numeric operators ---- */

const logicSpec = jsonSpec(
  [
    { type: "select", id: "plan", name: "plan", label: "Plan", options: ["Starter", "Enterprise", "Custom"] },
    {
      type: "text",
      id: "procurement_code",
      name: "procurement_code",
      label: "Procurement code",
      required: true,
      // anyOf: shown when plan is Enterprise OR Custom.
      showWhen: {
        anyOf: [
          { field: "plan", operator: "equals", value: "Enterprise" },
          { field: "plan", operator: "equals", value: "Custom" },
        ],
      },
    },
    { type: "number", id: "team_size", name: "team_size", label: "Team size" },
    {
      type: "text",
      id: "custom_quote",
      name: "custom_quote",
      label: "Custom quote details",
      required: true,
      showWhen: { field: "team_size", operator: "greaterThan", value: 50 },
    },
  ],
  { name: "engine-logic" },
);

form = mount(renderFormShell({ form: logicSpec }));
attachForm(form);
const procWrap = () => input(form, "procurement_code").closest(".rf-field") as HTMLElement;
const quoteWrap = () => input(form, "custom_quote").closest(".rf-field") as HTMLElement;

// select defaults to its first option ("Starter") → no anyOf branch holds
check("anyOf hidden while plan is Starter", procWrap().hidden === true);
input(form, "plan").value = "Custom";
fire(input(form, "plan"), "change");
check("anyOf reveals when either branch holds", procWrap().hidden === false);
input(form, "plan").value = "Starter";
fire(input(form, "plan"), "change");
check("anyOf re-hides when no branch holds", procWrap().hidden === true);

// numeric operator reacts to typed input
input(form, "team_size").value = "20";
fire(input(form, "team_size"), "input");
check("greaterThan hidden under the threshold", quoteWrap().hidden === true);
input(form, "team_size").value = "80";
fire(input(form, "team_size"), "input");
check("greaterThan reveals over the threshold", quoteWrap().hidden === false);

// reveal both, fill, submit → nested-reveal fields travel
input(form, "plan").value = "Custom";
fire(input(form, "plan"), "change");
input(form, "procurement_code").value = "ENT-42";
fire(input(form, "procurement_code"), "input");
input(form, "custom_quote").value = "needs a custom SLA";
fire(input(form, "custom_quote"), "input");
submit(form);
check("logic submit succeeds", await until(() => !find(form, ".rf-status")!.hidden));
const logicPayload = calls[calls.length - 1].data;
check(
  "nested-reveal fields reach the payload",
  logicPayload.procurement_code === "ENT-42" && logicPayload.custom_quote === "needs a custom SLA",
  JSON.stringify(logicPayload),
);

/* ---- 2c. validation rule expansion: pattern / length / sameAs / selection bounds ---- */

const ruleSpec = jsonSpec(
  [
    {
      type: "text",
      id: "vat",
      name: "vat",
      label: "VAT number",
      required: true,
      pattern: "^[A-Z]{2}\\d{9}$",
      message: "VAT must look like GB123456789.",
    },
    {
      type: "text",
      id: "code",
      name: "code",
      label: "Promo code",
      required: true,
      minLength: 4,
      maxLength: 8,
    },
    { type: "password", id: "password", name: "password", label: "Password", required: true },
    {
      type: "password",
      id: "confirm",
      name: "confirm",
      label: "Confirm password",
      required: true,
      sameAs: "password",
    },
    {
      type: "checkbox",
      id: "topics",
      name: "topics",
      label: "Topics (pick 2)",
      required: true,
      options: ["News", "Events", "Offers"],
      minSelect: 2,
    },
  ],
  { name: "engine-rules" },
);

form = mount(renderFormShell({ form: ruleSpec }));
attachForm(form);

const topicBoxes = () => Array.from(form.querySelectorAll<HTMLInputElement>('[name="topics"]'));

// maxLength renders a live character counter that tracks typing.
const counter = () => find(form, ".rf-counter") as HTMLElement;
check("maxLength renders a character counter", counter().dataset.max === "8" && counter().textContent === "0 / 8");
input(form, "code").value = "abcd";
fire(input(form, "code"), "input");
check("counter tracks typing", counter().textContent === "4 / 8", `got=${counter().textContent}`);
check("exactly one counter — only the maxLength field renders it", form.querySelectorAll(".rf-counter").length === 1);

// pattern: every field valid except vat → submit flags vat with its message.
input(form, "vat").value = "BAD";
input(form, "password").value = "s3cret";
input(form, "confirm").value = "s3cret";
topicBoxes()[0].checked = true;
topicBoxes()[1].checked = true;
submit(form);
check("pattern mismatch blocks submit", await until(() => errorCount(form) === 1), `errors=${errorCount(form)}`);
check(
  "pattern message is the field's own",
  find(form, ".rf-field-error")!.textContent === "VAT must look like GB123456789.",
);

// sameAs: mismatch flags confirm on submit; editing the target clears it live.
input(form, "vat").value = "GB123456789";
input(form, "confirm").value = "different";
submit(form);
check("sameAs mismatch flags confirm", await until(() => errorCount(form) === 1 && input(form, "confirm").hasAttribute("aria-invalid")));
input(form, "password").value = "different";
fire(input(form, "password"), "input");
check("editing the target re-checks the flagged sameAs field", !input(form, "confirm").hasAttribute("aria-invalid"));

// minSelect: one option flagged, second selection clears the whole group.
topicBoxes()[1].checked = false;
fire(topicBoxes()[0], "change");
submit(form);
check("minSelect under the floor", await until(() => input(form, "topics").hasAttribute("aria-invalid")));
topicBoxes()[1].checked = true;
fire(topicBoxes()[1], "change");
check("second selection clears the group error", !input(form, "topics").hasAttribute("aria-invalid"));

// everything fixed → submit succeeds.
submit(form);
check("rule-expansion form submits", await until(() => !find(form, ".rf-status")!.hidden));

/* ---- 2d. file upload rules: maxSize / allowedTypes / count bounds ---- */

const fileSpec = jsonSpec(
  [
    {
      type: "file",
      id: "attachments",
      name: "attachments",
      label: "Attachments",
      multiple: true,
      maxSize: "2MB",
      allowedTypes: ["image/png", "image/jpeg"],
      minFiles: 1,
      maxFiles: 3,
    },
  ],
  { name: "engine-file-rules" },
);
form = mount(renderFormShell({ form: fileSpec }));
attachForm(form);

// Real File objects (happy-dom) with the descriptor's size baked into the
// content; the list gets an item() shim for FormData walks.
const fileInput = () => input(form, "attachments");
const setFiles = (...files: File[]) => {
  const list = [...files] as unknown as FileList & { item(i: number): File | null };
  list.item = (i: number) => list[i] ?? null;
  Object.defineProperty(fileInput(), "files", { value: list, configurable: true });
};
const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

submit(form);
check("minFiles>0 empty selection fails required", await until(() => errorCount(form) === 1), `errors=${errorCount(form)}`);
check(
  "empty file message default",
  find(form, ".rf-field-error")!.textContent === "Please attach a file.",
);

setFiles(file("a.png", "image/png", 1024), file("b.jpg", "image/jpeg", 512));
submit(form);
check("valid attachments submit", await until(() => !find(form, ".rf-status")!.hidden));

setFiles(file("big.jpg", "image/jpeg", 3 * 1024 * 1024));
submit(form);
check("file over maxSize flags", await until(() => errorCount(form) === 1 && fileInput().hasAttribute("aria-invalid")));
check(
  "fileSize message names the limit",
  find(form, ".rf-field-error")!.textContent === "File is too large (max 2MB).",
);

setFiles(file("a.png", "image/png", 1024), file("b.jpg", "image/jpeg", 512), file("c.png", "image/png", 256), file("d.jpg", "image/jpeg", 128));
submit(form);
check("file count over maxFiles flags", await until(() => errorCount(form) === 1));
check(
  "fileCount message uses the bounds",
  find(form, ".rf-field-error")!.textContent === "Attach between 1 and 3 files.",
);

setFiles(file("malware.exe", "application/x-msdownload", 128));
submit(form);
check("file type outside allowedTypes flags", await until(() => errorCount(form) === 1));
check(
  "fileType message default",
  find(form, ".rf-field-error")!.textContent === "This file type isn't allowed.",
);

// once flagged, a change to an allowed set clears the error live
setFiles(file("ok.png", "image/png", 1024));
fire(fileInput(), "change");
check("allowed files clear the flagged field", !fileInput().hasAttribute("aria-invalid"));

/* ---- 3. wizard: step scoping, Next validation, final submit ---- */

const wizSpec = jsonSpec(
  [
    { type: "step", label: "Contact" },
    { type: "text", id: "name", name: "name", label: "Name", required: true },
    { type: "step", label: "Project" },
    { type: "select", id: "budget", name: "budget", label: "Budget", options: ["Small"] },
    { type: "step", label: "Details", submit: "Send enquiry" },
    { type: "textarea", id: "msg", name: "msg", label: "Message", required: true },
  ],
  { name: "engine-wizard" },
);

form = mount(renderFormShell({ form: wizSpec }));
attachForm(form);

const pane = (i: number) => form.querySelector<HTMLElement>(`[data-pane="${i}"]`) as HTMLElement;
check("starts on pane 0", !pane(0).hidden && pane(1).hidden);
check("Next label until final step", find(form, "[data-next-label]")!.textContent === "Next");
check("Back hidden on step 0", !!find(form, "[data-step-back]")!.hidden);

submit(form);
check("Next validates its own step only", await until(() => errorCount(form) === 1), `errors=${errorCount(form)}`);
check("blocked on pane 0", !pane(0).hidden && pane(1).hidden);

input(form, "name").value = "Jane";
fire(input(form, "name"), "input");
submit(form);
await until(() => !pane(1).hidden);
check("advanced to pane 1", !pane(1).hidden && pane(0).hidden);
check("step 0 marked done", find(form, `[data-step="0"]`)!.classList.contains("rf-step--done"));
check("Back now visible", !find(form, "[data-step-back]")!.hidden);

// Back jumps without validation; Name is filled so no loss anyway.
fire(find(form, "[data-step-back]")!, "click");
check("Back returns to pane 0", !pane(0).hidden);

// forward again, then on to the final step
input(form, "name").value = "Jane";
submit(form);
await until(() => !pane(1).hidden);
submit(form);
await until(() => !pane(2).hidden);
check("final pane visible", !pane(2).hidden);
check("final button carries the last marker's submit label", find(form, "[data-next-label]")!.textContent === "Send enquiry");

input(form, "msg").value = "a detailed brief";
submit(form);
check("final submit succeeds", await until(() => !find(form, ".rf-status")!.hidden));
check(
  "wizard submit carries every step's fields",
  calls[calls.length - 1].data.name === "Jane" && calls[calls.length - 1].data.msg === "a detailed brief",
);

// completed steps clickable jump-back
const jump0 = form.querySelector<HTMLButtonElement>('[data-step-jump="0"]');
check("completed step clickable", !!jump0 && !jump0.disabled);

/* ---- 4. honeypot: pretend success, nothing sent ---- */

const honeypotSpec = jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-hp" });
form = mount(renderFormShell({ form: honeypotSpec }));
attachForm(form);
const prevCalls = calls.length;
const honeypot = find(form, "[data-honeypot]") as HTMLInputElement;
honeypot.value = "robot";
fire(honeypot, "input");
submit(form);
check(
  "honeypot shows success without hitting the mailer",
  (await until(() => !find(form, ".rf-status")!.hidden)) && calls.length === prevCalls,
);

/* ---- 5. detach (StrictMode safety): idempotent, no double wiring ---- */

form = mount(renderFormShell({ form: errSpec }));
const detach = attachForm(form);
detach();
detach(); // idempotent
const before = calls.length;
submit(form);
await tick();
check("detached form no longer submits", calls.length === before && errorCount(form) === 0);

attachForm(form);
submit(form);
await until(() => errorCount(form) === 3);
check("re-attached form works", errorCount(form) === 3, `errors=${errorCount(form)}`);

/* ---- 6. statusMode "replace" collapses the form ---- */

const replaceSpec = jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], {
  name: "engine-replace",
  statusMode: "replace",
});
form = mount(renderFormShell({ form: replaceSpec }));
attachForm(form);
submit(form);
check("replace mode collapses to success box", await until(() => form.classList.contains("rf-form--success")));

/* ---- 7. initForms wires every form on a page ---- */

document.body.innerHTML = '<div id="root"></div>';
const a = document.createElement("div");
const b = document.createElement("div");
root()!.append(a, b);
const specA = jsonSpec([{ type: "email", id: "e1", name: "e1", label: "E1" }], { name: "multi-a" });
const specB = jsonSpec([{ type: "email", id: "e2", name: "e2", label: "E2" }], { name: "multi-b" });
a.innerHTML = renderFormShell({ form: specA });
b.innerHTML = renderFormShell({ form: specB });
const detachAll = initForms();
const fa = a.querySelector<HTMLFormElement>("form")!;
const fb = b.querySelector<HTMLFormElement>("form")!;
const callsBefore = calls.length;
submit(fa);
submit(fb);
check(
  "initForms wires both forms — both submitted",
  (await until(() => !find(fa, ".rf-status")!.hidden && !find(fb, ".rf-status")!.hidden)) &&
    calls.length === callsBefore + 2,
  `calls=${calls.length} before=${callsBefore}`,
);
check(
  "each form's payload is scoped to its own fields",
  calls[calls.length - 2].data.e1 === "" && calls[calls.length - 1].data.e2 === "",
  JSON.stringify(calls.slice(-2)),
);
detachAll();

/* ---- 8. renderForm (vanilla entry): mounts, wires, detaches, overrides ---- */

const { renderForm } = await import("../src/runtime/render");

document.body.innerHTML = '<div id="root"></div>';
const rendRoot = root()!;
const rspec = jsonSpec(
  [{ type: "text", id: "a", name: "a", label: "A", required: true }],
  { name: "rendered" },
);
const mounted = renderForm(rendRoot, rspec);
const rform = mounted.form;
check(
  "renderForm appends a real <form data-mail-form> and returns it",
  rform instanceof HTMLFormElement && rform.getAttribute("data-mail-form") === "rendered",
);
submit(rform);
check(
  "renderForm-wired form validates (engine attached)",
  await until(() => errorCount(rform) === 1),
  `errors=${errorCount(rform)}`,
);
mounted.detach();
const callsBeforeDetach = calls.length;
submit(rform);
await tick();
check(
  "detaching renderForm unwires the engine",
  calls.length === callsBeforeDetach && errorCount(rform) === 0,
);

// config.endpoint override wins over the spec's own endpoint
const callsBeforeOverride = calls.length;
const specWithEndpoint = jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], {
  name: "rendered-ov",
  endpoint: "https://spec.test/own",
});
const m2 = renderForm(rendRoot, specWithEndpoint, { config: { endpoint: "https://config.test/override" } });
submit(m2.form);
check(
  "renderForm config.endpoint overrides the spec endpoint",
  (await until(() => calls.length === callsBeforeOverride + 1)) &&
    calls[calls.length - 1].url === "https://config.test/override",
  `url=${calls[calls.length - 1]?.url}`,
);

/* ---- 9. pluggable validation: custom provider swaps rules + messages ---- */

const { vanillaValidation } = await import("../src/core");

const providerSpec = jsonSpec([
  { type: "text", id: "a", name: "a", label: "A", required: true },
  { type: "email", id: "b", name: "b", label: "B", required: true },
]);

/** Provider that overrides messages and formats through the seam. */
const customProvider = {
  ...vanillaValidation,
  buildRules(fields: Parameters<typeof vanillaValidation.buildRules>[0], copy?: Parameters<typeof vanillaValidation.buildRules>[1]) {
    const rules = vanillaValidation.buildRules(fields, copy);
    // Static message override.
    if (rules.a) rules.a.message = "CUSTOM REQUIRED MSG";
    // Per-value message + a max-length test instead of email format.
    if (rules.b) {
      rules.b.test = (value) => value.length <= 5;
      rules.b.message = (value: string) => `B too long (${value.length})`;
    }
    return rules;
  },
};

/** Error text scoped to one field's wrapper (DOM order is not indexed). */
const fieldError = (form: HTMLFormElement, name: string): string =>
  form.querySelector<HTMLElement>(`[name="${name}"]`)?.closest(".rf-field")?.querySelector(".rf-field-error")?.textContent ?? "";

// (a) attachForm({ validation }) — provider messages reach the DOM.
document.body.innerHTML = '<div id="root"></div>';
const pform = mount(renderFormShell({ form: providerSpec }));
attachForm(pform, { validation: customProvider });
submit(pform);
await until(() => errorCount(pform) === 2);
check(
  "attachForm validation: custom static message shown for empty field",
  fieldError(pform, "a") === "CUSTOM REQUIRED MSG",
  `got=${fieldError(pform, "a")}`,
);

// (b) per-value message resolves against the current value.
input(pform, "a").value = "Sam";
input(pform, "b").value = "123456";
submit(pform);
await until(() => fieldError(pform, "b") === "B too long (6)");
check(
  "attachForm validation: function message evaluated per value",
  fieldError(pform, "b") === "B too long (6)",
  `got=${fieldError(pform, "b")}`,
);
check(
  "attachForm validation: filled valid field clears",
  fieldError(pform, "a") === "",
  `got=${fieldError(pform, "a")}`,
);

// (c) renderForm({ validation }) forwards the provider to the engine.
const m4 = renderForm(root()!, providerSpec, { validation: customProvider });
input(m4.form, "a").value = "Sam";
input(m4.form, "b").value = "123456";
submit(m4.form);
check(
  "renderForm validation: provider rules apply to rendered form",
  (await until(() => fieldError(m4.form, "b") === "B too long (6)")) &&
    errorCount(m4.form) === 1 &&
    fieldError(m4.form, "a") === "",
  `b=${fieldError(m4.form, "b")} a=${fieldError(m4.form, "a")} count=${errorCount(m4.form)}`,
);
m4.detach();

// (d) no provider → still the vanilla defaults (no regression).
document.body.innerHTML = '<div id="root"></div>';
const vform = mount(renderFormShell({ form: providerSpec }));
attachForm(vform);
submit(vform);
await until(() => errorCount(vform) === 2);
check(
  "default validation unchanged without a provider",
  fieldError(vform, "a") !== "CUSTOM REQUIRED MSG" && fieldError(vform, "b") !== "B too long (0)",
  `a=${fieldError(vform, "a")}`,
);

/* ---- 9. Repeaters (dynamic row groups) ---- */

const repeaterSpec = jsonSpec([
  {
    type: "repeater",
    id: "members",
    name: "members",
    label: "Team members",
    minRows: 1,
    maxRows: 3,
    message: "Need at least one member.",
    fields: [
      { type: "text", id: "member_name", name: "member_name", label: "Name", required: true },
      { type: "email", id: "member_email", name: "member_email", label: "Email", required: true },
    ],
  },
]);

const repform = mount(renderFormShell({ form: repeaterSpec }));
const detachR = attachForm(repform);
const rows = () => Array.from(repform.querySelectorAll<HTMLElement>("[data-repeater-row]"));
const addBtn = () => repform.querySelector<HTMLButtonElement>("[data-add-row]");
const removeBtns = () => Array.from(repform.querySelectorAll<HTMLButtonElement>("[data-remove-row]"));
const rowInput = (row: HTMLElement, name: string) =>
  row.querySelector<HTMLInputElement>(`[name="${name}"]`);

check("repeater renders the starter rows (max(1, minRows))", rows().length === 1, String(rows().length));
check("remove button disabled at minRows", removeBtns()[0]?.disabled === true);
check("add button enabled under maxRows", addBtn()?.disabled === false);

// Row-scoped validation: only the flagged row's controls show errors.
rowInput(rows()[0], "member_name")!.value = "Jane";
rowInput(rows()[0], "member_email")!.value = "jane@example.com";
addBtn()!.click();
await tick();
check("add clones another row", rows().length === 2, String(rows().length));
check("clone re-indexes ids (-row1__)", rows()[1].querySelector("[id$='-row1__member_name']") !== null, rows()[1].outerHTML.slice(0, 200));
const sentinels = Array.from(repform.querySelectorAll<HTMLInputElement>("[data-repeater-sentinel]"));
check("clone re-indexes its sentinel value", sentinels[1]?.value === "1", `sentinels=${sentinels.map((s) => s.value).join(",")}`);
check(
  "clone starts empty (no copying from the template row)",
  rowInput(rows()[1], "member_name")!.value === "" && rowInput(rows()[1], "member_email")!.value === "",
);

// Empty second row blocks submit — and only row 1 gets flagged.
submit(repform);
await until(() => errorCount(repform) === 1);
check(
  "row-scoped validation flags only the empty row's field",
  rows()[1].querySelector(".rf-field-error") !== null && rows()[0].querySelector(".rf-field-error") === null,
  `errors=${errorCount(repform)}`,
);

// Fill row 1 and succeed — the mailer receives the rows as a JSON array.
rowInput(rows()[1], "member_name")!.value = "Joe";
rowInput(rows()[1], "member_email")!.value = "joe@example.com";
const beforeSubmit = calls.length;
submit(repform);
const submitted = await until(() => calls.length === beforeSubmit + 1);
check(
  "valid row set submits",
  submitted && (await until(() => !find(repform, ".rf-status")!.hidden)) && !find(repform, ".rf-status")!.hidden,
);
const reppayload = calls[calls.length - 1].data;
const membersRows = Array.isArray(reppayload.members) ? reppayload.members : JSON.parse(String(reppayload.members ?? "[]"));
check(
  "canonical payload carries the rows as a JSON array",
  membersRows.length === 2 && membersRows[0].member_name === "Jane" && membersRows[1].member_name === "Joe",
  JSON.stringify(reppayload),
);
check("row array omits the honeypot", !("website" in reppayload), JSON.stringify(reppayload));

// Bounds: add disables at maxRows, remove re-disables at minRows.
addBtn()!.click();
check("add up to maxRows", rows().length === 3, String(rows().length));
check("add disabled at maxRows", addBtn()?.disabled === true);
addBtn()!.click();
check("add does nothing past maxRows", rows().length === 3, String(rows().length));
removeBtns()[0]!.click();
check("remove a row above minRows", rows().length === 2, String(rows().length));
removeBtns()[0]!.click();
removeBtns()[0]!.click();
check("remove down to minRows", rows().length === 1, String(rows().length));
check("remove disabled at minRows again", removeBtns()[0]?.disabled === true);
removeBtns()[0]!.click();
check("remove does nothing below minRows", rows().length === 1, String(rows().length));

// Defence-in-depth: a DOM-level removal (bypassing the disabled button) still
// cannot submit below minRows — the block error names the spec message.
rows()[0]!.remove();
submit(repform);
await until(() => find(repform, ".rf-repeater-error") !== null);
check(
  "submit below minRows shows the repeater block error",
  find(repform, ".rf-repeater-error")?.textContent?.trim() === "Need at least one member.",
  `got=${find(repform, ".rf-repeater-error")?.textContent}`,
);
detachR();

/* ---- 9b. Conditional repeaters (showWhen row groups) ---- */

const condRepeaterSpec = jsonSpec([
  { type: "checkbox", id: "need_team", name: "need_team", label: "Add a team section" },
  {
    type: "repeater",
    id: "team",
    name: "team",
    showWhen: { field: "need_team", operator: "filled" },
    fields: [{ type: "text", name: "member", label: "Member", required: true }],
  },
]);

const cform = mount(renderFormShell({ form: condRepeaterSpec }));
attachForm(cform);
const teamFieldset = find<HTMLElement>(cform, '[data-repeater="team"]')!;
check("conditional repeater starts hidden", teamFieldset.hidden === true);
input(cform, "need_team")!.checked = true;
fire(input(cform, "need_team"), "change");
check("conditional repeater reveals when the condition holds", teamFieldset.hidden === false);

// With the repeater hidden, its rows neither validate nor submit.
const cform2 = mount(renderFormShell({ form: condRepeaterSpec }));
attachForm(cform2);
const beforeHidden = calls.length;
submit(cform2);
const hiddenSubmit = await until(() => calls.length === beforeHidden + 1);
const hiddenPayload = calls[calls.length - 1]?.data ?? {};
check(
  "hidden repeater rows are excluded from validation and payload",
  hiddenSubmit &&
    !("team" in hiddenPayload) &&
    !find(cform2, ".rf-repeater-error") &&
    !find(cform2, ".rf-field-error"),
  JSON.stringify(hiddenPayload),
);

console.log(failures === 0 ? "\nENGINE ALL PASS" : `\nENGINE ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);