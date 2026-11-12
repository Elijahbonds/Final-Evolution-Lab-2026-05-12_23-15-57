'use client';

// lib/coach/live/link.ts — COACH-LIVE (2026-10-25): the live session's one peer-to-peer link, coach ↔ client.
//
// Native RTCPeerConnection, the way the party's voice mesh (lib/party/social/voice.ts) and the coach store's call
// (components/coach-store/call/room.tsx) do it, with the party's connection numbers by import (CONNECT_TIMEOUT_MS,
// DISCONNECTED_GRACE_MS, RESTARTS_MAX). No media server, no paid service.
//
//   TRACKS     the coach's page offers: its mic (sendrecv audio) and a recvonly video slot. The client's page answers,
//              putting its mic on the audio slot and — only when the door allowed video (a verified adult who chose it)
//              — its camera on the video slot. So only the coach ever offers, and the client's camera is never asked
//              for when it is not going to be sent.
//   CHANNELS   two data channels, negotiated on fixed ids so neither side waits for the other to open one:
//                ctl   id 0, reliable and ordered — JSON control messages (lib/coach/live/wire.ts Ctl);
//                pose  id 1, unordered, no retransmits — 105-byte pose frames (a late frame is worth nothing).
//   SIGNALS    through a Signaller (the HTTP one below polls /api/coach/live/signal). Each page reads and DROPS the
//              backlog when it starts, then says hello; the coach answers a hello with a fresh link and a fresh offer.
//              Offers carry a generation; an answer or a candidate for an old one is ignored.
//   FAILURE    a link that drops to disconnected for DISCONNECTED_GRACE_MS, or fails, is ICE-restarted by the coach,
//              RESTARTS_MAX times. Meanwhile, if no direct path has come up within RELAY_AFTER_MS, the session goes on
//              through the RELAY: control messages and pose frames (thinned to RELAY_POSE_HZ, batched every
//              RELAY_BATCH_MS) ride the signal route instead. Voice and video cannot — media needs a direct path or a
//              TURN relay (owner call: docs/COACH-LIVE.md) — and the page says so. If the direct path comes up later,
//              everything moves back onto it.
//   NOT RECORDED: there is no recorder anywhere in the live session (tests/coach-live/no-recording.scan.test.ts).

import { CONNECT_TIMEOUT_MS, DISCONNECTED_GRACE_MS, RESTARTS_MAX } from '@/lib/party/social/voice';
import type { LiveRole } from './gate';
import { CTL_MAX_CHARS, fromBase64, parseCtl, toBase64, type Ctl } from './wire';
import { RELAY_BATCH_MS } from './timing';

/** How long without a direct path before control and pose go through the relay. (new) */
export const RELAY_AFTER_MS = 10_000;
/** The poll's pace: brisk while connecting or relaying, slow once direct (only an ICE restart or a bye can come). (new) */
export const POLL_FAST_MS = 250;
export const POLL_SLOW_MS = 2000;
/** A pose frame is dropped, not queued, when the channel already holds this much. */
export const POSE_BUFFER_MAX = 16 * 1024;

export type LinkMode = 'connecting' | 'direct' | 'relay' | 'closed';

export interface Signaller {
  send(data: Record<string, unknown>): Promise<boolean>;
  /** Drop what is waiting (a page starts fresh), then deliver every new message. */
  start(onMessage: (data: Record<string, unknown>) => void): Promise<void>;
  setPollMs(ms: number): void;
  stop(): void;
}

export interface LinkOptions {
  role: LiveRole;
  iceServers: RTCIceServer[];
  signaller: Signaller;
  /** The mic (both sides) and, on the client's page when allowed, the camera. */
  local: { audio: MediaStreamTrack | null; video: MediaStreamTrack | null };
  onCtl(m: Ctl, via: 'direct' | 'relay'): void;
  onPose(buf: ArrayBuffer, via: 'direct' | 'relay'): void;
  onRemote(stream: MediaStream): void;
  onMode(mode: LinkMode): void;
  /** The other side said hello (joined or rejoined) or bye (left). */
  onPeer?(present: boolean): void;
  timers?: { relayAfterMs?: number; connectTimeoutMs?: number };
}

export class LiveLink {
  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private pose: RTCDataChannel | null = null;
  private gen = 0;
  private remoteGen = -1;
  private pendingIce: RTCIceCandidateInit[] = [];
  private restarts = 0;
  private mode: LinkMode = 'connecting';
  private relayTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private batch: string[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private remote = new MediaStream();
  private closed = false;

  constructor(private readonly o: LinkOptions) {}

  get currentMode(): LinkMode { return this.mode; }
  get peer(): RTCPeerConnection | null { return this.pc; }

  async start(): Promise<void> {
    await this.o.signaller.start((d) => { void this.onSignal(d); });
    void this.o.signaller.send({ kind: 'bye', hello: true });
    this.fresh();
    if (this.o.role === 'coach') void this.offer(false);
  }

  /** Send a control message: the direct channel when it is open, else the relay once the session is relaying. */
  sendCtl(m: Ctl): boolean {
    const s = JSON.stringify(m);
    if (s.length > CTL_MAX_CHARS) return false;
    if (this.ctl?.readyState === 'open') { this.ctl.send(s); return true; }
    if (this.mode === 'relay') { void this.o.signaller.send({ kind: 'ctl', m }); return true; }
    return false;
  }

  /** Send a pose frame (the caller thins it). Direct: dropped when the channel is backed up. Relay: batched. */
  sendPose(buf: ArrayBuffer, relayDue: boolean): 'direct' | 'relay' | 'dropped' {
    if (this.pose?.readyState === 'open') {
      if (this.pose.bufferedAmount > POSE_BUFFER_MAX) return 'dropped';
      this.pose.send(buf);
      return 'direct';
    }
    if (this.mode === 'relay' && relayDue) { this.batch.push(toBase64(buf)); return 'relay'; }
    return 'dropped';
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.o.signaller.send({ kind: 'bye' });
    this.teardown();
    this.o.signaller.stop();
    this.setMode('closed');
  }

  // ── the connection ──

  private fresh(): void {
    this.teardown();
    this.restarts = 0;
    this.remoteGen = -1;
    this.pendingIce = [];
    this.remote = new MediaStream();
    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers.length ? this.o.iceServers : [{ urls: ['stun:stun.l.google.com:19302'] }] });
    this.pc = pc;
    if (this.o.role === 'coach') {
      const a = this.o.local.audio;
      pc.addTransceiver(a ?? 'audio', { direction: a ? 'sendrecv' : 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    this.ctl = pc.createDataChannel('ctl', { negotiated: true, id: 0, ordered: true });
    this.pose = pc.createDataChannel('pose', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    this.pose.binaryType = 'arraybuffer';
    this.ctl.onmessage = (e) => { const m = parseCtl(e.data); if (m) this.o.onCtl(m, 'direct'); };
    this.ctl.onopen = () => this.onDirect();
    this.pose.onmessage = (e) => { if (e.data instanceof ArrayBuffer) this.o.onPose(e.data, 'direct'); };
    pc.ontrack = (ev) => {
      if (!this.remote.getTracks().includes(ev.track)) this.remote.addTrack(ev.track);
      this.o.onRemote(this.remote);
    };
    pc.onicecandidate = (ev) => { if (ev.candidate) void this.o.signaller.send({ kind: 'ice', gen: this.o.role === 'coach' ? this.gen : this.remoteGen, candidate: ev.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => this.onState();
    this.armTimers();
    if (this.mode !== 'relay') this.setMode('connecting');
  }

  private armTimers(): void {
    this.clearTimer('connectTimer');
    this.connectTimer = setTimeout(() => this.onTimeout(), this.o.timers?.connectTimeoutMs ?? CONNECT_TIMEOUT_MS);
    if (!this.relayTimer && this.mode !== 'relay') {
      this.relayTimer = setTimeout(() => { this.relayTimer = null; if (this.mode === 'connecting') this.toRelay(); }, this.o.timers?.relayAfterMs ?? RELAY_AFTER_MS);
    }
  }

  private async offer(iceRestart: boolean): Promise<void> {
    const pc = this.pc;
    if (!pc || this.o.role !== 'coach') return;
    try {
      const gen = ++this.gen;
      const o = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (pc !== this.pc || gen !== this.gen) return;
      await pc.setLocalDescription(o);
      await this.o.signaller.send({ kind: 'offer', gen, sdp: pc.localDescription?.sdp ?? '' });
    } catch { /* the connect timer marks a link that never comes up */ }
  }

  private async onSignal(d: Record<string, unknown>): Promise<void> {
    if (this.closed) return;
    try {
      if (d.kind === 'bye') {
        // hello (a page started) and bye (a page left) share a kind: either way the old link is gone. On a hello the
        // coach makes the new one at once; on a bye it waits for the next hello.
        const hello = d.hello === true;
        this.o.onPeer?.(hello);
        this.fresh();
        if (hello && this.o.role === 'coach') void this.offer(false);
        return;
      }
      if (d.kind === 'ctl') { const m = parseCtl(d.m); if (m) this.o.onCtl(m, 'relay'); return; }
      if (d.kind === 'pose') {
        if (!Array.isArray(d.b)) return;
        for (const s of d.b.slice(0, 64)) { const buf = typeof s === 'string' ? fromBase64(s) : null; if (buf) this.o.onPose(buf, 'relay'); }
        return;
      }
      const pc = this.pc;
      if (!pc) return;
      const gen = typeof d.gen === 'number' ? d.gen : -1;
      if (d.kind === 'offer' && this.o.role === 'client') {
        this.remoteGen = gen;
        await pc.setRemoteDescription({ type: 'offer', sdp: String(d.sdp ?? '') });
        await this.attachLocal(pc);
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        await pc.setLocalDescription(await pc.createAnswer());
        await this.o.signaller.send({ kind: 'answer', gen, sdp: pc.localDescription?.sdp ?? '' });
      } else if (d.kind === 'answer' && this.o.role === 'coach') {
        if (gen !== this.gen || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: String(d.sdp ?? '') });
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (d.kind === 'ice' && d.candidate && typeof d.candidate === 'object') {
        if (gen !== (this.o.role === 'coach' ? this.gen : this.remoteGen)) return;
        const c = d.candidate as RTCIceCandidateInit;
        if (!pc.remoteDescription) this.pendingIce.push(c);
        else await pc.addIceCandidate(c).catch(() => {});
      }
    } catch { /* a bad message never takes the session down */ }
  }

  /** The client's answer carries its mic, and its camera only when it was handed one. */
  private async attachLocal(pc: RTCPeerConnection): Promise<void> {
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track?.kind;
      const track = kind === 'audio' ? this.o.local.audio : kind === 'video' ? this.o.local.video : null;
      if (t.sender.track === track) continue;
      await t.sender.replaceTrack(track);
      t.direction = kind === 'video' ? (track ? 'sendonly' : 'inactive') : track ? 'sendrecv' : 'recvonly';
    }
  }

  private onState(): void {
    const pc = this.pc;
    if (!pc) return;
    const st = pc.connectionState;
    if (st === 'connected') {
      this.clearTimer('graceTimer'); this.clearTimer('connectTimer'); this.restarts = 0;
      if (this.ctl?.readyState === 'open') this.onDirect();   // back after an ICE restart: the channels never closed
      return;
    }
    if (st === 'failed') { this.retry(); return; }
    if (st === 'disconnected') {
      this.clearTimer('graceTimer');
      this.graceTimer = setTimeout(() => { if (this.pc?.connectionState === 'disconnected') this.retry(); }, DISCONNECTED_GRACE_MS);
    }
  }

  private onTimeout(): void {
    if (this.pc?.connectionState === 'connected') return;
    this.retry();
  }

  /** The coach restarts ICE, RESTARTS_MAX times; the session is relaying by then (RELAY_AFTER_MS), and stays so. */
  private retry(): void {
    if (this.mode === 'direct') this.toRelay();
    if (this.restarts >= RESTARTS_MAX) return;
    this.restarts++;
    if (this.o.role === 'coach') { try { this.pc?.restartIce(); } catch { /* renegotiate below */ } void this.offer(true); }
    this.clearTimer('connectTimer');
    this.connectTimer = setTimeout(() => this.onTimeout(), this.o.timers?.connectTimeoutMs ?? CONNECT_TIMEOUT_MS);
  }

  private onDirect(): void {
    this.clearTimer('relayTimer');
    this.stopBatch();
    this.setMode('direct');
  }

  private toRelay(): void {
    if (this.closed) return;
    this.setMode('relay');
    if (!this.batchTimer) {
      this.batchTimer = setInterval(() => {
        if (!this.batch.length) return;
        const b = this.batch.splice(0);
        void this.o.signaller.send({ kind: 'pose', b });
      }, RELAY_BATCH_MS);
    }
  }

  private stopBatch(): void {
    if (this.batchTimer) clearInterval(this.batchTimer);
    this.batchTimer = null;
    this.batch = [];
  }

  private setMode(m: LinkMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.o.signaller.setPollMs(m === 'direct' ? POLL_SLOW_MS : POLL_FAST_MS);
    this.o.onMode(m);
  }

  private clearTimer(k: 'relayTimer' | 'connectTimer' | 'graceTimer'): void {
    const t = this[k];
    if (t) clearTimeout(t);
    this[k] = null;
  }

  private teardown(): void {
    this.clearTimer('connectTimer'); this.clearTimer('graceTimer');
    try { this.ctl?.close(); this.pose?.close(); this.pc?.close(); } catch { /* closed */ }
    this.ctl = null; this.pose = null; this.pc = null;
    if (this.mode === 'direct') this.setMode('connecting');
  }
}

/** The signal route over fetch. Errors are swallowed and retried: a WiFi blip must not end a session. */
export class HttpSignaller implements Signaller {
  private after = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollMs = POLL_FAST_MS;
  constructor(private readonly room: string, private readonly base = '/api/coach/live/signal') {}

  async send(data: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(this.base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: this.room, data }) });
      return r.ok;
    } catch { return false; }
  }

  private async read(): Promise<Record<string, unknown>[]> {
    try {
      const r = await fetch(`${this.base}?room=${encodeURIComponent(this.room)}&after=${this.after}`);
      if (!r.ok) return [];
      const j = (await r.json()) as { messages?: { seq: number; data: Record<string, unknown> }[] };
      const out: Record<string, unknown>[] = [];
      for (const m of j.messages ?? []) {
        if (typeof m.seq !== 'number' || m.seq <= this.after) continue;
        this.after = m.seq;
        if (m.data && typeof m.data === 'object') out.push(m.data);
      }
      return out;
    } catch { return []; }
  }

  async start(onMessage: (d: Record<string, unknown>) => void): Promise<void> {
    await this.read();                        // the backlog is from before this page: dropped
    const tick = async (): Promise<void> => {
      if (this.stopped) return;
      for (const d of await this.read()) onMessage(d);
      if (!this.stopped) this.timer = setTimeout(() => { void tick(); }, this.pollMs);
    };
    this.timer = setTimeout(() => { void tick(); }, this.pollMs);
  }

  setPollMs(ms: number): void { this.pollMs = ms; }
  stop(): void { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
}
