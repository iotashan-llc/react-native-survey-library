/**
 * The registrar (design: docs/design/0.5-factories.md, "Registration &
 * packaging"). Walks the descriptor table's `supported` rows and performs
 * every registration side effect — the ONLY module in this library allowed
 * to do so; component modules export only components (no module-scope
 * self-registration, so a tree-shaker honoring `sideEffects` can never drop
 * a registration silently — see `package.json`'s `sideEffects` array,
 * which lists this file alongside `src/index.tsx`).
 *
 * `applySupportedDescriptor` takes injectable factory instances (defaulting
 * to the shared `RNQuestionFactory`/`RNElementFactory` singletons) so tests
 * can exercise the exact registration mechanism — including the `renderer`
 * route's dual registration — without touching shared state.
 */
import * as React from 'react';
import { RendererFactory } from '../core/facade';
import { DESCRIPTOR_TABLE } from './descriptors';
import type { Descriptor, SupportedDescriptor } from './descriptors';
import { QuestionFactory, RNQuestionFactory } from './QuestionFactory';
import { ElementFactory, RNElementFactory } from './ElementFactory';

interface FactoryPair {
  question: QuestionFactory;
  element: ElementFactory;
}

function isSupported(row: Descriptor): row is SupportedDescriptor {
  return row.status === 'supported';
}

/**
 * Registers one `supported` descriptor row. The `component` thunk is
 * resolved INSIDE the creator closure — i.e. lazily, once per dispatch,
 * not once at registration time — so a future component module that
 * lazy-imports a heavy capability library (A10) only pays that cost when a
 * survey actually renders that question type.
 */
export function applySupportedDescriptor(
  row: SupportedDescriptor,
  factories: FactoryPair = {
    question: RNQuestionFactory,
    element: RNElementFactory,
  }
): void {
  const creator = (props: unknown): React.JSX.Element => {
    const Component = row.component();
    return React.createElement(Component, props as never);
  };

  switch (row.route) {
    case 'template':
      factories.question.registerQuestion(row.dispatchKey, creator);
      return;
    case 'renderer': {
      if (!row.renderAs) {
        throw new Error(
          `descriptor row "${row.dispatchKey}": route "renderer" requires renderAs`
        );
      }
      factories.question.registerQuestion(row.dispatchKey, creator);
      RendererFactory.Instance.registerRenderer(
        row.questionType,
        row.renderAs,
        row.dispatchKey
      );
      return;
    }
    case 'element':
      factories.element.registerElement(row.dispatchKey, creator);
      return;
  }
}

export function registerAll(): void {
  DESCRIPTOR_TABLE.filter(isSupported).forEach((row) =>
    applySupportedDescriptor(row)
  );
}

registerAll();
