// SoundKit — the game has shipped with ZERO audio (confirmed live: no
// <audio>/<video> elements, no audio network requests, on any mode). Silence
// is the single biggest thing separating this build from "feels like a
// console game" — every real sports/fighting game has hit impacts, whooshes,
// crowd reaction, and a score chime. There are no licensed audio assets to
// drop in, so this is entirely SYNTHESIZED with the Web Audio API — the same
// "procedural, zero external assets" philosophy VenueKit used for visuals.
// One singleton, lazily created on first user gesture (autoplay policy safe).

type SfxName = 'whoosh' | 'impact' | 'score' | 'miss' | 'whistle' | 'uiTick' | 'crowdCheer' | 'crowdGroan' | 'powerUp';

class SoundKitImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdBed: { stop(): void } | null = null;
  private musicEnabled = true;
  private sfxEnabled = true;

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
  startAmbient(kind: 'stadium' | 'dojo' | 'none'): void {
    this.stopAmbient();
    if (kind === 'none' || !this.musicEnabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 4, 'brown');
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'stadium' ? 900 : 220;
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = kind === 'stadium' ? 0.05 : 0.025;
    // slow LFO on gain so the crowd bed breathes instead of droning
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = g.gain.value * 0.4;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.crowdBed = { stop: () => { try { src.stop(); lfo.stop(); } catch { /* already stopped */ } } };
  }

  stopAmbient(): void {
    this.crowdBed?.stop();
    this.crowdBed = null;
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
