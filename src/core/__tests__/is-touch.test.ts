/**
 * 2.1 device-mode adapter (design D3): core computes `IsTouch` from DOM
 * touch/matchMedia — an RN runtime classifies as DESKTOP, flipping
 * DropdownListModel into desktop popup behavior (search availability
 * rules, tagbox cancel-rollback). The facade applies the pinned-version
 * `_setIsTouch(true)` seam at import time, idempotently.
 */
import { IsTouch, _setIsTouch } from '../facade';

describe('facade device-mode adapter (_setIsTouch)', () => {
  it('the facade import leaves core in TOUCH mode', () => {
    expect(IsTouch).toBe(true);
  });

  it('the seam itself remains available and idempotent', () => {
    _setIsTouch(true);
    _setIsTouch(true);
    // Re-import view of the binding (live ESM binding through the
    // facade's re-export).
    expect(
      (jest.requireActual('../facade') as { IsTouch: boolean }).IsTouch
    ).toBe(true);
  });
});
