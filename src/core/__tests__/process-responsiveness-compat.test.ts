/**
 * 2.5b characterization — pins the EXACT core behaviors the buttongroup
 * overflow adapter depends on (survey-core 2.5.33). CORE decides the
 * compact threshold; the RN caller only feeds rounded widths through the
 * single-cast adapter (design R3). If any of these flip on a core
 * upgrade, the adapter's assumptions are stale — fix the caller.
 */
import { Model } from '../facade';

interface ResponsiveButtonGroup {
  renderAs: string;
  processResponsiveness(requiredWidth: number, availableWidth: number): boolean;
  dropdownListModelValue?: unknown;
  dropdownListModel?: unknown;
}

function createBg(): { model: Model; q: ResponsiveButtonGroup } {
  const model = new Model({
    elements: [
      { type: 'buttongroup', name: 'bg', choices: ['alpha', 'beta', 'gamma'] },
    ],
  });
  return {
    model,
    q: model.getQuestionByName('bg') as unknown as ResponsiveButtonGroup,
  };
}

describe('processResponsiveness compat (2.5b pinned core behaviors)', () => {
  it('dropdownListModel is LAZY: construction, default-mode reads, and a fitting pass never create it', () => {
    const { q } = createBg();
    expect(q.dropdownListModelValue).toBeUndefined();
    // The getter does NOT create in default mode (only the compact
    // branch calls onBeforeSetCompactRenderer).
    expect(q.dropdownListModel).toBeUndefined();
    expect(q.processResponsiveness(300, 800)).toBe(false);
    expect(q.dropdownListModelValue).toBeUndefined();
  });

  it('the ±2 deadband: |required − available| must EXCEED 2 to flip, both directions', () => {
    const { q } = createBg();
    expect(q.processResponsiveness(102, 100)).toBe(false);
    expect(q.renderAs).toBe('default');
    expect(q.processResponsiveness(103, 100)).toBe(true);
    expect(q.renderAs).toBe('dropdown');
    expect(q.processResponsiveness(100, 102)).toBe(false);
    expect(q.renderAs).toBe('dropdown');
    expect(q.processResponsiveness(100, 103)).toBe(true);
    expect(q.renderAs).toBe('default');
  });

  it('core RETAINS the VM across a flip-back and REUSES the same instance on re-compact', () => {
    const { q } = createBg();
    q.processResponsiveness(500, 100);
    const vm1 = q.dropdownListModel;
    expect(vm1).toBeDefined();
    q.processResponsiveness(100, 500);
    expect(q.renderAs).toBe('default');
    expect(q.dropdownListModelValue).toBe(vm1);
    q.processResponsiveness(500, 100);
    expect(q.renderAs).toBe('dropdown');
    expect(q.dropdownListModel).toBe(vm1);
  });

  it('core rounds availableWidth but NOT requiredWidth — the RN caller must round', () => {
    const a = createBg().q;
    // available 100.4 rounds to 100 → diff 3 → flips.
    expect(a.processResponsiveness(103, 100.4)).toBe(true);
    const b = createBg().q;
    // required is NOT rounded by core: 102.9 − 100 = 2.9 > 2 flips —
    // an unrounded RN caller would drift, so the caller rounds BOTH.
    expect(b.processResponsiveness(102.9, 100)).toBe(true);
  });

  it('core does NOT gate design mode — the RN caller owns that gate', () => {
    const { model, q } = createBg();
    model.setDesignMode(true);
    expect(q.processResponsiveness(500, 300)).toBe(true);
    expect(q.renderAs).toBe('dropdown');
  });
});
