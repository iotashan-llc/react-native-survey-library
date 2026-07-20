/**
 * `OverlayControlBase` focus-return WIRING suite (2.5 review v2, L5) —
 * the contract suite's focus-return case is calibrated to this jest
 * env's real `findNodeHandle`, which resolves NULL for wired AND
 * unwired refs (Fabric test renderer) — so broken `ref={this.controlRef}`
 * wiring would still pass there. This sibling suite closes that hole:
 * `findNodeHandle` is module-mocked to hand out a SENTINEL number per
 * non-null instance, so `openerHandle()` resolves a number ONLY when the
 * consumer actually wired `controlRef` to its opener Pressable.
 *
 * Mutation-calibrated (2026-07-19): temporarily deleting
 * `ref={this.controlRef}` from RatingDropdownQuestion's opener made the
 * rating case fail (`openerHandle()` → null) while the contract suite's
 * calibrated case stayed green — exactly the gap this suite pins shut.
 *
 * The mock delegates every other react-native export to the real module
 * through the prototype chain (no eager getter materialization).
 */
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const handles = new WeakMap<object, number>();
  let nextHandle = 1;
  const mocked = Object.create(RN);
  Object.defineProperty(mocked, 'findNodeHandle', {
    configurable: true,
    enumerable: true,
    value: (instance: unknown): number | null => {
      if (instance == null) return null;
      const key = instance as object;
      const existing = handles.get(key);
      if (existing !== undefined) return existing;
      const handle = 4200 + nextHandle++;
      handles.set(key, handle);
      return handle;
    },
  });
  return mocked;
});

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
import type { OverlayPayload } from '../../overlay/popup-bridge';
import type { QuestionElementBaseProps } from '../QuestionElementBase';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

interface WiringFixture {
  consumer: string;
  element(name: string): Record<string, unknown>;
  Element(props: QuestionElementBaseProps): React.JSX.Element;
  /** Post-render step that makes the opener live (buttongroup: the
   * wrapper layout event; no-op for the eager consumers). */
  activate(name: string): void;
  openerTestID(name: string): string;
}

const CHOICES = ['alpha', 'beta', 'gamma'];

const FIXTURES: WiringFixture[] = [
  {
    consumer: 'dropdown',
    element: (name) => ({ type: 'dropdown', name, choices: CHOICES }),
    Element: DropdownQuestionElement,
    activate: () => {},
    openerTestID: () => 'sv-dropdown-control',
  },
  {
    consumer: 'tagbox',
    element: (name) => ({ type: 'tagbox', name, choices: CHOICES }),
    Element: TagboxQuestionElement,
    activate: () => {},
    openerTestID: () => 'sv-tagbox-control',
  },
  {
    consumer: 'rating-dropdown',
    element: (name) => ({ type: 'rating', name, displayMode: 'dropdown' }),
    Element: RatingDropdownQuestionElement,
    activate: () => {},
    openerTestID: (name) => `sv-rating-dropdown-${name}`,
  },
  {
    consumer: 'buttongroup-compact',
    element: (name) => ({
      type: 'buttongroup',
      name,
      choices: CHOICES,
      renderAs: 'dropdown',
    }),
    Element: ButtonGroupQuestionElement,
    activate: (name) => {
      fireEvent(
        screen.getByTestId(`sv-buttongroup-wrapper-${name}`),
        'layout',
        { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } } }
      );
    },
    openerTestID: (name) => `sv-buttongroup-dropdown-${name}`,
  },
];

describe.each(FIXTURES)(
  'OverlayControlBase focus-return wiring — $consumer',
  (fixture) => {
    it('openerHandle resolves the opener Pressable through findNodeHandle (sentinel number — controlRef is actually wired)', async () => {
      const model = new Model({ elements: [fixture.element('qw')] });
      const question = model.getQuestionByName('qw') as Question;
      const stack = createOverlayStack<OverlayPayload>();
      const ConsumerElement = fixture.Element;
      render(
        <OverlayContext.Provider value={stack}>
          <ConsumerElement question={question} creator={{}} />
        </OverlayContext.Provider>
      );
      await flush();
      fixture.activate('qw');
      fireEvent.press(screen.getByTestId(fixture.openerTestID('qw')));
      expect(stack.entries()).toHaveLength(1);
      const payload = stack.entries()[0]!.payload;
      expect(typeof payload.openerHandle).toBe('function');
      const handle = payload.openerHandle!();
      // The sentinel mock returns a number ONLY for a non-null ref
      // instance: a consumer whose opener lost `ref={this.controlRef}`
      // resolves null here and fails.
      expect(typeof handle).toBe('number');
    });
  }
);
