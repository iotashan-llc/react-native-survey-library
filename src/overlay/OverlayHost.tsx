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
 * - Backdrop tap cancels a SHEET; a modal DIALOG requires an explicit
 *   action (upstream parity). `Modal.onRequestClose` (Android back) runs
 *   the CANCEL sequence on the active entry ONLY while it is genuinely
 *   `active` — during an in-flight dismissal (async presenter) back is a
 *   no-op so a suspended ancestor can't be cancelled out from under the
 *   pending ack. `KeyboardAvoidingView` keeps search inputs/dialog
 *   content above the keyboard (iOS `padding` / Android `height`; no
 *   extra offset — the Modal fills the window, so the keyboard metrics
 *   need no compensation).
 * - Factory miss (payload.contentMiss): a fallback panel with a single
 *   Close action running the HIDE sequence (nothing to revert).
 * - `PopupModel.showCloseButton`: header close affordance running the
 *   CANCEL sequence (upstream popup-view-model binds its close button to
 *   cancel).
 * - iOS `onAccessibilityEscape` → cancel; panel is `aria-modal` +
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
import type { OverlayEntry, OverlayStack } from './stack';
import type { OverlayPayload } from './popup-bridge';
import {
  OverlayPresenterContext,
  type OverlayPresenterProps,
} from './OverlayPresenterContext';

export interface OverlayHostProps {
  stack: OverlayStack<OverlayPayload>;
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

  React.useEffect(() => {
    if (!visible) return;
    onDidShow();
    // D8 focus ownership: move screen-reader focus to the panel on every
    // active-entry transition (Modal onShow misses top swaps).
    const handle = findNodeHandle(panelRef.current);
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [visible, onDidShow]);

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
      onPress={visible && isSheet ? () => requestCancel() : undefined}
      accessibilityViewIsModal={visible}
    >
      {/* Inner pressable swallows taps so panel touches never reach the
          backdrop cancel. */}
      <Pressable
        ref={panelRef}
        testID={`overlay-panel-${payload.shape}`}
        style={isSheet ? fragments.sheet : fragments.dialog}
        onPress={() => undefined}
        onAccessibilityEscape={() => requestCancel()}
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
          <View style={fragments.body}>{payload.renderContent()}</View>
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
                <ActionButton
                  key={action.id}
                  // ActionContainer.setItems wraps into Action at runtime;
                  // its typings surface the BaseAction ancestor.
                  action={
                    action as React.ComponentProps<
                      typeof ActionButton
                    >['action']
                  }
                  testID={`overlay-action-${action.id}`}
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
        trulyActive?.payload.requestCancel();
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
