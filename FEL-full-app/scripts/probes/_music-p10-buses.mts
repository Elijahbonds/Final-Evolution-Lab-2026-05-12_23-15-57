// MUSIC-SUITE P10 (2026-09-29) — CLOSE P7's RIG-ADJACENT RISK LIVE: the shared SoundKit buses (music / sfx / voice) and
// the Academy engine's deviceVol stage, heard and read in the running rooms on the lane's :3121 (PR #30 named it: "the
// shared buses and AudioEngine's deviceVol stage were never heard" — the P7 and P8 proofs both found the server down).
//
// Pre-P7 levels (git show 21ddfb4b^:./lib/babylon/audio/SoundKit.ts, lines 67-74 and every play() case): master 0.55,
// voiceBus 1.35, musicBus 1/0.55 = 1.8182, and every SFX source connected STRAIGHT to the master (no bus: an effective
// gain of exactly 1); the Academy engine's desk ceiling went straight to ctx.destination (no deviceVol stage: 1).
//
//   A. THE ACADEMY (/dev/music, fresh device): the real VolumeMixer on the STUDIO tab (StudioMode.tsx:2897-2899) at its
//      defaults, then each slider moved to 50 % and back — after every move, every SoundKit bus gain, the master, and
//      the running AudioEngine's deviceVol (its own AudioParam, read through the prototype the dev route already wraps),
//      plus an audio tap on the engine's output (after deviceVol) and the desk ceiling (before it): the RMS ratio IS the
//      stage. The engine output is recorded to a WAV (default → MUSIC 50 % → MUSIC 0 → back).
//   B. THE CYPHER (/dev/mode/dance?track=warmup, fresh device): the buses at their defaults while the band plays, then
//      each bus moved through SoundKit.setVolume — the one call VolumeMixer.move() makes (the room's own mixer lives in
//      the /play host's pause screen, components/games/timing-babylon.tsx:522, which /dev/mode does not mount) — with an
//      RMS tap on each bus's output and on the limiter out (THE MIC's tap point, ModeHarness devHandle.audio()); WAV.
//   B2. The same device after A's MUSIC slider was left at 50 %: the Cypher opens with its music bus at half — one
//      setting follows the player between the two rooms (lib/audio/volumes.ts VOLUME_KEY).
//   C. ANOTHER MODE (/dev/mode/threepoint, fresh device): SoundKit's own deterministic 'score' arpeggio (oscillators
//      only, no noise) played through today's routing (source → sfxBus → master) and through the PRE-P7 routing
//      rebuilt live (AudioNode.connect redirected: sfxBus → master, exactly the old graph), tapped after the limiter,
//      with the crowd / music / voice buses held at 0 for the A/B only (their values saved and restored). Then SFX 50 %
//      and MUSIC 0 / VOICE 0 on the same sound. Then ~20 s of the real game, a shot pressed every ~1.3 s, recorded (WAV)
//      so the hit sounds can be heard at their level.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-buses.mts
import fs from 'node:fs';
import { BASE, assertDisk, launch, newPage, openAcademy, openDance, devPhase, padTap, writeJson, sleep, OUT_ROOT, DESKTOP, type Any } from './_p10-lib.mts';
import type { Page } from 'playwright-core';

const OUT = `${OUT_ROOT}/buses`;
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY ?? 'A,B,C').split(',');
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-buses +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { at: new Date().toISOString(), disk: {}, preP7: { master: 0.55, voice: 1.35, music: 1 / 0.55, sfx: 1, deviceVol: 1, source: 'git show 21ddfb4b^:./lib/babylon/audio/SoundKit.ts:67-74 (sfx cases connect(this.master)); AudioEngine ceiling → destination' }, errors: [] as string[], checks: [] as Any[] };
const check = (id: string, name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ id, name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', id, name, JSON.stringify(got).slice(0, 260)); };
const near = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol;

const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;

/** SoundKit's live buses (the page's own singleton), the saved levels, and (Academy) the engine's deviceVol. */
const READ = `(() => {
  const m = window.__MOD('lib/babylon/audio/SoundKit\\\\.ts$'); const SK = m && m.SoundKit;
  if (!SK) return { err: 'SoundKit not in the webpack cache' };
  const g = SK.graph();
  const r4 = (v) => Math.round(v * 1e5) / 1e5;
  const out = { music: r4(g.music.gain.value), sfx: r4(g.sfx.gain.value), voice: r4(g.voice.gain.value), master: r4(SK.master.gain.value), crowdDuck: r4(g.crowdDuck.gain.value), volumes: SK.getVolumes(), saved: localStorage.getItem('fel-audio-volumes'), skCtx: g.ctx.state, skNow: Math.round(g.ctx.currentTime * 1000) / 1000, busCalls: (window.__BUSCALLS || []).slice(-6) };
  const e = window.__eng;
  if (e) { out.deviceVol = r4(e.deviceVol.gain.value); out.deviceVolume = r4(e.deviceVolume()); out.engineRunning = e.timerId !== null; }
  return out;
})()`;

/**
 * THE BUS'S REAL GAIN, HEARD: a 440 Hz test tone into each bus (music / sfx / voice) with a ScriptProcessor on the tone
 * before the bus and one on the bus's output — 20·log10(out/in) is what the bus does to a sound, whatever its AudioParam
 * reports. Why not just read gain.value: in the second and third runs the Academy's VOICE slider SAVED 0.5 and SoundKit
 * scheduled setTargetAtTime(0.675) (recorded), yet gain.value still read 1.35 three seconds later — while the same call
 * read 0.675 in _music-p10-voicebus-diag.mts and in the Cypher. assumption: Chrome only advances an AudioParam's timeline
 * for a node that is processing, and the Academy's voice bus is idle once Okta's first-visit line is over (a silent
 * input), so `.value` reports the last value it rendered, not the one scheduled. A sound through the bus answers it.
 * Measured on the Academy only (SoundKit's buses are idle there — the Academy's own engine plays on its own context);
 * in the Cypher the band and Stoop share the buses, so the tone would be measured with them.
 */
const TONE_GAINS = `(async () => {
  const SK = window.__MOD('lib/babylon/audio/SoundKit\\\\.ts$').SoundKit; const g = SK.graph(); const ctx = g.ctx;
  // GOERTZEL at the tone's own frequency, not broadband energy: the third run measured the voice bus +11.61 dB (not +2.61)
  // because Professor Okta's first-visit line was on the same bus — a single-bin detector hears the tone and (almost)
  // nothing else. 5 kHz sits above the voices' energy; 0.5 s gives a ~2 Hz bin.
  const F = 5000, w = 2 * Math.PI * F / ctx.sampleRate, coeff = 2 * Math.cos(w);
  const G = () => ({ s1: 0, s2: 0, n: 0 });
  const feed = (st, a) => { for (let k = 0; k < a.length; k++) { const s0 = a[k] + coeff * st.s1 - st.s2; st.s2 = st.s1; st.s1 = s0; } st.n += a.length; };
  const pow = (st) => st.s1 * st.s1 + st.s2 * st.s2 - coeff * st.s1 * st.s2;
  const out = {};
  for (const bus of ['music', 'sfx', 'voice']) {
    const node = g[bus];
    const osc = ctx.createOscillator(); osc.frequency.value = F;
    const pre = ctx.createGain(); pre.gain.value = 0.02;
    const gi = G(), go = G();
    const spIn = ctx.createScriptProcessor(4096, 1, 1), spOut = ctx.createScriptProcessor(4096, 2, 2);
    let armed = 0;
    spIn.onaudioprocess = (e) => { if (armed === 1) feed(gi, e.inputBuffer.getChannelData(0)); };
    spOut.onaudioprocess = (e) => { if (armed === 1) feed(go, e.inputBuffer.getChannelData(0)); };
    osc.connect(pre); pre.connect(node); pre.connect(spIn); node.connect(spOut); spIn.connect(ctx.destination); spOut.connect(ctx.destination);
    osc.start();
    await new Promise((r) => setTimeout(r, 200)); armed = 1;
    await new Promise((r) => setTimeout(r, 600)); armed = 2;
    osc.stop(); pre.disconnect(); node.disconnect(spOut); spIn.disconnect(); spOut.disconnect();
    // (each processor sums its own block run; a block of misalignment between them changes the power by < 1 %: n in the record)
    out[bus] = pow(gi) > 0 ? Math.round(10 * Math.log10((pow(go) / Math.max(1, go.n) ** 2) / (pow(gi) / Math.max(1, gi.n) ** 2)) * 100) / 100 : null;
    out[bus + 'N'] = [gi.n, go.n];
  }
  return out;
})()`;

/** Wrap (observe only) AudioEngine.scheduleStep: the running engine instance is window.__eng. */
const HOOK_ENGINE = `(() => {
  const m = window.__MOD('lib/babylon/music/AudioEngine\\\\.ts$'); if (!m) return false;
  const P = m.AudioEngine.prototype; if (P.__p10eng) return true; P.__p10eng = true;
  const o = P.scheduleStep; P.scheduleStep = function (...a) { window.__eng = this; return o.apply(this, a); };
  return true;
})()`;

/** A ScriptProcessor tap on any node: continuous RMS per window, and a capture to WAV. window.__TAPS[name]. */
const TAP = `(name, getNode, keep) => {
  const node = getNode(); if (!node) return 'no node';
  const ctx = node.context;
  window.__TAPS = window.__TAPS || {};
  if (window.__TAPS[name]) return 'tapped';
  const sp = ctx.createScriptProcessor(2048, 2, 2);
  const T = window.__TAPS[name] = { rate: ctx.sampleRate, sum: 0, n: 0, peak: 0, keep: !!keep, chunks: [], marks: [] };
  sp.onaudioprocess = (e) => {
    const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : a;
    const mix = T.keep ? new Float32Array(a.length) : null;
    for (let i = 0; i < a.length; i++) { const v = (a[i] + b[i]) * 0.5; T.sum += v * v; T.n++; const av = Math.abs(v); if (av > T.peak) T.peak = av; if (mix) mix[i] = v; }
    if (mix) T.chunks.push({ t: e.playbackTime, d: mix });
  };
  node.connect(sp); sp.connect(ctx.destination);   // the processor's own output is silence: nothing is added to the mix
  T.sp = sp;
  return 'ok ' + ctx.state;
}`;
const tap = (p: Page, name: string, getNode: string, keep = false) => p.evaluate(`(${TAP})(${JSON.stringify(name)}, () => { try { return ${getNode}; } catch (e) { return null; } }, ${keep})`);
const resetTaps = (p: Page) => p.evaluate(() => { for (const T of Object.values((window as Any).__TAPS ?? {}) as Any[]) { T.sum = 0; T.n = 0; T.peak = 0; } });
const readTaps = (p: Page) => p.evaluate(() => {
  const o: Any = {};
  for (const [k, T] of Object.entries((window as Any).__TAPS ?? {}) as [string, Any][]) {
    const rms = T.n ? Math.sqrt(T.sum / T.n) : 0;
    o[k] = { rmsDb: rms > 0 ? Math.round(20 * Math.log10(rms) * 100) / 100 : -Infinity, peakDb: T.peak > 0 ? Math.round(20 * Math.log10(T.peak) * 100) / 100 : -Infinity, rms, samples: T.n };
  }
  return o;
});
/** Measure `ms` of every tap after a settle. */
async function window_(p: Page, settleMs: number, ms: number): Promise<Any> { await sleep(settleMs); await resetTaps(p); await sleep(ms); return readTaps(p); }

/** The kept chunks of one tap → 16-bit mono WAV on disk (and the chunks dropped). */
async function saveWav(p: Page, name: string, file: string): Promise<{ file: string; seconds: number; peakDb: number }> {
  const b64 = await p.evaluate((n) => {
    const T = (window as Any).__TAPS?.[n]; if (!T) return '';
    const len = T.chunks.reduce((s: number, c: Any) => s + c.d.length, 0); const i16 = new Int16Array(len); let o = 0;
    for (const c of T.chunks) for (let i = 0; i < c.d.length; i++) i16[o++] = Math.max(-32768, Math.min(32767, Math.round(c.d[i] * 32767)));
    T.chunks = [];
    let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
    return JSON.stringify({ rate: T.rate, b64: btoa(s) });
  }, name);
  if (!b64) return { file, seconds: 0, peakDb: -Infinity };
  const { rate, b64: data } = JSON.parse(b64);
  const pcm = Buffer.from(data, 'base64');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  fs.writeFileSync(file, wav);
  let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  return { file, seconds: Math.round((pcm.length / 2 / rate) * 100) / 100, peakDb: peak ? Math.round(20 * Math.log10(peak / 32767) * 100) / 100 : -Infinity };
}

/** Move one VolumeMixer slider (the real <input type=range> under its label) to `pct`, the way a drag does. */
async function slide(p: Page, label: 'MUSIC' | 'SFX' | 'VOICE', pct: number): Promise<boolean> {
  return p.evaluate(([l, v]) => {
    const lab = [...document.querySelectorAll('label')].find((x) => (x.querySelector('span')?.textContent ?? '').trim() === l && x.querySelector('input[type="range"]'));
    const inp = lab?.querySelector('input[type="range"]') as HTMLInputElement | null; if (!inp) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, String(v));
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [label, pct] as [string, number]);
}

// ── A. the Academy ─────────────────────────────────────────────────────────────────────────────────────────────────
async function academy(): Promise<void> {
  R.disk.A = assertDisk('A');
  const b = await launch();
  try {
    const ctx = await b.newContext(DESKTOP);
    for (const s of [STUDIO_TIER, CAL]) await ctx.addInitScript({ content: s });
    const p = await newPage(ctx, R.errors, 'A');
    await openAcademy(p, '/dev/music?stage=studio&player=p10bus');
    await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
    check('A0', 'the engine hook reaches AudioEngine through the webpack cache', await p.evaluate(HOOK_ENGINE) === true, 'hooked', true);
    // every AudioParam call on the three bus gains (the first A run read the VOICE bus at 1.35 after its slider saved 0.5,
    // while _music-p10-voicebus-diag.mts saw the same slider glide it to 0.675: this records who wrote what, and when)
    await p.evaluate(() => {
      const w = window as Any; const SK = w.__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit; const g = SK.graph(); w.__BUSCALLS = [];
      for (const [bus, node] of [['music', g.music], ['sfx', g.sfx], ['voice', g.voice]] as [string, Any][]) {
        const prm = node.gain;
        for (const m of ['setValueAtTime', 'setTargetAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
          const o = prm[m]; if (typeof o !== 'function') continue;
          prm[m] = function (...a: Any[]) { w.__BUSCALLS.push({ bus, m, a: a.map((x: Any) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : String(x).slice(0, 20))), ctx: g.ctx.state, at: Math.round(performance.now()) }); return o.apply(this, a); };
        }
      }
    });
    // a steady beat to hear: kick on the quarters, snare 2 & 4, hats on the eighths
    for (const [row, steps] of [['kick', [0, 4, 8, 12]], ['snare', [4, 12]], ['hat', [0, 2, 4, 6, 8, 10, 12, 14]]] as [string, number[]][]) {
      for (const s of steps) { const c = p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${s}"]`); if (await c.count() && (await c.getAttribute('data-on')) !== '1') await c.click(); }
    }
    await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
    await p.waitForFunction(() => !!(window as Any).__eng && (window as Any).__eng.timerId !== null, undefined, { timeout: 20000 });
    await tap(p, 'engineOut', 'window.__eng.deviceVol', true);
    await tap(p, 'engineCeiling', 'window.__eng.graph.ceiling');
    const def = await p.evaluate(READ);
    const defTap = await window_(p, 600, 3000);
    R.academy = { default: { gains: def, tap: defTap } };
    check('A1', 'Academy defaults = the pre-P7 levels (master 0.55, voice 1.35, music 1.8182, sfx 1, deviceVol 1)',
      near(def.master, 0.55) && near(def.voice, 1.35) && near(def.music, 1 / 0.55) && near(def.sfx, 1) && near(def.deviceVol, 1),
      def, R.preP7);
    const toneDefault = await p.evaluate(TONE_GAINS);
    R.academy.toneDefault = toneDefault;
    check('A1b', 'Academy defaults HEARD: a test tone through each bus comes out at its pre-P7 gain (music +5.19 dB = 1/0.55, sfx 0 dB, voice +2.61 dB = 1.35)',
      Math.abs(toneDefault.music - 5.19) < 0.05 && Math.abs(toneDefault.sfx) < 0.05 && Math.abs(toneDefault.voice - 2.61) < 0.05, toneDefault, { music: 5.19, sfx: 0, voice: 2.61 });
    check('A2', 'at the default the engine output equals its desk ceiling (deviceVol is bit-transparent)',
      Math.abs(defTap.engineOut.rmsDb - defTap.engineCeiling.rmsDb) < 0.05, { out: defTap.engineOut.rmsDb, ceiling: defTap.engineCeiling.rmsDb }, 'Δ < 0.05 dB');
    R.academy.moves = {};
    for (const bus of ['MUSIC', 'SFX', 'VOICE'] as const) {
      const moved = await slide(p, bus, 50);
      // read AFTER the glide settles (VOLUME_RAMP_TC 50 ms: 700 ms is 14 time constants; the first run read mid-ramp)
      const t = await window_(p, 700, 2500); const g = await p.evaluate(READ);
      const tone = await p.evaluate(TONE_GAINS);
      await slide(p, bus, 100); const back = await p.evaluate(READ); await sleep(700);
      R.academy.moves[bus] = { moved, at50: g, tap50: t, back100: back, tone50: tone };
      const own = bus.toLowerCase() as 'music' | 'sfx' | 'voice';
      const heard = (['music', 'sfx', 'voice'] as const).every((k) => Math.abs((tone[k] - toneDefault[k]) - (k === own ? -6.02 : 0)) < 0.1);
      check(`A3h-${bus}`, `Academy ${bus} slider at 50 % HEARD: the tone through its own bus drops 6.02 dB, the other two buses do not move`, moved && heard,
        { deltaDb: Object.fromEntries((['music', 'sfx', 'voice'] as const).map((k) => [k, Math.round((tone[k] - toneDefault[k]) * 100) / 100])), paramValueRead: { music: g.music, sfx: g.sfx, voice: g.voice } }, { [own]: -6.02, others: 0 });
      const only = {
        MUSIC: near(g.music, 0.5 / 0.55) && near(g.sfx, 1) && near(g.voice, 1.35) && near(g.deviceVol, 0.5, 2e-3),
        SFX: near(g.music, 1 / 0.55) && near(g.sfx, 0.5) && near(g.voice, 1.35) && near(g.deviceVol, 1, 2e-3),
        VOICE: near(g.music, 1 / 0.55) && near(g.sfx, 1) && near(g.voice, 0.675) && near(g.deviceVol, 1, 2e-3),
      }[bus];
      check(`A3-${bus}`, `Academy ${bus} slider at 50 % moves only its own bus (and deviceVol follows MUSIC only)`, moved && only && near(g.master, 0.55),
        { music: g.music, sfx: g.sfx, voice: g.voice, master: g.master, deviceVol: g.deviceVol, outVsCeilingDb: Math.round((t.engineOut.rmsDb - t.engineCeiling.rmsDb) * 100) / 100 },
        bus === 'MUSIC' ? 'music 0.9091, deviceVol 0.5 (−6.02 dB out vs ceiling), others unchanged' : `${bus.toLowerCase()} halved, music/deviceVol unchanged`);
    }
    // the recording: default 2 s, MUSIC 50 % 2.5 s, MUSIC 0 2 s, back to 100 2 s (the engine output, after deviceVol)
    await p.evaluate(() => { const T = (window as Any).__TAPS.engineOut; T.chunks = []; });
    const seq: Any[] = [];
    for (const [pct, ms] of [[100, 2000], [50, 2500], [0, 2000], [100, 2000]] as [number, number][]) {
      await slide(p, 'MUSIC', pct); await sleep(400); await resetTaps(p); await sleep(ms - 400);
      const t = await readTaps(p); seq.push({ musicPct: pct, outDb: t.engineOut.rmsDb, ceilingDb: t.engineCeiling.rmsDb, outMinusCeilingDb: Number.isFinite(t.engineOut.rmsDb) ? Math.round((t.engineOut.rmsDb - t.engineCeiling.rmsDb) * 100) / 100 : '-inf (silent)' });
    }
    R.academy.recording = { steps: seq, wav: await saveWav(p, 'engineOut', `${OUT}/academy-engine-out-default-50-0-100.wav`) };
    check('A4', 'MUSIC 50 % is −6.02 dB on the engine output, 0 % is silence, 100 % comes back', Math.abs((seq[1].outMinusCeilingDb as number) + 6.02) < 0.15
      && (seq[2].outMinusCeilingDb === '-inf (silent)' || (typeof seq[2].outMinusCeilingDb === 'number' && seq[2].outMinusCeilingDb < -60))
      && typeof seq[3].outMinusCeilingDb === 'number' && Math.abs(seq[3].outMinusCeilingDb) < 0.1,
      seq, '−6.02 / silent / 0');
    // leave MUSIC at 50 % saved, for B2 (the setting follows the player into the Cypher)
    await slide(p, 'MUSIC', 50); await sleep(300);
    R.academy.leftSaved = await p.evaluate(() => localStorage.getItem('fel-audio-volumes'));
    // B2 on this same device
    await openDance(p, '?track=warmup');
    if (!/playing/.test(await devPhase(p))) await padTap(p, 9);   // the harness's READY: the first press wakes it
    for (let i = 0; i < 100 && !/playing/.test(await devPhase(p)); i++) await sleep(200);
    await sleep(1500);
    const g2 = await p.evaluate(READ);
    R.cypherAfterAcademy = g2;
    check('B2', 'the Cypher on the same device opens with MUSIC at the saved 50 % (music bus 0.9091) and the rest at default', near(g2.music, 0.5 / 0.55) && near(g2.sfx, 1) && near(g2.voice, 1.35) && near(g2.master, 0.55), g2, 'music 0.90909, sfx 1, voice 1.35, master 0.55');
    await ctx.close();
  } finally { await b.close(); }
}

// ── B. the Cypher ──────────────────────────────────────────────────────────────────────────────────────────────────
async function cypher(): Promise<void> {
  R.disk.B = assertDisk('B');
  const b = await launch();
  try {
    const ctx = await b.newContext(DESKTOP);
    await ctx.addInitScript({ content: CAL });
    const p = await newPage(ctx, R.errors, 'B');
    await openDance(p, '?track=warmup');
    if (!/playing/.test(await devPhase(p))) await padTap(p, 9);   // the harness's READY: the first press wakes it
    for (let i = 0; i < 150 && !/playing/.test(await devPhase(p)); i++) await sleep(200);
    await sleep(4000);   // past the count-in: the band is playing
    const def = await p.evaluate(READ);
    check('B1', 'Cypher defaults = the pre-P7 levels (music 1.8182, sfx 1, voice 1.35, master 0.55)', near(def.master, 0.55) && near(def.voice, 1.35) && near(def.music, 1 / 0.55) && near(def.sfx, 1), def, R.preP7);
    const SKG = "window.__MOD('lib/babylon/audio/SoundKit\\\\.ts$').SoundKit.graph()";
    await tap(p, 'out', `${SKG}.out`, true);
    await tap(p, 'musicBus', `${SKG}.music`);
    await tap(p, 'sfxBus', `${SKG}.sfx`);
    await tap(p, 'voiceBus', `${SKG}.voice`);
    const base = await window_(p, 300, 4000);
    R.cypher = { default: { gains: def, tap: base }, moves: {} };
    for (const bus of ['music', 'sfx', 'voice'] as const) {
      await p.evaluate((bb) => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume(bb, 0.5), bus);
      const t = await window_(p, 700, 4000); const g = await p.evaluate(READ);   // after the glide (see A3)
      await p.evaluate((bb) => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume(bb, 1), bus);
      await sleep(500);
      R.cypher.moves[bus] = { at50: g, tap50: t };
      const want: Record<string, number> = { music: bus === 'music' ? 0.5 / 0.55 : 1 / 0.55, sfx: bus === 'sfx' ? 0.5 : 1, voice: bus === 'voice' ? 0.675 : 1.35 };
      check(`B3-${bus}`, `Cypher ${bus} at 50 % moves only its own bus`, near(g.music, want.music) && near(g.sfx, want.sfx) && near(g.voice, want.voice) && near(g.master, 0.55),
        { music: g.music, sfx: g.sfx, voice: g.voice, master: g.master, musicBusDb: t.musicBus.rmsDb, outDb: t.out.rmsDb, baseMusicBusDb: base.musicBus.rmsDb, baseOutDb: base.out.rmsDb }, want);
    }
    R.cypher.wav = await saveWav(p, 'out', `${OUT}/cypher-out-default-then-each-bus-50.wav`);
    await ctx.close();
  } finally { await b.close(); }
}

// ── C. another mode: the 3PT shootout ──────────────────────────────────────────────────────────────────────────────
async function threepoint(): Promise<void> {
  R.disk.C = assertDisk('C');
  const b = await launch();
  try {
    const ctx = await b.newContext(DESKTOP);
    const p = await newPage(ctx, R.errors, 'C');
    await p.goto(`${BASE}/dev/mode/threepoint`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
    await padTap(p, 0);
    for (let i = 0; i < 100 && !/playing/.test(await devPhase(p)); i++) await sleep(200);
    await sleep(1000);
    const def = await p.evaluate(READ);
    check('C1', '3PT defaults = the pre-P7 levels (sfx bus 1 where the sounds used to go straight to the 0.55 master)', near(def.master, 0.55) && near(def.sfx, 1) && near(def.voice, 1.35) && near(def.music, 1 / 0.55), def, R.preP7);
    const SK = "window.__MOD('lib/babylon/audio/SoundKit\\\\.ts$').SoundKit";
    await tap(p, 'out', `${SK}.graph().out`, true);
    // THE A/B: 'score' (four triangle oscillators, deterministic) through today's graph and through the pre-P7 graph
    const AB = await p.evaluate(async (skExpr) => {
      // eslint-disable-next-line no-eval
      const SKo = (0, eval)(skExpr); const g = SKo.graph(); const T = (window as Any).__TAPS.out;
      const hold = { crowd: g.crowdDuck.gain.value, music: g.music.gain.value, voice: g.voice.gain.value };
      g.crowdDuck.gain.cancelScheduledValues(0); g.crowdDuck.gain.value = 0; g.music.gain.cancelScheduledValues(0); g.music.gain.value = 0; g.voice.gain.cancelScheduledValues(0); g.voice.gain.value = 0;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const measure = async (): Promise<Any> => {
        await wait(700); T.chunks = []; T.keep = true;
        const t0 = g.ctx.currentTime; SKo.play('score'); await wait(900);
        const win = T.chunks.filter((c: Any) => c.t >= t0 - 0.06 && c.t <= t0 + 0.75);
        let sum = 0, n = 0, peak = 0; for (const c of win) for (const v of c.d) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); }
        T.chunks = [];
        // ENERGY (the sum of squares over the whole window), not a mean: the window is cut on 2,048-sample chunk edges, so
        // its length (and the silence in it) varies run to run — the first run's RMS moved 0.28 dB between two identical
        // plays for that reason alone. The energy of one arpeggio does not care how much silence surrounds it.
        return { energyDb: sum ? Math.round(1000 * Math.log10(sum)) / 100 : null, peakDb: peak ? Math.round(2000 * Math.log10(peak)) / 100 : null, peak, n };
      };
      const floor = await (async () => { await wait(700); T.chunks = []; await wait(800); let s = 0, n = 0; for (const c of T.chunks) for (const v of c.d) { s += v * v; n++; } T.chunks = []; return n ? Math.round(2000 * Math.log10(Math.sqrt(s / n) || 1e-12)) / 100 : null; })();
      const today1 = await measure();
      // the pre-P7 graph, rebuilt: anything connected INTO the sfx bus goes straight into the master instead
      const P = AudioNode.prototype as Any; const oc = P.connect;
      P.connect = function (dest: Any, ...a: Any[]) { return oc.call(this, dest === SKo.sfxBus ? SKo.master : dest, ...a); };
      const preP7 = await measure();
      P.connect = oc;
      const today2 = await measure();
      SKo.setVolume('sfx', 0.5); const sfx50 = await measure(); SKo.setVolume('sfx', 1); await wait(400);
      SKo.setVolume('music', 0); SKo.setVolume('voice', 0); const musVoice0 = await measure(); SKo.setVolume('music', 1); SKo.setVolume('voice', 1);
      await wait(400);
      g.crowdDuck.gain.value = hold.crowd; // music/voice come back through setVolume's own ramp to their tuned bases
      return { held: hold, floorDb: floor, today1, preP7, today2, sfx50, musicVoice0: musVoice0, restored: { crowd: g.crowdDuck.gain.value, music: g.music.gain.value, voice: g.voice.gain.value, sfx: g.sfx.gain.value } };
    }, SK);
    R.threepoint = { default: def, ab: AB };
    const d = (x: Any, y: Any) => Math.round((x.energyDb - y.energyDb) * 1000) / 1000;
    check('C2', "3PT 'score' through today's sfx bus plays at exactly its pre-P7 level (rebuilt pre-P7 routing, same limiter)", Math.abs(d(AB.today1, AB.preP7)) < 0.05 && Math.abs(AB.today1.peakDb - AB.preP7.peakDb) < 0.05,
      { todayEnergyDb: AB.today1.energyDb, preP7EnergyDb: AB.preP7.energyDb, deltaDb: d(AB.today1, AB.preP7), todayPeakDb: AB.today1.peakDb, preP7PeakDb: AB.preP7.peakDb, repeatDeltaDb: d(AB.today2, AB.today1), floorDb: AB.floorDb }, 'Δ < 0.05 dB');
    check('C3', 'SFX at 50 % drops the 3PT hit by ~6 dB; MUSIC 0 + VOICE 0 leave it unchanged', Math.abs(d(AB.sfx50, AB.today1) + 6.02) < 0.8 && Math.abs(d(AB.musicVoice0, AB.today1)) < 0.05,
      { sfx50DeltaDb: d(AB.sfx50, AB.today1), musicVoice0DeltaDb: d(AB.musicVoice0, AB.today1) }, '≈ −6 dB (the limiter makes it inexact) / 0 dB');
    // ~20 s of the real game, recorded: a shot every ~1.3 s off the meter (no aim — makes and misses both sound)
    await p.evaluate(() => { const T = (window as Any).__TAPS.out; T.chunks = []; T.keep = true; });
    const shots: number[] = [];
    const tEnd = Date.now() + 20000;
    while (Date.now() < tEnd) { await padTap(p, 0, 90); shots.push(Date.now()); await sleep(1200 + Math.random() * 300); }
    const onsets = await p.evaluate(() => {
      const T = (window as Any).__TAPS.out; const rate = T.rate; const hop = Math.round(rate * 0.02); const all: number[] = [];
      for (const c of T.chunks) for (const v of c.d) all.push(v);
      let prev = -120, n = 0; const levels: number[] = [];
      for (let i = 0; i + hop <= all.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += all[j] * all[j]; const db = 10 * Math.log10(s / hop || 1e-12); levels.push(db); if (db > -30 && prev <= -30) n++; prev = db; }
      const sorted = levels.slice().sort((a, b) => a - b);
      return { onsetsOverMinus30: n, p50Db: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10, p95Db: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, maxDb: Math.round(sorted[sorted.length - 1] * 10) / 10 };
    });
    R.threepoint.play = { shotsPressed: shots.length, onsets, wav: await saveWav(p, 'out', `${OUT}/threepoint-20s-play.wav`) };
    check('C4', 'the 3PT game still sounds its hits while played (20 s recorded after the limiter)', onsets.onsetsOverMinus30 >= 5 && onsets.maxDb > -20, { shots: shots.length, ...onsets }, '≥ 5 onsets over −30 dBFS');
    await ctx.close();
  } finally { await b.close(); }
}

try {
  if (ONLY.includes('A')) await academy();
  if (ONLY.includes('B')) await cypher();
  if (ONLY.includes('C')) await threepoint();
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 2000); console.error(e); }
R.pass = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length; R.runtimeSec = Math.round((Date.now() - t0) / 1000);
writeJson(`${OUT}/buses-proof.json`, R);
log('wrote', `${OUT}/buses-proof.json`, `${R.pass}/${R.total}`, R.errors.length ? `errors ${R.errors.length}` : '');
