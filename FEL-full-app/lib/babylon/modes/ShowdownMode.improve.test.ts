// SHOWDOWN — the owner-picked improvement pass (IMPROVE 2026-10-06). The pure rules the mode now leans on (showdownRules)
// are tested on their own; the mode file mounts Babylon, so its wiring is held by source pins, in this repo's usual way
// (reachFreeze.static, bodyFight.gate, KarateVSMode.improve).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHOWDOWN, attackerChakraGain, ultimateReaches, ultLungeStep, burnVerdict, roundCall, launchReachesGate, UltimateArm,
} from './showdownRules';
import { arenasFor, showdownGateDist, SHOWDOWN_GATE } from '../combat/arenas';
import { lockOnYaw } from '../core/Biomech';
import { COMBAT_TURN_RATE } from '../core/CombatPosture';

const SRC = readFileSync(join(__dirname, 'ShowdownMode.ts'), 'utf8');
/** The source without its comments — a pin must hold the code, not a note about it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** The body of a function / method named `head` (to the next line that closes at its indent). */
function fnBody(head: string): string {
  const i = CODE.indexOf(head);
  expect(i, `${head} not found — re-point this pin, do not drop it`).toBeGreaterThanOrEqual(0);
  const indent = /^\s*/.exec(CODE.slice(CODE.lastIndexOf('\n', i) + 1))![0];
  const end = CODE.indexOf(`\n${indent}}`, i);
  return CODE.slice(i, end);
}
const DT = 1 / 60;

describe('#1 clean hits land (delivered by the combat stack)', () => {
  it('an out-of-reach swing is the whiff; an undefended one in reach is a hit', () => {
    expect(CODE).toContain("if (dist > atk.range) return 'outOfRange';");
  });
});

describe('#2 the lock-on turns', () => {
  it('both fighters slew at the combat turn rate, and a downed body is left alone', () => {
    const b = fnBody('function faceEachOther(');
    expect(b).toContain('lockOnYaw(p, r, player.root.rotation.y, COMBAT_TURN_RATE, dt)');
    expect(b).toContain('lockOnYaw(r, p, rival.root.rotation.y, COMBAT_TURN_RATE, dt)');
    expect(b).toContain('if (!isDown(meState))');
    expect(b).toContain('if (!isDown(foeState))');
    expect(CODE).not.toMatch(/rotation\.y = Math\.atan2\(/);
  });
  it('a substitution behind you is a turn of about a third of a second, not a one-frame snap', () => {
    let yaw = 0;   // facing +z; the foe is now straight behind
    let frames = 0;
    while (Math.abs(Math.abs(yaw) - Math.PI) > 1e-3 && frames < 120) { yaw = lockOnYaw({ x: 0, z: 0 }, { x: 0.001, z: -1 }, yaw, COMBAT_TURN_RATE, DT); frames++; }
    expect(frames).toBeGreaterThan(12);
    expect(frames).toBeLessThan(30);
  });
});

describe('#3 the parry and the guard impact animate', () => {
  it('the defender\'s flash is SET when its defence lands, and reaches the tree', () => {
    expect(CODE).toContain('beatParry(!mine);');
    expect(CODE).toContain('beatGuardImpact(!mine);');
    expect(fnBody('function beatParry(')).toContain('parryFlash = SHOWDOWN.parrySec');
    expect(fnBody('function beatGuardImpact(')).toContain('giFlash = SHOWDOWN.impactSec');
    const a = fnBody('function animate(');
    expect(a).toContain('parryFlash: parryFlash > 0, guardImpactFlash: giFlash > 0');
    expect(a).toContain('parryFlash: foeParryFlash > 0, guardImpactFlash: foeGiFlash > 0');
  });
});

describe('#4 chakra pays only for a blow that lands', () => {
  it('a hit and a guard break pay; a whiff, a block, a parry and a guard impact do not', () => {
    expect(attackerChakraGain('hit')).toBe('hitLanded');
    expect(attackerChakraGain('guardBreak')).toBe('hitLanded');
    for (const o of ['whiff', 'blocked', 'parried', 'guardImpacted', 'substituted']) expect(attackerChakraGain(o), o).toBeNull();
  });
  it('the mode no longer gains before the outcome is known', () => {
    expect(CODE).not.toContain("meter.gain('hitLanded')");
    const b = fnBody('function resolveActiveStrike(');
    expect(b.indexOf('const gain = attackerChakraGain(outcome)')).toBeGreaterThan(b.indexOf('applyDefenseOutcome('));
  });
});

describe('#5 the fire pits end a round', () => {
  it('the verdict: nobody while both stand; a burn-out loses; a double burn-out goes to the player', () => {
    expect(burnVerdict(10, 10)).toBeNull();
    expect(burnVerdict(0, 10)).toBe(false);
    expect(burnVerdict(10, 0)).toBe(true);
    expect(burnVerdict(0, 0)).toBe(true);
  });
  it('the tick ends the round, is felt, and runs only while the fight is on', () => {
    expect(fnBody('function burnTick(')).toContain("endRound(ctx, v, 'BURNED')");
    expect(fnBody('function burn(')).toContain('EffectsKit.burst(');
    expect(CODE).toContain("if (arena.hazards.length && phase === 'fighting') burnTick(ctx, dt);");
  });
});

describe('#6 / #7 the ultimate launches, and the gate can break', () => {
  it('the launch is a knock slide away from the attacker, at the old 12 m/s, not an unintegrated −Z velocity', () => {
    expect(CODE).not.toContain('foeMove.vel.copyFrom(');
    expect(fnBody('function resolveUltimate(')).toContain('knockSlide(ctx, defC, atkC.root.position, SHOWDOWN.ultLaunchM, ropeClamp(ctx, defC, mine), SHOWDOWN.ultLaunchMps)');
    expect(SHOWDOWN.ultLaunchMps).toBe(12);
  });
  it('in every Showdown arena, an ultimate on a rival driven halfway north carries him into the gate; one thrown across the arena does not', () => {
    for (const a of arenasFor('showdown')) {
      const gateZ = -showdownGateDist(a);
      const rival = { x: 0, z: gateZ / 2 }, me = { x: 0, z: rival.z + SHOWDOWN.ultStandoffM };
      expect(launchReachesGate(me, rival, gateZ, SHOWDOWN_GATE.breakM), a.id).toBe(true);
      const across = { x: 0, z: 0 }, fromSide = { x: -SHOWDOWN.ultStandoffM, z: 0 };
      expect(launchReachesGate(fromSide, across, gateZ, SHOWDOWN_GATE.breakM), a.id).toBe(false);
      // control: from the centre, launched straight north, it falls short of the gate in every arena (it is a position you
      // have to drive him to)
      expect(launchReachesGate({ x: 0, z: SHOWDOWN.ultStandoffM }, { x: 0, z: 0 }, gateZ, SHOWDOWN_GATE.breakM), a.id).toBe(false);
    }
    expect(launchReachesGate({ x: 0, z: 0 }, { x: 0, z: 0 }, -5)).toBe(false);   // no line, no launch
    // the edge: a launch that ends inside the gate's break distance breaks it (the body hits the gate, not its far face)
    const g = -6, inside = g + SHOWDOWN_GATE.breakM - 0.05, short = g + SHOWDOWN_GATE.breakM + 0.05;
    expect(launchReachesGate({ x: 0, z: inside + SHOWDOWN.ultLaunchM + 1 }, { x: 0, z: inside + SHOWDOWN.ultLaunchM }, g, SHOWDOWN_GATE.breakM)).toBe(true);
    expect(launchReachesGate({ x: 0, z: short + SHOWDOWN.ultLaunchM + 1 }, { x: 0, z: short + SHOWDOWN.ultLaunchM }, g, SHOWDOWN_GATE.breakM)).toBe(false);
  });
});

describe('#8 the ultimate never spends a full bar on a whiff', () => {
  it('the reach is the old resolve check (2.6 + 1.2 m), now read before the bar is spent', () => {
    expect(ultimateReaches(3.8)).toBe(true);
    expect(ultimateReaches(3.81)).toBe(false);
    expect(ultimateReaches(NaN)).toBe(false);
    const b = fnBody('function tryUltimate(');
    expect(b.indexOf('ultimateReaches(')).toBeGreaterThanOrEqual(0);
    expect(b.indexOf('ultimateReaches(')).toBeLessThan(b.indexOf('chakra.spendUltimate()'));
  });
  it('the cut closes the gap to the stand-off and never overshoots it', () => {
    let d = SHOWDOWN.ultReachM;
    for (let t = 0; t < SHOWDOWN.ultCutSec; t += DT) d -= ultLungeStep(d, DT);
    expect(d).toBeCloseTo(SHOWDOWN.ultStandoffM, 6);
    expect(ultLungeStep(1, DT)).toBe(0);
    expect(ultLungeStep(5, 0)).toBe(0);
    expect(ultLungeStep(SHOWDOWN.ultStandoffM + 0.01, 1)).toBeCloseTo(0.01, 9);
  });
});

describe('#9 the ultimate goes through the animation tree', () => {
  it('no per-frame animator.play of the clip; `ulting` is fed for the fighter in the cut', () => {
    expect(CODE).not.toContain("animator.play('karate_counter_throw'");
    const a = fnBody('function animate(');
    expect(a).toContain("ulting: ult && ultBy === 'me'");
    expect(a).toContain("ulting: ult && ultBy === 'foe'");
    expect(CODE).not.toContain('ulting: false');
  });
});

describe('#10 the rival has an ultimate', () => {
  it('its bar rides ONE swing: taken once as that swing resolves; another swing never carries it', () => {
    const arm = new UltimateArm();
    const heavy = {}, jab = {};
    arm.arm(heavy);
    expect(arm.take(jab)).toBe(false);   // a different swing resolving disarms
    arm.arm(heavy);
    expect(arm.take(heavy)).toBe(true);
    expect(arm.take(heavy)).toBe(false);   // once
    arm.arm(heavy); arm.sync(heavy); expect(arm.armed).toBe(true);
    arm.sync(null); expect(arm.armed).toBe(false);   // the swing ended unresolved
    arm.arm(heavy); arm.clear(); expect(arm.take(heavy)).toBe(false);
  });
  it('the mode arms it on the heavy it threw, plays the cut only on a clean hit, and answers a defended one', () => {
    expect(CODE).toContain("if (decision.spend === 'ultimate' && thrown && foeStrike.current && foeChakra.spendUltimate())");
    expect(CODE).toContain('foeUlt.arm(foeStrike.current)');
    expect(CODE).toContain("if (ult) { startUltimate(ctx, 'foe'); break; }");
    expect(CODE).toContain('foeUlt.sync(foeStrike.current)');
    expect(CODE).not.toMatch(/decision\.spend === 'ultimate'\) foeChakra\.spendUltimate\(\)/);
  });
});

describe('#11 the rival substitution is seen and has its beat', () => {
  it('effect, banner, the punish window, and my swing in flight finding nobody', () => {
    expect(CODE).toContain('foeSubstituted = now() + SHOWDOWN.subWhiffMs');
    expect(CODE).toContain("banner(ctx, 'RIVAL SUBSTITUTED — BEHIND YOU!', 800)");
    expect(CODE).toContain('foeDef.spendSubstitution(now())');
    expect(CODE).toContain('if (now() < foeSubstituted) { meStrike.current?.consumeHit();');
  });
});

describe('#12 a hit-react timer per fighter', () => {
  it('two timers, no shared one', () => {
    expect(CODE).not.toContain('hitFlashT');
    expect(CODE).toContain('meHitT = Math.max(0, meHitT - dt); if (meHitT === 0) meHitBy = null;');
    expect(CODE).toContain('foeHitT = Math.max(0, foeHitT - dt); if (foeHitT === 0) foeHitBy = null;');
  });
});

describe('#13 the round number and the FIGHT beat', () => {
  it('the round call', () => {
    expect(roundCall(1)).toBe('BEST OF 3 — ROUND 1');
    expect(roundCall(2)).toBe('ROUND 2');
    expect(roundCall(3)).toBe('FINAL ROUND');
  });
  it('a KO pause and a ready beat on the game clock; the next round is not started under the KO banner', () => {
    expect(CODE).toContain("if (phase === 'ready' && phaseSec >= SHOWDOWN.readySec) fight(ctx);");
    expect(CODE).toContain("else if (phase === 'roundOver' && phaseSec >= SHOWDOWN.roundOverSec) { startRound(ctx); return; }");
    expect(fnBody('function endRound(')).toContain("if (phase === 'matchOver' || phase === 'roundOver') return;");
    expect(fnBody('function startRound(')).toContain('roundCall(round)');
    expect(fnBody('function fight(')).toContain("'FIGHT!'");
    expect(CODE).not.toContain('setTimeout(');   // every beat, banner and the assist's hit wait on the game clock
  });
});

describe('#14 L1 is the chakra charge', () => {
  it('no paid copy of the free dash; the hint says what L1 does', () => {
    expect(CODE).not.toContain('chakra.spend(DASH_CHI_COST)');
    expect(CODE).toContain("if (e.pressed && e.btn === 'L1' && !chakra.full)");
    expect(CODE).toContain('chakra.value = Math.min(CHAKRA.max, chakra.value + SHOWDOWN.chargePerSec * dt)');
    expect(CODE).toMatch(/const meOpen = [^;]*\|\| charging;/);   // the rival reads it as an opening
    const hint = /export const SHOWDOWN_HINT = '([^']+)'/.exec(SRC)?.[1] ?? '';
    expect(hint).toContain('hold L1 charge chakra');
    expect(hint).not.toMatch(/dash-cancel/i);
    expect(CODE).toContain('hint: SHOWDOWN_HINT');
  });
});

describe('#15 the assist is one body', () => {
  it('spawned in load, shown on a call, hidden after — never a GLB per call', () => {
    expect(fnBody('function callAssist(')).not.toContain('CharacterLibrary.spawn');
    expect(fnBody('function callAssist(')).toContain('s.root.setEnabled(true)');
    expect(fnBody('function hideAssist(')).toContain('support.root.setEnabled(false)');
    expect(fnBody('async load(')).toContain("modeId: 'showdown-support'");
  });
});

describe('#16 / #17 / #18 the per-frame costs', () => {
  it('the HUD is pushed on change only, and momentum is not sent', () => {
    expect(fnBody('function hudPut(')).toContain('if (hudSent[k] !== v)');
    expect(CODE).not.toMatch(/momentum: Math\.round/);
  });
  it('no Vector3 built in the frame path', () => {
    for (const f of ['function faceEachOther(', 'function feedBio(', 'function animate(']) {
      const b = fnBody(f);
      expect(b, f).not.toMatch(/\.(subtract|scale|add|normalize)\(/);
    }
    expect(CODE).toContain('return wishV.set(');
    expect(CODE).not.toContain('const feedBio = (');
  });
  it('the nerve is set once per round, not read per frame (delivered by the combat stack)', () => {
    expect(CODE).not.toMatch(/\bnerve\(/);
    expect(fnBody('function roundStartRival(')).toContain('rivalBrain.setStanding(');
  });
});

describe('#19 / #20 nothing left behind', () => {
  it('the knock slides, timers and banner clear on dispose; the gate goes with its material', () => {
    const d = fnBody('dispose() {');
    expect(d).toContain('timers.clear(); knock.clear();');
    expect(d).toContain('wallMesh?.dispose(false, true)');
    expect(fnBody('function shatterGate(')).toContain('w.dispose(false, true)');
    expect(CODE).not.toContain('onBeforeRenderObservable');
  });
});
