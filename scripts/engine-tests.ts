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

console.log(failures === 0 ? "\nENGINE ALL PASS" : `\nENGINE ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);