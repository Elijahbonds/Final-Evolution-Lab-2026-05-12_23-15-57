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
  | 'thud' | 'rattle' | 'swish' | 'clang' | 'squeak';

class SoundKitImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdBed: { stop(): void } | null = null;
  private musicEnabled = true;
  private sfxEnabled = true;
  /** Sound effects are off (the announcer's voice goes quiet with them — DUNK MOTION phase 12). */
  get muted(): boolean { return !this.sfxEnabled; }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Call once from a user-gesture handler (first touch/click/keydown) —
   *  browsers block audio until a gesture; the harness should call this from
   *  the "TAP TO START" / first input handler. Safe to call repeatedly. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
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
    if (!ctx || !this.master) return;
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
        osc.connect(og).connect(this.master);
        osc.start(); osc.stop(ctx.currentTime + 0.2);

        const slap = ctx.createBufferSource();
        slap.buffer = this.noiseBuffer(ctx, 0.08, 'brown');
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 420;
        const sg = ctx.createGain();
        this.env(sg, ctx, 0.002, 0.07, 0.5 * vol);
        slap.connect(lp).connect(sg).connect(this.master);
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
          osc.connect(g).connect(this.master);
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
        src.connect(bp).connect(g).connect(this.master);
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
          osc.connect(lp).connect(g).connect(this.master);
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
        src.connect(bp).connect(g).connect(this.master);
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
        src.connect(bp).connect(g).connect(this.master);
        src.start(); src.stop(ctx.currentTime + 0.3);
        break;
      }
      case 'impact': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(140 * pitch, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(45 * pitch, ctx.currentTime + 0.12);
        const g = ctx.createGain();
        this.env(g, ctx, 0.004, 0.14, 0.6 * vol);
        osc.connect(g).connect(this.master);
        osc.start(); osc.stop(ctx.currentTime + 0.16);
        // + a noise crack layered on top for texture
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx, 0.06);
        const g2 = ctx.createGain();
        this.env(g2, ctx, 0.002, 0.05, 0.25 * vol);
        src.connect(g2).connect(this.master);
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
          osc.connect(g).connect(this.master!);
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
        osc.connect(g).connect(this.master);
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
        osc.connect(g).connect(this.master);
        osc.start(); osc.stop(ctx.currentTime + 0.55);
        break;
      }
      case 'uiTick': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 1200 * pitch;
        const g = ctx.createGain();
        this.env(g, ctx, 0.001, 0.045, 0.18 * vol);
        osc.connect(g).connect(this.master);
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
        osc.connect(g).connect(this.master);
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
        src.connect(bp).connect(g).connect(this.master);
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
    src.connect(bp).connect(g).connect(this.master);
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

  stopAmbient(): void {
    this.crowdBed?.stop();
    this.crowdBed = null;
    this.crowdGain = null;
  }
}

export const SoundKit = new SoundKitImpl();

// WIRING
// ModeHarness — on the very first input event of a session (works for
// touch/keyboard/gamepad alike): SoundKit.unlock(). Everything else is
// mode-level `SoundKit.play('name')` calls, already added to every mode file
// in this batch. Settings screen (if/when built): SoundKit.setEnabled(sfx,
// music) — wire to a mute toggle; this is a fully self-contained system with
// no asset pipeline, so shipping it is a pure code drop.
