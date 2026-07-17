/**
 * 2.1 OverlayHost (design D2/D3/D8) — the single persistent RN `Modal`
 * presenting the overlay entry stack.
 *
 * - ONE native Modal for the whole stack (Android nested-Modal
 *   unreliability); `visible` = stack non-empty; it stays mounted across
 *   top swaps.
 * - EVERY entry stays mounted: the active entry renders its panel;
 *   suspended entries wrap in `display:'none'` + `pointerEvents="none"`
 *   + `accessibilityElementsHidden` + `importantForAccessibility=
 *   "no-hide-descendants"` (their PopupModels stay visible — suspension
 *   is not dismissal).
 * - Dismissing entries keep rendering until the presenter acks
 *   (`onDidDismiss` → bridge → exactly-once `onHiding()`); the DEFAULT
 *   presenter (no animation dependency, v1) acks from a commit-phase
 *   effect as soon as it observes the `dismissing` state.
 * - Backdrop tap cancels a SHEET; a modal DIALOG requires an explicit
 *   action (upstream parity). `Modal.onRequestClose` (Android back) runs
 *   the CANCEL sequence on the active entry. `KeyboardAvoidingView`
 *   keeps search inputs/dialog content above the keyboard.
 * - Presenters are injectable (D7): `OverlayPresenterContext` supplies a
 *   replacement component receiving the full protocol; the built-in
 *   Modal presenter is the `null`-context default.
 */
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
 * immediately from commit-phase effects. */
function DefaultPresenter(props: OverlayPresenterProps): React.JSX.Element {
  const { entry, visible, requestCancel, onDidShow, onDidDismiss } = props;
  const themeContext = React.useContext(SurveyThemeContext);
  const fragments = themeContext.recipes.overlay.fragments;
  const payload = entry.payload;
  const dismissing = entry.state === 'dismissing';

  React.useEffect(() => {
    if (visible) onDidShow();
  }, [visible, onDidShow]);

  React.useEffect(() => {
    if (dismissing) onDidDismiss();
  }, [dismissing, onDidDismiss]);

  if (!visible) {
    // Suspended (or dismissing while another entry is active): mounted,
    // fully isolated.
    return (
      <View
        testID="overlay-entry-suspended"
        style={{ display: 'none' }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {payload.renderContent()}
      </View>
    );
  }

  const isSheet = payload.shape === 'sheet';
  return (
    <Pressable
      testID="overlay-backdrop"
      style={[
        fragments.backdrop,
        isSheet ? null : { justifyContent: 'center' },
      ]}
      onPress={isSheet ? () => requestCancel() : undefined}
      accessibilityViewIsModal
    >
      {/* Inner pressable swallows taps so panel touches never reach the
          backdrop cancel. */}
      <Pressable
        testID={`overlay-panel-${payload.shape}`}
        style={isSheet ? fragments.sheet : fragments.dialog}
        onPress={() => undefined}
        accessibilityRole="none"
      >
        {payload.title ? (
          <Text style={fragments.title}>{payload.title}</Text>
        ) : null}
        <View style={fragments.body}>
          {payload.contentMiss ? null : payload.renderContent()}
        </View>
        <View style={fragments.footer}>
          {payload.footerActions.container.actions.map((action) => (
            <ActionButton
              key={action.id}
              // ActionContainer.setItems wraps into Action at runtime;
              // its typings surface the BaseAction ancestor.
              action={
                action as React.ComponentProps<typeof ActionButton>['action']
              }
              testID={`overlay-action-${action.id}`}
            />
          ))}
        </View>
      </Pressable>
    </Pressable>
  );
}

export function OverlayHost(props: OverlayHostProps): React.JSX.Element {
  const { stack } = props;
  const [, force] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => stack.subscribe(force), [stack]);

  const injected = React.useContext(OverlayPresenterContext);
  const Presenter = injected ?? DefaultPresenter;

  const entries = stack.entries();
  const active = stack.activeEntry();

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
        active?.payload.requestCancel();
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {entries.map(renderEntry)}
      </KeyboardAvoidingView>
    </Modal>
  );
}
