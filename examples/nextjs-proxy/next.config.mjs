import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the workspace root to this example folder — otherwise Next infers the
// parent repo (which has its own package-lock.json) as the workspace root.
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: { root },
};

export default nextConfig;