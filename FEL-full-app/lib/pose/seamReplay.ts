// seamReplay — the P3 seam replayed on a pose stream (movement play P3, 2026-09-24): the gate's engine and SEAM.md's.
//
//   frames ──BodyReader──▶ ChannelReader ──▶ BodyPacket (at the frame's `arrive`)
//          ──▶ BodySession (START / pause / release) + BodyFloor(profile) ──▶ BodyArbiter (+ a scripted pad) ──▶ the mode
//
// the same chain the harness runs from step 3 (plan §4.4), over a minimal phase machine instead of a Babylon scene:
// READY → 'playing' by the body's START intent or a scripted external press (StartWake's rules), a START press or a
// body-lost / stall intent → 'paused', and back by a hands-up hold or any real press. Or one phase held throughout
// (`phase: 'playing'` …), where the intents are recorded and not acted on — the gate's REST rows use that.
//
// The result is in lib/pose/baseline.ts's Replay shape, so the P1 mode reads (dunkRead, shotRead, actRead, restStick,
// stickYStats) read the seam unchanged — `events` (alias `out`) is what the MODE received — plus what the gate needs
// on top: every event on the bus in any phase, the floor's raw outputs, the intents, the phases and the evidence.
//
// Clocks, as in the page: a packet is handled at its frame's `arrive` (the app clock), render ticks run at rafHz from
// the first packet, and the capture clock (`t`) of a tick-made event is the latest frame's plus the time since it
// arrived. Deterministic; pure (no DOM, no Babylon).
import { BodyReader, type BodyRead, type BodyReaderOptions } from './BodyReader';
import { ChannelReader } from './bodyChannels';
import type { PoseFrame } from './landmarks';
import type { Emitted, Replay } from './baseline';
import { BodySession, type BodyIntent, type SessionStep } from '../babylon/core/BodySession';
import { bodySeamFor } from '../babylon/core/bodySeam';
import { isWakeInput, WakeLatch } from '../babylon/core/StartWake';
import type { BodyOut, BodyPacket, FelInput } from '../babylon/core/InputBus';
import type { ModePhase } from '../babylon/core/ModeHarness';
import { BodyArbiter, type HoldKey } from '../input/arbiter';
import type { BodyProfile } from '../input/bodyProfiles';

/** One camera frame's packet, and which stream frame it came from (< 0 = the stand lead, as baseline's Emitted.frame). */
export interface StreamPacket extends BodyPacket { frame: number }

/** A stream through the reader and the channels, once: every profile's replay shares it. */
export function bodyPackets(frames: readonly PoseFrame[], opts: { lead?: number; reader?: BodyReaderOptions } = {}): StreamPacket[] {
  const reader = new BodyReader(opts.reader), channels = new ChannelReader();
  const lead = opts.lead ?? 0;
  let arrive = -Infinity;
  return frames.map((f, i) => {
    const { read, events } = reader.read(f);
    arrive = Math.max(arrive, f.arrive ?? f.t);   // a frame is handed over in order, never before the one ahead of it
    return { read, events, channels: channels.step(read, events), arrivedAt: arrive, frame: i - lead };
  });
}

/** An external input at app time `at`: a key, a touch verb, a Controller Link relay — or a pad's, with `padSeated`. */
export interface ScriptedInput { at: number; e: FelInput }
export interface SeamOptions {
  profile: BodyProfile;
  /** Default: the profile binds something (a mode's onBody would count too; none in P3). */
  drives?: boolean;
  overheadIsPlay?: boolean;
  /** 'machine' (default): the phase machine above, from `start`. Any ModePhase: held throughout, intents only recorded. */
  phase?: 'machine' | ModePhase;
  start?: 'ready' | 'playing';
  /** External inputs, in time order. `padSeated`: a pad is connected, so its trigger goes out every tick, folded. */
  inputs?: readonly ScriptedInput[];
  padSeated?: boolean;
  rafHz?: number;
  /** Publish a final packet one frame after the last (the Body switched off): default true. */
  final?: boolean;
  /** Render ticks kept running after the last packet (ms): default 500. */
  tailMs?: number;
  name?: string;
  /** The take's frame the stand copies (Replay.standFrame): default −1. */
  standFrame?: number;
}

export interface SeamEmitted extends Emitted { seq: number; phase: ModePhase }
export interface SeamIntent { intent: BodyIntent; at: number; t: number; frame: number; seq: number; phase: ModePhase }
export interface SeamPhase { at: number; t: number; seq: number; phase: ModePhase; why: 'start' | 'input' | 'body' | 'body-lost' | 'stall' }
export interface SeamReplay extends Replay {
  events: SeamEmitted[];
  /** = events: what the mode received (plan §5 step 2 names it `out`). */
  out: SeamEmitted[];
  /** Everything delivered on the bus, whatever the phase (the mode gets only the 'playing' ones). */
  bus: SeamEmitted[];
  /** The floor's own outputs, before the arbiter composed them. */
  floor: SeamEmitted[];
  intents: SeamIntent[];
  phases: SeamPhase[];
  /** Counted play evidence (EvidenceCounter), by source. */
  evidence: { body: number; external: number };
  /** Per packet, in order: the session's view (presence, the START ring, the latch) and `seq`, the mark every item
   *  recorded while handling that packet sits under — the state "right after this frame" is everything below it. */
  steps: { at: number; t: number; frame: number; tracking: boolean; presence: SessionStep['presence']; handsUp01: number; latched: boolean; seq: number }[];
}

const absent = (t: number, calibrated: boolean): BodyRead => ({
  t, present: false, conf: null, calibrated, tracking: false, rulers: null, hip: null, feet: null,
  airborne: null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
});

const holdKey = (e: Extract<FelInput, { t: 'button' | 'dpad' }>): HoldKey => (e.t === 'button' ? `b:${e.btn}` : `d:${e.dir}`);

export function seamReplay(packets: readonly StreamPacket[], opt: SeamOptions): SeamReplay {
  const profile = opt.profile;
  const machine = (opt.phase ?? 'machine') === 'machine';
  let phase: ModePhase = machine ? (opt.start ?? 'ready') : (opt.phase as ModePhase);
  const padSeated = !!opt.padSeated;
  const rafMs = 1000 / (opt.rafHz ?? 60);

  // MOVEMENT PLAY P3 (2026-09-24, the step-3 review): built the way the harness builds it (bodySeamFor), so the gate
  // replays the harness's own construction — `drives` and the session with it — not a copy of it
  const seam = bodySeamFor({ modeId: profile.modeId, body: { profile, overheadIsPlay: opt.overheadIsPlay } });
  const drives = opt.drives ?? seam.drives;
  const session = drives === seam.drives ? seam.session : new BodySession({ drives, overheadIsPlay: seam.overheadIsPlay });
  const { floor, evidence } = seam;
  const held = new Set<HoldKey>();                   // the pad's / keys' own held buttons (the bus's `held`)
  const arbiter = new BodyArbiter((k) => held.has(k));
  const latch = new WakeLatch();
  const padT = { L: 0, R: 0 };

  const out: SeamReplay = {
    name: opt.name ?? profile.key, events: [], out: [], bus: [], floor: [], intents: [], phases: [], evidence: { body: 0, external: 0 }, steps: [],
    cal: null, calAt: NaN, calFrame: NaN, standFrame: opt.standFrame ?? -1, takeAt: NaN, endAt: NaN,
  };
  out.out = out.events;
  let seq = 0;
  // the clock the current item runs on: app ms, and the capture clock / stream frame it maps to
  let now = -Infinity, capT = NaN, frame = NaN, lat = 0;
  const stamp = () => ({ at: now, t: capT, frame, seq: seq++, phase });

  const setPhase = (p: ModePhase, why: SeamPhase['why']): void => {
    phase = p;
    out.phases.push({ at: now, t: capT, seq: seq++, phase: p, why });
  };
  out.phases.push({ at: NaN, t: NaN, seq: seq++, phase, why: 'start' });

  /** The harness's input.on handler (plan §4.4 + ModeHarness :492-530), on a delivered event. */
  const deliver = (e: FelInput): void => {
    out.bus.push({ e, ...stamp() });
    if (machine) {
      if (phase === 'ready' && isWakeInput(e)) {
        wake('input');
        if (!latch.wake(e, now)) return;
      }
      if (phase === 'playing' && e.t === 'button' && e.btn === 'START' && e.pressed) { releaseBody(); setPhase('paused', 'input'); return; }
      if (phase === 'paused' && e.t === 'button' && e.pressed && e.src !== 'body') { resume('input'); return; }
    }
    if (phase !== 'playing') return;
    if (!latch.pass(e, now)) return;
    const c = evidence.count(e, now);
    if (c) { out.evidence[c]++; session.noteInput(c, now); }
    out.events.push({ e, ...stamp() });
  };
  const emitBody = (e: BodyOut): void => {
    out.floor.push({ e, ...stamp() });
    for (const x of arbiter.body(e, padSeated)) deliver(x);
  };
  const releaseBody = (): void => { for (const e of floor.release()) emitBody(e); };
  // MOVEMENT PLAY P3 (2026-09-24, the step-2 review): EVERY wake and resume begins the floor and the session — the
  // body's START and a tap, a key or a pad alike — and tells the session which one it was (the driver until the game
  // counts an input). Plan §4.4 calls them on the body's wake only; the harness (step 3) does it here, inside wake()
  // and resume() themselves, so no path (input.on's READY branch, the agent bridge's start) can skip them and leave a
  // stale START or lost deadline behind. The seam scan pins it.
  function wake(why: 'input' | 'body'): void {
    setPhase('playing', why);
    floor.begin(); session.begin(now, why === 'body' ? 'body' : 'external');
  }
  function resume(why: 'input' | 'body'): void {
    setPhase('playing', why);
    floor.begin(); session.begin(now, why === 'body' ? 'body' : 'external');
  }
  const applyBody = (s: SessionStep): void => {
    if (s.release) releaseBody();                     // releases FIRST, still 'playing'
    for (const it of s.intents) {
      out.intents.push({ intent: it, ...stamp() });
      if (!machine) continue;
      if (it === 'wake' && phase === 'ready') wake('body');
      if (it === 'resume' && phase === 'paused') resume('body');
      if ((it === 'pause-lost' || it === 'pause-stall') && phase === 'playing') {
        releaseBody(); setPhase('paused', it === 'pause-lost' ? 'body-lost' : 'stall');
      }
    }
  };
  const onPacket = (p: StreamPacket): void => {
    const s = session.step(phase, p, now);
    applyBody(s);
    if (p.final) releaseBody();
    if (phase === 'playing') for (const e of floor.step(p, now, s.latched)) emitBody(e);
    out.steps.push({ at: now, t: capT, frame, tracking: p.read.tracking, presence: s.presence, handsUp01: s.handsUp01, latched: s.latched, seq: seq++ });
  };
  const onTick = (lastPacketAt: number): void => {
    applyBody(session.tick(phase, now, lastPacketAt));
    for (const e of floor.tick(now)) emitBody(e);
    if (padSeated) {                                  // pollPads: the merged pad's triggers, every frame, folded
      deliver(arbiter.foldTrigger('L', padT.L));
      deliver(arbiter.foldTrigger('R', padT.R));
    }
  };
  const onInput = (e: FelInput): void => {
    if (e.t === 'button' || e.t === 'dpad') { if (e.pressed) held.add(holdKey(e)); else held.delete(holdKey(e)); }
    if (e.t === 'trigger' && padSeated) { padT[e.side] = e.value; return; }   // a seated pad's trigger rides the ticks
    deliver(arbiter.external(e, padSeated));
  };

  // ── the timeline: packets at their arrive, scripted inputs, render ticks ──
  const all: StreamPacket[] = [...packets];
  const last = packets[packets.length - 1];
  if (last && opt.final !== false) {
    const step = packets.length > 1 ? Math.max(1, last.read.t - packets[packets.length - 2].read.t) : 33;
    all.push({ read: absent(last.read.t + step, last.read.calibrated), events: [], channels: last.channels, arrivedAt: last.arrivedAt + step, final: true, frame: last.frame + 1 });
  }
  const inputs = [...(opt.inputs ?? [])].sort((a, b) => a.at - b.at);
  const t0 = all.length ? all[0].arrivedAt : inputs.length ? inputs[0].at : 0;
  const tEnd = Math.max(all.length ? all[all.length - 1].arrivedAt : t0, inputs.length ? inputs[inputs.length - 1].at : t0) + (opt.tailMs ?? 500);
  let pi = 0, ii = 0, lastPacketAt = -Infinity;
  for (let tick = t0; tick <= tEnd + 1e-9; tick += rafMs) {
    // everything that happened up to this frame, in time order (a packet before an input at the same instant)
    for (;;) {
      const pa = pi < all.length ? all[pi].arrivedAt : Infinity, ia = ii < inputs.length ? inputs[ii].at : Infinity;
      if (Math.min(pa, ia) > tick) break;
      if (pa <= ia) {
        const p = all[pi++];
        now = p.arrivedAt; capT = p.read.t; frame = p.frame; lat = now - capT;
        if (!Number.isFinite(out.takeAt) && p.frame >= 0) out.takeAt = now;
        if (!Number.isFinite(out.calAt) && p.read.calibrated) { out.calAt = now; out.calFrame = p.frame; }
        lastPacketAt = now;
        onPacket(p);
      } else {
        const x = inputs[ii++];
        now = x.at; capT = now - lat;
        onInput(x.e);
      }
    }
    now = tick; capT = tick - lat;
    onTick(lastPacketAt);
    out.endAt = tick;
  }
  return out;
}
