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

  it('prototype-key names are inert data, never false hits, before explicit registration', () => {
    const factory = new ElementFactory();
    expect(factory.createElement('__proto__', {})).toBeNull();
    expect(factory.createElement('constructor', {})).toBeNull();
    expect(factory.createElement('toString', {})).toBeNull();
    expect(factory.isElementRegistered('__proto__')).toBe(false);
    expect(factory.isElementRegistered('constructor')).toBe(false);
    expect(factory.isElementRegistered('toString')).toBe(false);
  });

  it('prototype-key names can be registered and dispatched as ordinary data, without corrupting the registry', () => {
    const factory = new ElementFactory();
    factory.registerElement(
      'toString',
      () => ({ marker: 'toString' }) as never
    );

    expect(factory.createElement('toString', {})).toEqual({
      marker: 'toString',
    });
    expect(factory.createElement('hasOwnProperty', {})).toBeNull();
  });

  it('exposes a shared RNElementFactory singleton of the same class', () => {
    expect(RNElementFactory).toBeInstanceOf(ElementFactory);
  });
});
