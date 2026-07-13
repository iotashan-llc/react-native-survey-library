/**
 * The wrapper every question renders inside — title (number gutter +
 * required mark), description, error panel, comment area, collapse/expand
 * header behavior (design: docs/IMPLEMENTATION-PLAN.md row 1.7). RN analog
 * of upstream survey-react-ui's `SurveyQuestion` (reactquestion.tsx) +
 * `SurveyElementHeader` (element-header.tsx) + `TitleContent`
 * (title-content.tsx), collapsed into one component since RN has no
 * DOM-ref/`data-rendered` idempotence concerns (0.4 design, "NOT ported").
 *
 * Registers nothing in factories — the M1 dispatcher (1.1/1.4) wraps a
 * dispatched question's real input component in `<QuestionChrome>` as
 * `children`; this file is exported for that consumption, not registered
 * itself.
 *
 * `getStateElement()` override: this is the layer of the 0.4 port map that
 * actually subscribes to the question model (title/description/errors/
 * comment/state all live on the question) — `QuestionElementBase` itself
 * intentionally leaves that to each concrete leaf renderer (mirrors
 * upstream: `SurveyQuestionElementBase` doesn't override it either; only
 * the top-level `SurveyQuestion` does, reactquestion.tsx:45-47).
 *
 * `canRender()` is relaxed to `!!questionBase` only (the base's default
 * also requires `!!creator`): chrome does not dispatch a question through
 * `ISurveyCreator` — the M1 dispatcher already created `children` before
 * wrapping — so a `creator` prop is not required here.
 *
 * Collapse/expand is model-state only, no animation (0.4 D3): collapsing
 * fully UNMOUNTS the content slot rather than a CSS `display:none`
 * equivalent (upstream keeps it mounted for a smooth CSS transition,
 * which RN doesn't need per D3 — unmounting is simpler and, unlike
 * `display:none`, is actually observable by RN Testing Library queries).
 * The header (title + description-under-title) stays mounted while
 * collapsed — collapsing only hides the input/comment/description-under-
 * input content, matching `SurveyElement.collapse()`'s own doc comment:
 * "the element displays only title and description".
 *
 * The comment ("Other" comment textarea comes later, task 1.12+) area
 * here is the question-level `showCommentArea` slot: a plain `TextInput`
 * wired to `question.comment` via a local draft + simple onBlur commit
 * (the full `textUpdateMode`-aware draft/commit adapter is task 1.9).
 */
import * as React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import type { SurveyElementBaseState } from '../reactivity/SurveyElementBase';
import type { Base, Question, LocalizableString } from '../core/facade';
import { getRootVariant } from '../theme-rn/bridge';
import { composeStyles } from '../theme-rn/recipes/types';
import { selectQuestionTitleStyles } from '../theme-rn/recipes/questionTitle';
import { selectInputStyles } from '../theme-rn/recipes/input';
import type { QuestionChromeRecipe } from '../theme-rn/recipes/questionChrome';
import type { QuestionTitleRecipe } from '../theme-rn/recipes/questionTitle';
import type {
  QuestionChromeStyleOverrides,
  QuestionTitleStyleOverrides,
} from '../theme-rn/overrides';

const localStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
});

export interface QuestionChromeProps extends QuestionElementBaseProps {
  children?: React.ReactNode;
  testID?: string;
}

interface QuestionChromeState extends SurveyElementBaseState {
  commentDraft: string;
}

type RequiredMarkPosition = 'start' | 'before' | 'after' | 'none';

function requiredMarkPosition(question: Question): RequiredMarkPosition {
  if (!question.isRequired) return 'none';
  if (question.isRequireTextOnStart) return 'start';
  if (question.isRequireTextBeforeTitle) return 'before';
  if (question.isRequireTextAfterTitle) return 'after';
  return 'none';
}

/**
 * `locCommentText` is a REAL runtime getter (survey-core's
 * `@property({ localizable: {...} }) commentText` decorator defines it via
 * `Object.defineProperty`, decorators.ts:99-111) that survey-core's own
 * `.d.ts` does not declare — the same gap `bridge.ts`'s
 * `getQuestionCssClasses` casts around for `cssClasses`. Reading it here
 * (rather than the generic `Base.getLocalizableString('commentText')`,
 * which returns `null` until `locCommentText` has been touched at least
 * once) is what LAZILY CREATES the LocalizableString on first access.
 */
function getLocCommentText(question: Question): LocalizableString {
  return (question as unknown as { locCommentText: LocalizableString })
    .locCommentText;
}

export class QuestionChrome extends QuestionElementBase<
  QuestionChromeProps,
  QuestionChromeState
> {
  private lastChangedPropForCommit: string | undefined;

  constructor(props: QuestionChromeProps) {
    super(props);
    this.state = {
      ...this.state,
      commentDraft: props.question?.comment ?? '',
    };
  }

  protected getStateElement(): Base | null {
    return this.questionBase;
  }

  protected canRender(): boolean {
    return !!this.questionBase;
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    // Sync an EXTERNAL `comment` mutation (or reflect our own just-
    // committed onBlur write, a no-op since they already match) into the
    // draft. Gated on `lastChangedPropForCommit` (captured during the
    // render that this commit follows) so a re-render caused by the user
    // TYPING — which never touches the model, only local `commentDraft`
    // state — never gets treated as a model-driven sync and clobbers what
    // they just typed.
    if (this.lastChangedPropForCommit === 'comment') {
      const modelComment = this.questionBase.comment ?? '';
      if (modelComment !== this.state.commentDraft) {
        this.setState({ commentDraft: modelComment } as QuestionChromeState);
      }
    }
  }

  private handleCommentChange = (text: string): void => {
    this.setState({ commentDraft: text } as QuestionChromeState);
  };

  private handleCommentBlur = (): void => {
    const question = this.questionBase;
    if (question.comment !== this.state.commentDraft) {
      question.comment = this.state.commentDraft;
    }
  };

  private handleTitlePress = (): void => {
    const question = this.questionBase;
    if (question.hasStateButton) {
      question.toggleState();
    }
  };

  protected renderElement(): React.JSX.Element {
    // Captured BEFORE the base class clears it at the end of `render()`
    // (0.4 design: "changedStatePropNameValue cleared at render end") —
    // `componentDidUpdate` (which runs after) reads this stashed copy.
    this.lastChangedPropForCommit = this.changedStatePropName;

    const question = this.questionBase;
    const { recipes, styles: overrides } = this.themeContext;
    const collapsed = question.isCollapsed;

    const header = question.hasTitle
      ? this.renderHeader(
          question,
          recipes.questionTitle,
          overrides.questionTitle,
          recipes.questionChrome,
          overrides.questionChrome,
          collapsed
        )
      : null;
    const headerTop = question.hasTitleOnLeftTop ? header : null;
    const headerBottom = question.hasTitleOnBottom ? header : null;

    const showErrorsAbove =
      question.showErrorsAboveQuestion && question.hasVisibleErrors;
    const showErrorsBelow =
      question.showErrorsBelowQuestion && question.hasVisibleErrors;
    const errorsAbove = showErrorsAbove
      ? this.renderErrors(
          question,
          recipes.questionChrome,
          overrides.questionChrome,
          'above'
        )
      : null;
    const errorsBelow = showErrorsBelow
      ? this.renderErrors(
          question,
          recipes.questionChrome,
          overrides.questionChrome,
          'below'
        )
      : null;

    const content = !collapsed ? (
      <View testID={`${question.name}-content`}>
        {this.props.children}
        {question.showCommentArea
          ? this.renderComment(
              question,
              recipes.questionChrome,
              overrides.questionChrome,
              recipes.input
            )
          : null}
        {question.hasDescriptionUnderInput
          ? this.renderDescription(
              question,
              recipes.questionChrome,
              overrides.questionChrome,
              'description-under-input'
            )
          : null}
      </View>
    ) : null;

    return (
      <View testID={this.props.testID ?? `${question.name}-chrome`}>
        {errorsAbove}
        {headerTop}
        {content}
        {headerBottom}
        {errorsBelow}
      </View>
    );
  }

  private renderHeader(
    question: Question,
    titleRecipe: QuestionTitleRecipe,
    titleOverrides: QuestionTitleStyleOverrides | undefined,
    chromeRecipe: QuestionChromeRecipe,
    chromeOverrides: QuestionChromeStyleOverrides | undefined,
    collapsed: boolean
  ): React.JSX.Element {
    const errorVariant = getRootVariant(
      question,
      question.getRootCss()
    ).variant;
    const titleStyles = selectQuestionTitleStyles(titleRecipe, {
      required: question.isRequired,
      errorTone: !!errorVariant.error,
      collapsed,
    });

    const numberText = question.no;
    const markText = question.isRequired ? question.requiredMark : '';
    const position = requiredMarkPosition(question);

    const requiredMarkEl = markText ? (
      <Text
        key="required-mark"
        style={composeStyles(titleRecipe.fragments.requiredMark, {
          override: titleOverrides?.requiredMark,
        })}
      >
        {markText}
      </Text>
    ) : null;

    const titleTextEl = this.renderLocString(
      question.locRenderedTitle,
      composeStyles(titleStyles, { override: titleOverrides?.title }),
      'title'
    );

    const parts: React.ReactNode[] = [];
    if (position === 'start' && requiredMarkEl) parts.push(requiredMarkEl);
    if (numberText) {
      parts.push(
        <View
          key="number-gutter"
          style={composeStyles(titleRecipe.fragments.numberGutter, {
            override: titleOverrides?.numberGutter,
          })}
        >
          <Text
            style={composeStyles(titleRecipe.fragments.number, {
              override: titleOverrides?.number,
            })}
          >
            {numberText}
          </Text>
        </View>
      );
    }
    if (position === 'before' && requiredMarkEl) parts.push(requiredMarkEl);
    parts.push(titleTextEl);
    if (position === 'after' && requiredMarkEl) parts.push(requiredMarkEl);

    const titleRow = <View style={localStyles.headerRow}>{parts}</View>;
    const testID = `${question.name}-title`;
    const expandable = question.hasStateButton;

    const headerInner = expandable ? (
      <Pressable
        onPress={this.handleTitlePress}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        testID={testID}
      >
        {titleRow}
      </Pressable>
    ) : (
      <View testID={testID}>{titleRow}</View>
    );

    const descriptionUnderTitle = question.hasDescriptionUnderTitle
      ? this.renderDescription(
          question,
          chromeRecipe,
          chromeOverrides,
          'description-under-title'
        )
      : null;

    return (
      <View>
        {headerInner}
        {descriptionUnderTitle}
      </View>
    );
  }

  private renderDescription(
    question: Question,
    chromeRecipe: QuestionChromeRecipe,
    chromeOverrides: QuestionChromeStyleOverrides | undefined,
    key: string
  ): React.JSX.Element {
    return this.renderLocString(
      question.locDescription,
      composeStyles(chromeRecipe.fragments.description, {
        override: chromeOverrides?.description,
      }),
      key
    );
  }

  private renderErrors(
    question: Question,
    chromeRecipe: QuestionChromeRecipe,
    chromeOverrides: QuestionChromeStyleOverrides | undefined,
    position: 'above' | 'below'
  ): React.JSX.Element {
    const panelVariant =
      position === 'above'
        ? chromeRecipe.fragments.errorPanelAbove
        : chromeRecipe.fragments.errorPanelBelow;
    return (
      <View
        testID={`${question.name}-errors-${position}`}
        accessibilityRole="alert"
        style={composeStyles(
          [chromeRecipe.fragments.errorPanel, panelVariant],
          {
            override: chromeOverrides?.errorPanel,
          }
        )}
      >
        {question.renderedErrors.map((error, index) =>
          this.renderLocString(
            error.locText,
            composeStyles(chromeRecipe.fragments.errorItem, {
              override: chromeOverrides?.errorItem,
            }),
            `error-${position}-${index}`
          )
        )}
      </View>
    );
  }

  private renderComment(
    question: Question,
    chromeRecipe: QuestionChromeRecipe,
    chromeOverrides: QuestionChromeStyleOverrides | undefined,
    inputRecipe: Parameters<typeof selectInputStyles>[0]
  ): React.JSX.Element {
    const inputStyles = selectInputStyles(
      inputRecipe,
      {
        focused: false,
        readOnly: this.isDisplayMode,
        preview: false,
        error: false,
      },
      { narrow: false, rtl: false }
    ) as TextStyle[];

    return (
      <View
        style={composeStyles(chromeRecipe.fragments.commentArea, {
          override: chromeOverrides?.commentArea,
        })}
      >
        {this.renderLocString(
          getLocCommentText(question),
          composeStyles(chromeRecipe.fragments.commentLabel, {
            override: chromeOverrides?.commentLabel,
          }),
          'comment-label'
        )}
        <TextInput
          testID={`${question.name}-comment`}
          value={this.state.commentDraft}
          onChangeText={this.handleCommentChange}
          onBlur={this.handleCommentBlur}
          editable={!this.isDisplayMode}
          placeholder={question.renderedCommentPlaceholder}
          multiline
          style={composeStyles(inputStyles, {
            override: chromeOverrides?.commentInput,
          })}
        />
      </View>
    );
  }
}
