/**
 * UnsupportedQuestion recipe tests (design ownership table: "0.5 promise,
 * 0.7 owner"; docs/design/0.7-metrics-fixture.md, "UnsupportedQuestion").
 * No upstream analog -- composed from tokens, source is the fixture
 * itself.
 */
import { resolveTheme } from '../../../theme-core/resolve';
import { buildUnsupportedQuestionRecipe } from '../unsupportedQuestion';

const resolved = resolveTheme(undefined);

describe('buildUnsupportedQuestionRecipe — formulas from resolved tokens', () => {
  const recipe = buildUnsupportedQuestionRecipe(resolved);

  it('panel: background editor-background, border 1dp border-default, radius editorpanel corner radius, padding calcSize(2)=16', () => {
    expect(recipe.fragments.panel.borderWidth).toBe(1);
    expect(recipe.fragments.panel.borderRadius).toBe(4);
    expect(recipe.fragments.panel.padding).toBe(16);
    expect(recipe.fragments.panel.backgroundColor).toEqual(expect.any(String));
  });

  it('message: editor-font 16/24, color foreground', () => {
    expect(recipe.fragments.message.fontSize).toBe(16);
    expect(recipe.fragments.message.lineHeight).toBe(24);
  });

  it('message lineHeight tracks the EDITOR font-size token, not the base font-size (codex impl-review major 5)', () => {
    const custom = resolveTheme({
      cssVariables: { '--sjs-font-editorfont-size': '20px' },
    });
    const customRecipe = buildUnsupportedQuestionRecipe(custom);
    expect(customRecipe.fragments.message.lineHeight).toBe(30);
    expect(customRecipe.fragments.message.lineHeight).toBe(
      custom.tokens.typography.editorLineHeight
    );
  });

  it('errorAccentBar: 3dp, special-red', () => {
    expect(recipe.fragments.errorAccentBar.width).toBe(3);
  });

  it('title slot reuses the question-title recipe (same fontSize/weight)', () => {
    expect(recipe.title.fragments.title.fontSize).toBe(16);
    expect(recipe.title.fragments.title.fontWeight).toBe('600');
  });
});
