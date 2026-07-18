/**
 * `paneldynamic` question (task 2.8a) — LIST `displayMode`: a stacked list of
 * dynamic panels, an add-panel button, a per-panel remove button (delete
 * confirmation dispatched by survey-core through the merged 2.2 dialog adapter,
 * `settings.showDialog` → OverlayHost), and the empty-state placeholder.
 * Carousel/tab/progress modes are 2.8b/2.8c. Plan:
 * docs/design/2.8a-paneldynamic-plan.md.
 *
 * Key design points (three-way reviewed — codex sol@max r + gemini):
 * - Iterate `renderedPanels` (LIST = all visible; single-panel in 2.8b/2.8c).
 * - Each dynamic panel is a full `PanelModel` → render its nested content with
 *   the EXISTING `SurveyPanel` composition (no new nested-render code); the
 *   renderer NEVER reads/writes panel values (each `panel.data` proxies value
 *   into the question's array).
 * - Visibility vs enabled are DISTINCT: `canAddPanel`/`canRemovePanel` gate
 *   PRESENCE (absent at max/min); `enableAddPanel`/`enableRemovePanel` gate the
 *   disabled-but-shown state.
 * - Add/remove go through the UI wrappers `addPanelUI()`/`removePanelUI(panel)`
 *   (guards + confirm decision live in core), never the raw `addPanel`/
 *   `removePanel`.
 * - React key sits on the OUTERMOST mapped wrapper (`panel.id`), not the nested
 *   `SurveyPanel`, or reconciliation transfers draft/native state across panels.
 * - Reactivity: three single-assignment core callbacks
 *   (`panelCountChangedCallback`/`renderModeChangedCallback`/
 *   `currentIndexChangedCallback`) share ONE stable handler that bumps state
 *   (functional `setState`, not `forceUpdate`); retarget-safe across a `question`
 *   prop swap (attach/detach on identity change; guarded clear).
 */
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Base, PanelModel, SurveyModel } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { SurveyPanel } from '../components/composition/SurveyPanel';
import { reportDiagnostic } from '../diagnostics';

interface LocStringLike {
  renderedHtml: string;
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
  panelCountChangedCallback?: () => void;
  renderModeChangedCallback?: () => void;
  currentIndexChangedCallback?: () => void;
}

export class PanelDynamicQuestion extends QuestionElementBase<QuestionElementBaseProps> {
  protected getStateElement(): Base {
    return this.questionBase;
  }

  private get pd(): PanelDynamicModelLike {
    return this.questionBase as unknown as PanelDynamicModelLike;
  }

  /** ONE stable handler shared by the three structural-change callbacks;
   * bumps the base's reserved render counter via functional setState (codex
   * major #2 — setState, not forceUpdate). */
  private boundQuestion: PanelDynamicModelLike | null = null;
  private readonly handleStructuralChange = (): void => {
    this.setState((state) => ({ __svRev: (state.__svRev ?? 0) + 1 }));
  };

  private attachCallbacks(q: PanelDynamicModelLike): void {
    q.panelCountChangedCallback = this.handleStructuralChange;
    q.renderModeChangedCallback = this.handleStructuralChange;
    q.currentIndexChangedCallback = this.handleStructuralChange;
    this.boundQuestion = q;
  }

  /** Guarded clear: only null a field that still points at OUR handler, so a
   * newer owner (after a prop swap) is never clobbered (codex major #2). */
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

  componentDidMount(): void {
    super.componentDidMount();
    this.attachCallbacks(this.pd);
    this.flushModeDiagnostic();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    const q = this.pd;
    if (this.boundQuestion && this.boundQuestion !== q) {
      this.detachCallbacks(this.boundQuestion);
      this.attachCallbacks(q);
    }
    this.flushModeDiagnostic();
  }

  componentWillUnmount(): void {
    if (this.boundQuestion) this.detachCallbacks(this.boundQuestion);
    this.boundQuestion = null;
    super.componentWillUnmount();
  }

  /** Unsupported (non-list) displayMode diagnostic — staged in render,
   * flushed+deduped in the commit phase (never emitted from render). */
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
        <Text>{question.locAddPanelText.renderedHtml}</Text>
      </Pressable>
    );
  }

  private renderPanel(panel: PanelModel): React.JSX.Element {
    const question = this.pd;
    const showRemove = question.canRemovePanel;
    const removeDisabled = !question.enableRemovePanel;
    const view = panel as unknown as {
      id: string;
      state: string;
      renderedIsExpanded: boolean;
      toggleState(): void;
    };
    const panelId = String(view.id);
    // A `panelsState` of collapsed/firstExpanded/expanded makes panels
    // collapsible (`state !== 'default'`); the existing SurveyPanel hides its
    // rows when not expanded and has NO expand affordance, so add a toggle
    // here — otherwise a collapsed panel's inputs are unreachable (codex r
    // major #1). `default` panels are always expanded and need no toggle.
    const collapsible = view.state !== 'default';
    return (
      <View key={panelId} testID={`paneldynamic-panel-${panelId}`}>
        {collapsible ? (
          <Pressable
            testID={`paneldynamic-toggle-${panelId}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: view.renderedIsExpanded }}
            onPress={() => {
              view.toggleState();
              this.handleStructuralChange();
            }}
            style={localStyles.toggle}
          >
            <Text>{view.renderedIsExpanded ? '▾' : '▸'}</Text>
          </Pressable>
        ) : null}
        <SurveyPanel
          survey={question.survey}
          creator={this.creator}
          element={panel}
        />
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
            <Text>{question.locRemovePanelText.renderedHtml}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.pd;
    this.pendingMode = undefined;
    if (!question.isRenderModeList) {
      this.pendingMode = question.displayMode;
      return <View testID="paneldynamic-mode-unsupported" />;
    }
    const panels = question.renderedPanels;
    if (panels.length === 0 && question.getShowNoEntriesPlaceholder()) {
      return (
        <View testID="paneldynamic-empty">
          <Text>{question.locNoEntriesText.renderedHtml}</Text>
          {this.renderAddButton()}
        </View>
      );
    }
    return (
      <View testID="paneldynamic-list">
        {panels.map((panel) => this.renderPanel(panel))}
        {this.renderAddButton()}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  addButton: { paddingVertical: 8, alignSelf: 'flex-start' },
  removeButton: { paddingVertical: 6, alignSelf: 'flex-end' },
  toggle: { paddingVertical: 4, alignSelf: 'flex-start' },
});
