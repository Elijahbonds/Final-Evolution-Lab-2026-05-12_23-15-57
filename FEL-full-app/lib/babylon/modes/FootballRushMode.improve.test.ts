// IMPROVE (2026-10-06): Football Rush's owner-picked items that live in the mode's wiring (the rules are tested in
// footballRushRules.test.ts; CoinField.clear in core/Pickups.clear.test.ts). The mode needs a scene, bodies and the
// harness to run, so these pin the wiring in the source — each one names the regression it stops coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, 'FootballRushMode.ts'), 'utf-8');
const HOST = readFileSync(resolve(__dirname, '../../../components/games/football-babylon.tsx'), 'utf-8');
const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const body = (name: string): string => { const i = code.indexOf(`function ${name}(`); return code.slice(i, code.indexOf('\n  }\n', i)); };

describe('FootballRushMode wiring (IMPROVE 2026-10-06)', () => {
  it('#1 the touchdown pays this drive\'s evades, and the drive card counts them', () => {
    expect(code).toContain('const tdEvades = evades - evadesAtDrive;');
    expect(code).toContain('score += Math.round((100 + tdEvades * 10) * mult);');
    expect(code).not.toContain('(100 + evades * 10)');
    expect(body('newDrive')).toContain('evadesAtDrive = evades;');
    expect(body('logDrive')).toContain('${evades - evadesAtDrive} EVADES');
  });
  it('#2 the kick lands at a rolled spot, the returner moves under it and the catch reads his distance', () => {
    expect(body('startKick')).toContain('kickLand = kickLanding();');
    expect(body('tickKick')).toContain('positionedCatch(kick.pressed ?? \'late\', reach)');
    expect(code).toContain('run = kickMoveStep(run, stickX, stickY, dt);');
    expect(code).toContain('pursuit?.set(kickLand.x, kickLand.z)');
  });
  it('#3 the snap reads the tier ramped for the drive', () => {
    expect(body('snap')).toContain('const front = rampTier(tier, drive);');
    expect(body('snap')).toContain('blunders(front)');
    expect(body('snap')).toContain('front.reactionMs + jitter + bust');
  });
  it('#4 #5 no real-time timer anywhere: one banner channel and the timers on the mode clock', () => {
    expect(code).not.toMatch(/setTimeout\(/);
    expect(code).toContain('bannerUntil = clock + ms / 1000');
    expect(code).toMatch(/clock \+= dt;[^\n]*\n\s*timers\.tick\(clock\);/);
    expect(code).toContain('tickBanner(ctx);');
    expect(body('snap')).toMatch(/timers\.later\(clock, delay \/ 1000, \(\) => \{ if \(!ended\) m\.startPursuit\(\); \}, 'pursuit'\)/);
    for (const fn of ['spawnDefense', 'tackledBy']) expect(body(fn)).toContain("timers.clear('pursuit');");
    expect(body('newDrive')).toContain('timers.clear();');
  });
  it('#6 #19 one CoinField for the session, re-laid on the lanes each drive', () => {
    expect(body('layCoins')).toContain('if (!coins) coins = new CoinField(ctx.scene);');
    expect(body('layCoins')).toContain('coins.clear();');
    expect(body('layCoins')).toContain('coinLayout(drive)');
    expect(body('layCoins')).not.toContain('coins?.dispose()');
  });
  it('#7 #10 #11 the truck fill, the prompts and the par reach the HUD, and the host draws them', () => {
    for (const k of ['truckCool', 'prompts', 'par']) { expect(code).toContain(`${k}:`); expect(HOST).toContain(`hud.${k}`); }
    expect(HOST).toContain('medalSuffix(r.stats)');
  });
  it('#8 a live ball takes the ring', () => {
    expect(code).toContain('if (pursuit && fumble) { pursuit.show(true); pursuit.set(fumble.ball.position.x, fumble.ball.position.z); }');
  });
  it('#9 the hurdle hops on the turf', () => {
    expect(code).toContain("if (e.btn === 'A' && !preSnap && lane === 'turf' && !vault) { hopT = 0; hopSec = MOVE_SEC; }");
    expect(code).toContain('runner.root.position.y = hopY(hopT, hopSec);');
  });
  it('#11 the session ends with a medal and a best, and the card stars the longest drive', () => {
    expect(code.match(/ctx\.end\([^)]*endStats\(\)\)/g)).toHaveLength(3);
    expect(body('endStats')).toContain('medal');
    expect(body('endStats')).toContain('saveFootballBestIfHigher(score)');
    expect(code).toContain('board: driveLog.length ? boardRows() : null');
  });
  it('#12 the frame HUD goes out only on change, the fills at FB_HUD_HZ', () => {
    expect(code).toContain('const changed = hudChanges(hudSent, {');
    expect(code).toContain('if (changed) ctx.setHud(changed);');
    expect(code).not.toContain("ctx.setHud({ breakaway: false })");
    expect(code).not.toMatch(/ticks\.map\([^)]*\)\.join\(','\) \}\);/);   // no per-frame join in a setHud
  });
  it('#13 the velocity slots are re-used and pruned with the defense', () => {
    expect(code).not.toMatch(/defPrev|defVel/);
    expect(body('spawnDefense')).toContain('defTrack.clear();');
    expect(code).toContain('p.subtractToRef(tr.prev, tr.vel)');
  });
  it('#14 #15 #18 the frame\'s reads are built once', () => {
    expect(code).not.toMatch(/standingGunners\(\)|downedGunners\(\)|me2\(\)|vel2\(\)/);
    expect(code).toContain('const conv = countConverging(convBuf, convRunner, CONVERGE_RADIUS_YD * YARD);');
    expect(code).not.toMatch(/countConverging\(\s*defenders\.map/);
    expect(body('threat')).not.toContain('Vector3.Distance');
    expect(body('lineAhead')).not.toContain('new Vector3');
  });
  it('#16 one loose ball and one ball material', () => {
    expect(body('stripBall')).toContain('if (!fumbleBall)');
    expect(code).not.toContain('fumble.ball.dispose()');
    expect(code).toContain('ballMat?.dispose()');
  });
  it('#17 the lane props draw as one merged, frozen mesh per material', () => {
    expect(body('buildLanes')).toContain('Mesh.MergeMeshes(list, true, true, target)');
    expect(body('buildLanes')).toContain('merged.freezeWorldMatrix();');
  });
  it('#20 the runner, the front and the blockers spawn together', () => {
    expect(code).toMatch(/await Promise\.all\(\[\s*CharacterLibrary\.spawn\([^\n]*\n\s*buildDefenderBodies\(ctx\),[^\n]*\n\s*spawnBlocker\(1\), spawnBlocker\(-1\),/);
    expect(code).not.toMatch(/for \(const side of \[1, -1\] as const\) \{\s*const char = await/);
  });
});
