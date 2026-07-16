/**
 * Task 1.11 — comment ("Long Text") question (design: 1.9's
 * `DraftCommitAdapter` for commit semantics — read
 * docs/design/1.9-draft-commit.md before touching this file; 0.7's
 * `input` recipe + `getControlVariant` bridge extraction for styling —
 * docs/design/0.7-theme-rn.md, "Hybrid bridge"). Upstream analog:
 * `SurveyQuestionComment` (survey-react-ui reactquestion_comment.tsx),
 * which composes web's uncontrolled `TextAreaComponent` +
 * `CharacterCounterComponent`.
 *
 * Scope: the question BODY only (the multiline control + counter) — title/
 * description/required/error chrome is task 1.7's `QuestionChrome`
 * wrapper and stays out of this component's responsibility, mirroring
 * upstream's own split between `SurveyQuestion` (chrome, owns the model
 * subscription upstream) and `SurveyQuestionComment` (body).
 *
 * 1.7 HANDOFF CONTRACT (codex PR-18 review, missed-surface 1): this
 * component overrides `getStateElement()` to own its own subscription so
 * it is self-sufficient when dispatched bare (no dispatcher composes
 * `QuestionChrome` around dispatched questions yet — that is 1.1/1.4).
 * When chrome wraps it, BOTH layers subscribe to the same question —
 * safe by design (the 0.4 D2 render guard lives ON the model; callbacks
 * are per-instance) and locked by the "inside QuestionChrome" test, but
 * redundant: the 1.1/1.4 dispatcher task may drop this override and let
 * chrome's subscription drive re-renders (upstream's shape). `focusIn()`
 * ownership stays HERE either way — `QuestionChrome` deliberately never
 * calls it (web drives it from a DOM focus-bubble handler; the RN analog
 * is the leaf input's own onFocus).
 *
 * RN-specific divergences from web (documented, intentional; DIFFERENCES
 * candidates):
 * - `acceptCarriageReturn:false`: web prevents the Enter keypress at the
 *   DOM level so a newline never enters the buffer. RN `TextInput` has no
 *   equivalent keypress-interception API for multiline inputs — newlines
 *   are stripped from the typed text in `onChangeText` instead, which
 *   reaches the same end state (no newlines ever visible or committed).
 * - `allowResize`/`resizeStyle`: a user-draggable resize handle has no RN
 *   analog; not rendered.
 * - `isReadOnlyRenderDiv()` (web's optional plain-`<div>` read-only mode):
 *   not ported — RN always renders the same `TextInput`, `editable={false}`
 *   for read-only, styled via the `input` recipe's readOnly fragment.
 */
import * as React from 'react';
import { TextInput, View, Text } from 'react-native';
import type { TextInputContentSizeChangeEvent } from 'react-native';
import type { Base, QuestionCommentModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { DraftCommitAdapter } from '../inputs/DraftCommitAdapter';
import { selectInputStyles, composeStyles } from '../theme-rn/recipes';
import type { InputCounterSize } from '../theme-rn/recipes';
import {
  getControlVariant,
  queueUnknownTokens,
  flushUnknownTokenDiagnostics,
} from '../theme-rn/bridge';

export type CommentProps = QuestionElementBaseProps;

interface CommentState {
  __svRev?: number;
  focused: boolean;
  contentHeight: number | undefined;
}

const CARRIAGE_RETURN_PATTERN = /(\r\n|\n|\r)/g;

export class Comment extends QuestionElementBase<CommentProps, CommentState> {
  private readonly adapter: DraftCommitAdapter;

  constructor(props: CommentProps) {
    super(props);
    this.state = { focused: false, contentHeight: undefined };
    this.adapter = new DraftCommitAdapter({
      question: props.question,
      onRenderedValueChange: () => this.forceUpdate(),
    });
  }

  protected getStateElement(): Base {
    return this.questionBase;
  }

  componentDidMount(): void {
    super.componentDidMount();
    flushUnknownTokenDiagnostics(this.questionBase);
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    flushUnknownTokenDiagnostics(this.questionBase);
  }

  componentWillUnmount(): void {
    super.componentWillUnmount();
    this.adapter.dispose();
  }

  private get comment(): QuestionCommentModel {
    return this.questionBase as QuestionCommentModel;
  }

  private handleChangeText = (text: string): void => {
    const question = this.comment;
    const filtered = question.acceptCarriageReturn
      ? text
      : text.replace(CARRIAGE_RETURN_PATTERN, '');
    this.adapter.handleChangeText(filtered);
  };

  private handleFocus = (): void => {
    this.setState({ focused: true });
    this.adapter.handleFocus();
    this.questionBase.focusIn();
  };

  private handleBlur = (): void => {
    this.setState({ focused: false });
    this.adapter.handleBlur();
  };

  private handleContentSizeChange = (
    event: TextInputContentSizeChangeEvent
  ): void => {
    const height = event.nativeEvent.contentSize.height;
    if (height !== this.state.contentHeight) {
      this.setState({ contentHeight: height });
    }
  };

  protected renderElement(): React.JSX.Element {
    const question = this.comment;
    const { recipes, styles: overrides, mode } = this.themeContext;
    const controlVariant = getControlVariant(
      question,
      question.getControlClass()
    );
    queueUnknownTokens(question, controlVariant.unknownTokens);

    const maxLength = question.getMaxLength();
    const hasCounter = typeof maxLength === 'number' && maxLength > 0;
    const counterSize: InputCounterSize = maxLength > 99 ? 'big' : 'normal';
    const readOnly =
      (controlVariant.variant.readOnly ?? false) || question.isInputReadOnly;

    const inputStyles = selectInputStyles(
      recipes.input,
      {
        focused: this.state.focused,
        readOnly,
        preview: controlVariant.variant.preview ?? false,
        error: controlVariant.variant.error ?? false,
        counter: this.state.focused && hasCounter ? counterSize : undefined,
      },
      mode
    );

    // RN heights are BORDER-BOX — a fixed/min height includes the base
    // fragment's vertical padding (codex PR-18 review minor 4) — so
    // reserving `rows` content lines needs `rows * lineHeight` PLUS the
    // effective top+bottom padding, and the content height reported by
    // onContentSizeChange (a content-box measure) needs the same padding
    // added back before it becomes the input's height.
    const rows = question.rows > 0 ? question.rows : 4;
    const base = recipes.input.fragments.base as {
      lineHeight?: number;
      paddingVertical?: number;
      paddingTop?: number;
      paddingBottom?: number;
    };
    const lineHeight = base.lineHeight ?? 20;
    const verticalPadding =
      base.paddingTop !== undefined || base.paddingBottom !== undefined
        ? (base.paddingTop ?? base.paddingVertical ?? 0) +
          (base.paddingBottom ?? base.paddingVertical ?? 0)
        : (base.paddingVertical ?? 0) * 2;
    const minHeight = rows * lineHeight + verticalPadding;
    const autoGrowHeight =
      question.renderedAutoGrow && this.state.contentHeight
        ? Math.max(this.state.contentHeight + verticalPadding, minHeight)
        : undefined;

    return (
      <View>
        <TextInput
          testID="comment-input"
          accessibilityLabel={question.processedTitle || question.name}
          multiline
          value={this.adapter.renderedValue}
          editable={!readOnly}
          placeholder={question.renderedPlaceholder}
          maxLength={hasCounter ? maxLength : undefined}
          onChangeText={this.handleChangeText}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          onSubmitEditing={() => this.adapter.handleSubmitEditing()}
          onContentSizeChange={
            question.renderedAutoGrow ? this.handleContentSizeChange : undefined
          }
          style={composeStyles(inputStyles, {
            override: overrides.input?.control,
          }).concat(
            autoGrowHeight !== undefined
              ? [{ height: autoGrowHeight }]
              : [{ minHeight }]
          )}
        />
        {hasCounter ? (
          <Text
            style={composeStyles(recipes.input.fragments.characterCounter, {
              override: overrides.input?.characterCounter,
            })}
          >
            {question.characterCounter.remainingCharacterCounter}
          </Text>
        ) : null}
      </View>
    );
  }
}
