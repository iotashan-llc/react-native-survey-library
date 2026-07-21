/**
 * `imagemap` fallback (task 5.4): react-native-svg is a batteries-included
 * core peerDependency, but if it is somehow absent (a consumer who stripped
 * it, or jest without it) the question must NOT crash (invariant 9). The
 * lazy `loadImageMapSvg()` resolves `null` and the renderer degrades to a
 * non-throwing fallback: a structured `imagemap-lib-unavailable` diagnostic
 * plus the PLAIN base image (still URI-policy-gated) with no tappable
 * hotspot overlay — never a throw, never the unsupported panel.
 *
 * Absence is simulated by mocking the module to an object with no usable
 * shape primitives, which `loadImageMapSvg()` resolves to `null` (its
 * try/catch also covers a hard MODULE_NOT_FOUND). A separate file keeps the
 * per-file module registry — and thus the memoized loader cache — isolated
 * from the primitives-present suite.
 */
jest.mock('react-native-svg', () => ({ __esModule: true }));

import { render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import { setDiagnosticHandler } from '../../diagnostics';
import '../../factories/register-all';
import { ImageMapQuestion, loadImageMapSvg } from '../ImageMapQuestion';

const IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

function makeImageMap(name = 'im'): Question {
  const model = new Model({
    elements: [
      {
        type: 'imagemap',
        name,
        imageLink: IMG,
        areas: [{ value: 'a', shape: 'rect', coords: '0,0,10,10', text: 'A' }],
      },
    ],
  });
  return model.getQuestionByName(name)!;
}

describe('imagemap — fallback when react-native-svg is absent', () => {
  afterEach(() => setDiagnosticHandler(undefined));

  it('loadImageMapSvg() resolves null with no usable shape primitives', () => {
    expect(loadImageMapSvg()).toBeNull();
  });

  it('renders the plain base image + fallback marker, no overlay, no unsupported panel, no throw', () => {
    const question = makeImageMap();
    expect(() =>
      render(<ImageMapQuestion question={question} creator={{}} />)
    ).not.toThrow();
    expect(screen.getByTestId('imagemap-image-im')).toBeTruthy();
    expect(screen.getByTestId('imagemap-fallback-im')).toBeTruthy();
    expect(screen.queryByTestId('imagemap-svg-im')).toBeNull();
    expect(screen.queryByTestId('imagemap-area-a')).toBeNull();
    expect(screen.queryByTestId('unsupported-question-panel')).toBeNull();
  });

  it('emits an imagemap-lib-unavailable diagnostic (once)', () => {
    const codes: string[] = [];
    setDiagnosticHandler((payload) => codes.push(payload.code));
    render(<ImageMapQuestion question={makeImageMap()} creator={{}} />);
    expect(codes.filter((c) => c === 'imagemap-lib-unavailable')).toHaveLength(
      1
    );
  });
});
