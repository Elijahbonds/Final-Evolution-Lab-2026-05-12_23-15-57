// hoops-p08: the HUD-overlap table, before → after (./hud-overlap.mts writes <OUT>/overlap-<tag>.jsonl).
//   node scripts/probes/hoops-p08/overlap-report.mjs <dir> [before] [after]
// Counts ON-SCREEN pairs (the overlap clipped to the viewport). A pair that involves the READY / pause card (a short run can land on it:
// its pickers, its controls list, its motion chip) is the card over the HUD, not two HUD layers, and is left out — listed separately.
import fs from 'node:fs';
import path from 'node:path';
const [dir, A = 'before', B = 'after'] = process.argv.slice(2);
const SPLASH = /MOTION:|LOCATION|BALL|OPPONENT|VENICE BEACH COURT|BLOSSOM PARK|ORBIT|CANOPY COURT|NIGHT ROOFTOP|FINAL EVOLUTION|CONTROLS|OFFENSE|DEFENSE|TAP TO START|PAUSED|\(SHIFT|BOTTOM BUTTON \(J\): PASS|SQUARE \(L\): hold|HOLD R2 \(SHIFT\)|solo vs the rival|PLAYERS|EVENT/;
const read = (tag) => {
  const f = path.join(dir, `overlap-${tag}.jsonl`);
  const rows = new Map();
  if (!fs.existsSync(f)) return rows;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.trim()) continue; const r = JSON.parse(l); if (r.error && !r.play) continue; rows.set(`${r.mode}/${r.view}`, r); }
  return rows;
};
const split = (pairs) => { const hud = [], card = []; for (const p of pairs) (SPLASH.test(p) ? card : hud).push(p); return { hud, card }; };
const a = read(A), b = read(B);
console.log(`HUD overlaps on screen, ${A} → ${B} (play: distinct pairs seen while playing; stack: every bottom layer up at once, voice off / voice on)`);
for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
  const f = (r) => {
    if (!r) return { play: '-', off: '-', on: '-', list: [] };
    const play = split(Object.keys(r.play?.pairsOnScreen ?? {}));
    const off = split(r.stackVoiceOff?.pairsOnScreen ?? []), on = split(r.stackVoiceOn?.pairsOnScreen ?? []);
    return { play: play.hud.length, off: off.hud.length, on: on.hud.length, list: [...new Set([...play.hud, ...off.hud.map((p) => p.replace(/\s+\(\d+ px²\)$/, ''))])], card: play.card.length };
  };
  const x = f(a.get(k)), y = f(b.get(k));
  console.log(`  ${k.padEnd(20)} play ${x.play} → ${y.play} · stack (voice off) ${x.off} → ${y.off} · stack (voice on) ${x.on} → ${y.on}${x.card || y.card ? ` · card-over-HUD pairs left out ${x.card ?? 0} / ${y.card ?? 0}` : ''}`);
  if (process.env.LIST) { for (const p of x.list) console.log(`      ${A}: ${p}`); for (const p of y.list) console.log(`      ${B}: ${p}`); }
}
