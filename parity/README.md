# Web parity harness

Renders the SAME kitchen-sink SurveyModel JSON through the official web
renderer (`survey-js-ui`, pinned to the tested `survey-core` version) for
side-by-side styling comparison against the RN example — the M2+ styling
acceptance criterion: compare at **phone and tablet, portrait and
landscape**, at each task's final-styling review.

## Regenerate the JSON (after editing example/src/kitchen-sink.ts)

```sh
node scripts/build-parity.mjs
```

## Serve

```sh
cd parity && python3 -m http.server 8090
# http://localhost:8090/index.html?theme=DefaultLight|DefaultDark|SharpLight|ContrastDark
```

## Comparison viewports (CSS pt, matching the simulators)

| Form factor | Native simulator | Web viewport |
|---|---|---|
| Phone portrait | iPhone 17 Pro | 402×874 |
| Phone landscape | iPhone 17 Pro | 874×402 |
| Tablet portrait | iPad Pro 13" | 1032×1376 |
| Tablet landscape | iPad Pro 13" | 1376×1032 |

Native shots: `xcrun simctl io <udid> screenshot` (rotate the sim for
landscape: Device → Rotate, or `xcrun simctl ui <udid> appearance` is NOT
rotation — use Hardware rotate / agent-device).
Web shots: chrome-devtools MCP — `resize_page` to the viewport, `reload`
(the banner stamps the size), `take_screenshot` into `parity/shots/`.

`parity/shots/` is scratch output — gitignored.
