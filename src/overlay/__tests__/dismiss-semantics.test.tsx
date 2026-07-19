/**
 * Overlay DISMISS semantics — web-parity regression suite.
 *
 * Device-observed bug (iPad sim, kitchen-sink tagbox): open the sheet,
 * toggle a choice (value commits to the model), tap the dimmed
 * BACKDROP → the committed selection REVERTED. RN wired the backdrop to
 * the CANCEL sequence (`popup.onCancel()` + hide) —
 * `DropdownMultiSelectListModel` registers an `onCancel` that restores
 * `previousValue` under `IsTouch && !closeOnSelect`
 * (dropdownMultiSelectListModel.ts:85-110), and the RN facade pins
 * `_setIsTouch(true)`.
 *
 * Web ground truth (survey-core 2.5.33):
 * - Backdrop/click-outside → `PopupBaseViewModel.clickOutside()` →
 *   `hidePopup()` ONLY — no onCancel (popup-view-model.ts:286-289);
 *   survey-react-ui binds the fullscreen `.sv-popup` click to it
 *   (components/popup/popup.tsx render()). Selection is KEPT.
 * - Escape → base `onKeyDown` → `hidePopup()` for non-modal popups
 *   (popup-view-model.ts:213-218); the MODAL view-model overrides it to
 *   `model.onCancel()` + hide (popup-modal-view-model.ts:63-68).
 * - Revert is exclusively the footer CANCEL button:
 *   `PopupBaseViewModel.cancel()` → onCancel + hide
 *   (popup-view-model.ts:293-296); Done (tagbox,
 *   dropdownMultiSelectListModel.ts:90-99) plain-hides = commit.
 *
 * RN mapping under test: sheet backdrop tap, Android back, and iOS a11y
 * escape are DISMISS (hide/commit); dialogs keep cancel on back/escape.
 */
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model, PopupModel } from '../../core/facade';
import '../../factories/register-all';
import { Survey } from '../../survey/Survey';
import { createOverlayStack } from '../stack';
import { registerPopup } from '../popup-bridge';
import type { OverlayPayload } from '../popup-bridge';
import { OverlayHost } from '../OverlayHost';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** The shell's rows defer children until their first onLayout (1.3 D3). */
function layoutRows(): void {
  for (const row of screen.getAllByTestId('sv-row')) {
    fireEvent(row, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
    });
  }
}

function mountTagboxSurvey() {
  const model = new Model({
    elements: [
      { type: 'tagbox', name: 'langs', choices: ['apple', 'banana', 'cherry'] },
    ],
  });
  const question = model.getQuestionByName('langs')!;
  render(<Survey model={model as never} />);
  layoutRows();
  return { model, question };
}

function value(question: unknown): unknown {
  return JSON.parse(
    JSON.stringify((question as { value: unknown }).value ?? null)
  );
}

describe('overlay dismiss semantics — tagbox through the full Survey shell', () => {
  it('BACKDROP tap after toggling a choice KEEPS the committed value (web clickOutside = hide-only)', async () => {
    const { question } = mountTagboxSurvey();
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-control'));
    await flush();
    fireEvent.press(screen.getByTestId('sv-list-item-apple'));
    await flush();
    // The toggle COMMITTED to the model (chip renders, progress counts).
    expect(value(question)).toEqual(['apple']);
    // Tap the dimmed backdrop exactly as OverlayHost wires it.
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    await flush();
    // Sheet closed…
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    // …and the committed selection SURVIVES (device bug: it reverted).
    expect(value(question)).toEqual(['apple']);
  });

  it('footer CANCEL still reverts to the pre-open value (web cancel() parity)', async () => {
    const { question } = mountTagboxSurvey();
    act(() => {
      question.value = ['banana'];
    });
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-control'));
    await flush();
    fireEvent.press(screen.getByTestId('sv-list-item-apple'));
    await flush();
    expect(value(question)).toEqual(['banana', 'apple']);
    fireEvent.press(screen.getByTestId('overlay-action-cancel'));
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(value(question)).toEqual(['banana']);
  });

  it('footer DONE commits and closes (core-provided sv-dropdown-done-button)', async () => {
    const { question } = mountTagboxSurvey();
    await flush();
    fireEvent.press(screen.getByTestId('sv-tagbox-control'));
    await flush();
    fireEvent.press(screen.getByTestId('sv-list-item-cherry'));
    await flush();
    fireEvent.press(
      screen.getByTestId('overlay-action-sv-dropdown-done-button')
    );
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(value(question)).toEqual(['cherry']);
  });
});

describe('overlay dismiss semantics — single-select consumers (dropdown path)', () => {
  it('backdrop tap on a dropdown sheet closes without touching a previously committed value', async () => {
    const model = new Model({
      elements: [{ type: 'dropdown', name: 'dd', choices: ['a', 'b', 'c'] }],
    });
    const question = model.getQuestionByName('dd')!;
    render(<Survey model={model as never} />);
    layoutRows();
    await flush();
    // Commit through the sheet (single-select closes on select).
    fireEvent.press(screen.getByTestId('sv-dropdown-control'));
    await flush();
    fireEvent.press(screen.getByTestId('sv-list-item-b'));
    await flush();
    expect(value(question)).toBe('b');
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    // Reopen and dismiss via backdrop: value untouched.
    fireEvent.press(screen.getByTestId('sv-dropdown-control'));
    await flush();
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    await flush();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(value(question)).toBe('b');
  });
});

describe('overlay dismiss semantics — OverlayHost affordance mapping', () => {
  function harness(overrides: Record<string, unknown> = {}) {
    const stack = createOverlayStack<OverlayPayload>();
    const popup = new PopupModel(
      'sv-string-viewer',
      { model: null },
      overrides
    );
    const registration = registerPopup(popup, stack);
    return { stack, popup, registration };
  }

  it('sheet backdrop press runs HIDE, never the cancel sequence', () => {
    const onCancel = jest.fn();
    const onHide = jest.fn();
    const { popup, stack } = harness({ onCancel, onHide });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    fireEvent.press(screen.getByTestId('overlay-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(popup.isVisible).toBe(false);
  });

  it('Android back on a SHEET dismisses without cancel (web Escape parity for non-modal popups)', () => {
    const onCancel = jest.fn();
    const { popup, stack } = harness({ onCancel });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(popup.isVisible).toBe(false);
  });

  it('Android back on a modal DIALOG still runs the cancel sequence (web modal Escape parity)', () => {
    const onCancel = jest.fn();
    const { popup, stack } = harness({ isModal: true, onCancel });
    render(<OverlayHost stack={stack} />);
    act(() => {
      popup.show();
    });
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(popup.isVisible).toBe(false);
  });

  it('iOS a11y escape on a SHEET dismisses without cancel; on a DIALOG it cancels', () => {
    const sheetCancel = jest.fn();
    const sheet = harness({ onCancel: sheetCancel });
    const view = render(<OverlayHost stack={sheet.stack} />);
    act(() => {
      sheet.popup.show();
    });
    act(() => {
      fireEvent(
        screen.getByTestId('overlay-panel-sheet'),
        'accessibilityEscape'
      );
    });
    expect(sheetCancel).not.toHaveBeenCalled();
    expect(sheet.popup.isVisible).toBe(false);
    view.unmount();

    const dialogCancel = jest.fn();
    const dialog = harness({ isModal: true, onCancel: dialogCancel });
    render(<OverlayHost stack={dialog.stack} />);
    act(() => {
      dialog.popup.show();
    });
    act(() => {
      fireEvent(
        screen.getByTestId('overlay-panel-dialog'),
        'accessibilityEscape'
      );
    });
    expect(dialogCancel).toHaveBeenCalledTimes(1);
    expect(dialog.popup.isVisible).toBe(false);
  });
});
