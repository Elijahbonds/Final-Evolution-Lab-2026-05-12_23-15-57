// lib/party/social/voice.ts — party voice: a peer-to-peer WebRTC audio mesh, signaled through netd (PARTY-CHAT lane,
// 2026-10-13). Native RTCPeerConnection, like the coach call (components/coach-store/call/room.tsx).
//
//   - The mic is asked for ONLY when the person presses "Join voice" — never on joining the party.
//   - Echo cancellation, noise suppression and auto gain are requested (VOICE_CONSTRAINTS). Mono: it is talk.
//   - Mute, deafen (deafen also mutes the mic, as on a console), push-to-talk (hold Talk, or hold ` on a keyboard).
//   - Speaking indicators from the audio itself (an analyser per stream), no extra network messages.
//   - Game audio ducks under a friend talking (SoundKit.duckForVoice — the voiceover lane's one duck).
//   - One link per pair of voice members; the smaller peer id offers, so two pages never both offer. A glare (an offer
//     while we are offering) is settled the "perfect negotiation" way: the non-offerer is polite and rolls back.
//   - RECONNECTION: a link that drops to `disconnected` for 4 s or `failed` is ICE-restarted by its offerer, twice; then it
//     is "couldn't connect", said per person and, when nobody connects, as one plain line: voice could not connect on
//     this network, text and quick chat still work. Relay-ready: /api/party/ticket adds a TURN server when configured.
//   - TEENS NEVER GET VOICE: join() refuses without the server's voice right, and netd refuses their p_voice and p_sig.
//   - NEVER RECORDED: there is no recorder anywhere in the party (tests/party-chat/no-recording.scan.test.ts).

import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import { inParty, type PartyState } from './state';
import type { PartyClient } from './client';
import { loadMutes, loadVoicePrefs, saveMutes, saveVoicePrefs } from './persist';

export const VOICE_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  video: false,
};

/** Speaking: RMS over this turns a speaker on, under SPEAK_OFF (for SPEAK_HOLD_MS) turns them off. */
export const SPEAK_ON = 0.035;
export const SPEAK_OFF = 0.018;
export const SPEAK_HOLD_MS = 350;
export const TICK_MS = 100;
/** A link that has not connected in this long is "couldn't connect". */
export const CONNECT_TIMEOUT_MS = 15_000;
export const DISCONNECTED_GRACE_MS = 4_000;
export const RESTARTS_MAX = 2;
/** Push-to-talk on a keyboard: the backquote key, which no FEL game binds. */
export const PTT_KEY = 'Backquote';

export type MicState = 'off' | 'asking' | 'on' | 'denied' | 'error';
export type LinkState = 'connecting' | 'connected' | 'failed';

export interface VoiceView {
  joined: boolean;
  mic: MicState;
  muted: boolean;
  deafened: boolean;
  ptt: boolean;
  /** Push-to-talk held right now. */
  talking: boolean;
  /** peer id → speaking now (yours included, under your own peer id). */
  speaking: Record<string, boolean>;
  peers: Record<string, LinkState>;
  /** One plain sentence when voice is not working (mic blocked, nobody reachable). */
  problem: string | null;
  mutedPubs: string[];
}

export const NO_VOICE: VoiceView = {
  joined: false, mic: 'off', muted: false, deafened: false, ptt: false, talking: false, speaking: {}, peers: {}, problem: null, mutedPubs: [],
};

/** Who offers on a link: the smaller peer id. Deterministic on both pages, so exactly one side does. */
export const offers = (me: string, them: string): boolean => me < them;

/** Is the mic sending right now? */
export const micLive = (v: Pick<VoiceView, 'joined' | 'muted' | 'deafened' | 'ptt' | 'talking'>): boolean =>
  v.joined && !v.muted && !v.deafened && (!v.ptt || v.talking);

/** The speaking flag with hysteresis: on above SPEAK_ON, off once under SPEAK_OFF for SPEAK_HOLD_MS. */
export function nextSpeaking(was: boolean, rms: number, quietSince: number | null, now: number): { speaking: boolean; quietSince: number | null } {
  if (rms >= SPEAK_ON) return { speaking: true, quietSince: null };
  if (!was) return { speaking: false, quietSince: null };
  if (rms >= SPEAK_OFF) return { speaking: true, quietSince: null };
  const since = quietSince ?? now;
  return now - since >= SPEAK_HOLD_MS ? { speaking: false, quietSince: null } : { speaking: true, quietSince: since };
}

/** The one-line problem, or null. Mic first (nothing else matters without it), then reachability. */
export function voiceProblem(v: Pick<VoiceView, 'joined' | 'mic' | 'peers'>): string | null {
  if (v.mic === 'denied') return 'Your microphone is blocked. Allow it for this site in your browser settings to use voice.';
  if (v.mic === 'error') return "Couldn't start your microphone. Text and quick chat still work.";
  if (!v.joined) return null;
  const states = Object.values(v.peers);
  if (states.length && states.every((s) => s === 'failed')) {
    return "Voice couldn't connect on this network. Text and quick chat still work.";
  }
  return null;
}

interface Link {
  peer: string;
  pub: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  state: LinkState;
  restarts: number;
  makingOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
  timer: ReturnType<typeof setTimeout> | null;
  speaking: boolean;
  quietSince: number | null;
}

export class VoiceMesh {
  private view: VoiceView = { ...NO_VOICE };
  private listeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private links = new Map<string, Link>();
  private actx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeak = { speaking: false, quietSince: null as number | null };
  private tick: ReturnType<typeof setInterval> | null = null;
  private byeFrom = new Set<string>();
  private sentVoice: string | null = null;
  private box: HTMLDivElement | null = null;
  private buf = new Float32Array(512);

  constructor(private client: PartyClient) {
    this.view = { ...NO_VOICE, ptt: loadVoicePrefs().ptt, mutedPubs: loadMutes() };
    client.onSignal = (from, data) => { void this.onSignal(from, data); };
    client.onState = (s) => this.follow(s);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => { if (e.code === PTT_KEY && this.view.ptt && !e.repeat) this.talk(true); });
      window.addEventListener('keyup', (e) => { if (e.code === PTT_KEY && this.view.ptt) this.talk(false); });
      window.addEventListener('blur', () => { if (this.view.talking) this.talk(false); });
    }
  }

  getView = (): VoiceView => this.view;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(p: Partial<VoiceView>): void {
    const next = { ...this.view, ...p };
    next.problem = voiceProblem(next);
    this.view = next;
    this.listeners.forEach((fn) => fn());
  }

  // ── joining and leaving ──
  async join(): Promise<void> {
    const s = this.client.getState();
    if (!s.rights.voice || this.view.joined || this.view.mic === 'asking') return;   // teens: never (netd refuses too)
    this.set({ mic: 'asking' });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(VOICE_CONSTRAINTS);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      this.set({ mic: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error' });
      return;
    }
    // a page that left the party while the browser was asking
    if (!inParty(this.client.getState())) { this.stopStream(); this.set({ mic: 'off' }); return; }
    this.ensureAudio();
    try {
      const src = this.actx!.createMediaStreamSource(this.stream);
      this.localAnalyser = this.actx!.createAnalyser();
      this.localAnalyser.fftSize = 512;
      src.connect(this.localAnalyser);
    } catch { this.localAnalyser = null; }
    this.byeFrom.clear();
    this.set({ joined: true, mic: 'on' });
    this.applyMic();
    this.startTick();
    this.follow(this.client.getState());
  }

  leave(): void {
    if (!this.view.joined && !this.stream) return;
    this.closeAll();
    this.stopStream();
    this.stopTick();
    this.set({ joined: false, mic: 'off', talking: false, speaking: {}, peers: {} });
    this.syncServer(this.client.getState(), true);
  }

  setMuted(muted: boolean): void { this.set({ muted }); this.applyMic(); this.syncServer(this.client.getState(), true); }
  setDeafened(deafened: boolean): void { this.set({ deafened }); this.applyMic(); this.applyAudio(); this.syncServer(this.client.getState(), true); }
  setPtt(ptt: boolean): void { saveVoicePrefs({ ptt }); this.set({ ptt, talking: false }); this.applyMic(); }
  talk(down: boolean): void { if (this.view.talking === down) return; this.set({ talking: down }); this.applyMic(); }

  /** Mute one person for me only (not a block). Remembered on this device. */
  toggleMutePub = (pub: string): void => {
    const l = this.view.mutedPubs.includes(pub) ? this.view.mutedPubs.filter((x) => x !== pub) : [...this.view.mutedPubs, pub];
    saveMutes(l);
    this.set({ mutedPubs: l });
    this.applyAudio();
  };

  // ── following the party ──
  /** Every party state change: keep the server's voice flag in step, and the links matching who is in voice. */
  follow(s: PartyState): void {
    if (!inParty(s) || s.status === 'ended') {
      if (this.view.joined || this.stream) { this.closeAll(); this.stopStream(); this.stopTick(); this.set({ joined: false, mic: 'off', speaking: {}, peers: {} }); }
      this.sentVoice = null;
      return;
    }
    if (s.status !== 'live' || !s.you) return;
    if (!s.rights.voice && this.view.joined) { this.leave(); return; }
    this.syncServer(s, false);
    if (!this.view.joined) return;
    const blocked = this.client.blockedPubs();
    const inVoice = new Map(s.members.filter((m) => m.peer !== s.you && m.voice && !blocked.has(m.pub)).map((m) => [m.peer, m]));
    for (const peer of [...this.links.keys()]) if (!inVoice.has(peer)) this.close(peer);
    for (const peer of [...this.byeFrom]) if (!inVoice.has(peer)) this.byeFrom.delete(peer);   // they left voice: a rejoin reconnects
    for (const m of inVoice.values()) {
      if (this.links.has(m.peer) || this.byeFrom.has(m.peer) || !m.connected) continue;
      if (offers(s.you, m.peer)) this.open(m.peer, m.pub, true);
    }
  }

  /** The server's view of my voice (a resume or reload resets it): re-state it when it differs. */
  private syncServer(s: PartyState, force: boolean): void {
    if (s.status !== 'live' || !s.you || !s.rights.voice) return;
    const me = s.members.find((m) => m.peer === s.you);
    const want = { on: this.view.joined, muted: this.view.muted, deafened: this.view.deafened };
    const key = JSON.stringify(want);
    const serverMatches = !!me && me.voice === want.on && (!want.on || (me.muted === want.muted && me.deafened === want.deafened));
    if (serverMatches && !force) { this.sentVoice = key; return; }
    if (!force && this.sentVoice === key) return;
    if (this.client.send({ t: 'p_voice', ...want })) this.sentVoice = key;
  }

  // ── links ──
  private open(peer: string, pub: string, offer: boolean): Link {
    const pc = new RTCPeerConnection({ iceServers: this.client.iceServers.length ? this.client.iceServers : [{ urls: ['stun:stun.l.google.com:19302'] }] });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.dataset.partyVoice = peer;
    this.audioBox().appendChild(audio);
    const l: Link = { peer, pub, pc, audio, analyser: null, state: 'connecting', restarts: 0, makingOffer: false, pendingIce: [], timer: null, speaking: false, quietSince: null };
    this.links.set(peer, l);
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.ontrack = (ev) => {
      const st = ev.streams[0] ?? new MediaStream([ev.track]);
      audio.srcObject = st;
      void audio.play().catch(() => { /* autoplay: the Join voice tap is the gesture; a later tap retries */ });
      try {
        this.ensureAudio();
        const src = this.actx!.createMediaStreamSource(st);
        l.analyser = this.actx!.createAnalyser();
        l.analyser.fftSize = 512;
        src.connect(l.analyser);
      } catch { l.analyser = null; }
      this.applyAudio();
    };
    pc.onicecandidate = (ev) => { if (ev.candidate) this.client.send({ t: 'p_sig', to: peer, data: { kind: 'ice', candidate: ev.candidate.toJSON() } }); };
    pc.onconnectionstatechange = () => this.onLinkState(l);
    pc.onnegotiationneeded = () => { if (offer) void this.negotiate(l, false); };
    this.armTimeout(l);
    this.setPeer(peer, 'connecting');
    return l;
  }

  private async negotiate(l: Link, iceRestart: boolean): Promise<void> {
    try {
      l.makingOffer = true;
      const o = await l.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (l.pc.signalingState !== 'stable') return;
      await l.pc.setLocalDescription(o);
      this.client.send({ t: 'p_sig', to: l.peer, data: { kind: 'offer', sdp: l.pc.localDescription?.sdp, type: 'offer' } });
    } catch { /* the timeout below marks it */ } finally { l.makingOffer = false; }
  }

  private onLinkState(l: Link): void {
    const st = l.pc.connectionState;
    if (st === 'connected') {
      if (l.timer) clearTimeout(l.timer);
      l.timer = null; l.restarts = 0; l.state = 'connected';
      this.setPeer(l.peer, 'connected');
      return;
    }
    if (st === 'failed') { this.retry(l); return; }
    if (st === 'disconnected') {
      if (l.timer) clearTimeout(l.timer);
      l.timer = setTimeout(() => { if (l.pc.connectionState === 'disconnected') this.retry(l); }, DISCONNECTED_GRACE_MS);
    }
  }

  /** ICE restart by the offerer, RESTARTS_MAX times; after that the link is "couldn't connect". */
  private retry(l: Link): void {
    const me = this.client.getState().you ?? '';
    if (l.restarts >= RESTARTS_MAX) { l.state = 'failed'; this.setPeer(l.peer, 'failed'); return; }
    l.restarts++;
    l.state = 'connecting';
    this.setPeer(l.peer, 'connecting');
    if (offers(me, l.peer)) { try { l.pc.restartIce(); } catch { /* older engines: renegotiate */ } void this.negotiate(l, true); }
    this.armTimeout(l);
  }

  private armTimeout(l: Link): void {
    if (l.timer) clearTimeout(l.timer);
    l.timer = setTimeout(() => {
      if (l.pc.connectionState === 'connected') return;
      if (l.restarts < RESTARTS_MAX) this.retry(l);
      else { l.state = 'failed'; this.setPeer(l.peer, 'failed'); }
    }, CONNECT_TIMEOUT_MS);
  }

  private async onSignal(from: string, data: Record<string, unknown>): Promise<void> {
    const s = this.client.getState();
    const me = s.you ?? '';
    if (data.kind === 'bye') { this.close(from); this.byeFrom.add(from); return; }
    if (!this.view.joined) return;
    const member = s.members.find((m) => m.peer === from);
    if (!member || this.client.blockedPubs().has(member.pub)) return;
    let l = this.links.get(from);
    try {
      if (data.kind === 'offer') {
        this.byeFrom.delete(from);
        if (!l) l = this.open(from, member.pub, offers(me, from));
        const polite = !offers(me, from);
        const collision = l.makingOffer || l.pc.signalingState !== 'stable';
        if (collision && !polite) return;   // the impolite side keeps its own offer
        await l.pc.setRemoteDescription({ type: 'offer', sdp: String(data.sdp ?? '') });   // implicit rollback when polite
        for (const c of l.pendingIce.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
        await l.pc.setLocalDescription(await l.pc.createAnswer());
        this.client.send({ t: 'p_sig', to: from, data: { kind: 'answer', sdp: l.pc.localDescription?.sdp, type: 'answer' } });
      } else if (data.kind === 'answer' && l) {
        if (l.pc.signalingState !== 'have-local-offer') return;
        await l.pc.setRemoteDescription({ type: 'answer', sdp: String(data.sdp ?? '') });
        for (const c of l.pendingIce.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
      } else if (data.kind === 'ice' && l && data.candidate && typeof data.candidate === 'object') {
        const c = data.candidate as RTCIceCandidateInit;
        if (!l.pc.remoteDescription) l.pendingIce.push(c);
        else await l.pc.addIceCandidate(c).catch(() => {});
      }
    } catch { /* a bad frame never takes voice down; the timeout marks a link that never connects */ }
  }

  private close(peer: string): void {
    const l = this.links.get(peer);
    if (!l) return;
    if (l.timer) clearTimeout(l.timer);
    try { l.pc.close(); } catch { /* closed */ }
    l.audio.srcObject = null;
    l.audio.remove();
    this.links.delete(peer);
    const peers = { ...this.view.peers }; delete peers[peer];
    const speaking = { ...this.view.speaking }; delete speaking[peer];
    this.set({ peers, speaking });
  }
  private closeAll(): void { for (const p of [...this.links.keys()]) this.close(p); }

  private setPeer(peer: string, st: LinkState): void {
    if (this.view.peers[peer] === st) return;
    this.set({ peers: { ...this.view.peers, [peer]: st } });
  }

  // ── audio plumbing ──
  private ensureAudio(): void {
    if (this.actx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.actx = Ctx ? new Ctx() : null;
    void this.actx?.resume().catch(() => {});
  }
  private audioBox(): HTMLDivElement {
    if (this.box && this.box.isConnected) return this.box;
    const b = document.createElement('div');
    b.hidden = true;
    b.dataset.partyAudio = '1';
    document.body.appendChild(b);
    this.box = b;
    return b;
  }
  private applyMic(): void {
    const live = micLive(this.view);
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = live; });
  }
  private applyAudio(): void {
    for (const l of this.links.values()) l.audio.muted = this.view.deafened || this.view.mutedPubs.includes(l.pub);
  }
  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.localAnalyser = null;
  }

  private rms(a: AnalyserNode | null): number {
    if (!a) return 0;
    if (this.buf.length !== a.fftSize) this.buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    return Math.sqrt(sum / this.buf.length);
  }

  private startTick(): void {
    if (this.tick) return;
    this.tick = setInterval(() => this.measure(), TICK_MS);
  }
  private stopTick(): void { if (this.tick) clearInterval(this.tick); this.tick = null; }

  /** Speaking flags, ~10 times a second; and the game's duck while a friend is talking. */
  private measure(): void {
    const now = performance.now();
    const me = this.client.getState().you;
    let changed = false;
    const speaking: Record<string, boolean> = { ...this.view.speaking };
    if (me) {
      const n = nextSpeaking(this.localSpeak.speaking, micLive(this.view) ? this.rms(this.localAnalyser) : 0, this.localSpeak.quietSince, now);
      this.localSpeak = n;
      if (!!speaking[me] !== n.speaking) { speaking[me] = n.speaking; changed = true; }
    }
    let anyRemote = false;
    for (const l of this.links.values()) {
      const heard = !this.view.deafened && !this.view.mutedPubs.includes(l.pub);
      const n = nextSpeaking(l.speaking, this.rms(l.analyser), l.quietSince, now);
      l.speaking = n.speaking; l.quietSince = n.quietSince;
      if (!!speaking[l.peer] !== n.speaking) { speaking[l.peer] = n.speaking; changed = true; }
      if (n.speaking && heard) anyRemote = true;
    }
    if (changed) this.set({ speaking });
    if (anyRemote) {
      // the game's music and crowd step back under a friend's voice (the same duck the voiceover lane uses)
      const g = SoundKit.graph();
      if (g) SoundKit.duckForVoice(g.ctx.currentTime, g.ctx.currentTime + 0.4);
    }
  }
}

let mesh: VoiceMesh | null = null;
/** The page's one voice mesh, bound to the party connection. Browser only. */
export function voiceMesh(client: PartyClient): VoiceMesh {
  if (!mesh) mesh = new VoiceMesh(client);
  return mesh;
}
