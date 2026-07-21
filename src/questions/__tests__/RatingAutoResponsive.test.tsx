/**
 * rating `displayMode:"auto"` responsive collapse to dropdown (task 2.5c,
 * measurement-driven, web parity). Reuses the PROVEN buttongroup 2.5b
 * pattern: an always-mounted outer wrapper View reports the live
 * available width via `onLayout`, the rate-buttons ScrollView reports the
 * intrinsic required width via `onContentSizeChange`, and core's protected
 * `processResponsiveness(requiredWidth, availableWidth)` owns the ±2
 * deadband + the `renderAs` flip. CORE gates the displayMode: `"buttons"`
 * and `"dropdown"` never flip; only `"auto"` flips both directions.
 *
 * The rating dispatch SPLITS into two components (unlike buttongroup's one
 * self-branching component): `RatingQuestion` (template "rating",
 * renderAs "default") ↔ `RatingDropdownQuestion` (renderer
 * "sv-rating-dropdown", renderAs "dropdown"). Auto-collapse SWAPS them via
 * SurveyRowElement re-dispatching on the renderAs notification. A
 * per-question `ResponsivenessMeasurer` (WeakMap-keyed) carries the cached
 * required + live available widths ACROSS that swap — the two-component
 * analog of buttongroup's single instance.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { RatingQuestion } from '../RatingQuestion';
import { RatingDropdownQuestionElement } from '../RatingDropdownQuestion';
import { Survey } from '../../survey/Survey';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';

interface ResponsiveRating {
  renderAs: string;
  displayMode: string;
  processResponsiveness(requiredWidth: number, availableWidth: number): boolean;
  dropdownListModelValue?: unknown;
}

const resp = (q: Question): ResponsiveRating =>
  q as unknown as ResponsiveRating;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function createRating(
  extra: Record<string, unknown> = {},
  name = 'rate'
): { model: Model; question: Question } {
  const model = new Model({
    elements: [{ type: 'rating', name, rateCount: 10, ...extra }],
  });
  return { model, question: model.getQuestionByName(name)! };
}

/** The always-mounted wrapper's live viewport width. */
function fireWrapperLayout(width: number, name = 'rate'): void {
  fireEvent(
    screen.getByTestId(`sv-rating-measure-wrapper-${name}`, {
      includeHiddenElements: true,
    }),
    'layout',
    { nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } } }
  );
}

/** The rate-buttons ScrollView's intrinsic content width. */
function fireContentWidth(width: number, name = 'rate'): void {
  fireEvent(
    screen.getByTestId(`sv-rating-scroll-${name}`, {
      includeHiddenElements: true,
    }),
    'contentSizeChange',
    width,
    48
  );
}

function spyResp(question: Question): jest.SpyInstance {
  return jest.spyOn(
    question as unknown as {
      processResponsiveness(r: number, a: number): boolean;
    },
    'processResponsiveness'
  );
}

/** Render the buttons view (template "rating") directly. */
function renderButtons(question: Question): void {
  render(<RatingQuestion question={question} creator={{}} />);
}

/** Render a whole Survey so the real SurveyRowElement dispatch swaps
 * RatingQuestion ↔ RatingDropdownQuestion on the renderAs flip. Fires the
 * shell's row layouts (rows defer their children until the first onLayout,
 * 1.3 D3). */
function renderSurvey(model: Model): void {
  render(<Survey model={model as never} />);
  for (const row of screen.getAllByTestId('sv-row')) {
    fireEvent(row, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
    });
  }
}

// ————————————————————————————————————————————————————————————————
// RatingQuestion (buttons view) — the auto→dropdown measurement seam
// ————————————————————————————————————————————————————————————————

describe('RatingQuestion — displayMode:"auto" measurement seam', () => {
  afterEach(() => jest.restoreAllMocks());

  it('flips renderAs to "dropdown" when the rate row overflows (layout → content)', () => {
    const { question } = createRating();
    renderButtons(question);
    fireWrapperLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
  });

  it('flips with the callbacks in the opposite order (content → layout)', () => {
    const { question } = createRating();
    renderButtons(question);
    fireContentWidth(800);
    fireWrapperLayout(300);
    expect(resp(question).renderAs).toBe('dropdown');
  });

  it('a fitting row stays on the buttons (renderAs "default")', () => {
    const { question } = createRating();
    renderButtons(question);
    fireWrapperLayout(300);
    fireContentWidth(280);
    expect(resp(question).renderAs).toBe('default');
  });

  it('calls the adapter only on changed finite pairs — exact call count', () => {
    const { question } = createRating();
    const spy = spyResp(question);
    renderButtons(question);
    fireWrapperLayout(300); // one width known → no call
    expect(spy).not.toHaveBeenCalled();
    fireContentWidth(500); // call 1 → compact
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(500, 300);
    fireWrapperLayout(300); // identical pair → no call
    expect(spy).toHaveBeenCalledTimes(1);
    fireWrapperLayout(301); // changed pair → call 2
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(500, 301);
    fireWrapperLayout(600); // call 3 → back to default
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenLastCalledWith(500, 600);
    expect(resp(question).renderAs).toBe('default');
  });

  it('never calls the adapter for non-finite or non-positive widths', () => {
    const { question } = createRating();
    const spy = spyResp(question);
    renderButtons(question);
    fireWrapperLayout(0);
    fireWrapperLayout(Number.NaN);
    fireWrapperLayout(Number.POSITIVE_INFINITY);
    fireWrapperLayout(-50);
    fireContentWidth(800); // valid required, but no valid available yet
    expect(spy).not.toHaveBeenCalled();
    fireWrapperLayout(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(800, 300);
  });

  it('rounds fractional widths before the adapter and dedupes on the ROUNDED pair', () => {
    const { question } = createRating();
    const spy = spyResp(question);
    renderButtons(question);
    fireContentWidth(800.6);
    fireWrapperLayout(300.4);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(801, 300);
    fireWrapperLayout(300.2); // rounds to 300 → unchanged → no call
    fireWrapperLayout(299.7); // rounds to 300 → unchanged → no call
    expect(spy).toHaveBeenCalledTimes(1);
    for (const call of spy.mock.calls) {
      for (const n of call as number[]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });

  it('design mode never measures into the adapter (buttons stay editable)', () => {
    const { model, question } = createRating();
    model.setDesignMode(true);
    const spy = spyResp(question);
    renderButtons(question);
    fireWrapperLayout(300);
    fireContentWidth(800);
    expect(spy).not.toHaveBeenCalled();
    expect(resp(question).renderAs).not.toBe('dropdown');
  });

  it('an invalid (zero-width) WRAPPER sample invalidates the cached available width', () => {
    const { question } = createRating();
    const spy = spyResp(question);
    renderButtons(question);
    fireWrapperLayout(300);
    fireContentWidth(800); // (800, 300) → compact
    expect(spy).toHaveBeenCalledTimes(1);
    fireWrapperLayout(0); // rotation-style transition
    fireContentWidth(820); // must PAUSE, not run with stale 300
    expect(spy).toHaveBeenCalledTimes(1);
    fireWrapperLayout(900); // fresh valid layout resumes
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(820, 900);
  });

  it('an invalid (zero-width) CONTENT sample invalidates the cached required width', () => {
    const { question } = createRating();
    const spy = spyResp(question);
    renderButtons(question);
    fireWrapperLayout(300);
    fireContentWidth(800); // (800, 300) → compact
    expect(spy).toHaveBeenCalledTimes(1);
    fireContentWidth(0); // collapses to zero during a transition
    fireWrapperLayout(900); // stale required 800 must not drive this
    expect(spy).toHaveBeenCalledTimes(1);
    fireContentWidth(820); // fresh content sample resumes
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(820, 900);
  });
});

describe('RatingQuestion — displayMode:"buttons" is unaffected (never collapses)', () => {
  it('mounts NO measuring seam and never constructs a compact VM', () => {
    const { question } = createRating({ displayMode: 'buttons' });
    const spy = spyResp(question);
    renderButtons(question);
    expect(
      screen.queryByTestId('sv-rating-measure-wrapper-rate', {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(
      screen.queryByTestId('sv-rating-scroll-rate', {
        includeHiddenElements: true,
      })
    ).toBeNull();
    // The buttons row still renders normally.
    expect(screen.getByTestId('sv-rating-row-rate')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(resp(question).renderAs).toBe('default');
  });
});

// ————————————————————————————————————————————————————————————————
// RatingDropdownQuestion — displayMode:"dropdown" stays UNCHANGED (2.5a)
// ————————————————————————————————————————————————————————————————

describe('RatingDropdownQuestion — displayMode:"dropdown" is unaffected (always collapsed)', () => {
  it('renders NO measuring wrapper — the 2.5a collapsed control only', async () => {
    const { question } = createRating({ displayMode: 'dropdown' });
    const stack = createOverlayStack<OverlayPayload>();
    render(
      <OverlayContext.Provider value={stack}>
        <RatingDropdownQuestionElement question={question} creator={{}} />
      </OverlayContext.Provider>
    );
    await flush();
    expect(
      screen.queryByTestId('sv-rating-measure-wrapper-rate', {
        includeHiddenElements: true,
      })
    ).toBeNull();
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
  });
});

// ————————————————————————————————————————————————————————————————
// End-to-end through <Survey>: the real dispatch swap (both directions)
// ————————————————————————————————————————————————————————————————

describe('Rating auto-collapse — end-to-end swap through <Survey>', () => {
  it('narrow → collapses to the dropdown overlay (buttons row gone, collapsed control shown)', async () => {
    const { model, question } = createRating();
    renderSurvey(model);
    fireWrapperLayout(300);
    fireContentWidth(800);
    await flush();
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-row-rate')).toBeNull();
  });

  it('wide → renders the buttons row (no collapse)', async () => {
    const { model, question } = createRating();
    renderSurvey(model);
    fireWrapperLayout(900);
    fireContentWidth(300);
    await flush();
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-rating-row-rate')).toBeTruthy();
    expect(screen.queryByTestId('sv-rating-dropdown-rate')).toBeNull();
  });

  it('a runtime width change flips BOTH directions', async () => {
    const { model, question } = createRating();
    renderSurvey(model);
    // Narrow → collapse.
    fireWrapperLayout(300);
    fireContentWidth(800);
    await flush();
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
    // Widen → back to buttons (measures the collapsed control's wrapper).
    fireWrapperLayout(900);
    await flush();
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-rating-row-rate')).toBeTruthy();
    // Narrow again → collapse again. The required width is still cached on
    // the per-question measurer, so a layout event alone re-collapses (no
    // fresh content event needed — the buttongroup cached-required pin).
    fireWrapperLayout(300);
    await flush();
    expect(resp(question).renderAs).toBe('dropdown');
    expect(screen.getByTestId('sv-rating-dropdown-rate')).toBeTruthy();
  });

  it('cached required width: widening WHILE COLLAPSED flips back with NO new content event', async () => {
    const { model, question } = createRating();
    renderSurvey(model);
    fireWrapperLayout(300);
    fireContentWidth(800); // (800, 300) → collapse
    await flush();
    expect(resp(question).renderAs).toBe('dropdown');
    // Flip-back must NOT require a fresh content event: the required width
    // measured before the collapse is carried across the swap.
    fireWrapperLayout(900);
    await flush();
    expect(resp(question).renderAs).toBe('default');
    expect(screen.getByTestId('sv-rating-row-rate')).toBeTruthy();
  });

  it('the collapsed control opens the shared overlay sheet with the rate rows', async () => {
    const { model, question } = createRating();
    renderSurvey(model);
    fireWrapperLayout(300);
    fireContentWidth(800);
    await flush();
    const control = screen.getByTestId('sv-rating-dropdown-rate');
    fireEvent.press(control);
    await flush();
    expect(resp(question).dropdownListModelValue).toBeDefined();
    // A rate row is rendered inside the opened sheet.
    expect(screen.getByTestId('sv-list-item-1')).toBeTruthy();
  });
});

// ————————————————————————————————————————————————————————————————
// StrictMode replay safety
// ————————————————————————————————————————————————————————————————

describe('Rating auto-collapse — StrictMode replay', () => {
  it('the buttons view still flips renderAs under a StrictMode mount replay', () => {
    const { question } = createRating();
    render(
      <React.StrictMode>
        <RatingQuestion question={question} creator={{}} />
      </React.StrictMode>
    );
    fireWrapperLayout(300);
    fireContentWidth(800);
    expect(resp(question).renderAs).toBe('dropdown');
  });
});
