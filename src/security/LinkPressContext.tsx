/**
 * Survey-scoped link-press context (host opt-in link events; v0.2.1
 * codex finding: inert anchors exposed a dead a11y link role).
 *
 * `<Survey onLinkPress>` provides ONE typed handler here so every
 * `<SanitizedHtml>` sink (titles/descriptions/errors/completed-page/
 * html question/choices) surfaces link presses to the host without
 * per-sink wiring — the same provider pattern as `UriPolicyContext`.
 *
 * Invariant 8 holds: this library NEVER navigates. The handler receives
 * the press-time policy-REVALIDATED canonical URL plus the sink label;
 * `Linking.openURL` (or any navigation) is the HOST's line to write.
 *
 * `undefined` (no provider / no `onLinkPress` prop) keeps every anchor
 * fail-closed AND a11y-honest: no callback resolvable → the anchor
 * renders as plain text (no link role, no pressable) instead of a dead
 * control. An explicit `SanitizedHtml onLinkPress` prop wins over this
 * context (the 0.9 per-sink seams are unchanged).
 */
import * as React from 'react';

/**
 * Names the `<SanitizedHtml>` sink a pressed link lived in. The listed
 * literals cover the library's own sinks; `(string & {})` keeps the
 * union open (custom renderers may label their own sinks) without
 * losing autocomplete on the known values.
 */
export type SurveyLinkPressContext =
  | 'title'
  | 'description'
  | 'html-question'
  | 'error'
  | 'completed'
  | 'loading'
  | 'choice'
  | 'html'
  | (string & {});

/** Delivered to the Survey-level `onLinkPress` handler on an anchor
 * press that passed the URI policy's press-time revalidation. */
export interface SurveyLinkPressEvent {
  /** The policy-validated CANONICAL form of the pressed anchor's href —
   * revalidated at press time; a policy-failing href never gets here. */
  url: string;
  /** Which sink the anchor rendered in (`'html'` when unlabeled). */
  context: SurveyLinkPressContext;
}

export type SurveyLinkPressHandler = (event: SurveyLinkPressEvent) => void;

export const LinkPressContext = React.createContext<
  SurveyLinkPressHandler | undefined
>(undefined);

LinkPressContext.displayName = 'LinkPressContext';
