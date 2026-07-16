# @iotashan-llc/react-native-survey-library

React Native rendering engine for the [SurveyJS Form Library](https://surveyjs.io/form-library/documentation/overview) 2.x. Pass your existing SurveyModel JSON + Theme JSON **unmodified** and get a native survey — no WebView.

- **Runtime/rendering only** — no Creator, no Dashboard, no Analytics.
- Targets **Expo SDK 57** (React Native 0.86, React 19.2, New Architecture), iOS + Android. Web users keep the official `survey-react-ui`.
- `survey-core` stays an **unmodified peer dependency** — the same model, expressions, validation, and theme JSON you run on web.

## Installation

```sh
npm install @iotashan-llc/react-native-survey-library survey-core
```

Capability peer dependencies (batteries-included — install once):

```sh
npx expo install react-native-svg react-native-gesture-handler react-native-reanimated
npm install @native-html/render
```

## Quick start

```tsx
import { Survey } from '@iotashan-llc/react-native-survey-library';
import { DefaultLight } from 'survey-core/themes';

const json = {
  title: 'Feedback',
  pages: [
    {
      elements: [
        { type: 'text', name: 'name', title: 'Your name', isRequired: true },
        { type: 'rating', name: 'score', title: 'Rate us', rateType: 'stars' },
        { type: 'comment', name: 'notes', title: 'Anything else?' },
      ],
    },
  ],
};

export default function FeedbackScreen() {
  return (
    <Survey
      json={json}
      theme={DefaultLight}
      onComplete={(sender) => console.log(sender.data)}
    />
  );
}
```

`json` is preflighted before model construction (URL policy below). Prefer owning the model? Pass `model={new Model(json)}` instead — host-owned models are treated as trusted and never disposed by the component.

## Supported in v0.1 (M1)

Question types: `text` (all 13 inputTypes, input masks, character counter), `comment`, `boolean` (default/checkbox/radio renderAs), `checkbox`, `radiogroup`, `rating` (numbers/stars/smileys/custom rateValues), `expression` — plus panels, multi-element rows, pages, navigation (start/prev/next/preview/complete), percentage progress bar, survey header (title/description/logo), completed/loading/empty state frames, and the full theme JSON pipeline (golden-tested against all 40 `survey-core/themes`).

Anything else renders a **non-throwing fallback panel** with a structured diagnostic — an unsupported type never crashes the survey.

## Security defaults (different from web — deliberate)

- HTML content (`completedHtml`, descriptions, …) renders through a sanitizer: tag/attribute allowlist, no inline CSS, resource bounds.
- Every URL passes a central scheme/origin policy: `https:` only for automatic fetches, and **no remote origin is fetched until you allowlist it** via the `uriPolicy` prop (`{ allowedOrigins: ['https://api.example.com'] }`). One config covers the JSON preflight and every render-time sink.
- Links never auto-navigate — supply `onLinkPress` and decide in the host app.

See [docs/DIFFERENCES.md](docs/DIFFERENCES.md) for every observable divergence from `survey-react-ui`, each with its rationale and workaround.

## Example app

```sh
cd example
npx expo run:ios   # kitchen-sink survey + theme switcher
```

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
