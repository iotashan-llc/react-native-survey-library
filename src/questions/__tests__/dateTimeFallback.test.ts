/**
 * Task 1.10 (review round 2) — RN-side pre-commit format parsing for the
 * date/time plain-text fallback `inputType`s. Web's native `<input>`
 * widgets guarantee the committed value is either format-valid or `""`
 * (`validity.badInput`); RN's plain-text fallback has no such native
 * gate, so this module is the RN analog of that DOM guarantee. These are
 * FORMAT checks in the WHATWG HTML "valid date string" family — core
 * still owns every VALUE-level validation (min/max/step, required).
 *
 * Load-bearing beyond parity: an unparseable `month` string committed
 * into core THROWS ("Invalid time value" — `correctValueType` calls
 * `createDate(...).toISOString()` on it, question_text.ts:668-685), and
 * `datetime-local` does the same under `settings.storeUtcDates` — so the
 * guard is what keeps invariant 9 ("never crash the survey") true.
 */
import {
  isDateTimeFallbackType,
  isDateTimeFallbackTextValid,
} from '../dateTimeFallback';

const FALLBACK_TYPES = ['date', 'datetime-local', 'time', 'month', 'week'];

describe('isDateTimeFallbackType', () => {
  it.each(FALLBACK_TYPES)('%s is a date/time fallback type', (t) => {
    expect(isDateTimeFallbackType(t)).toBe(true);
  });

  it.each(['text', 'number', 'email', 'password', 'color', 'range', 'tel'])(
    '%s is not (color/range fall back too, but carry no date/time format contract)',
    (t) => {
      expect(isDateTimeFallbackType(t)).toBe(false);
    }
  );
});

describe('isDateTimeFallbackTextValid', () => {
  it('empty string is always valid (clearing a field must commit)', () => {
    for (const t of FALLBACK_TYPES) {
      expect(isDateTimeFallbackTextValid(t, '')).toBe(true);
    }
  });

  it('non-fallback inputTypes never reject (no format contract applies)', () => {
    expect(isDateTimeFallbackTextValid('text', 'anything at all')).toBe(true);
    expect(isDateTimeFallbackTextValid('number', 'garbage')).toBe(true);
  });

  describe('date (YYYY-MM-DD, real calendar day)', () => {
    it.each(['2024-01-15', '2024-12-31', '2024-02-29', '0001-01-01'])(
      'valid: %s',
      (v) => {
        expect(isDateTimeFallbackTextValid('date', v)).toBe(true);
      }
    );

    it.each([
      'not-a-date',
      '2024-13-01',
      '2024-00-10',
      '2024-01-32',
      '2023-02-29',
      '2024-04-31',
      '2024-1-5',
      '01/15/2024',
      '2024-01-15T10:00',
      '2024-01',
      '20240115',
    ])('invalid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('date', v)).toBe(false);
    });
  });

  describe('datetime-local (date, "T" or space, time)', () => {
    it.each([
      '2024-01-15T10:30',
      '2024-01-15T10:30:59',
      '2024-01-15 10:30',
      '2024-02-29T00:00',
    ])('valid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('datetime-local', v)).toBe(true);
    });

    it.each([
      'garbage',
      '2024-01-15',
      '10:30',
      '2024-01-15Tnoon',
      '2024-13-15T10:30',
      '2024-01-15T25:00',
      '2024-01-15T10:3',
    ])('invalid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('datetime-local', v)).toBe(false);
    });
  });

  describe('time (HH:MM, optional :SS and fraction)', () => {
    it.each([
      '00:00',
      '23:59',
      '10:30:59',
      '10:30:59.123',
      // WHATWG allows one-or-more fractional digits, unbounded.
      '10:30:59.1',
      '10:30:59.1234567',
    ])('valid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('time', v)).toBe(true);
    });

    it.each(['24:00', '10:60', '10:3', '10', 'noon', '10:30 PM', '10:30:59.'])(
      'invalid: %s',
      (v) => {
        expect(isDateTimeFallbackTextValid('time', v)).toBe(false);
      }
    );
  });

  describe('month (YYYY-MM)', () => {
    it.each(['2024-01', '2024-12', '0001-01'])('valid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('month', v)).toBe(true);
    });

    it.each([
      'garbage',
      '2024-13',
      '2024-00',
      '2024-1',
      '2024',
      '2024-01-15',
      // WHATWG: year must be > 0.
      '0000-01',
    ])('invalid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('month', v)).toBe(false);
    });
  });

  describe('week (YYYY-Www)', () => {
    it.each([
      '2024-W01',
      '2024-W29',
      // 53-week ISO years: 2015 (Jan 1 = Thu), 2020 (leap, Jan 1 = Wed).
      '2015-W53',
      '2020-W53',
    ])('valid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('week', v)).toBe(true);
    });

    it.each([
      'garbage',
      '2024-W00',
      '2024-W54',
      '2024-w29',
      '2024-29',
      // 2024 is a 52-week ISO year — W53 is invalid (WHATWG week rules).
      '2024-W53',
      // WHATWG: year must be > 0.
      '0000-W01',
    ])('invalid: %s', (v) => {
      expect(isDateTimeFallbackTextValid('week', v)).toBe(false);
    });
  });
});
