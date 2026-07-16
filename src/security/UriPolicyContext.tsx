/**
 * Survey-scoped URI-policy context (task 1.1, review round 1 major #2).
 *
 * `<Survey uriPolicy>` provides ONE `UriPolicyConfig` here so every
 * render-time sink (SanitizedHtml `<img>` validation, the header logo)
 * enforces the same policy the JSON preflight enforced — an origin the
 * author allowed once must not be re-rejected by a sink that never saw
 * the config. Sinks read it as a DEFAULT only: an explicit config prop
 * on the sink wins (the 0.9 per-sink seams are unchanged).
 *
 * `undefined` (no provider / no `uriPolicy` prop) preserves each sink's
 * fail-closed default behavior.
 */
import * as React from 'react';
import type { UriPolicyConfig } from './uri-policy';

export const UriPolicyContext = React.createContext<
  UriPolicyConfig | undefined
>(undefined);

UriPolicyContext.displayName = 'UriPolicyContext';
