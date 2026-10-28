// hoops-audit: read the driver's JSON and print the numbers the goal-gap doc uses.
//   node analyze.mjs <game-or-input.json> [--shapes]
// game: possessions (length, outcome from the HUD's score / banners in the possession and 0.5 s after), steal / block / foul
// rates per side, make-to-next-possession pace, the AI's shot and move mix from the log, motion per body, ball, camera, overlap.
// input: the input -> response table (frames x 16.7 ms on the game clock).
import fs from 'node:fs';
const [file] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const ms = (f) => (f === null || f === undefined ? '-' : Math.round(f * 1000 / 60));
const med = (a) => { const s = a.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const out = { file, mode: R.mode, scen: R.scen };
if (R.scen === 'game') {
  const A = R.analysis; const hud = R.hud || []; const log = R.log || [];
  const f0 = log.length ? 0 : 0;
  out.gameS = +R.gameS?.toFixed?.(1); out.endedBy = R.endedBy; out.scoreEnd = `${R.hudEnd?.score ?? '-'}-${R.hudEnd?.foeScore ?? '-'}`;
  // the HUD's score changes and banners, by recorder frame (hud.f is the page frame; the recorder started at HG.f0)
  const frames = A.frames; const base = (R.hud?.length ? 0 : 0);
  let my = 0, foe = 0; const makes = [];
  for (const h of hud) { if (typeof h.score === 'number' && h.score > my) { makes.push({ f: h.f, who: 'me', pts: h.score - my }); my = h.score; } if (typeof h.foeScore === 'number' && h.foeScore > foe) { makes.push({ f: h.f, who: 'foe', pts: h.foeScore - foe }); foe = h.foeScore; } }
  const banners = hud.filter((h) => h.banner).map((h) => ({ f: h.f, b: String(h.banner) }));
  const cls = (b) => (/PICKED|STOLE|STEAL|STRIP|POCKET|TURNOVER/i.test(b) ? 'steal' : /BLOCK|SWAT|REJECT|STUFF/i.test(b) ? 'block' : /FOUL|CHARGE|REACH|HAND.CHECK|AND.ONE|VIOLATION|TRAVEL/i.test(b) ? 'foul' : /BOARD|REBOUND/i.test(b) ? 'board' : /SHOT CLOCK/i.test(b) ? 'clock' : '');
  const bc = {}; for (const x of banners) { const k = x.b.replace(/\d+/g, '#').slice(0, 40); bc[k] = (bc[k] || 0) + 1; }
  out.banners = Object.entries(bc).sort((a, b) => b[1] - a[1]).slice(0, 40);
  // possessions: the recorder's segments, offset into page frames by the first HUD/log frame alignment (HG.f0 not exported:
  // the recorder starts ~frame of the first input) — use the first input's frame as the recorder's frame 0
  const fIn0 = A.f0 ?? (R.inputs?.length ? R.inputs[0][0] : 0);
  const P = A.possessions.filter((p) => p.sec >= 0.3).map((p) => {
    const a = p.f0 + fIn0, b = p.f1 + fIn0 + 30;
    const ev = banners.filter((x) => x.f >= a && x.f <= b).map((x) => cls(x.b)).filter(Boolean);
    const mk = makes.filter((m) => m.f >= a && m.f <= b);
    return { side: p.side, sec: p.sec, made: mk.length ? mk.map((m) => m.who + '+' + m.pts).join(',') : '', ev: [...new Set(ev)].join(','), pops: p.pops || {}, snaps: p.rootSnaps || {} };
  });
  out.possessions = { n: P.length, mine: P.filter((p) => p.side === 'mine').length, theirs: P.filter((p) => p.side === 'theirs').length,
    medSecMine: med(P.filter((p) => p.side === 'mine').map((p) => p.sec)), medSecTheirs: med(P.filter((p) => p.side === 'theirs').map((p) => p.sec)),
    list: P.map((p) => `${p.side[0]} ${p.sec}s ${p.made || '-'} ${p.ev || ''} pops(me ${p.pops.me || 0}) snaps(me ${p.snaps.me || 0})`) };
  const cnt = (side, k) => P.filter((p) => p.side === side && p.ev.split(',').includes(k)).length;
  out.rates = { theirPossStolenByMe: `${cnt('theirs', 'steal')}/${out.possessions.theirs}`, myPossStolenByAI: `${cnt('mine', 'steal')}/${out.possessions.mine}`, blocksOnTheirPoss: `${cnt('theirs', 'block')}/${out.possessions.theirs}`, blocksOnMyPoss: `${cnt('mine', 'block')}/${out.possessions.mine}`, fouls: P.filter((p) => p.ev.includes('foul')).length, makesMe: makes.filter((m) => m.who === 'me').length, makesFoe: makes.filter((m) => m.who === 'foe').length, myShots: R.bot?.shots };
  // pace: a make to the next possession of the other side
  const pace = []; for (const m of makes) { const rel = m.f - fIn0; const nx = A.possessions.find((p) => p.f0 > rel + 5); if (nx) pace.push((nx.f0 - rel) / 60); }
  out.makeToNextPossS = { med: med(pace) ? +med(pace).toFixed(2) : null, n: pace.length };
  // log shapes (digits stripped) — the AI's choices are read from these
  const shapes = {}; for (const l of log) { const k = l.m.replace(/-?\d+(\.\d+)?/g, '#').slice(0, 70); shapes[k] = (shapes[k] || 0) + 1; }
  out.logShapes = Object.entries(shapes).sort((a, b) => b[1] - a[1]).slice(0, process.argv.includes('--shapes') ? 200 : 60);
  // hoops-p03: the rival's actions per possession (the kit's / team offence's log lines), screens and passes per their possession
  { const ACT = /\[(1V1|3V3)-AI\] rival action (\w+)/; const TH = P.filter((p) => p.side === 'theirs');
    const per = TH.map((p, i) => { const a = A.possessions.filter((q) => q.sec >= 0.3)[P.indexOf(p)]; const f0 = (a?.f0 ?? 0) + fIn0, f1 = (a?.f1 ?? 0) + fIn0 + 10; return log.filter((l) => l.f >= f0 && l.f <= f1).map((l) => (l.m.match(ACT) || [])[2]).filter(Boolean); });
    const all = per.flat(); const cnt = {}; for (const x of all) cnt[x] = (cnt[x] || 0) + 1; const n = all.length; let bits = 0; for (const v of Object.values(cnt)) { const q = v / n; bits -= q * Math.log2(q); }
    out.rivalActions = { possessions: per.length, distinct: Object.keys(cnt).length, bits: +bits.toFixed(2), mix: cnt, screenOr2Pass: per.filter((a) => a.includes('screen') || a.filter((x) => x === 'swing_pass').length >= 2).length, perPoss: per.map((a) => a.join(' ')) }; }
  out.motion = A.perBody; out.ball = A.ball; out.camera = A.camera; out.overlap = A.overlap; out.bot = R.bot; out.errors = [...(R.pageErrors || []), ...(R.hgErrors || [])];
} else {
  const T = R.tests;
  const row = (name, arr = [], keys) => ({ name, n: arr.length, ...Object.fromEntries(keys.map((k) => [k + 'Ms', ms(med(arr.map((x) => x[k])))])), raw: arr.map((x) => Object.fromEntries(keys.map((k) => [k, x[k]]))) });
  out.stick = row('stick', T.stick, ['onsetF', 'to90F', 'reverseF', 'stopF']); out.stick.settle = med((T.stick || []).map((x) => x.settle)); out.stick.stopM = med(T.stick.map((x) => x.stopM));
  out.stickTurbo = row('stickTurbo', T.stickTurbo, ['onsetF', 'to90F', 'reverseF', 'stopF']); out.stickTurbo.settle = med(T.stickTurbo.map((x) => x.settle)); out.stickTurbo.stopM = med(T.stickTurbo.map((x) => x.stopM));
  out.shot = row('shot', T.shot, ['meterF', 'ballUpF', 'animF', 'releaseF']); out.shot.banners = (T.shot || []).map((x) => x.banner);
  const fl = (arr = []) => ({ fired: arr.filter((x) => x.logF !== null).length, n: arr.length, logMs: ms(med(arr.map((x) => x.logF))), moves: arr.map((x) => `${x.dir}:${x.logF === null ? 'NONE' : x.log.replace(/^\[[A-Z0-9-]+\] /, '').slice(0, 40)} shift ${x.ballShift}`) });
  out.stick.stopFromMps = med(T.stick.map((x) => x.stopFromMps)); out.stickTurbo.stopFromMps = med(T.stickTurbo.map((x) => x.stopFromMps));
  const sl = (arr) => (arr?.length ? { n: arr.length, fromMps: med(arr.map((x) => x.fromMps)), stopMs: ms(med(arr.map((x) => x.stopF))), stopM: med(arr.map((x) => x.stopM)), raw: arr.map((x) => `${x.fromMps} m/s → ${x.stopF} f / ${x.stopM} m`) } : null);
  out.stopJog = sl(T.stopJog); out.stopSprint = sl(T.stopSprint);
  if (T.buffer?.length) out.buffer = T.buffer.map((x) => `${x.kind}: busy@press ${x.busyAtPress} press→clear ${ms(x.pressToClearF)} ms press→fire ${ms(x.pressToFireF)} ms clear→fire ${ms(x.clearToFireF)} ms`);
  out.stopPops = R.stopPops; out.heroMotion = R.heroMotion;
  out.flickStand = fl(T.flickStand); out.flickJog = fl(T.flickJog);
  // hoops-p01: stricter — a move RENDERED (a HANDLE move / size-up / link / snatch / slide line, a spin, PAUSIN', a drop step) inside 0.7 s
  // of the flick, or a refusal said out loud (a banner from core/Refusal); a `[*-STICK] flick → x` line alone only says the gesture was read
  const LOG = R.log || []; const HUD = R.hud || [];
  const FIRED = /\[(1V1|3V3)-HANDLE\] (move|size-up|link|snatch|btb|spin gathers|retract)|\[(1V1|3V3)-MOVE\] (spin|front pivot|reverse pivot|footwork)|\[(1V1|3V3)-STICK\] (PAUSIN|drop step)/;
  const strict = (arr = []) => { const rows = arr.map((x) => { const l = LOG.find((q) => q.f >= x.f0 && q.f <= x.f0 + 42 && FIRED.test(q.m)); const read = LOG.find((q) => q.f >= x.f0 && q.f <= x.f0 + 42 && /\[(1V1|3V3)-STICK\]/.test(q.m)); return { dir: x.dir, fired: !!l, read: read ? read.m.replace(/^\[[A-Z0-9-]+\] /, '').slice(0, 60) : 'NO READ', move: l ? l.m.replace(/^\[[A-Z0-9-]+\] /, '').slice(0, 50) : '-', fireMs: l ? ms(l.f - x.f0) : null }; });
    return { fired: rows.filter((r) => r.fired).length, n: rows.length, silent: rows.filter((r) => !r.fired && r.read === 'NO READ').length, rows: rows.map((r) => `${r.dir}: ${r.fired ? 'FIRED ' + r.fireMs + ' ms ' + r.move : 'NOT FIRED (' + r.read + ')'}`) }; };
  out.flickStandStrict = strict(T.flickStand); out.flickJogStrict = strict(T.flickJog);
  if (T.pass?.length) out.pass = row('pass', T.pass, ['leaveF', 'catchF']);
  out.poke = row('poke', T.poke, ['logF', 'handF']); out.poke.logs = (T.poke || []).map((x) => x.log);
  out.block = row('block', T.block, ['upF']); out.block.rise = (T.block || []).map((x) => x.rise);
  out.errors = [...(R.pageErrors || []), ...(R.hgErrors || [])];
}
console.log(JSON.stringify(out, null, 1));
