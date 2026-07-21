/**
 * File-upload recipe (task 5.2). Fixtures: `default-theme/blocks/sd-file.scss`
 * (choose button, file list/preview item, image decorator, remove control,
 * navigator) resolved through the metrics-fixture formula helpers — never a
 * hardcoded literal (design 0.7-metrics-fixture).
 *
 * Per invariant 6 the recipe owns ONLY presentation tokens; all model-state
 * (which files, image-vs-decorator, pagination) comes from
 * `QuestionFileModel` at render time. Thumbnail/decorator DIMENSIONS default
 * here and are overridden inline from the model's `imageWidth`/`imageHeight`
 * when set (web parity).
 */
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { calcFontSize, calcSize, resolveColorVar } from './tokenLookup';
import type { BuildContext } from './types';

export interface FileRecipe {
  fragments: {
    /** `.sd-file` root column. */
    root: ViewStyle;
    /** Row of choose action(s) (file / camera). */
    actions: ViewStyle;
    /** `.sd-file__choose-btn` bordered pill. */
    chooseButton: ViewStyle;
    /** Choose-button caption. */
    chooseButtonText: TextStyle;
    /** Extra layer applied to a disabled (read-only / peer-absent) choose button. */
    chooseButtonDisabled: ViewStyle;
    /** `.sd-file__list` preview list (single current page). */
    list: ViewStyle;
    /** `.sd-file__preview-item` per-file column. */
    item: ViewStyle;
    /** `.sd-file__image` thumbnail (dimensions overridden from the model). */
    thumbnail: ImageStyle;
    /** `.sd-file__default-image` bordered decorator box for a non-image file. */
    decorator: ViewStyle;
    /** File-name text (decorator + under-thumbnail). */
    fileName: TextStyle;
    /** `.sd-file__remove-file-button`. */
    removeButton: ViewStyle;
    /** Remove-button caption. */
    removeButtonText: TextStyle;
    /** `.sd-file__file-navigator` pager row. */
    navigator: ViewStyle;
    /** Prev/next pager button. */
    navButton: ViewStyle;
    /** Pager button glyph. */
    navButtonText: TextStyle;
    /** `n of m` index caption. */
    navIndexText: TextStyle;
    /** Loading-indicator row. */
    loading: ViewStyle;
    /** Read-only empty placeholder box. */
    placeholder: ViewStyle;
    /** Placeholder text. */
    placeholderText: TextStyle;
  };
  /** Default thumbnail width (px) when the model's `imageWidth` is unset. */
  defaultImageWidth: number;
  /** Default thumbnail height (px) when the model's `imageHeight` is unset. */
  defaultImageHeight: number;
  /** Loading-indicator color (theme primary). */
  loadingColor: string;
}

export function buildFileRecipe(
  resolved: ResolvedTheme,
  buildCtx?: BuildContext
): FileRecipe {
  const sink = buildCtx?.diagnostics;
  const primary = resolveColorVar(
    resolved,
    '--sjs-primary-backcolor',
    sink
  ).css;
  const onPrimary = resolveColorVar(
    resolved,
    '--sjs-primary-forecolor',
    sink
  ).css;
  const backcolor = resolveColorVar(
    resolved,
    '--sjs-general-backcolor',
    sink
  ).css;
  const border = resolveColorVar(resolved, '--sjs-border-default', sink).css;
  const fontTitle = resolveColorVar(
    resolved,
    '--sjs-font-questiontitle-color',
    sink
  ).css;
  const fontDesc = resolveColorVar(
    resolved,
    '--sjs-font-questiondescription-color',
    sink
  ).css;
  const errorColor = resolveColorVar(resolved, '--sjs-special-red', sink).css;

  const fontSize = calcFontSize(resolved, 1);
  const smallFont = calcFontSize(resolved, 0.75);
  const radius = calcSize(resolved, 0.5);
  const gap = calcSize(resolved, 0.5);
  const unit = calcSize(resolved, 1);

  const fragments = StyleSheet.create({
    root: {
      alignSelf: 'flex-start',
      rowGap: gap,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: gap,
      rowGap: gap,
    },
    chooseButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: gap,
      paddingHorizontal: unit,
      paddingVertical: gap,
      borderRadius: radius,
      backgroundColor: primary,
    },
    chooseButtonText: {
      color: onPrimary,
      fontSize,
    },
    chooseButtonDisabled: {
      opacity: 0.5,
    },
    list: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: gap,
      rowGap: gap,
    },
    item: {
      alignItems: 'center',
      rowGap: gap,
    },
    thumbnail: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      backgroundColor: backcolor,
    },
    decorator: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      backgroundColor: backcolor,
      padding: unit,
    },
    fileName: {
      color: fontTitle,
      fontSize: smallFont,
      textAlign: 'center',
    },
    removeButton: {
      alignSelf: 'center',
      paddingHorizontal: gap,
      paddingVertical: calcSize(resolved, 0.25),
      borderRadius: radius,
      borderWidth: 1,
      borderColor: errorColor,
    },
    removeButtonText: {
      color: errorColor,
      fontSize: smallFont,
    },
    navigator: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: unit,
    },
    navButton: {
      paddingHorizontal: unit,
      paddingVertical: gap,
      borderRadius: radius,
      borderWidth: 1,
      borderColor: border,
    },
    navButtonText: {
      color: fontTitle,
      fontSize,
    },
    navIndexText: {
      color: fontDesc,
      fontSize,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: gap,
      paddingVertical: gap,
    },
    placeholder: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      paddingHorizontal: unit,
      paddingVertical: gap,
      backgroundColor: backcolor,
    },
    placeholderText: {
      color: fontDesc,
      fontSize,
    },
  });

  return {
    fragments,
    defaultImageWidth: 100,
    defaultImageHeight: 100,
    loadingColor: primary,
  };
}
