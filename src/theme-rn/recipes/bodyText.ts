/**
 * Shared body-text style (v0.2.1 codex-review FIX 2). RN has NO CSS text
 * inheritance: a bare `<Text>` (the read-only text/comment "div" render
 * modes) or the HTML renderer's root gets NO color/family/size unless one
 * is set explicitly, so under a dark theme these render with the platform
 * default (near-black) foreground — unreadable / wrong-contrast.
 *
 * This derives ONE chrome-free text style from the SAME theme tokens the
 * sibling `input` recipe reads for its read-only text color
 * (`--sjs-general-forecolor`) plus the base typography family/size/
 * lineHeight. It carries ONLY typography — no padding / border /
 * background / shadow — so the caller keeps its own chrome-free layout.
 */
import type { TextStyle } from 'react-native';
import type { ResolvedTheme } from '../../theme-core/resolve';
import { resolveColorVar } from './tokenLookup';

export function buildBodyTextStyle(resolved: ResolvedTheme): TextStyle {
  return {
    color: resolveColorVar(resolved, '--sjs-general-forecolor').css,
    fontFamily: resolved.tokens.typography.base.fontFamily || undefined,
    fontSize: resolved.tokens.typography.base.fontSize,
    lineHeight: resolved.tokens.typography.baseLineHeight,
  };
}
