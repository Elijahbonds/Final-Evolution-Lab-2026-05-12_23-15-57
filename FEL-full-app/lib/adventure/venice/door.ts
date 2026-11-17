/**
 * VENICE V1: the Play screen's Venice door (owner 2026-11-17: "its own Venice door on Play, every game still one tap on the
 * shelf"). ON by default — the owner chose the door. VENICE_HUB_DOOR=0 hides it (the page stays reachable by its URL).
 * Server-side: the Play page reads it at request time.
 */
export const VENICE_DOOR_HREF = '/play/venice';
export function veniceDoorOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.VENICE_HUB_DOOR !== '0';
}
