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
 * - Each presentation is a GENERATION RECORD ({entry, footer,
 *   hidingRan}): a re-show racing a dismissing entry pushes a NEW entry
 *   with its own record; the old presenter's ack completes only its own
 *   generation (onHiding once + footer dispose) and never touches the
 *   replacement.
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
  /** Idempotent — safe against ack/unregister overlap. */
  dispose(): void;
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
  /** Model-driven close affordance (PopupModel.showCloseButton). */
  showCloseButton: boolean;
  /** D8 focus translation: 'container' = a11y-focus the panel;
   * 'content' = focus the body (dropdownListModel under IsTouch sets
   * isFocusedContent=true — row-level targeting lives in the content
   * component, e.g. ListPicker's selected-row scroll); 'none' = leave
   * focus alone. */
  focusIntent: 'container' | 'content' | 'none';
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
  interface PresentationRecord {
    entry: OverlayEntry<OverlayPayload>;
    footer: OverlayFooter;
    hidingRan: boolean;
  }
  let current: PresentationRecord | null = null;
  /** EVERY unfinished generation (a dismissing predecessor stays live
   * until its ack) — unregister must finalize them all. */
  const liveRecords = new Set<PresentationRecord>();

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
      dispose: () => {
        if (!container.isDisposed) container.dispose();
      },
    };
  }

  function buildPayload(
    footer: OverlayFooter,
    record: () => PresentationRecord | null
  ): OverlayPayload {
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
      footerActions: footer,
      onDismissAcknowledged: () => {
        completeDismissal(record());
      },
      requestCancel: cancel,
      requestHide: hide,
      closeFallback: hide,
      showCloseButton: popup.showCloseButton === true,
      focusIntent:
        popup.isFocusedContainer === true
          ? 'container'
          : popup.isFocusedContent === true
            ? 'content'
            : 'none',
    };
  }

  function completeDismissal(rec: PresentationRecord | null): void {
    if (!rec) return;
    const result = stack.acknowledgeDismissed(rec.entry, rec.entry.generation);
    if (!result.completed) return;
    finishRecord(rec);
  }

  /** Exactly-once per generation: model onHiding + footer disposal.
   * Cleanup runs in finally — a throwing consumer onHiding/onHide must
   * not leak the footer or wedge the record set. */
  function finishRecord(rec: PresentationRecord): void {
    if (rec.hidingRan) return;
    rec.hidingRan = true;
    try {
      popup.onHiding();
    } finally {
      rec.footer.dispose();
      liveRecords.delete(rec);
      if (current === rec) current = null;
    }
  }

  function present(): void {
    if (current && current.entry.state !== 'dismissing') return;
    // A dismissing predecessor keeps its own record; this show gets a
    // fresh entry + generation (the old ack cannot touch it).
    popup.onShow();
    const footer = buildFooter(popup.isModal ? 'dialog' : 'sheet');
    const rec: PresentationRecord = {
      // Placeholder — replaced right after push (payload needs the
      // record via closure; the stack assigns the entry).
      entry: null as unknown as OverlayEntry<OverlayPayload>,
      footer,
      hidingRan: false,
    };
    rec.entry = stack.push(
      popup.contentComponentName,
      buildPayload(footer, () => rec)
    );
    liveRecords.add(rec);
    current = rec;
  }

  function beginDismiss(): void {
    if (!current) return;
    stack.beginDismiss(current.entry);
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
      // Semantic close: no presenter remains to ack, so the model
      // lifecycle and stack removal run synchronously — for EVERY live
      // generation (a dismissing predecessor whose ack never arrived
      // must not survive as a zombie entry).
      if (popup.isVisible) cancel();
      for (const rec of [...liveRecords]) {
        stack.beginDismiss(rec.entry);
        completeDismissal(rec);
        // If the ack could not complete (entry already gone), still
        // finish the model lifecycle exactly once.
        if (!rec.hidingRan) finishRecord(rec);
      }
    },
  };
}
