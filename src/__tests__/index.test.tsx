import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { LIBRARY_NAME } from '../index';

describe('test rails', () => {
  it('exports the library name', () => {
    expect(LIBRARY_NAME).toBe('@iotashan-llc/react-native-survey-library');
  });

  it('renders react-native components', () => {
    render(<Text>hello survey</Text>);
    expect(screen.getByText('hello survey')).toBeOnTheScreen();
  });
});
