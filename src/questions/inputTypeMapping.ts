/**
 * Task 1.10 — the 13 `inputType`s a `text` question can carry (survey-core
 * settings.ts `questions.inputTypes`: color/date/datetime-local/email/
 * month/number/password/range/tel/text/time/url/week) mapped to native
 * `TextInput` props.
 *
 * `text`/`email`/`url`/`tel`/`number`/`password` get real native
 * keyboard/autofill affordances. `date`/`datetime-local`/`time`/`month`/
 * `week`/`color`/`range` are v1 plain-text FALLBACKS — no native date/time
 * picker, no color swatch, no slider (those arrive on their own schedule:
 * date/time pickers are M5 per docs/IMPLEMENTATION-PLAN.md, `range` gets a
 * real slider in task 4.4). Value-level validation for the fallback types
 * (min/max/step, date parsing) still runs — it's core's own
 * `onCheckForErrors`, unaffected by which widget renders the field. See
 * docs/DIFFERENCES.md, "Text input inputType fallbacks" for the consumer-
 * facing note.
 */
import type { TextInputProps } from 'react-native';

export function mapInputTypeToRNProps(
  inputType: string
): Partial<TextInputProps> {
  switch (inputType) {
    case 'email':
      return {
        keyboardType: 'email-address',
        autoCapitalize: 'none',
        autoCorrect: false,
        textContentType: 'emailAddress',
      };
    case 'url':
      return {
        keyboardType: 'url',
        autoCapitalize: 'none',
        autoCorrect: false,
        textContentType: 'URL',
      };
    case 'tel':
      return {
        keyboardType: 'phone-pad',
        textContentType: 'telephoneNumber',
      };
    case 'number':
      return { keyboardType: 'numeric' };
    case 'password':
      return {
        secureTextEntry: true,
        autoCapitalize: 'none',
        autoCorrect: false,
        textContentType: 'password',
      };
    // Fallback types (date/datetime-local/time/month/week/color/range) and
    // 'text' itself: no special native props — a plain text field.
    default:
      return {};
  }
}

/**
 * Exact allowlist of RN's `TextInputProps['autoComplete']` union (RN
 * 0.86 `TextInput.d.ts`) — the pass-through set for
 * `question.autocomplete` (an HTML autocomplete token, survey-core
 * settings.ts `questions.dataList`). Many tokens are shared verbatim
 * between the two vocabularies (`email`, `tel`, `given-name`, `off`,
 * ...); tokens with no RN equivalent (e.g. `transaction-currency`,
 * `sex`... survey-core's list, not RN's) are dropped rather than guessed
 * at — RN/the OS fall back to their own autofill heuristics, matching
 * "unmapped tokens are dropped silently" in docs/DIFFERENCES.md.
 */
export const RN_AUTO_COMPLETE_TOKENS: ReadonlySet<
  NonNullable<TextInputProps['autoComplete']>
> = new Set([
  '2fa-app-otp',
  'additional-name',
  'address-line1',
  'address-line2',
  'birthdate-day',
  'birthdate-full',
  'birthdate-month',
  'birthdate-year',
  'cc-csc',
  'cc-exp',
  'cc-exp-day',
  'cc-exp-month',
  'cc-exp-year',
  'cc-number',
  'cc-name',
  'cc-given-name',
  'cc-middle-name',
  'cc-family-name',
  'cc-type',
  'country',
  'current-password',
  'email',
  'email-otp',
  'flight-confirmation-code',
  'flight-number',
  'family-name',
  'gender',
  'gift-card-number',
  'gift-card-pin',
  'given-name',
  'honorific-prefix',
  'honorific-suffix',
  'loyalty-account-number',
  'name',
  'name-family',
  'name-given',
  'name-middle',
  'name-middle-initial',
  'name-prefix',
  'name-suffix',
  'new-password',
  'nickname',
  'one-time-code',
  'organization',
  'organization-title',
  'password',
  'password-new',
  'postal-address',
  'postal-address-country',
  'postal-address-dependent-locality',
  'postal-address-extended',
  'postal-address-extended-postal-code',
  'postal-address-locality',
  'postal-address-region',
  'postal-address-unit',
  'postal-code',
  'promo-code',
  'street-address',
  'sms-otp',
  'tel',
  'tel-country-code',
  'tel-national',
  'tel-device',
  'upi-vpa',
  'url',
  'wifi-password',
  'username',
  'username-new',
  'off',
]);

/**
 * Passes `question.autocomplete` through to RN's `autoComplete` prop when
 * (and only when) it's a value RN itself recognizes; otherwise omits the
 * prop entirely (never a guessed/invented mapping).
 */
export function mapAutoComplete(
  token: string | undefined
): Pick<TextInputProps, 'autoComplete'> {
  if (
    token &&
    RN_AUTO_COMPLETE_TOKENS.has(
      token as NonNullable<TextInputProps['autoComplete']>
    )
  ) {
    return { autoComplete: token as TextInputProps['autoComplete'] };
  }
  return {};
}
