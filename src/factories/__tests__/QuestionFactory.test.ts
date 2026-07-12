/**
 * `QuestionFactory` — RN analog of survey-react-ui's `ReactQuestionFactory`
 * (design: docs/design/0.5-factories.md, test plan #1). Each test builds a
 * fresh `QuestionFactory` instance (never the shared `RNQuestionFactory`
 * singleton) so registrations in one test can never leak into another.
 */
import { QuestionFactory, RNQuestionFactory } from '../QuestionFactory';

describe('QuestionFactory', () => {
  it('round-trips registerQuestion -> createQuestion, passing props through to the creator', () => {
    const factory = new QuestionFactory();
    const received: unknown[] = [];
    factory.registerQuestion('widget', (props) => {
      received.push(props);
      return { type: 'widget-element' } as never;
    });

    const result = factory.createQuestion('widget', { foo: 'bar' });

    expect(result).toEqual({ type: 'widget-element' });
    expect(received).toEqual([{ foo: 'bar' }]);
  });

  it('getAllTypes returns every registered key, sorted', () => {
    const factory = new QuestionFactory();
    factory.registerQuestion('zeta', () => ({}) as never);
    factory.registerQuestion('alpha', () => ({}) as never);
    factory.registerQuestion('mu', () => ({}) as never);

    expect(factory.getAllTypes()).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('isQuestionRegistered (RN extension, no upstream equivalent) reports registration state', () => {
    const factory = new QuestionFactory();
    expect(factory.isQuestionRegistered('widget')).toBe(false);
    factory.registerQuestion('widget', () => ({}) as never);
    expect(factory.isQuestionRegistered('widget')).toBe(true);
  });

  it('createQuestion on a missing key returns null (fallback lives outside the registry)', () => {
    const factory = new QuestionFactory();
    expect(factory.createQuestion('never-registered', {})).toBeNull();
  });

  it('prototype-key names are inert data, never false hits, before explicit registration', () => {
    const factory = new QuestionFactory();
    // A `{}`-backed HashTable would resolve these via the prototype chain
    // (e.g. `hash['toString']` is `Object.prototype.toString`, a function
    // — a false hit that a `creator == null` check would miss). The
    // Map-backed registry must return null for all three until a real
    // registration happens.
    expect(factory.createQuestion('__proto__', {})).toBeNull();
    expect(factory.createQuestion('constructor', {})).toBeNull();
    expect(factory.createQuestion('toString', {})).toBeNull();
    expect(factory.isQuestionRegistered('__proto__')).toBe(false);
    expect(factory.isQuestionRegistered('constructor')).toBe(false);
    expect(factory.isQuestionRegistered('toString')).toBe(false);
  });

  it('prototype-key names can be registered and dispatched as ordinary data, without corrupting the registry', () => {
    const factory = new QuestionFactory();
    factory.registerQuestion('__proto__', () => ({ marker: 'proto' }) as never);
    factory.registerQuestion(
      'constructor',
      () => ({ marker: 'ctor' }) as never
    );
    factory.registerQuestion(
      'toString',
      () => ({ marker: 'toString' }) as never
    );

    expect(factory.createQuestion('__proto__', {})).toEqual({
      marker: 'proto',
    });
    expect(factory.createQuestion('constructor', {})).toEqual({
      marker: 'ctor',
    });
    expect(factory.createQuestion('toString', {})).toEqual({
      marker: 'toString',
    });
    // A genuinely unrelated key must still miss cleanly — the exotic
    // registrations above must not have widened what counts as "present".
    expect(factory.createQuestion('hasOwnProperty', {})).toBeNull();
  });

  it('exposes a shared RNQuestionFactory singleton of the same class', () => {
    expect(RNQuestionFactory).toBeInstanceOf(QuestionFactory);
  });
});
