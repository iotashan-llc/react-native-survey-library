/**
 * A12 public surface (codex impl-review major 8): the consumer
 * style-override types, the provider, and the compose helper must be
 * importable from the PACKAGE ROOT — an internal-only override surface is
 * not an override surface.
 */
import * as root from '../../index';
import type {
  SurveyComponentStyles,
  ItemStyleOverrides,
  UnsupportedQuestionStyleOverrides,
} from '../../index';

describe('package root exports — theme provider + A12 override surface', () => {
  it('exports SurveyThemeProvider, SurveyThemeContext and composeStyles as values', () => {
    expect(root.SurveyThemeProvider).toBeDefined();
    expect(root.SurveyThemeContext).toBeDefined();
    expect(typeof root.composeStyles).toBe('function');
  });

  it('the A12 per-component slot override types accept StyleProp shapes (compile-time contract)', () => {
    const item: ItemStyleOverrides = {
      container: { paddingVertical: 4 },
      decorator: [{ borderRadius: 8 }, null],
      label: { color: 'red' },
    };
    const unsupported: UnsupportedQuestionStyleOverrides = {
      panel: { backgroundColor: 'magenta' },
    };
    const styles: SurveyComponentStyles = {
      item,
      unsupportedQuestion: unsupported,
    };
    expect(styles.item).toBe(item);
  });

  it('composeStyles applies recipe < theme < consumer-override precedence (A12 merge order)', () => {
    const composed = root.composeStyles(
      { color: 'recipe', fontSize: 1 },
      { theme: { color: 'theme' }, override: { color: 'override' } }
    );
    expect(Object.assign({}, ...composed)).toEqual({
      color: 'override',
      fontSize: 1,
    });
  });
});
