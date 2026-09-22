// Demo site for `@clearstorm/contact-form`. Pure static output — the forms
// validate and submit entirely client-side (data-* attributes + one shared
// module script), so no server runtime is needed to try them.
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
});