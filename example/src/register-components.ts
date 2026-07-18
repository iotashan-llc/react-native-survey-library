/**
 * ComponentCollection custom/composite definitions used by the kitchen-sink
 * (task 2.11). Registered by App.tsx (this RN example) and mirrored by the
 * parity web page (`parity/index.html`) so both render the identical model.
 *
 * - `ks-custom-slug` (CUSTOM, questionJSON) — wraps a single text question; its
 *   value is the inner scalar.
 * - `ks-composite-fullname` (COMPOSITE, elementsJSON) — a panel of two text
 *   fields; its value is an object keyed by the inner element names.
 */
export const KITCHEN_SINK_COMPONENTS = [
  {
    name: 'ks-custom-slug',
    title: 'URL slug (custom)',
    questionJSON: {
      type: 'text',
      placeholder: 'my-survey',
      title: 'Slug',
    },
  },
  {
    name: 'ks-composite-fullname',
    title: 'Full name (composite)',
    elementsJSON: [
      { type: 'text', name: 'firstName', title: 'First name' },
      {
        type: 'text',
        name: 'lastName',
        title: 'Last name',
        startWithNewLine: false,
      },
    ],
  },
] as const;

interface ComponentCollectionLike {
  add(json: unknown): void;
  getCustomQuestionByName?(name: string): unknown;
}

/** Idempotent: skips a name already registered (the singleton persists across
 * Fast Refresh / repeated imports). */
export function registerKitchenSinkComponents(
  instance: ComponentCollectionLike
): void {
  for (const def of KITCHEN_SINK_COMPONENTS) {
    if (instance.getCustomQuestionByName?.(def.name)) continue;
    instance.add(def);
  }
}
