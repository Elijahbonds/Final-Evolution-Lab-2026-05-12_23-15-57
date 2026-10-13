// lib/party/social/iceServers.ts — where party voice finds its way through (PARTY-CHAT lane, 2026-10-13).
//
// Peer-to-peer first (STUN), RELAY-READY: with PARTY_TURN_URLS and PARTY_TURN_SECRET set, a TURN relay is added for
// networks where peer-to-peer cannot connect (strict NATs, some school and office Wi-Fi, some phone carriers). Same
// shape as the coach call's slot (lib/coach-store/call/iceServers.ts), with one difference: the browser never sees
// the TURN secret. It gets a short-lived username/credential pair in the standard TURN REST form (coturn
// `use-auth-secret` / `static-auth-secret`): username = "<expiry>:fel", credential = base64(HMAC-SHA1(secret, username)).
// Server-only: imported by /api/party/ticket.
import { createHmac } from 'node:crypto';
import type { IceServer } from '@/lib/coach-store/call/iceServers';

const STUN: IceServer = { urls: ['stun:stun.l.google.com:19302'] };
/** A relay credential outlives a long party session, and no more. */
export const TURN_CREDENTIAL_TTL_S = 6 * 60 * 60;

export function partyIceServers(env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): IceServer[] {
  const servers: IceServer[] = [STUN];
  const urls = (env.PARTY_TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const secret = (env.PARTY_TURN_SECRET ?? '').trim();
  if (urls.length && secret) {
    const username = `${Math.floor(nowMs / 1000) + TURN_CREDENTIAL_TTL_S}:fel`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    servers.push({ urls, username, credential });
  }
  return servers;
}
