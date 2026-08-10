import {
  timingScore, energyScore, rangeScore, scoreLine, scorePerformance, rms,
  INTENSITY_BANDS, type ScriptLine, type Delivery, type Scene,
} from '../lib/babylon/core/ActingCore';
import {
  detectJumps, heightFromFlight, summarise, MIN_FLIGHT, MAX_FLIGHT, G,
  type MotionSample,
} from '../lib/babylon/core/IRLCore';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

// ── ActingCore ───────────────────────────────────────────────────────────
const line: ScriptLine = { id: 'l1', text: 'Now.', cueAt: 5, duration: 2, intensity: 'raised' };
const flat = (v: number, n = 20) => Array.from({ length: n }, () => v);
const varied = (lo: number, hi: number, n = 20) =>
  Array.from({ length: n }, (_, i) => (i % 2 ? hi : lo));

const onCue: Delivery = { startedAt: 5, endedAt: 7, envelope: varied(0.25, 0.62) };
ok('perfect cue scores full timing', timingScore(line, onCue) === 1);
ok('late entry costs timing', timingScore(line, { ...onCue, startedAt: 6, endedAt: 8 }) < 1);
ok('early entry costs timing', timingScore(line, { ...onCue, startedAt: 4, endedAt: 6 }) < 1);
ok('timing never goes negative', timingScore(line, { startedAt: 99, endedAt: 120, envelope: [0.3] }) >= 0);
ok('length is judged more loosely than entry',
   timingScore(line, { ...onCue, endedAt: 8.2 }) > timingScore(line, { ...onCue, startedAt: 6.2, endedAt: 8.2 }));

ok('in-band energy is full marks', energyScore(line, { ...onCue, envelope: flat(0.4) }) === 1);
ok('too quiet for raised scores below 1', energyScore(line, { ...onCue, envelope: flat(0.05) }) < 1);
ok('too loud for raised scores below 1', energyScore(line, { ...onCue, envelope: flat(0.95) }) < 1);
const whisperLine: ScriptLine = { ...line, intensity: 'whisper' };
ok('a whisper is judged on its own scale',
   energyScore(whisperLine, { ...onCue, envelope: flat(0.08) }) === 1);
ok('the same level fails a shout line',
   energyScore({ ...line, intensity: 'shout' }, { ...onCue, envelope: flat(0.08) }) < 0.5);

ok('flat delivery scores no range', rangeScore({ ...onCue, envelope: flat(0.4) }) === 0);
ok('varied delivery scores range', rangeScore({ ...onCue, envelope: varied(0.2, 0.6) }) > 0.5);
ok('a single sample has no range', rangeScore({ ...onCue, envelope: [0.4] }) === 0);
ok('rms of silence is 0', rms([]) === 0 && rms([0, 0]) === 0);

const good = scoreLine(line, onCue);
const badTiming = scoreLine(line, { ...onCue, startedAt: 8, endedAt: 10 });
ok('good read beats a mistimed one', good.total > badTiming.total);
ok('late read is told it was late', badTiming.note.toLowerCase().includes('late'));
ok('quiet read is told it was quiet',
   scoreLine(line, { ...onCue, envelope: flat(0.03) }).note.toLowerCase().includes('quiet'));
ok('flat read is told it was flat',
   scoreLine(line, { ...onCue, envelope: flat(0.4) }).note.toLowerCase().includes('flat'));
ok('a landed read says so', good.note.length > 0);

// coverage: skipping lines must not be optimal
const scene: Scene = { id: 's', title: 'S', lines: [line, { ...line, id: 'l2', cueAt: 10 }] };
const bothGood = scorePerformance(scene, { l1: onCue, l2: { ...onCue, startedAt: 10, endedAt: 12 } });
const onlyOne = scorePerformance(scene, { l1: onCue });
ok('performing every line beats performing one', bothGood.average > onlyOne.average,
   `${bothGood.average.toFixed(2)} vs ${onlyOne.average.toFixed(2)}`);
ok('no lines performed scores zero', scorePerformance(scene, {}).average === 0);
ok('no lines performed is 0 stars', scorePerformance(scene, {}).stars === 0);
ok('a full strong performance earns stars', bothGood.stars >= 4, `${bothGood.stars}`);
ok('best and worst are identified', bothGood.best !== null && bothGood.worst !== null);

// ── IRLCore ──────────────────────────────────────────────────────────────
ok('flight time converts to height', Math.abs(heightFromFlight(0.5) - (G * 0.25 / 8)) < 1e-9);
ok('longer flight is higher', heightFromFlight(0.6) > heightFromFlight(0.4));

/** Build a trace: rest, push-off spike, free fall, landing spike, rest. */
function jumpTrace(flight: number, dt = 0.02): MotionSample[] {
  const s: MotionSample[] = [];
  let t = 0;
  const push = (mag: number, dur: number) => {
    for (let k = 0; k < Math.max(1, Math.round(dur / dt)); k++) { s.push({ t, magnitude: mag }); t += dt; }
  };
  push(G, 0.2);            // standing
  push(G * 2.4, 0.06);     // push-off
  push(G * 0.05, flight);  // airborne
  push(G * 3.0, 0.06);     // landing
  push(G, 0.2);            // standing
  return s;
}

const one = detectJumps(jumpTrace(0.45));
ok('detects a single jump', one.length === 1, `${one.length}`);
ok('flight time is about right', one[0] && Math.abs(one[0].flightTime - 0.45) < 0.06, `${one[0]?.flightTime}`);
ok('height derives from flight', one[0] && one[0].height > 0.2 && one[0].height < 0.35, `${one[0]?.height}`);
ok('peak g is recorded', one[0] && one[0].peakG > 2);

ok('a footstep is not a jump', detectJumps(jumpTrace(0.05)).length === 0);
ok('below MIN_FLIGHT is rejected', detectJumps(jumpTrace(MIN_FLIGHT - 0.05)).length === 0);
// the anti-cheat case: a thrown phone free-falls beautifully
ok('a thrown phone is rejected', detectJumps(jumpTrace(MAX_FLIGHT + 0.5)).length === 0);
ok('standing still yields nothing', detectJumps(Array.from({ length: 50 }, (_, i) => ({ t: i * 0.02, magnitude: G }))).length === 0);
ok('empty trace is safe', detectJumps([]).length === 0);

const many = detectJumps([...jumpTrace(0.4), ...jumpTrace(0.5).map(s => ({ ...s, t: s.t + 5 }))]);
ok('detects multiple jumps', many.length === 2, `${many.length}`);
const sum = summarise(many);
ok('best is the highest jump', many.length === 2 && Math.abs(sum.best - Math.max(...many.map(j => j.height))) < 1e-9);
ok('total counts jumps', sum.total === many.length);
ok('average sits between', sum.average > 0 && sum.average <= sum.best);
ok('empty session summarises to zero', summarise([]).best === 0 && summarise([]).total === 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
