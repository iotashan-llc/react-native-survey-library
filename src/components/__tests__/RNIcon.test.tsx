/**
 * RNIcon component contract (design: docs/design/1.5-icon-actionbutton.md,
 * "RNIcon"). `react-native-svg` renders through the root manual mock
 * (`__mocks__/react-native-svg.tsx`) — assertions target the resolved
 * xml/size/fill/a11y props RNIcon hands to `SvgXml`, not host-component
 * internals.
 */
import { act, render, screen } from '@testing-library/react-native';
import { RNIcon } from '../RNIcon';
import { bundledIconsV2 } from '../../core/icons';
import { SvgRegistry, SvgThemeSets } from '../../core/facade';

function unregister(...ids: string[]): void {
  for (const id of ids) {
    delete SvgRegistry.icons[id];
    for (const set of Object.keys(SvgThemeSets)) {
      delete SvgThemeSets[set]?.[id];
    }
  }
}

describe('RNIcon — rendering', () => {
  afterEach(() => {
    unregister('rnicon-late-1-5', 'rnicon-evil-1-5');
  });

  it('renders a bundled icon byte-identically with the 24 default size', () => {
    render(<RNIcon iconName="icon-chevrondown-24x24" testID="icon" />);
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.xml).toBe(bundledIconsV2['chevrondown-24x24']);
    expect(svg.props.width).toBe(24);
    expect(svg.props.height).toBe(24);
  });

  it('forwards explicit size and fill', () => {
    render(
      <RNIcon
        iconName="icon-clear-16x16"
        size={16}
        fill="#ff0000"
        testID="icon"
      />
    );
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.width).toBe(16);
    expect(svg.props.height).toBe(16);
    expect(svg.props.fill).toBe('#ff0000');
  });

  it('renders nothing (no throw) for an unknown icon name', () => {
    render(<RNIcon iconName="icon-rnicon-not-real-1-5" testID="icon" />);
    expect(
      screen.queryByTestId('icon', { includeHiddenElements: true })
    ).toBeNull();
  });

  it('renders a consumer-registered icon SANITIZED', () => {
    SvgRegistry.registerIcon(
      'rnicon-evil-1-5',
      '<svg viewBox="0 0 4 4"><image href="https://evil.example/x.png"/><path d="M1 1h2"/></svg>'
    );
    render(<RNIcon iconName="icon-rnicon-evil-1-5" testID="icon" />);
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.xml).toContain('M1 1h2');
    expect(svg.props.xml).not.toContain('evil.example');
  });

  it('re-renders when a late registration fires onIconsChanged', () => {
    render(<RNIcon iconName="icon-rnicon-late-1-5" testID="icon" />);
    expect(
      screen.queryByTestId('icon', { includeHiddenElements: true })
    ).toBeNull();
    act(() => {
      // registerIcons() is the upstream path that fires onIconsChanged.
      SvgRegistry.registerIcons({
        'rnicon-late-1-5': '<svg viewBox="0 0 4 4"><path d="M0 0h4"/></svg>',
      });
    });
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.xml).toContain('M0 0h4');
  });

  it('unsubscribes from onIconsChanged on unmount', () => {
    const { unmount } = render(
      <RNIcon iconName="icon-chevrondown-24x24" testID="icon" />
    );
    unmount();
    expect(() => {
      act(() => {
        SvgRegistry.onIconsChanged.fire(SvgRegistry, {});
      });
    }).not.toThrow();
  });
});

describe('RNIcon — accessibility', () => {
  it('with a title: accessible image labeled by it', () => {
    render(
      <RNIcon iconName="icon-chevrondown-24x24" title="Expand" testID="icon" />
    );
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.accessible).toBe(true);
    expect(svg.props.accessibilityRole).toBe('image');
    expect(svg.props.accessibilityLabel).toBe('Expand');
  });

  it('without a title: decorative (not accessible), mirroring web role="presentation"', () => {
    render(<RNIcon iconName="icon-chevrondown-24x24" testID="icon" />);
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.accessible).toBe(false);
  });
});
