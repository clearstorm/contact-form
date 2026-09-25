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
const getCheckboxValues = (form: HTMLFormElement, name: string) =>
  [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)]
    .filter((c) => c.checked)
    .map((c) => c.value)
    .sort()
    .join();

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
const attachedA = attachForm(form);
attachedA.detach();
attachedA.detach(); // idempotent
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
const repeaterAttached = attachForm(repform);
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
repeaterAttached.detach();

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

/* ---- 10. M5: the `rf:*` event bus + lifecycle hooks ---- */

// A collector that records a CustomEvent as a compact string.
const recordInto = (bucket: string[]) => (elem: CustomEvent) =>
  bucket.push(`${elem.type}:${JSON.stringify(elem.detail)}`);

/* 10a. rf:submit-* on a successful submit, then detach kills the bus. */
const busSubmit = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-submit" }) }),
);
const attachedSubmit = attachForm(busSubmit);
const submitEvents: string[] = [];
attachedSubmit.on("rf:submit-start", recordInto(submitEvents));
attachedSubmit.on("rf:submit-success", recordInto(submitEvents));
attachedSubmit.on("rf:submit-error", recordInto(submitEvents));
const callsBeforeSubmit = calls.length;
submit(busSubmit);
check("valid submit reaches the mailer", await until(() => calls.length === callsBeforeSubmit + 1));
const typeOf = (e: string) => /^rf:[a-z-]+/.exec(e)?.[0] ?? "";
const submitLifecycle = () => submitEvents.map(typeOf);
check(
  "rf:submit-start then rf:submit-success, in order, with the form identity",
  (await until(() => submitLifecycle().join(",") === "rf:submit-start,rf:submit-success")) &&
    submitEvents[0].includes('"name":"engine-bus-submit"'),
  submitEvents.join(" | "),
);
attachedSubmit.detach();
submitEvents.length = 0;
submit(busSubmit);
await tick();
check("detach removes bus subscriptions (no more events)", submitEvents.length === 0, submitEvents.join(" | "));

/* 10b. rf:submit-error on a failed mailer. */
const busFail = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-fail", endpoint: "https://example.test/fail" }) }),
);
const attachedFail = attachForm(busFail);
const failEvents: string[] = [];
attachedFail.on("rf:submit-start", recordInto(failEvents));
attachedFail.on("rf:submit-error", recordInto(failEvents));
attachedFail.on("rf:submit-success", () => failEvents.push("rf:submit-success"));
const failLifecycle = () => failEvents.map(typeOf);
submit(busFail);
check(
  "failed submit fires rf:submit-start then rf:submit-error (never success)",
  await until(() => failLifecycle().join(",") === "rf:submit-start,rf:submit-error"),
  failEvents.join(","),
);

/* 10c. native addEventListener sees the same events (bus parity). */
const busNative = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-native" }) }),
);
attachForm(busNative);
const nativeEvents: string[] = [];
busNative.addEventListener("rf:submit-start", () => nativeEvents.push("native-start"));
const callsBeforeNative = calls.length;
submit(busNative);
check(
  "native addEventListener receives rf: events",
  await until(() => calls.length === callsBeforeNative + 1) && nativeEvents.length === 1,
  nativeEvents.join(","),
);

/* 10d. rf:fields-change on control interaction. */
const busFields = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-fields" }) }),
);
const attachedFields = attachForm(busFields);
const fieldEvents: Array<{ name: string; value: string }> = [];
attachedFields.on("rf:fields-change", (e) => fieldEvents.push(e.detail as { name: string; value: string }));
input(busFields, "a").value = "hello";
fire(input(busFields, "a"), "input");
check(
  "rf:fields-change carries the control's name + value",
  fieldEvents.length >= 1 && fieldEvents.at(-1)?.name === "a" && fieldEvents.at(-1)?.value === "hello",
  JSON.stringify(fieldEvents),
);

/* 10e. rf:row-add / rf:row-remove with live counts. */
const busRows = mount(
  renderFormShell({
    form: jsonSpec(
      [
        {
          type: "repeater",
          id: "links",
          name: "links",
          fields: [{ type: "url", id: "url", name: "url", label: "Link" }],
        },
      ],
      { name: "engine-bus-rows" },
    ),
  }),
);
const attachedRows = attachForm(busRows);
const rowEvents: Array<{ type: string; count: number }> = [];
attachedRows.on("rf:row-add", (e) => rowEvents.push({ type: e.type, count: (e.detail as { count: number }).count }));
attachedRows.on("rf:row-remove", (e) => rowEvents.push({ type: e.type, count: (e.detail as { count: number }).count }));
find<HTMLButtonElement>(busRows, "[data-add-row]")!.click();
await tick();
find<HTMLButtonElement>(busRows, "[data-remove-row]")!.click();
await tick();
check(
  "row add/remove emit rf:row-add and rf:row-remove with live counts",
  rowEvents.map((r) => `${r.type}:${r.count}`).join(",") === "rf:row-add:2,rf:row-remove:1",
  JSON.stringify(rowEvents),
);

/* 10f. wizard: rf:step-change + beforeValidateStep veto + afterStepChange. */
const busWiz = jsonSpec(
  [
    { type: "step", label: "Step 1" },
    { type: "text", id: "bus_name", name: "bus_name", label: "Name", required: true },
    { type: "step", label: "Step 2" },
    { type: "email", id: "bus_email", name: "bus_email", label: "Email" },
  ],
  { name: "engine-bus-wizard" },
);
const busWizForm = mount(renderFormShell({ form: busWiz }));
const stepCalls: number[] = [];
let stepVeto = false;
const wizEvents: string[] = [];
const attachedWiz = attachForm(busWizForm, {
  hooks: {
    beforeValidateStep: (ctx) => {
      stepCalls.push(ctx.from);
      return stepVeto ? false : true;
    },
    afterStepChange: (ctx) => wizEvents.push(`after:${ctx.from}->${ctx.to}`),
  },
});
attachedWiz.on("rf:step-change", (e) => {
  const { from, to } = e.detail as { from: number; to: number };
  wizEvents.push(`event:${from}->${to}`);
});
const wizPane = (i: number) => busWizForm.querySelector<HTMLElement>(`[data-pane="${i}"]`) as HTMLElement;
check("wizard starts on pane 0", !wizPane(0).hidden && wizPane(1).hidden);
input(busWizForm, "bus_name").value = "Jane";
stepVeto = true;
submit(busWizForm);
await tick();
check("beforeValidateStep veto cancels the advance", wizPane(1).hidden && wizEvents.length === 0, wizEvents.join(","));
stepVeto = false;
submit(busWizForm);
await until(() => !wizPane(1).hidden);
check(
  "rf:step-change then afterStepChange fire once, from->to = 0->1",
  wizEvents.join(",") === "event:0->1,after:0->1",
  wizEvents.join(","),
);
check("beforeValidateStep ran on each Next path", stepCalls.join(",") === "0,0", stepCalls.join(","));

/* 10g. beforeSubmit veto cancels the submission (no mailer, no rf:submit-start). */
let submitVeto = false;
const afterResults: Array<{ ok: boolean; message: string }> = [];
const busVeto = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-veto" }) }),
);
const attachedVeto = attachForm(busVeto, {
  hooks: {
    beforeSubmit: () => (submitVeto ? false : undefined),
    afterSubmit: (ctx) => afterResults.push({ ok: ctx.ok, message: ctx.message }),
  },
});
const vetoEvents: string[] = [];
attachedVeto.on("rf:submit-start", () => vetoEvents.push("rf:submit-start"));
attachedVeto.on("rf:submit-success", () => vetoEvents.push("rf:submit-success"));
const callsBeforeVeto = calls.length;
submitVeto = true;
submit(busVeto);
await tick();
check(
  "beforeSubmit veto cancels submission (no start event, mailer untouched)",
  vetoEvents.length === 0 && calls.length === callsBeforeVeto,
  `${vetoEvents.join(",")} calls=${calls.length - callsBeforeVeto}`,
);
submitVeto = false;
submit(busVeto);
check(
  "non-vetoed submit fires rf:submit-start then rf:submit-success",
  await until(() => vetoEvents.join(",") === "rf:submit-start,rf:submit-success"),
  vetoEvents.join(","),
);
check(
  "afterSubmit ran with ok=true and the success message",
  afterResults.length === 1 && afterResults[0].ok === true && afterResults[0].message === "Thanks!",
  JSON.stringify(afterResults),
);

/* 10h. spec hook-ref names resolve via the options registry; inline wins. */
const namedSpec = {
  ...jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-named" }),
  hooks: { beforeSubmit: "trackLead" },
};
const namedCalls: string[] = [];
const busNamed = mount(renderFormShell({ form: namedSpec }));
const attachedNamed = attachForm(busNamed, {
  spec: namedSpec,
  hooks: { trackLead: () => { namedCalls.push("named"); return true; } },
});
submit(busNamed);
check(
  "a spec-named hook fires through the options registry",
  await until(() => namedCalls.length === 1),
  namedCalls.join(","),
);
const inlineCalls: string[] = [];
const busInline = mount(renderFormShell({ form: namedSpec }));
attachForm(busInline, {
  spec: namedSpec,
  hooks: {
    trackLead: () => { inlineCalls.push("named"); return true; },
    beforeSubmit: () => { inlineCalls.push("inline"); return true; },
  },
});
submit(busInline);
check(
  "inline hook beats the spec's named reference",
  await until(() => inlineCalls.join(",") === "inline"),
  inlineCalls.join(","),
);

/* 10i. hooks never fire without being supplied (no-op, but events still fire). */
const noHookCalls: string[] = [];
const busNoHooks = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-bus-nohooks" }) }),
);
const attachedNoHooks = attachForm(busNoHooks);
attachedNoHooks.on("rf:submit-start", () => noHookCalls.push("start"));
const callsBeforeNoHooks = calls.length;
submit(busNoHooks);
check(
  "absent hooks never throw and the bus still fires",
  await until(() => callsBeforeNoHooks === calls.length || calls.length === callsBeforeNoHooks + 1) &&
    noHookCalls.length === 1,
  `${noHookCalls.join(",")}`,
);

/* ---- 11. M6: analytics seam + deprecation cleanup ---- */

const { createAnalytics } = await import("../src/runtime/analytics");

/* 11a. createAnalytics forwards the rf:* bus to a consumer adapter. */
const tracked: Array<{ event: string; detail: Record<string, unknown> }> = [];
const analytics = createAnalytics({
  adapter: { track: (event, detail) => tracked.push({ event, detail }) },
});
const aform = mount(
  renderFormShell({ form: jsonSpec([{ type: "text", id: "a", name: "a", label: "A" }], { name: "engine-m6-analytics" }) }),
);
attachForm(aform); // the engine emits; the seam only forwards
const analyticsSub = analytics.attach(aform);
submit(aform);
check(
  "analytics receives rf:submit-start with the form identity",
  await until(() => tracked.some((t) => t.event === "rf:submit-start")) &&
    tracked.find((t) => t.event === "rf:submit-start")?.detail?.name === "engine-m6-analytics",
  JSON.stringify(tracked),
);
check(
  "analytics receives rf:submit-success on a valid submit",
  await until(() => tracked.some((t) => t.event === "rf:submit-success")),
  JSON.stringify(tracked),
);
input(aform, "a").value = "hi";
fire(input(aform, "a"), "input");
check(
  "analytics receives rf:fields-change with the control value",
  tracked.some((t) => t.event === "rf:fields-change" && (t.detail as { value?: string }).value === "hi"),
  JSON.stringify(tracked),
);
analyticsSub.detach();
const trackedAfterDetach = tracked.length;
input(aform, "a").value = "bye";
fire(input(aform, "a"), "input");
submit(aform);
await tick();
check("analytics detach stops the feed", tracked.length === trackedAfterDetach, `tracked=${tracked.length}`);

/* 11b. legacy copy.back / copy.next no longer leak through the engine. */
const legacyNextWiz = {
  ...jsonSpec(
    [
      { type: "step", label: "Step 1" },
      { type: "text", id: "legacy_name", name: "legacy_name", label: "Name" },
      { type: "step", label: "Step 2" },
    ],
    { name: "engine-m6-copynext" },
  ),
  copy: { next: "Legacy Continue", back: "Legacy Back" },
};
const legacyForm = mount(renderFormShell({ form: legacyNextWiz }));
attachForm(legacyForm);
check(
  "legacy copy labels no longer drive the rendered wizard buttons",
  legacyForm.querySelector("[data-next-label]")?.textContent === "Next" &&
    legacyForm.querySelector("[data-step-back]")?.textContent?.includes("Back") === true,
  legacyForm.querySelector("[data-step-next]")?.textContent ?? "",
);
input(legacyForm, "legacy_name").value = "Jane";
submit(legacyForm);
await until(() => !legacyForm.querySelector<HTMLElement>(`[data-pane="1"]`)!.hidden);
check(
  "the final pane's button carries the submit label, never legacy copy",
  legacyForm.querySelector("[data-next-label]")?.textContent === "Send",
  String(legacyForm.querySelector("[data-next-label]")?.textContent),
);

/* ---- 12. M7: conditional steps + draft persistence + values prefill ---- */

// 12a. Conditional wizard steps (`showWhen` on markers): skipped panes are
// never validated, travelled or navigated; authored indices + visible totals.
const condStepSpec = jsonSpec(
  [
    { type: "select", id: "account", name: "account", label: "Account", options: ["Personal", "Business"] },
    { type: "step", label: "Contact" },
    { type: "text", id: "name", name: "name", label: "Name", required: true },
    {
      type: "step",
      label: "Company",
      showWhen: { field: "account", operator: "equals", value: "Business" },
    },
    { type: "text", id: "company", name: "company", label: "Company name", required: true },
    {
      type: "step",
      label: "Details",
      submit: "Send enquiry",
      showWhen: [
        { field: "account", operator: "equals", value: "Business" },
        { field: "company", operator: "filled" },
      ],
    },
    { type: "textarea", id: "msg", name: "msg", label: "Message", required: true },
  ],
  { name: "engine-m7-steps" },
);

form = mount(renderFormShell({ form: condStepSpec }));
const condAttached = attachForm(form);
const stepEvents: Array<{ from: number; to: number; total: number }> = [];
condAttached.on("rf:step-change", (e) => stepEvents.push((e as CustomEvent).detail));

const pane7 = (i: number) => form.querySelector<HTMLElement>(`[data-pane="${i}"]`) as HTMLElement;
const chip7 = (i: number) => form.querySelector<HTMLElement>(`[data-step="${i}"]`) as HTMLElement;
const lastStepEvent = () => stepEvents[stepEvents.length - 1];

// Account defaults to "Personal" → both conditional panes are skipped at attach.
check(
  "conditional panes are skipped when their conditions don't hold",
  pane7(1).hasAttribute("data-step-skipped") && pane7(1).hidden && pane7(2).hasAttribute("data-step-skipped"),
);
check(
  "skipped chips carry rf-step--skipped, never aria-current",
  chip7(1).classList.contains("rf-step--skipped") && !chip7(1).hasAttribute("aria-current") &&
    !chip7(1).classList.contains("rf-step--done"),
);
check(
  "skipped jump chips stay disabled",
  (form.querySelector('[data-step-jump="1"]') as HTMLButtonElement).disabled,
);
check(
  "a sole visible step is already the final step (submit label)",
  find(form, "[data-next-label]")!.textContent === "Send enquiry",
);
check("starts on the first visible step", !pane7(0).hidden && pane7(1).hidden && pane7(2).hidden);

// Re-reveal: Business reveals the Company pane (Details still needs company).
input(form, "account").value = "Business";
fire(input(form, "account"), "change");
check("revealed step loses its skip marker + chip state", !pane7(1).hasAttribute("data-step-skipped") && !chip7(1).classList.contains("rf-step--skipped"));
check("dependent step stays skipped until its own condition holds", pane7(2).hasAttribute("data-step-skipped"));
check("label resets to Next once a later step is visible", find(form, "[data-next-label]")!.textContent === "Next");

// Advance to the revealed Company pane; skipped Details stays out of scope.
input(form, "name").value = "Jane";
fire(input(form, "name"), "input");
submit(form);
await until(() => !pane7(1).hidden);
check("Next lands on the revealed Company pane", !pane7(1).hidden && pane7(0).hidden);
check(
  "step-change reports authored indices + visible total (2 visible)",
  lastStepEvent()?.from === 0 && lastStepEvent()?.to === 1 && lastStepEvent()?.total === 2,
  JSON.stringify(stepEvents),
);
check("a skipped step's required field can't block the advance", errorCount(form) === 0, `errors=${errorCount(form)}`);

// Filling company reveals Details; advancing there adds it to the sequence.
input(form, "company").value = "Acme";
fire(input(form, "company"), "input");
check("Details reveals once company is filled", !pane7(2).hasAttribute("data-step-skipped"));
submit(form);
await until(() => !pane7(2).hidden);
check("advanced to the now-visible Details pane", !pane7(2).hidden && pane7(1).hidden);
check(
  "step-change total grows to 3 once every step is visible",
  lastStepEvent()?.from === 1 && lastStepEvent()?.to === 2 && lastStepEvent()?.total === 3,
  JSON.stringify(stepEvents),
);

// Back and forward again — a completed visible step stays a valid Back target,
// and the forward path re-validates what it crosses. Run BEFORE any successful
// submit: handleSubmit calls form.reset(), which would flip the account toggle
// back to "Personal" and re-skip the revealed panes underneath us.
fire(find(form, "[data-step-back]")!, "click");
check("Back returns to the previous visible step", !pane7(1).hidden && pane7(2).hidden && pane7(0).hidden);
submit(form);
await until(() => !pane7(2).hidden);
check("forward re-validates and returns to the now-visible Details pane", !pane7(2).hidden && pane7(1).hidden);

// The third step submits; the payload carries every visible step's fields.
input(form, "msg").value = "Full enquiry flow";
fire(input(form, "msg"), "input");
submit(form);
check("conditional wizard submits from its final visible step", await until(() => !find(form, ".rf-status")!.hidden));
check(
  "visible sequence travelled, skipped pane excluded",
  calls[calls.length - 1].data.name === "Jane" &&
    calls[calls.length - 1].data.company === "Acme" &&
    calls[calls.length - 1].data.msg === "Full enquiry flow" &&
    calls[calls.length - 1].data.account === "Business",
  JSON.stringify(calls[calls.length - 1].data),
);
condAttached.detach();

// Scenario B — collapsing the step the visitor stands on reflows the visible
// sequence, and the skipped panes' fields leave the payload. Fresh mount: the
// successful submit above reset the wizard (account back to "Personal"), which
// would taint this scenario's state.
form = mount(renderFormShell({ form: condStepSpec }));
const condB = attachForm(form);
const reflowEvents: Array<{ from: number; to: number; total: number }> = [];
condB.on("rf:step-change", (e) => reflowEvents.push((e as CustomEvent).detail));
// Reveal Company and advance to it…
input(form, "account").value = "Business";
fire(input(form, "account"), "change");
input(form, "name").value = "Jane";
fire(input(form, "name"), "input");
submit(form);
await until(() => !pane7(1).hidden);
// …then collapse the step the visitor stands on.
input(form, "account").value = "Personal";
fire(input(form, "account"), "change");
check(
  "a current step that becomes skipped reflows to the previous visible step",
  !pane7(0).hidden && pane7(1).hasAttribute("data-step-skipped") && pane7(1).hidden && pane7(2).hidden,
  `pane0.hidden=${pane7(0).hidden} pane1.skipped=${pane7(1).hasAttribute("data-step-skipped")}`,
);
check(
  "step-change reflow reports the collapsed visible sequence (total 1)",
  reflowEvents[reflowEvents.length - 1]?.from === 1 &&
    reflowEvents[reflowEvents.length - 1]?.to === 0 &&
    reflowEvents[reflowEvents.length - 1]?.total === 1,
  JSON.stringify(reflowEvents),
);
check("reflowed final step carries the submit label again", find(form, "[data-next-label]")!.textContent === "Send enquiry");
submit(form);
check("reflowed form submits with skipped-step fields out of the payload", await until(() => !find(form, ".rf-status")!.hidden));
check(
  "skipped-step fields never reach the payload",
  calls[calls.length - 1].data.name === "Jane" &&
    calls[calls.length - 1].data.account === "Personal" &&
    !("company" in calls[calls.length - 1].data) &&
    !("msg" in calls[calls.length - 1].data),
  JSON.stringify(calls[calls.length - 1].data),
);
condB.detach();

/* 12b. Runtime `values` prefill: scalars, groups, multi-selects, lone toggles. */
const prefillSpec = jsonSpec(
  [
    { type: "text", id: "pname", name: "pname", label: "Name" },
    { type: "email", id: "pemail", name: "pemail", label: "Email" },
    { type: "checkbox", id: "interest", name: "interest", label: "Topics", options: ["Design", "Dev", "Ops"] },
    { type: "radio", id: "tier", name: "tier", label: "Tier", options: ["Free", "Pro"] },
    { type: "select", id: "team", name: "team", label: "Team", multiple: true, options: ["A", "B", "C"] },
    { type: "checkbox", id: "consent", name: "consent", label: "I agree" },
  ],
  { name: "engine-m7-prefill" },
);
form = mount(renderFormShell({ form: prefillSpec }));
attachForm(form, {
  values: { pname: "Pre-filled", interest: ["Design", "Ops"], tier: "Pro", team: ["A", "C"], consent: "on" },
});
check("values prefills a scalar control", input(form, "pname").value === "Pre-filled");
check("values checks the listed checkbox members", getCheckboxValues(form, "interest") === "Design,Ops", getCheckboxValues(form, "interest"));
check("values checks a radio by value", getCheckboxValues(form, "tier") === "Pro");
const teamSel = find(form, 'select[name="team"]') as HTMLSelectElement;
check("values selects the listed multi-select options", [...teamSel.selectedOptions].map((o) => o.value).sort().join() === "A,C");
check("values checks a lone toggle with its default value", input(form, "consent").checked === true);
check("unlisted fields stay empty", input(form, "pemail").value === "");

/* 12c. autoSave drafts: debounced write, restore, step, override, clear. */
const autoSpec = jsonSpec(
  [
    { type: "step", label: "Contact" },
    { type: "text", id: "a_name", name: "a_name", label: "Name", required: true },
    { type: "step", label: "Details", submit: "Send" },
    { type: "textarea", id: "a_msg", name: "a_msg", label: "Message" },
  ],
  { name: "engine-m7-autosave", autoSave: true },
);
const autoKey = "rf:draft:engine-m7-autosave";
localStorage.removeItem(autoKey);

form = mount(renderFormShell({ form: autoSpec }));
attachForm(form);
input(form, "a_name").value = "Draft-first";
fire(input(form, "a_name"), "input");
fire(input(form, "a_name"), "change");
await new Promise((r) => setTimeout(r, 450));
const draftAfterType = JSON.parse(localStorage.getItem(autoKey) ?? "{}") as {
  v: number;
  savedAt: number;
  step?: number;
  values: Array<{ key: string; value: string | string[] }>;
};
check(
  "autoSave writes a versioned draft after a debounced change",
  draftAfterType.v === 1 && draftAfterType.values.some((v) => v.key === "a_name" && v.value === "Draft-first"),
  JSON.stringify(draftAfterType),
);

submit(form);
await until(() => !form.querySelector<HTMLElement>(`[data-pane="1"]`)!.hidden);
await new Promise((r) => setTimeout(r, 450));
check(
  "autoSave records the wizard step on transitions",
  (JSON.parse(localStorage.getItem(autoKey) ?? "{}") as { step?: number }).step === 1,
);

form = mount(renderFormShell({ form: autoSpec }));
attachForm(form);
check("draft restores a saved value on attach", input(form, "a_name").value === "Draft-first");
check("draft resumes the saved wizard step", !form.querySelector<HTMLElement>(`[data-pane="1"]`)!.hidden && form.querySelector<HTMLElement>(`[data-pane="0"]`)!.hidden);

form = mount(renderFormShell({ form: autoSpec }));
attachForm(form, { values: { a_name: "Explicit wins" } });
check("explicit values override a stored draft", input(form, "a_name").value === "Explicit wins");

// Clear on success: re-mount fresh, re-type, submit.
form = mount(renderFormShell({ form: autoSpec }));
attachForm(form);
input(form, "a_name").value = "Re-check";
fire(input(form, "a_name"), "input");
await new Promise((r) => setTimeout(r, 450));
check("draft is present before the clearing submit", localStorage.getItem(autoKey) !== null);
input(form, "a_msg").value = "Longer message here";
fire(input(form, "a_msg"), "input");
submit(form);
check("successful submit clears the draft", (await until(() => !find(form, ".rf-status")!.hidden)) && localStorage.getItem(autoKey) === null);

// Explicit string key + specless (initForms) path.
form = mount(renderFormShell({ form: { ...autoSpec, autoSave: "my-explicit-draft" } }));
attachForm(form);
input(form, "a_name").value = "Keyed";
fire(input(form, "a_name"), "input");
await new Promise((r) => setTimeout(r, 450));
check(
  "a string autoSave key is honoured verbatim",
  localStorage.getItem("my-explicit-draft") !== null && localStorage.getItem(autoKey) === null,
  `explicit=${localStorage.getItem("my-explicit-draft")} auto=${localStorage.getItem(autoKey)}`,
);
localStorage.removeItem("my-explicit-draft");

document.body.innerHTML = '<div id="root"></div>';
root()!.innerHTML = renderFormShell({ form: autoSpec });
initForms();
form = root()!.querySelector<HTMLFormElement>("form")!;
input(form, "a_name").value = "No-spec";
fire(input(form, "a_name"), "input");
await new Promise((r) => setTimeout(r, 450));
check("specless initForms still persists drafts via data-autosave", localStorage.getItem(autoKey) !== null);
localStorage.removeItem(autoKey);

/* 12d. Repeaters in drafts: row counts + row-correlated values survive. */
const autoRepSpec = jsonSpec(
  [
    {
      type: "repeater",
      id: "members",
      name: "members",
      label: "Members",
      minRows: 1,
      maxRows: 3,
      fields: [
        { type: "text", id: "member_name", name: "member_name", label: "Name", required: true, size: 50 },
        { type: "email", id: "member_email", name: "member_email", label: "Email", size: 50 },
      ],
    },
  ],
  { name: "engine-m7-autorep", autoSave: true },
);
const autoRepKey = "rf:draft:engine-m7-autorep";
localStorage.removeItem(autoRepKey);
form = mount(renderFormShell({ form: autoRepSpec }));
attachForm(form);
input(form, "member_name").value = "First";
fire(input(form, "member_name"), "input");
fire(form.querySelectorAll("[data-add-row]")[0] as HTMLElement, "click");
const repRows = form.querySelectorAll<HTMLElement>("[data-repeater-row]");
const row1Name = repRows[1].querySelector<HTMLInputElement>('[name="member_name"]')!;
row1Name.value = "Second";
fire(row1Name, "input");
await new Promise((r) => setTimeout(r, 450));
const repDraft = JSON.parse(localStorage.getItem(autoRepKey) ?? "{}") as {
  rows: Record<string, number>;
  values: Array<{ key: string; value: string | string[] }>;
};
check("draft captures repeater row counts", repDraft.rows?.members === 2, JSON.stringify(repDraft));
check(
  "draft captures row-correlated values",
  repDraft.values.some((v) => v.key === "members::0::member_name" && v.value === "First") &&
    repDraft.values.some((v) => v.key === "members::1::member_name" && v.value === "Second"),
  JSON.stringify(repDraft.values),
);

form = mount(renderFormShell({ form: autoRepSpec }));
attachForm(form);
check("draft re-creates repeater rows on restore", form.querySelectorAll("[data-repeater-row]").length === 2);
check(
  "draft fills each row's own values",
  [...form.querySelectorAll<HTMLInputElement>('[name="member_name"]')].map((c) => c.value).join() === "First,Second",
  JSON.stringify([...form.querySelectorAll<HTMLInputElement>('[name="member_name"]')].map((c) => c.value)),
);
localStorage.removeItem(autoRepKey);

console.log(failures === 0 ? "\nENGINE ALL PASS" : `\nENGINE ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);