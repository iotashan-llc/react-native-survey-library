/**
 * `tagbox` question (task 2.4) — the MULTI-SELECT sibling of `dropdown`,
 * over the same 2.1 overlay primitives. Plan:
 * docs/design/2.4-tagbox-plan.md.
 *
 * Reuses 2.3's overlay machinery (bridge register/reconcile,
 * opener-focus, unsubscribe-then-close teardown, combobox a11y with the
 * STRING `ariaExpanded`). Tagbox-specific (PR #30 review r1):
 * - `question.value` is an ARRAY. Chips come from the PUBLIC
 *   `question.selectedChoices` (ItemValues — excludes the synthetic
 *   Select-All action `getSelectedActions()` would include, and carries
 *   the real per-item value/text/renderedId for any storage shape).
 * - A chip's ✕ removes just that item through core:
 *   `dropdownListModel.deselectItem(choice.value)` (operates on
 *   `renderedValue` with core's data-shape translation — a raw
 *   `value.filter` breaks under `valuePropertyName` / Other storage).
 * - Adding: overlay row taps toggle membership via core's
 *   `listModel.onItemClick`; the sheet stays open (core doesn't hide the
 *   popup per-select). The 2.1 ListPicker is unchanged.
 * - Mode is keyed on `question.renderAs`, NOT VM presence: core builds
 *   `dropdownListModel` for a tagbox regardless of `renderAs`, so
 *   `"select"` degrades to a non-interactive chips display + diagnostic.
 * - "Other (describe)" reuses the dropdown's `DropdownOtherComment`
 *   child (keyed by question identity).
 * - a11y: the labeled combobox opener is a SEPARATE Pressable from the
 *   chips — chip remove buttons are independently-focusable siblings,
 *   not nested inside the accessible opener (RN groups descendants of an
 *   accessible Pressable).
 */
import * as React from 'react';
import {
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AccessibilityRole } from 'react-native';
import type { Base, Question } from '../core/facade';
import { QuestionElementBase } from '../reactivity/QuestionElementBase';
import type { QuestionElementBaseProps } from '../reactivity/QuestionElementBase';
import { OverlayContext } from '../overlay/OverlayContext';
import { registerPopup } from '../overlay/popup-bridge';
import type {
  OverlayPayload,
  PopupRegistration,
} from '../overlay/popup-bridge';
import type { OverlayStack } from '../overlay/stack';
import { DropdownOtherComment } from './DropdownQuestion';
import { reportDiagnostic } from '../diagnostics';

interface SelectedChoiceLike {
  value: unknown;
  text: string;
  renderedId: string | number;
}

interface TagboxListModelLike {
  popupModel: InstanceType<typeof import('../core/facade').PopupModel>;
  onClick(): void;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
  deselectItem(value: unknown): void;
  placeholderRendered: string;
  ariaInputRole?: AccessibilityRole | string;
  ariaQuestionRole?: AccessibilityRole | string;
  ariaExpanded?: string;
  clearCaption?: string;
}

interface TagboxQuestionModelLike extends Question {
  dropdownListModel?: TagboxListModelLike;
  renderAs: string;
  allowClear: boolean;
  isInputReadOnly: boolean;
  isOtherSelected: boolean;
  selectedChoices: SelectedChoiceLike[];
  selectedItemLocText?: import('../core/facade').LocalizableString;
}

const noopEvent = {
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
};

const KNOWN_ACCESSIBILITY_ROLES = new Set<AccessibilityRole>([
  'button',
  'combobox',
  'menu',
  'list',
]);

const reportedTagboxSelectMode = new WeakMap<Question, boolean>();

export interface TagboxQuestionElementProps extends QuestionElementBaseProps {}

/** OverlayContext binding (class components spend their contextType on
 * the theme — same pattern as DropdownQuestionElement). */
export function TagboxQuestionElement(
  props: TagboxQuestionElementProps
): React.JSX.Element {
  const stack = React.useContext(OverlayContext);
  return (
    <TagboxQuestion
      question={props.question}
      creator={props.creator}
      stack={stack ?? undefined}
    />
  );
}

interface TagboxQuestionProps extends QuestionElementBaseProps {
  stack?: OverlayStack<OverlayPayload>;
}

export class TagboxQuestion extends QuestionElementBase<TagboxQuestionProps> {
  private registration: PopupRegistration | null = null;
  private registeredPopup: TagboxListModelLike['popupModel'] | null = null;
  private registeredStack: OverlayStack<OverlayPayload> | null = null;
  private pendingSelectMiss = false;

  private readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    if (this.isSelectMode) return [this.questionBase];
    const model = this.tagbox.dropdownListModel as unknown as Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get tagbox(): TagboxQuestionModelLike {
    return this.questionBase as unknown as TagboxQuestionModelLike;
  }

  private get isSelectMode(): boolean {
    return this.tagbox.renderAs === 'select';
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcile();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcile();
  }

  componentWillUnmount(): void {
    const reg = this.registration;
    this.registration = null;
    this.registeredPopup = null;
    this.registeredStack = null;
    try {
      super.componentWillUnmount();
    } finally {
      reg?.unregister();
    }
  }

  private reconcile(): void {
    this.reconcileRegistration();
    this.flushDiagnostics();
  }

  private reconcileRegistration(): void {
    const stack = this.props.stack ?? null;
    // Select mode never registers an overlay (non-interactive).
    const popup = this.isSelectMode
      ? null
      : (this.tagbox.dropdownListModel?.popupModel ?? null);
    if (popup === this.registeredPopup && stack === this.registeredStack) {
      return;
    }
    this.registration?.unregister();
    this.registration = null;
    this.registeredPopup = popup;
    this.registeredStack = stack;
    if (stack && popup) {
      this.registration = registerPopup(popup, stack, {
        openerHandle: () => findNodeHandle(this.controlRef.current) ?? null,
      });
    }
  }

  private flushDiagnostics(): void {
    if (!this.pendingSelectMiss) return;
    const q = this.questionBase;
    if (reportedTagboxSelectMode.get(q)) return;
    reportedTagboxSelectMode.set(q, true);
    reportDiagnostic({
      code: 'tagbox-select-mode-unsupported',
      questionName: this.tagbox.name,
    });
  }

  private removeValue(value: unknown): void {
    // Remove through core so it translates the data shape (valuePropertyName,
    // Other storage) — a raw value.filter would miss those.
    this.tagbox.dropdownListModel?.deselectItem(value);
  }

  /** Chips from the PUBLIC selectedChoices (excludes Select-All). */
  private renderChips(): React.JSX.Element[] {
    const question = this.tagbox;
    const readOnly = question.isInputReadOnly;
    return question.selectedChoices.map((choice) => (
      <View
        key={String(choice.renderedId)}
        testID={`sv-tagbox-chip-${String(choice.value)}`}
        style={localStyles.chip}
      >
        <Text style={localStyles.chipText}>{choice.text}</Text>
        {readOnly ? null : (
          <Pressable
            testID={`sv-tagbox-chip-remove-${String(choice.value)}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${choice.text}`}
            onPress={() => this.removeValue(choice.value)}
            style={localStyles.chipRemove}
          >
            <Text>✕</Text>
          </Pressable>
        )}
      </View>
    ));
  }

  /** `renderAs:"select"` (no native multi-select): non-interactive chips
   * display (read-only) + a deferred one-shot diagnostic. */
  private renderSelectMode(): React.JSX.Element {
    this.pendingSelectMiss = true;
    const question = this.tagbox;
    const chips = question.selectedChoices;
    return (
      <View testID="sv-tagbox-select-fallback" style={localStyles.chipsRow}>
        {chips.length === 0 ? (
          <Text testID="sv-tagbox-placeholder">
            {question.locPlaceholder?.renderedHtml || ''}
          </Text>
        ) : (
          chips.map((choice) => (
            <View
              key={String(choice.renderedId)}
              testID={`sv-tagbox-chip-${String(choice.value)}`}
              style={localStyles.chip}
            >
              <Text style={localStyles.chipText}>{choice.text}</Text>
            </View>
          ))
        )}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.tagbox;
    this.pendingSelectMiss = false;
    const vm = question.dropdownListModel;
    if (this.isSelectMode || !vm) {
      return (
        <View style={localStyles.container}>{this.renderSelectMode()}</View>
      );
    }
    const readOnly = question.isInputReadOnly;
    const showClear = question.allowClear && !question.isEmpty() && !readOnly;
    const empty = question.isEmpty();
    const roleCandidate = vm.ariaInputRole ?? vm.ariaQuestionRole;
    const accessibilityRole: AccessibilityRole =
      roleCandidate &&
      KNOWN_ACCESSIBILITY_ROLES.has(roleCandidate as AccessibilityRole)
        ? (roleCandidate as AccessibilityRole)
        : 'button';
    const label =
      question.locTitle?.renderedHtml || question.title || question.name;
    return (
      <View style={localStyles.container}>
        <View style={localStyles.row}>
          {/* Chips are SIBLINGS of the accessible opener so their remove
              buttons stay independently focusable (RN groups descendants
              of an accessible Pressable). */}
          <View style={localStyles.chipsRow}>
            {this.renderChips()}
            <Pressable
              ref={this.controlRef}
              testID="sv-tagbox-control"
              accessibilityRole={accessibilityRole}
              accessibilityLabel={label}
              accessibilityState={{
                disabled: readOnly,
                expanded: vm.ariaExpanded === 'true',
              }}
              disabled={readOnly}
              onPress={readOnly ? undefined : () => vm.onClick()}
              style={localStyles.opener}
            >
              {empty ? (
                <Text testID="sv-tagbox-placeholder" style={localStyles.flex}>
                  {vm.placeholderRendered}
                </Text>
              ) : null}
              <Text accessibilityElementsHidden style={localStyles.chevron}>
                {'▾'}
              </Text>
            </Pressable>
          </View>
          {showClear ? (
            <Pressable
              testID="sv-tagbox-clear"
              accessibilityRole="button"
              accessibilityLabel={vm.clearCaption || 'Clear'}
              onPress={() => vm.onClear(noopEvent)}
              style={localStyles.clear}
            >
              <Text>✕</Text>
            </Pressable>
          ) : null}
        </View>
        {question.isOtherSelected ? (
          <DropdownOtherComment
            key={String(
              (this.questionBase as unknown as { uniqueId: number }).uniqueId
            )}
            question={this.questionBase}
          />
        ) : null}
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  chipsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  opener: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 48,
  },
  flex: { flex: 1 },
  clear: { marginLeft: 8, padding: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  chipText: { marginRight: 4 },
  chipRemove: { padding: 2 },
  chevron: { marginLeft: 8 },
});
