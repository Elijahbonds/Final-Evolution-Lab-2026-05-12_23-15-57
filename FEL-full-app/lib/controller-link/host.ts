// HostSession — the TV/big-screen side.
//
// Owns the room, accepts however many phones the mode allows, keeps the lobby
// in sync, and hands every inbound ControlEvent to a single sink. It knows
// nothing about Babylon, Three, or any mode's rules: the sink is supplied by
// whoever mounts it (see modeBridge.ts for the Babylon adapter).

import { PeerLink } from './transport/webrtc';
import { createRoom, pollSignals, postSignal } from './transport/signaling';
import { getOrCreatePeerId, joinUrl } from './codes';
import type { ControlEvent, LinkState, LobbyPeer, ModeControllerConfig, PeerId } from './types';

export interface HostSessionOpts {
  config: ModeControllerConfig;
  /** Every input from every phone lands here, tagged with its slot. */
  onInput: (ev: ControlEvent, slot: number, peerId: PeerId) => void;
  onLobby?: (peers: LobbyPeer[]) => void;
  onState?: (state: LinkState) => void;
}

interface HostPeer {
  peerId: PeerId;
  name: string;
  slot: number | null;
  ready: boolean;
  rttMs: number | null;
  link: PeerLink;
  connected: boolean;
}

/** How often the host pings each phone to keep a live latency readout. */
const PING_MS = 1000;

export class HostSession {
  /** Room-scoped creator id, recorded server-side when the room is made. */
  readonly hostId = getOrCreatePeerId();
  /**
   * The host's MAILBOX address inside a room is the literal 'host', not hostId.
   * A joining phone has no way to learn a random hostId before it has talked to
   * anyone, so it addresses its first hello to a well-known name. Host and
   * client must therefore agree on that name for every hop of the handshake,
   * not just the first — polling one address while replying from another is
   * exactly what left the lobby stuck on "signaling" with 0 players.
   */
  private readonly addr = 'host';
  code = '';
  private opts: HostSessionOpts;
  private peers = new Map<PeerId, HostPeer>();
  private stopPoll: (() => void) | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(opts: HostSessionOpts) { this.opts = opts; }

  get joinUrl(): string { return joinUrl(this.code); }

  async start(): Promise<string> {
    this.code = await createRoom(this.opts.config.modeId, this.hostId);
    this.opts.onState?.('signaling');

    this.stopPoll = pollSignals(this.code, this.addr, (m) => void this.onSignal(m));

    this.pingTimer = setInterval(() => {
      const now = Date.now();
      for (const p of this.peers.values()) {
        if (p.connected) p.link.sendFast({ type: 'ping', t: now });
      }
    }, PING_MS);

    return this.code;
  }

  private async onSignal(m: { from: string; data: unknown }): Promise<void> {
    if (this.disposed) return;
    const data = m.data as Record<string, unknown>;
    const existing = this.peers.get(m.from);

    // A phone announcing itself (or re-announcing after a drop) triggers a fresh
    // offer. Rebuilding the PeerLink is deliberate: a PeerConnection that has
    // reached 'failed' cannot be revived, so reconnect means a new one.
    if (data.hello) {
      if (this.peers.size >= this.opts.config.maxPlayers && !existing) return;
      existing?.link.close();
      await this.offerTo(m.from, String((data.hello as { name?: string }).name ?? 'Player'));
      return;
    }

    if (!existing) return;
    if (data.answer) await existing.link.acceptAnswer(data.answer as RTCSessionDescriptionInit);
    if (data.candidate) await existing.link.addCandidate(data.candidate as RTCIceCandidateInit);
  }

  private async offerTo(peerId: PeerId, name: string): Promise<void> {
    const prior = this.peers.get(peerId);
    const link = new PeerLink({
      sendSignal: (data) => void postSignal(this.code, this.addr, peerId, data),
      onState: (s) => {
        const p = this.peers.get(peerId);
        if (!p) return;
        p.connected = s === 'connected';
        if (s === 'connected') {
          // Re-send the lobby so a reconnected phone re-renders the right UI.
          p.link.sendSafe({ type: 'lobby', peers: this.lobby(), config: this.opts.config });
          if (p.slot !== null) p.link.sendSafe({ type: 'assign', slot: p.slot });
        }
        this.emitLobby();
      },
      onMessage: (msg) => {
        const p = this.peers.get(peerId);
        if (!p) return;
        if (msg.type === 'input') {
          // Slot 0 is the sane default for solo modes so a mode never has to
          // special-case "input arrived before the lobby assigned a slot".
          this.opts.onInput(msg.ev, p.slot ?? 0, peerId);
        } else if (msg.type === 'pong') {
          p.rttMs = Date.now() - msg.t;
          this.emitLobby();
        } else if (msg.type === 'hello') {
          p.name = msg.name;
          this.emitLobby();
        }
      },
    });

    this.peers.set(peerId, {
      peerId, name,
      // Keep the slot across a reconnect — that is the whole reason peer ids
      // are persisted on the phone.
      slot: prior?.slot ?? this.nextFreeSlot(),
      ready: prior?.ready ?? false,
      rttMs: null, link, connected: false,
    });

    const offer = await link.createOffer();
    await postSignal(this.code, this.addr, peerId, { offer });
    this.emitLobby();
  }

  private nextFreeSlot(): number {
    const taken = new Set([...this.peers.values()].map((p) => p.slot));
    for (let i = 0; i < this.opts.config.maxPlayers; i++) if (!taken.has(i)) return i;
    return 0;
  }

  lobby(): LobbyPeer[] {
    return [...this.peers.values()].map((p) => ({
      peerId: p.peerId, name: p.name, slot: p.slot,
      ready: p.ready, rttMs: p.rttMs, connected: p.connected,
    }));
  }

  private emitLobby(): void { this.opts.onLobby?.(this.lobby()); }

  dispose(): void {
    this.disposed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.stopPoll?.();
    for (const p of this.peers.values()) p.link.close();
    this.peers.clear();
  }
}
