/**
 * lib/agentRunHooks.ts — ECONOMY-CAPS CYBER (k): one gate for every dev/debug hook publisher.
 * Hooks publish only when the server marked the current run as an agent run (agentRunHooksAllowed()),
 * or under next dev (NODE_ENV !== 'production').
 */

import { isLoopbackHost } from '@/lib/pose/feed';

let allowed = false;
type HookSync = () => void;
const syncOn: HookSync[] = [];
const syncOff: HookSync[] = [];

/** Production-only: install or remove window hooks when the server marker flips. */
export function registerProdHookSync(on: HookSync, off: HookSync): void {
  syncOn.push(on);
  syncOff.push(off);
}

/** Set from the /api/sessions/start answer when agentRun is true. Cleared when a new run starts. */
export function setAgentRunHooksAllowed(v: boolean): void {
  const prev = allowed;
  allowed = v;
  if (process.env.NODE_ENV === 'production' && prev !== v) {
    // SECURITY (ECONOMY-CAPS review, hook gate): the flip-on path must clear the same bar as the module-load
    // path. The installers carry no hostname check of their own, so without this an `?agent=1` run on the
    // DEPLOYED domain would arm __FEL_POSE_FEED__ / __FEL_BODY__ / __FEL_SPACE__ — the scripted-frame handles
    // feed.ts scopes as "never on the deployed site". Prod honours the marker only on loopback, exactly as
    // feedHookAllowed does at load. syncOff always runs (tearing down is never gated).
    if (v && !isLoopbackHost(typeof window !== 'undefined' ? window.location.hostname : '')) return;
    for (const fn of v ? syncOn : syncOff) fn();
  }
}

export function agentRunHooksAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return allowed;
}

/** Whether a hook may be published at all (dev always; prod only behind the server marker). */
export function devOrAgentHooks(): boolean {
  return agentRunHooksAllowed();
}
