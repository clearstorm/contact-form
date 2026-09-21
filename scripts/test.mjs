/**
 * Test runner: bundles scripts/tests.mjs (with the package source) via
 * esbuild and executes it under Node. No test framework needed.
 */
import { buildSync } from "esbuild";
import { execSync } from "node:child_process";

buildSync({
  entryPoints: ["scripts/tests.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "/tmp/contact-form-tests.mjs",
  logLevel: "warning",
});

execSync("node /tmp/contact-form-tests.mjs", { stdio: "inherit" });