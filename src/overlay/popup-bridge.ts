/**
 * 2.1 popup bridge (design D4/D5): wires a core `PopupModel` into the
 * overlay entry stack. Core keeps ALL popup state; this module owns only
 * the RN sequencing the skipped DOM view-model layer performed:
 *
 * - Subscribe `model.onVisibilityChanged` (the model's ONLY visibility
 *   event — popup.ts:129-145); reconcile an already-visible model at
 *   registration (upstream parity, popup-view-model.ts:139-150).
 * - Show: `model.onShow()` once, THEN push the entry.
 * - Hide (`isVisible → false`, any path): begin the stack dismissal; the
 *   presenter's generation-scoped ack triggers `model.onHiding()`
 *   EXACTLY ONCE (which itself runs `onHide` + the inner-model refresh —
 *   popup.ts:226-229). Suspension never touches the model.
 * - Cancel: `model.onCancel()` THEN `model.hide()` (upstream order).
 * - Unregister-while-visible = semantic close: cancel sequence, then
 *   synchronous removal (the registration is going away — there is no
 *   presenter left to ack; same discipline as 1.1's two-phase dispose).
 * - Content: `RNElementFactory.createElement(contentComponentName,
 *   contentComponentData)`; a miss reports `element-wrapper-missing`
 *   (deduped per componentName) and the payload flags `contentMiss` so
 *   the host renders a fallback panel whose Close runs the HIDE
 *   sequence.
 * - Footer (D5 order — popup-modal-view-model.ts:27-45): build RAW
 *   `IAction[]` (sheet: cancel; dialog: cancel+apply) →
 *   `model.updateFooterActions(raw)` (consumers push RAW actions here) →
 *   `ActionContainer.setItems(returned)` (observation attaches here).
 *   Apply hides only when `model.onApply() !== false`.
 */
import * as React from 'react';
import { ActionContainer, getLocaleString } from '../core/facade';
import type { IAction, PopupModel } from '../core/facade';
import { RNElementFactory } from '../factories/ElementFactory';
import { reportDiagnostic } from '../diagnostics';
import type { OverlayEntry, OverlayStack } from './stack';

type PopupModelLike = InstanceType<typeof PopupModel>;

export interface OverlayFooter {
  /** The container the presenter renders; disposed with the entry. */
  container: InstanceType<typeof ActionContainer>;
  actions: IAction[];
  getActionById(id: string): { action(): void; title?: string } | null;
}

export interface OverlayPayload {
  popup: PopupModelLike;
  /** `'dialog'` (isModal) vs `'sheet'` (design D3). */
  shape: 'dialog' | 'sheet';
  title: string | undefined;
  contentMiss: boolean;
  renderContent(): React.JSX.Element | null;
  footerActions: OverlayFooter;
  /** Presenter ack for a completed dismissal animation — triggers the
   * exactly-once `onHiding()`. */
  onDismissAcknowledged(): void;
  /** Cancel sequence (backdrop tap on sheets, Android back, iOS a11y
   * escape). */
  requestCancel(): void;
  /** Hide sequence (fallback Close, programmatic close). */
  requestHide(): void;
  closeFallback(): void;
}

export interface PopupRegistration {
  cancel(): void;
  hide(): void;
  unregister(): void;
}

const reportedMisses = new Set<string>();

/** Test seam: dedupe is per componentName for the process lifetime. */
export function resetReportedContentMisses(): void {
  reportedMisses.clear();
}

export function registerPopup(
  popup: PopupModelLike,
  stack: OverlayStack<OverlayPayload>
): PopupRegistration {
  let entry: OverlayEntry<OverlayPayload> | null = null;
  let hidingRan = false;

  function buildFooter(shape: 'dialog' | 'sheet'): OverlayFooter {
    const raw: IAction[] = [
      {
        id: 'cancel',
        title: getLocaleString('modalCancelButtonText'),
        action: () => {
          cancel();
        },
      },
    ];
    if (shape === 'dialog') {
      raw.push({
        id: 'apply',
        title: getLocaleString('modalApplyButtonText'),
        action: () => {
          if (popup.onApply() !== false) hide();
        },
      });
    }
    const returned = popup.updateFooterActions(raw);
    const container = new ActionContainer();
    container.setItems(returned);
    return {
      container,
      actions: returned,
      getActionById: (id: string) =>
        (container.getActionById(id) as OverlayFooter['actions'][number] & {
          action(): void;
        }) ?? null,
    };
  }

  function buildPayload(): OverlayPayload {
    const shape: 'dialog' | 'sheet' = popup.isModal ? 'dialog' : 'sheet';
    const componentName = popup.contentComponentName;
    const contentMiss = !RNElementFactory.isElementRegistered(componentName);
    if (contentMiss && !reportedMisses.has(componentName)) {
      reportedMisses.add(componentName);
      reportDiagnostic({
        code: 'element-wrapper-missing',
        componentName,
        reason: 'overlay-popup-content',
      });
    }
    return {
      popup,
      shape,
      title: popup.title || undefined,
      contentMiss,
      renderContent: () =>
        contentMiss
          ? null
          : RNElementFactory.createElement(
              componentName,
              popup.contentComponentData
            ),
      footerActions: buildFooter(shape),
      onDismissAcknowledged: () => {
        if (!entry) return;
        const result = stack.acknowledgeDismissed(entry, entry.generation);
        if (result.completed) runOnHidingOnce();
        if (result.completed) entry = null;
      },
      requestCancel: cancel,
      requestHide: hide,
      closeFallback: hide,
    };
  }

  function runOnHidingOnce(): void {
    if (hidingRan) return;
    hidingRan = true;
    popup.onHiding();
  }

  function present(): void {
    if (entry) return;
    hidingRan = false;
    popup.onShow();
    entry = stack.push(popup.contentComponentName, buildPayload());
  }

  function beginDismiss(): void {
    if (!entry) return;
    stack.beginDismiss(entry);
  }

  function cancel(): void {
    popup.onCancel();
    popup.hide();
  }

  function hide(): void {
    popup.hide();
  }

  const handleVisibilityChanged = (
    _sender: unknown,
    options: { isVisible: boolean }
  ): void => {
    if (options.isVisible) present();
    else beginDismiss();
  };

  popup.onVisibilityChanged.add(handleVisibilityChanged);
  if (popup.isVisible) present();

  return {
    cancel,
    hide,
    unregister() {
      popup.onVisibilityChanged.remove(handleVisibilityChanged);
      if (entry) {
        // Semantic close: no presenter remains to ack, so the model
        // lifecycle and stack removal run synchronously.
        if (popup.isVisible) cancel();
        const current = entry;
        entry = null;
        stack.beginDismiss(current);
        const result = stack.acknowledgeDismissed(current, current.generation);
        if (result.completed) runOnHidingOnce();
      }
    },
  };
}
