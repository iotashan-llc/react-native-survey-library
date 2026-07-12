/**
 * `SurveyLocStringViewer` — RN port of survey-react-ui's
 * `SurveyLocStringViewer` (string-viewer.tsx), task 1.6. The single
 * component every model-driven string renders through (via
 * `SurveyElementBase.renderLocString`'s factory dispatch under
 * `LocalizableString.defaultRenderer`).
 *
 * Upstream mechanism preserved exactly:
 * - `onStringChanged` add on mount, remove(prev)+add(current) on every
 *   update, remove on unmount;
 * - the `isRendering` re-entrancy guard (evaluating `renderedHtml` can
 *   itself fire `onStringChanged` through core's calculated-text caching
 *   — a setState from inside render would be a React-19 contract
 *   violation, same class of problem 0.4's D2 guard exists for).
 *
 * Documented RN deltas:
 * - `hasHtml` strings render through `<SanitizedHtml>` (A10/A11) — never
 *   `dangerouslySetInnerHTML`, never raw markup as text. Link presses
 *   surface through SanitizedHtml's own policy (no host callback wired
 *   here yet — that is Survey-root plumbing, task 1.1/1.8).
 * - Upstream's `getStringViewerClassName`/`textClass` CSS-class channel
 *   has no RN meaning; callers pass a `style` (recipe-composed) instead
 *   (invariant 6 — interaction styling is the caller's recipe's job).
 * - Non-multiline strings (`allowLineBreaks` false — serializer property
 *   type !== "text") collapse hard newlines to a space: upstream's plain
 *   `.sv-string-viewer` gets HTML whitespace collapsing for free and only
 *   the `--multiline` modifier opts into `white-space: pre-line`; RN
 *   `Text` always honors `\n`, so the viewer collapses to match.
 *
 * Side-effect-free module (no self-registration): the descriptor table
 * (factories/descriptors.ts) owns the `sv-string-viewer` registration.
 */
import * as React from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { LocalizableString } from '../core/facade';
import { SanitizedHtml } from './SanitizedHtml';

export interface SurveyLocStringViewerProps {
  model: LocalizableString;
  style?: StyleProp<TextStyle>;
}

interface SurveyLocStringViewerState {
  changed: number;
}

/** Upstream single-line rendering: runs of `\n` (with surrounding spaces) collapse to one space. */
function collapseHardLineBreaks(text: string): string {
  return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
}

export class SurveyLocStringViewer extends React.Component<
  SurveyLocStringViewerProps,
  SurveyLocStringViewerState
> {
  constructor(props: SurveyLocStringViewerProps) {
    super(props);
    this.state = { changed: 0 };
  }

  private get locStr(): LocalizableString {
    return this.props.model;
  }

  private isRendering = false;

  private onChangedHandler = (): void => {
    if (this.isRendering) return;
    this.setState((state) => ({ changed: state.changed + 1 }));
  };

  componentDidMount(): void {
    this.reactOnStrChanged();
  }

  componentDidUpdate(prevProps: SurveyLocStringViewerProps): void {
    if (prevProps.model) {
      prevProps.model.onStringChanged.remove(this.onChangedHandler);
    }
    this.reactOnStrChanged();
  }

  componentWillUnmount(): void {
    if (!this.locStr) return;
    this.locStr.onStringChanged.remove(this.onChangedHandler);
  }

  private reactOnStrChanged(): void {
    if (!this.locStr) return;
    this.locStr.onStringChanged.add(this.onChangedHandler);
  }

  render(): React.JSX.Element | null {
    if (!this.locStr) return null;
    this.isRendering = true;
    try {
      return this.renderString();
    } finally {
      this.isRendering = false;
    }
  }

  protected renderString(): React.JSX.Element {
    if (this.locStr.hasHtml) {
      return <SanitizedHtml html={this.locStr.renderedHtml} />;
    }
    const text = this.locStr.renderedHtml;
    return (
      <Text style={this.props.style}>
        {this.locStr.allowLineBreaks ? text : collapseHardLineBreaks(text)}
      </Text>
    );
  }
}
