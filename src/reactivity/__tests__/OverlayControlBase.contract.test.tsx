/**
 * `OverlayControlBase` contract suite (task 2.5, reconciled TDD list) —
 * the SAME parameterized cases run across ALL FOUR consumers:
 * dropdown (2.3), tagbox (2.4), rating displayMode:"dropdown" (2.5a),
 * and buttongroup overflow-compact (2.5b). Where a case also exists in
 * a consumer's own suite the duplication is deliberate — uniform shared
 * coverage of the base's invariants is the point.
 *
 * Contract cases:
 * - stack swap: an OverlayContext stack change re-registers on the new
 *   stack; the old stack keeps no entry.
 * - question swap: registration retargets; the old question's popup is
 *   semantically closed AND no longer bridged (a model-side visibility
 *   flip pushes nothing).
 * - unmount while open: unregisters + semantically closes with NO
 *   console.error (setState-after-unmount / act warnings fail the case).
 * - opener focus return: the registration carries an `openerHandle`
 *   function. EMPIRICALLY CALIBRATED for this jest env (react-native
 *   preset, Fabric test renderer): `findNodeHandle` over the ref'd
 *   Pressable resolves NULL here, so the pinned contract is
 *   "callable, returns number|null, never undefined, never throws" —
 *   with the null result asserted as this environment's observed value.
 *   That makes this case SHAPE-ONLY (broken controlRef wiring would
 *   still pass) — the actual wiring is pinned by the sibling
 *   `OverlayControlBase.focusReturn.test.tsx`, which sentinel-mocks
 *   `findNodeHandle` and asserts each consumer's openerHandle resolves
 *   a number.
 * - live aria-expanded: core emits `ariaExpanded` as the STRING
 *   'true'/'false' (calibrated: 'false' at rest, 'true' open, 'false'
 *   after the cancel path); the base converts it to the BOOLEAN
 *   `accessibilityState.expanded`, live in both directions.
 * - read-only gate: a read-only question exposes disabled state and a
 *   press never opens the overlay.
 * - clear gate: core's `onClear` empties the value over the shared
 *   synthetic no-op event; consumers WITH a clear affordance
 *   (dropdown/tagbox/rating) gate it on non-empty, buttongroup pins
 *   that NO clear affordance renders while `onClear` still works.
 *
 * The buttongroup fixture forces compact via persisted
 * `renderAs:"dropdown"` (serialized core property) + the wrapper layout
 * event that materializes the lazy VM (`ensureCompactViewModel` — the
 * mount-already-compact path).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Model } from '../../core/facade';
import type { Question } from '../../core/facade';
import '../../factories/register-all';
import { DropdownQuestionElement } from '../../questions/DropdownQuestion';
import { TagboxQuestionElement } from '../../questions/TagboxQuestion';
import { RatingDropdownQuestionElement } from '../../questions/RatingDropdownQuestion';
import { ButtonGroupQuestionElement } from '../../questions/ButtonGroupQuestion';
import { OverlayContext } from '../../overlay/OverlayContext';
import { createOverlayStack } from '../../overlay/stack';
import type { OverlayStack } from '../../overlay/stack';
import type { OverlayPayload } from '../../overlay/popup-bridge';
import { overlayNoopEvent } from '../OverlayControlBase';
import type { QuestionElementBaseProps } from '../QuestionElementBase';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** The VM slice the contract cases read (core's DropdownListModel). */
interface ContractVM {
  popupModel: { isVisible: boolean };
  /** STRING 'true' | 'false' — core mirrors the web aria attribute. */
  ariaExpanded?: string;
  onClear(event: { preventDefault(): void; stopPropagation(): void }): void;
}

interface ConsumerFixture {
  consumer: string;
  /** Survey element JSON that puts the consumer in overlay mode. */
  element(
    name: string,
    extra?: Record<string, unknown>
  ): Record<string, unknown>;
  Element(props: QuestionElementBaseProps): React.JSX.Element;
  /** Post-render step that makes the opener live (buttongroup: the
   * wrapper layout event; no-op for the eager consumers). */
  activate(name: string): void;
  openerTestID(name: string): string;
  /** null = the consumer renders NO clear affordance (buttongroup). */
  clearTestID: ((name: string) => string) | null;
  vm(question: Question): ContractVM;
  /** A committed value selecting a real choice. */
  sampleValue: unknown;
}

const CHOICES = ['alpha', 'beta', 'gamma'];

/** The ALWAYS-mounted buttongroup wrapper's layout event — materializes
 * the compact VM on the mount-already-compact path (2.5b R2). */
function fireButtonGroupWrapperLayout(name: string): void {
  fireEvent(screen.getByTestId(`sv-buttongroup-wrapper-${name}`), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } },
  });
}

const FIXTURES: ConsumerFixture[] = [
  {
    consumer: 'dropdown',
    element: (name, extra = {}) => ({
      type: 'dropdown',
      name,
      choices: CHOICES,
      ...extra,
    }),
    Element: DropdownQuestionElement,
    activate: () => {},
    openerTestID: () => 'sv-dropdown-control',
    clearTestID: () => 'sv-dropdown-clear',
    vm: (question) =>
      (question as unknown as { dropdownListModel: ContractVM })
        .dropdownListModel,
    sampleValue: 'beta',
  },
  {
    consumer: 'tagbox',
    element: (name, extra = {}) => ({
      type: 'tagbox',
      name,
      choices: CHOICES,
      ...extra,
    }),
    Element: TagboxQuestionElement,
    activate: () => {},
    openerTestID: () => 'sv-tagbox-control',
    clearTestID: () => 'sv-tagbox-clear',
    vm: (question) =>
      (question as unknown as { dropdownListModel: ContractVM })
        .dropdownListModel,
    sampleValue: ['beta'],
  },
  {
    consumer: 'rating-dropdown',
    element: (name, extra = {}) => ({
      type: 'rating',
      name,
      displayMode: 'dropdown',
      ...extra,
    }),
    Element: RatingDropdownQuestionElement,
    activate: () => {},
    openerTestID: (name) => `sv-rating-dropdown-${name}`,
    clearTestID: (name) => `sv-rating-dropdown-clear-${name}`,
    vm: (question) =>
      (question as unknown as { dropdownListModel: ContractVM })
        .dropdownListModel,
    sampleValue: 3,
  },
  {
    consumer: 'buttongroup-compact',
    element: (name, extra = {}) => ({
      type: 'buttongroup',
      name,
      choices: CHOICES,
      renderAs: 'dropdown',
      ...extra,
    }),
    Element: ButtonGroupQuestionElement,
    activate: fireButtonGroupWrapperLayout,
    openerTestID: (name) => `sv-buttongroup-dropdown-${name}`,
    clearTestID: null,
    vm: (question) =>
      (question as unknown as { dropdownListModelValue: ContractVM })
        .dropdownListModelValue,
    sampleValue: 'beta',
  },
];

function createQuestion(
  fixture: ConsumerFixture,
  name: string,
  extra: Record<string, unknown> = {}
): Question {
  const model = new Model({ elements: [fixture.element(name, extra)] });
  return model.getQuestionByName(name)!;
}

function renderConsumer(
  fixture: ConsumerFixture,
  question: Question,
  stack: OverlayStack<OverlayPayload>
): {
  unmount: () => void;
  rerenderWith: (
    nextQuestion: Question,
    nextStack?: OverlayStack<OverlayPayload>
  ) => void;
} {
  const ConsumerElement = fixture.Element;
  const view = render(
    <OverlayContext.Provider value={stack}>
      <ConsumerElement question={question} creator={{}} />
    </OverlayContext.Provider>
  );
  return {
    unmount: () => view.unmount(),
    rerenderWith: (nextQuestion, nextStack = stack) =>
      view.rerender(
        <OverlayContext.Provider value={nextStack}>
          <ConsumerElement question={nextQuestion} creator={{}} />
        </OverlayContext.Provider>
      ),
  };
}

describe.each(FIXTURES)(
  'OverlayControlBase contract — $consumer',
  (fixture) => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('stack swap: re-registers on the new OverlayContext stack; the old stack keeps no entry', async () => {
      const question = createQuestion(fixture, 'q1');
      const stackA = createOverlayStack<OverlayPayload>();
      const stackB = createOverlayStack<OverlayPayload>();
      const { rerenderWith } = renderConsumer(fixture, question, stackA);
      await flush();
      fixture.activate('q1');
      rerenderWith(question, stackB);
      await flush();
      fireEvent.press(screen.getByTestId(fixture.openerTestID('q1')));
      expect(stackA.entries()).toHaveLength(0);
      expect(stackB.entries()).toHaveLength(1);
      expect(stackB.entries()[0]!.payload.popup as unknown).toBe(
        fixture.vm(question).popupModel
      );
    });

    it("question swap: registration retargets; the old question's popup closes and is no longer bridged", async () => {
      const questionA = createQuestion(fixture, 'qa');
      const questionB = createQuestion(fixture, 'qb');
      const stack = createOverlayStack<OverlayPayload>();
      const { rerenderWith } = renderConsumer(fixture, questionA, stack);
      await flush();
      fixture.activate('qa');
      fireEvent.press(screen.getByTestId(fixture.openerTestID('qa')));
      expect(stack.entries()).toHaveLength(1);
      const vmA = fixture.vm(questionA);
      rerenderWith(questionB);
      await flush();
      // Retarget-away from an OPEN popup = semantic close + synchronous
      // removal (no presenter left to ack).
      expect(stack.entries()).toHaveLength(0);
      expect(vmA.popupModel.isVisible).toBe(false);
      // A's popup is UNBRIDGED now: a model-side visibility flip must
      // push nothing onto the stack (no stale registration).
      act(() => {
        vmA.popupModel.isVisible = true;
      });
      expect(stack.entries()).toHaveLength(0);
      act(() => {
        vmA.popupModel.isVisible = false;
      });
      // The new question registers cleanly and opens ITS popup.
      fixture.activate('qb');
      fireEvent.press(screen.getByTestId(fixture.openerTestID('qb')));
      expect(stack.entries()).toHaveLength(1);
      expect(stack.entries()[0]!.payload.popup as unknown).toBe(
        fixture.vm(questionB).popupModel
      );
    });

    it('unmount while the popup is open: unregisters + semantically closes with no console.error', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        const question = createQuestion(fixture, 'qu');
        const stack = createOverlayStack<OverlayPayload>();
        const { unmount } = renderConsumer(fixture, question, stack);
        await flush();
        fixture.activate('qu');
        fireEvent.press(screen.getByTestId(fixture.openerTestID('qu')));
        expect(stack.entries()).toHaveLength(1);
        const vm = fixture.vm(question);
        expect(vm.popupModel.isVisible).toBe(true);
        unmount();
        expect(stack.entries()).toHaveLength(0);
        expect(vm.popupModel.isVisible).toBe(false);
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('opener focus return: the registration carries a callable openerHandle (calibrated: number|null, never undefined)', async () => {
      const question = createQuestion(fixture, 'qf');
      const stack = createOverlayStack<OverlayPayload>();
      renderConsumer(fixture, question, stack);
      await flush();
      fixture.activate('qf');
      fireEvent.press(screen.getByTestId(fixture.openerTestID('qf')));
      const payload = stack.entries()[0]!.payload;
      expect(typeof payload.openerHandle).toBe('function');
      const handle = payload.openerHandle!();
      // Empirically calibrated for this jest env: findNodeHandle over the
      // ref'd Pressable resolves NULL under the Fabric test renderer —
      // the contract is number|null and NEVER undefined (the base's
      // `?? null` fold), never a throw.
      expect(handle).not.toBeUndefined();
      expect(handle).toBeNull();
    });

    it("live aria-expanded: core's STRING 'true'/'false' converts to the boolean accessibilityState.expanded, both directions", async () => {
      const question = createQuestion(fixture, 'qe');
      const stack = createOverlayStack<OverlayPayload>();
      renderConsumer(fixture, question, stack);
      await flush();
      fixture.activate('qe');
      const opener = () => screen.getByTestId(fixture.openerTestID('qe'));
      const vm = fixture.vm(question);
      // At rest core emits the STRING 'false' (calibrated), boolean out.
      expect(vm.ariaExpanded).toBe('false');
      expect(opener().props.accessibilityState?.expanded).toBe(false);
      fireEvent.press(opener());
      await flush();
      expect(vm.ariaExpanded).toBe('true');
      expect(opener().props.accessibilityState?.expanded).toBe(true);
      // Close through the real cancel path (backdrop/back analog).
      act(() => {
        stack.entries()[0]!.payload.requestCancel();
      });
      await flush();
      expect(vm.ariaExpanded).toBe('false');
      expect(opener().props.accessibilityState?.expanded).toBe(false);
    });

    it('read-only gate: a read-only question exposes disabled state and never opens on press', async () => {
      const question = createQuestion(fixture, 'qr', { readOnly: true });
      const stack = createOverlayStack<OverlayPayload>();
      renderConsumer(fixture, question, stack);
      await flush();
      fixture.activate('qr');
      const opener = screen.getByTestId(fixture.openerTestID('qr'));
      expect(opener.props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(opener);
      expect(stack.entries()).toHaveLength(0);
      expect(fixture.vm(question).popupModel.isVisible).toBe(false);
    });

    it("clear gate: core's onClear empties the value and never crashes on the shared synthetic event", async () => {
      const question = createQuestion(fixture, 'qc');
      const stack = createOverlayStack<OverlayPayload>();
      renderConsumer(fixture, question, stack);
      await flush();
      fixture.activate('qc');
      act(() => {
        (question as unknown as { value: unknown }).value = fixture.sampleValue;
      });
      expect(question.isEmpty()).toBe(false);
      if (fixture.clearTestID) {
        // Consumers WITH a rendered clear affordance: gated on non-empty,
        // wired to vm.onClear(overlayNoopEvent) by the base.
        const clearID = fixture.clearTestID('qc');
        fireEvent.press(screen.getByTestId(clearID));
        expect(question.isEmpty()).toBe(true);
        expect(screen.queryByTestId(clearID)).toBeNull();
      } else {
        // buttongroup's compact control renders NO clear affordance
        // (pinned — the base's clear gate is simply not called), while
        // core's onClear still works over the shared synthetic event.
        expect(screen.queryByLabelText('Clear')).toBeNull();
        expect(() => {
          act(() => {
            fixture.vm(question).onClear(overlayNoopEvent);
          });
        }).not.toThrow();
        expect(question.isEmpty()).toBe(true);
      }
    });
  }
);
