/**
 * Background attachment normalization (design ownership table:
 * "backgroundImageAttachment: 'fixed' mapping + diagnostic (0.6 deferred
 * it here) | 0.7 -- normalized to scroll at style time +
 * theme-attachment-unsupported diagnostic"). RN has no
 * `background-attachment: fixed` analog (no viewport-relative fixed
 * background layer independent of scroll position) -- `fixed` is
 * normalized to plain `scroll` behavior with a diagnostic; `scroll`
 * passes through unchanged.
 *
 * Pure function (matches theme-core's own diagnostics-as-data
 * discipline): the PROVIDER calls this and folds the resulting
 * diagnostic into its own post-commit flush, rather than this module
 * calling the app-wide seam directly.
 */
import type { ThemeBackground } from '../theme-core/resolve';

export interface NormalizedBackground {
  image: string | undefined;
  fit: 'auto' | 'contain' | 'cover';
  /** Always 'scroll' after normalization -- RN has no 'fixed' analog. */
  attachment: 'scroll';
  opacity: number;
}

export interface BackgroundDiagnostic {
  code: 'theme-attachment-unsupported';
  message: string;
}

export interface NormalizeBackgroundResult {
  normalized: NormalizedBackground;
  diagnostics: BackgroundDiagnostic[];
}

export function normalizeBackground(
  background: ThemeBackground
): NormalizeBackgroundResult {
  const diagnostics: BackgroundDiagnostic[] =
    background.attachment === 'fixed'
      ? [
          {
            code: 'theme-attachment-unsupported',
            message:
              "backgroundImageAttachment: 'fixed' has no React Native analog; normalized to 'scroll' behavior.",
          },
        ]
      : [];
  return {
    normalized: {
      image: background.image,
      fit: background.fit,
      attachment: 'scroll',
      opacity: background.opacity,
    },
    diagnostics,
  };
}
