/**
 * `<Survey>` event props — the A12 "derived from actual EventBase
 * members" surface (design: docs/design/1.1-survey-root.md, "Event
 * props"; test plan #5). Runtime wiring: identity-diffed add/remove,
 * full unwire on unmount/model-swap (upstream leaks host-model
 * subscriptions on unmount; we must not).
 */
import { render, act } from '@testing-library/react-native';

import { Model } from '../../core/facade';
import { Survey } from '../Survey';

const JSON_A = {
  elements: [{ type: 'text', name: 'q1' }],
};

describe('<Survey> model event props', () => {
  it('delivers model events to the matching prop handler', () => {
    const model = new Model(JSON_A);
    const onValueChanged = jest.fn();
    render(<Survey model={model} onValueChanged={onValueChanged} />);
    act(() => {
      model.setValue('q1', 'x');
    });
    expect(onValueChanged).toHaveBeenCalledTimes(1);
    const [sender, options] = onValueChanged.mock.calls[0]!;
    expect(sender).toBe(model);
    expect(options).toEqual(expect.objectContaining({ name: 'q1' }));
  });

  it('handler identity swap replaces the subscription (old handler never fires again)', () => {
    const model = new Model(JSON_A);
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(
      <Survey model={model} onValueChanged={first} />
    );
    rerender(<Survey model={model} onValueChanged={second} />);
    act(() => {
      model.setValue('q1', 'x');
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removing the event prop removes the subscription', () => {
    const model = new Model(JSON_A);
    const handler = jest.fn();
    const { rerender } = render(
      <Survey model={model} onValueChanged={handler} />
    );
    rerender(<Survey model={model} />);
    act(() => {
      model.setValue('q1', 'x');
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unmount unwires every subscribed event from a host-owned model', () => {
    // NOTE: `EventBase.isEmpty` is NOT a valid observable here — a fresh
    // Model already carries internal core subscribers (verified against
    // survey-core 2.5.33). The contract is behavioral: consumer handlers
    // never fire after unmount.
    const twoPages = {
      pages: [
        { name: 'p1', elements: [{ type: 'text', name: 'q1' }] },
        { name: 'p2', elements: [{ type: 'text', name: 'q2' }] },
      ],
    };
    const model = new Model(twoPages);
    const onValueChanged = jest.fn();
    const onCurrentPageChanged = jest.fn();
    const { unmount } = render(
      <Survey
        model={model}
        onValueChanged={onValueChanged}
        onCurrentPageChanged={onCurrentPageChanged}
      />
    );
    unmount();
    act(() => {
      model.setValue('q1', 'x');
      model.nextPage();
    });
    expect(onValueChanged).not.toHaveBeenCalled();
    expect(onCurrentPageChanged).not.toHaveBeenCalled();
  });

  it('model swap moves subscriptions to the new model', () => {
    const modelA = new Model(JSON_A);
    const modelB = new Model(JSON_A);
    const handler = jest.fn();
    const { rerender } = render(
      <Survey model={modelA} onValueChanged={handler} />
    );
    rerender(<Survey model={modelB} onValueChanged={handler} />);
    act(() => {
      modelA.setValue('q1', 'x'); // old model must be fully unwired
    });
    expect(handler).not.toHaveBeenCalled();
    act(() => {
      modelB.setValue('q1', 'x');
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onScrollToElement is NOT wired as a model event and does not throw', () => {
    const model = new Model(JSON_A);
    expect(() => {
      const { unmount } = render(
        <Survey model={model} onScrollToElement={() => undefined} />
      );
      unmount();
    }).not.toThrow();
    expect(
      (model as unknown as Record<string, unknown>).onScrollToElement
    ).toBeUndefined();
  });
});
