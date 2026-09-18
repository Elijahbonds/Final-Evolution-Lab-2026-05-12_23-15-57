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

export type NetMsg = HelloMsg | InputMsg | SnapshotMsg | ByeMsg;

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
  return t === 'hello' || t === 'input' || t === 'snap' || t === 'bye';
}
