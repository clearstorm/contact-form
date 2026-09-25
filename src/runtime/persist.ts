/**
 * Form-state persistence + hydration helpers (internal).
 *
 * Two consumers in the client engine (src/runtime/engine.ts) use this module;
 * it is deliberately NOT exported from the package barrel — persistence is an
 * opt-in behaviour driven by the spec's `autoSave` key, not a public API:
 *
 * - `applyValues(form, values)` — the consumer-facing `values` option: pre-fill
 *   controls by name (`{ name: value }` / list for groups and multi-selects)
 *   at attach/render time.
 * - `createDraftStore(key)` + `captureDraft` / `applyDraft` / `countRepeaterRows`
 *   — the local-storage draft the `autoSave` form key turns on. A draft is
 *   VERSIONED (`v: 1`), restored on the next attach, and cleared on success.
 *   All storage access is feature-detected and try/caught, so a blocked
 *   `localStorage` quietly disables persistence.
 *
 * Draft values are captured in DOM order per *control*: checkbox/radio members
 * record their checked value (array form), multi-selects their selected
 * options, and every other control its trimmed value. Controls inside a
 * repeater row are keyed `{repeater}::{row}::{name}` so row correlation
 * survives the round-trip; the engine re-creates the saved row counts before
 * values are applied.
 */

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** One captured value: a plain `name`, or a qualified repeater-row key. */
export interface DraftValue {
  key: string;
  value: string | string[];
}

/** The stored draft entry (`autoSave` form key). */
export interface DraftEntry {
  /** Schema version — bumped when the shape changes (loaders reject others). */
  v: 1;
  /** Epoch ms of the last save. */
  savedAt: number;
  /** Authored step index on a wizard form (clamped to the visible sequence). */
  step?: number;
  /** Repeater row counts at save time — restored before values. */
  rows: Record<string, number>;
  /** Per-control captures, in DOM order. */
  values: DraftValue[];
}

/** A `localStorage`-backed draft held under one key. */
export interface DraftStore {
  save(entry: DraftEntry): void;
  load(): DraftEntry | null;
  clear(): void;
}

const toList = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

/**
 * Pre-fill a rendered form from a consumer `values` map (`{ name: value }`).
 * Checkbox/radio members check when their own value is listed (or, for a lone
 * toggle, when *any* value is given); a multi-select selects the listed
 * options; every other control takes the first listed value. Only controls
 * present in the DOM are touched — file inputs are skipped (they cannot be
 * prefilled). Explicit `values` are applied after draft restore, so they win.
 */
export const applyValues = (form: HTMLFormElement, values: Record<string, string | string[]>): void => {
  for (const [name, value] of Object.entries(values)) {
    const controls = Array.from(form.querySelectorAll<Control>(`[name="${CSS.escape(name)}"]`));
    if (controls.length === 0) continue;
    assignControls(controls, toList(value));
  }
};

/**
 * Capture the form's current in-scope values for a draft. Walks every named
 * control in DOM order; `isHidden` (field visibility + skipped-pane state) and
 * file inputs contribute nothing, and `type: "hidden"` inputs are skipped
 * (they may carry volatile payload data). Repeater-row controls get the
 * qualified `{repeater}::{row}::{name}` key.
 */
export const captureDraft = (
  form: HTMLFormElement,
  isHidden: (control: Control) => boolean,
): DraftValue[] => {
  const entries: DraftValue[] = [];
  for (const control of Array.from(form.querySelectorAll<Control>("input, select, textarea"))) {
    if (!control.name || isHidden(control)) continue;
    if (control instanceof HTMLInputElement && (control.type === "file" || control.type === "hidden")) continue;
    const row = control.closest<HTMLElement>("[data-repeater-row]");
    const repeater = row?.closest<HTMLElement>("[data-repeater]");
    const key =
      row && repeater && control.name
        ? `${repeater.dataset.repeater}::${row.dataset.row}::${control.name}`
        : control.name;
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
      if (control.checked) entries.push({ key, value: [control.value.trim()] });
      continue;
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      const selected = Array.from(control.selectedOptions)
        .map((option) => option.value.trim())
        .filter(Boolean);
      if (selected.length) entries.push({ key, value: selected });
      continue;
    }
    const value = control.value.trim();
    if (value) entries.push({ key, value });
  }
  return entries;
};

/** Repeater row counts in the current DOM (`name → row count`). */
export const countRepeaterRows = (form: HTMLFormElement): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const repeater of Array.from(form.querySelectorAll<HTMLElement>("[data-repeater]"))) {
    const name = repeater.dataset.repeater ?? "";
    if (!name) continue;
    counts[name] = repeater.querySelectorAll<HTMLElement>("[data-repeater-row]").length;
  }
  return counts;
};

/**
 * Restore a saved draft: re-create the saved repeater row counts via the
 * engine-supplied `addRow(name)` (rows must exist before their keyed values can
 * land), then apply every captured value to its control(s).
 */
export const applyDraft = (
  form: HTMLFormElement,
  entry: DraftEntry,
  addRow?: (repeaterName: string) => void,
): void => {
  if (addRow) {
    for (const [name, count] of Object.entries(entry.rows ?? {})) {
      const rowsRoot = form.querySelector<HTMLElement>(
        `[data-repeater="${CSS.escape(name)}"] [data-repeater-rows]`,
      );
      if (!rowsRoot) continue;
      while (rowsRoot.querySelectorAll<HTMLElement>("[data-repeater-row]").length < count) addRow(name);
    }
  }
  for (const item of entry.values ?? []) {
    applyDraftValue(form, item.key, item.value);
  }
};

const applyDraftValue = (form: HTMLFormElement, key: string, value: string | string[]): void => {
  const qualified = /^(.*)::([0-9]+)::(.+)$/.exec(key);
  const controls = qualified
    ? Array.from(
        form.querySelectorAll<Control>(
          `[data-repeater="${CSS.escape(qualified[1])}"] ` +
            `[data-repeater-row][data-row="${CSS.escape(qualified[2])}"] ` +
            `[name="${CSS.escape(qualified[3])}"]`,
        ),
      )
    : Array.from(form.querySelectorAll<Control>(`[name="${CSS.escape(key)}"]`));
  if (controls.length === 0) return;
  assignControls(controls, toList(value));
};

const assignControls = (controls: Control[], list: string[]): void => {
  for (const control of controls) {
    if (control instanceof HTMLInputElement && control.type === "file") continue;
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
      control.checked = list.includes(control.value.trim()) || (controls.length === 1 && list.length > 0);
      continue;
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      for (const option of Array.from(control.options)) option.selected = list.includes(option.value.trim());
      continue;
    }
    control.value = list[0] ?? "";
  }
};

/**
 * A guarded `localStorage` draft store. Every access is feature-detected and
 * wrapped, so a missing or throwing storage (private mode, sandboxed iframe)
 * yields no-op save/load/clear instead of crashing the form. `load` rejects
 * malformed or unknown-version entries.
 */
export const createDraftStore = (key: string): DraftStore => {
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };

  const load = (): DraftEntry | null => {
    const store = storage();
    if (!store) return null;
    try {
      const raw = store.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DraftEntry;
      if (parsed && typeof parsed === "object" && parsed.v === 1 && Array.isArray(parsed.values)) {
        return parsed;
      }
    } catch {
      /* malformed or unreadable — treat as no draft */
    }
    return null;
  };

  return {
    save(entry) {
      const store = storage();
      if (!store) return;
      try {
        store.setItem(key, JSON.stringify(entry));
      } catch {
        /* quota exceeded / security — persistence is best-effort */
      }
    },
    load,
    clear() {
      const store = storage();
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        /* best-effort */
      }
    },
  };
};