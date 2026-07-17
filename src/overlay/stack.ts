/**
 * 2.1 overlay entry stack (design D2) — the pure state machine under
 * `OverlayHost`. No React, no Modal, no PopupModel knowledge: entries
 * carry a consumer `payload` (the bridge attaches the popup wiring);
 * this module owns ONLY ordering, the three entry states, and
 * generation-scoped dismissal acknowledgment.
 *
 * States:
 * - `active` — the single presented entry (top of stack).
 * - `suspended` — mounted-but-hidden ancestor (its PopupModel stays
 *   visible; suspension is NOT dismissal and never triggers model
 *   lifecycle).
 * - `dismissing` — a semantic close began; the entry leaves the stack
 *   only when the presenter acknowledges THAT generation (stale acks
 *   from interrupted animations are dropped).
 */

export type OverlayEntryState = 'active' | 'suspended' | 'dismissing';

export interface OverlayEntry<P = unknown> {
  readonly key: string;
  /** Monotonic per-stack counter — an entry's identity across races. */
  readonly generation: number;
  payload: P;
  state: OverlayEntryState;
}

export interface DismissAckResult {
  /** True exactly once per (entry, generation); false for stale acks. */
  completed: boolean;
}

export interface OverlayStack<P = unknown> {
  entries(): readonly OverlayEntry<P>[];
  /** Monotonic change counter — a lost-update-safe snapshot key for
   * `useSyncExternalStore` (entry STATE mutates in place, so array
   * identity alone cannot serve as the snapshot). */
  version(): number;
  activeEntry(): OverlayEntry<P> | null;
  push(key: string, payload?: P): OverlayEntry<P>;
  /** Marks the entry `dismissing`; returns the generation the ack must
   * carry. Idempotent while already dismissing. */
  beginDismiss(entry: OverlayEntry<P>): number;
  acknowledgeDismissed(
    entry: OverlayEntry<P>,
    generation: number
  ): DismissAckResult;
  subscribe(listener: () => void): () => void;
}

export function createOverlayStack<P = unknown>(): OverlayStack<P> {
  let entries: OverlayEntry<P>[] = [];
  let nextGeneration = 1;
  let version = 0;
  const listeners = new Set<() => void>();

  function notify(): void {
    version += 1;
    for (const listener of [...listeners]) listener();
  }

  function activeEntry(): OverlayEntry<P> | null {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i]!.state !== 'dismissing') return entries[i]!;
    }
    return null;
  }

  function promote(): void {
    const next = activeEntry();
    if (next && next.state === 'suspended') next.state = 'active';
  }

  return {
    entries: () => entries,
    version: () => version,
    activeEntry,
    push(key, payload) {
      const current = activeEntry();
      if (current && current.state === 'active') current.state = 'suspended';
      const entry: OverlayEntry<P> = {
        key,
        generation: nextGeneration,
        payload: payload as P,
        state: 'active',
      };
      nextGeneration += 1;
      entries = [...entries, entry];
      notify();
      return entry;
    },
    beginDismiss(entry) {
      if (!entries.includes(entry)) return entry.generation;
      if (entry.state === 'dismissing') return entry.generation;
      entry.state = 'dismissing';
      notify();
      return entry.generation;
    },
    acknowledgeDismissed(entry, generation) {
      if (
        !entries.includes(entry) ||
        entry.state !== 'dismissing' ||
        generation !== entry.generation
      ) {
        return { completed: false };
      }
      entries = entries.filter((candidate) => candidate !== entry);
      promote();
      notify();
      return { completed: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
