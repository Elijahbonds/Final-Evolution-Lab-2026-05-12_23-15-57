// STREAM SESSION — the capture plumbing under streamPolicy (2026-09-13).
//
// Same split as voice: the rules are pure and tested next door, and this file has no judgement in it. It
// captures the game canvas, optionally mixes in a camera and a microphone, and either sends the result to
// spectators over the existing WebRTC mesh or writes it to a file.
//
// WHAT IT CAPTURES, and why the canvas rather than the screen: `canvas.captureStream()` takes the game and
// only the game. `getDisplayMedia` would take whatever window the player picked — including the one with
// their email in it. Capturing the canvas cannot leak a desktop, and it needs no screen-share permission
// prompt, which makes going live one click instead of three.
//
// BROADCAST IS NOT IMPLEMENTED and this file will not pretend. Browsers cannot speak RTMP; Twitch and
// YouTube need a relay that accepts WebRTC or a WebSocket and pushes RTMP out. `startBroadcast` refuses via
// the policy rather than half-working.

import {
  eligibility, defaultComposition, sharingPersonal, spectatorsFull,
  type StreamComposition, type StreamSubject, type StreamVisibility, DEFAULT_VISIBILITY,
} from './streamPolicy';

/** 30 is plenty for a spectator and half the upstream of 60. */
export const STREAM_FPS = 30;
/** Chunk size for a recording, ms. Small enough that a crash loses a second, not a session. */
export const RECORD_CHUNK_MS = 1000;

export interface StreamSessionOpts {
  canvas: HTMLCanvasElement;
  subject: StreamSubject;
  onState?: (s: { live: boolean; summary: string; personal: boolean }) => void;
  onDenied?: (message: string) => void;
}

export class StreamSession {
  private canvas: HTMLCanvasElement;
  private opts: StreamSessionOpts;
  private gameStream: MediaStream | null = null;
  private camStream: MediaStream | null = null;
  private outbound: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private peers = new Set<RTCPeerConnection>();
  private senders = new Map<RTCPeerConnection, RTCRtpSender[]>();
  private comp: StreamComposition = defaultComposition();
  private live = false;

  visibility: StreamVisibility = DEFAULT_VISIBILITY;

  constructor(opts: StreamSessionOpts) {
    this.opts = opts;
    this.canvas = opts.canvas;
  }

  get composition(): StreamComposition { return { ...this.comp }; }
  get isLive(): boolean { return this.live; }
  get spectatorCount(): number { return this.peers.size; }

  /**
   * Start capturing. The canvas only — no camera, no mic, whatever the composition says.
   *
   * The personal channels are added by explicit calls afterwards, so "start streaming" and "share my face"
   * are two decisions a player makes separately and can see separately.
   */
  private async capture(kind: 'spectate' | 'record'): Promise<boolean> {
    const pre = eligibility(kind, { ...this.opts.subject, consented: true, hasCapture: true });
    if (!pre.allowed) { this.opts.onDenied?.(pre.message); return false; }
    if (this.outbound) return true;
    try {
      this.gameStream = this.canvas.captureStream(STREAM_FPS);
      this.outbound = new MediaStream(this.gameStream.getVideoTracks());
      this.emit();
      return true;
    } catch {
      this.opts.onDenied?.('Couldn’t start the capture.');
      return false;
    }
  }

  /**
   * Turn the camera on or off mid-stream.
   *
   * Separate from starting the stream on purpose. Off is the default and getting back to off is one call,
   * because "how do I turn my camera off RIGHT NOW" is the most urgent question this feature can produce.
   */
  async setCamera(on: boolean): Promise<void> {
    if (!on) {
      for (const t of this.camStream?.getTracks() ?? []) { t.stop(); this.outbound?.removeTrack(t); }
      this.camStream = null;
      this.comp = { ...this.comp, camera: false };
      this.emit();
      return;
    }
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      for (const t of this.camStream.getVideoTracks()) this.outbound?.addTrack(t);
      this.comp = { ...this.comp, camera: true };
    } catch {
      this.opts.onDenied?.('Couldn’t start the camera.');
      this.comp = { ...this.comp, camera: false };
    }
    this.emit();
  }

  /** The stream's own microphone — deliberately NOT the voice-chat mic. Two features, two decisions. */
  async setMicrophone(on: boolean): Promise<void> {
    if (!on) {
      for (const t of this.outbound?.getAudioTracks() ?? []) { t.stop(); this.outbound?.removeTrack(t); }
      this.comp = { ...this.comp, microphone: false };
      this.emit();
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const t of mic.getAudioTracks()) this.outbound?.addTrack(t);
      this.comp = { ...this.comp, microphone: true };
    } catch {
      this.opts.onDenied?.('Couldn’t start the microphone.');
      this.comp = { ...this.comp, microphone: false };
    }
    this.emit();
  }

  // ── SPECTATE ───────────────────────────────────────────────────────────────────────────────────────────

  async goLive(): Promise<boolean> {
    if (!await this.capture('spectate')) return false;
    this.live = true;
    this.emit();
    return true;
  }

  /** Add a spectator. Refused past the ceiling — a mesh degrades for EVERYONE when it is oversubscribed. */
  addSpectator(pc: RTCPeerConnection): boolean {
    if (!this.live || !this.outbound) return false;
    if (spectatorsFull(this.peers.size)) return false;
    this.peers.add(pc);
    const sent: RTCRtpSender[] = [];
    for (const t of this.outbound.getTracks()) {
      try { sent.push(pc.addTrack(t, this.outbound)); } catch { /* closed peer */ }
    }
    this.senders.set(pc, sent);
    this.emit();
    return true;
  }

  removeSpectator(pc: RTCPeerConnection): void {
    for (const s of this.senders.get(pc) ?? []) { try { pc.removeTrack(s); } catch { /* closed */ } }
    this.senders.delete(pc);
    this.peers.delete(pc);
    this.emit();
  }

  // ── RECORD ─────────────────────────────────────────────────────────────────────────────────────────────

  async startRecording(): Promise<boolean> {
    if (!await this.capture('record')) return false;
    if (!this.outbound || this.recorder) return false;
    // webm/vp9 where it exists, webm anywhere else. Never assume a codec: Safari has historically had
    // neither, and an unguarded mimeType throws rather than degrading.
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m));
    try {
      this.recorder = new MediaRecorder(this.outbound, mime ? { mimeType: mime } : undefined);
    } catch {
      this.opts.onDenied?.('Recording isn’t supported in this browser.');
      return false;
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(RECORD_CHUNK_MS);
    this.emit();
    return true;
  }

  /** Stop and hand back the clip. The caller decides what to do with it — this never uploads anything. */
  async stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return null;
    const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    rec.stop();
    await done;
    this.recorder = null;
    const blob = this.chunks.length ? new Blob(this.chunks, { type: this.chunks[0].type || 'video/webm' }) : null;
    this.chunks = [];
    this.emit();
    return blob;
  }

  get isRecording(): boolean { return this.recorder !== null; }

  // ── BROADCAST ──────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Twitch / YouTube. Refuses, honestly, until a relay exists.
   *
   * Kept as a real method with a real signature so the UI can call it and get the policy's own explanation,
   * rather than the button simply not existing and the capability being forgotten.
   */
  async startBroadcast(): Promise<boolean> {
    const e = eligibility('broadcast', { ...this.opts.subject, consented: true, hasCapture: true });
    this.opts.onDenied?.(e.message);
    return false;
  }

  // ── TEARDOWN ───────────────────────────────────────────────────────────────────────────────────────────

  private emit(): void {
    this.opts.onState?.({
      live: this.live,
      summary: [
        'GAME',
        ...(this.comp.gameAudio ? ['GAME AUDIO'] : []),
        ...(this.comp.camera ? ['CAMERA'] : []),
        ...(this.comp.microphone ? ['MIC'] : []),
      ].join(' · '),
      personal: sharingPersonal(this.comp),
    });
  }

  /** Everything stops and every device light goes out. */
  async stop(): Promise<void> {
    if (this.recorder) await this.stopRecording();
    for (const pc of [...this.peers]) this.removeSpectator(pc);
    for (const t of this.outbound?.getTracks() ?? []) t.stop();
    for (const t of this.camStream?.getTracks() ?? []) t.stop();
    for (const t of this.gameStream?.getTracks() ?? []) t.stop();
    this.outbound = null; this.camStream = null; this.gameStream = null;
    this.comp = defaultComposition();
    this.live = false;
    this.emit();
  }
}
