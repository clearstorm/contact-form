/**
 * `@clearstorm/contact-form/validation` — opt-in validation providers for the
 * core's `ValidationProvider` seam. Ships the Zod adapter; anything that
 * satisfies the seam can be dropped in the same slot.
 */
export { zodValidation } from "./zod";
export type { ZodObjectLike } from "./zod";