// hoops-p02 (1v1/3v3 phase 2): the defence gates from a rig `game` (or `input`) JSON — what analyze.mjs does not read.
//   node analyze-defense.mjs <run.json> [more.json ...]
// Per run (and summed over all given runs):
//   · my block on THEIR releases: their releases, my blocks (REJECTED banners / block lines), and with the hand read my per-release
//     verdicts (HIT / miss, the gap, the ball's height);
//   · the AI's block on MY releases: the dice's expected value (the logged `block` chance, summed) vs the hand read's hits;
//   · stops on my possessions (steals / strips, blocks, charges drawn) — counted from the log, one per possession at most;
//   · contests: mean per shooter, the one model and the old formula side by side (when the run logs both);
//   · release heights from the defence snapshots (the ball's y on the release line);
//   · goaltending calls and the AI's strip reads (ON THE BALL / no) with the reach, the shield and the ball's height.
import fs from 'node:fs';
const files = process.argv.slice(2);
const num = (re, m) => { const x = re.exec(m); return x ? Number(x[1]) : null; };
const mean = (a) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3) : null);
const tot = { theirRel: 0, myBlocks: 0, myGeoHits: 0, myRel: 0, aiOldExp: 0, aiGeoHits: 0, aiBlocked: 0, myPoss: 0, stops: 0, steals: 0, aiBlocks: 0, charges: 0, goaltends: 0 };
for (const f of files) {
  const R = JSON.parse(fs.readFileSync(f, 'utf8'));
  const L = (R.log || []).map((l) => ({ f: l.f, m: l.m }));
  const out = { file: f.split('/').pop(), mode: R.mode, scen: R.scen, gameS: R.gameS };
  const tag = R.mode === 'onevone' ? '1V1' : '3V3';
  // their releases and my blocks
  const theirRel = L.filter((l) => new RegExp(`\\[${tag}-DEF\\] rival release`).test(l.m));
  const myReads = L.filter((l) => /my block read on his/.test(l.m));
  const myBlocks = L.filter((l) => /\] swat at k|REJECTED|blocked by me|my block read .*HIT/.test(l.m));
  const hud = (R.hud || []).filter((h) => h.banner && /^REJECTED/.test(String(h.banner)));
  out.theirReleases = theirRel.length + myBlocks.filter((l) => /HIT/.test(l.m)).length;   // a blocked release logs no "rival release"
  out.myBlocks = hud.length;
  out.myReads = { n: myReads.length, hits: myReads.filter((l) => /HIT/.test(l.m)).length, gaps: myReads.map((l) => num(/gap ([\d.]+)/, l.m)), ballY: myReads.map((l) => num(/ball y ([\d.]+)/, l.m)), jumpAge: myReads.map((l) => l.m.match(/jumpAge (\S+)/)?.[1]) };
  // my releases and the AI's block
  const myRel = L.filter((l) => new RegExp(`\\[${tag}-DEF\\] my release`).test(l.m));
  out.myReleases = myRel.length;
  out.aiBlockOldExpected = +myRel.reduce((s, l) => s + (num(/ block ([\d.]+)/, l.m) || 0), 0).toFixed(3);
  out.aiBlockGeoHits = myRel.filter((l) => / geo HIT/.test(l.m)).length;
  out.aiBlocked = L.filter((l) => /blocked at the release|ai swat at the bump|rim protector swat|ai swat read at the bump: HIT/.test(l.m)).length;
  out.aiReleaseReads = myRel.map((l) => ({ style: l.m.match(/my release (\S+)/)?.[1], dist: num(/ dist ([\d.]+)/, l.m), chance: num(/ block ([\d.]+)/, l.m), geo: l.m.match(/ geo (HIT|miss)/)?.[1] ?? null, gap: num(/ gap ([\d.]+)/, l.m), ballY: num(/ball y ([\d.]+)/, l.m), jump: l.m.match(/jumpAge (\S+)/)?.[1] ?? null }));
  // contests
  const cNew = myRel.map((l) => num(/ contest ([\d.]+)/, l.m)), cOld = myRel.map((l) => num(/oldContest ([\d.]+)/, l.m)).filter((x) => x !== null);
  const rNew = theirRel.map((l) => num(/ contest ([\d.]+)/, l.m)), rOld = theirRel.map((l) => num(/(?:old|\(old) ([\d.]+)/, l.m)).filter((x) => x !== null);
  const mates = L.filter((l) => /mate shot contest/.test(l.m));
  out.contest = { hero: { now: mean(cNew), old: mean(cOld), n: cNew.length }, rival: { now: mean(rNew), old: mean(rOld), n: rNew.length },
    mates: { now: mean(mates.map((l) => num(/contest ([\d.]+)/, l.m))), old: mean(mates.map((l) => num(/old ([\d.]+)/, l.m))), n: mates.length } };
  // stops on my possessions (from the HUD banners: steal / block / charge), and the AI's strip reads
  const ban = (R.hud || []).filter((h) => h.banner).map((h) => String(h.banner));
  out.stopsOnMe = { steals: ban.filter((b) => /STRIPPED|STOLEN|PICKED|POCKET/.test(b) && !/THEIR POCKET/.test(b)).length, blocks: ban.filter((b) => /^BLOCKED|REJECTED!$|MET AT THE RIM/.test(b)).length, charges: ban.filter((b) => /^CHARGE/.test(b)).length };
  out.aiReach = { tells: L.filter((l) => /ai reach tell/.test(l.m)).length, resolves: L.filter((l) => /ai reach resolve/.test(l.m)).map((l) => l.m.replace(/^\[[^\]]+\] ai reach resolve /, '').slice(0, 90)) };
  out.goaltends = L.filter((l) => /goaltending/.test(l.m)).length;
  // release heights from the snapshots
  const sn = R.snaps || [];
  out.releaseBallY = { theirs: sn.filter((s) => /rival release|my block read/.test(s.m) && s.ball).map((s) => s.ball[1]), mine: sn.filter((s) => /my release/.test(s.m) && s.ball).map((s) => s.ball[1]) };
  out.botBlocks = R.bot?.blocks; out.botPokes = R.bot?.pokes; out.botShots = R.bot?.shots;
  // the possession loop (drive.mjs POSS): one verdict per possession
  if (R.poss?.length) {
    const P = R.poss.map((p) => {
      const b = p.banners.join(' | '), lg = p.log.join('\n');
      if (p.side === 'def') return { side: 'def', sec: p.sec, shot: /rival release|rival dunk/.test(lg), myBlock: /(^| \| )REJECTED/.test(b), mySteal: /POCKET|STRIPPED ON THE BUMP|STOLE IT|PARRY|DRIVE-BY|STRIP!/.test(b), geo: p.log.filter((m) => /my block read/.test(m)).map((m) => m.replace(/^\[[^\]]+\] my block read on his /, '').slice(0, 80)), banners: b.slice(0, 120) };
      return { side: 'off', sec: p.sec, shot: /my release|drive contest|mate shot/.test(lg), aiStop: /strip by the ai|blocked at the release|rim protector swat at|ai swat at the bump|ai swat read at the bump: HIT|CONTACT\] charge|REF\] charge .*→ foe/.test(lg) || /PICKED OFF/.test(b), aiStopWhat: (lg.match(/strip by the ai|blocked at the release|rim protector swat|ai swat[^\n]{0,30}|CONTACT\] charge|REF\] charge/g) || []).concat(/PICKED OFF/.test(b) ? ['interception'] : []), aiBlockReads: p.log.filter((m) => /my release/.test(m)).map((m) => `${m.match(/my release (\S+)/)?.[1]} d ${m.match(/ dist ([\d.]+)/)?.[1]} old ${m.match(/ block ([\d.]+)/)?.[1]}${m.match(/ geo (HIT|miss)/) ? ' geo ' + m.match(/ geo (HIT|miss)/)[1] + ' y ' + m.match(/ball y ([\d.]+)/)?.[1] : ''}`), reach: p.log.filter((m) => /ai reach resolve/.test(m)).map((m) => m.replace(/^\[[^\]]+\] ai reach resolve /, '').slice(0, 70)), banners: b.slice(0, 120) };
    });
    const D = P.filter((x) => x.side === 'def'), O = P.filter((x) => x.side === 'off');
    out.possLoop = { def: D.length, theirShots: D.filter((x) => x.shot || x.myBlock).length, myBlocks: D.filter((x) => x.myBlock).length, mySteals: D.filter((x) => x.mySteal).length,
      off: O.length, myShots: O.filter((x) => x.shot).length, aiStops: O.filter((x) => x.aiStop).length, list: P };
    tot.poss = tot.poss || { def: 0, theirShots: 0, myBlocks: 0, off: 0, aiStops: 0 };
    tot.poss.def += out.possLoop.def; tot.poss.theirShots += out.possLoop.theirShots; tot.poss.myBlocks += out.possLoop.myBlocks; tot.poss.off += out.possLoop.off; tot.poss.aiStops += out.possLoop.aiStops;
  }
  console.log(JSON.stringify(out, null, 1));
  tot.theirRel += out.theirReleases; tot.myBlocks += out.myBlocks; tot.myGeoHits += out.myReads.hits; tot.myRel += out.myReleases; tot.aiOldExp += out.aiBlockOldExpected; tot.aiGeoHits += out.aiBlockGeoHits; tot.aiBlocked += out.aiBlocked;
  tot.steals += out.stopsOnMe.steals; tot.aiBlocks += out.stopsOnMe.blocks; tot.charges += out.stopsOnMe.charges; tot.goaltends += out.goaltends;
}
if (files.length > 1) console.log('TOTAL', JSON.stringify(tot));
