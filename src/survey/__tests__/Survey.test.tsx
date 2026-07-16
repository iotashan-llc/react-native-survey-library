/**
 * `<Survey>` root — model ownership, XOR, preflight-before-construction,
 * theme application, page dispatch, ref handle (design:
 * docs/design/1.1-survey-root.md, test plan #2/#3/#4/#6/#7/#8).
 */
import * as React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Model } from '../../core/facade';
import type { SurveyModel } from '../../core/facade';
import { Survey } from '../Survey';
import type { SurveyRefHandle } from '../Survey';
import { RNElementFactory } from '../../factories/ElementFactory';
import { setDiagnosticHandler } from '../../diagnostics';
import type { DiagnosticPayload } from '../../diagnostics';

const JSON_A = {
  pages: [
    { name: 'p1', elements: [{ type: 'text', name: 'q1' }] },
    { name: 'p2', elements: [{ type: 'text', name: 'q2' }] },
  ],
};

function captureDiagnostics(): DiagnosticPayload[] {
  const seen: DiagnosticPayload[] = [];
  setDiagnosticHandler((payload) => seen.push(payload));
  return seen;
}

describe('<Survey> model ownership', () => {
  afterEach(() => {
    setDiagnosticHandler(undefined);
  });

  it('constructs an owned model from json and exposes it on the ref', () => {
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey json={JSON_A} ref={ref} />);
    const model = ref.current?.model;
    expect(model).toBeTruthy();
    expect(model!.getQuestionByName('q1')).toBeTruthy();
  });

  it('disposes the owned model on unmount', () => {
    const ref = React.createRef<SurveyRefHandle>();
    const { unmount } = render(<Survey json={JSON_A} ref={ref} />);
    const model = ref.current!.model!;
    unmount();
    expect(model.isDisposed).toBe(true);
  });

  it('never disposes a host-owned model', () => {
    const model = new Model(JSON_A);
    const ref = React.createRef<SurveyRefHandle>();
    const { unmount } = render(<Survey model={model} ref={ref} />);
    expect(ref.current?.model).toBe(model);
    unmount();
    expect(model.isDisposed).toBe(false);
  });

  it('model wins over json when both are passed, with a conflicting-props diagnostic', () => {
    const seen = captureDiagnostics();
    const model = new Model(JSON_A);
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey model={model} json={JSON_A} ref={ref} />);
    expect(ref.current?.model).toBe(model);
    expect(seen).toContainEqual(
      expect.objectContaining({
        code: 'survey-root-diagnostic',
        rootCode: 'conflicting-props',
      })
    );
  });

  it('renders no survey shell and reports a diagnostic when neither json nor model is given', () => {
    const seen = captureDiagnostics();
    const ref = React.createRef<SurveyRefHandle>();
    const { queryByTestId } = render(<Survey ref={ref} />);
    expect(ref.current?.model).toBeNull();
    expect(queryByTestId('survey-root')).toBeNull();
    expect(seen).toContainEqual(
      expect.objectContaining({
        code: 'survey-root-diagnostic',
        rootCode: 'missing-model',
      })
    );
  });

  it('does not recreate the model for a deep-equal but new-reference json', () => {
    const ref = React.createRef<SurveyRefHandle>();
    const { rerender } = render(<Survey json={JSON_A} ref={ref} />);
    const first = ref.current!.model;
    rerender(<Survey json={JSON.parse(JSON.stringify(JSON_A))} ref={ref} />);
    expect(ref.current!.model).toBe(first);
    expect(first!.isDisposed).toBe(false);
  });

  it('recreates on json content change: old owned model disposed, new one live', () => {
    const ref = React.createRef<SurveyRefHandle>();
    const { rerender } = render(<Survey json={JSON_A} ref={ref} />);
    const first = ref.current!.model!;
    const changed = {
      pages: [{ name: 'p1', elements: [{ type: 'text', name: 'other' }] }],
    };
    rerender(<Survey json={changed} ref={ref} />);
    const second = ref.current!.model!;
    expect(second).not.toBe(first);
    expect(first.isDisposed).toBe(true);
    expect(second.isDisposed).toBe(false);
    expect(second.getQuestionByName('other')).toBeTruthy();
  });

  it('swapping the model prop rewires without disposing the old host model', () => {
    const modelA = new Model(JSON_A);
    const modelB = new Model(JSON_A);
    const ref = React.createRef<SurveyRefHandle>();
    const { rerender } = render(<Survey model={modelA} ref={ref} />);
    rerender(<Survey model={modelB} ref={ref} />);
    expect(ref.current?.model).toBe(modelB);
    expect(modelA.isDisposed).toBe(false);
  });

  it('strips a disallowed choicesByUrl BEFORE model construction and reports it', () => {
    const seen = captureDiagnostics();
    const json = {
      elements: [
        {
          type: 'dropdown',
          name: 'q1',
          choicesByUrl: { url: 'https://evil.example/countries' },
        },
      ],
    };
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey json={json} ref={ref} />);
    const question = ref.current!.model!.getQuestionByName('q1') as unknown as {
      choicesByUrl: { url: string };
    };
    expect(question.choicesByUrl.url).toBeFalsy();
    expect(seen).toContainEqual(
      expect.objectContaining({
        code: 'survey-json-blocked-url',
        context: 'choicesByUrl',
        reason: 'origin-not-allowlisted',
      })
    );
  });

  it('StrictMode remount simulation leaves the owned model usable', () => {
    const ref = React.createRef<SurveyRefHandle>();
    render(
      <React.StrictMode>
        <Survey json={JSON_A} ref={ref} />
      </React.StrictMode>
    );
    const model = ref.current!.model!;
    expect(model.isDisposed).toBe(false);
    act(() => {
      model.setValue('q1', 'hello');
    });
    expect(model.getValue('q1')).toBe('hello');
  });
});

describe('<Survey> theme', () => {
  it('applies the theme prop to the model on mount and on theme change, never when absent', () => {
    const model = new Model(JSON_A);
    const applied: unknown[] = [];
    jest.spyOn(model, 'applyTheme').mockImplementation((theme) => {
      applied.push(theme);
    });

    const { rerender } = render(<Survey model={model} />);
    expect(applied).toHaveLength(0); // no theme prop -> no call

    const themeA = { cssVariables: { '--sjs-primary-backcolor': '#123456' } };
    rerender(<Survey model={model} theme={themeA} />);
    expect(applied).toEqual([themeA]);

    rerender(<Survey model={model} theme={themeA} />);
    expect(applied).toEqual([themeA]); // unchanged theme -> no re-apply

    const themeB = { cssVariables: { '--sjs-primary-backcolor': '#654321' } };
    rerender(<Survey model={model} theme={themeB} />);
    expect(applied).toEqual([themeA, themeB]);
  });
});

describe('<Survey> page dispatch', () => {
  it("dispatches the active page through the element factory 'sv-page' key with {survey, page}", () => {
    const received: Array<{ survey: unknown; page: { name: string } }> = [];
    RNElementFactory.registerElement<{
      survey: SurveyModel;
      page: { name: string };
    }>('sv-page', (props) => {
      received.push(props);
      return <Text testID="page-stub">{props.page.name}</Text>;
    });
    const ref = React.createRef<SurveyRefHandle>();
    const { getByTestId } = render(<Survey json={JSON_A} ref={ref} />);
    expect(getByTestId('page-stub').props.children).toBe('p1');
    expect(received[received.length - 1]!.survey).toBe(ref.current!.model);
  });

  it("honors the model's pageComponent override as the dispatch key", () => {
    RNElementFactory.registerElement('custom-page', () => (
      <Text testID="custom-page-stub">custom</Text>
    ));
    const model = new Model(JSON_A);
    (model as unknown as { pageComponent: string }).pageComponent =
      'custom-page';
    const { getByTestId } = render(<Survey model={model} />);
    expect(getByTestId('custom-page-stub')).toBeTruthy();
  });

  it('renders no page (and does not crash) when the survey completes', () => {
    RNElementFactory.registerElement('sv-page', () => (
      <Text testID="page-stub">page</Text>
    ));
    const model = new Model(JSON_A);
    const { queryByTestId } = render(<Survey model={model} />);
    expect(queryByTestId('page-stub')).toBeTruthy();
    act(() => {
      model.doComplete();
    });
    expect(queryByTestId('page-stub')).toBeNull();
  });

  it('an unregistered page key renders an empty shell without crashing', () => {
    // fresh module registry per test FILE, but 'sv-page' may have been
    // registered by earlier tests in THIS file — use a model-level
    // override key that is definitely unregistered.
    const model = new Model(JSON_A);
    (model as unknown as { pageComponent: string }).pageComponent =
      'never-registered';
    const { getByTestId } = render(<Survey model={model} />);
    expect(getByTestId('survey-root')).toBeTruthy();
  });
});

describe('<Survey> ref handle', () => {
  it('focusQuestion delegates to model.focusQuestion', () => {
    const model = new Model(JSON_A);
    const spy = jest.spyOn(model, 'focusQuestion').mockReturnValue(true);
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey model={model} ref={ref} />);
    expect(ref.current!.focusQuestion('q1')).toBe(true);
    expect(spy).toHaveBeenCalledWith('q1');
  });

  it('helpers no-op safely with no model', () => {
    const ref = React.createRef<SurveyRefHandle>();
    render(<Survey ref={ref} />);
    expect(ref.current!.model).toBeNull();
    expect(ref.current!.focusQuestion('q1')).toBe(false);
    expect(() => ref.current!.scrollToTop()).not.toThrow();
  });
});

describe('<Survey> responsive narrow', () => {
  it('root layout below 600pt wide calls survey.setIsMobile(true); wide layout resets it', () => {
    const model = new Model(JSON_A);
    const calls: Array<boolean | undefined> = [];
    jest.spyOn(model, 'setIsMobile').mockImplementation((v?: boolean) => {
      calls.push(v);
    });
    const { getByTestId } = render(<Survey model={model} />);
    const root = getByTestId('survey-root');
    act(() => {
      root.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 800, x: 0, y: 0 } },
      });
    });
    expect(calls[calls.length - 1]).toBe(true);
    act(() => {
      root.props.onLayout({
        nativeEvent: { layout: { width: 900, height: 800, x: 0, y: 0 } },
      });
    });
    expect(calls[calls.length - 1]).toBe(false);
  });
});

describe('<Survey> root width (review round 1: 1.3 contract owned by 1.1)', () => {
  const PAGE = { elements: [{ type: 'text', name: 'q1' }] };

  function rootStyle(
    getByTestId: (id: string) => { props: { style?: unknown } }
  ): Record<string, unknown> {
    const style = getByTestId('survey-root').props.style;
    return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  }

  it('a static widthMode + px width constrains the root (maxWidth, centered)', () => {
    const model = new Model({ widthMode: 'static', width: '600px', ...PAGE });
    const { getByTestId } = render(<Survey model={model} />);
    const style = rootStyle(getByTestId);
    expect(style.maxWidth).toBe(600);
    expect(style.alignSelf).toBe('center');
    expect(style.width).toBe('100%');
  });

  it('a percent width passes through as-is (native % maxWidth)', () => {
    const model = new Model({ widthMode: 'static', width: '80%', ...PAGE });
    const { getByTestId } = render(<Survey model={model} />);
    expect(rootStyle(getByTestId).maxWidth).toBe('80%');
  });

  it('no renderedWidth -> unconstrained root (no maxWidth)', () => {
    const model = new Model({ ...PAGE });
    expect(model.renderedWidth).toBeUndefined();
    const { getByTestId } = render(<Survey model={model} />);
    expect(rootStyle(getByTestId).maxWidth).toBeUndefined();
  });

  it('a width change re-renders the constraint (reactive via the 0.4 base)', () => {
    const model = new Model({ widthMode: 'static', width: '600px', ...PAGE });
    const { getByTestId } = render(<Survey model={model} />);
    act(() => {
      model.width = '400px';
    });
    expect(rootStyle(getByTestId).maxWidth).toBe(400);
  });
});
