/**
 * @jest-environment node
 */

// Case 1 (design: docs/design/0.3-core-facade.md, test plan #1) — RED
// baseline. survey-core's SSR guard (`DomWindowHelper.isAvailable()`) is
// `typeof window !== "undefined"`, which is true in React Native because
// RN aliases `window === global`. Requiring survey-core under RN-shaped
// globals, with no shim applied, must throw at require time
// (`dragdrop/dom-adapter.ts` calls `window.addEventListener` at module
// evaluation). This test locks in that failure so the shim's existence
// stays justified — if survey-core ever stops crashing here, this test
// fails and alerts us that the RN-detection behavior changed upstream.
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

describe('survey-core require-time RN incompatibility (RED baseline)', () => {
  it('throws when required under RN-shaped globals without the shim', () => {
    withRnShapedGlobals(() => {
      expect(() => {
        // Deliberately bypassing the facade to prove survey-core itself
        // crashes here — see the file banner above.
        // eslint-disable-next-line no-restricted-syntax
        require('survey-core');
      }).toThrow();
    });
  });
});
