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
 * description/required/error chrome is task 1.7's `SurveyQuestion`
 * wrapper (not yet landed on this branch) and stays out of this
 * component's responsibility, mirroring upstream's own split between
 * `SurveyQuestion` (chrome, owns the model subscription upstream) and
 * `SurveyQuestionComment` (body). Divergence, documented: upstream's body
 * component does NOT itself subscribe to the model — the chrome wrapper
 * re-renders it. No chrome wrapper exists yet on this branch, and this
 * component is dispatched directly by the descriptor-table registrar, so
 * `getStateElement()` is overridden here to own its own subscription
 * (self-sufficient, same shape 1.7 will eventually wrap).
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

    const rows = question.rows > 0 ? question.rows : 4;
    const lineHeight =
      (recipes.input.fragments.base as { lineHeight?: number }).lineHeight ??
      20;
    const minHeight = rows * lineHeight;
    const autoGrowHeight =
      question.renderedAutoGrow && this.state.contentHeight
        ? Math.max(this.state.contentHeight, minHeight)
        : undefined;

    return (
      <View>
        <TextInput
          testID="comment-input"
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
