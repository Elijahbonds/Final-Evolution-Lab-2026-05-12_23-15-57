// ControllerClient — the phone side.
//
// Joins a room by code, answers the host's offer, then streams ControlEvents
// over the unreliable channel. Reconnect is a re-announce: a PeerConnection
// that has failed cannot be revived, so the client throws it away and says
// hello again with the SAME persisted peerId, which the host uses to hand back
// the same player slot.

import { PeerLink } from './transport/webrtc';
import { pollSignals, postSignal, lookupRoom } from './transport/signaling';
import { getOrCreatePeerId } from './codes';
import type { ControlEvent, LinkState, ModeControllerConfig } from './types';

export interface ControllerClientOpts {
  code: string;
  name: string;
  onState: (s: LinkState) => void;
  onConfig: (c: ModeControllerConfig) => void;
  onSlot?: (slot: number) => void;
}

/** Backoff between reconnect attempts — quick at first, then easing off. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

export class ControllerClient {
  readonly peerId = getOrCreatePeerId();
  private opts: ControllerClientOpts;
  private link: PeerLink | null = null;
  private stopPoll: (() => void) | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private state: LinkState = 'idle';

  constructor(opts: ControllerClientOpts) { this.opts = opts; }

  async connect(): Promise<void> {
    if (this.disposed) return;
    this.setState('signaling');

    if (!(await lookupRoom(this.opts.code))) {
      this.setState('failed');
      return;
    }

    this.stopPoll?.();
    this.stopPoll = pollSignals(this.opts.code, this.peerId, (m) => void this.onSignal(m));

    await this.announce();
  }

  private async announce(): Promise<void> {
    await postSignal(
      this.opts.code, this.peerId, 'host',
      { hello: { name: this.opts.name } },
      { name: this.opts.name },
    );
    this.setState('connecting');
  }

  private async onSignal(m: { from: string; data: unknown }): Promise<void> {
    if (this.disposed) return;
    const data = m.data as Record<string, unknown>;

    if (data.offer) {
      // Any prior link is dead by definition if we are being offered a new one.
      this.link?.close();
      this.link = new PeerLink({
        sendSignal: (d) => void postSignal(this.opts.code, this.peerId, m.from, d),
        onState: (s) => {
          this.setState(s);
          if (s === 'connected') {
            this.retries = 0;
            this.link?.sendSafe({ type: 'hello', peerId: this.peerId, name: this.opts.name });
          }
          if (s === 'failed') this.scheduleRetry();
        },
        onMessage: (msg) => {
          if (msg.type === 'ping') this.link?.sendFast({ type: 'pong', t: msg.t });
          else if (msg.type === 'lobby') this.opts.onConfig(msg.config);
          else if (msg.type === 'assign') { this.slot = msg.slot; this.opts.onSlot?.(msg.slot); }
        },
      });
      const answer = await this.link.acceptOffer(data.offer as RTCSessionDescriptionInit);
      await postSignal(this.opts.code, this.peerId, m.from, { answer });
      return;
    }

    if (data.candidate) await this.link?.addCandidate(data.candidate as RTCIceCandidateInit);
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer) return;
    const wait = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries += 1;
    this.setState('reconnecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.announce();
    }, wait);
  }

  /** Send one input. Cheap enough to call at gesture rate. */
  send(action: string, payload?: unknown): void {
    const ev: ControlEvent = { a: action, p: payload, t: Date.now() };
    this.link?.sendFast({ type: 'input', ev });
  }

  /**
   * THE PAD RELAY (Phase B): stream canonical controller state as binary frames.
   *
   * Separate from send() because the two are different protocols with different costs. send() is the schema
   * layer — a discrete gesture ("shoot") carrying a payload, a handful per second, JSON is fine. This is a
   * 60 Hz stream of what is held, and at that rate the format is the whole difference between a link that
   * feels immediate and one that does not.
   *
   * Returns how the frame travelled so the phone can tell the player it is on the slower path: a session on
   * the WebSocket fallback is playable but noticeably worse, and hiding that just makes the game feel bad
   * for no visible reason.
   */
  sendFrame(bytes: Uint8Array): 'rtc' | 'socket' | 'dropped' {
    return this.link?.sendFrame(bytes) ?? 'dropped';
  }

  /** Which slot the host gave this phone, or 0 until it says. The frame carries it. */
  slot = 0;

  private setState(s: LinkState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onState(s);
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPoll?.();
    this.link?.close();
  }
}
