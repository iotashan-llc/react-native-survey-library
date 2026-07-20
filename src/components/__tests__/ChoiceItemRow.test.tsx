/**
 * Task 1.12 — shared choice-item row (codex PR-18 review major 3): the
 * item recipe's CONTAINER slot (row padding/gap from `sd-item.scss` via
 * `buildItemRecipe`) and the A12 `item.container` consumer override must
 * actually land on the Pressable — `selectItemStyles` returns container
 * and decorator as separate slots (item.ts "Selected styles are returned
 * per SLOT") and computing-but-dropping the container slot silently
 * discards theme padding/gap and consumer overrides.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Model } from '../../core/facade';
import type {
  QuestionCheckboxModel,
  QuestionRadiogroupModel,
} from '../../core/facade';
import { ChoiceItemRow } from '../ChoiceItemRow';
import { SurveyThemeProvider } from '../../theme-rn/provider';
import { resolveTheme } from '../../theme-core/resolve';
import { buildItemRecipe } from '../../theme-rn/recipes/item';
import { bundledIconsV2 } from '../../core/icons';

function createCheckbox(
  props: Record<string, unknown> = {}
): QuestionCheckboxModel {
  const model = new Model({
    elements: [{ type: 'checkbox', name: 'q1', choices: ['a', 'b'], ...props }],
  });
  return model.getQuestionByName('q1') as QuestionCheckboxModel;
}

function createRadio(
  props: Record<string, unknown> = {}
): QuestionRadiogroupModel {
  const model = new Model({
    elements: [
      { type: 'radiogroup', name: 'q1', choices: ['a', 'b'], ...props },
    ],
  });
  return model.getQuestionByName('q1') as QuestionRadiogroupModel;
}

function flatStyle(node: {
  props: { style?: unknown };
}): Record<string, unknown> {
  return StyleSheet.flatten(node.props.style as never) as Record<
    string,
    unknown
  >;
}

describe('ChoiceItemRow style slots', () => {
  it("applies the item recipe's container fragment (theme row padding/gap) to the Pressable", () => {
    const question = createCheckbox();
    const item = question.visibleChoices[0]!;
    render(
      <ChoiceItemRow
        question={question}
        item={item}
        shape="checkbox"
        checked={false}
        onPress={() => {}}
        testID="row-under-test"
      />
    );
    const pressed = flatStyle(screen.getByTestId('row-under-test'));
    // Expected values derived from the DEFAULT theme's own recipe build —
    // not hardcoded pixel numbers.
    const recipe = buildItemRecipe(resolveTheme(undefined), {
      platform: { os: 'ios' },
    });
    const expected = StyleSheet.flatten(recipe.fragments.container) as Record<
      string,
      unknown
    >;
    expect(pressed.paddingVertical).toBe(expected.paddingVertical);
    expect(pressed.gap).toBe(expected.gap);
  });

  it('composes the A12 item.container consumer override LAST (wins over the recipe fragment)', () => {
    const question = createCheckbox();
    const item = question.visibleChoices[0]!;
    render(
      <SurveyThemeProvider
        styles={{ item: { container: { paddingVertical: 99 } } }}
      >
        <ChoiceItemRow
          question={question}
          item={item}
          shape="checkbox"
          checked={false}
          onPress={() => {}}
          testID="row-under-test"
        />
      </SurveyThemeProvider>
    );
    const pressed = flatStyle(screen.getByTestId('row-under-test'));
    expect(pressed.paddingVertical).toBe(99);
  });

  it('presses still dispatch when styled (container slot wiring does not break interaction)', () => {
    const question = createCheckbox();
    const item = question.visibleChoices[0]!;
    const onPress = jest.fn();
    render(
      <ChoiceItemRow
        question={question}
        item={item}
        shape="checkbox"
        checked={false}
        onPress={onPress}
        testID="row-under-test"
      />
    );
    fireEvent.press(screen.getByTestId('row-under-test'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ChoiceItemRow checked decorator (v0.2.1 RNIcon adoption)', () => {
  it('renders the checkbox checkmark through RNIcon (bundled check-16x16), not a plain glyph', () => {
    // Web renders the checkbox checkmark via <use xlinkHref={itemSvgIcon}>
    // where checkbox cssClasses.itemSvgIconId === "#icon-check-16x16"
    // (survey-core defaultCss); the RN port resolves that same core icon
    // through the RNIcon primitive (the decorative SvgXml the mock captures).
    const question = createCheckbox();
    const item = question.visibleChoices[0]!;
    render(
      <ChoiceItemRow
        question={question}
        item={item}
        shape="checkbox"
        checked={true}
        onPress={() => {}}
        testID="check-row"
      />
    );
    const icon = screen.getByTestId('check-row-check-icon', {
      includeHiddenElements: true,
    });
    expect(icon.props.xml).toBe(bundledIconsV2['check-16x16']);
    // No plain-glyph checkmark remains.
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('renders NO check icon when the checkbox is unchecked', () => {
    const question = createCheckbox();
    const item = question.visibleChoices[0]!;
    render(
      <ChoiceItemRow
        question={question}
        item={item}
        shape="checkbox"
        checked={false}
        onPress={() => {}}
        testID="check-row"
      />
    );
    expect(
      screen.queryByTestId('check-row-check-icon', {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });

  it('keeps the radio dot as a filled View — no RNIcon (web radios are a CSS circle, not an icon)', () => {
    // radiogroup cssClasses has NO itemSvgIconId in the default (non-preview)
    // render, so web draws the radio as a filled circle; the RN dot stays a
    // plain filled View.
    const question = createRadio();
    const item = question.visibleChoices[0]!;
    render(
      <ChoiceItemRow
        question={question}
        item={item}
        shape="radio"
        checked={true}
        onPress={() => {}}
        testID="radio-row"
      />
    );
    expect(
      screen.queryByTestId('radio-row-check-icon', {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });
});
