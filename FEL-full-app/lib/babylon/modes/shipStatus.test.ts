import { describe, expect, it } from 'vitest';
import { isWalled, isWalledRoute, shipStatus, WALLED, WALLED_ROUTES, walledReason } from './shipStatus';

describe('ship status navigation wall', () => {
  it('treats a route as walled only when the mapped mode is actively walled', () => {
    const walledKeys = new Set(WALLED.map((mode) => mode.key));

    for (const [slug, modeKey] of Object.entries(WALLED_ROUTES)) {
      expect(isWalledRoute(slug), `${slug} should follow active wall state for ${modeKey}`).toBe(
        walledKeys.has(modeKey),
      );
    }
  });

  it('keeps status and reason helpers in sync with the wall list', () => {
    const walledKeys = new Set(WALLED.map((mode) => mode.key));

    for (const modeKey of ['aeroaces', 'velocitykart', ...walledKeys]) {
      expect(isWalled(modeKey)).toBe(walledKeys.has(modeKey));
      expect(shipStatus(modeKey)).toBe(walledKeys.has(modeKey) ? 'in-development' : 'shipped');
      expect(walledReason(modeKey)).toBe(WALLED.find((mode) => mode.key === modeKey)?.reason ?? null);
    }
  });
});
