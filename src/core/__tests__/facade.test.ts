/**
 * @jest-environment node
 */

// Case 3 (design: docs/design/0.3-core-facade.md, test plan #3). Requiring
// the facade alone (no separate shim require first) must apply the shim
// before pulling in survey-core, proving the source-occurrence import
// order inside facade.ts works under Babel/Metro's CJS transform of the
// `import './shim'; export * from 'survey-core';` module.
import { withRnShapedGlobals } from '../../../test-utils/rn-globals';

describe('core/facade', () => {
  it('loads survey-core without throwing when required alone', () => {
    withRnShapedGlobals(() => {
      expect(() => {
        const facade = require('../facade') as typeof import('survey-core');
        expect(typeof facade.Model).toBe('function');
      }).not.toThrow();
    });
  });
});
