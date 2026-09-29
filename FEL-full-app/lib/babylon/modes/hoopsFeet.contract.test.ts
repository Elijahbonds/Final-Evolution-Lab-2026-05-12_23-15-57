// HOOPS MOTION phase 3b — "Feet", the modes' side of it (plan §3). The modes are one closure over a scene each, so their contract is
// read off the source (LooseBall.test.ts's pattern): every AI body moves through an AiMover (its brain's wish at the hero's accel 26 /
// decel 34, the sprint honoured — never a unit intent scaled straight to a velocity), every body carries the plant-and-cut pin
// (FootPlant — 3v3 had none), FootPlanting is on every spawn, the scripted 3v3 drive gives the tree the speed it covers, and a mate's
// shot is not the hero's.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (rel: string) => readFileSync(path.join(__dirname, rel), 'utf8');
const one = read('OneVOneMode.ts'), three = read('ThreeVThreeMode.ts'), lib = read('../core/CharacterLibrary.ts');
const fnBody = (src: string, head: string): string => {
  const at = src.indexOf(head); expect(at, head).toBeGreaterThan(0);
  let depth = 0, i = src.indexOf('{', at);
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1); }
  return src.slice(i);
};

describe('the AI bodies move with the hero\'s weight (AiMover)', () => {
  it('1v1: the rival\'s slide, his drive and his crash all go through his mover; no intent is scaled to a velocity in one frame', () => {
    expect(one).toMatch(/const foeMover = new AiMover\(3\.6\)/);
    expect(one).not.toMatch(/new Vector3\(foeIntent\.moveX, 0, -foeIntent\.moveY\)\.scale\(/);
    expect(one).toMatch(/foeMover\.stepIntent\(dt, foeStunSec > 0 \? \{ moveX: 0, moveY: 0 \} : foeIntent\)/);
    expect(one).toMatch(/foeMover\.track\(dt, dec\.wish\)/);
    expect(one).toMatch(/const foeCrashSt = foeMover\.track\(dt, wish\)/);
    expect(one).not.toMatch(/driveBody\('foe', foe\.root, dec\.wish, dt\)/);
    // a check or a reset stands him still (the mover is not carried through a teleport)
    expect((one.match(/foeMover\.stop\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('3v3: every AI body owns a mover (mates 4.2, defenders 3.8), and the mates\' and defenders\' velocities are its output', () => {
    expect(three).toMatch(/mover: ai \? new AiMover\(aiKind === 'teammate' \? MATE_RUN_MPS : FOE_RUN_MPS\) : null/);
    expect(three).toMatch(/const MATE_RUN_MPS = 4\.2, FOE_RUN_MPS = 3\.8/);
    expect(three).not.toMatch(/new Vector3\(intent\.moveX, 0, -intent\.moveY\)\.scale\(/);
    expect(three).toMatch(/const mst = mv\.stepIntent\(dt, intent\)/);
    expect(three).toMatch(/const fst = f\.mover!\.stepIntent\(dt, intent\)/);
    expect(fnBody(three, 'function resetPossession(')).toMatch(/b\.mover\?\.stop\(\)/);
    // each observes where its body really is before it steps (the contacts and the clamps move a root too)
    expect(three).toMatch(/mv\.observe\(body\.char\.root\.position, dt\);[^\n]*\n\s*const mst = mv\.stepIntent/);
    expect(three).toMatch(/f\.mover!\.observe\(f\.char\.root\.position, dt\);\s*const fst = /);
    // the 1v1 rival is a physics body (it moves in the physics step inside render): observed once per frame id (3b review — under
    // ?qaSpeed=N the sub-updates read no travel and drove him at 0.43 m/s), at all three sites
    expect(fnBody(one, 'function observeFoe(')).toMatch(/foeMover\.observe\(foe\.root\.position, dt, contact\?\.isReady \? ctx\.scene\.getFrameId\(\) : undefined\)/);
    expect((one.match(/observeFoe\(ctx, dt\)/g) ?? []).length).toBe(3);
    expect((one.match(/foeMover\.observe\(/g) ?? []).length).toBe(1);
    // the scripted 3v3 driver's speed is read once per frame id too (the drive moves him in the before-render pass)
    expect(three).toMatch(/!\(driverPrevFor === driver && driverEstFrame === ctx\.scene\.getFrameId\(\)\)/);
  });
  it('3v3: the scripted drive ramps from his stand and its bend follows at a limited rate; his tree is fed the speed he covers', () => {
    const drive = fnBody(three, 'async function opponentPossession(');
    expect(drive).toMatch(/const u = driveFraction\(k \* driveSec, driveSec, driveLen, undefined, v0Along\)/);
    // (3b review) from the speed he has: his velocity along the drive seeds the profile (the clock lengthened for a reversal), across it the bend
    expect(drive).toMatch(/const v0Along = shooter\.mover \? shooter\.mover\.vel\.x \* driveDir\.x \+ shooter\.mover\.vel\.z \* driveDir\.z : 0;/);
    expect(drive).toMatch(/driveSec = driveSecFor\(driveLen, driveSec, v0Along\);/);
    expect(drive).toMatch(/bendFollow\.reset\(0, v0Across\)/);
    expect(drive).toMatch(/const baseX = from\.x \+ \(driveEnd\.x - from\.x\) \* u;/);
    expect(drive).toMatch(/bendFollow\.step\(driveLateral\(/);
    expect(drive).toMatch(/driveT \+= fdt;\s+const k = Math\.min\(1, driveT \/ driveSec\);/);   // the frame's clock, not a performance.now() read
    expect(three).toMatch(/if \(!foeDunkFlight\) f\.tree\.update\(\{ speedMps: driveMpsNow,/);
    expect(three).not.toMatch(/f\.tree\.update\(\{ speedMps: Math\.hypot\(f\.vel\.x, f\.vel\.z\), speed01: f\.speed01, crossover: false, nearestDefender: Infinity, hasBall: driverHasBall\(\)/);
  });
});

describe('every body plants (FootPlanting at the spawn, FootPlant on the cut)', () => {
  it('CharacterLibrary mounts FootPlanting on every spawned skinned body', () => {
    expect(lib).toMatch(/mountFootPlanting\(scene, skinned, skeleton, \{ root, intensity: tier === 'mobile' \? 0\.6 : 1 \}\)/);
  });
  it('1v1: both bodies carry FootPlant; the rival\'s mover\'s plant pins his foot', () => {
    expect(one).toMatch(/meFootPlant = new FootPlant\(me\.skeleton/);
    expect(one).toMatch(/foeFootPlant = new FootPlant\(foe\.skeleton/);
    expect(fnBody(one, 'function plantFoe(')).toMatch(/if \(planting && !foeWasPlanting\) foeFootPlant\?\.plant\(\)/);
    expect((one.match(/plantFoe\(foeMove(O)?\.planting, dt\)/g) ?? []).length).toBe(2);
    // (3b review) every branch runs his pin's window down or lets it go: the crash plants through its own mover, the play's end releases
    expect(one).toMatch(/plantFoe\(foeCrashSt\.planting, dt\)/);
    expect(one).toMatch(/\} else if \(defPhase === 'over'\) unplantFoe\(\);/);
    expect(fnBody(one, 'function unplantFoe(')).toMatch(/foeFootPlant\?\.release\(\); foeWasPlanting = false;/);
  });
  it('3v3: all six bodies carry FootPlant (the hero off his dribble\'s plant, the AI off their movers\')', () => {
    expect(three).toMatch(/plant: char\.meshes\[0\] \? new FootPlant\(char\.skeleton/);
    expect(three).toMatch(/plantBody\(me, drib\.planting/);
    expect(three).toMatch(/plantBody\(body, mst\.planting, dt\)/);
    expect(three).toMatch(/plantBody\(f, fst\.planting, dt\)/);
    // (3b review) the branches that skip the mover release the pin: the stun (and knockdown) and the scripted drive
    expect(fnBody(three, 'function unplant(')).toMatch(/b\.plant\?\.release\(\); b\.wasPlanting = false;/);
    expect(three).toMatch(/if \(f\.stunSec > 0\) \{[^\n]*f\.mover\?\.stop\(\); unplant\(f\);[^\n]*continue; \}/);
    expect(three).toMatch(/if \(f === driver\) \{\s+unplant\(f\);/);
    // every `continue` in the defenders' loop comes after a plant update or a release
    const cbAt = three.indexOf('        const cb = carrierBody();'), loop = three.slice(three.lastIndexOf('for (let fi = 0; fi < foes.length; fi++) {', cbAt), cbAt);
    const conts = loop.split('continue;').slice(0, -1);
    expect(conts.length).toBeGreaterThanOrEqual(2);
    for (const c of conts) expect(/unplant\(f\)|plantBody\(f,/.test(c.slice(c.lastIndexOf('if ('))) || /unplant\(f\)/.test(c)).toBe(true);
  });
  it('1v1: the hero\'s tree is ball-less while the made ball is still in the net (make-it-take-it sets `carrying` first)', () => {
    expect(one).toMatch(/hasBall: carrying && !loose, shooting, dunking,/);
  });
});

describe('the 3v3 hero after a mate\'s shot (V:3v3 C6)', () => {
  it('a mate\'s shot raises its own flag, never the hero\'s `shooting` (which nothing cleared when their ball followed his make)', () => {
    const shot = fnBody(three, 'async function teammateShoots(');
    expect(shot).not.toMatch(/\bshooting = true/);
    expect(shot).toMatch(/if \(shooting \|\| mateShooting\) return;\s+mateShooting = true;/);
    expect(fnBody(three, 'async function opponentPossession(')).toMatch(/mateShooting = false;/);
    expect(fnBody(three, 'function resetPossession(')).toMatch(/shooting = false; mateShooting = false;/);
    // the guards that read "a shot is up on my team" still see his
    expect(three).toMatch(/carrier && carrierId !== 'foeTeam' && !shooting && !mateShooting/);
    expect(three).toMatch(/!shooting && !mateShooting && !dunking && !passFlight\.active && !arc\.active/);
    // a released shot is nobody's ball: neither the hero's tree nor his mate's settles into a dribble under it
    expect(three).toMatch(/hasBall: iAmCarrier && !passFlight\.active && !\(ball\.metadata as \{ felReleased\?: boolean \} \| undefined\)\?\.felReleased,/);
    expect(three).toMatch(/hasBall: carrierId === mateId && !passFlight\.active && !\(ball\.metadata as \{ felReleased\?: boolean \} \| undefined\)\?\.felReleased,/);
  });
});
