/**
 * Task 1.10 (review round 2) — RN-side pre-commit format parsing for the
 * date/time plain-text fallback `inputType`s (`date`, `datetime-local`,
 * `time`, `month`, `week`).
 *
 * Why this exists: on web these types render as native `<input>` widgets
 * whose value is guaranteed either format-valid or `""` — unparseable
 * text never reaches the model; it reads as `input.value === ""` with
 * `validity.badInput` set, and core surfaces "Invalid input" from that
 * (question_text.ts:457-459) plus the browser's `validationMessage` via
 * `onKeyUp` -> `dateValidationMessage` (question_text.ts:749-766). RN's
 * v1 plain-text fallback (see inputTypeMapping.ts) has no native gate,
 * so this module reproduces the DOM's FORMAT contract. Semantics follow
 * the WHATWG HTML "valid date string" family; core still owns every
 * VALUE-level validation (min/max/step, required, expressions).
 *
 * Not merely parity — a crash guard (invariant 9): committing an
 * unparseable `month` string into core THROWS ("Invalid time value":
 * `correctValueType` runs `createDate(...).toISOString()` on it,
 * question_text.ts:668-685), and `datetime-local` hits the same
 * `toISOString` path under `settings.storeUtcDates`
 * (question_text.ts:419-421 `hasToConvertToUTC`). Verified empirically
 * against survey-core v2.5.33.
 *
 * `color` and `range` also render as plain-text fallbacks but carry no
 * date/time format contract (and `range`'s garbage is already coerced to
 * `""` by core's own `correctValueType` number branch), so they are
 * deliberately NOT in this set.
 */

const DATE_TIME_FALLBACK_TYPES = new Set([
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
]);

export type DateTimeFallbackType =
  'date' | 'datetime-local' | 'time' | 'month' | 'week';

export function isDateTimeFallbackType(
  inputType: string
): inputType is DateTimeFallbackType {
  return DATE_TIME_FALLBACK_TYPES.has(inputType);
}

/** YYYY-MM shape; year > 0 enforced separately (WHATWG: year >= 1). */
const MONTH_SHAPE_RE = /^(\d{4,})-(0[1-9]|1[0-2])$/;

/**
 * WHATWG HTML "valid time string": HH:MM[:SS[.fractional]]. The spec
 * allows ONE OR MORE fractional-second digits (no upper bound).
 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$/;

/** YYYY-Www shape; week-number vs ISO week-year checked separately. */
const WEEK_SHAPE_RE = /^(\d{4,})-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** WHATWG "valid month string": YYYY-MM, year >= 1, month 01-12. */
function isValidMonthString(text: string): boolean {
  const m = MONTH_SHAPE_RE.exec(text);
  return m !== null && Number(m[1]) >= 1;
}

/**
 * How many ISO weeks a week-year has (52 or 53). Per ISO 8601 (and the
 * WHATWG "week string" rules), a year has 53 weeks iff Jan 1 falls on a
 * Thursday, or it's a leap year whose Jan 1 falls on a Wednesday.
 */
function isoWeeksInYear(year: number): 52 | 53 {
  const jan1Dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1Dow === 4 || (isLeap && jan1Dow === 3) ? 53 : 52;
}

/**
 * WHATWG "valid week string": YYYY-Www, year >= 1, week 01-52, or 53
 * only when that ISO week-year actually has 53 weeks.
 */
function isValidWeekString(text: string): boolean {
  const m = WEEK_SHAPE_RE.exec(text);
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 1) return false;
  const week = Number(m[2]);
  return week <= isoWeeksInYear(year);
}

/** YYYY-MM-DD with a real calendar-day check (month lengths, leap years). */
function isValidDateString(text: string): boolean {
  const m = /^(\d{4,})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(text);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const max = month === 2 && isLeap ? 29 : daysInMonth[month - 1]!;
  return day <= max;
}

/** Date, then "T" or a single space, then time (HTML local date-and-time). */
function isValidDateTimeLocalString(text: string): boolean {
  const sep = text.includes('T') ? 'T' : ' ';
  const sepIndex = text.indexOf(sep);
  if (sepIndex < 0) return false;
  return (
    isValidDateString(text.slice(0, sepIndex)) &&
    TIME_RE.test(text.slice(sepIndex + 1))
  );
}

/**
 * Whether `text` satisfies the HTML format contract for a date/time
 * fallback `inputType`. Empty text is always valid (clearing a field must
 * commit), and non-fallback types never reject (no contract applies).
 */
export function isDateTimeFallbackTextValid(
  inputType: string,
  text: string
): boolean {
  if (text === '' || !isDateTimeFallbackType(inputType)) return true;
  switch (inputType) {
    case 'date':
      return isValidDateString(text);
    case 'datetime-local':
      return isValidDateTimeLocalString(text);
    case 'time':
      return TIME_RE.test(text);
    case 'month':
      return isValidMonthString(text);
    case 'week':
      return isValidWeekString(text);
  }
}
