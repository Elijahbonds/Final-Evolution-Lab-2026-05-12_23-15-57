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
    if (ch.label === 'fel-input') this.fast = ch;
    if (ch.label === 'fel-control') this.safe = ch;
    ch.onmessage = (e) => {
      try { this.opts.onMessage(JSON.parse(e.data as string) as LinkMessage); }
      catch { /* a malformed frame must never take the session down */ }
    };
    ch.onopen = () => { if (this.isOpen()) this.opts.onState('connected'); };
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
