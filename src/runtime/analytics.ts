/**
 * Zero-dependency analytics seam over the `rf:*` event bus.
 *
 * The engine dispatches every lifecycle event as a plain `CustomEvent` on the
 * `<form>` (see `attachForm`'s `on()` in engine.ts). This helper turns that
 * bus into a tiny forwarding webhook for a consumer-supplied tracker: pages
 * with several forms subscribe each once and receive every `rf:*` event with
 * its detail (form identity, step transitions, row counts, submit outcomes).
 *
 * A companion, `resolveAnalytics`, turns a declarative `FormSpec.analytics`
 * block into the same shape — routing the bus to a consumer-loaded tracking
 * global (`dataLayer` / `customEvent` / `plausible` / `posthog`) with friendly
 * event names (`form_step_view`, `form_validation_error`, `form_submitted`).
 * The engine calls it automatically when the spec is wired with a spec in
 * scope (`attachForm(form, { spec })` / `renderForm`); consumers can override
 * the block with their own `createAnalytics` object or opt out with `false`.
 *
 * No events are fabricated here and no `data-*` hooks are added — the seam
 * only *consumes* what the engine already emits, and it attaches via native
 * `addEventListener` (the M5 bus is plain `CustomEvent`s), so it works with
 * any form, whether wired by `attachForm`/`renderForm` or not.
 *
 * ```js
 * import { renderForm, createAnalytics } from "@clearstorm/contact-form/vanilla";
 *
 * const analytics = createAnalytics({
 *   adapter: { track: (event, detail) => telemetry(event, detail) },
 * });
 * const { form, detach } = renderForm("#root", spec);
 * const stop = analytics.attach(form);
 * ```
 */
import type { AnalyticsProvider, AnalyticsSpec } from "../core";
import type { FormEventName } from "./engine";

/** Props pushed to a tracking global for one routed event. */
type AnalyticsProps = Record<string, unknown>;

/** A consumer-supplied tracker — a tag manager, analytics SDK wrapper, etc. */
export interface AnalyticsTracker {
  /**
   * Receives each `rf:*` event with its detail (form name/id, step, counts…).
   * The originating `<form>` is passed as a third argument so adapters can
   * read `data-mail-form` / `id` for pushes whose detail omits them (e.g.
   * `rf:step-change`) — existing adapters simply ignore it.
   */
  track(event: FormEventName, detail: Record<string, unknown>, form?: HTMLFormElement): void;
}

export interface AnalyticsOptions {
  adapter: AnalyticsTracker;
}

/** The subscription returned by `attach` — call `detach()` to stop forwarding. */
export interface AnalyticsSubscription {
  detach(): void;
}

/** A `createAnalytics`-compatible object: `{ attach(form): AnalyticsSubscription }`. */
export type AnalyticsAttachment = ReturnType<typeof createAnalytics>;

/** The `rf:*` bus, in dispatch order. */
const BUS_EVENTS: FormEventName[] = [
  "rf:fields-change",
  "rf:row-add",
  "rf:row-remove",
  "rf:step-change",
  "rf:validation-error",
  "rf:submit-start",
  "rf:submit-success",
  "rf:submit-error",
];

/**
 * Wire the whole `rf:*` bus through to a tracker for one form. Returns a
 * subscription whose `detach()` removes exactly the listeners added here.
 */
export function createAnalytics(options: AnalyticsOptions): {
  attach: (form: HTMLFormElement) => AnalyticsSubscription;
} {
  const { adapter } = options;
  return {
    attach(form) {
      const handlers: Array<{ event: FormEventName; handler: EventListener }> =
        BUS_EVENTS.map((event) => ({
          event,
          handler: (e: Event): void => {
            adapter.track(
              event,
              (e as CustomEvent).detail as Record<string, unknown>,
              form,
            );
          },
        }));
      for (const { event, handler } of handlers) form.addEventListener(event, handler);
      return {
        detach() {
          for (const { event, handler } of handlers) form.removeEventListener(event, handler);
        },
      };
    },
  };
}

/**
 * Build the tracker for a declarative `FormSpec.analytics` block. Each provider
 * is a *consumer-loaded global*: missing globals are silent no-ops, and only
 * the browser's own `window` is ever touched (never fabricated).
 */
const providerPush = (provider: AnalyticsProvider): ((name: string, props: AnalyticsProps) => void) => {
  const windowGlobal = window as Window & {
    dataLayer?: AnalyticsProps[];
    plausible?: (name: string, opts?: { props?: AnalyticsProps }) => void;
    posthog?: { capture: (name: string, props?: AnalyticsProps) => void };
  };
  switch (provider) {
    case "customEvent":
      return (name, props) => {
        windowGlobal.dispatchEvent(new CustomEvent(name, { detail: props }));
      };
    case "plausible":
      return (name, props) => {
        windowGlobal.plausible?.(name, { props });
      };
    case "posthog":
      return (name, props) => {
        windowGlobal.posthog?.capture(name, props);
      };
    case "dataLayer":
    default:
      // GTM's snippet initialises `window.dataLayer`; when the tag manager
      // isn't loaded there is nothing to push to (a no-op, like the SDKs).
      return (name, props) => {
        if (Array.isArray(windowGlobal.dataLayer)) windowGlobal.dataLayer.push({ event: name, ...props });
      };
  }
};

/**
 * Turn a declarative `FormSpec.analytics` block into a `createAnalytics`
 * object routing the existing `rf:*` bus to a consumer-loaded tracking global:
 *
 * - `rf:step-change` → `form_step_view` (`formName`, `formId`, `stepTo`, `stepTotal`).
 * - `rf:validation-error` → `form_validation_error` (`formName`, `formId`, `failedFields`).
 * - `rf:submit-success` → `eventName ?? "form_submitted"`.
 * - `rf:submit-error` → the same name with `outcome: "error"`.
 *
 * `trackSteps` / `trackFieldErrors` gate the first two routes (both default
 * `true`). Returns `undefined` when the block is absent or `enabled: false` —
 * the engine treats that as "no tracking".
 */
export function resolveAnalytics(spec?: AnalyticsSpec): AnalyticsAttachment | undefined {
  if (!spec || spec.enabled === false) return undefined;
  const provider = spec.provider ?? "dataLayer";
  const eventName = spec.eventName ?? "form_submitted";
  const trackSteps = spec.trackSteps !== false;
  const trackFieldErrors = spec.trackFieldErrors !== false;
  const push = providerPush(provider);

  return {
    attach(form) {
      // `rf:step-change`'s detail carries no form identity — read it off the
      // DOM once, the way `createAnalytics` hands the form to its adapter.
      const formName = form.dataset.mailForm ?? "";
      const formId = form.id;
      const props = (extra: AnalyticsProps = {}): AnalyticsProps => ({ formName, formId, ...extra });
      const routed: Array<{ event: FormEventName; handler: EventListener }> = [
        {
          event: "rf:step-change",
          handler: (e: Event): void => {
            if (!trackSteps) return;
            const detail = (e as CustomEvent).detail as { to?: number; total?: number } | undefined;
            push("form_step_view", props({ stepTo: detail?.to, stepTotal: detail?.total }));
          },
        },
        {
          event: "rf:validation-error",
          handler: (e: Event): void => {
            if (!trackFieldErrors) return;
            const detail = (e as CustomEvent).detail as { errors?: Array<{ name: string }> } | undefined;
            push("form_validation_error", props({ failedFields: detail?.errors?.map((err) => err.name) ?? [] }));
          },
        },
        {
          event: "rf:submit-success",
          handler: (): void => {
            push(eventName, props());
          },
        },
        {
          event: "rf:submit-error",
          handler: (): void => {
            push(eventName, props({ outcome: "error" }));
          },
        },
      ];
      for (const { event, handler } of routed) form.addEventListener(event, handler);
      return {
        detach() {
          for (const { event, handler } of routed) form.removeEventListener(event, handler);
        },
      };
    },
  };
}