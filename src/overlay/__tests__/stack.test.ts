/**
 * 2.1 overlay entry stack (design D2) — the PURE state machine under
 * OverlayHost: ordered entries with `active`/`suspended`/`dismissing`
 * states and GENERATION-scoped dismissal acknowledgments.
 *
 * Contracts pinned here (no React, no Modal):
 * - push: new entry is `active`; previous active → `suspended` (its
 *   PopupModel stays visible — suspension is NOT dismissal).
 * - beginDismiss(top): top → `dismissing` (new generation); previous
 *   suspended entry does NOT reactivate until the ack lands.
 * - acknowledgeDismissed(entry, generation): removes the entry, promotes
 *   the next suspended entry to `active`, and reports `completed: true`
 *   exactly once; a STALE generation ack is dropped (`completed: false`).
 * - beginDismiss(non-top): that entry alone → `dismissing`; the active
 *   entry is untouched; its ack removes it without promotion churn.
 * - re-present racing a dismissal: pushing the same key again while its
 *   old entry is `dismissing` creates a NEW entry/generation; the old
 *   ack still completes only its own generation.
 */
import { createOverlayStack } from '../stack';
import type { OverlayEntry } from '../stack';

function keysOf(entries: readonly OverlayEntry[]): string[] {
  return entries.map((entry) => `${entry.key}:${entry.state}`);
}

describe('overlay entry stack', () => {
  it('push activates the new entry and suspends the previous active', () => {
    const stack = createOverlayStack();
    const a = stack.push('a');
    expect(a.state).toBe('active');
    const b = stack.push('b');
    expect(b.state).toBe('active');
    expect(keysOf(stack.entries())).toEqual(['a:suspended', 'b:active']);
    expect(stack.activeEntry()).toBe(b);
  });

  it('dismissing the top does NOT reactivate the parent until the ack', () => {
    const stack = createOverlayStack();
    stack.push('a');
    const b = stack.push('b');
    stack.beginDismiss(b);
    expect(keysOf(stack.entries())).toEqual(['a:suspended', 'b:dismissing']);
    const result = stack.acknowledgeDismissed(b, b.generation);
    expect(result.completed).toBe(true);
    expect(keysOf(stack.entries())).toEqual(['a:active']);
  });

  it('a stale-generation ack is dropped', () => {
    const stack = createOverlayStack();
    const a = stack.push('a');
    stack.beginDismiss(a);
    const staleGeneration = a.generation;
    // Re-present before the ack lands: new entry, new generation.
    const a2 = stack.push('a');
    expect(a2).not.toBe(a);
    const stale = stack.acknowledgeDismissed(a, staleGeneration - 1);
    expect(stale.completed).toBe(false);
    // The REAL ack for the old entry completes only that entry.
    const real = stack.acknowledgeDismissed(a, staleGeneration);
    expect(real.completed).toBe(true);
    expect(keysOf(stack.entries())).toEqual(['a:active']);
    expect(stack.activeEntry()).toBe(a2);
  });

  it('acknowledge is exactly-once per generation', () => {
    const stack = createOverlayStack();
    const a = stack.push('a');
    stack.beginDismiss(a);
    expect(stack.acknowledgeDismissed(a, a.generation).completed).toBe(true);
    expect(stack.acknowledgeDismissed(a, a.generation).completed).toBe(false);
  });

  it('dismissing a NON-top entry leaves the active entry untouched', () => {
    const stack = createOverlayStack();
    const a = stack.push('a');
    const b = stack.push('b');
    stack.beginDismiss(a);
    expect(keysOf(stack.entries())).toEqual(['a:dismissing', 'b:active']);
    stack.acknowledgeDismissed(a, a.generation);
    expect(keysOf(stack.entries())).toEqual(['b:active']);
    expect(stack.activeEntry()).toBe(b);
  });

  it('beginDismiss is idempotent while already dismissing (same generation)', () => {
    const stack = createOverlayStack();
    const a = stack.push('a');
    const g1 = stack.beginDismiss(a);
    const g2 = stack.beginDismiss(a);
    expect(g1).toBe(g2);
  });

  it('subscribers hear every transition', () => {
    const stack = createOverlayStack();
    const events: string[] = [];
    const unsubscribe = stack.subscribe(() => {
      events.push(keysOf(stack.entries()).join('|') || 'empty');
    });
    const a = stack.push('a');
    stack.push('b');
    stack.beginDismiss(stack.activeEntry()!);
    stack.acknowledgeDismissed(
      stack.entries()[1]!,
      stack.entries()[1]!.generation
    );
    unsubscribe();
    stack.beginDismiss(a);
    expect(events).toEqual([
      'a:active',
      'a:suspended|b:active',
      'a:suspended|b:dismissing',
      'a:active',
    ]);
  });
});
