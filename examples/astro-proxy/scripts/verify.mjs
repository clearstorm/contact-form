/**
 * Verify the Astro proxy route end to end with zero dependencies.
 *
 * Imports the real `../src/pages/api/contact.ts` via Node's native TS
 * type-stripping (Node ≥ 23.6; the route uses erasable-syntax only), stubs
 * `globalThis.fetch`, isolates `process.env` per case and drives
 * `POST({ request })` exactly as Astro would.
 *
 * Usage: `npm run verify` (runs `node scripts/verify.mjs` from this folder).
 */
import assert from "node:assert/strict";
import { POST } from "../src/pages/api/contact.ts";

const realFetch = globalThis.fetch;

/** Run fn with `env` as the whole `process.env`, restoring the old one after. */
async function withEnv(env, fn) {
  const backup = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, backup);
  }
}

/**
 * Drive a POST envelope through the real route with a stubbed fetch.
 * `onFetch({ url, init })` returns the `Response` the route should see.
 */
async function send(body, onFetch = () => new Response("{}", { status: 200 }), headers = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const entry = { url: String(url), init };
    calls.push(entry);
    return onFetch(entry);
  };
  try {
    const request = new Request("https://example.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await POST({ request });
    const jsonText = await res.json();
    return { status: res.status, body: jsonText, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const sendWithEnv = (env, body, onFetch, headers) => withEnv(env, () => send(body, onFetch, headers));

const failed = [];
let passed = 0;

async function expect(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed.push(`${name}: ${err.message}`);
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

console.log("transport-proxy verify — driving the real Astro route\n");

await expect("400 — missing provider", async () => {
  const { status, body, calls } = await sendWithEnv({}, { formId: "z10" });
  assert.equal(status, 400);
  assert.match(body.error, /Missing required 'provider' or 'formId'/);
  assert.equal(calls.length, 0, "fetch must not be called");
});

await expect("400 — missing formId", async () => {
  const { status, body } = await sendWithEnv({}, { provider: "cf7" });
  assert.equal(status, 400);
  assert.match(body.error, /Missing required 'provider' or 'formId'/);
});

await expect("403 — formId outside ALLOWED_FORM_IDS", async () => {
  const { status, body, calls } = await sendWithEnv(
    { ALLOWED_FORM_IDS: "z10,20" },
    { provider: "cf7", formId: "999" },
  );
  assert.equal(status, 403);
  assert.match(body.error, /Unauthorized formId: 999/);
  assert.equal(calls.length, 0, "guarded form must not reach a backend");
});

await expect("200 — whitelist trims spaces around ids", async () => {
  const { status } = await sendWithEnv(
    { ALLOWED_FORM_IDS: "z10, 20", CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "20", payload: {} },
    () => new Response(JSON.stringify({ status: "mail_sent" }), { status: 200 }),
  );
  assert.equal(status, 200);
});

await expect("500 — cf7 without CF7_BACKEND_URL", async () => {
  const { status, body } = await sendWithEnv({}, { provider: "cf7", formId: "z10" });
  assert.equal(status, 500);
  assert.match(body.error, /CF7_BACKEND_URL/);
});

await expect("200 — cf7 mail_sent forwards to the WordPress endpoint", async () => {
  const { status, body, calls } = await sendWithEnv(
    { CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: { first_name: "Jane", email: "jane@example.test" } },
    () => new Response(JSON.stringify({ status: "mail_sent", message: "sent" }), { status: 200 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://wp.example.com/wp-json/contact-form-7/v1/contact-forms/z10/feedback",
  );
  assert.equal(calls[0].init.method, "POST");
  const fd = calls[0].init.body;
  assert.ok(fd instanceof FormData, "cf7 body must be FormData");
  assert.equal(fd.get("first_name"), "Jane");
  assert.equal(fd.get("_wpcf7_unit_tag"), "wpcf7-fz10-o1");
});

await expect("400 — cf7 validation_failed surfaces the rejection", async () => {
  const { status, body } = await sendWithEnv(
    { CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: {} },
    () => new Response(JSON.stringify({ status: "validation_failed", message: "spam detected" }), { status: 200 }),
  );
  assert.equal(status, 400);
  assert.equal(body.error, "spam detected");
});

await expect("400 — unsupported provider", async () => {
  const { status, body, calls } = await sendWithEnv({}, { provider: "brevo", formId: "z10" });
  assert.equal(status, 400);
  assert.match(body.error, /Unsupported provider: brevo/);
  assert.equal(calls.length, 0, "unknown providers never touch a backend");
});

await expect("500 — resend without RESEND_API_KEY", async () => {
  const { status, body } = await sendWithEnv({}, { provider: "resend", formId: "z10", to: "a@b.test" });
  assert.equal(status, 500);
  assert.match(body.error, /RESEND_API_KEY\/RESEND_TO_EMAIL/);
});

await expect("200 — resend delivers to the envelope recipient", async () => {
  const { status, body, calls } = await sendWithEnv(
    { RESEND_API_KEY: "re_test" },
    { provider: "resend", formId: "z10", to: "team@example.test", payload: { email: "jane@example.test", message: "hi" } },
    () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ["team@example.test"]);
});

await expect("200 — postmark + sendgrid forward", async () => {
  const pm = await sendWithEnv(
    { POSTMARK_SERVER_TOKEN: "t" },
    { provider: "postmark", formId: "z10", payload: {} },
    () => new Response("{}", { status: 200 }),
  );
  assert.equal(pm.status, 200);
  const sg = await sendWithEnv(
    { SENDGRID_API_KEY: "k" },
    { provider: "sendgrid", formId: "z10", payload: {} },
    () => new Response("{}", { status: 200 }),
  );
  assert.equal(sg.status, 200);
});

await expect("200 — fluentforms forwards FormData to the form-submit endpoint", async () => {
  const { status, body, calls } = await sendWithEnv(
    { FLUENT_FORMS_BACKEND_URL: "https://wp.example.com" },
    { provider: "fluentforms", formId: "10", payload: { first_name: "Jane", email: "jane@example.test" } },
    () => new Response(JSON.stringify({ success: true, message: "submitted" }), { status: 200 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://wp.example.com/wp-json/fluentform/v1/form-submit");
  assert.equal(calls[0].init.method, "POST");
  const fd = calls[0].init.body;
  assert.ok(fd instanceof FormData, "fluentforms body must be FormData");
  assert.equal(fd.get("form_id"), "10");
  assert.equal(fd.get("email"), "jane@example.test");
});

await expect("400 — fluentforms rejected body surfaces the message", async () => {
  const { status, body } = await sendWithEnv(
    { FLUENT_FORMS_BACKEND_URL: "https://wp.example.com" },
    { provider: "fluentforms", formId: "10", payload: {} },
    () => new Response(JSON.stringify({ success: false, message: "spam caught" }), { status: 200 }),
  );
  assert.equal(status, 400);
  assert.equal(body.error, "spam caught");
});

await expect("500 — fluentforms without FLUENT_FORMS_BACKEND_URL", async () => {
  const { status, body } = await sendWithEnv({}, { provider: "fluentforms", formId: "10" });
  assert.equal(status, 500);
  assert.match(body.error, /FLUENT_FORMS_BACKEND_URL/);
});

await expect("200 — mailchimp fresh subscription", async () => {
  const { status, body } = await sendWithEnv(
    { MAILCHIMP_API_KEY: "k", MAILCHIMP_AUDIENCE_ID: "aud", MAILCHIMP_SERVER_PREFIX: "us1" },
    { provider: "mailchimp", formId: "30-4d-al", payload: { email: "a@b.test" } },
    () => new Response(JSON.stringify({ id: "123" }), { status: 200 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
});

await expect("200 — mailchimp 'Member Exists' is idempotent success", async () => {
  const { status, body, calls } = await sendWithEnv(
    { MAILCHIMP_API_KEY: "k", MAILCHIMP_AUDIENCE_ID: "aud", MAILCHIMP_SERVER_PREFIX: "us1" },
    { provider: "mailchimp", formId: "30-4d-al", payload: { email: "jane@example.test" } },
    () => new Response(JSON.stringify({ title: "Member Exists" }), { status: 400 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://us1.api.mailchimp.com/3.0/lists/aud/members");
  assert.equal(calls[0].init.headers.Authorization, `Basic ${btoa("anystring:k")}`);
});

await expect("400 — mailchimp without an email address", async () => {
  const { status, body } = await sendWithEnv(
    { MAILCHIMP_API_KEY: "k", MAILCHIMP_AUDIENCE_ID: "aud", MAILCHIMP_SERVER_PREFIX: "us1" },
    { provider: "mailchimp", formId: "30-4d-al", payload: {} },
  );
  assert.equal(status, 400);
  assert.match(body.error, /valid email address/);
});

// --- M13: CAPTCHA siteverify gate (FormSpec `captcha` block) ---

await expect("400 — captcha envelope missing its token", async () => {
  const { status, body, calls } = await sendWithEnv(
    { TURNSTILE_SECRET_KEY: "k" },
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "turnstile" },
  );
  assert.equal(status, 400);
  assert.match(body.error, /Security token missing/);
  assert.equal(calls.length, 0, "tokenless captcha claims never touch a backend");
});

await expect("400 — unknown captcha provider", async () => {
  const { status, body, calls } = await sendWithEnv(
    {},
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "funky", captchaToken: "t" },
  );
  assert.equal(status, 400);
  assert.match(body.error, /Unsupported captcha provider: funky/);
  assert.equal(calls.length, 0, "unknown providers never touch a backend");
});

await expect("500 — captcha without its server secret", async () => {
  const { status, body } = await sendWithEnv(
    {},
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "turnstile", captchaToken: "t" },
  );
  assert.equal(status, 500);
  assert.match(body.error, /TURNSTILE_SECRET_KEY/);
});

await expect("403 — siteverify rejection blocks the backend", async () => {
  const { status, body, calls } = await sendWithEnv(
    { TURNSTILE_SECRET_KEY: "1x-secret", CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "turnstile", captchaToken: "bad-token" },
    (entry) =>
      entry.url.includes("siteverify")
        ? new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 })
        : new Response("{}", { status: 200 }),
  );
  assert.equal(status, 403);
  assert.match(body.error, /Bot verification failed/);
  assert.equal(calls.length, 1, "a rejected token must never reach a backend");
});

await expect("200 — turnstile always-pass token verifies then dispatches", async () => {
  const { status, body, calls } = await sendWithEnv(
    { TURNSTILE_SECRET_KEY: "1x00000000000000000000AA", CF7_BACKEND_URL: "https://wp.example.com" },
    {
      provider: "cf7",
      formId: "z10",
      payload: { first_name: "Jane" },
      captchaProvider: "turnstile",
      captchaToken: "1x-token",
    },
    (entry) =>
      entry.url.includes("siteverify")
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response(JSON.stringify({ status: "mail_sent" }), { status: 200 }),
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.length, 2, "siteverify call + the backend dispatch");
  const verifyCall = calls[0];
  assert.equal(verifyCall.url, "https://challenges.cloudflare.com/turnstile/v1/siteverify");
  assert.equal(verifyCall.init.method, "POST");
  assert.ok(verifyCall.init.body instanceof URLSearchParams, "siteverify body must be form-encoded");
  assert.equal(verifyCall.init.body.get("secret"), "1x00000000000000000000AA");
  assert.equal(verifyCall.init.body.get("response"), "1x-token");
});

await expect("200 — remoteip forwarded from x-forwarded-for", async () => {
  const { status, calls } = await sendWithEnv(
    { TURNSTILE_SECRET_KEY: "k", CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "turnstile", captchaToken: "t" },
    (entry) =>
      entry.url.includes("siteverify")
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response(JSON.stringify({ status: "mail_sent" }), { status: 200 }),
    { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  );
  assert.equal(status, 200);
  assert.equal(calls[0].init.body.get("remoteip"), "203.0.113.7");
});

await expect("200 — recaptcha-v3 + hcaptcha siteverify endpoints", async () => {
  const rv3 = await sendWithEnv(
    { RECAPTCHA_SECRET_KEY: "k", CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "recaptcha-v3", captchaToken: "t" },
    (entry) =>
      entry.url.includes("siteverify")
        ? new Response(JSON.stringify({ success: true, score: 0.9 }), { status: 200 })
        : new Response(JSON.stringify({ status: "mail_sent" }), { status: 200 }),
  );
  assert.equal(rv3.status, 200);
  assert.equal(rv3.calls[0].url, "https://www.google.com/recaptcha/api/siteverify");
  const hc = await sendWithEnv(
    { HCAPTCHA_SECRET_KEY: "k", CF7_BACKEND_URL: "https://wp.example.com" },
    { provider: "cf7", formId: "z10", payload: {}, captchaProvider: "hcaptcha", captchaToken: "t" },
    (entry) =>
      entry.url.includes("siteverify")
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response(JSON.stringify({ status: "mail_sent" }), { status: 200 }),
  );
  assert.equal(hc.status, 200);
  assert.equal(hc.calls[0].url, "https://hcaptcha.com/siteverify");
});

console.log(`\n${passed} checks passed.`);
if (failed.length) {
  console.error(`${failed.length} checks failed:`);
  for (const f of failed) console.error(`  - ${f}`);
  process.exitCode = 1;
}