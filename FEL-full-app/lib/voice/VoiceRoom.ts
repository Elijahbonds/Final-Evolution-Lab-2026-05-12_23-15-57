// VOICE ROOM — the browser plumbing under voicePolicy (2026-09-13).
//
// The rules live in voicePolicy.ts and are pure and tested. This file has NO judgement in it: it captures a
// microphone, attaches the track to peers, and turns the track on and off according to what the policy says.
// That split is the point — a bug here drops audio, a bug there broadcasts a child's voice.
//
// MESH, NOT A SERVER. One audio track sent to each peer, which is why MAX_VOICE_PEERS is party-sized: in a
// mesh every client uploads to every other, so a sixth participant costs everyone else another upstream.
// There is no media server and no vendor.
//
// THE TRACK IS DISABLED, NOT DETACHED. Renegotiating a peer connection every time somebody releases a
// push-to-talk key would be hundreds of SDP round-trips a minute and audible as gaps. `track.enabled = false`
// stops the browser sending anything on it — silence, not muted audio — and flips in microseconds.

import {
  eligibility, isTransmitting, freshVoiceState, indicator, roomIsFull,
  type VoiceState, type VoiceSubject, type VoiceMode,
} from './voicePolicy';

export interface VoiceRoomOpts {
  /** Who is asking. Age comes from the Creator Record's `minor` flag; unknown fails closed. */
  subject: VoiceSubject;
  /** Raised whenever the live/label state changes, so an indicator can render it. */
  onIndicator?: (view: { label: string; live: boolean }) => void;
  /** Raised when the mic is denied, with the policy's own message. */
  onDenied?: (message: string) => void;
}

export class VoiceRoom {
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private peers = new Set<RTCPeerConnection>();
  private senders = new Map<RTCPeerConnection, RTCRtpSender>();
  private state: VoiceState = freshVoiceState();
  private opts: VoiceRoomOpts;
  private lastLabel = '';
  private closed = false;

  constructor(opts: VoiceRoomOpts) { this.opts = opts; }

  get voiceState(): VoiceState { return this.state; }

  private get eligible(): boolean {
    return eligibility({ ...this.opts.subject, hasDevice: !!this.track }).allowed;
  }

  /**
   * Ask for the microphone.
   *
   * Checked against the policy BEFORE `getUserMedia` is called, so an ineligible account never sees a
   * browser permission prompt at all. Prompting a 14-year-old for their microphone and then refusing them is
   * worse than never asking.
   */
  async enable(): Promise<boolean> {
    const pre = eligibility({ ...this.opts.subject, hasDevice: true });
    if (!pre.allowed) { this.opts.onDenied?.(pre.message); return false; }
    if (this.track) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.track = this.stream.getAudioTracks()[0] ?? null;
      if (!this.track) { this.opts.onDenied?.('No microphone found, or access was refused.'); return false; }
      this.track.enabled = false;          // OFF the instant it exists — consent is not permission to transmit
      for (const pc of this.peers) this.attach(pc);
      this.pushIndicator();
      return true;
    } catch {
      this.opts.onDenied?.('No microphone found, or access was refused.');
      return false;
    }
  }

  /** Add a peer to the mesh. Refused past the ceiling rather than silently degrading everyone's audio. */
  addPeer(pc: RTCPeerConnection): boolean {
    if (this.closed) return false;
    if (roomIsFull(this.peers.size)) return false;
    this.peers.add(pc);
    if (this.track) this.attach(pc);
    return true;
  }

  removePeer(pc: RTCPeerConnection): void {
    const sender = this.senders.get(pc);
    if (sender) { try { pc.removeTrack(sender); } catch { /* the peer may already be closed */ } }
    this.senders.delete(pc);
    this.peers.delete(pc);
  }

  private attach(pc: RTCPeerConnection): void {
    if (!this.track || !this.stream || this.senders.has(pc)) return;
    try { this.senders.set(pc, pc.addTrack(this.track, this.stream)); } catch { /* closed peer */ }
  }

  /** Drive the state machine. The policy decides; this only applies the answer to the track. */
  update(next: VoiceState, now = Date.now()): void {
    this.state = next;
    const live = isTransmitting(next, this.eligible, now);
    if (this.track) this.track.enabled = live;
    this.pushIndicator(now);
  }

  /**
   * Re-apply the current state.
   *
   * Called on a timer by the host, because the push-to-talk TAIL expires on the clock rather than on an
   * event — without a tick the track would stay enabled until the next key press.
   */
  tick(now = Date.now()): void {
    if (this.closed) return;
    const live = isTransmitting(this.state, this.eligible, now);
    if (this.track && this.track.enabled !== live) this.track.enabled = live;
    this.pushIndicator(now);
  }

  setMode(mode: VoiceMode): void {
    this.update({ ...this.state, mode, held: false, releasedAt: null });
  }

  private pushIndicator(now = Date.now()): void {
    const view = indicator(this.state, this.eligible, now);
    if (view.label === this.lastLabel) return;
    this.lastLabel = view.label;
    this.opts.onIndicator?.(view);
  }

  /** Hard stop: the track is stopped, not merely disabled, so the browser's recording light goes out. */
  close(): void {
    this.closed = true;
    for (const pc of [...this.peers]) this.removePeer(pc);
    this.track?.stop();
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.track = null;
    this.stream = null;
  }
}
