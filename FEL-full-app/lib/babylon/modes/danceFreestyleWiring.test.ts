// danceFreestyleWiring.test.ts — lane/dance-extras (2026-10-14). The FREESTYLE section and the room that plays it: the lines that connect
// dance/freestyle.ts to DanceMode, pinned to source because the room's closure needs the whole scene to run (the danceChartWiring pattern).
// What they prove together with freestyle.test.ts (which runs the same pure router over a whole chart): the section's visual, HUD and input
// modules do NOT change scoring — a freestyle press never reaches DancePerformance.hit, and the only thing it writes is the STYLE tally.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
const mode = read('DanceMode.ts');
const bodyOf = (src: string, start: string, end: string): string => { const a = src.indexOf(start); expect(a, start).toBeGreaterThan(-1); return src.slice(a, src.indexOf(end, a)); };

describe('a freestyle press never reaches the judge and writes only STYLE', () => {
  const body = bodyOf(mode, 'function freestylePress(', '\n  }\n');
  it('it asks the pure router, dances the pick through playStep, and banks freeStyleFor into the STYLE tally', () => {
    expect(body).toContain('routeFreestyle({');
    expect(body).toContain('playStep({ clipId: pick.clipId');
    expect(body).toContain('style += freeStyleFor(route);');
  });
  it('the judge is untouched: no perf.hit, no perf.hitBody, no score, combo, counts or MISS written from it', () => {
    expect(body).not.toMatch(/perf\.hit|perf\.hitBody|perf\.score|perf\.combo|perf\.counts|registerMiss|onJudged|WILD_TAP/);
    expect(body).not.toMatch(/\bscore\s*[+=-]|\bcombo\s*[+=-]/);
    // the only thing it reads off the performance is the upcoming list (a pure read)
    expect([...body.matchAll(/perf\.(\w+)/g)].map((m) => m[1])).toEqual(['upcoming']);
  });
  it('it sits in onInput after MATCH has read the button and before the tap guard, so a press that is not freestyle goes on exactly as before', () => {
    const onInput = bodyOf(mode, 'onInput(ctx: ModeContext, e: FelInput) {', '\n    update(ctx: ModeContext, dt: number) {');
    const btn = onInput.indexOf('const btn = matchMode ? matchPress(e, t.tap) : null;');
    const free = onInput.indexOf('if (freeCur && freestylePress(ctx, e, t.tap)) return;');
    const guard = onInput.indexOf('if (!t.tap && !btn) return;');
    expect(btn).toBeGreaterThan(-1);
    expect(free).toBeGreaterThan(btn);
    expect(guard).toBeGreaterThan(free);
  });
  it('and it only runs inside a section: no section, no branch (a chart with none plays as it did)', () => {
    expect(bodyOf(mode, 'function freestylePress(', '\n').length).toBeGreaterThan(0);
    expect(body).toContain("if (!freeCur || phase !== 'playing') return false;");
  });
  it('the STYLE tally stays its own: finish() still reports it beside the score, never inside it', () => {
    expect(mode).toMatch(/style,\n\s+chartLevel:/);
    expect(mode).not.toMatch(/ctx\.(end|card)\([^)]*\+ style/);
    // the only writers of `style` in the room: groove taps, held freezes, and the freestyle section
    const writers = [...mode.matchAll(/\bstyle\s*(\+=|=)\s*([^;]+);/g)].map((m) => `${m[1]} ${m[2].trim()}`);
    // test changed (lane/dance-options, owner 2026-10-17, Q2 A): two more writers, both the section's VARIETY (dance/freestyle.ts
    // varietyBonus) — at the section's end, and at a finish that lands inside one. Still STYLE: the next assertions hold it out of the score.
    expect(new Set(writers)).toEqual(new Set(['+= GROOVE_STYLE', '+= r.style', '+= freeStyleFor(route)', '= 0', '+= variety', '+= varietyBonus(freeButtons)']));
  });
});

describe('the section\'s cue: entry and exit', () => {
  it('the room checks it once a frame on the heard clock, and only when the chart has a section', () => {
    expect(mode).toContain('if (freeSpans.length) trackFreestyle(ctx, songBeat);');
    const t = bodyOf(mode, 'function trackFreestyle(', '\n  }\n');
    expect(t).toContain('const at = freeSpanAt(freeSpans, songBeat);');
    expect(t).toContain('if (at === freeCur) return;');
    expect(t).toContain('if (at) enterFreestyle(ctx, at); else exitFreestyle(ctx);');
  });
  it('entry: a banner, the HUD chip, the legend on the prompt line, the pad\'s buttons, the LED wall and the crowd', () => {
    const e = bodyOf(mode, 'function enterFreestyle(', '\n  }\n');
    expect(e).toContain("flashBanner(ctx, 'FREESTYLE — YOUR MOVE', 1600, { round: 'FREESTYLE',");
    expect(e).toContain("padStore.set({ mode: 'free', free: legend });");
    expect(e).toContain('dressing?.freestyle(true);');
    expect(e).toContain('crowd?.cheer(');
    expect(e).toContain("queueStoop('dance.freestyle');");               // Stoop's own line (rendered in P8, unwired until now)
    expect(e).toContain('nextStep: `YOUR MOVE · ${legendLine(legend)}`');
    expect(e).not.toMatch(/perf\.|score|combo/);
  });
  it('exit: what the section earned, MATCH back (if it is on), the pad and the wall restored', () => {
    const x = bodyOf(mode, 'function exitFreestyle(', '\n  }\n');
    expect(x).toContain("padStore.set({ mode: matchMode ? 'match' : 'any', free: {} });");
    expect(x).toContain('dressing?.freestyle(false);');
    expect(x).toContain('FREESTYLE OVER');
    expect(x).toContain("' · MATCH IS BACK'");
    expect(x).toContain('round: track.name');
    expect(x).not.toMatch(/perf\.|score|combo/);
  });
  it('a run, a replay and a finish all end the section (no word left on the wall, no stale pad)', () => {
    expect(bodyOf(mode, 'function resetImproveRun(', '\n  }\n')).toContain('freeSpans = []; freeCur = null; freeStyleAt = 0; freeDeck.reset(); dressing?.freestyle(false);');
    expect(bodyOf(mode, 'function finish(', '\n  }\n')).toContain('freeCur = null; dressing?.freestyle(false);');
  });
  it('the lane shows the section before it starts and its slots as gold stars; the prompt line carries the legend', () => {
    const lane = bodyOf(mode, 'function laneInto(', '\n  }\n');
    expect(lane).toContain("glyph: '★★'");
    expect(lane).toContain("glyph: '★'");
    expect(lane).toContain('freeSpanAt(freeSpans, grooves[i])');
    expect(lane).toContain('if (freeCur) { hud.nextStep = `YOUR MOVE · ${legendLine(freeDeck.legend())}`; hud.nextStepIn = null; }');
  });
});

describe('the chart is built around the sections', () => {
  it('lock-in reads them before the level shapes the chart, and HARD\'s fill keeps clear of them', () => {
    const begin = bodyOf(mode, 'function beginCountIn(', '\n  }\n');
    const secs = begin.indexOf('const freeSecs = freeSpansFor(track);');
    const lvl = begin.indexOf('chartForLevel(mine ?? generateRoutine(');
    expect(secs).toBeGreaterThan(-1);
    expect(lvl).toBeGreaterThan(secs);
    expect(begin).toContain('level, freeSecs);');
    expect(begin).toContain('freeSpans = freeSecs;');
  });
});

// lane/dance-options (owner 2026-10-17): the room's half of the VARIETY bonus (Q2) and the section's EDGE (Q6). The pure rules are run over
// every shipped chart in dance/danceOptions.test.ts through tests/helpers/dancePressChain.ts; these hold the room to the same lines.
describe('the VARIETY bonus and the EDGE, in the room', () => {
  const free = bodyOf(mode, 'function freestylePress(', '\n  }\n');
  it('a press that takes a slot adds its button to the section\'s VARIETY; the section\'s last press is noted for the EXIT GRACE', () => {
    expect(free).toContain('if (route.slotBeat !== null) { grooveTaken.add(route.slotBeat); freeButtons.add(route.slot); }');
    expect(free).toContain('if (matchPress(e, anyTap)) freeLastPress = (heardNow - startAt) / bd;');
    expect(free.indexOf('freeLastPress =')).toBeLessThan(free.indexOf('routeFreestyle({'));   // before the router can hand the press on
  });
  it('MATCH is never asked in a section: the router is told MATCH is on, so a wrong button there dances instead of fumbling', () => {
    expect(free).toContain('matchOn: matchMode,');
  });
  it('the section pays its VARIETY once, when it ends (or when a finish lands inside it), and the banner says so', () => {
    const x = bodyOf(mode, 'function exitFreestyle(', '\n  }\n');
    expect(x).toContain('const variety = varietyBonus(freeButtons);');
    expect(x).toContain('style += variety;');
    expect(x.indexOf('style += variety;')).toBeLessThan(x.indexOf('const gained = style - freeStyleAt;'));
    expect(x).toContain('(VARIETY +${variety})');
    expect(bodyOf(mode, 'function enterFreestyle(', '\n  }\n')).toContain('freeButtons = new Set();');
    expect(bodyOf(mode, 'function finish(', '\n  }\n')).toContain('if (freeCur) style += varietyBonus(freeButtons);');
    expect(bodyOf(mode, 'function resetImproveRun(', '\n  }\n')).toContain('freeButtons = new Set(); freeLastPress = null;');
  });
  it('the EXIT GRACE sits in pressAt after the STYLE tap and the MATCH fumble and before perf.hit, and only for a would-be wild tap', () => {
    const p = bodyOf(mode, 'function pressAt(', '\n  }\n');
    const fumble = p.indexOf('if (fumbled.has(target.step)) return;');
    const grace = p.indexOf('exitGraceForgives({ spans: freeSpans, beatPos: (heardNow - startAt) / bd, beatSec: bd, lastSectionPressBeat: freeLastPress })');
    const hit = p.indexOf('perf.hit(heardNow)');
    expect(fumble).toBeGreaterThan(-1);
    expect(grace).toBeGreaterThan(fumble);
    expect(hit).toBeGreaterThan(grace);
    expect(p).toContain("if (freeSpans.length && phase === 'playing' && !pressTarget(near ?? perf.upcoming(heardNow, STOOP_LOOKAHEAD), heardNow)) {");
  });
});
