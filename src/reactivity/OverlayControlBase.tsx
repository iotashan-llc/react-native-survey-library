/**
 * `OverlayControlBase` (task 2.5) — the shared base for every question
 * renderer that presents a survey-core `PopupModel` through the 2.1
 * overlay primitives: `dropdown` (2.3), `tagbox` (2.4), and — added in
 * 2.5 — rating `displayMode:"dropdown"` and `buttongroup` overflow.
 * Design: docs/design/2.5-rating-dropdown-buttongroup-overflow-plan.md
 * ("RECONCILED" R6). Extracted from the byte-identical overlay machinery
 * that DropdownQuestion + TagboxQuestion had each grown independently.
 *
 * What the base owns (the invariant commit-phase lifecycle):
 * - the popup-bridge registration triple + `controlRef`,
 * - `componentDidMount`/`componentDidUpdate` reconcile, and the
 *   unsubscribe-FIRST-then-close teardown in `componentWillUnmount`
 *   (the reactive base is torn down before the semantic-close visibility
 *   change can drive setState during unmount — PR #29 review r1 #3),
 * - `reconcileRegistration`: re-register only when the (popup, stack)
 *   identity changes, so a question / OverlayContext prop swap retargets
 *   cleanly and the old registration never lingers,
 * - `resolveComboboxRole`: core's INPUT aria surface
 *   (`ariaInputRole ?? ariaQuestionRole`), clamped to the RN roles,
 * - `resolveExpandedState`: core emits `ariaExpanded` as the STRING
 *   'true'/'false' (web aria); the conversion to RN's boolean
 *   `accessibilityState.expanded` lives here, once,
 * - `resolveOpenerLabel`: the opener's accessible name — core's
 *   `a11y_input_ariaLabel` when core would emit an input aria-label
 *   (hidden title / nested question), else `processedTitle` (RN's
 *   analog of web's aria-labelledby → title element). Probe-verified
 *   identical to the legacy `locTitle.renderedHtml || title || name`
 *   fold across every consumer's title variants,
 * - `buildOverlayOpenerA11y`: the prop bundle (role + label +
 *   disabled/expanded state) every consumer spreads onto its opener
 *   Pressable,
 * - `renderOverlayClear`: the shared clear affordance behind core's
 *   gate (`allowClear && !isEmpty() && !isInputReadOnly`), named by
 *   core's localized `clearCaption`, wired to
 *   `vm.onClear(overlayNoopEvent)`. Consumers without a rendered clear
 *   surface (buttongroup's compact control) simply don't call it.
 *
 * What each consumer overrides (the Template-Method hooks):
 * - `isOverlayMode()` — whether the interactive overlay should render +
 *   register. KEYED ON THIS, never on VM presence: core RETAINS a
 *   `dropdownListModel` after a runtime mode flip (R5), so "is the model
 *   there" is not "are we in overlay mode".
 * - `getOverlayPopup()` — the PopupModel to bridge (defaults to the
 *   NON-CREATING `question.dropdownListModelValue?.popupModel` backing
 *   field, shared by all four consumers — render purity: reconcile runs
 *   in the commit phase, and reading the CREATING `dropdownListModel`
 *   getter there would fire core construction notifications into
 *   already-subscribed observers mid-commit; construction belongs to
 *   each consumer's deferred ensure / core's own flip path).
 * - `flushOverlayDiagnostics()` — per-consumer deferred diagnostics,
 *   flushed from the commit phase (never reported during render).
 */
import * as React from 'react';
import { findNodeHandle, Pressable, StyleSheet, Text } from 'react-native';
import type { AccessibilityRole } from 'react-native';
import type { PopupModel } from '../core/facade';
import { QuestionElementBase } from './QuestionElementBase';
import type { QuestionElementBaseProps } from './QuestionElementBase';
import type { SurveyElementBaseState } from './SurveyElementBase';
import { registerPopup } from '../overlay/popup-bridge';
import type {
  OverlayPayload,
  PopupRegistration,
} from '../overlay/popup-bridge';
import type { OverlayStack } from '../overlay/stack';

export interface OverlayControlProps extends QuestionElementBaseProps {
  stack?: OverlayStack<OverlayPayload>;
}

/** A synthetic no-op event for core's `onClear` (it only dereferences
 * preventDefault/stopPropagation). Shared by every consumer's clear gate. */
export const overlayNoopEvent = {
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
};

/** The RN roles core's aria surface may name; anything else clamps to
 * `button` (RN's `accessibilityRole` is a closed enum). */
export const KNOWN_OVERLAY_ROLES = new Set<AccessibilityRole>([
  'button',
  'combobox',
  'menu',
  'list',
]);

/** The minimal aria surface `resolveComboboxRole` reads off a list VM. */
export interface OverlayComboboxAria {
  ariaInputRole?: AccessibilityRole | string;
  ariaQuestionRole?: AccessibilityRole | string;
}

/** The aria slice `buildOverlayOpenerA11y` reads off a list VM.
 * `ariaExpanded` is a STRING ('true' | 'false'), NOT a boolean —
 * core mirrors the web aria attribute. */
export interface OverlayOpenerAria extends OverlayComboboxAria {
  ariaExpanded?: string;
}

/** The slice of the list VM the shared clear affordance consumes. */
export interface OverlayClearVM {
  clearCaption?: string;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
}

/** The shared opener prop bundle (spread onto the opener Pressable). */
export interface OverlayOpenerA11yProps {
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  accessibilityState: { disabled: boolean; expanded: boolean };
}

/** The question surface the base's a11y/clear helpers read. */
interface OverlayA11yQuestionHost {
  a11y_input_ariaLabel?: string | null;
  processedTitle?: string;
  allowClear?: boolean;
  isInputReadOnly: boolean;
  isEmpty(): boolean;
}

/** What `getOverlayPopup`'s default reads off the question: core's
 * NON-CREATING `dropdownListModelValue` backing field — never the lazy
 * CREATING `dropdownListModel` getter (render purity). */
interface DropdownListModelHost {
  dropdownListModelValue?: { popupModel?: PopupModel };
}

export abstract class OverlayControlBase<
  P extends OverlayControlProps = OverlayControlProps,
  S extends SurveyElementBaseState = SurveyElementBaseState,
> extends QuestionElementBase<P, S> {
  private registration: PopupRegistration | null = null;
  private registeredPopup: PopupModel | null = null;
  private registeredStack: OverlayStack<OverlayPayload> | null = null;

  /** The opener whose native handle anchors the overlay (focus return). */
  protected readonly controlRef =
    React.createRef<React.ComponentRef<typeof Pressable>>();

  /**
   * Whether the interactive overlay control should render + register.
   * MUST be derived from the model's mode (e.g. `renderAs`), NOT from VM
   * presence — core keeps the `dropdownListModel` alive across a mode flip
   * (R5), so registration gated on VM presence would leak a live bridge
   * after the control has left overlay mode.
   */
  protected abstract isOverlayMode(): boolean;

  /** The PopupModel to bridge when in overlay mode. Defaults to the
   * question's NON-CREATING `dropdownListModelValue` backing field (all
   * four consumers): reconcile runs in the commit phase, and VM
   * construction there would fire core property notifications into
   * already-subscribed observers mid-commit. Construction belongs to
   * each consumer's deferred ensure / core's own flip path — never
   * here. */
  protected getOverlayPopup(): PopupModel | null {
    const host = this.questionBase as unknown as DropdownListModelHost;
    return host.dropdownListModelValue?.popupModel ?? null;
  }

  /** Per-consumer deferred diagnostics, flushed from the commit phase.
   * Default: none. */
  protected flushOverlayDiagnostics(): void {}

  componentDidMount(): void {
    super.componentDidMount();
    this.reconcileOverlay();
  }

  componentDidUpdate(): void {
    super.componentDidUpdate();
    this.reconcileOverlay();
  }

  componentWillUnmount(): void {
    const reg = this.registration;
    this.registration = null;
    this.registeredPopup = null;
    this.registeredStack = null;
    try {
      // Unsubscribe the reactive base FIRST so the semantic-close
      // visibility change below can't drive setState during unmount.
      super.componentWillUnmount();
    } finally {
      reg?.unregister();
    }
  }

  private reconcileOverlay(): void {
    this.reconcileRegistration();
    this.flushOverlayDiagnostics();
  }

  /** Register/re-register the popup bridge when the (popup, stack)
   * identity changes. Non-overlay mode never registers an interactive
   * sheet. */
  private reconcileRegistration(): void {
    const stack = this.props.stack ?? null;
    const popup = this.isOverlayMode() ? this.getOverlayPopup() : null;
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

  /** Core's INPUT aria role (`ariaInputRole ?? ariaQuestionRole` —
   * `combobox` under the default searchEnabled), clamped to the RN role
   * enum; anything unrecognized falls to `button`. */
  protected resolveComboboxRole(vm: OverlayComboboxAria): AccessibilityRole {
    const candidate = vm.ariaInputRole ?? vm.ariaQuestionRole;
    return candidate && KNOWN_OVERLAY_ROLES.has(candidate as AccessibilityRole)
      ? (candidate as AccessibilityRole)
      : 'button';
  }

  /** Core emits `ariaExpanded` as the STRING 'true'/'false' (the web
   * aria attribute value); RN's `accessibilityState.expanded` wants the
   * boolean. The conversion lives here, once. */
  protected resolveExpandedState(vm: { ariaExpanded?: string }): boolean {
    return vm.ariaExpanded === 'true';
  }

  private get a11yQuestion(): OverlayA11yQuestionHost {
    return this.questionBase as unknown as OverlayA11yQuestionHost;
  }

  /** The opener's accessible name: core's `a11y_input_ariaLabel` when
   * core would emit an input aria-label (hidden title / nested
   * question — then it IS `locTitle.renderedHtml`), else
   * `processedTitle` (RN's accessible-name analog of web's
   * aria-labelledby → title element). Probe-verified identical to the
   * legacy `locTitle.renderedHtml || title || name` fold across all
   * four consumers' title variants (titled / untitled × visible /
   * hidden × nested). */
  protected resolveOpenerLabel(): string {
    const question = this.a11yQuestion;
    return question.a11y_input_ariaLabel ?? question.processedTitle ?? '';
  }

  /** The shared opener a11y bundle — role clamp + label fold +
   * disabled/expanded state — every consumer spreads onto its opener
   * Pressable. `disabled` mirrors the same `isInputReadOnly` the
   * consumers use to gate `onPress`. */
  protected buildOverlayOpenerA11y(
    vm: OverlayOpenerAria
  ): OverlayOpenerA11yProps {
    return {
      accessibilityRole: this.resolveComboboxRole(vm),
      accessibilityLabel: this.resolveOpenerLabel(),
      accessibilityState: {
        disabled: this.a11yQuestion.isInputReadOnly,
        expanded: this.resolveExpandedState(vm),
      },
    };
  }

  /** The shared clear affordance behind core's gate
   * (`allowClear && !isEmpty() && !isInputReadOnly`), named by core's
   * localized `clearCaption` and wired to `vm.onClear(overlayNoopEvent)`.
   * Returns null when gated off; `testID` stays per-consumer. */
  protected renderOverlayClear(
    vm: OverlayClearVM,
    testID: string
  ): React.JSX.Element | null {
    const question = this.a11yQuestion;
    if (
      !question.allowClear ||
      question.isEmpty() ||
      question.isInputReadOnly
    ) {
      return null;
    }
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={vm.clearCaption || 'Clear'}
        onPress={() => vm.onClear(overlayNoopEvent)}
        style={overlayControlStyles.clear}
      >
        <Text>{'✕'}</Text>
      </Pressable>
    );
  }
}

const overlayControlStyles = StyleSheet.create({
  clear: { marginLeft: 8, padding: 4 },
});
