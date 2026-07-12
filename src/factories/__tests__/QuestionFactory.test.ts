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

  // A `{}`-backed HashTable would resolve these via the prototype chain
  // (e.g. `hash['toString']` is `Object.prototype.toString`, a function —
  // a false hit that a `creator == null` check would miss). Table-driven
  // and mirrored in ElementFactory.test.ts (review round 3: keep the two
  // factories' prototype-key coverage symmetric).
  const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString'] as const;

  it.each(PROTOTYPE_KEYS)(
    'unregistered prototype key "%s" is a clean miss, never a false hit',
    (key) => {
      const factory = new QuestionFactory();
      expect(factory.createQuestion(key, {})).toBeNull();
      expect(factory.isQuestionRegistered(key)).toBe(false);
    }
  );

  it.each(PROTOTYPE_KEYS)(
    'prototype key "%s" registers and dispatches as ordinary data, without corrupting the registry',
    (key) => {
      const factory = new QuestionFactory();
      factory.registerQuestion(key, () => ({ marker: key }) as never);
      expect(factory.createQuestion(key, {})).toEqual({ marker: key });
      expect(factory.isQuestionRegistered(key)).toBe(true);
      // A genuinely unrelated key must still miss cleanly — the exotic
      // registration must not have widened what counts as "present".
      expect(factory.createQuestion('hasOwnProperty', {})).toBeNull();
    }
  );

  it('exposes a shared RNQuestionFactory singleton of the same class', () => {
    expect(RNQuestionFactory).toBeInstanceOf(QuestionFactory);
  });
});
