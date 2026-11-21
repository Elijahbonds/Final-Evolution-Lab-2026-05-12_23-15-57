// lib/party/social/startable.ts — the games "Start together" offers (lane/online-play, 2026-11-21).
//
// ONLINE_MODES (server/netd/src/partyRules.ts) is what netd will START; this is what the host is OFFERED. They differ by one: Karate
// Endless co-op. Measured on this lane (docs/ONLINE-FINISH-PLAN.md), every `?net=` page ran its own game; 1v1 and 3v3 now share
// one (lib/net/play.ts), but the horde is not mirrored, so a karate partner still plays a different fight on each page. Until it is,
// it is not offered (`net.karateTogether` 0); 1 offers it as before. netd still accepts it (an older page may ask), so nothing
// about the server changes.
import { ONLINE_MODES, type OnlineMode } from '@/server/netd/src/partyRules';
import { feel } from '@/lib/feel-panel/feel';

/** 0 = Karate co-op is not offered by "Start together" (its two pages are two fights). 1 = offered, as before this lane. */
export const NET_KARATE_TOGETHER = 0;

export function startableModes(): readonly OnlineMode[] {
  const karate = feel('net.karateTogether', NET_KARATE_TOGETHER) >= 0.5;
  return ONLINE_MODES.filter((m) => m.id !== 'karate' || karate);
}
