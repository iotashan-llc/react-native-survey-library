/**
 * Companion amendment 1 (design: docs/design/0.7-theme-rn.md, "Companion
 * amendments" #1): `SurveyElementBase` gets an inherited
 * `static contextType = SurveyThemeContext` + a typed `this.context`
 * accessor (single-context constraint -- a subclass that also needs a
 * DIFFERENT context must use `<Context.Consumer>` instead, same as any
 * other React class component with `contextType` already set).
 */
import * as React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SurveyElementBase } from '../SurveyElementBase';
import {
  SurveyThemeProvider,
  SurveyThemeContext,
} from '../../theme-rn/provider';

class ContextProbe extends SurveyElementBase {
  protected renderElement(): React.JSX.Element {
    const value = this.themeContext;
    return (
      <Text testID="probe">{value.resolved.meta.themeName ?? 'none'}</Text>
    );
  }
}

describe('SurveyElementBase — static contextType = SurveyThemeContext (companion amendment 1)', () => {
  it('is inherited on the class itself', () => {
    expect(SurveyElementBase.contextType).toBe(SurveyThemeContext);
  });

  it('a subclass reads the provider value through this.context', () => {
    const { getByTestId } = render(
      <SurveyThemeProvider theme={{ themeName: 'DefaultDark' }}>
        <ContextProbe />
      </SurveyThemeProvider>
    );
    expect(getByTestId('probe').props.children).toBe('DefaultDark');
  });

  it('without a provider in the tree, this.context receives the default context value', () => {
    const { getByTestId } = render(<ContextProbe />);
    expect(getByTestId('probe').props.children).toBe('none');
  });
});
