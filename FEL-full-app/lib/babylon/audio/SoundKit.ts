// SoundKit — the game has shipped with ZERO audio (confirmed live: no
// <audio>/<video> elements, no audio network requests, on any mode). Silence
// is the single biggest thing separating this build from "feels like a
// console game" — every real sports/fighting game has hit impacts, whooshes,
// crowd reaction, and a score chime. There are no licensed audio assets to
// drop in, so this is entirely SYNTHESIZED with the Web Audio API — the same
// "procedural, zero external assets" philosophy VenueKit used for visuals.
// One singleton, lazily created on first user gesture (autoplay policy safe).

// THE IMPACT VOCABULARY (2026-09-14). The kit shipped with nine cues and every physical contact in the
// game — a body hitting the floor, a ball off the iron, a shoe stopping hard, a ball through the net —
// played the SAME `impact` with a different pitch. Nine sounds cannot carry a sports game: a rim rattle and
// a chest-to-chest collision are not the same event and should not be the same noise.
//
// Five added, all synthesised like the rest (no assets, nothing to license):
//   thud    — a body or a heavy landing on the floor: low, short, no ring
//   rattle  — the ball bouncing around the iron before it decides
//   swish   — clean through the net: a soft filtered hiss, no impact at all
//   clang   — a chain net, or metal taking a hit
//   squeak  — rubber on a hard floor: the sound a hard cut actually makes
type SfxName = 'whoosh' | 'impact' | 'score' | 'miss' | 'whistle' | 'uiTick' | 'crowdCheer' | 'crowdGroan' | 'powerUp'
  | 'thud' | 'rattle' | 'swish' | 'clang' | 'squeak' | 'exhaust';

// MUSIC-SUITE P7 (2026-09-29), room-mix-ux: the three player-set bus levels (lib/audio/volumes.ts owns the pure
// arithmetic and the on-device persistence; this file is the only place that arithmetic reaches a real GainNode).
import { busGain, loadVolumes, saveVolume, VOLUME_RAMP_TC, type VolumeBus, type VolumeSettings } from '@/lib/audio/volumes';
// VOICEOVER (2026-10-06): the output presets (phone / TV / headphones) and the ducking under every voice.
import {
  OUTPUT_PRESETS, browserHints, detectOutputPreset, glueTrimDb, loadOutputPreset, musicDuckDb, saveOutputPreset, type OutputPreset,
} from './voice/outputPreset';
import { dbToGain } from './voice/loudness';
import { duckPlan, type DuckSpec } from './voice/ducking';

/** Every bus's own tuned base gain BEFORE a player's volume multiplies it — voiceBus and musicBus already had these
 *  numbers (P2); SFX_BASE_GAIN is new (sfxBus below) and is 1 because every SfxName's envelope was already tuned to
 *  play straight into the master at unity — giving it a bus changes nothing at the default volume (1.0). */
const VOICE_BASE_GAIN = 1.35;
const SFX_BASE_GAIN = 1;

class SoundKitImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdBed: { stop(): void } | null = null;
  private musicEnabled = true;
  private sfxEnabled = true;
  /** Sound effects are off (the announcer's voice goes quiet with them — DUNK MOTION phase 12). */
  get muted(): boolean { return !this.sfxEnabled; }
  // THE MIC (2026-09-24): the MC, the sidekick, the crowd and the players are pre-rendered voice clips (lib/babylon/audio/mic).
  // They share this context (one clock, one iOS unlock) through three nodes: the VOICE bus, the CROWD DUCK (the crowd bed and the
  // crowd one-shots run through it, so the voice can sit on top of them: the harness writes the bed's own gain every frame, so a
  // duck on that node would be fighting it) and a LIMITER on the way out, so a cheer under the MC on top of an impact cannot clip.
  private voiceBus: GainNode | null = null;
  private crowdDuck: GainNode | null = null;
  private out: AudioNode | null = null;
  private voiceEnabled = readVoicePref();
  // MUSIC-SUITE P2 (2026-09-25): THE MUSIC BUS. The Cypher built a second AudioContext for its band and 808 kit and
  // played them straight into the speakers: past this master and limiter (the suite map found, by arithmetic, that the
  // band's downbeat sum can pass 0 dBFS), on a clock 144–160 ms apart from this one (BASELINE.md §2a), and never
  // unlocked by the harness's first gesture (SoundKit.unlock only resumes THIS context: the map's assumed iPhone
  // count-in hang, a banner stuck on '4'). Music now plays on this
  // context through this bus into the master. Its gain undoes the master's 0.55, so the band keeps the loudness it had
  // on its own context (against the SFX it was mixed with) and only the limiter is new. Additive: nothing else routes here.
  private musicBus: GainNode | null = null;
  // MUSIC-SUITE P7 (2026-09-29): THE SFX BUS. Every hit sound and UI tick (play(), below) played straight into
  // `master` — the third of the "three buses on the one graph" the room-mix-ux task asks for had nowhere to live.
  // sfxBus sits exactly where voiceBus and musicBus already did (its own gain node, between the sound and master),
  // so play()'s cases changed only their connect() target, never their own envelope math.
  private sfxBus: GainNode | null = null;
  /** A copy of the mix for a local recording. Speakers stay connected. Nothing is uploaded. */
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  /** The three player-set levels (0..1 each), read once at construction (lib/audio/volumes.ts's own on-device
   *  persistence — the same guarded-localStorage shape readVoicePref/writeVoicePref below already use) and kept
   *  live from there on: setVolume() below is the only thing that ever changes it after this. */
  private volumes: VolumeSettings = loadVolumes();
  /** The MC's voice is on (a player setting, kept across sessions; the captions carry the call either way). */
  get voiceOn(): boolean { return this.voiceEnabled && this.sfxEnabled; }
  setVoice(on: boolean): void { this.voiceEnabled = on; writeVoicePref(on); }
  /** The graph the voice (and, MUSIC-SUITE P2, the music; MUSIC-SUITE P7, sfx) plays into; null before a context can
   *  exist (server, no Web Audio). */
  graph(): { ctx: AudioContext; voice: GainNode; voiceIn: AudioNode; crowdDuck: GainNode; out: AudioNode; music: GainNode; sfx: GainNode } | null {
    const ctx = this.ensure();
    return ctx && this.voiceBus && this.voiceIn && this.crowdDuck && this.out && this.musicBus && this.sfxBus
      ? { ctx, voice: this.voiceBus, voiceIn: this.voiceIn, crowdDuck: this.crowdDuck, out: this.out, music: this.musicBus, sfx: this.sfxBus } : null;
  }

  // ── VOICEOVER (2026-10-06): output presets and ducking ──────────────────────────────────────────────────────────────
  // The voice chain: voiceIn → high-pass → presence → trim → voiceBus (the player's VOICE level). It sits UPSTREAM of the bus so
  // the bus keeps its own tuned gain and its one hop to master (SoundKit.busRouting.test). VoiceKit plays into voiceIn.
  // The master chain: master → high-pass → glue compressor → glue trim → the limiter (unchanged, still `out`).
  private voiceIn: GainNode | null = null;
  private voiceHp: BiquadFilterNode | null = null;
  private presence: BiquadFilterNode | null = null;
  private voiceTrim: GainNode | null = null;
  private masterHp: BiquadFilterNode | null = null;
  private glue: DynamicsCompressorNode | null = null;
  private glueTrim: GainNode | null = null;
  private presetPicked: OutputPreset | null = loadOutputPreset();
  private presetDetected: OutputPreset | null = null;
  /** The voice span the mix is ducked for (audio-clock seconds), and the court it was for (a rhythm room ducks its song less). */
  private duckSpan: [number, number] | null = null;
  private duckCourt: string | null = null;

  /** The game's audio context exists and is running (a gesture unlocked it). Never builds one. */
  get audioRunning(): boolean { return this.ctx?.state === 'running'; }

  /** The output preset in effect: the player's pick, else detected from this device. */
  get outputPreset(): OutputPreset {
    return this.presetPicked ?? (this.presetDetected ??= detectOutputPreset(browserHints()));
  }
  /** True when the player picked the preset (false: detected). */
  get outputPresetPicked(): boolean { return this.presetPicked !== null; }
  /** Pick a preset (null: back to detecting). Persists, and moves the live graph with a short glide. */
  setOutputPreset(p: OutputPreset | null): void {
    this.presetPicked = p;
    saveOutputPreset(p);
    this.applyPreset(false);
  }

  /**
   * A voice plays from t0 to t1 (audio-clock seconds): the music, the effects and the crowd step down under it by the preset's
   * depths (ducking.ts). A span that starts before the last one has finished releasing extends it: one duck, no bobbing between
   * the MC and the sidekick. `cut` ends the span early (the voice was cut off or hushed).
   */
  duckForVoice(t0: number, t1: number, court?: string | null): void {
    const ctx = this.ctx; if (!ctx) return;
    const spec = OUTPUT_PRESETS[this.outputPreset];
    const cur = this.duckSpan;
    this.duckSpan = cur && t0 <= cur[1] + spec.release ? [Math.min(cur[0], t0), Math.max(cur[1], t1)] : [t0, t1];
    this.duckCourt = court ?? null;
    this.writeDucks();
  }
  /** The voice stopped early at `t` (a cut, a hush): release the duck from there. */
  releaseDuck(t: number): void {
    if (!this.duckSpan || !this.ctx) return;
    this.duckSpan = [this.duckSpan[0], Math.min(this.duckSpan[1], Math.max(t, this.ctx.currentTime))];
    this.writeDucks();
  }

  private duckSpecs(): { music: DuckSpec; sfx: DuckSpec; crowd: DuckSpec } {
    const s = OUTPUT_PRESETS[this.outputPreset];
    const d = (depthDb: number): DuckSpec => ({ depthDb, attack: s.attack, release: s.release });
    return { music: d(musicDuckDb(s, this.duckCourt)), sfx: d(s.duck.sfx), crowd: d(s.duck.crowd) };
  }
  /** Write the duck plan (or the plain resting level) onto the three targets from now on. */
  private writeDucks(only?: VolumeBus): void {
    const ctx = this.ctx; if (!ctx) return;
    const now = ctx.currentTime, specs = this.duckSpecs();
    const write = (param: AudioParam, level: number, spec: DuckSpec): void => {
      param.cancelScheduledValues(now);
      for (const e of duckPlan(now, this.duckSpan, level, spec, VOLUME_RAMP_TC)) param.setTargetAtTime(e.target, e.at, e.tau);
    };
    if (this.musicBus && (!only || only === 'music')) write(this.musicBus.gain, busGain(1 / MASTER_GAIN, this.volumes.music), specs.music);
    if (this.sfxBus && (!only || only === 'sfx')) write(this.sfxBus.gain, busGain(SFX_BASE_GAIN, this.volumes.sfx), specs.sfx);
    if (this.crowdDuck && !only) write(this.crowdDuck.gain, 1, specs.crowd);
  }
  /** Set every preset-driven node (instant on build, a short glide on a change). */
  private applyPreset(instant: boolean): void {
    const ctx = this.ctx; if (!ctx) return;
    const s = OUTPUT_PRESETS[this.outputPreset];
    const set = (param: AudioParam | undefined, v: number): void => {
      if (!param) return;
      if (instant) param.value = v; else param.setTargetAtTime(v, ctx.currentTime, VOLUME_RAMP_TC);
    };
    set(this.voiceHp?.frequency, s.voiceHpHz);
    set(this.presence?.frequency, s.presenceHz); set(this.presence?.gain, s.presenceDb);
    set(this.voiceTrim?.gain, dbToGain(s.voiceTrimDb));
    set(this.masterHp?.frequency, s.masterHpHz);
    if (this.glue) {
      set(this.glue.threshold, s.glue.threshold); set(this.glue.knee, s.glue.knee); set(this.glue.ratio, s.glue.ratio);
      set(this.glue.attack, s.glue.attack); set(this.glue.release, s.glue.release);
    }
    set(this.glueTrim?.gain, dbToGain(glueTrimDb(s)));
  }

  /** MUSIC-SUITE P7: the player's saved MUSIC / SFX / VOICE levels (0..1 each) — read by the settings UI
   *  (lib/audio/ui/VolumeMixer.tsx) so it shows the level actually in effect, not just whatever it last saved. */
  getVolumes(): VolumeSettings { return { ...this.volumes }; }

  /**
   * Move one bus live and persist it (lib/audio/volumes.ts's saveVolume — merges with the other two, so setting SFX
   * never touches a saved MUSIC or VOICE level). Safe to call before a context exists: the save still lands, and
   * ensure() reads it (via `this.volumes`, already updated below) the moment one is finally built. The gain glides
   * (setTargetAtTime, VOLUME_RAMP_TC) rather than jumps, so a drag never clicks — the same technique the Academy's
   * own live desk uses for a mixer move (mixGraph.ts RAMP_TC).
   */
  setVolume(bus: VolumeBus, level: number): void {
    this.volumes = saveVolume(bus, level);
    const ctx = this.ctx;
    if (!ctx) return;
    // VOICEOVER: music and sfx may be mid-duck: their new level goes through the duck plan, so a release scheduled before the
    // drag cannot later glide them back to the OLD level.
    if (bus !== 'voice') { this.writeDucks(bus); return; }
    this.voiceBus?.gain.setTargetAtTime(busGain(VOICE_BASE_GAIN, this.volumes.voice), ctx.currentTime, VOLUME_RAMP_TC);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    // MUSIC-SUITE P2 FIX PASS (2026-09-25): no audio-session change here any more. P2 set 'playback' at this point, the
    // first time ANY mode built this context, which (on iOS, assumed) stopped the player's own music and played through
    // the silent switch in every game mode. The music rooms claim it themselves (lib/audio/session.ts).
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.12;
    // VOICEOVER (2026-10-06): master → high-pass → glue → glue trim → limiter (the preset sets all three; applyPreset below)
    this.masterHp = this.ctx.createBiquadFilter(); this.masterHp.type = 'highpass'; this.masterHp.Q.value = 0.707;
    this.glue = this.ctx.createDynamicsCompressor();
    this.glueTrim = this.ctx.createGain();
    this.master.connect(this.masterHp).connect(this.glue).connect(this.glueTrim).connect(limiter).connect(this.ctx.destination);
    this.out = limiter;   // everything the game sounds like, last node before the speakers (a dev probe can tap it)
    this.crowdDuck = this.ctx.createGain(); this.crowdDuck.connect(this.master);
    this.voiceBus = this.ctx.createGain(); this.voiceBus.gain.value = busGain(VOICE_BASE_GAIN, this.volumes.voice); this.voiceBus.connect(this.master);
    // VOICEOVER: the voice chain feeds the bus (voiceIn → high-pass → presence → trim → voiceBus)
    this.voiceIn = this.ctx.createGain();
    this.voiceHp = this.ctx.createBiquadFilter(); this.voiceHp.type = 'highpass'; this.voiceHp.Q.value = 0.707;
    this.presence = this.ctx.createBiquadFilter(); this.presence.type = 'peaking'; this.presence.Q.value = 0.9;
    this.voiceTrim = this.ctx.createGain();
    this.voiceIn.connect(this.voiceHp).connect(this.presence).connect(this.voiceTrim).connect(this.voiceBus);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = busGain(1 / MASTER_GAIN, this.volumes.music); this.musicBus.connect(this.master);   // MUSIC-SUITE P2
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = busGain(SFX_BASE_GAIN, this.volumes.sfx); this.sfxBus.connect(this.master);   // MUSIC-SUITE P7
    this.applyPreset(true);
    return this.ctx;
  }

  /** Call once from a user-gesture handler (first touch/click/keydown) —
   *  browsers block audio until a gesture; the harness should call this from
   *  the "TAP TO START" / first input handler. Safe to call repeatedly. */
  unlock(): void {
    const ctx = this.ensure();
    // not only 'suspended': Safari parks a context in 'interrupted' after a call or a trip to the background
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume();
  }

  setEnabled(sfx: boolean, music: boolean): void {
    this.sfxEnabled = sfx;
    this.musicEnabled = music;
    if (!music && this.crowdBed) { this.crowdBed.stop(); this.crowdBed = null; }
  }

  private noiseBuffer(ctx: AudioContext, seconds: number, color: 'white' | 'brown' = 'white'): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.2; }
      else data[i] = white;
    }
    return buf;
  }

  private env(node: GainNode, ctx: AudioContext, attack: number, decay: number, peak = 1): void {
    const t = ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  play(name: SfxName, opts: { pitch?: number; volume?: number } = {}): void {
    if (!this.sfxEnabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.sfxBus) return;
    const vol = opts.volume ?? 1;
    const pitch = opts.pitch ?? 1;

    switch (name) {
      // A BODY ON THE FLOOR. Low sine that drops fast, plus a short noise slap for the contact — no ring,
      // because a floor does not ring. This is the landing/knockdown sound the modes were faking with a
      // pitched-down `impact`.
      case 'thud': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110 * pitch, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(38 * pitch, ctx.currentTime + 0.14);
        const og = ctx.createGain();
        this.env(og, ctx, 0.004, 0.16, 0.9 * vol);
        osc.connect(og).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.2);

        const slap = ctx.createBufferSource();
        slap.buffer = this.noiseBuffer(ctx, 0.08, 'brown');
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 420;
        const sg = ctx.createGain();
        this.env(sg, ctx, 0.002, 0.07, 0.5 * vol);
        slap.connect(lp).connect(sg).connect(this.sfxBus);
        slap.start(); slap.stop(ctx.currentTime + 0.1);
        break;
      }

      // THE IRON MAKING UP ITS MIND. Three quick metallic pings at falling amplitude — a rattle is a
      // SEQUENCE, and one ping is what makes a miss read as a clank instead.
      case 'rattle': {
        for (let i = 0; i < 3; i++) {
          const t0 = ctx.currentTime + i * 0.055;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime((820 + i * 90) * pitch, t0);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.30 * vol * (1 - i * 0.28), t0 + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
          osc.connect(g).connect(this.sfxBus);
          osc.start(t0); osc.stop(t0 + 0.1);
        }
        break;
      }

      // CLEAN THROUGH. Deliberately NOT an impact: nylon on a ball is a short filtered hiss, and the whole
      // point of a swish is that nothing hard was touched.
      case 'swish': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 0.22);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.6;
        bp.frequency.setValueAtTime(3200 * pitch, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(1300 * pitch, ctx.currentTime + 0.18);
        const g = ctx.createGain();
        this.env(g, ctx, 0.012, 0.2, 0.22 * vol);
        src.connect(bp).connect(g).connect(this.sfxBus);
        src.start(); src.stop(ctx.currentTime + 0.24);
        break;
      }

      // CHAIN NET / METAL. Two detuned partials that beat against each other — the beating IS the metal.
      case 'clang': {
        for (const [mul, amp] of [[1, 0.28], [1.48, 0.2], [2.31, 0.12]] as const) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = 640 * mul * pitch;
          const g = ctx.createGain();
          this.env(g, ctx, 0.003, 0.34, amp * vol);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 5200;
          osc.connect(lp).connect(g).connect(this.sfxBus);
          osc.start(); osc.stop(ctx.currentTime + 0.4);
        }
        break;
      }

      // RUBBER ON A HARD FLOOR. A fast upward chirp through a tight bandpass — a squeak is pitch MOVING,
      // which is why a static tone reads as a beep and never as a shoe.
      case 'squeak': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 0.14);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 12;
        bp.frequency.setValueAtTime(1400 * pitch, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(2600 * pitch, ctx.currentTime + 0.09);
        const g = ctx.createGain();
        this.env(g, ctx, 0.006, 0.1, 0.16 * vol);
        src.connect(bp).connect(g).connect(this.sfxBus);
        src.start(); src.stop(ctx.currentTime + 0.16);
        break;
      }

      case 'whoosh': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 0.28);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(600 * pitch, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(2200 * pitch, ctx.currentTime + 0.22);
        const g = ctx.createGain();
        this.env(g, ctx, 0.02, 0.24, 0.35 * vol);
        src.connect(bp).connect(g).connect(this.sfxBus);
        src.start(); src.stop(ctx.currentTime + 0.3);
        break;
      }
      // AN ENGINE SPOOLING UP (10-phase pass, phase 8 — the kart's boost exhaust note). A boost ignition was a
      // `whoosh` of moving air and nothing from the machine; the machine is the kart. A low sawtooth RISES (the
      // revs coming on, not a release falling off) with a brown-noise chug under it through a lowpass — the
      // two-stroke bark read at phone volume, short enough to layer under the whoosh without smearing it.
      case 'exhaust': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(68 * pitch, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180 * pitch, ctx.currentTime + 0.22);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 900;
        const g = ctx.createGain();
        this.env(g, ctx, 0.008, 0.3, 0.5 * vol);
        osc.connect(lp).connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.34);

        const chug = ctx.createBufferSource();
        chug.buffer = this.noiseBuffer(ctx, 0.16, 'brown');
        const cl = ctx.createBiquadFilter();
        cl.type = 'lowpass'; cl.frequency.value = 320;
        const cg = ctx.createGain();
        this.env(cg, ctx, 0.004, 0.18, 0.4 * vol);
        chug.connect(cl).connect(cg).connect(this.sfxBus);
        chug.start(); chug.stop(ctx.currentTime + 0.2);
        break;
      }
      case 'impact': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(140 * pitch, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(45 * pitch, ctx.currentTime + 0.12);
        const g = ctx.createGain();
        this.env(g, ctx, 0.004, 0.14, 0.6 * vol);
        osc.connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.16);
        // + a noise crack layered on top for texture
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 0.06);
        const g2 = ctx.createGain();
        this.env(g2, ctx, 0.002, 0.05, 0.25 * vol);
        src.connect(g2).connect(this.sfxBus);
        src.start();
        break;
      }
      case 'score': {
        const notes = [523.25, 659.25, 783.99, 1046.5];        // C-E-G-C arpeggio
        notes.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f * pitch;
          const g = ctx.createGain();
          const t0 = ctx.currentTime + i * 0.07;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
          osc.connect(g).connect(this.sfxBus!);
          osc.start(t0); osc.stop(t0 + 0.32);
        });
        break;
      }
      case 'miss': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.4);
        const g = ctx.createGain();
        this.env(g, ctx, 0.01, 0.38, 0.28 * vol);
        osc.connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.42);
        break;
      }
      case 'whistle': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(2100, ctx.currentTime + 0.5);
        const g = ctx.createGain();
        this.env(g, ctx, 0.02, 0.5, 0.3 * vol);
        osc.connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.55);
        break;
      }
      case 'uiTick': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 1200 * pitch;
        const g = ctx.createGain();
        this.env(g, ctx, 0.001, 0.045, 0.18 * vol);
        osc.connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.06);
        break;
      }
      case 'powerUp': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.35);
        const g = ctx.createGain();
        this.env(g, ctx, 0.02, 0.4, 0.3 * vol);
        osc.connect(g).connect(this.sfxBus);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
        break;
      }
      case 'crowdCheer':
      case 'crowdGroan': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 1.4, 'brown');
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = name === 'crowdCheer' ? 1400 : 380;
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime((name === 'crowdCheer' ? 0.4 : 0.3) * vol, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        src.connect(bp).connect(g).connect(this.crowdDuck ?? this.master);
        src.start(); src.stop(t + 1.4);
        break;
      }
    }
  }

  /** Looping ambient crowd bed for outdoor/stadium venues. Call once per
   *  mode load; returns nothing — call stopAmbient() on mode dispose. */
  startAmbient(kind: 'stadium' | 'dojo' | 'ocean' | 'wind' | 'none'): void {
    this.stopAmbient();
    if (kind === 'none' || !this.musicEnabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 4, 'brown');
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'stadium' ? 900 : kind === 'ocean' ? 500 : kind === 'wind' ? 1400 : 220;
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = kind === 'stadium' ? 0.05 : kind === 'ocean' ? 0.07 : kind === 'wind' ? 0.04 : 0.025;
    // slow LFO on gain so the crowd bed breathes instead of droning
    const lfo = ctx.createOscillator();
    lfo.frequency.value = kind === 'ocean' ? 0.45 : kind === 'wind' ? 0.3 : 0.15;  // waves breathe faster
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = g.gain.value * 0.4;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    src.connect(bp).connect(g).connect(this.crowdDuck ?? this.master);
    src.start();
    this.crowdGain = g;
    this.crowdBaseGain = g.gain.value;
    this.crowdBed = { stop: () => { try { src.stop(); lfo.stop(); } catch { /* already stopped */ } } };
  }

  private crowdGain: GainNode | null = null;
  private crowdBaseGain = 0.05;
  /** Mode 1 Phase 9: scale the crowd bed with CrowdEnergy/momentum so the
   *  building audibly rises and hushes with the game. level 0..1. */
  setAmbientLevel(level01: number): void {
    if (!this.crowdGain) return;
    const k = Math.max(0, Math.min(1, level01));
    this.crowdGain.gain.value = this.crowdBaseGain * (0.35 + k * 2.2);
  }

  /**
   * The game mix, as a stream a local recording can add. The speakers are unchanged: this is a second
   * wire off the limiter. Null when this browser has no audio context. Never sent anywhere.
   */
  captureMix(): MediaStream | null {
    const ctx = this.ensure();
    if (!ctx || !this.out || typeof ctx.createMediaStreamDestination !== 'function') return null;
    if (!this.recordDest) {
      this.recordDest = ctx.createMediaStreamDestination();
      this.out.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  stopAmbient(): void {
    this.crowdBed?.stop();
    this.crowdBed = null;
    this.crowdGain = null;
  }
}

const MASTER_GAIN = 0.55;

// MUSIC-SUITE P2 FIX PASS (2026-09-25): playbackAudioSession() lived here and was called for every mode; it moved to
// lib/audio/session.ts as a CLAIM the music rooms make (DanceMode, the Academy's AudioEngine, the legacy maker, the
// calibration screen) and give back.

const VOICE_PREF_KEY = 'fel-audio';
function readVoicePref(): boolean {
  try { return typeof localStorage === 'undefined' ? true : (JSON.parse(localStorage.getItem(VOICE_PREF_KEY) ?? '{}') as { voice?: boolean }).voice !== false; }
  catch { return true; }
}
function writeVoicePref(on: boolean): void {
  try {
    const cur = JSON.parse(localStorage.getItem(VOICE_PREF_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(VOICE_PREF_KEY, JSON.stringify({ ...cur, voice: on }));
  } catch { /* private mode: the setting lasts the session */ }
}

export const SoundKit = new SoundKitImpl();

// WIRING
// ModeHarness — on the very first input event of a session (works for
// touch/keyboard/gamepad alike): SoundKit.unlock(). Everything else is
// mode-level `SoundKit.play('name')` calls, already added to every mode file
// in this batch. Settings screen (if/when built): SoundKit.setEnabled(sfx,
// music) — wire to a mute toggle; this is a fully self-contained system with
// no asset pipeline, so shipping it is a pure code drop.
