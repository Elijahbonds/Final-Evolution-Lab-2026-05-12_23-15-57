// The frame budget is PER TIER (2026-09-13).
//
// One ceiling across both machines fired on the wrong one. Measured on the same scene, same content:
//   threepoint @ desktop: 833 draws, 60 fps        → warned
//   threepoint @ mobile:  277 draws, 60 fps, 17.7ms worst → silent
// The tier system already renders the same crowd in a third of the draws on mobile, so the measured-on-
// mobile ceiling of 600 was only ever DISPLAYED on desktop, where it is noise. A budget line that cannot
// fire where it matters trains you to ignore it.

import { describe, it, expect } from 'vitest';
import { DEFAULT_BUDGET, MOBILE_BUDGET, DESKTOP_BUDGET, budgetForTier } from './PerfMonitor';

describe('the budget follows the tier', () => {
  it('mobile keeps the measured ceiling', () => {
    expect(budgetForTier('mobile')).toBe(MOBILE_BUDGET);
    expect(MOBILE_BUDGET).toBe(DEFAULT_BUDGET);
    expect(MOBILE_BUDGET.drawCalls).toBe(600);
  });

  it('desktop gets one sized to what a desktop actually chokes on', () => {
    expect(budgetForTier('desktop')).toBe(DESKTOP_BUDGET);
    expect(DESKTOP_BUDGET.drawCalls).toBeGreaterThan(MOBILE_BUDGET.drawCalls);
  });

  it('an unknown tier is treated as MOBILE — the tighter of the two', () => {
    // guessing wrong in the safe direction: a false warning costs a glance, a missed one ships a slow build
    expect(budgetForTier(undefined)).toBe(MOBILE_BUDGET);
  });

  it('the measured desktop figures sit UNDER the desktop ceiling and the mobile ones under mobile', () => {
    // threepoint is the worst measured case on each tier
    expect(833).toBeLessThan(DESKTOP_BUDGET.drawCalls);
    expect(277).toBeLessThan(MOBILE_BUDGET.drawCalls);
    // …and the desktop ceiling is not so high that it can never fire
    expect(DESKTOP_BUDGET.drawCalls).toBeLessThan(833 * 3);
  });

  it('both tiers still demand 60 fps — the frame time is not what differs', () => {
    expect(MOBILE_BUDGET.frameMs).toBe(DESKTOP_BUDGET.frameMs);
  });
});
