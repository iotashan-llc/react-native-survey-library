/**
 * 2.1 — survey-scoped overlay stack context. The Survey shell owns ONE
 * stack + host per SurveyRoot instance; question components (dropdown,
 * tagbox, overflow menus — tasks 2.3+) read the stack here and
 * `registerPopup` their PopupModels against it. `null` outside a Survey
 * (standalone component tests can create their own stack).
 */
import * as React from 'react';
import type { OverlayStack } from './stack';
import type { OverlayPayload } from './popup-bridge';

export const OverlayContext =
  React.createContext<OverlayStack<OverlayPayload> | null>(null);

OverlayContext.displayName = 'OverlayContext';
