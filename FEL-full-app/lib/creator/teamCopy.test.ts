import { describe, expect, it } from 'vitest';
import { teamPageLede } from './teamCopy';

describe('team page copy', () => {
  it('does not promise booking while the coach store is closed', () => {
    expect(teamPageLede(false)).not.toMatch(/\bBook\b|booking through the coach store/i);
    expect(teamPageLede(false)).toMatch(/Request a quote/);
  });

  it('advertises booking only when the coach store is open', () => {
    expect(teamPageLede(true)).toMatch(/Book a session through the coach store/);
  });
});
