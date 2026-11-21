// FEL NETPLAY — wire protocol (2026-09-12).
//
// WHY HOST-AUTHORITATIVE, NOT LOCKSTEP. Lockstep needs a deterministic simulation, and this game
// runs Havok: float-identical results across two browsers are not something we can promise. So one
// peer owns the simulation, clients send INPUT, the host sends SNAPSHOTS, and clients interpolate
// what they receive. Nothing here assumes a dedicated server — the host is simply whichever peer
// holds authority, which keeps this deployable on Firebase Hosting, where no socket can live.
//
// The dead lib/babylon/network/NetworkManager.ts modelled input as {moveX,moveY,jump,attack,
// interact}. This game's input is `Intent` (PlayerSlot.ts): ten fields including actionHeld for the
// shot meter, brace, contest and glass. A protocol that cannot carry actionHeld cannot carry a shot,
// which is most of why that layer was never wired to anything.

import type { Intent } from '../babylon/core/PlayerSlot';

/** Re-exported so the net layer is a single import surface for consumers. */
export type { Intent };

export const PROTOCOL_VERSION = 1;

/** Fixed simulation rate. Inputs and snapshots are stamped in ticks, never in frames. */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

/** How far behind the newest snapshot a client renders remote bodies, to absorb jitter. */
export const RENDER_DELAY_MS = 100;

/** A peer is dropped after this long without any message. */
export const PEER_TIMEOUT_MS = 5000;

export type PeerId = string;

export interface HelloMsg {
  t: 'hello';
  v: number;
  from: PeerId;
  /** Sender's wall clock when sent — used for offset estimation. */
  sent: number;
}

/** Client -> host. One tick's input. */
export interface InputMsg {
  t: 'input';
  from: PeerId;
  tick: number;
  intent: Intent;
  sent: number;
}

/** One body's transform + animation state at a tick. */
export interface BodyState {
  id: string;
  x: number; y: number; z: number;
  yaw: number;
  /** Horizontal speed, so a client can keep a blend tree alive between snapshots. */
  speed: number;
  clip?: string;
}

/** Host -> clients. Authoritative world at a tick. */
export interface SnapshotMsg {
  t: 'snap';
  from: PeerId;
  tick: number;
  sent: number;
  bodies: BodyState[];
  /** Last input tick the host consumed from each peer, so clients can measure their own lag. */
  ack: Record<PeerId, number>;
  score?: Record<string, number>;
}

export interface ByeMsg { t: 'bye'; from: PeerId }

// ── SHARED PLAY (lane/online-play, 2026-11-21) ──────────────────────────────────────────────────────────────────────
//
// Until this lane no mode ever called publish(): every `?net=` page ran its OWN game, and the other human was at best a
// pair of feet in it. These messages put ONE game on every page. They are CLIENT-ONLY: netd relays any frame it is given
// (index.ts `broadcast(r, { ...msg, from, serverTime, ack })`, the same in the build deployed today), so none of this
// needs a netd redeploy. Each is ignored by an older page (isNetMsg), which simply keeps its own game.

/** One body as drawn: root position (mm), root yaw or quaternion, and the skeleton's pose (quantised). */
export interface WireBody {
  /** Root position, millimetres. */
  p: [number, number, number];
  /** Root yaw (milliradians) when the root turns by Euler y; absent when `q` is sent. */
  y?: number;
  /** Root rotation quaternion ×10000, when the root carries one. */
  q?: [number, number, number, number];
  /** Every pose node's rotation ×10000 (x, y, z, w per node), in poseNodesOf order; then the first node's position (mm). */
  pose?: number[];
}

/** The simulating page → everyone: the world as drawn this tick (the mirror's snapshot). */
export interface WorldMsg {
  t: 'world';
  from: PeerId;
  tick: number;
  sent: number;
  bodies: WireBody[];
  /** Loose meshes (the ball): world position, mm. */
  loose: [number, number, number][];
  /** Who drives which body (an index into `bodies`), so a page can find ITS body. */
  seats: Record<PeerId, number>;
  /** Each body's team, 0 = the simulating page's own team. */
  teams: number[];
  /** Which hand-over this world belongs to: every hand-over and take-over is the next number. Two pages running at once (a
   *  hand-over crossed a take-over, a backgrounded runner came back) settle on the higher one. */
  epoch?: number;
}

/** The simulating page's HUD writes, as written (a page flips "score"/"foeScore" and YOUR/THEIR by its own side). */
export interface HudMsg { t: 'hud'; from: PeerId; sent: number; hud: Record<string, unknown> }

/** 1v1: "your ball" — the simulating page hands the game to the page whose player now has the ball, with the score. */
export interface PossMsg { t: 'poss'; from: PeerId; to: PeerId; sent: number; seq: number; score: Record<PeerId, number>; epoch?: number; banner?: string }

/** The game ended on the simulating page: the result every page shows. `team` 0 = the sender's team. */
export interface EndMsg { t: 'end'; from: PeerId; sent: number; outcome: string; score: Record<PeerId, number>; teamScore: [number, number]; team: Record<PeerId, number> }

export type PlayMsg = WorldMsg | HudMsg | PossMsg | EndMsg;

export type NetMsg = HelloMsg | InputMsg | SnapshotMsg | ByeMsg | PlayMsg;

/** A transport is anything that can move a NetMsg between peers. Supabase Realtime, a WebSocket,
 *  a BroadcastChannel in a test — the netcode never knows which. */
export interface Transport {
  send(msg: NetMsg): void;
  onMessage(handler: (msg: NetMsg) => void): void;
  close(): void;
}

/** Intent carries booleans and small floats; rounding the axes keeps a 30 Hz stream small without
 *  changing what the game reads (the deadzone curve already quantises far more coarsely). */
export function packIntent(i: Intent): Intent {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { ...i, moveX: r2(i.moveX), moveY: r2(i.moveY), actionHeld: r2(i.actionHeld) };
}

export function isNetMsg(x: unknown): x is NetMsg {
  if (!x || typeof x !== 'object') return false;
  const t = (x as { t?: unknown }).t;
  return t === 'hello' || t === 'input' || t === 'snap' || t === 'bye' || isPlayMsg(x);
}

export function isPlayMsg(x: unknown): x is PlayMsg {
  if (!x || typeof x !== 'object') return false;
  const t = (x as { t?: unknown }).t;
  return t === 'world' || t === 'hud' || t === 'poss' || t === 'end';
}
