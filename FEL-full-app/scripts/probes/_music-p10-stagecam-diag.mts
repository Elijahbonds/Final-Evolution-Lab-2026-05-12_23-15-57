// MUSIC-SUITE P10 (2026-09-29) — why the stage camera's distance sat at 5.20 m through a whole WARM UP (the first
// _music-p10-stage.mts run: min 5.200, p50 5.201, max 5.212 — no streak widen at combo 24+, no push, no freeze drop).
// Observes (never changes) CameraDirector.setFixed / update through the webpack cache: every requested fixed position's
// flat distance from the dancer, the director's mode each frame, the live camera, and the pure stageCameraFrame's own
// answer for the same inputs (its module, the same one the room imports). Short run: 45 s of WARM UP at 16:9.
import fs from 'node:fs';
import { assertDisk, launch, newPage, danceStart, writeJson, sleep, OUT_ROOT, DESKTOP_169, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/stage`;
fs.mkdirSync(OUT, { recursive: true });
const R: Any = { at: new Date().toISOString(), errors: [] as string[] };
assertDisk('diag');
const b = await launch();
try {
  const ctx = await b.newContext(DESKTOP_169);
  const p = await newPage(ctx, R.errors, 'diag');
  const st = await danceStart(p, '?track=warmup&place=home');   // same URL: openDance re-navigates, so re-wrap after
  R.st = st;
  R.wrap2 = await p.evaluate(() => {
    const w = window as Any; const M = w.__MOD('lib/babylon/core/CameraDirector\\.ts$'); const P = M.CameraDirector.prototype;
    if (!w.__CD) {
      w.__CD = { fixed: [], upd: [], modes: {} };
      const of = P.setFixed; P.setFixed = function (pos: Any, th: number, snap: boolean) { w.__CDI = this; if (w.__CD.fixed.length < 20000) w.__CD.fixed.push([Math.round(performance.now()), +pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3), th, !!snap]); return of.call(this, pos, th, snap); };
      const ou = P.update; P.update = function (...a: Any[]) { w.__CDI = this; w.__CD.modes[this.mode] = (w.__CD.modes[this.mode] ?? 0) + 1; return ou.apply(this, a); };
      return 'wrapped after load';
    }
    return 'kept';
  });
  const samples: Any[] = [];
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    samples.push(await p.evaluate(() => {
      const w = window as Any; const cd = w.__CDI; const hero = w.__FEL_DEV__.hero().getAbsolutePosition();
      const f = w.__CD.fixed[w.__CD.fixed.length - 1];
      const SCM = w.__MOD('lib/babylon/dance/stageCamera\\.ts$');
      const cam = cd ? cd.camera : null; const eng = cam ? cam.getScene().getEngine() : null;
      const aspect = eng ? eng.getRenderWidth() / eng.getRenderHeight() : null;
      const d = w.__DPERF;
      const pure = SCM && cam ? SCM.stageCameraFrame({ dancer: { x: hero.x, z: hero.z }, audience: { x: 0, z: -6 }, aspect, fovRad: cam.fov, beatPhase: 0.5, freeze: false, streak: d ? d.combo : 0, stillCamera: false }) : null;
      return { t: Math.round(performance.now()), mode: cd ? cd.mode : null, fixedPos: cd && cd.fixedPos ? [cd.fixedPos.x, cd.fixedPos.y, cd.fixedPos.z].map((x: number) => +x.toFixed(3)) : null,
        lastRequested: f, requestedFlat: f ? +Math.hypot(f[1] - hero.x, f[3] - hero.z).toFixed(3) : null,
        cam: cam ? [cam.position.x, cam.position.y, cam.position.z].map((x: number) => +x.toFixed(3)) : null, camFlat: cam ? +Math.hypot(cam.position.x - hero.x, cam.position.z - hero.z).toFixed(3) : null,
        activeIsDirectorCam: cam ? cam === cam.getScene().activeCamera : null, activeName: cam ? cam.getScene().activeCamera?.name : null, dirCamName: cam ? cam.name : null,
        hero: [hero.x, hero.y, hero.z].map((x: number) => +x.toFixed(3)), combo: d ? d.combo : null, fov: cam ? +cam.fov.toFixed(3) : null, aspect: aspect ? +aspect.toFixed(3) : null,
        pureDistance: pure ? +pure.distanceM.toFixed(3) : null, pureHeight: pure ? pure.heightM : null, modes: w.__CD.modes, fixedCalls: w.__CD.fixed.length };
    }));
    if (i % 5 === 0) console.log(JSON.stringify(samples[samples.length - 1]));
  }
  R.samples = samples;
  R.fixedTail = await p.evaluate(() => (window as Any).__CD.fixed.slice(-40));
  await ctx.close();
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
finally { await b.close(); }
writeJson(`${OUT}/stagecam-diag.json`, R);
console.log('wrote', `${OUT}/stagecam-diag.json`, R.errors);
