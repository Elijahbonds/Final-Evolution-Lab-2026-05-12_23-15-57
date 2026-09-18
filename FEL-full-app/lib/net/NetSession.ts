// FEL NETPLAY — session glue (2026-09-12).
//
// Ties transport + clock + buffers to the game's own seam. A mode does not learn about the
// network: it keeps building PlayerSlots, and a networked opponent is simply a slot whose
// ControlSource is a NetworkInputSource this session feeds.
//
// ROLES. The authority runs the simulation and publishes snapshots. Everyone else sends input and
// renders what comes back. That asymmetry is the whole design — see protocol.ts for why lockstep
// was rejected (Havok is not float-identical across browsers).
//
// LATENCY, STATED PLAINLY. In this first form a non-authority client has NO local prediction: its
// own body moves when the snapshot carrying its input returns, so it feels its own latency
// (roughly RTT + RENDER_DELAY_MS). That is honest and correct, and it is the thing prediction +
// reconciliation fixes next. It is not claimed to be finished.

import {
  TICK_MS, RENDER_DELAY_MS, packIntent,
  type BodyState, type Intent, type NetMsg, type SnapshotMsg, type Transport, type PeerId,
} from './protocol';
import { ClockSync, SnapshotBuffer, InputQueue } from './NetClock';

export interface NetSessionOptions {
  transport: Transport;
  selfId: PeerId;
  /** True while this peer owns the simulation. Flipped by the server on handover. */
  isAuthority: boolean;
  /** Wall clock; injectable so tests do not need timers. */
  now?: () => number;
}

/** What a mode gives the session each tick when it holds authority. */
export type SnapshotSource = () => BodyState[];

export class NetSession {
  private clock = new ClockSync();
  private snaps = new SnapshotBuffer();
  /** One queue per remote peer, so a slow peer cannot stall anyone else. */
  private inputs = new Map<PeerId, InputQueue>();
  private remoteIntent = new Map<PeerId, Intent>();
  private now: () => number;
  private startedAt: number;
  private lastSentTick = -1;
  private _peers = new Set<PeerId>();

  isAuthority: boolean;

  constructor(private opts: NetSessionOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.isAuthority = opts.isAuthority;
    opts.transport.onMessage((m) => this.receive(m));
  }

  get peers(): PeerId[] { return [...this._peers]; }
  get offsetMs(): number { return this.clock.offsetMs; }
  get jitterMs(): number { return this.clock.jitterMs; }
  /** Snapshot ticks buffered — a lobby/HUD can show this as connection health. */
  get buffered(): number { return this.snaps.size; }

  /** The tick this peer is simulating right now. */
  tickNow(): number { return Math.floor((this.now() - this.startedAt) / TICK_MS); }

  private receive(m: NetMsg): void {
    if (m.t === 'bye') { this._peers.delete(m.from); this.inputs.delete(m.from); this.remoteIntent.delete(m.from); return; }
    if (m.from && m.from !== this.opts.selfId) this._peers.add(m.from);
    if ('sent' in m && typeof m.sent === 'number') this.clock.sample(m.sent, this.now());

    if (m.t === 'input') {
      // Only the authority simulates from raw input; everyone else ignores it and waits for the
      // snapshot, so two peers can never disagree about what an input meant.
      if (!this.isAuthority) return;
      let q = this.inputs.get(m.from);
      if (!q) { q = new InputQueue(); this.inputs.set(m.from, q); }
      q.push(m.tick, m.intent);
      return;
    }
    if (m.t === 'snap') {
      if (this.isAuthority) return;   // authority never applies someone else's world
      this.snaps.push(m);
    }
  }

  /** Call once per rendered frame with the local player's intent. Sends at most one frame per tick. */
  sendLocalIntent(intent: Intent): void {
    const tick = this.tickNow();
    if (tick === this.lastSentTick) return;    // the sim runs at TICK_HZ, not at the render rate
    this.lastSentTick = tick;
    this.opts.transport.send({ t: 'input', from: this.opts.selfId, tick, intent: packIntent(intent), sent: this.now() });
  }

  /**
   * The intent to drive a remote peer's slot with, on the authority.
   * Repeats the last input on loss — see InputQueue for why neutral would be worse.
   */
  intentFor(peer: PeerId): Intent | null {
    if (!this.isAuthority) return this.remoteIntent.get(peer) ?? null;
    const q = this.inputs.get(peer);
    if (!q) return null;
    const { intent } = q.take(this.tickNow());
    if (intent) this.remoteIntent.set(peer, intent);
    return intent;
  }

  /** Authority only: publish the world. Cheap enough to call every tick. */
  publish(bodies: SnapshotSource, score?: Record<string, number>): void {
    if (!this.isAuthority) return;
    const tick = this.tickNow();
    if (tick === this.lastSentTick) return;
    this.lastSentTick = tick;
    const ack: Record<PeerId, number> = {};
    for (const [peer, q] of this.inputs) ack[peer] = q.depth(tick);
    this.opts.transport.send({ t: 'snap', from: this.opts.selfId, tick, sent: this.now(), bodies: bodies(), ack, score });
  }

  /**
   * Non-authority only: where every body should be drawn this frame.
   * Empty until snapshots arrive, so a caller must keep its own last pose rather than
   * snapping a body to the origin.
   */
  renderBodies(): BodyState[] {
    if (this.isAuthority) return [];
    const newest = this.snaps.newestTick;
    if (newest < 0) return [];
    return this.snaps.sample(this.snaps.renderTickFor(newest));
  }

  /** Server told us authority moved. A promoted peer starts simulating from what it last saw. */
  setAuthority(isAuthority: boolean): void {
    if (isAuthority === this.isAuthority) return;
    this.isAuthority = isAuthority;
    this.lastSentTick = -1;
  }

  dispose(): void {
    this.opts.transport.send({ t: 'bye', from: this.opts.selfId });
    this.opts.transport.close();
  }
}

/** Render delay in ticks, for callers that want to show it. */
export const RENDER_DELAY_TICKS = RENDER_DELAY_MS / TICK_MS;
