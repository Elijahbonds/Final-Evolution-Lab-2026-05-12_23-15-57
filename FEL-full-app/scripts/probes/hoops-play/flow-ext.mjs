// hoops-play (lane/hoops-play, 2026-11-21; the owner: "Gameplay could still be improved greatly"): THE FLOW OF A REAL GAME.
// An `ext` scenario for scripts/probes/hoops-gap/drive.mjs — the real 1v1 / 3v3 on the rig's deterministic clock, the rig's intent bot
// playing both ends (page.js), no seams forcing possessions. Every frame it keeps a small row: the score, who has the ball, whether a
// replay (cinematic) is on, the mode's phase, a banner up, and the hero's and the ball-side rival's root on the floor. ./flow.mjs reads
// it (columns: frame, hero x z, rival x z, score, foeScore, possession code, replay, playing, banner, ball x y z): the dead time from a basket to the next live frame (split into the banner beat, the replay, the check), how often the bodies are
// teleported to a check spot, the share of the game that is live play, and the bodies' closest approach.
//   gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> "onevone ext TAG=f7 PAGE=base SEED=7 NODRAW=1 EXT=$PWD/scripts/probes/hoops-play/flow-ext.mjs FLOW_FRAMES=3000"
//   env: FLOW_FRAMES (game frames to play, default 3000 = 50 s)
// NODRAW=1 needs WD_OFF=1 (drive.mjs): without it the render watchdog judges the undrawn canvas black and ends the run at ~10 s.
// Control (2026-11-21): seed 7, NODRAW + WD_OFF against the drawn 320x180 run — see docs/HOOPS-PLAY-AUDIT.md §1.
export default async function flow({ ev, runFrames, waitGame, shot, say, checkpoint, result, MODE }) {
  const FRAMES = Number(process.env.FLOW_FRAMES ?? 3000);
  // FLOW_SNAP_MISS=N (pictures: run it drawn, not NODRAW): from the first missed shot of the run, a page screenshot every 30 game frames,
  // N of them (the before / after sheet of a board); the run steps 30 frames at a time until they are taken
  const SNAP_N = Number(process.env.FLOW_SNAP_MISS ?? 0); let snapAt = null, snaps = 0; result.snapFrames = [];
  // FLOW_SNAP_EVERY=K (drawn runs): a page screenshot every K game frames for the whole run (pick the moment from the log afterwards)
  const EVERY = Number(process.env.FLOW_SNAP_EVERY ?? 0);
  await ev((m) => {
    const dev = window.__FEL_DEV__, scene = dev.scene, HG = window.__hg;
    const top = (n) => { while (n && n.parent) n = n.parent; return n; };
    const rows = window.__flowRows = [];
    const foeRoot = () => { const s = scene.metadata[m]; try { if (m === 'onevone') return s.foeRoot; return s.driverRoot ? s.driverRoot() : null; } catch (e) { return null; } };
    scene.onAfterRenderObservable.add(() => {
      if (rows.length > 40000) return;
      const h = top(dev.hero()); const hp = h ? h.getAbsolutePosition() : null; const fr = foeRoot(); const fp = fr ? fr.getAbsolutePosition() : null;
      const hud = window.__hudNow || {};
      const cine = !!(scene.metadata && scene.metadata.felCinematic);
      const pc = HG.possCode ? HG.possCode() : 0;
      const bm = scene.getMeshByName('ball'); const bp = bm ? bm.getAbsolutePosition() : null;
      rows.push([HG.frame, hp ? +hp.x.toFixed(3) : NaN, hp ? +hp.z.toFixed(3) : NaN, fp ? +fp.x.toFixed(3) : NaN, fp ? +fp.z.toFixed(3) : NaN,
        Number(hud.score ?? hud.myScore ?? 0) || 0, Number(hud.foeScore ?? hud.theirScore ?? 0) || 0, pc, cine ? 1 : 0, window.__phase === 'playing' ? 1 : 0, hud.banner ? 1 : 0,
        bp ? +bp.x.toFixed(2) : NaN, bp ? +bp.y.toFixed(2) : NaN, bp ? +bp.z.toFixed(2) : NaN]);
    });
  }, MODE);
  await ev(() => { window.__hg.start(); window.__hg.bot.on = true; window.__hg.autoStrip = false; });
  const tag = MODE === 'onevone' ? '1V1' : '3V3';
  const f0 = await ev(() => window.__frameNo || 0);
  const played = async () => (await ev(() => window.__frameNo || 0)) - f0;
  let said = 0; result.freeThrows = 0;
  while ((await played()) < FRAMES) {
    await runFrames(Math.min(EVERY > 0 ? EVERY : SNAP_N > 0 && snaps < SNAP_N ? 30 : 120, FRAMES - (await played())));
    if (EVERY > 0) { const fr = await ev(() => window.__frameNo || 0); await shot(`every-f${String(fr).padStart(5, '0')}`); result.snapFrames.push(fr); }
    if (SNAP_N > 0 && snaps < SNAP_N) {
      if (snapAt === null) snapAt = await ev((t) => { const l = (window.__LOG || []).find((x) => new RegExp('\\[' + t + '-RIM\\] (left|right|front|back|side_iron|front_iron|back_iron|airball)', 'i').test(x.m)); return l ? l.f : null; }, tag);
      if (snapAt !== null) { const fr = await ev(() => window.__frameNo || 0); await shot(`board-${String(snaps).padStart(2, '0')}-f${fr}`); result.snapFrames.push(fr); snaps++; }
      if (snaps >= SNAP_N && process.env.FLOW_STOP_AFTER_SNAPS === '1') { result.endedBy = 'snaps taken'; break; }
    }
    // a trip to the line (an and-one, a shooting foul) waits for the shooter, and the bot does not shoot free throws: shoot them out as
    // drive.mjs's possession loop does (press, let go at the line meter's green), or the rest of the run is a statue at the line
    for (let k = 0; k < 6; k++) {
      const ftOpen = await ev((t) => { const L = (window.__LOG || []).filter((l) => new RegExp('\\[' + t + '-FT\\]').test(l.m)); if (!L.length) return false; return !/done:|ended the game/.test(L[L.length - 1].m); }, tag);
      if (!ftOpen) break;
      await ev(() => { window.__hg.bot.on = false; });
      await waitGame(900); await ev(() => window.__hg.press('X')); await waitGame(450);
      for (let w = 0; w < 30; w++) { const mm = await ev(() => window.__hg.meterNow()); if (mm.t >= mm.c || mm.t === 0) break; await waitGame(50); }
      await ev(() => window.__hg.release('X')); await waitGame(1800);
      await ev(() => { window.__hg.bot.on = true; }); result.freeThrows++;
    }
    const st = await ev((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; return { ended: !!(s.ended && s.ended()), ph: window.__phase, h: window.__hudNow }; }, MODE);
    const p = await played(); if (p - said >= 600) { said = p; say(`flow ${p} frames  score ${st.h.score ?? '-'}-${st.h.foeScore ?? '-'}`); }
    if (st.ended || st.ph === 'ended') { result.endedBy = 'game over'; break; }
  }
  await ev(() => { window.__hg.bot.on = false; window.__hg.stop(); });
  result.flowRows = await ev(() => window.__flowRows);
  result.analysis = await ev(() => window.__hg.analyse({}));
  result.log = await ev(() => (window.__LOG || []).map((l) => ({ f: l.f, m: String(l.m).slice(0, 160) })));
  result.hud = await ev(() => window.__hud);
  result.bot = await ev(() => { const b = window.__hg.bot; return { moves: b.moves, shots: b.shots, passes: b.passes, pokes: b.pokes, blocks: b.blocks }; });
  await checkpoint('flow');
}
