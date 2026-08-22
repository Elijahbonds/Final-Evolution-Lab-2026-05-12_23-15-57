import {
  gradeSwing, planShot, shotAt, heightAtNet, judgeShot, TennisScore, VolleyScore,
  RallyState, TENNIS, VOLLEYBALL,
} from '../lib/babylon/core/RallyCore';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// timing
ok('perfect at 0', gradeSwing(0) === 'perfect');
ok('good at 0.15', gradeSwing(0.15) === 'good');
ok('early is negative side', gradeSwing(-0.30) === 'early');
ok('late is positive side', gradeSwing(0.30) === 'late');
ok('miss beyond window', gradeSwing(0.9) === 'miss');

// flight
const from = { x: 0, y: 1, z: 10 };
const perfect = planShot(TENNIS, from, -1, 0, 'perfect')!;
const weak = planShot(TENNIS, from, -1, 0, 'late')!;
ok('miss plans no shot', planShot(TENNIS, from, -1, 0, 'miss') === null);
ok('perfect lands deeper than late', Math.abs(perfect.to.z) > Math.abs(weak.to.z),
   `${perfect.to.z.toFixed(2)} vs ${weak.to.z.toFixed(2)}`);
ok('weak contact arcs higher', weak.apex > perfect.apex, `${weak.apex} vs ${perfect.apex}`);
ok('shot crosses to far side', perfect.to.z < 0);
ok('both clear the net', (heightAtNet(perfect)! > TENNIS.netHeight) && (heightAtNet(weak)! > TENNIS.netHeight),
   `${heightAtNet(perfect)?.toFixed(2)} / ${heightAtNet(weak)?.toFixed(2)}`);
ok('no fault on a good shot', judgeShot(TENNIS, perfect) === null);
ok('t=0 is origin', shotAt(perfect, 0).z === from.z);
ok('t=1 is target', Math.abs(shotAt(perfect, 1).z - perfect.to.z) < 1e-9);
ok('apex is above both ends', shotAt(perfect, 0.5).y > Math.max(from.y, perfect.to.y));

// faults
ok('wide is called wide', judgeShot(TENNIS, { ...perfect, to: { x: 99, y: 0, z: -8 } }) === 'wide');
ok('long is called long', judgeShot(TENNIS, { ...perfect, to: { x: 0, y: 0, z: -99 } }) === 'long');
ok('net beats out-call', judgeShot(TENNIS, { from, to: { x: 99, y: 0, z: -99 }, apex: 0.1, duration: 1 }) === 'net');

// tennis scoring
const t = new TennisScore(2);
ok('0-0 at start', t.callFor(0) === '0-0');
t.award(0); ok('15-0', t.callFor(0) === '15-0');
t.award(0); t.award(0); ok('40-0', t.callFor(0) === '40-0');
ok('four points wins a game', t.award(0) === 'game');
const d = new TennisScore(2);
for (let i = 0; i < 3; i++) { d.award(0); d.award(1); }
ok('3-3 is deuce', d.callFor(0) === 'DEUCE');
d.award(0); ok('advantage in', d.callFor(0) === 'AD IN');
ok('advantage out for the other side', d.callFor(1) === 'AD OUT');
d.award(1); ok('back to deuce', d.callFor(0) === 'DEUCE');
d.award(1); d.award(1); ok('two clear points takes it', d.games[1] === 1);
const m = new TennisScore(1);
let last: string | undefined;
for (let i = 0; i < 4; i++) { last = m.award(0); }
ok('reaching gamesToWin is match', last === 'match');

// volleyball scoring
const v = new VolleyScore(3, 5);
v.award(0); v.award(0); ok('rally scoring counts up', v.points[0] === 2);
ok('needs win-by-two at target', v.award(0) === 'set');
const vd = new VolleyScore(3, 5);
for (let i = 0; i < 3; i++) { vd.award(0); vd.award(1); }
ok('3-3 does not end at target', vd.points[0] === 3 && vd.points[1] === 3);
vd.award(0); ok('4-3 still not a set (margin 1)', vd.points[0] === 4);
const vc = new VolleyScore(3, 5);
for (let i = 0; i < 4; i++) { vc.award(0); vc.award(1); }
ok('cap ends a runaway deuce', vc.award(0) === 'set');

// touches
const rs = new RallyState(VOLLEYBALL);
rs.serve(0);
ok('three touches allowed', rs.touch() === 'ok' && rs.touch() === 'ok' && rs.touch() === 'ok');
ok('fourth touch is a fault', rs.touch() === 'fault');
rs.cross(); ok('crossing flips side and resets touches', rs.side === 1 && rs.touches === 0);
const rt = new RallyState(TENNIS);
rt.serve(0);
ok('tennis allows one touch', rt.touch() === 'ok');
ok('tennis second touch faults', rt.touch() === 'fault');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
