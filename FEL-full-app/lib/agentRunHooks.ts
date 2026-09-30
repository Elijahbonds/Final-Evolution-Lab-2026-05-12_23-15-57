/**
 * lib/agentRunHooks.ts — ECONOMY-CAPS CYBER (k): one gate for every dev/debug hook publisher.
 * Hooks publish only when the server marked the current run as an agent run (agentRunHooksAllowed()),
 * or under next dev (NODE_ENV !== 'production').
 */

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
