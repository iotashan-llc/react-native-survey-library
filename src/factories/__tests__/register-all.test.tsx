/**
 * `register-all.ts` — the registrar (design: docs/design/0.5-factories.md,
 * "Registration & packaging", test plan #2 + #6). Walks `supported`
 * descriptor rows and registers each into the right registry; resolves the
 * `component` thunk per dispatch (test plan's "component thunks", A10
 * lazy-import boundary), and for a `renderer` route ALSO wires
 * survey-core's `RendererFactory` so `question.getComponentName()`
 * resolves the same key.
 *
 * `applySupportedDescriptor` takes injectable factory instances so this
 * suite never touches the shared `RNQuestionFactory`/`RNElementFactory`
 * singletons — no cross-test pollution, no cleanup needed for those. The
 * real `RendererFactory.Instance` (survey-core) IS shared process-wide;
 * the renderer-route test uses a unique fixture key and unregisters it in
 * `finally`.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Model, RendererFactory } from '../../core/facade';
import { QuestionFactory } from '../QuestionFactory';
import { ElementFactory } from '../ElementFactory';
import { applySupportedDescriptor, registerAll } from '../register-all';
import type { SupportedDescriptor } from '../descriptors';
import { RNQuestionFactory } from '../QuestionFactory';
import { RNElementFactory } from '../ElementFactory';

describe('register-all: applySupportedDescriptor', () => {
  it('route "template": registers the resolved component under RNQuestionFactory at dispatchKey', () => {
    const question = new QuestionFactory();
    const element = new ElementFactory();
    function Fixture(props: { label: string }): React.JSX.Element {
      return <Text>{props.label}</Text>;
    }
    const row: SupportedDescriptor = {
      status: 'supported',
      questionType: 'fixture',
      dispatchKey: 'fixture',
      route: 'template',
      component: () => Fixture as never,
      milestone: 'M0',
    };

    applySupportedDescriptor(row, { question, element });

    expect(question.isQuestionRegistered('fixture')).toBe(true);
    expect(element.isElementRegistered('fixture')).toBe(false);
    const created = question.createQuestion('fixture', { label: 'hi' });
    render(created as React.JSX.Element);
    expect(screen.getByText('hi')).toBeTruthy();
  });

  it('route "element": registers the resolved component under RNElementFactory at dispatchKey', () => {
    const question = new QuestionFactory();
    const element = new ElementFactory();
    function Fixture(props: { label: string }): React.JSX.Element {
      return <Text>{props.label}</Text>;
    }
    const row: SupportedDescriptor = {
      status: 'supported',
      questionType: 'fixture-el',
      dispatchKey: 'sv-fixture-el',
      route: 'element',
      component: () => Fixture as never,
      milestone: 'M0',
    };

    applySupportedDescriptor(row, { question, element });

    expect(element.isElementRegistered('sv-fixture-el')).toBe(true);
    expect(question.isQuestionRegistered('sv-fixture-el')).toBe(false);
    const created = element.createElement('sv-fixture-el', { label: 'yo' });
    render(created as React.JSX.Element);
    expect(screen.getByText('yo')).toBeTruthy();
  });

  it('route "renderer": registers under RNQuestionFactory AND wires survey-core RendererFactory so getComponentName() resolves the dispatchKey (both routes)', () => {
    const question = new QuestionFactory();
    const element = new ElementFactory();
    function Fixture(): React.JSX.Element {
      return <Text>renderer-fixture</Text>;
    }
    const FIXTURE_QUESTION_TYPE = 'text';
    const FIXTURE_RENDER_AS = '0.5-fixture-render-as';
    const FIXTURE_DISPATCH_KEY = 'sv-text-0.5-fixture';
    const row: SupportedDescriptor = {
      status: 'supported',
      questionType: FIXTURE_QUESTION_TYPE,
      dispatchKey: FIXTURE_DISPATCH_KEY,
      route: 'renderer',
      renderAs: FIXTURE_RENDER_AS,
      component: () => Fixture as never,
      milestone: 'M0',
    };

    try {
      applySupportedDescriptor(row, { question, element });

      expect(question.isQuestionRegistered(FIXTURE_DISPATCH_KEY)).toBe(true);

      const model = new Model({
        elements: [
          {
            type: FIXTURE_QUESTION_TYPE,
            name: 'q1',
            renderAs: FIXTURE_RENDER_AS,
          },
        ],
      });
      const fixtureQuestion = model.getQuestionByName('q1');
      expect(fixtureQuestion?.getComponentName()).toBe(FIXTURE_DISPATCH_KEY);
      expect(fixtureQuestion?.isDefaultRendering()).toBe(false);

      const created = question.createQuestion(
        fixtureQuestion!.getComponentName(),
        {}
      );
      render(created as React.JSX.Element);
      expect(screen.getByText('renderer-fixture')).toBeTruthy();
    } finally {
      RendererFactory.Instance.unregisterRenderer(
        FIXTURE_QUESTION_TYPE,
        FIXTURE_RENDER_AS
      );
    }
  });

  it('a "renderer" route row without renderAs throws (programmer error, not a runtime fallback case)', () => {
    const question = new QuestionFactory();
    const element = new ElementFactory();
    const row = {
      status: 'supported',
      questionType: 'text',
      dispatchKey: 'sv-text-broken',
      route: 'renderer',
      component: () => (() => null) as never,
      milestone: 'M0',
    } as SupportedDescriptor;

    expect(() => applySupportedDescriptor(row, { question, element })).toThrow(
      /renderAs/
    );
  });

  it('the component thunk is resolved lazily, per createQuestion call, not eagerly at registration time', () => {
    const question = new QuestionFactory();
    const element = new ElementFactory();
    let resolveCount = 0;
    function Fixture(): React.JSX.Element {
      return <Text>lazy</Text>;
    }
    const row: SupportedDescriptor = {
      status: 'supported',
      questionType: 'lazy',
      dispatchKey: 'lazy',
      route: 'template',
      component: () => {
        resolveCount += 1;
        return Fixture as never;
      },
      milestone: 'M0',
    };

    applySupportedDescriptor(row, { question, element });
    expect(resolveCount).toBe(0);

    question.createQuestion('lazy', {});
    expect(resolveCount).toBe(1);
    question.createQuestion('lazy', {});
    expect(resolveCount).toBe(2);
  });
});

describe('registerAll (module side effect)', () => {
  it('importing register-all.ts registers exactly the supported descriptor rows into the shared singletons', () => {
    // registerAll() is idempotent (Map#set overwrites) — calling it
    // explicitly here (on top of the module's own import-time call)
    // exercises the exported function directly without double-counting.
    registerAll();

    expect(RNQuestionFactory.getAllTypes()).toEqual([
      'boolean',
      'buttongroup',
      'checkbox',
      'comment',
      'composite',
      'custom',
      'dropdown',
      'empty',
      'expression',
      'file',
      'html',
      'image',
      'imagemap',
      'imagepicker',
      'matrix',
      'matrixdropdown',
      'matrixdynamic',
      'multipletext',
      'paneldynamic',
      'radiogroup',
      'ranking',
      'rating',
      'signaturepad',
      'slider',
      'sv-boolean-checkbox',
      'sv-boolean-radio',
      'sv-rating-dropdown',
      'tagbox',
      'text',
    ]);
    expect(RNElementFactory.getAllTypes()).toEqual([
      'panel',
      'survey-header',
      'sv-list',
      'sv-list-item-group',
      'sv-logo-image',
      'sv-page',
      'sv-rating-dropdown-item',
      'sv-rating-item',
      'sv-rating-item-smiley',
      'sv-rating-item-star',
      'sv-singleinput-summary',
      'sv-string-viewer',
    ]);
  });
});
