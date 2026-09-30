// MUSIC-SUITE P10 (2026-09-29) — why the Academy's VOICE slider left SoundKit's voice bus at 1.35 (_music-p10-buses.mts
// A3-VOICE: the level SAVED as 0.5, the MUSIC and SFX sliders glided their buses, the Cypher's own setVolume('voice')
// glided its voice bus to 0.675 — but in /dev/music the voice bus read 1.35 after 3.2 s). Observes only: every module in
// the webpack cache named SoundKit, the bus the graph hands out vs the one setVolume ramps, and the param's value over
// time after a direct setVolume and after the real slider, plus every AudioParam method call on that one param.
import { assertDisk, launch, newPage, openAcademy, writeJson, sleep, OUT_ROOT, DESKTOP, type Any } from './_p10-lib.mts';

const R: Any = { at: new Date().toISOString(), errors: [] as string[] };
assertDisk('voicebus');
const b = await launch();
try {
  const ctx = await b.newContext(DESKTOP);
  const p = await newPage(ctx, R.errors, 'voicebus');
  await openAcademy(p, '/dev/music?stage=studio&player=p10voice');
  await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
  const read = (tag: string) => p.evaluate((t) => {
    const w = window as Any; const SK = w.__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit; const g = SK.graph();
    return { t, voice: g.voice.gain.value, sameNode: g.voice === SK.voiceBus, ctx: g.ctx.state, now: +g.ctx.currentTime.toFixed(3), volumes: SK.getVolumes(), calls: (w.__PCALLS || []).slice(-8) };
  }, tag);
  R.modules = await p.evaluate(() => { const w = window as Any; w.__MOD('^$'); return Object.keys(w.__wreq.c).filter((k) => /SoundKit|volumes\.ts|VolumeMixer/.test(k)); });
  // every AudioParam call on the voice bus's gain, with a short stack
  await p.evaluate(() => {
    const w = window as Any; const SK = w.__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit; const prm = SK.graph().voice.gain;
    w.__PCALLS = [];
    for (const m of ['setValueAtTime', 'setTargetAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime']) {
      const o = (prm as Any)[m]; if (typeof o !== 'function') continue;
      (prm as Any)[m] = function (...a: Any[]) { w.__PCALLS.push({ m, a: a.map((x: Any) => (typeof x === 'number' ? +x.toFixed(4) : String(x).slice(0, 20))), at: Math.round(performance.now()), who: (new Error().stack || '').split('\n').slice(2, 5).map((s) => s.trim().slice(-80)).join(' < ') }); return o.apply(this, a); };
    }
    const d = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value')!;
    Object.defineProperty(prm, 'value', { configurable: true, get() { return d.get!.call(this); }, set(v) { w.__PCALLS.push({ m: 'value=', a: [v], at: Math.round(performance.now()), who: (new Error().stack || '').split('\n').slice(2, 5).map((s) => s.trim().slice(-80)).join(' < ') }); d.set!.call(this, v); } });
  });
  R.r0 = await read('start');
  await p.evaluate(() => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume('voice', 0.5));
  await sleep(1000); R.r1 = await read('direct setVolume(voice, 0.5) + 1 s');
  await p.evaluate(() => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume('voice', 1));
  await sleep(1000); R.r2 = await read('direct setVolume(voice, 1) + 1 s');
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click(); await sleep(1500);
  R.r3 = await read('PLAY + 1.5 s');
  await p.evaluate(() => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume('voice', 0.5));
  await sleep(1000); R.r4 = await read('playing: setVolume(voice, 0.5) + 1 s');
  await sleep(3000); R.r5 = await read('playing: + 4 s');
  await p.evaluate(() => (window as Any).__MOD('lib/babylon/audio/SoundKit\\.ts$').SoundKit.setVolume('voice', 1));
  await sleep(1000); R.r6 = await read('playing: setVolume(voice, 1) + 1 s');
  // the REAL slider (the A3 path): the VolumeMixer's VOICE <input type=range>, the way a drag moves it
  const slide = (label: string, v: number) => p.evaluate(([l, val]) => {
    const labs = [...document.querySelectorAll('label')].filter((x) => (x.querySelector('span')?.textContent ?? '').trim() === l && x.querySelector('input[type="range"]'));
    const inp = labs[0]?.querySelector('input[type="range"]') as HTMLInputElement | null; if (!inp) return { found: labs.length };
    const before = inp.value;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, String(val));
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: labs.length, before, after: inp.value, min: inp.min, max: inp.max, labelText: labs[0].textContent };
  }, [label, v] as [string, number]);
  R.s1 = await slide('VOICE', 50); await sleep(1000); R.r7 = await read('slider VOICE 50 + 1 s');
  await sleep(2500); R.r8 = await read('slider VOICE 50 + 3.5 s');
  R.s2 = await slide('SFX', 50); await sleep(1000); R.r9 = await read('slider SFX 50 + 1 s (control)');
  R.s3 = await slide('VOICE', 100); await sleep(1000); R.r10 = await read('slider VOICE 100 + 1 s');
  await ctx.close();
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
finally { await b.close(); }
writeJson(`${OUT_ROOT}/buses/voicebus-diag.json`, R);
console.log(JSON.stringify(R, null, 1).slice(0, 4000));
