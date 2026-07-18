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
 *   (`ariaInputRole ?? ariaQuestionRole`), clamped to the RN roles.
 *
 * What each consumer overrides (the Template-Method hooks):
 * - `isOverlayMode()` — whether the interactive overlay should render +
 *   register. KEYED ON THIS, never on VM presence: core RETAINS a
 *   `dropdownListModel` after a runtime mode flip (R5), so "is the model
 *   there" is not "are we in overlay mode".
 * - `getOverlayPopup()` — the PopupModel to bridge (defaults to
 *   `question.dropdownListModel.popupModel`, shared by all four consumers).
 * - `flushOverlayDiagnostics()` — per-consumer deferred diagnostics,
 *   flushed from the commit phase (never reported during render).
 */
import * as React from 'react';
import { findNodeHandle, Pressable } from 'react-native';
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

/** What `getOverlayPopup`'s default reads off the question. */
interface DropdownListModelHost {
  dropdownListModel?: { popupModel?: PopupModel };
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
   * question's `dropdownListModel.popupModel` (all four consumers). */
  protected getOverlayPopup(): PopupModel | null {
    const host = this.questionBase as unknown as DropdownListModelHost;
    return host.dropdownListModel?.popupModel ?? null;
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
}
