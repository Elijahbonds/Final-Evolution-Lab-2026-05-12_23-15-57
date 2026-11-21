// hoops-play: the input → response table over several hoops-gap `input` runs (drive.mjs TESTS=stick,stop,shot,buffer,flick).
// Every number is game frames on the rig's 1/60 s clock, shown in ms (frames × 16.7). Per read: each run's values, then the median of all.
//   node scripts/probes/hoops-play/input-table.mjs <input.json> [...]
import fs from 'node:fs';
const ms = (f) => (f == null ? null : Math.round(f * 1000 / 60));
const med = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const reads = {
  'stick onset (walk), ms': (T) => T.stick.map((x) => ms(x.onsetF)),
  'stick to 90 % pace (walk), ms': (T) => T.stick.map((x) => ms(x.to90F)),
  'reversal (walk), ms': (T) => T.stick.map((x) => ms(x.reverseF)),
  'stick onset (turbo), ms': (T) => T.stickTurbo.map((x) => ms(x.onsetF)),
  'to 90 % pace (turbo), ms': (T) => T.stickTurbo.map((x) => ms(x.to90F)),
  'stop from a jog, ms': (T) => (T.stopJog || []).map((x) => ms(x.stopF)),
  'stop from a jog, m': (T) => (T.stopJog || []).map((x) => x.stopM),
  'stop from a sprint, ms': (T) => (T.stopSprint || []).map((x) => ms(x.stopF)),
  'stop from a sprint, m': (T) => (T.stopSprint || []).map((x) => x.stopM),
  'shot press → meter, ms': (T) => T.shot.map((x) => ms(x.meterF)),
  'shot press → body (anim state), ms': (T) => T.shot.map((x) => ms(x.animF)),
  'shot press → ball up 5 cm, ms': (T) => T.shot.map((x) => ms(x.ballUpF)),
  'shot tapped mid-spin: press → shot on, ms': (T) => T.buffer.filter((x) => x.kind === 'spin').map((x) => ms(x.pressToFireF)),
  'shot tapped mid-spin: spin clears → shot on, ms': (T) => T.buffer.filter((x) => x.kind === 'spin').map((x) => ms(x.clearToFireF)),
  'shot tapped mid-crossover: press → shot on, ms': (T) => T.buffer.filter((x) => x.kind === 'cross').map((x) => ms(x.pressToFireF)),
  'flick standing: answered (of 8)': (T) => [T.flickStand.filter((x) => x.logF != null).length],
  'flick standing: press → move line, ms': (T) => T.flickStand.map((x) => ms(x.logF)),
  'flick jogging: answered (of 8)': (T) => [T.flickJog.filter((x) => x.logF != null).length],
  'flick jogging: press → move line, ms': (T) => T.flickJog.map((x) => ms(x.logF)),
};
const files = process.argv.slice(2); const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
console.log(`| read | ${runs.map((r) => `${r.mode} s${r.seed}`).join(' | ')} | median |`);
console.log(`|---|${runs.map(() => '---').join('|')}|---|`);
for (const [name, fn] of Object.entries(reads)) {
  const per = runs.map((r) => { try { return fn(r.tests) || []; } catch (e) { return []; } });
  console.log(`| ${name} | ${per.map((a) => a.join(' / ')).join(' | ')} | ${med(per.flat())} |`);
}
