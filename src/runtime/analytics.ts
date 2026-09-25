/**
 * Zero-dependency analytics seam over the `rf:*` event bus.
 *
 * The engine dispatches every lifecycle event as a plain `CustomEvent` on the
 * `<form>` (see `attachForm`'s `on()` in engine.ts). This helper turns that
 * bus into a tiny forwarding webhook for a consumer-supplied tracker: pages
 * with several forms subscribe each once and receive every `rf:*` event with
 * its detail (form identity, step transitions, row counts, submit outcomes).
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
import type { FormEventName } from "./engine";

/** A consumer-supplied tracker — a tag manager, analytics SDK wrapper, etc. */
export interface AnalyticsTracker {
  /** Receives each `rf:*` event with its detail (form name/id, step, counts…). */
  track(event: FormEventName, detail: Record<string, unknown>): void;
}

export interface AnalyticsOptions {
  adapter: AnalyticsTracker;
}

/** The subscription returned by `attach` — call `detach()` to stop forwarding. */
export interface AnalyticsSubscription {
  detach(): void;
}

/** The `rf:*` bus, in dispatch order. */
const BUS_EVENTS: FormEventName[] = [
  "rf:fields-change",
  "rf:row-add",
  "rf:row-remove",
  "rf:step-change",
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
            adapter.track(event, (e as CustomEvent).detail as Record<string, unknown>);
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