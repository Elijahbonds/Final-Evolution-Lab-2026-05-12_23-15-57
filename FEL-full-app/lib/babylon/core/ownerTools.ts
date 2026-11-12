// ownerTools — may THIS user open the owner's in-game tools (the perf readout, the WebGPU trial)? (device-perf, owner 2026-11-12)
//
// The same gate as the feel panel, and the same server answer: GET /api/feel-panel says { enabled: true } only when the server
// flag FEEL_PANEL_ENABLED is on AND the signed-in user is on FEEL_PANEL_USERS or is an admin (requireAdmin). docs/FEEL-PANEL.md.
// On /play the feel panel has usually asked already (lib/feel-panel/feel.ts holds the answer); anywhere else this asks once per
// page, and only when something owner-only was actually requested (?engine=webgpu): a normal player's page never calls it.
import { getFeelState } from '@/lib/feel-panel/feel';

/** How long the engine waits for the answer before it takes the default (WebGL). */
export const OWNER_TOOLS_WAIT_MS = 4000;

let asked: Promise<boolean> | null = null;

/** True when the server opened the owner tools for this user. Never throws; a slow or failed answer is "no". */
export function ownerToolsAllowed(waitMs: number = OWNER_TOOLS_WAIT_MS): Promise<boolean> {
  if (getFeelState().userAllowed) return Promise.resolve(true);
  if (typeof fetch !== 'function') return Promise.resolve(false);
  asked ??= Promise.race<boolean>([
    fetch('/api/feel-panel', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { enabled?: unknown } | null) => j?.enabled === true)
      .catch(() => false),
    new Promise<boolean>((res) => setTimeout(() => res(false), waitMs)),
  ]).then((ok) => { if (!ok) asked = null; return ok; });   // a "no" is asked again next time (the session may have changed)
  return asked;
}

/** Tests only. */
export function _resetOwnerTools(): void { asked = null; }
