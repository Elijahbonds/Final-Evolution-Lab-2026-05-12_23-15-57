// WebRTC data-channel transport.
//
// Why WebRTC rather than the WebSocket relay the brief first reached for: this
// app deploys on Vercel, where every API route is a serverless function and
// nothing can hold a socket open. A relay would have needed a second always-on
// service. WebRTC needs the server only for the few seconds of the handshake,
// and it is strictly BETTER for the actual goal — on the same WiFi the peers
// connect through host candidates and packets never leave the LAN, instead of
// making two internet round trips through a relay.
//
// The channel is unordered + maxRetransmits:0 (unreliable). For a timing
// mechanic that is the right trade: a late input is worse than a lost one, and
// re-sending a stale tilt sample would actively hurt. Control-plane messages
// that must not be dropped go on a second, reliable channel.

import type { LinkMessage, LinkState } from '../types';

const ICE_SERVERS: RTCIceServer[] = [
  // Public STUN only. It is needed solely to discover a reflexive address when
  // the phone and TV are NOT on the same network; on one WiFi the host
  // candidates match first and this is never consulted.
  { urls: 'stun:stun.l.google.com:19302' },
];

export interface PeerLinkOpts {
  onMessage: (msg: LinkMessage) => void;
  onState: (state: LinkState) => void;
  /** Outbound signaling — implementation posts to /api/controller-link/signal. */
  sendSignal: (data: unknown) => void;
  /**
   * Phase B: raw BINARY input frames, handed over untouched.
   *
   * Separate from onMessage because they are a different kind of thing: onMessage is the control plane
   * (JSON, occasional, must arrive) and this is the hot path (16 bytes, 60 Hz, droppable). Keeping them
   * apart means a frame never goes through JSON.parse and a control message can never be mistaken for input.
   */
  onFrame?: (data: ArrayBuffer) => void;
  /**
   * The mission's fallback: "Fall back to WebSocket for input if the datachannel fails."
   *
   * Supplied by the caller because the socket belongs to the signaling layer, which already has one open.
   * Returns true if it took the bytes.
   */
  sendViaSocket?: (data: Uint8Array) => boolean;
}

export class PeerLink {
  private pc: RTCPeerConnection;
  private fast: RTCDataChannel | null = null;   // unreliable, gameplay input
  private safe: RTCDataChannel | null = null;   // reliable, lobby/control
  private opts: PeerLinkOpts;
  private closed = false;

  constructor(opts: PeerLinkOpts) {
    this.opts = opts;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.opts.sendSignal({ candidate: e.candidate.toJSON() });
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected') this.opts.onState('connected');
      else if (s === 'connecting') this.opts.onState('connecting');
      // 'disconnected' is often transient (a WiFi blip); 'failed' is terminal
      // for this PeerConnection and the caller must build a fresh one.
      else if (s === 'disconnected') this.opts.onState('reconnecting');
      else if (s === 'failed' || s === 'closed') {
        if (!this.closed) this.opts.onState('failed');
      }
    };

    this.pc.ondatachannel = (e) => this.bind(e.channel);
  }

  /** Host side: create the channels, then produce an offer. */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.fast = this.pc.createDataChannel('fel-input', {
      ordered: false, maxRetransmits: 0,
    });
    // binary frames arrive as ArrayBuffer rather than Blob, so the host can decode without an async read
    this.fast.binaryType = 'arraybuffer';
    this.safe = this.pc.createDataChannel('fel-control', { ordered: true });
    this.bind(this.fast);
    this.bind(this.safe);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Guest side: consume the host's offer and answer it. */
  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    // A late/duplicate answer after the connection is already up would throw
    // and take the link down with it.
    if (this.pc.signalingState === 'stable') return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Candidates can arrive before the remote description is set, or after
      // the pair is already chosen. Neither is fatal.
    }
  }

  private bind(ch: RTCDataChannel): void {
    if (ch.label === 'fel-input') { this.fast = ch; ch.binaryType = 'arraybuffer'; }
    if (ch.label === 'fel-control') this.safe = ch;
    ch.onmessage = (e) => {
      // BINARY IS INPUT, TEXT IS CONTROL. The two share a transport and must never be confused: a frame is
      // 16 bytes with a magic byte, and running JSON.parse over it would throw 60 times a second.
      const d = e.data;
      if (typeof d !== 'string') {
        if (d instanceof ArrayBuffer) this.opts.onFrame?.(d);
        else if (d && typeof (d as Blob).arrayBuffer === 'function') {
          // some browsers still hand back a Blob when binaryType was not honoured
          void (d as Blob).arrayBuffer().then((b) => this.opts.onFrame?.(b)).catch(() => {});
        }
        return;
      }
      try { this.opts.onMessage(JSON.parse(d) as LinkMessage); }
      catch { /* a malformed frame must never take the session down */ }
    };
    ch.onopen = () => { if (this.isOpen()) this.opts.onState('connected'); };
  }

  /** Is the unreliable input channel up? False means input is riding the fallback. */
  get fastOpen(): boolean { return this.fast?.readyState === 'open'; }

  /**
   * Send one binary input frame.
   *
   * Datachannel first; if it is not open, the WebSocket fallback. Returns how it went so the pad can show
   * the player which path they are on — a session running on the fallback is playable but noticeably worse,
   * and that is worth saying rather than hiding.
   */
  sendFrame(bytes: Uint8Array): 'rtc' | 'socket' | 'dropped' {
    if (this.fast?.readyState === 'open') {
      try {
        // a copy, because the sender reuses one buffer and send() is asynchronous
        this.fast.send(bytes.slice().buffer);
        return 'rtc';
      } catch { /* fall through to the socket */ }
    }
    return this.opts.sendViaSocket?.(bytes) ? 'socket' : 'dropped';
  }

  isOpen(): boolean {
    return this.fast?.readyState === 'open' || this.safe?.readyState === 'open';
  }

  /** Gameplay input — unreliable channel, dropped rather than delayed. */
  sendFast(msg: LinkMessage): void {
    if (this.fast?.readyState === 'open') this.fast.send(JSON.stringify(msg));
    else this.sendSafe(msg);
  }

  /** Lobby/control — reliable channel, must arrive. */
  sendSafe(msg: LinkMessage): void {
    if (this.safe?.readyState === 'open') this.safe.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    try { this.fast?.close(); } catch { /* already gone */ }
    try { this.safe?.close(); } catch { /* already gone */ }
    try { this.pc.close(); } catch { /* already gone */ }
  }
}
