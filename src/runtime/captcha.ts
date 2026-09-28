/**
 * CAPTCHA runtime — mounts and drives the optional `FormSpec.captcha` block
 * (Turnstile / reCAPTCHA v3 / hCaptcha) inside the shell's `[data-rf-captcha]`
 * slot and hands the engine a token to forward to a proxied `/api/contact`
 * route for server-side `siteverify`.
 *
 * Zero-dependency and browser-only: the provider scripts are injected lazily
 * and idempotently (one `<script>` per URL, shared across forms), and the
 * controller below is all the engine holds for its submit gate. The `siteKey`
 * is public by design — it ships in the client spec (`data-captcha`), while
 * the matching provider *secret* lives only in the consumer's `.env`.
 *
 * reCAPTCHA v3 is invisible (no widget to render): the script is still loaded
 * (its badge is part of Google's terms) and `token()` executes the challenge
 * on demand. No server call happens here — verification is the proxy's job.
 */
import type { CaptchaProvider, CaptchaSpec } from "../core";

/** Signals the engine gets from a mounted challenge. */
export interface CaptchaHooks {
  /** A widget challenge completed — a fresh token is available. */
  onResolved?: () => void;
  /** The rendered challenge expired (its token is single-use / time-boxed). */
  onExpired?: () => void;
  /** The provider reported an error while rendering or solving. */
  onError?: () => void;
}

/** Per-form challenge handle given to the engine's submit gate. */
export interface CaptchaController {
  provider: CaptchaProvider;
  /** True for widget challengers (`turnstile` / `hcaptcha`) — submit gates on completion. */
  isWidget: boolean;
  /** The stored widget token, or `undefined` while the challenge is pending. */
  getToken(): string | undefined;
  /**
   * Resolve the token to travel with the mailer envelope. Widgets return the
   * stored token; reCAPTCHA v3 executes the invisible challenge and resolves
   * with its token (`undefined` when the provider is unavailable).
   */
  token(): Promise<string | undefined>;
  /** Drop the stored token and reset the widget (tokens are single-use). */
  reset(): void;
  /** Unmount the widget and drop provider listeners (detach-time). */
  destroy(): void;
}

const SCRIPT_URL: Record<CaptchaProvider, (siteKey: string) => string> = {
  turnstile: () => "https://challenges.cloudflare.com/turnstile/api.js?render=explicit",
  hcaptcha: () => "https://js.hcaptcha.com/1/api.js?render=explicit",
  // `render=<siteKey>` both registers the key for `execute` and shows the
  // terms-mandated badge; loading at attach pre-warms the challenge.
  "recaptcha-v3": (siteKey) =>
    `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`,
};

/** The window global each provider exposes once its script has loaded. */
const providerGlobal = (provider: CaptchaProvider): unknown =>
  (window as unknown as Record<string, unknown>)[
    provider === "turnstile" ? "turnstile" : provider === "hcaptcha" ? "hcaptcha" : "grecaptcha"
  ];

const loadingScripts = new Map<string, Promise<void>>();

/**
 * Inject a provider script once (per URL), resolving when its global appears —
 * whether via `onload`, a late `<script>` load, or a short poll for providers
 * that load asynchronously after `onload` fires. Rejected promises are not
 * cached, so a transient network failure can be retried by the next consume.
 */
const loadProviderScript = (provider: CaptchaProvider, siteKey: string): Promise<void> => {
  const url = SCRIPT_URL[provider](siteKey);
  const cached = loadingScripts.get(url);
  if (cached) return cached;
  if (providerGlobal(provider)) return Promise.resolve();
  const load = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    el.defer = true;
    let settled = false;
    const done = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    el.onerror = () => done(new Error(`Failed to load ${url}`));
    el.onload = () => done();
    const timer = setTimeout(
      () => done(new Error(`Timed out waiting for ${provider} — is the provider script blocked?`)),
      15000,
    );
    const poll = window.setInterval(() => {
      if (providerGlobal(provider)) done();
    }, 150);
    document.head.appendChild(el);
  });
  loadingScripts.set(url, load);
  return load;
};

/**
 * Mount a `FormSpec.captcha` block into its `[data-rf-captcha]` slot and
 * return a controller the engine drives. Widget mounting is async (script
 * load first) — failures are swallowed so a blocked/absent provider can never
 * break the form itself; the submit gate just has no token to forward.
 */
export function mountCaptcha(
  container: HTMLElement,
  spec: CaptchaSpec,
  hooks: CaptchaHooks = {},
): CaptchaController {
  const isWidget = spec.provider !== "recaptcha-v3";
  let storedToken: string | undefined;
  let widgetId: unknown;

  const onWidgetToken = (token: string): void => {
    storedToken = token;
    hooks.onResolved?.();
  };

  const mountWidget = async (): Promise<void> => {
    try {
      await loadProviderScript(spec.provider, spec.siteKey);
      if (spec.provider === "turnstile") {
        const turnstile = providerGlobal("turnstile") as {
          render(container: HTMLElement, options: Record<string, unknown>): unknown;
        };
        widgetId = turnstile.render(container, {
          sitekey: spec.siteKey,
          theme: spec.theme ?? "auto",
          ...(spec.action ? { action: spec.action } : {}),
          callback: onWidgetToken,
          "expired-callback": () => {
            storedToken = undefined;
            hooks.onExpired?.();
          },
          "error-callback": () => hooks.onError?.(),
        });
      } else if (spec.provider === "hcaptcha") {
        const hcaptcha = providerGlobal("hcaptcha") as {
          render(container: HTMLElement, options: Record<string, unknown>): unknown;
        };
        widgetId = hcaptcha.render(container, {
          sitekey: spec.siteKey,
          // hCaptcha accepts only light/dark — "auto" (the default) is omitted
          // so the provider picks its own default.
          ...(spec.theme && spec.theme !== "auto" ? { theme: spec.theme } : {}),
          callback: onWidgetToken,
          "expired-callback": () => {
            storedToken = undefined;
            hooks.onExpired?.();
          },
          "error-callback": () => hooks.onError?.(),
        });
      }
    } catch {
      /* provider unavailable — the form still works, the proxy rejects */
    }
  };

  void mountWidget();

  return {
    provider: spec.provider,
    isWidget,
    getToken: () => storedToken,
    async token() {
      if (!isWidget) {
        try {
          await loadProviderScript("recaptcha-v3", spec.siteKey);
          const grecaptcha = providerGlobal("recaptcha-v3") as {
            ready(callback: () => void): void;
            execute(siteKey: string, options: { action: string }): Promise<string>;
          };
          if (!grecaptcha || typeof grecaptcha.ready !== "function" || typeof grecaptcha.execute !== "function") {
            return undefined;
          }
          return await new Promise<string | undefined>((resolve) => {
            grecaptcha.ready(() => {
              grecaptcha
                .execute(spec.siteKey, { action: spec.action ?? "submit" })
                .then(resolve, () => resolve(undefined));
            });
          });
        } catch {
          return undefined;
        }
      }
      return storedToken;
    },
    reset() {
      storedToken = undefined;
      if (widgetId !== undefined) {
        const api = providerGlobal(spec.provider) as { reset?(id: unknown): void } | undefined;
        api?.reset?.(widgetId);
      }
    },
    destroy() {
      if (widgetId !== undefined) {
        const api = providerGlobal(spec.provider) as { remove?(id: unknown): void } | undefined;
        api?.remove?.(widgetId);
      }
    },
  };
}

/**
 * Parse the shell's serialised `data-captcha` block (safe-parse, shape-checked)
 * so the specless `initForms` path resolves a captcha from the markup alone.
 */
export function parseCaptchaSpec(raw: string | undefined): CaptchaSpec | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const provider = record.provider;
      const siteKey = record.siteKey;
      if (
        (provider === "turnstile" || provider === "recaptcha-v3" || provider === "hcaptcha") &&
        typeof siteKey === "string" &&
        siteKey.length > 0
      ) {
        const spec: CaptchaSpec = { provider, siteKey };
        if (record.theme === "light" || record.theme === "dark" || record.theme === "auto") spec.theme = record.theme;
        if (typeof record.action === "string") spec.action = record.action;
        if (record.onPendingSubmit === "block" || record.onPendingSubmit === "auto") spec.onPendingSubmit = record.onPendingSubmit;
        return spec;
      }
    }
  } catch {
    /* malformed attribute — treat as absent */
  }
  return undefined;
}