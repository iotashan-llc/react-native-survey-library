# Custom questions

This guide covers how to add your own question types to a survey rendered by
`@iotashan-llc/react-native-survey-library`. There are **two supported extension
paths**:

1. **[`ComponentCollection`](#1-componentcollection-recommended) (custom &
   composite)** — the standard SurveyJS mechanism. You register a **JSON
   template**; the library ships the React Native adapters that render it. **No
   RN component code is required.** This is the recommended path.
2. **[The low-level factories](#2-low-level-factories-rnquestionfactory--rnelementfactory)
   (`RNQuestionFactory` / `RNElementFactory`)** — you supply a fully custom React
   Native component for a question type or survey element key. Reach for this
   only when a JSON template can't express the native UI you need.

Both are exported from the package root. See also
[API.md → Custom questions](API.md#custom-questions) for the terse reference and
[DIFFERENCES.md](DIFFERENCES.md#custom--composite-questions-componentcollection-task-211)
for the web-vs-RN behavioral notes.

---

## 1. `ComponentCollection` (recommended)

survey-core's `ComponentCollection` lets you define a new question type entirely
in JSON — either a **custom** question (one wrapped question) or a **composite**
question (a panel of inner elements). Because you're describing the new type with
survey-core's own question/panel JSON, the renderer builds the live inner models
and renders them through its normal dispatcher — you write no RN code and get the
same inputs, theming, validation, and reactivity as any built-in question.

`ComponentCollection` is re-exported from the package root (which guarantees the
survey-core environment shim is applied first); you can also import it straight
from `survey-core`.

```tsx
import {
  ComponentCollection,
  Survey,
} from '@iotashan-llc/react-native-survey-library';
```

### Composite: a panel of inner elements

A **composite** wraps several inner elements. Provide `elementsJSON` (survey-core
element JSON). The library renders the live `contentPanel`, so each inner question
gets its own title/description/error chrome, and the composite's outer title comes
from the row wrapper. The wrapper is exposed as an accessibility `group` labeled
by the outer title.

```tsx
ComponentCollection.Instance.add({
  name: 'fullname',
  title: 'Full name',
  elementsJSON: [
    { type: 'text', name: 'first', title: 'First' },
    { type: 'text', name: 'last', title: 'Last' },
  ],
});
```

Use it by name in your survey JSON like any other type:

```tsx
const json = {
  elements: [{ type: 'fullname', name: 'applicant' }],
};

export function App() {
  return <Survey json={json} />;
}
```

A composite's **value is an object keyed by the inner element names** — e.g.
`{ applicant: { first: 'Ada', last: 'Lovelace' } }`. Setting the outer value
distributes into the inner inputs, and editing an inner input aggregates back up,
exactly as on web.

### Custom: one wrapped question

A **custom** question wraps a single inner question. Provide `questionJSON`. The
library renders that inner question's **input body only** — the outer custom
question owns the title, description, and error chrome (matching web's
`createQuestionElement(contentQuestion)`).

```tsx
ComponentCollection.Instance.add({
  name: 'shorttext',
  title: 'Short text',
  questionJSON: { type: 'text', maxLength: 20 },
});

// then in survey JSON: { type: 'shorttext', name: 'nickname' }
```

A custom question's **value is the inner scalar** (proxied through the outer
question). You can transform between what the outer model stores and what the
inner question shows with the standard `valueToQuestion` / `valueFromQuestion`
converters:

```tsx
ComponentCollection.Instance.add({
  name: 'doubler',
  questionJSON: { type: 'text', inputType: 'number' },
  // outer stores N; inner shows 2N; committing inner 2N stores N.
  valueToQuestion: (v) => (v == null ? v : v * 2),
  valueFromQuestion: (v) => (v == null ? v : v / 2),
});
```

If the inner question sets a `renderAs` override, the renderer dispatches on its
component name (renderer route) instead of the default template — so an inner
`{ type: 'boolean', renderAs: 'checkbox' }` renders the checkbox variant, just as
it would as a top-level question.

### Building elements/questions in code

Instead of static JSON you may supply a callback. `createQuestion` returns the
inner question (custom); `createElements(panel)` populates the panel (composite):

```tsx
ComponentCollection.Instance.add({
  name: 'cbcomposite',
  createElements: (panel) => {
    panel.addNewQuestion('text', 'only');
  },
});
```

### Malformed custom questions never crash

If a `createQuestion` callback returns `null`, the custom question has no inner
`contentQuestion` to render. Rather than crash, the adapter renders a non-throwing
empty placeholder and emits a **`custom-content-missing`** diagnostic (once per
question). See [diagnostics](#diagnostics) to observe these.

### What does NOT run: `onAfterRender`

`ComponentCollection`'s `onAfterRender` / `onAfterRenderContentElement` callbacks
receive a DOM `HTMLElement` on web. This renderer has no DOM and **does not fire
them** — the repo-wide no-`afterRender` posture. Custom/composite otherwise render
fully. If you used those callbacks purely for styling, use theme JSON instead. See
[DIFFERENCES.md → After-render callbacks](DIFFERENCES.md#after-render-callbacks-are-not-fired).

---

## 2. Low-level factories (`RNQuestionFactory` / `RNElementFactory`)

When you need a fully custom React Native component — a native widget that a JSON
template can't express, or you want to **replace** how a built-in type renders —
register it directly with one of the two factory singletons.

```tsx
import {
  RNQuestionFactory,
  RendererFactory,
} from '@iotashan-llc/react-native-survey-library';
```

`RNQuestionFactory` maps a **dispatch key** to a component. Whatever question the
survey model resolves to that key renders your component. The dispatch key follows
one rule (shared by the row dispatcher and the custom adapter, so it can never
drift):

- **Default-rendering question →** the question's `getTemplate()` (usually its
  type name). Registering under a built-in type name **replaces** that type's
  renderer for the whole app.
- **A question with a `renderAs` override →** its `getComponentName()`, which
  survey-core resolves through `RendererFactory` from the `(type, renderAs)` pair.
  This is the clean, non-destructive way to swap one question's renderer without
  shadowing the built-in type — but it takes two registrations plus the JSON flag:

```tsx
// 1. Register your native component under a component key.
RNQuestionFactory.registerQuestion('my-stepper', (props) => (
  <MyStepper {...props} />
));

// 2. Map (questionType, renderAs) -> that component key in survey-core.
RendererFactory.Instance.registerRenderer('text', 'stepper', 'my-stepper');

// 3. Select it in survey JSON with renderAs:
// { type: 'text', name: 'qty', renderAs: 'stepper' }
```

With that mapping, a `text` question whose `renderAs` is `"stepper"` reports
`getComponentName() === 'my-stepper'`, so it dispatches to your component. Without
step 2, an unrecognized `renderAs` resolves to `"default"` (the built-in
renderer), not your key.

### What your component receives

The dispatcher passes your creator a props object of shape:

```ts
interface QuestionElementBaseProps {
  question: Question; // the live survey-core question model
  creator?: unknown; // renderer creator context (pass through)
  isDisplayMode?: boolean;
}
```

Every dispatched question — factory hit or fallback — is wrapped by the library in
`QuestionChrome`, which renders the **title, description, and errors**. Your
component therefore renders the **input body only**. Read `props.question.value`
and write back through the question model. For text inputs, drive commits through
the draft/commit adapter (`DraftCommitAdapter`) rather than binding `onChangeText`
straight to `question.value`, so `textUpdateMode` is honored (invariant 3).

A minimal discrete-value component:

```tsx
import { Pressable, Text } from 'react-native';

function MyStepper({ question }: { question: Question }) {
  const value = Number(question.value ?? 0);
  return (
    <Pressable onPress={() => (question.value = value + 1)}>
      <Text>{value}</Text>
    </Pressable>
  );
}
```

> The library already registers every supported built-in type at import time.
> Registering the **same** dispatch key replaces the built-in renderer for every
> question of that type — prefer the `renderAs` route above to scope the override.

### Factory API

`RNQuestionFactory` (question components) and `RNElementFactory` (survey element
keys — pages, wrappers, per-question item components; a **disjoint** keyspace)
share the same shape:

```ts
registerQuestion(type, creator) / registerElement(type, creator): void
isQuestionRegistered(type) / isElementRegistered(type): boolean
getAllTypes(): string[]
createQuestion(type, props) / createElement(type, props): React.JSX.Element | null
```

A miss returns `null` (a clean miss — the registry is `Map`-backed, so exotic keys
like `toString` never resolve through the prototype chain). The unsupported-type
fallback lives **outside** the registry, so a `null` return is what routes a
question to the fallback below.

---

## Unsupported question types

When a question resolves to a dispatch key with no registered renderer, the
library never crashes (invariant 9). It renders a non-throwing fallback box
("Unsupported question type: <type>") and emits an **`unsupported-question-type`**
diagnostic once per (question, dispatch key).

You can replace the fallback's **presentation** without losing the diagnostic or
the reactive subscription (those stay owned by the wrapper):

```tsx
import {
  setUnsupportedQuestionRenderer,
  type UnsupportedQuestionProps,
} from '@iotashan-llc/react-native-survey-library';

setUnsupportedQuestionRenderer(function MyFallback(
  props: UnsupportedQuestionProps
) {
  return <MyOwnPlaceholder question={props.question} />;
});

// Restore the default box:
setUnsupportedQuestionRenderer(undefined);
```

The related exports `createUnsupportedQuestion`, `UnsupportedQuestion`,
`UnsupportedMissInfo`, and `UnsupportedQuestionRenderer` are available for hosts
that need to construct or type the fallback directly.

---

## Diagnostics

Both custom-question paths report structured diagnostics through the same seam
rather than throwing. Register a handler to observe them (the default is a
dev-only `console.warn`):

```tsx
import { setDiagnosticHandler } from '@iotashan-llc/react-native-survey-library';

setDiagnosticHandler((payload) => {
  if (payload.code === 'custom-content-missing') {
    console.warn('Custom question has no content:', payload.questionName);
  }
});
```

Relevant codes for this guide:

| Code | Meaning |
| --- | --- |
| `custom-content-missing` | A `ComponentCollection` `createQuestion` callback returned `null`; the custom question rendered an empty placeholder. |
| `unsupported-question-type` | A question resolved to a dispatch key with no registered renderer; the fallback box rendered. |

---

## Related docs

- [API.md → Custom questions](API.md#custom-questions) — terse export reference.
- [DIFFERENCES.md → Custom & composite questions](DIFFERENCES.md#custom--composite-questions-componentcollection-task-211)
  — web-vs-RN behavioral differences (`onAfterRender`, value shapes, malformed
  handling).
