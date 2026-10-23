// DUNK-NO-PRESS-MISS (2026-10-22) — DunkMode wiring scan for K-DNP1–11 (Dunk mode only). The rules live and are driven in
// core/DunkNoPress.test.ts (the air drop, the hint gate, the make / hang rules); this pins that the mode plays them: no press is
// an air miss with onMiss('noSlam') and nothing on the iron, "Press to flush" runs from take-off to the first press / the slam cue
// / the resolve, the NOW! call and WINDOW OPEN are gone with their ticks, and nothing new reads an input.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hintLiterals } from '../../ui/hintLiterals';
import { STATIC_CONTROLS } from '../ui/staticControls';
import { RUNWAY_TIPS } from '../core/DunkAssist';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const NO_PRESS = readFileSync(path.join(__dirname, '../core/DunkNoPress.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };
const count = (s: string, needle: string | RegExp): number => (typeof needle === 'string' ? s.split(needle).length - 1 : (s.match(needle) ?? []).length);
const NO_PRESS_BRANCH = /else if \(missKind\(\) === 'noSlam'\) \{ releaseBall\(ball\); const v = airDropVelocity\(releasePos, rim, RIM_RADIUS, ballSim\.radius\); ballSim\.launch\(releasePos, new Vector3\(v\.x, v\.y, v\.z\)\); looseBall = true; missAir\(ctx\); setTrail\('off'\); armSettle\(\); dunkHooks\.miss\('noSlam', hookWho\(\)\); if \(turn === 'player'\) flushGate\.noteNoSlam\(\); \}/;
const branchOf = (src: string): string => { const m = NO_PRESS_BRANCH.exec(src); expect(m).not.toBeNull(); return m![0]; };

describe('K-DNP1 — no press at all resolves at closeAt as a NO SLAM miss', () => {
  it('the window closing with no press resolves; qteHit stays false; the kind is noSlam and the banner NO SLAM — MISSED', () => {
    expect(DUNK).toMatch(/if \(clipTime >= closeAt\) \{ meter3d\?\.end\(lob\.live \? 'brick' : 'late'\); if \(lob\.live\) lostLob\(ctx\); else resolveDunk\(ctx\); \}/);
    expect(fn('launchDunk')).toMatch(/clipTime = 0; qteHit = false;/);
    expect(count(DUNK, /qteHit = slamIsClean\(qteAccuracy\);/g)).toBe(1);   // only a press sets it
    expect(fn('slamNow')).toMatch(/qteHit = slamIsClean\(qteAccuracy\);/);
    expect(fn('missKind')).toMatch(/return slamSeen \? 'early' : 'noSlam';/);
    expect(fn('missWhy')).toMatch(/const why = slamSeen \? 'THREW IT AT THE IRON TOO EARLY' : 'NO SLAM';/);
    expect(fn('resolveDunk')).toMatch(/if \(!qteHit\) flash\(ctx, `\$\{missWhy\(\)\} — MISSED`\);/);
  });
  it('the no-press branch comes before the clank, so a noSlam miss never takes the clank path', () => {
    const r = fn('resolveDunk');
    const air = r.indexOf("else if (missKind() === 'noSlam')"), clank = r.indexOf('else if (!qteHit) { releaseBall(ball); ballSim.launch(releasePos, clankOffRim(ball, rim));');
    expect(air).toBeGreaterThan(0);
    expect(clank).toBeGreaterThan(air);
    expect(r.indexOf('if (lob.live) { setTrail')).toBeLessThan(air);   // a lost lob keeps its own miss
  });
});

describe('K-DNP2 — a no-press miss is one onMiss(noSlam), no onContact, no contactPunch', () => {
  it("the branch emits dunkHooks.miss('noSlam') once, and nothing that contacts", () => {
    const b = branchOf(DUNK);
    expect(count(DUNK, "dunkHooks.miss('noSlam'")).toBe(1);
    expect(b).not.toMatch(/contactPunch|dunkHooks\.contact|setWin\('contact'\)|jamSec = 0|jamContact = true|contactLatch/);
  });
  it('the jam (where contactPunch / onContact live) only runs on a make: a no-press attempt never arms it', () => {
    expect(fn('resolveDunk')).toMatch(/else if \(finishRelease < 0\) \{ jamSec = 0;/);   // after the !qteHit branches
    expect(count(DUNK, 'contactPunch(ctx)')).toBe(1);
    expect(fn('launchDunk')).toMatch(/contactLatch = false;[^\n]*\n\s*dunkHooks\.reset\(\);/);
  });
  it("'noSlam' is on the hook surface's reason list", () => {
    const contact = readFileSync(path.join(__dirname, '../core/DunkContact.ts'), 'utf8');
    expect(contact).toMatch(/export type DunkMissKind = 'rim' \| 'glass' \| 'short' \| 'noSlam';/);
  });
});

describe('K-DNP3 — a no-press miss never rattles, clangs, grazes or moves the ring / net', () => {
  it('the branch calls missAir, never missClank or the hoop', () => {
    const b = branchOf(DUNK);
    expect(b).toContain('missAir(ctx)');
    expect(b).not.toMatch(/missClank|hoopJuice|clankOffRim/);
  });
  it('missAir: no graze, no punch, no rattle / clang / impact, no feel impact — a soft whoosh and the groan', () => {
    const m = fn('missAir');
    expect(m).not.toMatch(/hoopJuice|graze|punch\(|'rattle'|'clang'|'impact'|feel\.impact|feel\?\.impact/);
    expect(m).toContain('missBeat(null)');
    expect(m).toMatch(/SoundKit\.play\('whoosh', \{ pitch: 0\.7, volume: 0\.25 \}\);/);
    expect(m).toMatch(/SoundKit\.play\('crowdGroan', \{ volume: beat\.groan \}\);/);
  });
  it('the clank keeps its iron for a press that missed (K-SFX4 line untouched)', () => {
    expect(DUNK).toMatch(/ballSim\.launch\(releasePos, clankOffRim\(ball, rim\)\); looseBall = true; missClank\(ctx\); setTrail\('off'\); armSettle\(\); dunkHooks\.miss\('rim', hookWho\(\)\); \}/);
    expect(fn('missClank')).toMatch(/hoopJuice\?\.graze\(\);/);
  });
});

describe('K-DNP4 — the no-press ball drops in the air, never off the rim', () => {
  it('the release is airDropVelocity (TUNE, core/DunkNoPress), with the mode ring radius and the ball\'s own', () => {
    expect(branchOf(DUNK)).toContain('airDropVelocity(releasePos, rim, RIM_RADIUS, ballSim.radius)');
    expect(NO_PRESS).toMatch(/TUNE/);
    // the loose ball's sim has no rim in it: what the drop is launched with is the whole flight
    expect(DUNK).toMatch(/if \(looseBall && !ball\.parent && !lob\.live && !replaying\) ballSim\.step\(dt, 0, FLOOR_E, FLOOR_FRICTION\);/);
  });
});

describe('K-DNP5 — "Press to flush": from take-off, down on the first press, the slam cue takes it, gone at the resolve', () => {
  it('take-off puts it up through the gate, after the runway line is cleared', () => {
    const l = fn('launchDunk');
    expect(l).toMatch(/teachHint = ''; ctx\.setHud\(\{ hint: '' \}\);\n[^\n]*\n\s*flushHintUp = flushGate\.take\(\{ rival: turn !== 'player', replay: replaying, nowSec: performance\.now\(\) \/ 1000 \}\);\n\s*if \(flushHintUp\) ctx\.setHud\(\{ hint: FLUSH_HINT \}\);/);
    expect(l.indexOf('flushGate.take(')).toBeLessThan(l.indexOf("setWin('takeoff')"));
    expect(l.indexOf('flushGate.take(')).toBeGreaterThan(l.indexOf("teachHint = ''"));
  });
  it('the first slam press takes it down (the in-window press at once, a buffered press on the next flight frame)', () => {
    expect(fn('slamNow')).toMatch(/slamSeen = true;[^\n]*\n\s*dropFlushHint\(ctx\);/);
    expect(DUNK).toMatch(/if \(flushHintUp && slamSeen\) dropFlushHint\(ctx\);[^\n]*\n\s*const wasOpen = qteWindowOpen, wasCue = slamCueOn;/);
    expect(DUNK).toMatch(/function dropFlushHint\(ctx: ModeContext\): void \{ if \(flushHintUp\) \{ flushHintUp = false; ctx\.setHud\(\{ hint: '' \}\); \} \}/);
  });
  it('the slam cue replaces it (one line at a time); a pump cue going down hands the line back only while it is still up', () => {
    expect(DUNK).toMatch(/if \(\(slamCueOn \|\| \(qteWindowOpen && lob\.live\)\) && !\(wasCue \|\| wasOpen\)\) \{ flushHintUp = false; ctx\.setHud\(\{ hint: lob\.live \? 'CATCH IT!' : 'SLAM — OR WAIT FOR THE BEAT', slamPulse: true, slamBeat: lob\.live \? 'catch' : 'cue' \}\); \}/);
    expect(DUNK).toMatch(/ctx\.setHud\(\{ hint: want \? PUMP_CUE : flushHintUp \? FLUSH_HINT : '' \}\);/);
  });
  it('the resolve clears it with the hint, the pulse and the beat', () => {
    expect(fn('resolveDunk')).toMatch(/ctx\.setHud\(\{ slamPulse: false, hint: '', slamBeat: '' \}\);[^\n]*\n\s*flushHintUp = false;/);
  });
  it('FLUSH_HINT is written only where those lines write it', () => {
    expect(count(DUNK, 'FLUSH_HINT')).toBe(3);   // the import, the take-off, the pump cue's hand-back
    expect(count(DUNK, 'flushHintUp = true')).toBe(0);   // only the gate raises it
  });
});

describe('K-DNP6 — the rate limits are the gate\'s, fed by the player\'s own attempts', () => {
  it('a mount is a new guest; a player no-press miss earns the next attempt; a pressed make counts toward K', () => {
    expect(DUNK).toMatch(/practice = false; playerJumps = 0; guestFactor = 1; flushGate\.reset\(\); flushHintUp = false;/);
    expect(branchOf(DUNK)).toContain("if (turn === 'player') flushGate.noteNoSlam();");
    expect(fn('finishAttempt')).toMatch(/if \(turn === 'player' && made && slamSeen\) flushGate\.notePressedMake\(\);/);
    expect(count(DUNK, 'flushGate.noteNoSlam()')).toBe(1);
    expect(count(DUNK, 'flushGate.notePressedMake()')).toBe(1);
    expect(count(DUNK, 'flushGate.take(')).toBe(1);
  });
  it('the limits are TUNE constants in core/DunkNoPress', () => {
    for (const k of ['FLUSH_HINT_FIRST_N', 'FLUSH_HINT_MIN_GAP_SEC', 'FLUSH_HINT_GUEST_K']) expect(NO_PRESS).toMatch(new RegExp(`export const ${k} = [0-9.]+;`));
    expect(count(NO_PRESS, /TUNE/g)).toBeGreaterThanOrEqual(7);
  });
});

describe('K-DNP7 — no new input', () => {
  it('the hint module reads no input and touches no Babylon', () => {
    expect(NO_PRESS).not.toMatch(/FelInput|onInput|InputBus|btn|from '@babylonjs/);
  });
  it('the only accepted press is still the slam latch: the same press paths as before this tip', () => {
    expect(count(DUNK, 'slamLatch.press(')).toBe(2);
    expect(count(DUNK, 'slamLatch.open(')).toBe(1);
    expect(count(DUNK, 'slamSeen = true')).toBe(2);
    expect(count(DUNK, 'bufferSlam(')).toBe(3);
    expect(count(DUNK, 'slamNow(ctx')).toBe(3);
    expect(count(DUNK, 'e.btn ===')).toBe(38);
    expect(count(DUNK, "e.t === 'button'")).toBe(27);
  });
  it('nothing about the hint sits in an input handler', () => {
    for (const f of ['airButton', 'bufferSlam']) expect(fn(f)).not.toMatch(/flushHint|flushGate|FLUSH_HINT/);
  });
});

describe('K-DNP8 / K-DNP9 — the window, its grading, the press and the hang are unchanged', () => {
  it('the slam window and the grade are the same sums', () => {
    expect(DUNK).toMatch(/const window = slamWindowBase\(\) \* \(1 - styleTaps \* 0\.25\) \* flight\.slamWindowScale;\n\s*const openAt = EASTBAY_TIMING\.extend - window \/ 2, closeAt = EASTBAY_TIMING\.extend \+ window \/ 2;/);
    expect(DUNK).toMatch(/function slamWindowBase\(\): number \{ return CFG\.qteWindowSec \* tvFactor \* guestFactor; \}/);
    expect(fn('slamNow')).toMatch(/qteAccuracy = slamExecution\(at, center, half, reach\);/);
  });
  it('the rim hang still holds on SLAM held through the contact, capped by HANG_MAX_SEC', () => {
    expect(DUNK).toMatch(/if \(!hangHold\(aHeld \|\| \(skyTapped && hangHeldSec < HANG_MAX_SEC\), hangHeldSec, HANG_MAX_SEC \+ \(skyTapped \? 0\.8 : 0\)\)\) \{/);
    expect(fn('slamNow')).toMatch(/if \(qteHit && turn === 'player' && !skyTapped && \(phase as Phase\) === 'resolve'\) \{ hangPrompt = true; ctx\.setHud\(\{ hint: HANG_PROMPT \}\); \}/);
  });
});

describe('K-DNP10 — Dunk mode only: 3v3 and ShowtimeDunk never see it', () => {
  it('ThreeVThreeMode and ShowtimeDunk import nothing of this tip', () => {
    for (const f of ['ThreeVThreeMode.ts', '../core/ShowtimeDunk.ts']) {
      const src = readFileSync(path.join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/DunkNoPress|FLUSH_HINT|flushGate|airDropVelocity|'noSlam'/);
    }
  });
});

describe('K-DNP11 — no NOW!, no WINDOW OPEN, no beat tick; the runway copy is the new line', () => {
  it('no hint the mode can write is NOW! or WINDOW OPEN, and no runway line says NOW', () => {
    const texts = hintLiterals(DUNK).map((h) => h.text);
    expect(texts.length).toBeGreaterThan(10);   // the scan reads the mode (15 at the time of writing)
    expect(texts).not.toContain('NOW!');
    expect(texts).not.toContain('WINDOW OPEN');
    expect(DUNK).not.toMatch(/hint: 'NOW!'|hint: 'WINDOW OPEN'/);
    for (const m of DUNK.matchAll(/runwayHint = ([^\n]*)/g)) expect(m[1]).not.toMatch(/NOW/);
    for (const t of RUNWAY_TIPS) expect(t).not.toMatch(/NOW!/);
  });
  it("the runway line is exactly 'HOLD to run · tap JUMP at the line · press to flush', and the static map still matches it", () => {
    expect(count(DUNK, "'HOLD to run · tap JUMP at the line · press to flush'")).toBe(2);   // the mount, the next attempt's
    expect(DUNK).toMatch(/hint: \(runwayHint = 'HOLD to run · tap JUMP at the line · press to flush'\)/);
    expect(STATIC_CONTROLS.filter((l) => l.mode === 'dunk').map((l) => l.text)).toEqual(['HOLD to run · tap JUMP at the line · press to flush']);
  });
  it('the window opening and its centre play no tick; the machine-readable slamBeat stays (never drawn)', () => {
    const i = DUNK.indexOf("if (qteWindowOpen && !wasOpen && !lob.live) ctx.setHud({ slamBeat: 'open' });");
    expect(i).toBeGreaterThan(0);
    const j = DUNK.indexOf('if (!slamCueOn && !qteWindowOpen && (wasCue || wasOpen))', i);
    const block = DUNK.slice(i, j);
    expect(block).toMatch(/beatCalled = true;\n\s*ctx\.setHud\(\{ slamBeat: 'beat' \}\);/);
    expect(block).not.toMatch(/SoundKit|hint:/);
    expect(DUNK).not.toMatch(/SoundKit\.play\('uiTick', \{ pitch: 1\.9, volume: 0\.55 \}\)|SoundKit\.play\('uiTick', \{ pitch: 1\.55, volume: 0\.4 \}\)/);
    expect(count(DUNK, "SoundKit.play('uiTick'")).toBe(22);   // 24 at the base, less the two window ticks
  });
  it('the four-beat bar still skips the slam beat (its tick was the NOW! call\'s, now gone)', () => {
    expect(DUNK).toMatch(/if \(b !== 'slam'\) SoundKit\.play\('uiTick', \{ pitch: BEAT_TICK_PITCH\[b\], volume: BEAT_TICK_VOLUME \}\);/);
  });
});
