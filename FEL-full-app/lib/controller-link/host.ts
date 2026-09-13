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
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { HostInput, type LinkStats } from './hostInput';

export interface HostSessionOpts {
  config: ModeControllerConfig;
  /** Every input from every phone lands here, tagged with its slot. */
  onInput: (ev: ControlEvent, slot: number, peerId: PeerId) => void;
  onLobby?: (peers: LobbyPeer[]) => void;
  onState?: (state: LinkState) => void;
  /**
   * Phase B: canonical FelInput decoded from a BINARY frame, tagged with its slot.
   *
   * Separate from onInput because they are two different protocols living on one session. onInput is the
   * schema layer — a phone's on-screen buttons emitting a mode's own vocabulary ('shoot', 'pad_3'). This is
   * the pad relay: a controller attached to the phone, forwarded as canonical actions at 60 Hz. A mode can
   * consume either or both; 3PT consumes both, which is what makes "touch-only, keyboard, local gamepad and
   * remote PAD relay" four paths into one game rather than four games.
   */
  onPadInput?: (e: FelInput, slot: number, peerId: PeerId) => void;
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
  /**
   * The binary pad relay's decoder, shared across peers.
   *
   * One per session rather than one per peer because the SLOT is on the wire: a frame says which player it
   * is, so a single gate can order four pads independently and the stats read as one link rather than four.
   */
  private padInput = new HostInput({
    emit: (slot, e) => {
      const peer = [...this.peers.values()].find((p) => p.slot === slot);
      this.opts.onPadInput?.(e, slot, peer?.peerId ?? '');
    },
  });
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
        // a link that drops must not leave its slot holding buttons down (see releaseSlot)
        if (s === 'failed' || s === 'reconnecting') this.releaseSlot(p.slot);
        if (s === 'connected') {
          // Re-send the lobby so a reconnected phone re-renders the right UI.
          p.link.sendSafe({ type: 'lobby', peers: this.lobby(), config: this.opts.config });
          if (p.slot !== null) p.link.sendSafe({ type: 'assign', slot: p.slot });
        }
        this.emitLobby();
      },
      // BINARY INPUT FRAMES (Phase B). Decoded, gated for order, and turned into the same FelInput a local
      // controller produces — so a mode cannot tell a remote pad from one plugged into the machine.
      onFrame: (data) => {
        const p = this.peers.get(peerId);
        if (!p || !this.opts.onPadInput) return;
        this.padInput.onMessage(data);
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

  /** What the debug overlay reads: frames, drops, jitter, and who is actually sending. */
  padStats(): LinkStats { return this.padInput.stats(); }

  /**
   * A peer has gone: let go of everything its slot was holding.
   *
   * Without this a phone that dies mid-press leaves the button latched down forever — the character sprints
   * into a wall until someone restarts the game. (hostInput.release also clears the sequence, so the same
   * phone rejoining from seq 1 is not judged against its old counter.)
   */
  private releaseSlot(slot: number | null): void {
    if (slot !== null) this.padInput.release(slot);
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
