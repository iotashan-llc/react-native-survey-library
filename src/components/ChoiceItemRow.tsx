/**
 * Task 1.12 — shared choice-item row for checkbox/radiogroup (design:
 * docs/design/0.7-theme-rn.md, "item recipe" + "Hybrid bridge"). A plain
 * function component: item-level interaction state (pressed) is NATIVE
 * UI state, not model state, so it's not subject to the A3 "no hooks
 * rewrite" constraint (that constraint is specifically about the
 * survey-core model-subscription mechanism — see `UnsupportedQuestion`'s
 * `DefaultUnsupportedPresentation`, an existing plain function component
 * reading theme context).
 *
 * State derivation is bridge-first, never hand-rolled: `checked` comes
 * from the parent's `question.isItemSelected(item)` call (a model
 * method), and every OTHER visual flag (readOnly/preview/error/hover/
 * none/selectAll) comes from extracting `question.getItemClass(item)`
 * through the 0.7 bridge's `getItemVariant` — this component never
 * re-derives select-item state from raw booleans.
 *
 * Enablement is `question.getItemEnabled(item)` (codex PR-18 review
 * major 2) — the same public seam web binds to its DOM `disabled`
 * attribute (reactquestion_checkbox.tsx:64, reactquestion_radiogroup.tsx:
 * 82; core: `!isDisabledAttr && item.isEnabled`,
 * question_baseselect.ts:2468). LOAD-BEARING: core's own
 * `clickItemHandler`/`selectItem` checks only `isReadOnlyAttr` and does
 * NOT reject a disabled item — without this gate a disabled choice would
 * still mutate the answer (verified empirically against v2.5.33). It
 * gates the Pressable AND the "other" comment input's editability.
 *
 * Checked decorator: the checkbox checkmark renders through the shared
 * `RNIcon` primitive (web parity — `<use xlinkHref={question.itemSvgIcon}>`
 * against core's `#icon-check-16x16`), sized/colored from the item recipe's
 * `iconSize`/`iconFills`. The radiogroup dot stays a plain filled `View`:
 * web radios are a CSS-drawn filled circle (radiogroup cssClasses carry no
 * `itemSvgIconId` in the default render), NOT an icon — so there is no icon
 * primitive to adopt there. Presentation-only; no model/state contract
 * depends on the decorator shape.
 */
import * as React from 'react';
import { Pressable, View, Text, TextInput, StyleSheet } from 'react-native';
import type { Question, ItemValue } from '../core/facade';
import { SurveyThemeContext } from '../theme-rn/provider';
import {
  selectItemStyles,
  selectIconFill,
  composeStyles,
} from '../theme-rn/recipes';
import type { ItemShape, ItemAddOn } from '../theme-rn/recipes';
import { getItemVariant, queueUnknownTokens } from '../theme-rn/bridge';
import { OtherCommentDraftAdapter } from '../inputs/OtherCommentDraftAdapter';
import { RNIcon } from './RNIcon';

const styles = StyleSheet.create({
  row: { flexDirection: 'column' },
  pressableRow: { flexDirection: 'row', alignItems: 'center' },
  otherInputWrap: { marginTop: 4 },
});

/** Default checkbox check icon (survey-core defaultCss `itemSvgIconId`). */
const DEFAULT_CHECK_ICON = 'icon-check-16x16';

/**
 * Core's `itemSvgIcon` (question_baseselect.ts) is a DOM SPRITE FRAGMENT
 * reference — web feeds it straight to `<use xlinkHref="#icon-check-16x16">`.
 * RNIcon resolves by NAME, so strip the leading `#` (which
 * `getIconNameFromProxy` does not handle). Falls back to the default check
 * icon when a consumer clears the id, preserving the v1 "checkbox always
 * shows a checkmark when checked" behavior.
 */
function resolveCheckIconName(itemSvgIcon: string | undefined): string {
  const raw = itemSvgIcon ?? '';
  const name = raw.startsWith('#') ? raw.slice(1) : raw;
  return name || DEFAULT_CHECK_ICON;
}

export interface ChoiceItemRowProps {
  question: Question & {
    isItemSelected(item: ItemValue): boolean;
    getItemClass(item: ItemValue): string;
    getItemEnabled(item: ItemValue): boolean;
    otherItem?: ItemValue;
    /** DOM-sprite fragment ref for the checked checkmark (checkbox shape). */
    itemSvgIcon?: string;
  };
  item: ItemValue;
  shape: ItemShape;
  checked: boolean;
  addOn?: ItemAddOn;
  onPress: () => void;
  testID?: string;
  otherInputTestID?: string;
}

export function ChoiceItemRow(props: ChoiceItemRowProps): React.JSX.Element {
  const { question, item, shape, checked, addOn, onPress } = props;
  const {
    recipes,
    styles: overrides,
    mode,
  } = React.useContext(SurveyThemeContext);
  const [focused, setFocused] = React.useState(false);
  // Bumped (never read) purely to force a re-render when the "other"
  // comment draft changes — the draft itself lives in `adapterRef`, read
  // fresh on every render.
  const [, setOtherRev] = React.useState(0);

  const itemVariant = getItemVariant(question, question.getItemClass(item));
  React.useEffect(() => {
    queueUnknownTokens(question, itemVariant.unknownTokens);
  });

  const readOnly = itemVariant.variant.readOnly ?? false;
  const preview = itemVariant.variant.preview ?? false;
  const error = itemVariant.variant.error ?? false;
  const allowHover = itemVariant.variant.hover ?? false;
  const itemEnabled = question.getItemEnabled(item);
  const pressDisabled = readOnly || preview || !itemEnabled;

  const isOther = !!question.otherItem && item === question.otherItem;
  const showComment =
    isOther && !!(item as { isCommentShowing?: boolean }).isCommentShowing;

  const adapterRef = React.useRef<OtherCommentDraftAdapter | undefined>(
    undefined
  );
  React.useEffect(() => {
    if (!showComment) return undefined;
    const adapter = new OtherCommentDraftAdapter({
      question,
      onRenderedValueChange: () => setOtherRev((r) => r + 1),
    });
    adapterRef.current = adapter;
    return () => {
      adapter.dispose();
      if (adapterRef.current === adapter) adapterRef.current = undefined;
    };
  }, [showComment, question]);

  return (
    <View style={styles.row}>
      <Pressable
        disabled={pressDisabled}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole={shape === 'radio' ? 'radio' : 'checkbox'}
        accessibilityState={{ checked, disabled: pressDisabled }}
        // The recipe's CONTAINER slot lands here (codex PR-18 review
        // major 3): selectItemStyles returns container/decorator as
        // separate slots, and the container carries the theme's row
        // padding/gap; the A12 item.container override composes last.
        // The structural row direction stays as the base layer.
        style={({ pressed }) => [
          styles.pressableRow,
          ...composeStyles(
            selectItemStyles(
              recipes.item,
              {
                checked,
                pressed,
                focused,
                readOnly,
                preview,
                error,
                allowHover,
                addOn,
              },
              mode,
              shape
            ).container,
            { override: overrides.item?.container }
          ),
        ]}
        testID={props.testID}
      >
        {({ pressed }) => {
          const selected = selectItemStyles(
            recipes.item,
            {
              checked,
              pressed,
              focused,
              readOnly,
              preview,
              error,
              allowHover,
              addOn,
            },
            mode,
            shape
          );
          const iconFill = selectIconFill(recipes.item, {
            checked,
            focused,
            readOnly,
            preview,
          });
          return (
            <>
              <View
                style={composeStyles(selected.decorator, {
                  override: overrides.item?.decorator,
                })}
              >
                {checked && shape === 'checkbox' ? (
                  // Web parity: the checkbox checkmark is a real SVG icon
                  // (`<use xlinkHref={question.itemSvgIcon}>`), resolved here
                  // through the shared RNIcon primitive. Decorative (no title)
                  // — the row's `checkbox` role + label carry the semantics.
                  <RNIcon
                    testID={
                      props.testID ? `${props.testID}-check-icon` : undefined
                    }
                    iconName={resolveCheckIconName(question.itemSvgIcon)}
                    size={recipes.item.iconSize}
                    fill={iconFill}
                  />
                ) : null}
                {checked && shape === 'radio' ? (
                  <View
                    style={{
                      width: recipes.item.iconSize * 0.5,
                      height: recipes.item.iconSize * 0.5,
                      borderRadius: (recipes.item.iconSize * 0.5) / 2,
                      backgroundColor: iconFill,
                    }}
                  />
                ) : null}
              </View>
              <Text
                style={composeStyles(recipes.item.fragments.label, {
                  override: overrides.item?.label,
                })}
              >
                {item.text}
              </Text>
            </>
          );
        }}
      </Pressable>
      {showComment ? (
        <View style={styles.otherInputWrap}>
          <TextInput
            testID={props.otherInputTestID}
            // The conditional free-text area is named by its item's
            // localized text ("Other (describe)" by default) — task 1.16.
            accessibilityLabel={item.text}
            value={adapterRef.current?.renderedValue ?? ''}
            editable={!readOnly && itemEnabled}
            onChangeText={(text) => adapterRef.current?.handleChangeText(text)}
            onBlur={() => adapterRef.current?.handleBlur()}
            style={composeStyles(recipes.input.fragments.base, {
              override: overrides.input?.control,
            })}
          />
        </View>
      ) : null}
    </View>
  );
}
