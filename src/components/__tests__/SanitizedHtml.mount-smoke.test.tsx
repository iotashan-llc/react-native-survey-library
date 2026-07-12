/**
 * Mount smoke test (design: docs/design/0.9-html-strategy.md, "Renderer
 * selection", "Stop/go gate"):
 *
 *   "Stop/go gate: acceptance = exact-package tests on RN 0.86 New Arch
 *   — Jest mount proves JS/React compat ONLY; the real gate is the 0.2
 *   release-gate smoke app rendering the full allowlisted tag set
 *   (nesting, lists, tables, images, RTL, a11y roles) on both platforms.
 *   Failure triggers the named fallback: a spike task for a minimal
 *   internal renderer..."
 *
 * This file is the JS/React-19 half of that gate ONLY: it proves
 * `<SanitizedHtml>` mounts `@native-html/render` (exact installed
 * version, RN 0.86 New Architecture, React 19.2, react-test-renderer)
 * without throwing, for a document exercising every tag in the base
 * allowlist plus nesting/lists/tables/images. It does NOT, and cannot,
 * prove visual correctness, RTL layout, or a11y role output on a real
 * device/simulator — that is the 0.2 release-gate smoke app's job on
 * both platforms, deliberately out of scope here (design: "Non-goals"
 * for 0.9 lists no release-gate work; that is a separate, later task).
 */
import { render, screen } from '@testing-library/react-native';
import { SanitizedHtml } from '../SanitizedHtml';

// Exercises every tag in the BASE allowlist (relaxedFormatting off) at
// least once, with the nesting/lists/tables/images the design's stop/go
// gate calls out by name. `img` uses a strict data:image URI so the test
// needs no imageUriConfig origin allowlist to reach the renderer.
const FULL_ALLOWLIST_HTML = `
  <h1>Heading 1</h1>
  <h2>Heading 2</h2>
  <h3>Heading 3</h3>
  <h4>Heading 4</h4>
  <h5>Heading 5</h5>
  <h6>Heading 6</h6>
  <p>
    A paragraph with <strong>strong</strong>, <b>bold</b>,
    <em>emphasis</em>, <i>italic</i>, <u>underline</u>,
    <s>strikethrough</s>, H<sub>2</sub>O and E=mc<sup>2</sup>.
  </p>
  <hr>
  <p>Line one<br>Line two</p>
  <blockquote>
    <p>A nested blockquote paragraph with <code>inline code</code>.</p>
  </blockquote>
  <pre><code>const x = 1;</code></pre>
  <ul>
    <li>Unordered item one</li>
    <li>Unordered item two with <span>a span</span></li>
  </ul>
  <ol>
    <li>Ordered item one</li>
    <li>Ordered item two</li>
  </ol>
  <table>
    <thead>
      <tr><th>Header A</th><th>Header B</th></tr>
    </thead>
    <tbody>
      <tr><td>Cell 1</td><td>Cell 2</td></tr>
      <tr><td>Cell 3</td><td>Cell 4</td></tr>
    </tbody>
  </table>
  <p>
    A link: <a href="https://example.com/x">visit example.com</a>
  </p>
  <p>
    An image:
    <img src="data:image/png;base64,iVBORw0KGgo=" alt="a red dot" width="16" height="16">
  </p>
  <div>A plain div wrapping <span>a span</span>.</div>
`;

describe('<SanitizedHtml> — mount smoke test (JS/React-19 half of the stop/go gate)', () => {
  it('mounts the full base-allowlisted tag set without throwing', () => {
    expect(() => {
      render(<SanitizedHtml html={FULL_ALLOWLIST_HTML} contentWidth={375} />);
    }).not.toThrow();
  });

  it('renders text content from every nesting level (headings, list items, table cells, blockquote)', () => {
    render(<SanitizedHtml html={FULL_ALLOWLIST_HTML} contentWidth={375} />);

    expect(screen.getByText('Heading 1')).toBeTruthy();
    expect(screen.getByText('Heading 6')).toBeTruthy();
    expect(screen.getByText(/Unordered item one/)).toBeTruthy();
    expect(screen.getByText(/Ordered item two/)).toBeTruthy();
    expect(screen.getByText('Header A')).toBeTruthy();
    expect(screen.getByText('Cell 3')).toBeTruthy();
    expect(screen.getByText(/nested blockquote paragraph/)).toBeTruthy();
    expect(screen.getByText('visit example.com')).toBeTruthy();
  });

  it('mounts the relaxedFormatting-widened tag set (mark/small/del/ins) without throwing', () => {
    const html =
      '<p><mark>marked</mark> <small>small</small> <del>deleted</del> <ins>inserted</ins></p>';
    expect(() => {
      render(
        <SanitizedHtml html={html} relaxedFormatting contentWidth={375} />
      );
    }).not.toThrow();
    expect(screen.getByText('marked', { exact: false })).toBeTruthy();
  });

  it('mounts an empty document without throwing', () => {
    expect(() => {
      render(<SanitizedHtml html="" contentWidth={375} />);
    }).not.toThrow();
  });

  it('mounts a document that trips the resource-bounds fallback without throwing (never a partial render)', () => {
    const huge = '<p>' + 'a'.repeat(300_000) + '</p>';
    expect(() => {
      render(<SanitizedHtml html={huge} contentWidth={375} />);
    }).not.toThrow();
  });
});
