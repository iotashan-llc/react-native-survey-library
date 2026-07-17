/**
 * `tagbox` question (task 2.4) — the MULTI-SELECT sibling of `dropdown`,
 * over the same 2.1 overlay primitives. Plan:
 * docs/design/2.4-tagbox-plan.md.
 *
 * Reuses 2.3's overlay machinery verbatim (bridge register/reconcile,
 * opener-focus, unsubscribe-then-close teardown, combobox a11y with the
 * STRING `ariaExpanded`). The tagbox-specific parts:
 * - `question.value` is an ARRAY; the control renders one removable
 *   CHIP per selected item (`dropdownListModel.getSelectedActions()`),
 *   or the placeholder when empty.
 * - Selecting rows in the overlay toggles membership through core's own
 *   `listModel.onItemClick` (add on pick, remove on re-pick) — the 2.1
 *   ListPicker needs no change and the sheet stays open (core does not
 *   hide the popup per-select).
 * - A chip's ✕ removes just that value via the PUBLIC value setter
 *   (`question.value = value.filter(...)` — setting value is the
 *   documented API; invariant 6 holds).
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

interface SelectedActionLike {
  id: string;
  title: string;
}

interface TagboxListModelLike {
  popupModel: InstanceType<typeof import('../core/facade').PopupModel>;
  onClick(): void;
  getSelectedActions(): SelectedActionLike[];
  placeholderRendered: string;
  ariaInputRole?: AccessibilityRole | string;
  ariaQuestionRole?: AccessibilityRole | string;
  ariaExpanded?: string;
}

interface TagboxQuestionModelLike extends Question {
  dropdownListModel?: TagboxListModelLike;
  allowClear: boolean;
  isInputReadOnly: boolean;
}

const KNOWN_ACCESSIBILITY_ROLES = new Set<AccessibilityRole>([
  'button',
  'combobox',
  'menu',
  'list',
]);

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

  private readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  protected getStateElement(): Base {
    return this.questionBase;
  }

  protected getStateElements(): Base[] {
    const model = this.tagbox.dropdownListModel as unknown as Base | undefined;
    return model ? [this.questionBase, model] : [this.questionBase];
  }

  private get tagbox(): TagboxQuestionModelLike {
    return this.questionBase as unknown as TagboxQuestionModelLike;
  }

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcileRegistration();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcileRegistration();
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

  private reconcileRegistration(): void {
    const stack = this.props.stack ?? null;
    const popup = this.tagbox.dropdownListModel?.popupModel ?? null;
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

  private removeValue(id: string): void {
    const question = this.tagbox as { value?: unknown };
    const current = Array.isArray(question.value) ? question.value : [];
    question.value = current.filter((v) => v !== id);
  }

  private renderChips(vm: TagboxListModelLike): React.JSX.Element {
    const readOnly = this.tagbox.isInputReadOnly;
    const selected = vm.getSelectedActions();
    if (selected.length === 0) {
      return (
        <Text testID="sv-tagbox-placeholder" style={localStyles.placeholder}>
          {vm.placeholderRendered}
        </Text>
      );
    }
    return (
      <View style={localStyles.chips}>
        {selected.map((action) => (
          <View
            key={action.id}
            testID={`sv-tagbox-chip-${action.id}`}
            style={localStyles.chip}
          >
            <Text style={localStyles.chipText}>{action.title}</Text>
            {readOnly ? null : (
              <Pressable
                testID={`sv-tagbox-chip-remove-${action.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${action.title}`}
                onPress={() => this.removeValue(action.id)}
                style={localStyles.chipRemove}
              >
                <Text>✕</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    );
  }

  protected renderElement(): React.JSX.Element {
    const question = this.tagbox;
    const vm = question.dropdownListModel;
    if (!vm) {
      // No overlay VM (e.g. renderAs:"select") — non-interactive display.
      return (
        <View testID="sv-tagbox-select-fallback" style={localStyles.control} />
      );
    }
    const readOnly = question.isInputReadOnly;
    const roleCandidate = vm.ariaInputRole ?? vm.ariaQuestionRole;
    const accessibilityRole: AccessibilityRole =
      roleCandidate &&
      KNOWN_ACCESSIBILITY_ROLES.has(roleCandidate as AccessibilityRole)
        ? (roleCandidate as AccessibilityRole)
        : 'button';
    return (
      <Pressable
        ref={this.controlRef}
        testID="sv-tagbox-control"
        accessibilityRole={accessibilityRole}
        accessibilityState={{
          disabled: readOnly,
          expanded: vm.ariaExpanded === 'true',
        }}
        disabled={readOnly}
        onPress={readOnly ? undefined : () => vm.onClick()}
        style={localStyles.control}
      >
        {this.renderChips(vm)}
        <Text accessibilityElementsHidden style={localStyles.chevron}>
          {'▾'}
        </Text>
      </Pressable>
    );
  }
}

const localStyles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
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
  placeholder: { flex: 1 },
  chevron: { marginLeft: 8 },
});
