import { describe, expect, it } from 'vitest';
import { visiblePlanId } from './planSelection';

describe('visiblePlanId', () => {
  const plans = [{ id: 'plan-a' }, { id: 'plan-b' }];

  it('keeps a selected plan that still exists', () => {
    expect(visiblePlanId(plans, 'plan-b')).toBe('plan-b');
  });

  it('falls back to the first visible plan when selection goes stale', () => {
    expect(visiblePlanId(plans, 'removed-plan')).toBe('plan-a');
  });

  it('returns empty string when no plans remain', () => {
    expect(visiblePlanId([], 'removed-plan')).toBe('');
  });
});
