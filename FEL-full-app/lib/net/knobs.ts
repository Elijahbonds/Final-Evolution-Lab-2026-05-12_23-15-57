// FEL NETPLAY — the shared-play numbers (lane/online-play, 2026-11-21).
//
// Each is a feel knob (lib/feel-panel/knobs.ts, group "Online play"; docs/FEEL-PANEL.md). NOTE: the feel panel's session gate
// keeps overrides OFF in every online and party run (lib/feel-panel/sessionGate.ts), so in a real online game these read their
// defaults; the knob is the record of the number and the switch that restores the old behaviour, set in code.
import { feel } from '../feel-panel/feel';

/** 1 = one shared game on every page (the simulating page publishes the world, the others draw it). 0 = the old behaviour
 *  exactly: every `?net=` page runs its own game and the other human is a pair of feet in it. */
export const NET_MIRROR_ON = 1;
/** How far behind the newest world a page draws, ms. 0 = adaptive (two ticks plus the measured jitter, 66–250 ms). */
export const NET_RENDER_DELAY_MS = 0;
/** Skeleton pose updates per second in the shared world (roots and the ball always go at the 30 Hz tick). */
export const NET_POSE_HZ = 15;
/** 1v1: 1 = the page whose player has the ball runs the game (both humans play offence with every move); 0 = the room's host
 *  runs every possession and the guest only defends (the AI rival attacks the host). */
export const NET_POSSESSION_SWAP = 1;

/** lane/improve-hoops-2 phase 10 (docs/IMPROVE-10-PHASE-AUDIT.md): 3v3 — 1 = a remote human's body takes its passes and shots from
 *  that human's own buttons (the AI still plays an empty or dropped seat); 0 = the AI brain decides them, as before.
 *  Shipped 0: the two-page browser check could not show it (scripts/probes/improve-hoops/remote3v3.mjs; docs/FEEL-PANEL.md). */
export const NET_REMOTE_OFFENCE = 0;

export const netMirrorOn = (): boolean => feel('net.mirrorOn', NET_MIRROR_ON) >= 0.5;
export const netRenderDelayMs = (): number => feel('net.renderDelayMs', NET_RENDER_DELAY_MS);
export const netPoseHz = (): number => feel('net.poseHz', NET_POSE_HZ);
export const netPossessionSwap = (): boolean => feel('net.possessionSwap', NET_POSSESSION_SWAP) >= 0.5;
export const netRemoteOffence = (): boolean => feel('net.remoteOffence', NET_REMOTE_OFFENCE) >= 0.5;
