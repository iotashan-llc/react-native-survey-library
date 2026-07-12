/**
 * `ReactSurveyElement` — trivial subclass adding a `cssClasses` prop
 * getter (design: docs/design/0.4-reactive-base.md, port map). As-is port
 * of survey-react-ui's `ReactSurveyElement` (reactquestion_element.tsx:184-191).
 */
import * as React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ReactSurveyElement } from '../ReactSurveyElement';
import type { SurveyElementBaseState } from '../SurveyElementBase';

interface ProbeProps {
  testID: string;
  cssClasses?: unknown;
}

class CssClassesProbe extends ReactSurveyElement<
  ProbeProps,
  SurveyElementBaseState
> {
  protected renderElement(): React.JSX.Element {
    return (
      <Text testID={this.props.testID}>{JSON.stringify(this.cssClasses)}</Text>
    );
  }
}

describe('ReactSurveyElement', () => {
  it('exposes props.cssClasses through a protected getter', () => {
    render(
      <CssClassesProbe testID="css-probe" cssClasses={{ root: 'sd-root' }} />
    );
    expect(screen.getByTestId('css-probe').props.children).toBe(
      JSON.stringify({ root: 'sd-root' })
    );
  });

  it('inherits the SurveyElementBase mechanism (mount does not throw, renders once)', () => {
    render(<CssClassesProbe testID="css-probe-2" cssClasses="sd-x" />);
    expect(screen.getByTestId('css-probe-2')).toBeTruthy();
  });
});
