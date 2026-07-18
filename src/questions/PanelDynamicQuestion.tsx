/**
 * `paneldynamic` question (task 2.8a) — LIST `displayMode`: a stacked list of
 * dynamic panels, an add-panel button, a per-panel remove button (delete
 * confirmation dispatched by survey-core through the merged 2.2 dialog adapter,
 * `settings.showDialog` → OverlayHost), and the empty-state placeholder.
 * Carousel/tab/progress modes are 2.8b/2.8c. Plan:
 * docs/design/2.8a-paneldynamic-plan.md.
 *
 * Key design points (three-way reviewed + implementation-reviewed):
 * - Iterate `renderedPanels` (LIST = all visible; single-panel in 2.8b/2.8c).
 * - Each panel is rendered by a per-panel REACTIVE component
 *   (`PanelDynamicItem extends SurveyElementBase`, state elements
 *   `[panel, question]` — like ButtonGroupItemRow/ImagePickerTile) so an
 *   EXTERNAL collapse/expand (survey-core emits it on the PanelModel, not the
 *   question) re-renders the right item and its content stays reachable (impl
 *   review major #1). Nested content reuses the EXISTING `SurveyPanel`
 *   composition; the renderer NEVER reads/writes panel values (each
 *   `panel.data` proxies value into the question's array).
 * - Localizable captions (add/remove/noEntries) render through
 *   `renderLocString` (reactive viewer + HTML-safe) AND their `onStringChanged`
 *   channel is subscribed so accessibility labels stay fresh on locale/text
 *   changes (impl review major #3) — the base property subscription does not
 *   observe LocalizableString channels.
 * - Visibility vs enabled are DISTINCT: `canAddPanel`/`canRemovePanel` gate
 *   PRESENCE (absent at max/min); `enableAddPanel`/`enableRemovePanel` gate the
 *   disabled-but-shown state.
 * - Add/remove go through the UI wrappers `addPanelUI()`/`removePanelUI(panel)`
 *   (guards + confirm decision live in core), never the raw `addPanel`/
 *   `removePanel`.
 * - React key sits on the OUTERMOST mapped item (`panel.id`).
 * - Structural reactivity: three single-assignment core callbacks
 *   (`panelCountChangedCallback`/`renderModeChangedCallback`/
 *   `currentIndexChangedCallback`) share ONE stable handler that bumps state
 *   (functional `setState`, not `forceUpdate`); retarget-safe across a `question`
 *   prop swap (attach/detach on identity change; guarded clear).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  Base,
  LocalizableString,
  PanelModel,
  SurveyModel,
} from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import { SurveyPanel } from '../components/composition/SurveyPanel';
import { reportDiagnostic } from '../diagnostics';

interface LocStringLike {
  renderedHtml: string;
  onStringChanged: {
    add(cb: () => void): void;
    remove(cb: () => void): void;
  };
}

interface PanelViewLike {
  id: string | number;
  state: string;
  renderedIsExpanded: boolean;
  toggleState(): void;
}

interface PanelDynamicModelLike {
  name: string;
  survey: SurveyModel;
  isRenderModeList: boolean;
  displayMode: string;
  renderedPanels: PanelModel[];
  canAddPanel: boolean;
  enableAddPanel: boolean;
  canRemovePanel: boolean;
  enableRemovePanel: boolean;
  addPanelUI(): unknown;
  removePanelUI(panel: PanelModel): void;
  getShowNoEntriesPlaceholder(): boolean;
  locAddPanelText: LocStringLike;
  locRemovePanelText: LocStringLike;
  locNoEntriesText: LocStringLike;
  // Carousel (2.8b): renderedPanels is [currentPanel] in carousel mode.
  currentIndex: number;
  goToNextPanel(): void;
  goToPrevPanel(): void;
  isNextButtonShowing: boolean;
  isPrevButtonShowing: boolean;
  progressText: string;
  showProgressBar: boolean;
  panelCountChangedCallback?: () => void;
  renderModeChangedCallback?: () => void;
  currentIndexChangedCallback?: () => void;
}

/** Subscribe/unsubscribe a LocalizableString's `onStringChanged` channel to a
 * handler, tracking the currently-subscribed instance (idempotent, swap-safe).
 * The base property subscription does NOT observe these channels. */
function syncLocSub(
  next: LocStringLike | null,
  current: LocStringLike | null,
  handler: () => void
): LocStringLike | null {
  if (next === current) return current;
  current?.onStringChanged.remove(handler);
  next?.onStringChanged.add(handler);
  return next;
}

interface PanelDynamicItemProps {
  question: PanelDynamicModelLike;
  panel: PanelModel;
  survey: SurveyModel;
  creator: unknown;
}

/** One dynamic panel — reactive to BOTH the panel (external collapse/expand,
 * per-panel property changes) and the question (can/enable Remove). */
class PanelDynamicItem extends SurveyElementBase<PanelDynamicItemProps> {
  private subscribedRemove: LocStringLike | null = null;
  private readonly handleLocChanged = (): void => {
    this.forceUpdate();
  };

  protected getStateElement(): Base | null {
    return this.props.panel as unknown as Base;
  }

  protected getStateElements(): Base[] {
    return [
      this.props.panel as unknown as Base,
      this.props.question as unknown as Base,
    ];
  }

  private syncSubs(): void {
    this.subscribedRemove = syncLocSub(
      this.props.question.locRemovePanelText,
      this.subscribedRemove,
      this.handleLocChanged
    );
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.syncSubs();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.syncSubs();
  }

  componentWillUnmount(): void {
    this.subscribedRemove?.onStringChanged.remove(this.handleLocChanged);
    this.subscribedRemove = null;
    super.componentWillUnmount();
  }

  protected renderElement(): React.JSX.Element {
    const { question, panel, survey, creator } = this.props;
    const view = panel as unknown as PanelViewLike;
    const panelId = String(view.id);
    const showRemove = question.canRemovePanel;
    const removeDisabled = !question.enableRemovePanel;
    // `panelsState` collapsed/firstExpanded/expanded → collapsible
    // (`state !== 'default'`). SurveyPanel hides its rows when not expanded and
    // has no expand affordance, so a collapsible panel gets a toggle here —
    // otherwise collapsed content is unreachable (review major #1). The item
    // subscribes the panel, so an EXTERNAL state change also re-renders it.
    const collapsible = view.state !== 'default';
    return (
      <View testID={`paneldynamic-panel-${panelId}`}>
        {collapsible ? (
          <Pressable
            testID={`paneldynamic-toggle-${panelId}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: view.renderedIsExpanded }}
            onPress={() => view.toggleState()}
            style={localStyles.toggle}
          >
            <Text>{view.renderedIsExpanded ? '▾' : '▸'}</Text>
          </Pressable>
        ) : null}
        <SurveyPanel survey={survey} creator={creator} element={panel} />
        {showRemove ? (
          <Pressable
            testID={`paneldynamic-remove-${panelId}`}
            accessibilityRole="button"
            accessibilityLabel={question.locRemovePanelText.renderedHtml}
            accessibilityState={{ disabled: removeDisabled }}
            disabled={removeDisabled}
            onPress={() => question.removePanelUI(panel)}
            style={localStyles.removeButton}
          >
            {SurveyElementBase.renderLocString(
              question.locRemovePanelText as unknown as LocalizableString,
              undefined,
              'remove'
            )}
          </Pressable>
        ) : null}
      </View>
    );
  }
}

export class PanelDynamicQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get pd(): PanelDynamicModelLike {
    return this.questionBase as unknown as PanelDynamicModelLike;
  }

  /** ONE stable handler shared by the three structural-change callbacks;
   * bumps the base's reserved render counter via functional setState (review
   * major #2 — setState, not forceUpdate). */
  private boundQuestion: PanelDynamicModelLike | null = null;
  private readonly handleStructuralChange = (): void => {
    this.setState((state) => ({ __svRev: (state.__svRev ?? 0) + 1 }));
  };

  /** Add/no-entries captions are LocalizableString channels — subscribe them
   * so a locale/text change re-renders (fresh a11y labels). */
  private subscribedAdd: LocStringLike | null = null;
  private subscribedNoEntries: LocStringLike | null = null;

  private attachCallbacks(q: PanelDynamicModelLike): void {
    q.panelCountChangedCallback = this.handleStructuralChange;
    q.renderModeChangedCallback = this.handleStructuralChange;
    q.currentIndexChangedCallback = this.handleStructuralChange;
    this.boundQuestion = q;
  }

  /** Guarded clear: only null a field that still points at OUR handler, so a
   * newer owner (after a prop swap) is never clobbered (review major #2). */
  private detachCallbacks(q: PanelDynamicModelLike): void {
    if (q.panelCountChangedCallback === this.handleStructuralChange) {
      q.panelCountChangedCallback = undefined;
    }
    if (q.renderModeChangedCallback === this.handleStructuralChange) {
      q.renderModeChangedCallback = undefined;
    }
    if (q.currentIndexChangedCallback === this.handleStructuralChange) {
      q.currentIndexChangedCallback = undefined;
    }
  }

  private syncLocSubs(): void {
    this.subscribedAdd = syncLocSub(
      this.pd.locAddPanelText,
      this.subscribedAdd,
      this.handleStructuralChange
    );
    this.subscribedNoEntries = syncLocSub(
      this.pd.locNoEntriesText,
      this.subscribedNoEntries,
      this.handleStructuralChange
    );
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.attachCallbacks(this.pd);
    this.syncLocSubs();
    this.flushModeDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const q = this.pd;
    if (this.boundQuestion && this.boundQuestion !== q) {
      this.detachCallbacks(this.boundQuestion);
      this.attachCallbacks(q);
      // A retarget is a new question — its diagnostic must not be suppressed
      // by the old question's reported mode (review minor #4).
      this.reportedMode = undefined;
    }
    this.syncLocSubs();
    this.flushModeDiagnostic();
  }

  componentWillUnmount(): void {
    if (this.boundQuestion) this.detachCallbacks(this.boundQuestion);
    this.boundQuestion = null;
    this.subscribedAdd?.onStringChanged.remove(this.handleStructuralChange);
    this.subscribedNoEntries?.onStringChanged.remove(
      this.handleStructuralChange
    );
    this.subscribedAdd = null;
    this.subscribedNoEntries = null;
    super.componentWillUnmount();
  }

  /** Unsupported (non-list) displayMode diagnostic — staged in render,
   * flushed+deduped in the commit phase (never emitted from render). Dedup is
   * keyed by (question identity via retarget reset) + mode. */
  private pendingMode: string | undefined;
  private reportedMode: string | undefined;

  private flushModeDiagnostic(): void {
    const mode = this.pendingMode;
    if (mode === undefined || this.reportedMode === mode) return;
    this.reportedMode = mode;
    reportDiagnostic({
      code: 'paneldynamic-mode-unsupported',
      questionName: this.pd.name,
      displayMode: mode,
    });
  }

  private renderAddButton(): React.ReactNode {
    const question = this.pd;
    if (!question.canAddPanel) return null;
    const disabled = !question.enableAddPanel;
    return (
      <Pressable
        testID="paneldynamic-add"
        accessibilityRole="button"
        accessibilityLabel={question.locAddPanelText.renderedHtml}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => question.addPanelUI()}
        style={localStyles.addButton}
      >
        {SurveyElementBase.renderLocString(
          question.locAddPanelText as unknown as LocalizableString,
          undefined,
          'add'
        )}
      </Pressable>
    );
  }

  /** Carousel (2.8b): a single current panel + prev/next nav + progress text.
   * `currentIndexChangedCallback` (wired in attachCallbacks) re-renders on a
   * nav. `tab` mode is 2.8c and still falls through to the unsupported view. */
  private renderCarousel(): React.JSX.Element {
    const question = this.pd;
    const current = question.renderedPanels[0];
    return (
      <View testID="paneldynamic-carousel">
        {question.showProgressBar ? (
          <Text testID="paneldynamic-progress">{question.progressText}</Text>
        ) : null}
        {current ? (
          <PanelDynamicItem
            key={String((current as unknown as PanelViewLike).id)}
            question={question}
            panel={current}
            survey={question.survey}
            creator={this.creator}
          />
        ) : null}
        <View style={localStyles.nav}>
          {question.isPrevButtonShowing ? (
            <Pressable
              testID="paneldynamic-prev"
              accessibilityRole="button"
              onPress={() => question.goToPrevPanel()}
              style={localStyles.navButton}
            >
              <Text>‹</Text>
            </Pressable>
          ) : null}
          {question.isNextButtonShowing ? (
            <Pressable
              testID="paneldynamic-next"
              accessibilityRole="button"
              onPress={() => question.goToNextPanel()}
              style={localStyles.navButton}
            >
              <Text>›</Text>
            </Pressable>
          ) : null}
        </View>
        {this.renderAddButton()}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.pd;
    this.pendingMode = undefined;
    if (!question.isRenderModeList) {
      if (question.displayMode === 'carousel') return this.renderCarousel();
      this.pendingMode = question.displayMode;
      return <View testID="paneldynamic-mode-unsupported" />;
    }
    const panels = question.renderedPanels;
    if (panels.length === 0 && question.getShowNoEntriesPlaceholder()) {
      return (
        <View testID="paneldynamic-empty">
          {SurveyElementBase.renderLocString(
            question.locNoEntriesText as unknown as LocalizableString,
            undefined,
            'no-entries'
          )}
          {this.renderAddButton()}
        </View>
      );
    }
    return (
      <View testID="paneldynamic-list">
        {panels.map((panel) => (
          <PanelDynamicItem
            key={String((panel as unknown as PanelViewLike).id)}
            question={question}
            panel={panel}
            survey={question.survey}
            creator={this.creator}
          />
        ))}
        {this.renderAddButton()}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  addButton: { paddingVertical: 8, alignSelf: 'flex-start' },
  removeButton: { paddingVertical: 6, alignSelf: 'flex-end' },
  toggle: { paddingVertical: 4, alignSelf: 'flex-start' },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
  navButton: { paddingVertical: 6, paddingHorizontal: 12 },
});
