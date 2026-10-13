// lib/party/social/activity.ts — "Playing Downtown": what a member's page is doing, for everyone's member list
// (PARTY-CHAT lane, 2026-10-13). Pure. From the mounted game (sessionStore's modeId) or the page, never more than that.
import { PARTY_MODES } from '@/lib/party/catalog';
import { ONLINE_MODES } from '@/server/netd/src/partyRules';

const titleCase = (id: string): string => id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** The line, or null in the menus. `modeId` is the mounted game; `path` the page. */
export function activityLine(modeId: string | null, path: string): string | null {
  if (modeId) {
    const t = PARTY_MODES.find((m) => m.id === modeId || m.infoKey === modeId)?.title
      ?? ONLINE_MODES.find((m) => m.id === modeId)?.title
      ?? titleCase(modeId);
    return `Playing ${t}`.slice(0, 40);
  }
  if (path.startsWith('/play/')) return 'Picking a game';
  return null;
}
