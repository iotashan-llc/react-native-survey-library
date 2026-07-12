/**
 * `ElementFactory` — RN analog of survey-react-ui's `ReactElementFactory`
 * (design: docs/design/0.5-factories.md, test plan #1). Fresh instance per
 * test, never the shared `RNElementFactory` singleton.
 */
import { ElementFactory, RNElementFactory } from '../ElementFactory';

describe('ElementFactory', () => {
  it('round-trips registerElement -> createElement, passing props through to the creator', () => {
    const factory = new ElementFactory();
    const received: unknown[] = [];
    factory.registerElement('sv-page', (props) => {
      received.push(props);
      return { type: 'page-element' } as never;
    });

    const result = factory.createElement('sv-page', { key: 'p1' });

    expect(result).toEqual({ type: 'page-element' });
    expect(received).toEqual([{ key: 'p1' }]);
  });

  it('getAllTypes returns every registered key, sorted', () => {
    const factory = new ElementFactory();
    factory.registerElement('sv-page', () => ({}) as never);
    factory.registerElement('question', () => ({}) as never);
    factory.registerElement('sv-question-error', () => ({}) as never);

    expect(factory.getAllTypes()).toEqual([
      'question',
      'sv-page',
      'sv-question-error',
    ]);
  });

  it('isElementRegistered (upstream-present method) reports registration state', () => {
    const factory = new ElementFactory();
    expect(factory.isElementRegistered('sv-page')).toBe(false);
    factory.registerElement('sv-page', () => ({}) as never);
    expect(factory.isElementRegistered('sv-page')).toBe(true);
  });

  it('createElement on a missing key returns null', () => {
    const factory = new ElementFactory();
    expect(factory.createElement('never-registered', {})).toBeNull();
  });

  // Mirrors QuestionFactory.test.ts's table-driven prototype-key coverage
  // (review round 3: keep the two factories symmetric — same keys, both
  // the clean-miss and the positive-registration directions).
  const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString'] as const;

  it.each(PROTOTYPE_KEYS)(
    'unregistered prototype key "%s" is a clean miss, never a false hit',
    (key) => {
      const factory = new ElementFactory();
      expect(factory.createElement(key, {})).toBeNull();
      expect(factory.isElementRegistered(key)).toBe(false);
    }
  );

  it.each(PROTOTYPE_KEYS)(
    'prototype key "%s" registers and dispatches as ordinary data, without corrupting the registry',
    (key) => {
      const factory = new ElementFactory();
      factory.registerElement(key, () => ({ marker: key }) as never);
      expect(factory.createElement(key, {})).toEqual({ marker: key });
      expect(factory.isElementRegistered(key)).toBe(true);
      // A genuinely unrelated key must still miss cleanly — the exotic
      // registration must not have widened what counts as "present".
      expect(factory.createElement('hasOwnProperty', {})).toBeNull();
    }
  );

  it('exposes a shared RNElementFactory singleton of the same class', () => {
    expect(RNElementFactory).toBeInstanceOf(ElementFactory);
  });
});
