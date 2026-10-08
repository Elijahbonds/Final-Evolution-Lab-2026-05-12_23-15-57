// HostSession — the TV/big-screen side.
//
// Owns the room, accepts however many phones the mode allows, keeps the lobby
// in sync, and hands every inbound ControlEvent to a single sink. It knows
// nothing about Babylon, Three, or any mode's rules: the sink is supplied by
// whoever mounts it (see modeBridge.ts for the Babylon adapter).

import { PeerLink } from './transport/webrtc';
import { createRoom, pollSignals, postSignal } from './transport/signaling';
import { getOrCreatePeerId, joinUrl } from './codes';
import type { ControlEvent, LinkMessage, LinkState, LobbyPeer, ModeControllerConfig, PeerId, RoomState } from './types';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { HostInput, type LinkStats } from './hostInput';
import { parseRoomState, roomStateOptIn, sameRoomState } from './roomState';
import { cleanPlayerName } from '@/lib/party/playerName';

/**
 * MULTIPLAYER (2026-10-06): a phone's name as the TV will show it. The phone is not trusted — a modified page can say
 * anything — so the host cleans every name it is told (lib/party/playerName.ts: the jersey plate rule) and falls back
 * to PLAYER when nothing survives.
 */
export function hostPlayerName(raw: unknown): string {
  return cleanPlayerName(raw) || 'PLAYER';
}

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
  /**
   * MULTIPLAYER (2026-10-06): a party command from a phone (lib/party/protocol.ts — ready, pick, start, leave). Raw: the
   * party room parses and checks it. A host that passes nothing never hears one, and no other message reaches here.
   */
  onPartyCmd?: (cmd: string, peerId: PeerId) => void;
  /**
   * MULTIPLAYER: a phone's link came up (each channel that opens, and every reconnect). The party room re-sends that
   * phone its view here: a sender that only watched the lobby could miss a drop-and-return folded into one render.
   */
  onPeerUp?: (peerId: PeerId) => void;
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
  /** MUSIC-SUITE P6 phone-replay: the last room state sent (re-sent to a phone whose link comes up). Null = never sent. */
  private roomState: RoomState | null = null;

  constructor(opts: HostSessionOpts) { this.opts = opts; }

  /**
   * MUSIC-SUITE P6 phone-replay (2026-09-26): send the room's live state to every connected phone (roomState.ts). OPT-IN:
   * refused (false) for a config without `roomState: true`, so no other mode ever puts a 'state' on the wire. Bounded by
   * parseRoomState; an unchanged state is not re-sent. Kept, so a phone that joins or reconnects later is sent it too.
   */
  sendState(state: RoomState): boolean {
    if (this.disposed || !roomStateOptIn(this.opts.config)) return false;
    const s = parseRoomState(state);
    if (!s || sameRoomState(this.roomState, s)) return false;
    this.roomState = s;
    for (const p of this.peers.values()) if (p.connected) p.link.sendSafe({ type: 'state', state: s });
    return true;
  }

  get joinUrl(): string { return joinUrl(this.code); }

  /** The config the room is running now (setConfig may have swapped it). */
  get config(): ModeControllerConfig { return this.opts.config; }

  /**
   * MULTIPLAYER (2026-10-06): ONE ROOM ACROSS GAMES. Swap the layout every phone shows — the party room picks a new game
   * and nobody scans again. Each connected phone is sent the new lobby (its page re-renders the schema it carries); a
   * phone that connects later gets it too, because the lobby always carries the current config. Seats are untouched.
   */
  setConfig(config: ModeControllerConfig): void {
    if (this.disposed) return;
    this.opts.config = config;
    for (const p of this.peers.values()) if (p.connected) p.link.sendSafe(this.lobbyMessage());
    this.emitLobby();
  }

  /**
   * MULTIPLAYER: one control message to one phone (the party room's per-phone view). False when it did not go — the
   * phone is not connected, or its reliable channel is not open yet (PeerLink.sendSafe) — so the caller sends it again.
   */
  sendTo(peerId: PeerId, msg: LinkMessage): boolean {
    const p = this.peers.get(peerId);
    if (this.disposed || !p || !p.connected) return false;
    return p.link.sendSafe(msg) !== false;
  }

  /** MULTIPLAYER: a phone's ready light (the party lobby). Unknown peer: nothing. */
  setReady(peerId: PeerId, ready: boolean): void {
    const p = this.peers.get(peerId);
    if (!p || p.ready === ready) return;
    p.ready = ready;
    this.emitLobby();
  }

  /**
   * MULTIPLAYER: a phone LEFT (it said so, or the TV removed a player who never came back). Its link closes, its slot
   * lets go of anything it held and is free for the next phone. If it scans again it is simply a new arrival.
   */
  drop(peerId: PeerId): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    this.releaseSlot(p.slot);
    p.link.close();
    this.peers.delete(peerId);
    this.emitLobby();
  }

  /**
   * The lobby as a PHONE is sent it. MULTIPLAYER: without the peer ids — a phone needs names and seats, and another
   * phone's id is the handle a stranger in the room could use to take that phone's seat on a reconnect.
   */
  private lobbyMessage(): LinkMessage {
    return { type: 'lobby', peers: this.lobby().map((p) => ({ ...p, peerId: '' })), config: this.opts.config };
  }

  async start(): Promise<string> {
    this.code = await createRoom(this.opts.config.modeId, this.hostId);
    // MUSIC-SUITE P10 (2026-09-29): DISPOSED WHILE THE ROOM WAS BEING MADE. dispose() stops the poll and the ping — but a
    // session disposed during this await had neither yet, so it started both AFTER its dispose and nothing ever stopped
    // them: a mailbox poll every POLL_MS (250 ms) for the life of the page. Measured live on :3121
    // (scripts/probes/_music-p10-phone-dispose.mts): after leaving the Academy with a phone paired, the page went on
    // polling `/api/controller-link/signal?code=<a room no phone ever joined>&after=0` ~5 times a second — the session
    // React's dev double-mount made and threw away mid-createRoom; in production the same race is any lobby unmounted
    // inside the room POST (leaving PERFORM, closing the badge, a REPLAY remount). A disposed session keeps its code
    // (the caller's `disposed` guard already ignores it) and starts nothing. hostDispose.test.ts replays it.
    if (this.disposed) return this.code;
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
      await this.offerTo(m.from, hostPlayerName((data.hello as { name?: unknown }).name));
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
          p.link.sendSafe(this.lobbyMessage());
          if (p.slot !== null) p.link.sendSafe({ type: 'assign', slot: p.slot });
          // MUSIC-SUITE P6 phone-replay: …and the room as it is now (only an opted-in config ever has one — sendState)
          if (this.roomState) p.link.sendSafe({ type: 'state', state: this.roomState });
        }
        this.emitLobby();
        if (s === 'connected') this.opts.onPeerUp?.(peerId);
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
          p.name = hostPlayerName(msg.name);
          this.emitLobby();
        } else if (msg.type === 'party-cmd') {
          this.opts.onPartyCmd?.(String(msg.cmd), peerId);
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
