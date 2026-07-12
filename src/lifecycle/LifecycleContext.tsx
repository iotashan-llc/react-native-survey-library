/**
 * Native lifecycle bridge — React context (design:
 * docs/design/1.2-lifecycle-bridge.md, piece 1 header).
 *
 * `<Survey>` (1.1) provides `{ registry }` for the survey instance it
 * renders; focusable components (1.5/1.7+) consume it (class components
 * via `static contextType = LifecycleContext`) to register their
 * `ElementHandle`s from the 0.4 mounted hooks. `null` outside a
 * `<Survey>` — consumers treat that as "no bridge" and skip registration
 * (never throw; invariant 9 spirit).
 */
import { createContext } from 'react';
import type { LifecycleRegistry } from './types';

export interface LifecycleContextValue {
  registry: LifecycleRegistry;
}

export const LifecycleContext = createContext<LifecycleContextValue | null>(
  null
);
LifecycleContext.displayName = 'SurveyLifecycleContext';
