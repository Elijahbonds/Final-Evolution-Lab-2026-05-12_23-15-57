import { describe, expect, it } from 'vitest';
import { isWalled, isWalledRoute, WALLED_ROUTES } from './shipStatus';

describe('ship status route wall', () => {
  it('walls a route only when its mapped mode is actually walled', () => {
    for (const [slug, modeKey] of Object.entries(WALLED_ROUTES)) {
      expect(isWalledRoute(slug), slug).toBe(isWalled(modeKey));
    }
  });

  it('does not wall unknown routes', () => {
    expect(isWalledRoute('dunk')).toBe(false);
  });
});
