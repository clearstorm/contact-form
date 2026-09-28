/**
 * Boot guard for the astro-proxy example.
 *
 * `astro.config.mjs` imports `@astrojs/node`, an example-level devDependency.
 * If `npm install` hasn't been run in this folder, `astro dev` / `astro build`
 * / `astro preview` silently resolve the **root** repo's peer-installed `astro`
 * instead and die with `Cannot find module '@astrojs/node'`. This guard fails
 * fast with the fix instead of a Vite stack trace.
 *
 * Usage: invoked automatically from the `predev` / `prebuild` / `prepreview`
 * npm scripts in this example's package.json.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const localModules = fileURLToPath(new URL("../node_modules", import.meta.url));
if (existsSync(`${localModules}/.bin/astro`) && existsSync(`${localModules}/@astrojs/node`)) {
  process.exit(0);
}

console.error(
  "\n[astro-proxy] Dependencies are not installed in this example folder.\n" +
    "Run `npm install` here before `npm run dev` / `npm run build` / `npm run preview`.\n" +
    "The repo root declares `astro` as a required peer dependency, so without the\n" +
    "local install, astro runs from the root copy and fails with\n" +
    "`Cannot find module '@astrojs/node'`.\n",
);
process.exit(1);