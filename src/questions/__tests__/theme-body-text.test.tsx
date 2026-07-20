/**
 * v0.2.1 codex-review FIX 2 — RN has NO CSS text inheritance, so the
 * read-only plain-`Text` render modes (text/comment "div") and the HTML
 * question's rendered content need an EXPLICIT theme-derived foreground
 * color/typography, or a dark theme renders unreadable near-black text.
 * Each of the three sinks must carry the shared body-text style whose color
 * is the theme's `--sjs-general-forecolor` token.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { Model, settings } from '../../core/facade';
import type {
  QuestionTextModel,
  QuestionHtmlModel,
  Question,
} from '../../core/facade';
import { TextQuestion } from '../TextQuestion';
import { HtmlQuestion } from '../HtmlQuestion';
import { Comment } from '../../components/Comment';
import { resolveTheme } from '../../theme-core/resolve';
import { resolveColorVar } from '../../theme-rn/recipes/tokenLookup';

const mockSanitizedHtmlProps = jest.fn();
jest.mock('../../components/SanitizedHtml', () => ({
  __esModule: true,
  SanitizedHtml: (props: Record<string, unknown>) => {
    mockSanitizedHtmlProps(props);
    return null;
  },
}));

/** The default theme's general foreground — the color every body-text sink
 * must carry (the same value the component derives from its own default
 * `themeContext`, computed here via the SAME token accessor). */
function expectedForeground(): string {
  return resolveColorVar(resolveTheme(undefined), '--sjs-general-forecolor')
    .css;
}

function flatColor(style: unknown): string | undefined {
  return (StyleSheet.flatten(style as never) as TextStyle | undefined)
    ?.color as string | undefined;
}

describe('theme foreground on plain-text / html sinks (codex FIX 2)', () => {
  afterEach(() => {
    settings.readOnly.textRenderMode = 'input';
    settings.readOnly.commentRenderMode = 'textarea';
    mockSanitizedHtmlProps.mockClear();
  });

  it('read-only text (div mode) carries the theme general-forecolor', () => {
    settings.readOnly.textRenderMode = 'div';
    const model = new Model({
      elements: [
        { type: 'text', name: 'q1', readOnly: true, defaultValue: 'v' },
      ],
    });
    const q = model.getQuestionByName('q1') as QuestionTextModel;
    render(<TextQuestion question={q} creator={{}} />);
    expect(flatColor(screen.getByTestId('q1-readonly-text').props.style)).toBe(
      expectedForeground()
    );
  });

  it('read-only comment (div mode) carries the theme general-forecolor', () => {
    settings.readOnly.commentRenderMode = 'div';
    const model = new Model({
      elements: [
        { type: 'comment', name: 'c1', readOnly: true, defaultValue: 'v' },
      ],
    });
    const q = model.getQuestionByName('c1') as Question;
    render(<Comment question={q} creator={{}} />);
    expect(
      flatColor(screen.getByTestId('comment-readonly-text').props.style)
    ).toBe(expectedForeground());
  });

  it('html question threads a baseStyle carrying the theme general-forecolor', () => {
    const model = new Model({
      elements: [{ type: 'html', name: 'h1', html: '<p>hi</p>' }],
    });
    const q = model.getQuestionByName('h1') as QuestionHtmlModel;
    render(<HtmlQuestion question={q} creator={{}} />);
    const props = mockSanitizedHtmlProps.mock.calls.at(-1)?.[0] as
      { baseStyle?: unknown } | undefined;
    expect(flatColor(props?.baseStyle)).toBe(expectedForeground());
  });
});
