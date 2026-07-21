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
  ButtonGroupQuestion,
  ButtonGroupQuestionElement,
  DropdownQuestion,
  DropdownQuestionElement,
  RatingDropdownQuestion,
  RatingDropdownQuestionElement,
  TagboxQuestion,
  TagboxQuestionElement,
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

  it('every overlay question class exports WITH its OverlayContext element wrapper (the raw class alone cannot bridge a Modal)', () => {
    expect(typeof DropdownQuestion).toBe('function');
    expect(typeof DropdownQuestionElement).toBe('function');
    expect(typeof TagboxQuestion).toBe('function');
    expect(typeof TagboxQuestionElement).toBe('function');
    expect(typeof ButtonGroupQuestion).toBe('function');
    expect(typeof ButtonGroupQuestionElement).toBe('function');
    expect(typeof RatingDropdownQuestion).toBe('function');
    expect(typeof RatingDropdownQuestionElement).toBe('function');
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
