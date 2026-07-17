/**
 * 2.1 presenter injection seam (design D7, A9). The HOST owns stack
 * state; a presenter is the swappable visual container for ONE entry.
 * Presenters never mutate PopupModel directly — user-initiated closes go
 * through `requestHide`/`requestCancel`, and the host runs the model
 * sequencing. `onDidDismiss` is the generation-scoped acknowledgment
 * that gates `PopupModel.onHiding()` (exactly-once, bridge-owned).
 */
import * as React from 'react';
import type { OverlayEntry } from './stack';
import type { OverlayPayload } from './popup-bridge';

export interface OverlayPresenterProps {
  entry: OverlayEntry<OverlayPayload>;
  /** True while this entry is the ACTIVE (presented) one — suspension
   * flips it false WITHOUT any dismissal semantics. */
  visible: boolean;
  /** Route the HIDE sequence through the model. */
  requestHide(): void;
  /** Route the CANCEL sequence through the model. */
  requestCancel(): void;
  /** INFORMATIONAL show acknowledgment (reserved for animation
   * presenters). Nothing model-side depends on it — `model.onShow()`
   * already ran before the entry was pushed — so the host accepts it
   * without gating; only `onDidDismiss` participates in lifecycle. */
  onDidShow(): void;
  /** Dismissal acknowledgment — gates the exactly-once onHiding(). */
  onDidDismiss(): void;
}

export type OverlayPresenter = React.ComponentType<OverlayPresenterProps>;

/** `null` = use the built-in Modal presenter (OverlayHost's default). */
export const OverlayPresenterContext =
  React.createContext<OverlayPresenter | null>(null);

OverlayPresenterContext.displayName = 'OverlayPresenterContext';
