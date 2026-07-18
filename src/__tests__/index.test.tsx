import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import {
  LIBRARY_NAME,
  RNQuestionFactory,
  RNElementFactory,
  UnsupportedQuestion,
  createUnsupportedQuestion,
  RNIcon,
  ActionButton,
} from '../index';
import { Model } from '../core/facade';
import type { Question } from '../core/facade';

describe('test rails', () => {
  it('exports the library name', () => {
    expect(LIBRARY_NAME).toBe('@iotashan-llc/react-native-survey-library');
  });

  it('exports the 1.5 icon/action primitives from the package root', () => {
    expect(RNIcon).toBeDefined();
    expect(ActionButton).toBeDefined();
  });

  it('renders react-native components', () => {
    render(<Text>hello survey</Text>);
    expect(screen.getByText('hello survey')).toBeOnTheScreen();
  });
});

describe('index.tsx: registrar wiring (design: docs/design/0.5-factories.md)', () => {
  it('importing the package root registers the supported descriptor rows into both factories', () => {
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
      'image',
      'imagepicker',
      'multipletext',
      'paneldynamic',
      'radiogroup',
      'rating',
      'sv-boolean-checkbox',
      'sv-boolean-radio',
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
      'sv-rating-item',
      'sv-rating-item-smiley',
      'sv-rating-item-star',
      'sv-string-viewer',
    ]);
  });

  it('re-exports the unsupported-fallback pieces, usable as the dispatcher combinator', () => {
    const model = new Model({ elements: [{ type: 'text', name: 'q1' }] });
    const question = model.getQuestionByName('q1') as Question;
    const element =
      RNQuestionFactory.createQuestion('sv-does-not-exist', {
        question,
        creator: {},
      }) ??
      createUnsupportedQuestion(
        { question, creator: {} },
        {
          dispatchKey: 'sv-does-not-exist',
        }
      );
    expect(element.type).toBe(UnsupportedQuestion);
  });
});
