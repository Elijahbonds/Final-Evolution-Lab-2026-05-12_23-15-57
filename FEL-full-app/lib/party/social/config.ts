// lib/party/social/config.ts — where the party server is (PARTY-CHAT lane, 2026-10-13).
//
// The party rides fel-netd (server/netd), the same Cloud Run service `?net=` matches use, on its `/party` path. With
// NEXT_PUBLIC_NETD_URL unset there is no party server: the party UI says so on /party and draws nothing anywhere else,
// and the rest of the app is untouched.

/** wss://host/party from NEXT_PUBLIC_NETD_URL (ws/wss, or http/https mapped to ws/wss), or null when unset/invalid. */
export function partySocketUrl(raw: string | undefined = process.env.NEXT_PUBLIC_NETD_URL): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'http:') u.protocol = 'ws:';
    else if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    u.pathname = '/party';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** The invite link for a party code (what the QR encodes and "Copy link" copies). */
export function partyInviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/party/${code}`;
}
