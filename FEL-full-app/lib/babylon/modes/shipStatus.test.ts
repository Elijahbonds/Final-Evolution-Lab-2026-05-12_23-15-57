import { describe, expect, it } from 'vitest';
import { isWalled, isWalledRoute, shipStatus, WALLED, WALLED_ROUTES, walledReason } from './shipStatus';

describe('shipping wall status', () => {
  it('keeps the player-facing route wall in lockstep with the canonical mode wall', () => {
    for (const [slug, modeKey] of Object.entries(WALLED_ROUTES)) {
      expect(isWalledRoute(slug), `${slug} should reflect ${modeKey}`).toBe(isWalled(modeKey));
    }
  });

  it('does not accidentally wall the modes that have already come off the wall', () => {
    expect(WALLED).toEqual([]);
    expect(shipStatus('velocitykart')).toBe('shipped');
    expect(shipStatus('aeroaces')).toBe('shipped');
    expect(isWalledRoute('velocity-kart')).toBe(false);
    expect(isWalledRoute('aero-aces')).toBe(false);
    expect(walledReason('velocitykart')).toBeNull();
    expect(walledReason('aeroaces')).toBeNull();
  });
});
