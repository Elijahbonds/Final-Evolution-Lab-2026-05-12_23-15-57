// dunk-next (docs/DUNK-NEXT.md) — DunkMode wiring scan. The rules are tested where they live (core/DunkBeats, core/DunkCard,
// core/RivalPlay); this pins that the mode actually plays them: the bar is heard and drawn, every trick press is graded, the card
// reads the beats, and the rival hits his beats on a clean attempt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const HOST = readFileSync(path.join(__dirname, '../../../components/games/dunk-babylon.tsx'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };

describe('phase 1 — the flight is a four-beat bar', () => {
  it('each beat crossed in the flight ticks (the slam keeps its own NOW!) and lights the strip', () => {
    expect(DUNK).toMatch(/for \(const b of beatsCrossed\(prevClip, clipTime\)\) \{\n\s*beatAt = BEAT_ORDER\.indexOf\(b\);\n\s*if \(b !== 'slam'\) SoundKit\.play\('uiTick', \{ pitch: BEAT_TICK_PITCH\[b\], volume: BEAT_TICK_VOLUME \}\);\n\s*pushBeats\(ctx\);/);
  });
  it('the strip is sent on change only, and cleared with the attempt', () => {
    expect(fn('pushBeats')).toMatch(/if \(s !== beatStripSent\) \{ beatStripSent = s; ctx\.setHud\(\{ beats: s \}\); \}/);
    expect(fn('resetForNextAttempt')).toMatch(/clearBeats\(ctx\)/);
    expect(fn('launchDunk')).toMatch(/beatAt = -1; beatMarks = \[\]; armedGrade = null; beatSlam = null; pushBeats\(ctx\);/);
  });
  it('every trick press is graded: an armed one keeps its grade for the beat it fires on, a fired one is graded on the press', () => {
    const air = fn('airButton');
    expect(air).toMatch(/armedAir = trick;\n\s*armedGrade = gradeTrickPress\(trick, clipTime, beatTol\(\)\);/);
    expect(air).toMatch(/armedAir = SPIN_720; armedGrade = gradeTrickPress\(SPIN_720, clipTime, beatTol\(\)\);/);
    expect(air).toMatch(/fireTrick\(ctx, trick, 'window', gradeTrickPress\(trick, clipTime, beatTol\(\)\)\)/);
    expect(air).toMatch(/upgradeTo720\(ctx, gradeTrickPress\(SPIN_720, clipTime, beatTol\(\)\)\)/);
    const fire = fn('fireTrick');
    expect(fire).toMatch(/const g = how === 'armed' \? armedGrade : grade;/);
    // the mark goes on only once the flight has taken the trick
    expect(fire.indexOf('beatMarks = [...beatMarks')).toBeGreaterThan(fire.indexOf('const got = flight.take(trick);'));
    expect(fire.indexOf('beatMarks = [...beatMarks')).toBeGreaterThan(fire.indexOf('if (!got) {'));
  });
  it('the tolerance widens with the TV factor, like the slam window', () => {
    expect(DUNK).toMatch(/const beatTol = \(\): number => BEAT_TOL_SEC \* tvFactor;/);
  });
  it('the slam is the fourth beat; a flight with no slam says so', () => {
    expect(fn('slamNow')).toMatch(/beatSlam = slamTiming\.zone; pushBeats\(ctx\);/);
    expect(fn('resolveDunk')).toMatch(/if \(!beatSlam\) \{ beatSlam = 'miss'; pushBeats\(ctx\); \}/);
  });
  it('the card reads the beats: execution for each on the beat, style for a perfect flight, and the judges are told', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/const flow = flightFlow\(beatMarks, beatSlam\);/);
    expect(fin).toMatch(/beatExec: flow\.beatExec, flowStyle: flow\.flowStyle,/);
    expect(fin.indexOf('const flow = flightFlow(')).toBeLessThan(fin.indexOf('} = dunkCard({'));
    expect(fin).toMatch(/if \(flow\.perfect\) verdictParts\.push\('PERFECT FLIGHT'\);/);
    expect(fin).toMatch(/const airBits = \[[^\]]*flow\.label/);
  });
  it('the practice runway says how the beats went', () => {
    expect(fn('finishPractice')).toMatch(/flightFlow\(beatMarks, beatSlam\)\.label/);
  });
  it('the rival hits his beats on a clean attempt, and is the old pad otherwise', () => {
    expect(fn('planRivalAttempt')).toMatch(/onBeat: rivalHitsBeats\(acc, blew\)/);
    expect(fn('rivalDrive')).toMatch(/clipTime >= rivalPressAt\(next, after, P\.onBeat\)/);
    expect(fn('rivalDrive')).toMatch(/const after = F\.trickIdx === 0 \? 0\.06 : \(airTrick \? airTrick\.t0 \+ 0\.12 : Infinity\);/);
  });
  it('the host draws the strip above the hint, and stands it aside for the cut and the judges', () => {
    expect(HOST).toMatch(/import \{ DunkBeatStrip \} from '\.\/dunk-beat-strip';/);
    expect(HOST).toMatch(/hud\.beats && phase === 'playing' && !judging && !\(typeof hud\.cut === 'string' && hud\.cut\)/);
    expect(HOST).toMatch(/<DunkBeatStrip value=\{hud\.beats\} \/>/);
  });
});
