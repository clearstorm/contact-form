# Roadmap

This roadmap describes intended sequencing. It does **not** determine whether
a feature is currently implemented. See [FEATURES.md](FEATURES.md) and
[project.state.json](project.state.json) for current status, and
[PROJECT_STATUS.md](PROJECT_STATUS.md) for immediate next work.

The items below are proposals derived from the README's stated follow-ups and
the code's deprecation markers — reorder, rename or drop them freely.

---

## Delivered milestones (sequencing so far)

The milestone sequence pursued in the current development cycle, each tracked
in [FEATURES.md](FEATURES.md) as implemented:

- **M1 — conditional logic expansion.** The newer `showWhen` operators plus
  the `anyOf` / `noneOf` / `not` wrappers that nest freely.
- **M2 — validation rule expansion.** `pattern`, `minLength` / `maxLength`
  (with live character counters), `sameAs`, `minSelect` / `maxSelect`.
- **M3 — file-upload rule bounds.** `maxSize` (bytes or `"5MB"` units),
  `allowedTypes` MIME globs, `minFiles` / `maxFiles` counts.
- **M4 — repeaters (row groups).** `type: "repeater"` containers holding any
  field types, visitor add/remove rows with `minRows` / `maxRows` bounds,
  row-scoped validation, and one structured JSON-array canonical payload
  entry per row group.
- **M5 — wizard hooks + event bus.** Lifecycle hooks (`beforeValidateStep` /
  `afterStepChange` / `beforeSubmit` / `afterSubmit` — the step/submit hooks
  veto by returning `false`) across `attachForm` / `renderForm` and the
  TanStack bridge, plus the namespaced `rf:*` event bus (`rf:fields-change`,
  `rf:row-add` / `rf:row-remove`, `rf:step-change`, `rf:submit-start` /
  `submit-success` / `submit-error`). `FormSpec.hooks` hook-ref *names*
  resolve against the attach options' named registry, so specs stay
  serialisable.
- **M6 — analytics seam + deprecation cleanup.** `createAnalytics({ adapter })`
  — a zero-dependency seam that forwards the `rf:*` bus to a consumer-supplied
  tracker (`attach(form)` via native `addEventListener`, returns a detach),
  flipping `analytics-seam` to implemented. Plus the cleanup: the legacy
  `copy.back` / `copy.next` label fallbacks are gone (`FormSpec.prev` /
  `FormSpec.next` are the only way to label wizard buttons) and the `66` size
  alias was removed (keep `67`).
- **M7 — conditional wizard steps + draft persistence & prefill.** `step`
  markers accept `showWhen`: a pane whose conditions don't hold is skipped
  (hidden + `inert`, struck-through `rf-step--skipped` chip, out of
  validation, the payload and cross-field chains) while authored step indices
  never change — the engine walks a *visible* sequence for Next/Back/jumps,
  a step that collapses underfoot reflows to a visible neighbour, and
  re-revealing a later step flips the final button back to a submit. Plus
  `autoSave` — debounced localStorage drafts (current wizard step, repeater
  row counts, every visible value; restored on attach, cleared on
  `rf:submit-success`) — and the runtime `values` prefill option that beats a
  stored draft. The demo flagship wizard grows a conditional "Company" pane
  and opts into `autoSave`.

---

## v0.4.0 — Nodemailer mail-delivery adapter

The README's documented follow-up ("A first-party Nodemailer delivery adapter
is planned"). Completes the serverless-worker story for the `json` mailer: the
client posts the canonical payload to a worker; the adapter turns it into an
email via Nodemailer. When it lands, flip `mailer-nodemailer` to
`implemented` in FEATURES.md + project.state.json.

## npm publishing

The package is currently `private: true` and installed via immutable git tags.
Ship a versioned build to the npm registry (drop `private`, publish with the
existing `files: ["src"]` layout) so consumers can install `@clearstorm/
contact-form` by version. Flip `release-npm-publish` when done.

## v1.0 stabilization

- Freeze the `FormSpec` surface (types, serialisation, payload shapes) for a
  1.x contract.
- Final README / FEATURES.md / API-docs pass across all four bindings.
- Consider a dedicated example for the Nodemailer worker once available.