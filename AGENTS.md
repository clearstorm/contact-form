# AGENTS.md

This file contains mandatory instructions for AI coding agents working on the
repository. Read this file completely before creating, modifying, moving, or
deleting code.

The project README explains what ContactForm is and how it is intended to be
used. This file defines how ContactForm must be engineered. If implementation
convenience conflicts with the architectural rules in this file, preserve the
architecture unless the user explicitly instructs otherwise.

---

## Architecture rules

ContactForm is a **fat engine, thin bindings** package: one JSON `FormSpec`
drives an Astro component, a React component, a single-call vanilla JS helper
and an opt-in TanStack Form bridge. The following invariants are load-bearing —
do not trade them away for convenience:

1. **`src/runtime/markup.ts` is the single source of truth for markup.** Every
   binding renders through the string builders (`renderFormShell`,
   `renderElements`, `renderField`, `renderDecor`, …), so the `rf-*` markup,
   the `data-*` serialisation (`data-rules`, `data-copy`, `data-steps`,
   `data-pane`, `data-step-jump`, …) and the `--rf-*` theming tokens can never
   drift between frameworks. Never hand-write markup in a binding; route it
   through the builders.

2. **Everything validates through the `ValidationProvider` seam.** The default
   is `vanillaValidation` (the regex rules in `src/core.ts`); the optional Zod
   adapter (`src/validation/zod.ts`) is consumed structurally (`.shape` +
   `.safeParse`) so the package module itself never imports zod. Swapping the
   provider changes *which* rules run — never *how* they run (they are opaque
   `Rule` objects downstream).

3. **One stylesheet, imported once, never auto-injected.** `src/runtime/styles.css`
   is the shared theme; consumers import it. `renderForm`'s `styles` option is
   the only script-tag escape hatch and injects a `<style data-rf-styles>` at
   most once.

4. **No env-var assumptions in the package.** Endpoint config is passed
   explicitly: `config` props → the form spec's own block
   (`cf7: { apiUrl, formId }` / `endpoint`) → a build-time console warning.
   How values reach the component is entirely the consumer's business.

5. **Every visitor-facing string is consumer-driven.** Resolution order is
   `field.message` → `copy[key]` → built-in default. The strings baked into
   `src/core.ts` are defaults only.

6. **Zero runtime dependencies.** No new production dependencies. Peer
   dependencies (`react`, `@tanstack/react-form`, `zod`) stay optional; core
   and runtime must keep running in a browser bundle or a Node worker.

## State-sync rule

`FEATURES.md` is the authoritative human-readable feature matrix;
`project.state.json` is its synchronized machine-readable representation.

- A **feature status change** must update both files **in the same pull
  request**.
- **Roadmap placement** is maintained separately in `ROADMAP.md` — it describes
  intended sequencing, never whether a feature is currently implemented.
- **Immediate next work** is recorded in `PROJECT_STATUS.md`, pointing at the
  roadmap rather than duplicating it.

## Engineering gate

- `npm test` must pass before a change is done. It runs the core + mailers
  suite, the markup snapshot suite, the TanStack bridge and Zod adapter suites
  (all no-DOM), and the client engine suite under happy-dom.
- `npm run typecheck` (strict `tsc --noEmit` over `src/`) must be clean.
- **Markup snapshots:** `scripts/markup-tests.ts` pins every binding's output
  to `scripts/fixtures/*.html`. Only after an *intentional* markup change do you
  regenerate with `RECORD=1 npm test` — then review the fixture diff, since
  fixtures are checked in as the safety net against drift.
- Do not change public behaviour (markup, `data-*` hooks, payload shapes,
  validation messages) without updating the README and the demos that exercise
  it.

## Conventions

- Keep the namespaced `rf-*` class / `data-*` / `--rf-*` naming used across
  `src/`. New `data-*` hooks added here must also appear in `markup.ts` and the
  engine (and fixtures will pin them).
- Markup builders escape attribute and text content (`esc` in `markup.ts`) —
  never interpolate raw spec strings into HTML.
- Match the existing per-file JSDoc header style: one paragraph on what the
  module is, then usage notes, then exported API.
- Keep `src/core.ts` dependency-free; keep `src/mailers/`, `src/runtime/` and
  the bindings layered on top of it as they are now.