/**
 * Test runner: bundles both test files (with the package source) via esbuild
 * and executes them under Node. No test framework needed.
 *
 * - scripts/tests.mjs               — core + mailers (no DOM)
 * - scripts/markup-tests.ts         — markup snapshot fixtures (no DOM)
 * - scripts/tanstack-bridge-tests.ts — TanStack bridge pure helpers (no DOM)
 * - scripts/engine-tests.ts         — client engine under happy-dom (DOM)
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

buildSync({
  entryPoints: ["scripts/engine-tests.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  // happy-dom bundles `ws`, which uses dynamic require — resolve packages
  // natively at runtime instead of inlining them. The output lives inside
  // the project tree so ESM can resolve node_modules from it.
  packages: "external",
  outfile: "node_modules/.cache/contact-form-engine-tests.mjs",
  logLevel: "warning",
});

buildSync({
  entryPoints: ["scripts/markup-tests.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "/tmp/contact-form-markup-tests.mjs",
  logLevel: "warning",
});

buildSync({
  entryPoints: ["scripts/tanstack-bridge-tests.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "/tmp/contact-form-tanstack-tests.mjs",
  logLevel: "warning",
});

execSync("node /tmp/contact-form-tests.mjs", { stdio: "inherit" });
execSync("node /tmp/contact-form-markup-tests.mjs", {
  stdio: "inherit",
  env: { ...process.env, FIXTURES_DIR: new URL("./fixtures/", import.meta.url).pathname },
});
execSync("node /tmp/contact-form-tanstack-tests.mjs", { stdio: "inherit" });

// happy-dom occasionally hangs at module import in a fresh Node process (ESM
// loader flake, ~1 in 4 processes). Retry only on the hang (SIGTERM from the
// timeout); a real test failure (exit 1) is reported immediately.
let engineRan = false;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    execSync("node node_modules/.cache/contact-form-engine-tests.mjs", {
      stdio: "inherit",
      timeout: 30000,
    });
    engineRan = true;
    break;
  } catch (error) {
    const killed =
      error !== null &&
      typeof error === "object" &&
      (error.signal === "SIGTERM" || error.killed === true);
    if (!killed) throw error;
    if (attempt < 3) console.warn(`engine suite hung at load (attempt ${attempt}/3) — retrying…`);
  }
}
if (!engineRan) process.exit(1);