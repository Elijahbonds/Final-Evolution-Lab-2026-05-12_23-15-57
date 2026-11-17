// hoops-audit-show (2026-11-12): the numbers in show.mts's run.json files.
//   node scripts/probes/hoops-audit/show/analyze.mjs <OUT dir> [--json]
// Per <mode>-<profile> run:
//   camera  — snaps (> 0.5 m or > 10 deg in one game frame), split into cinematic frames (a replay / cut: felCinematic) and live play;
//             turn-rate p99 (deg/s) in live play; FOV changes; the largest live step;
//   framing — the hero's feet and head inside the frame (% of live frames; both inside = "whole hero"), and the share of skinned bodies
//             inside the frame (3v3: all six in frame %);
//   shaders — GL program links by phase (loading / ready / playing) and the game seconds of each link in play;
//   sound   — the SoundKit cues the game asked for, by name; Web Audio nodes made; media elements played;
//   load    — wall seconds to the READY card on the probe box, bytes fetched by kind;
//   results — the focused button and its size.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: analyze.mjs <OUT dir> [--json]'); process.exit(2); }
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const r1 = (x) => Math.round(x * 10) / 10;
const rows = [];
for (const sub of fs.readdirSync(dir).sort()) {
  const f = path.join(dir, sub, 'run.json');
  if (!fs.existsSync(f)) continue;
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  const row = { run: sub, error: run.error ?? null, wallToReadyS: run.wallToReadyS && r1(run.wallToReadyS), gameS: run.gameSecondsPlayed && r1(run.gameSecondsPlayed) };
  const rec = run.rec;
  if (rec && rec.f && rec.f.length > 2) {
    const C = Object.fromEntries(rec.cols.map((c, i) => [c, i]));
    const F = rec.f.filter((x) => x[C.playing] === 1);
    let snapsLive = 0, snapsCine = 0, maxMove = 0, maxTurn = 0, fovChanges = 0; const turns = []; const snapAt = [];
    for (let i = 1; i < F.length; i++) {
      const a = F[i - 1], b = F[i];
      const df = b[C.frame] - a[C.frame]; if (df <= 0 || df > 3) continue;   // a gap (a shot was taken): not a frame-to-frame step
      const mv = Math.hypot(b[C.px] - a[C.px], b[C.py] - a[C.py], b[C.pz] - a[C.pz]) / df;
      const dot = Math.max(-1, Math.min(1, a[C.dx] * b[C.dx] + a[C.dy] * b[C.dy] + a[C.dz] * b[C.dz]));
      const turn = (Math.acos(dot) * 180) / Math.PI / df;
      const cine = a[C.cine] || b[C.cine];
      if (Math.abs(b[C.fov] - a[C.fov]) > 0.002) fovChanges++;
      if (mv > 0.5 || turn > 10) { if (cine) snapsCine++; else { snapsLive++; if (snapAt.length < 12) snapAt.push(`f${b[C.frame]} ${mv.toFixed(2)}m ${turn.toFixed(1)}deg`); } }
      if (!cine) { turns.push(turn * 60); maxMove = Math.max(maxMove, mv); maxTurn = Math.max(maxTurn, turn); }
    }
    const live = F.filter((x) => !x[C.cine]);
    const inF = (x, y) => Math.abs(x) <= 1 && Math.abs(y) <= 1;
    const feet = live.filter((x) => inF(x[C.feetX], x[C.feetY])).length, head = live.filter((x) => inF(x[C.headX], x[C.headY])).length;
    const whole = live.filter((x) => inF(x[C.feetX], x[C.feetY]) && inF(x[C.headX], x[C.headY])).length;
    const withBodies = live.filter((x) => x[C.bodies] > 0);
    const allIn = withBodies.filter((x) => x[C.bodiesIn] >= x[C.bodies]).length;
    const bodyShare = withBodies.reduce((s, x) => s + x[C.bodiesIn] / x[C.bodies], 0) / Math.max(1, withBodies.length);
    Object.assign(row, {
      framesLive: live.length, framesCine: F.length - live.length,
      camSnapsLive: snapsLive, camSnapsCine: snapsCine, snapAt, camTurnP99DegS: r1(pct(turns, 0.99)), camMaxStepM: Math.round(maxMove * 100) / 100, camMaxTurnDeg: r1(maxTurn), fovChanges,
      heroFeetInPct: r1((100 * feet) / Math.max(1, live.length)), heroHeadInPct: r1((100 * head) / Math.max(1, live.length)), heroWholeInPct: r1((100 * whole) / Math.max(1, live.length)),
      bodies: pct(withBodies.map((x) => x[C.bodies]), 0.5), allBodiesInPct: r1((100 * allIn) / Math.max(1, withBodies.length)), bodyShareInPct: r1(100 * bodyShare),
      drawsP50: pct(F.map((x) => x[C.draws]), 0.5), drawsMax: Math.max(...F.map((x) => x[C.draws])),
    });
  }
  const links = run.links ?? [];
  const by = {}; for (const [, , tag] of links) by[tag] = (by[tag] ?? 0) + 1;
  row.glLinks = by;
  const t0 = rec?.f?.find((x) => x[rec.cols.indexOf('playing')] === 1);
  row.glLinksInPlayAtS = links.filter((l) => l[2] === 'playing').map((l) => r1((l[0] - (links.find((k) => k[2] === 'playing')?.[0] ?? l[0])) / 1000)).slice(0, 30);
  void t0;
  const sfx = run.audio?.sfx ?? []; const cues = {}; for (const s of sfx) cues[s.name] = (cues[s.name] ?? 0) + 1;
  row.sfx = cues; row.audioNodes = run.audio?.aud ? { osc: run.audio.aud.osc, buf: run.audio.aud.buf, decode: run.audio.aud.decode, media: run.audio.aud.media } : null;
  row.mediaSrc = run.audio?.aud?.mediaSrc ?? [];
  row.bytesMB = Object.fromEntries(Object.entries(run.bytes ?? {}).map(([k, v]) => [k, Math.round(v / 1e5) / 10]));
  row.bytesTotalMB = Math.round(Object.values(run.bytes ?? {}).reduce((s, v) => s + v, 0) / 1e5) / 10;
  row.results = run.results ? { focused: run.results.focused, box: run.results.focusedBox } : null;
  row.scene = run.scene ?? null; row.heapMb = run.heapMb;
  row.replays = (run.log ?? []).filter((l) => /HOOPS-REPLAY/.test(l[2])).map((l) => l[2]).slice(0, 6);
  row.frameWarn = (run.log ?? []).filter((l) => /FEL-FRAME/.test(l[2])).length;
  row.errors = (run.errors ?? []).length; row.err0 = (run.errors ?? [])[0];
  row.shots = run.shots;
  rows.push(row);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(JSON.stringify(r));
