import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite demo for the React + TanStack Form bindings. The package is linked via
// `file:../..`, so editing src/ in the package hot-reloads this app.
export default defineConfig({
  plugins: [react()],
});