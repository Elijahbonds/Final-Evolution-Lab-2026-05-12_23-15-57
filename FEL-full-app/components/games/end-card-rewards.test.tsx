// QA (PM ruling 2026-09-28): CLAIM was rebuilt as a pure client-side reveal after the P0-03 server-resend version
// (claimEarnGrant / EarnClaim) was removed — ECONOMY-SESSIONS-HARDEN already puts the payout in the session's own
// response, so a second grant call would risk paying it twice against the new, session-transaction-keyed server.
// This pins the one thing that actually matters: tapping CLAIM makes zero network requests, ever.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { button, drive } from '@/tests/helpers/driveRender';
import { EndCardClaim } from './end-card-rewards';

afterEach(() => { vi.unstubAllGlobals(); });

describe('EndCardClaim: a pure client-side reveal (QA, PM ruling)', () => {
  it('tapping CLAIM makes zero requests to /api/wallet* or /api/sessions* — or anywhere else', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { html } = drive(
      () => EndCardClaim() as ReactElement,
      [(tree) => button(tree, /CLAIM/).props.onClick()],
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain('CLAIMED');
  });

  it('starts unclaimed, showing a CLAIM button, not the claimed state', () => {
    const { html } = drive(() => EndCardClaim() as ReactElement);
    expect(html).toContain('CLAIM');
    expect(html).not.toContain('CLAIMED');
  });
});
