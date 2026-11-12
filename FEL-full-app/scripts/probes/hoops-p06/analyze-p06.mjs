// hoops-p06 (1v1 / 3v3 phases 6 and 7): the numbers this lane's gates read, from a hoops-gap rig JSON (drive.mjs `poss` with
// POSS_MOTION=1 POP_LIST=1 STAGE=0, or `game`).
//   node scripts/probes/hoops-p06/analyze-p06.mjs <run.json> [<run.json> ...]
// Per run:
//   overlap        — the recorder's own read (page.js analyse: frames where two roots are under 0.6 m, outside resets), and the closest pair
//   overlapAt      — which pair and where (recomputed here is not possible from the summary; the page lists none) — see `pairs` below
//   defClips       — the DEFENDERS' clip changes per second of defence: a clip STARTING on a defending body (a name with weight > 0.02 that
//                    was not playing on the frame before: every crossfade's start, a twin swap, a beat), counted over the frames that body
//                    defends (the possession code: 1 = mine, so their bodies defend; 2 = theirs, mine defend); also the DOMINANT clip's
//                    switches (the clip with the most weight changes name) — the gate reads `startsPerSec`
//   pace           — every make (the HUD's score / foeScore going up) → the next possession of either side starting (the recorder's
//                    possession code changing), seconds; and every [HOOPS-REPLAY] line with its on-screen length (recorded / 0.5)
//   boards         — the board lines ([1V1-BOARD] / [3V3-BOARD] / [3V3-OFF] board → / the race fallback) counted
import fs from 'node:fs';
const r2 = (x) => Math.round(x * 100) / 100;
for (const file of process.argv.slice(2)) {
  const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  const A = R.analysis || {}; const f0 = A.f0 ?? 0; const P = A.possessions || [];
  const out = { file: file.split('/').slice(-2).join('/'), mode: R.mode, frames: A.frames };
  out.overlap = A.overlap;
  // possession code per page frame
  const sideAt = (pf) => { const i = pf - f0; for (const p of P) if (i >= p.f0 && i <= p.f1) return p.side; return '?'; };
  const bodies = A.bodies || [];
  const mineTeam = (id) => id === 'me' || id.startsWith('mate');
  const defending = (id, pf) => { const s = sideAt(pf); return s === 'mine' ? !mineTeam(id) : s === 'theirs' ? mineTeam(id) : false; };
  // clips: [frame, body, "name:w name:w"] on change
  const parse = (sig) => (sig ? sig.split(' ').map((x) => { const i = x.lastIndexOf(':'); return { n: x.slice(0, i), w: Number(x.slice(i + 1)) }; }) : []);
  const per = {};
  for (const [f, id, sig] of R.clips || []) (per[id] ??= []).push({ f, c: parse(sig) });
  const def = { starts: 0, dom: 0, frames: 0, byBody: {} };
  for (const id of bodies) {
    const L = per[id] || []; let k = -1; let prevSet = new Set(); let prevDom = null; let st = 0, dm = 0, fr = 0;
    const lo = f0, hi = f0 + (A.frames || 0) - 1;
    for (let pf = lo; pf <= hi; pf++) {
      while (k + 1 < L.length && L[k + 1].f <= pf) k++;
      const cur = k >= 0 ? L[k].c : [];
      const set = new Set(cur.map((x) => x.n));
      const dom = cur.length ? cur.reduce((a, b) => (b.w > a.w ? b : a)).n : null;
      if (defending(id, pf)) {
        fr++;
        for (const n of set) if (!prevSet.has(n) && pf > lo) st++;
        if (prevDom !== null && dom !== null && dom !== prevDom) dm++;
      }
      prevSet = set; prevDom = dom;
    }
    def.byBody[id] = { defSec: r2(fr / 60), startsPerSec: fr ? r2(st / (fr / 60)) : null, domPerSec: fr ? r2(dm / (fr / 60)) : null };
    def.starts += st; def.dom += dm; def.frames += fr;
  }
  out.defClips = { defSec: r2(def.frames / 60), startsPerSec: def.frames ? r2(def.starts / (def.frames / 60)) : null, domPerSec: def.frames ? r2(def.dom / (def.frames / 60)) : null, byBody: def.byBody };
  // pace
  const hud = R.hud || []; const log = R.log || [];
  let my = 0, foe = 0; const makes = [];
  for (const h of hud) { if (typeof h.score === 'number' && h.score > my) { makes.push({ f: h.f, who: 'me' }); my = h.score; } if (typeof h.foeScore === 'number' && h.foeScore > foe) { makes.push({ f: h.f, who: 'foe' }); foe = h.foeScore; } }
  // the next live possession: the recorder's possession code changing, OR the mode's own reset marks (1v1 make-it-take-it keeps the code:
  // its reset writes the HUD's shotType '' and a check-up banner says DEFEND; 3v3's their-ball logs the drive intent)
  const resetMarks = [...hud.filter((h) => h.shotType === '' || /DEFEND/.test(String(h.banner ?? ''))).map((h) => h.f), ...log.filter((l) => /\[3V3-DEF\] drive intent/.test(l.m)).map((l) => l.f)].sort((a, b) => a - b);
  out.pace = makes.map((m) => { const i = m.f - f0; const nx = P.find((p) => p.f0 > i + 2); const byCode = nx ? nx.f0 + f0 : Infinity; const byMark = resetMarks.find((f) => f > m.f + 2) ?? Infinity; const nf = Math.min(byCode, byMark); return { who: m.who, atF: m.f, toNextPossS: Number.isFinite(nf) ? r2((nf - m.f) / 60) : null, by: nf === byCode ? 'possession code' : 'reset mark' }; });
  out.replays = log.filter((l) => /\[HOOPS-REPLAY\]/.test(l.m)).map((l) => { const s = Number((l.m.match(/last ([\d.]+) s/) || [])[1]); return { f: l.f, recordedS: s, onScreenS: r2(s / 0.5) }; });
  out.boards = {
    live: log.filter((l) => /BOARD\] .* secures it/.test(l.m)).length,
    race: log.filter((l) => /falling back to the race|\[3V3-OFF\] board →/.test(l.m)).length,
    swatOrBlock: log.filter((l) => /SWATTED|blocked at the release/.test(l.m)).length,
  };
  out.rivalPoss = (R.poss || []).filter((p) => p.side === 'def').map((p) => p.sec);
  console.log(JSON.stringify(out, null, 1));
}
