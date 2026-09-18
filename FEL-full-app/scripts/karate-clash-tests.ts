/**
 * scripts/karate-clash-tests.ts
 * =============================
 * M-handoff Phase 5 — headless invariants for the shared Karate VS feel cores:
 *   - lib/feel/clash-qte.ts   (trade -> quick-time clash resolver)
 *   - lib/feel/camera-kick.ts (impact camera swing spring)
 * Pure TS, no THREE/DOM — imports the SAME modules the live karate-versus mode
 * uses, so a green run proves the clash + camera-swing numbers match intent and
 * can never silently fork from the game.
 *
 * Run standalone:  yarn tsx scripts/karate-clash-tests.ts
 * (also registered in scripts/standing-suite.ts)
 */

import {
  createClashQTE,
  startClash,
  registerMash,
  updateClashQTE,
  clashActive,
  clashProgress,
  clashTimeLeft01,
  CLASH,
} from '../lib/feel/clash-qte';
import {
  createCameraKick,
  triggerKick,
  updateCameraKick,
  kickEnergy,
  KICK,
} from '../lib/feel/camera-kick';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.log(`  \u2717 ${name}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

console.log('Karate clash + camera-kick feel invariants (Phase 5):');

// ---- CLASH QTE -----------------------------------------------------------
// 1) Fresh clash is inactive; starting it activates and sets a mash target.
const c1 = createClashQTE();
check('fresh clash is inactive', clashActive(c1) === false);
startClash(c1, 0.5);
check('startClash activates the clash', clashActive(c1) === true);
check('need scales above the base at mid power', c1.need > CLASH.BASE_NEED, `need ${c1.need}`);
check('need is clamped to MAX_NEED', c1.need <= CLASH.MAX_NEED);

// 2) A tougher opponent demands more taps than a weaker one.
const cWeak = createClashQTE(); startClash(cWeak, 0);
const cHard = createClashQTE(); startClash(cHard, 1);
check('stronger opponent needs more mashes', cHard.need > cWeak.need, `weak ${cWeak.need} hard ${cHard.need}`);
check('weakest opponent uses the base need', cWeak.need === CLASH.BASE_NEED, `got ${cWeak.need}`);

// 3) Enough mashes inside the window = early win, clash ends immediately.
const c3 = createClashQTE(); startClash(c3, 0);
for (let i = 0; i < c3.need; i++) registerMash(c3);
check('reaching the mash target wins early', c3.resolved === true && c3.playerWon === true);
check('winning ends the clash', clashActive(c3) === false);
check('progress is full on a win', clashProgress(c3) >= 1);

// 4) Too few mashes when the window expires = loss.
const c4 = createClashQTE(); startClash(c4, 1);
registerMash(c4); // only one tap
const ev4 = updateClashQTE(c4, CLASH.WINDOW + 0.01);
check('window expiry with too few taps loses', ev4 === 'lose' && c4.playerWon === false);
check('a resolved clash is no longer active', clashActive(c4) === false);

// 5) The clash does not resolve before the window elapses.
const c5 = createClashQTE(); startClash(c5, 0.5);
const ev5 = updateClashQTE(c5, CLASH.WINDOW * 0.4);
check('mid-window returns none', ev5 === 'none' && clashActive(c5) === true);
check('time-left bar shrinks toward 0', clashTimeLeft01(c5) < 1 && clashTimeLeft01(c5) > 0);

// 6) Mashes after resolution are ignored (no double-counting).
const c6 = createClashQTE(); startClash(c6, 0);
for (let i = 0; i < c6.need; i++) registerMash(c6);
const m6 = c6.mashes;
registerMash(c6);
check('mashes ignored after the clash resolves', c6.mashes === m6, `got ${c6.mashes}`);

// ---- CAMERA KICK ---------------------------------------------------------
// 7) A fresh kick is at rest and updating it is a no-op.
const k1 = createCameraKick();
check('fresh camera kick is at rest', kickEnergy(k1) === 0);
updateCameraKick(k1, 0.016);
check('updating a resting kick stays at rest', kickEnergy(k1) === 0);

// 8) An impulse injects energy and moves the lens.
const k2 = createCameraKick();
triggerKick(k2, 1, 1);
check('an impulse injects energy', kickEnergy(k2) > 0);
check('positive hit direction rolls the camera negative', k2.vR < 0, `vR ${k2.vR}`);

// 9) The spring is stable — energy strictly decays and settles to rest.
const k3 = createCameraKick();
triggerKick(k3, -1, 1);
let prevE = kickEnergy(k3);
let everGrew = false;
for (let i = 0; i < 80; i++) {
  updateCameraKick(k3, 0.033);
  const e = kickEnergy(k3);
  if (e > prevE + 1e-6) everGrew = true;
  prevE = e;
}
check('kick energy never grows (stable spring)', everGrew === false);
check('kick settles back to rest', kickEnergy(k3) === 0, `energy ${kickEnergy(k3)}`);

// 10) A bigger magnitude kicks harder than a small one.
const kSmall = createCameraKick(); triggerKick(kSmall, 1, 0.3);
const kBig = createCameraKick(); triggerKick(kBig, 1, 1);
check('bigger magnitude produces a bigger jolt', kickEnergy(kBig) > kickEnergy(kSmall));

if (failures > 0) {
  console.error(`\nKarate clash + camera-kick invariants FAILED: ${failures} check(s).`);
  process.exit(1);
}
console.log('\nAll karate clash + camera-kick feel invariants passed.');
