/**
 * 2.1 OverlayHost (design D2/D3/D8) — the single persistent RN `Modal`
 * presenting the overlay entry stack.
 *
 * - ONE native Modal for the whole stack (Android nested-Modal
 *   unreliability); `visible` = stack non-empty; it stays mounted across
 *   top swaps.
 * - EVERY entry stays mounted with a STABLE element tree: the presenter
 *   renders one backdrop→panel→content structure in every state and
 *   toggles only visibility/pointer/a11y props, so suspension,
 *   dismissal, and restoration never unmount content (review round 1:
 *   changing the wrapper hierarchy remounted it).
 * - Dismissing entries keep rendering until the presenter acks
 *   (`onDidDismiss` → bridge → exactly-once `onHiding()`); the DEFAULT
 *   presenter (no animation dependency, v1) acks from a commit-phase
 *   effect as soon as it observes the `dismissing` state.
 * - DISMISS semantics (upstream parity, 2.5.33): backdrop tap on a
 *   SHEET runs the HIDE sequence — upstream click-outside plain-hides
 *   with NO onCancel (popup-view-model.ts:286-289; the revert lives
 *   only in the footer Cancel button's cancel() — 293-296 — e.g. the
 *   tagbox previousValue rollback, dropdownMultiSelectListModel.ts:
 *   105-110). A modal DIALOG ignores the backdrop (modal clickOutside
 *   no-ops — popup-modal-view-model.ts:60-62). `Modal.onRequestClose`
 *   (Android back) maps to upstream Escape: sheets HIDE (base onKeyDown
 *   — popup-view-model.ts:213-218), dialogs CANCEL (modal override —
 *   popup-modal-view-model.ts:63-68); it targets the active entry ONLY
 *   while it is genuinely `active` — during an in-flight dismissal
 *   (async presenter) back is a no-op so a suspended ancestor can't be
 *   closed out from under the pending ack. `KeyboardAvoidingView`
 *   keeps search inputs/dialog
 *   content above the keyboard (iOS `padding` / Android `height`; no
 *   extra offset — the Modal fills the window, so the keyboard metrics
 *   need no compensation).
 * - Factory miss (payload.contentMiss): a fallback panel with a single
 *   Close action running the HIDE sequence (nothing to revert).
 * - `PopupModel.showCloseButton`: header close affordance running the
 *   CANCEL sequence. Deliberate deviation: upstream clickClose
 *   plain-hides (popup-view-model.ts:281-284), but RN keeps cancel —
 *   an explicit ✕ reads as "discard", and dialog-adapter resolution
 *   treats hide-before-resolution as cancel anyway (DIFFERENCES.md,
 *   "Overlay dismissal").
 * - iOS `onAccessibilityEscape` → same mapping as Android back (sheet
 *   HIDE / dialog CANCEL); panel is `aria-modal` +
 *   `accessibilityViewIsModal`. On active-entry transitions the panel
 *   receives accessibility focus (AccessibilityInfo seam — jest cannot
 *   observe screen-reader focus; device tests cover it). Opener focus
 *   restoration is the consumer's seam: 2.3 passes the control ref.
 * - Presenters are injectable (D7): `OverlayPresenterContext` supplies a
 *   replacement component receiving the full protocol; the built-in
 *   Modal presenter is the `null`-context default.
 */
import * as React from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SurveyThemeContext } from '../theme-rn/provider';
import { ActionButton } from '../components/ActionButton';
import { SurveyElementBase } from '../reactivity/SurveyElementBase';
import type { Base } from '../core/facade';
import type { OverlayEntry, OverlayStack } from './stack';
import type { OverlayPayload } from './popup-bridge';
import {
  OverlayPresenterContext,
  type OverlayPresenterProps,
} from './OverlayPresenterContext';

export interface OverlayHostProps {
  stack: OverlayStack<OverlayPayload>;
}

type FooterAction = React.ComponentProps<typeof ActionButton>['action'];

interface OverlayFooterButtonProps {
  action: FooterAction;
}

/** Footer button with its own Action subscription: upstream mutates
 * innerCss post-hoc (confirm-dialog.ts:52 marks destructive buttons
 * 'sd-btn--danger') and the variant must follow without a host
 * re-render (2.2 D4). */
class OverlayFooterButton extends SurveyElementBase<OverlayFooterButtonProps> {
  protected getStateElement(): Base | null {
    return this.props.action as unknown as Base;
  }

  protected renderElement(): React.JSX.Element {
    const action = this.props.action;
    const innerCss = (action as { innerCss?: string }).innerCss;
    return (
      <ActionButton
        action={action}
        variant={
          typeof innerCss === 'string' && innerCss.includes('sd-btn--danger')
            ? 'danger'
            : undefined
        }
        testID={`overlay-action-${action.id}`}
      />
    );
  }
}

/** Built-in presenter: no animation dependency in v1 — show/dismiss ack
 * immediately from commit-phase effects. One STABLE tree for all entry
 * states (content identity survives suspension). */
function DefaultPresenter(props: OverlayPresenterProps): React.JSX.Element {
  const {
    entry,
    visible,
    requestCancel,
    requestHide,
    onDidShow,
    onDidDismiss,
  } = props;
  const themeContext = React.useContext(SurveyThemeContext);
  const fragments = themeContext.recipes.overlay.fragments;
  const payload = entry.payload;
  const dismissing = entry.state === 'dismissing';
  const panelRef = React.useRef<React.ComponentRef<typeof Pressable>>(null);
  const bodyRef = React.useRef<React.ComponentRef<typeof View>>(null);
  // Transition guard (review round 2): the host recreates callback props
  // per render, so the effect keys on the visible TRANSITION, not on
  // callback identity — focus/onDidShow must not rerun on unrelated
  // host re-renders.
  const wasVisible = React.useRef(false);

  React.useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    if (!visible) return;
    onDidShow();
    // D8 focus ownership on every active-entry TRANSITION (Modal onShow
    // misses top swaps), honoring the model's intent: 'container' -> the
    // panel; 'content' -> the body (row-level targeting lives in the
    // content component); 'none' -> leave focus alone.
    const target =
      payload.focusIntent === 'container'
        ? panelRef.current
        : payload.focusIntent === 'content'
          ? bodyRef.current
          : null;
    const handle = findNodeHandle(target);
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  });

  React.useEffect(() => {
    if (dismissing) onDidDismiss();
  }, [dismissing, onDidDismiss]);

  const isSheet = payload.shape === 'sheet';
  return (
    <Pressable
      testID={visible ? 'overlay-backdrop' : 'overlay-entry-suspended'}
      style={
        visible
          ? [fragments.backdrop, isSheet ? null : localStyles.center]
          : localStyles.hidden
      }
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      onPress={visible && isSheet ? () => requestHide() : undefined}
      accessibilityViewIsModal={visible}
    >
      {/* Inner pressable swallows taps so panel touches never reach the
          backdrop cancel. */}
      <Pressable
        ref={panelRef}
        testID={`overlay-panel-${payload.shape}`}
        style={isSheet ? fragments.sheet : fragments.dialog}
        onPress={() => undefined}
        onAccessibilityEscape={() =>
          isSheet ? requestHide() : requestCancel()
        }
        accessibilityRole="none"
        aria-modal={visible}
      >
        {/* D8 safe-area: keeps sheet content clear of the home
           indicator / notch on iOS (no-op View elsewhere); constant per
           entry, so the stable tree is preserved. */}
        <SafeAreaView>
          {payload.showCloseButton && !payload.contentMiss ? (
            <Pressable
              testID="overlay-close"
              accessibilityRole="button"
              style={localStyles.close}
              onPress={() => requestCancel()}
            >
              <Text style={fragments.title}>✕</Text>
            </Pressable>
          ) : null}
          {payload.title ? (
            <Text style={fragments.title}>{payload.title}</Text>
          ) : null}
          <View
            ref={bodyRef}
            style={fragments.body}
            accessible={payload.focusIntent === 'content'}
          >
            {payload.renderContent()}
          </View>
          {payload.contentMiss ? (
            <View style={fragments.footer}>
              <Pressable
                testID="overlay-fallback-close"
                accessibilityRole="button"
                onPress={() => requestHide()}
              >
                <Text style={fragments.title}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <View style={fragments.footer}>
              {payload.footerActions.container.actions.map((action) => (
                <OverlayFooterButton
                  key={action.id}
                  // ActionContainer.setItems wraps into Action at runtime;
                  // its typings surface the BaseAction ancestor.
                  action={action as FooterAction}
                />
              ))}
            </View>
          )}
        </SafeAreaView>
      </Pressable>
    </Pressable>
  );
}

export function OverlayHost(props: OverlayHostProps): React.JSX.Element {
  const { stack } = props;
  // Lost-update-safe: the version snapshot is re-read right after
  // subscription, so a push that lands between render and effect (e.g.
  // an already-visible popup registered from a descendant
  // componentDidMount) still re-renders the host.
  React.useSyncExternalStore(
    React.useCallback((listener) => stack.subscribe(listener), [stack]),
    () => stack.version()
  );

  const injected = React.useContext(OverlayPresenterContext);
  const Presenter = injected ?? DefaultPresenter;

  const entries = stack.entries();
  const active = stack.activeEntry();

  // 2.3 opener-focus restoration (D8 seam) — HOST-level, not per-entry:
  // hand a11y focus back to the opener only when the overlay stack
  // FULLY empties. Deciding this at the host (not in an unmounting
  // entry's effect cleanup) is what makes it immune to the races a
  // per-entry latch couldn't distinguish: React StrictMode's
  // setup→cleanup→setup on mount (the stack is never empty), and a
  // hide→show reselect where the old generation dismisses while a new
  // one is already active (the stack never reaches empty between them,
  // so focus is never stolen from the live Modal) — PR #29 review r1
  // #5, r2 #5.
  //
  // Track the SESSION ROOT — the bottommost non-dismissing entry — not
  // the top active one: with a nested popup B opened over dropdown A,
  // the opener to restore on full close is A's control (the root), and
  // if A and B are dismissed in one batch there is no intermediate
  // render to promote A, so keying on `active` would strand B's now-
  // unmounted opener (PR #29 review r3 #1). The ref is only overwritten
  // while a non-dismissing root WITH an opener exists, so it is RETAINED
  // once every entry is dismissing.
  //
  // Two-phase to satisfy competing hazards (PR #29 review r4 #1, r5 #1):
  //  - The scalars are READ during render (pure — no ref mutation, so an
  //    abandoned/suspended render leaves nothing behind) from THIS
  //    render's committed entry view.
  //  - The ref write + focus fire happen in a COMMIT-PHASE effect keyed
  //    on those scalar snapshots. `OverlayEntry.state` mutates in place
  //    and React runs descendant passive effects BEFORE the parent's, so
  //    a descendant/custom-Presenter effect that hides the just-shown
  //    popup could flip the live entry to `dismissing` before a
  //    read-in-effect ran — the render-time snapshot is immune to that.
  const openerToRestore = React.useRef<(() => number | null) | null>(null);
  const sessionRootOpener =
    entries.find((e) => e.state !== 'dismissing')?.payload.openerHandle ?? null;
  const stackEmpty = entries.length === 0;
  React.useEffect(() => {
    if (sessionRootOpener) openerToRestore.current = sessionRootOpener;
    if (!stackEmpty) return;
    const opener = openerToRestore.current;
    openerToRestore.current = null;
    if (!opener) return;
    const handle = opener();
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [sessionRootOpener, stackEmpty]);
  // Back/escape target ONLY a genuinely active entry — while a dismissal
  // ack is pending the (suspended) ancestor must not be cancellable.
  const trulyActive = active && active.state === 'active' ? active : null;

  const renderEntry = (
    entry: OverlayEntry<OverlayPayload>
  ): React.JSX.Element => (
    <Presenter
      key={`${entry.key}-${entry.generation}`}
      entry={entry}
      visible={entry === active && entry.state === 'active'}
      requestHide={() => entry.payload.requestHide()}
      requestCancel={() => entry.payload.requestCancel()}
      onDidShow={() => undefined}
      onDidDismiss={() => entry.payload.onDismissAcknowledged()}
    />
  );

  return (
    <Modal
      visible={entries.length > 0}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (!trulyActive) return;
        // Upstream Escape mapping: sheet = plain hide (commit), dialog =
        // cancel sequence.
        if (trulyActive.payload.shape === 'sheet') {
          trulyActive.payload.requestHide();
        } else {
          trulyActive.payload.requestCancel();
        }
      }}
    >
      <KeyboardAvoidingView
        style={localStyles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {entries.map(renderEntry)}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center' },
  hidden: { display: 'none' },
  close: { alignSelf: 'flex-end' },
});
