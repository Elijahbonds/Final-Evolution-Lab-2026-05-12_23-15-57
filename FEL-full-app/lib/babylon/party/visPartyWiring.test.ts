// The party visual pass is WIRED (vis-party, 2026-10-13). The pure rules each have their own tests; what nothing else holds is that
// the four mode files still call them — a mode edited later that drops a hook would lose the pass with every other suite green.
// Source-level, in the repo's own style (scripts/party-quiz-w6-tests.ts, standardMaterialRatchet.test.ts). Also holds the TUNED
// numbers the pass must not have moved: the sweep camera's radius/height/speed (Who Scene It) and the wheel/seat geometry.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (rel: string): string => readFileSync(join(process.cwd(), 'lib/babylon', rel), 'utf8');
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('Dance is dressed and cut', () => {
  const s = src('modes/DanceMode.ts');
  it('mounts the stage once and takes it down with the room', () => {
    expect(count(s, 'mountDanceStage(')).toBe(1);
    expect(s).toMatch(/dressing\?\.dispose\(\); dressing = null;/);
  });
  it('feeds it the heard clock on the count-in AND the song frame, and idles it on the menu and results', () => {
    expect(count(s, 'dressing?.update(bp,')).toBe(2);
    expect(s).toContain("if (phase === 'pick' || ended) dressing?.idle(dt);");
  });
  it('fires the jets and confetti on a streak milestone, an instrument joining and an S grade', () => {
    for (const k of ['streak', 'join', 'gradeS']) expect(s).toContain(`dressing?.milestone('${k}')`);
  });
  it('the banner is the LED wall\'s: no longer pulsed as a lamp', () => {
    expect(s).not.toContain('...(v?.beatProps?.banners ?? [])');
  });
  it('the stage camera cuts on the bar through the pure beatCut module, and the ring is cleared AFTER the orbit', () => {
    expect(s).toContain('cutShotFor(cutBar, streak, stillCam)');
    expect(s).toContain('isCutFrame(lastCutBar, cutBar, streak, stillCam)');
    expect(s.indexOf('applyCut(shot,')).toBeLessThan(s.indexOf('clearOnlookersRing({ x: cf.x, z: cf.z })'));
    expect(count(s, ', false, bp.barIndex);')).toBe(2);
  });
  it('touches nothing that scores or judges (the pass added no import from the chart, the judge or the pay)', () => {
    for (const mod of ['dance/stageDressing', 'dance/ledWall', 'dance/clubCrowd', 'dance/stageFloor', 'dance/beatCut', 'party/movingHeads']) {
      const f = src(`${mod}.ts`);
      expect(f).not.toMatch(/from '\.\.\/core\/DanceCore'|from '\.\/chart'|from '\.\/chartPlay'|from '\.\.\/core\/danceTracks'|stoopWindows|floorPhase/);
    }
  });
});

describe('Who Scene It is dressed', () => {
  const s = src('modes/WhoSceneItMode.ts');
  it('keeps the TUNED sweep camera exactly (radius 8.5, height 5.5, speed 0.12) — the whip only adds a yaw offset', () => {
    expect(s).toContain('export const WHO_SCENE_SWEEP = { radius: 8.5, height: 5.5, speed: 0.12 };');
    expect(s).toContain('const yaw = sweepT + whipYaw(whipAge, calmMotion);');
  });
  it('lights the podiums through the buzz, the right answer, the wrong one and the lock-out', () => {
    expect(count(s, 'mountQuizPodiums(')).toBe(1);
    for (const st of ["setState(player, 'buzzed')", "setState(r.player, 'right')", "setState(by, 'wrong')", "setState(player, 'out')", "setState(i, 'armed')"]) expect(s).toContain(st);
  });
  it('throws confetti over the winner\'s podium, pushes the lens in on a right answer and blends each venue\'s own grade', () => {
    expect(s).toContain("EffectsKit.burst(ctx.scene, new Vector3(spot.at.x, 2.4, spot.at.z), 'confetti', 1.1)");
    expect(s).toContain('pushFov(revealAge, revealCorrect)');
    expect(s).toContain('questionGrade(restGrade,');
    expect(s).toContain('ctx.lights.flashBeat()');
  });
  it('the whip and the flare are off under reduced motion', () => {
    expect(s).toContain('!calmMotion) { whipAge = 0; ctx.lights.flashBeat(); }');
  });
});

describe('Brain Brawl is lit', () => {
  const s = src('modes/BrainBrawlMode.ts');
  const stage = src('party/BrainBrawlStage.ts');
  it('builds the stage with the tier and the shadow rig so the heads are tiered and kept out of the shadow maps', () => {
    expect(s).toContain('buildStage(ctx.scene, SEAT_COLOR, ctx.lights.tier, ctx.lights.shadows)');
    expect(stage).toContain('mountMovingHeads(scene, {');
    expect(stage).toContain('keepOutOfShadows(shadows, heads.root.getChildMeshes())');
  });
  it('the wheel\'s bulbs and the lectern state rings are named for the glow include list', () => {
    expect(stage).toContain('`bb_bulb_set_${s}`');
    expect(stage).toContain('`bb_lectern_neon_ring_${seat}`');
    expect(stage).toContain('bb_lectern_top_');   // the crown keeps the name the probes measure
  });
  it('the landing throws sparks in the category colour, off under reduced motion', () => {
    expect(s).toMatch(/if \(motionPolicy\(\)\.flash\) EffectsKit\.burst\(ctx\.scene, new Vector3\(WHEEL\.x, WHEEL\.y \+ WHEEL\.r \+ 0\.2, WHEEL\.z \+ 0\.4\), 'sparks', 1\.4, CATEGORY_COLOR\[cat\]\)/);
  });
});

describe('Tiebreak is dressed', () => {
  const s = src('modes/TiebreakMode.ts');
  it('plays with the Meshy ball, a trail that is off out of play, and a spark on contact', () => {
    expect(s).toContain("dressBall(ball, 'tennis')");
    expect(s).toContain('EffectsKit.ballTrail(ctx.scene, ball,');
    expect(s).toContain('trailFor(s.awaiting, goingOut(s))');
    expect(s).toContain('ball.setEnabled(s.awaiting)');
    expect(count(s, 'spark(ctx, hitFrom,')).toBe(2);
  });
  it('the hit-window ring is a named glow fixture', () => {
    expect(s).toContain("'tb_window_neon'");
  });
  it('the grade follows the scoreboard\'s call and the cup rises on a win only', () => {
    expect(s).toContain('tensionLevel(state.myPts, state.aiPts, state.warmup)');
    expect(s).toContain('if (won) raiseTrophy(ctx);');
  });
  it('the rally itself is untouched: the window, the flight and the AI are not imported from the new modules', () => {
    for (const f of ['modes/tiebreakFx.ts', 'party/trophy.ts']) expect(src(f)).not.toMatch(/commitSwing|tickBlitz|swingTiming|windowOpen|aiNets|incomingPoint|outgoingPoint/);
  });
});
