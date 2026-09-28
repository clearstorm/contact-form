import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the workspace root to the **repo root** (parent of this example). The
// package is consumed via a `file:../..` symlink whose target lives there; a
// root pinned to this folder makes Turbopack treat that symlink target as
// external, and `@clearstorm/contact-form/*` fails to resolve. Without a pin
// Next infers the same root but prints a lockfile warning.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: { root },
};

export default nextConfig;
