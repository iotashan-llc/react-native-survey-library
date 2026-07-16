/**
 * Task 1.10 — the 13 `inputType`s (settings.ts `questions.inputTypes`)
 * mapped to native `TextInput` props. `text`/`email`/`url`/`tel`/`number`/
 * `password` get real native keyboard/autofill affordances; `date`/
 * `datetime-local`/`time`/`month`/`week`/`color`/`range` are v1 plain-text
 * fallbacks (native pickers/slider land later — M4/M5 per the plan) and
 * get NO special keyboard mapping beyond staying a plain text field
 * (documented in docs/DIFFERENCES.md).
 */
import {
  mapInputTypeToRNProps,
  mapAutoComplete,
  RN_AUTO_COMPLETE_TOKENS,
} from '../inputTypeMapping';

describe('mapInputTypeToRNProps', () => {
  it('text (default): no special props', () => {
    expect(mapInputTypeToRNProps('text')).toEqual({});
  });

  it('email: email keyboard, no autocapitalize/autocorrect, iOS emailAddress content type', () => {
    expect(mapInputTypeToRNProps('email')).toEqual({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'emailAddress',
    });
  });

  it('url: url keyboard, no autocapitalize/autocorrect, iOS URL content type', () => {
    expect(mapInputTypeToRNProps('url')).toEqual({
      keyboardType: 'url',
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'URL',
    });
  });

  it('tel: phone-pad keyboard, iOS telephoneNumber content type', () => {
    expect(mapInputTypeToRNProps('tel')).toEqual({
      keyboardType: 'phone-pad',
      textContentType: 'telephoneNumber',
    });
  });

  it('number: numeric keyboard', () => {
    expect(mapInputTypeToRNProps('number')).toEqual({
      keyboardType: 'numeric',
    });
  });

  it('password: secure text entry, no autocapitalize/autocorrect, iOS password content type', () => {
    expect(mapInputTypeToRNProps('password')).toEqual({
      secureTextEntry: true,
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'password',
    });
  });

  it.each([
    'date',
    'datetime-local',
    'time',
    'month',
    'week',
    'color',
    'range',
  ])('%s: plain-text fallback, no special native props', (inputType) => {
    expect(mapInputTypeToRNProps(inputType)).toEqual({});
  });

  it('unknown inputType: falls back to plain text (never throws)', () => {
    expect(mapInputTypeToRNProps('bogus-type')).toEqual({});
  });
});

describe('mapAutoComplete', () => {
  it('undefined token: no props', () => {
    expect(mapAutoComplete(undefined)).toEqual({});
  });

  it('a token that is directly a valid RN autoComplete value passes through verbatim', () => {
    expect(mapAutoComplete('email')).toEqual({ autoComplete: 'email' });
    expect(mapAutoComplete('tel')).toEqual({ autoComplete: 'tel' });
    expect(mapAutoComplete('given-name')).toEqual({
      autoComplete: 'given-name',
    });
  });

  it('a token with no RN equivalent is dropped (RN falls back to platform heuristics), never throws', () => {
    expect(mapAutoComplete('transaction-currency')).toEqual({});
    expect(mapAutoComplete('sex')).toEqual({});
  });

  it('"off" passes through (disables autofill)', () => {
    expect(mapAutoComplete('off')).toEqual({ autoComplete: 'off' });
  });

  it('RN_AUTO_COMPLETE_TOKENS is a non-empty allowlist containing the common tokens', () => {
    expect(RN_AUTO_COMPLETE_TOKENS.has('email')).toBe(true);
    expect(RN_AUTO_COMPLETE_TOKENS.has('username')).toBe(true);
    expect(RN_AUTO_COMPLETE_TOKENS.size).toBeGreaterThan(10);
  });
});
