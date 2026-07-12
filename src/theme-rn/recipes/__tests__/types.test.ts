/**
 * A12 consumer style-override surface tests (design ownership table:
 * "A12 consumer style-override types (per-component slot overrides,
 * precedence: recipe < theme < consumer override) + cache participation
 * | 0.7 -- types + merge order defined; component wiring per port").
 */
import { composeStyles, resolvePlatformFromRN } from '../types';

describe('composeStyles — precedence recipe < theme < consumer override', () => {
  it('recipe alone (no override layers)', () => {
    expect(composeStyles({ color: 'red' })).toEqual([{ color: 'red' }]);
  });

  it('recipe + theme + override compose in that order (array-style, later wins)', () => {
    const result = composeStyles(
      { color: 'red' },
      { theme: { color: 'blue' }, override: { color: 'green' } }
    );
    expect(result).toEqual([
      { color: 'red' },
      { color: 'blue' },
      { color: 'green' },
    ]);
    // RN array-style composition means the LAST entry's properties win --
    // proving the actual precedence, not just array order.
    expect(Object.assign({}, ...result)).toEqual({ color: 'green' });
  });

  it('theme without override still wins over the recipe base', () => {
    const result = composeStyles(
      { color: 'red' },
      { theme: { color: 'blue' } }
    );
    expect(Object.assign({}, ...result)).toEqual({ color: 'blue' });
  });

  it('accepts an array of recipe fragments (the normal selectStyles() output shape) and flattens it', () => {
    const result = composeStyles([{ color: 'red' }, { fontSize: 10 }], {
      override: { color: 'green' },
    });
    expect(result).toEqual([
      { color: 'red' },
      { fontSize: 10 },
      { color: 'green' },
    ]);
  });

  it('an array-valued override layer is also flattened, not nested', () => {
    const result = composeStyles(undefined, {
      override: [{ color: 'green' }, { fontSize: 12 }],
    });
    expect(result).toEqual([{ color: 'green' }, { fontSize: 12 }]);
  });

  it('nullish recipe/layers are skipped, not pushed as undefined entries', () => {
    expect(composeStyles(undefined)).toEqual([]);
    expect(composeStyles(undefined, {})).toEqual([]);
  });
});

describe('resolvePlatformFromRN', () => {
  it('ios: no apiLevel field', () => {
    expect(resolvePlatformFromRN('ios', undefined)).toEqual({ os: 'ios' });
  });

  it('android: numeric Platform.Version passes through', () => {
    expect(resolvePlatformFromRN('android', 34)).toEqual({
      os: 'android',
      apiLevel: 34,
    });
  });

  it('android: string Platform.Version is coerced to a number', () => {
    expect(resolvePlatformFromRN('android', '28')).toEqual({
      os: 'android',
      apiLevel: 28,
    });
  });

  it('android: unparsable version falls back to 0, never NaN', () => {
    expect(resolvePlatformFromRN('android', 'not-a-number')).toEqual({
      os: 'android',
      apiLevel: 0,
    });
  });
});
