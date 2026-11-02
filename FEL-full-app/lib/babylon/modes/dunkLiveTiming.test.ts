// DUNK-LIVE-TIMING-FIX (2026-10-28): LP-01, one verdict for the strip / chip, the banner and the booth; LP-04, the run line is
// live the frame the runway opens. New tests LT-1, LT-2, LT-4 … LT-8 (LT-3 waits on LP-01(c), held: it would read a new input
// against K-DNP7's pinned counts; LT-9 waits on LP-02, held; LT-10 is a live rig probe on the Mini). No existing test edited.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { slamReadout, slamExecution, SLAM_ONTIME_MS } from '../core/DunkSystem';
import { slamIsClean, RIM_CLEAN } from '../core/DunkCard';
import { arcTopT, slamBufferSec, ARC_TOP_FRAC } from '../core/DunkLegs';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { DUNK_CONFIG } from './modeConfigs';
import { BLOOPER_LINES, bloopLine } from '../core/DunkRunItBack';
import { SHOWTIME_PCT } from '../core/ShowtimeDunk';
import { STATIC_CONTROLS, isStaticControlsHint, stripStaticControls } from '../ui/staticControls';
import { idleTip, IDLE_TIP_AFTER_SEC, RUNWAY_TIPS } from '../core/DunkAssist';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };
const method = (name: string): string => { const i = DUNK.indexOf(`    async ${name}(ctx: ModeContext) {`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n    },\n', i)); };
const count = (s: string, needle: string): number => s.split(needle).length - 1;

// the mode's own sums (DunkMode: SLAM_APEX_T, SLAM_BUFFER_SEC 0.22, the update's window; pinned there by K-DNP8)
const SLAM_APEX_T = arcTopT(EASTBAY_TIMING.extend, ARC_TOP_FRAC);
const SLAM_BUFFER_SEC = 0.22;
const RUNWAY_DEFAULT = STATIC_CONTROLS.find((l) => l.mode === 'dunk')!.text;
const RUN_LIVE = 'HOLD to run — then tap jump';

type Banner = 'none' | 'EARLY' | 'LATE';
/** The banner's reason class as missWhy decides it after LP-01(a): LATE on the late zone, else TOO EARLY for a pressed miss (LT-2 pins the source). */
const bannerOf = (zone: string | null, clean: boolean, pressed: boolean): Banner | 'NO SLAM' => (!pressed ? 'NO SLAM' : clean ? 'none' : zone === 'late' ? 'LATE' : 'EARLY');
const meterOf = (acc: number, at: number, center: number) => (acc >= 0.85 ? 'perfect' : acc >= 0.5 ? 'good' : at < center ? 'early' : 'late');   // DunkMode slamNow, verbatim
const side = (zone: string) => (zone === 'late' ? 'LATE' : zone === 'ontime' ? 'ontime' : 'EARLY');   // cue / early read EARLY

describe('LT-1 — one verdict: strip zone, chip word, meter side and banner agree for every press, every factor set', () => {
  it('the meter formula and the banner rule tested here are the mode\'s', () => {
    expect(DUNK).toContain("meter3d?.end(qteAccuracy >= 0.85 ? 'perfect' : qteAccuracy >= 0.5 ? 'good' : at < center ? 'early' : 'late');");
    expect(DUNK).toContain('const window = slamWindowBase() * (1 - styleTaps * 0.25) * flight.slamWindowScale;');
  });
  it('sweep −0.70…+0.70 s around the beat in 5 ms steps × window factors {1, 1.2, 1.4, 1.35} × styleTaps {0, 1}', () => {
    const center = EASTBAY_TIMING.extend;
    let checked = 0, lateIron = 0, refused = 0;
    for (const f of [1, 1.2, 1.4, 1.35]) for (const taps of [0, 1]) {
      const window = DUNK_CONFIG.qteWindowSec * f * (1 - taps * 0.25), half = window / 2;
      const openAt = center - half, closeAt = center + half;
      const holdSec = slamBufferSec(openAt, SLAM_APEX_T, SLAM_BUFFER_SEC);
      for (let ms = -700; ms <= 700; ms += 5) {
        const at = center + ms / 1000, tag = `f ${f} taps ${taps} @${ms} ms`;
        if (at > closeAt) continue;   // after the close: no press is taken — NO SLAM on the strip and the banner (LP-01(c) held)
        if (at < openAt - holdSec) {   // LP-01(d): refused TOO EARLY — the strip gets the press's own zone, never 'miss'
          const zone = slamReadout(at, center, 0, half).zone;
          expect(['cue', 'early'], tag).toContain(zone);
          expect(bannerOf(zone, false, true), tag).toBe('EARLY');
          refused++; continue;
        }
        const exec = slamExecution(at, center, half, holdSec);
        const r = slamReadout(at, center, exec, half), clean = slamIsClean(exec);
        expect(clean, tag).toBe(exec >= RIM_CLEAN);   // made ⇔ execution ≥ RIM_CLEAN, as today
        const word = r.label.includes('ON TIME') ? 'ontime' : r.label.includes('LATE') ? 'LATE' : 'EARLY';   // the chip
        expect(word, tag).toBe(side(r.zone));
        if (r.zone === 'ontime') expect(clean, tag).toBe(true);   // ON TIME is never a miss
        const m = meterOf(exec, at, center);
        if (m === 'early' || m === 'late') expect(m.toUpperCase(), tag).toBe(side(r.zone));
        const b = bannerOf(r.zone, clean, true);
        if (b !== 'none') { expect(b, tag).toBe(side(r.zone)); if (b === 'LATE') lateIron++; }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(lateIron).toBeGreaterThan(0);   // the case LP-01 is about: a late iron miss, now banner LATE (was TOO EARLY)
    expect(refused).toBeGreaterThan(0);
  });
  it('the base case: the late iron sliver starts ~98 ms past the beat and the ON TIME band is ±45 ms', () => {
    const center = EASTBAY_TIMING.extend, half = DUNK_CONFIG.qteWindowSec / 2;
    const reach = slamBufferSec(center - half, SLAM_APEX_T, SLAM_BUFFER_SEC);
    expect(slamIsClean(slamExecution(center + 0.095, center, half, reach))).toBe(true);
    expect(slamIsClean(slamExecution(center + 0.1, center, half, reach))).toBe(false);
    expect(slamReadout(center + 0.1, center, 0.29, half).zone).toBe('late');
    expect(slamReadout(center + SLAM_ONTIME_MS / 1000, center, 1, half).zone).toBe('ontime');
  });
});

describe('LT-2 — missWhy and missKind read the late zone first; the pinned lines stay byte for byte', () => {
  it('missWhy: the late line sits before the pinned const why', () => {
    const w = fn('missWhy');
    const late = w.indexOf("if (slamTiming?.zone === 'late') { const late = 'LATE'; return named ? `${named} · ${late}` : late; }");
    const pinned = w.indexOf("const why = slamSeen ? 'THREW IT AT THE IRON TOO EARLY' : 'NO SLAM';");
    expect(late).toBeGreaterThan(w.indexOf('const named = namedTricks();'));
    expect(pinned).toBeGreaterThan(late);
    expect(w).toContain('return named ? `${named} · ${why}` : why;');
    expect(fn('resolveDunk')).toContain('if (!qteHit) flash(ctx, `${missWhy()} — MISSED`);');   // so a late iron miss reads LATE — MISSED
  });
  it('missKind: late before the pinned return; the prop and the lob still come first', () => {
    const k = fn('missKind');
    const late = k.indexOf("if (slamTiming?.zone === 'late') return 'late';");
    expect(late).toBeGreaterThan(k.indexOf("if (lob.live || lob.lost) return 'lob';"));
    expect(k.indexOf("return slamSeen ? 'early' : 'noSlam';")).toBeGreaterThan(late);
  });
  it("the booth calls a late miss with the iron lines (no lines of its own): two in a row never the same", () => {
    expect(BLOOPER_LINES.late).toBe(BLOOPER_LINES.early);
    for (let n = 0; n < 9; n++) expect(bloopLine('late', n)).not.toBe(bloopLine('late', n + 1));
  });
});

describe('LT-4 — no press is still NO SLAM — MISSED, missKind noSlam, the air drop (K-DNP1 untouched)', () => {
  it('slamTiming is only ever a reading in slamNow (a press); every attempt and the rival\'s sim start it null', () => {
    expect(count(DUNK, 'slamTiming = slamReadout(')).toBe(1);
    expect(fn('slamNow')).toContain('slamTiming = slamReadout(at, center, qteAccuracy, half);');
    expect(fn('resetForNextAttempt')).toContain('slamTiming = null;');
    expect(count(DUNK, 'slamTiming = null')).toBe(2);   // the attempt reset, the rival's simulated slam
  });
  it('so with no press the late line cannot fire: the pinned no-press paths are as they were', () => {
    expect(fn('resolveDunk')).toContain("else if (missKind() === 'noSlam') { releaseBall(ball); const v = airDropVelocity(");
    expect(fn('resolveDunk')).toContain('if (!qteHit) flash(ctx, `${missWhy()} — MISSED`);');
    expect(DUNK).toContain("if (clipTime >= closeAt) { meter3d?.end(lob.live ? 'brick' : 'late'); if (lob.live) lostLob(ctx); else resolveDunk(ctx); }");
  });
});

describe('LT-5 — refused too early: the strip reads cue / early, never miss; the banner TOO EARLY', () => {
  it('the refuse branch puts the press\'s zone on the strip first, from where the press was (openAt − tooEarlySec)', () => {
    const i = DUNK.indexOf('else if (held) {');
    expect(i).toBeGreaterThan(0);
    const b = DUNK.slice(i, DUNK.indexOf('\n          }', i));
    const strip = b.indexOf('beatSlam = slamReadout(openAt - held.tooEarlySec, EASTBAY_TIMING.extend, 0, window / 2).zone; pushBeats(ctx);');
    expect(strip).toBeGreaterThan(0);
    expect(b.indexOf('refuse(ctx, `TOO EARLY — ${Math.round(held.tooEarlySec * 1000)} ms BEFORE THE WINDOW`);')).toBeGreaterThan(strip);
    expect(b).not.toMatch(/slamTiming =|slamSeen =|slamLatch\.|qteHit|qteAccuracy/);   // the strip only: the score, the sound and the press are as before
    expect(fn('resolveDunk')).toContain("if (!beatSlam) { beatSlam = 'miss'; pushBeats(ctx); }");   // so the resolve leaves it
  });
});

describe('LT-6 — scope: Dunk mode only; 3v3 Showtime keeps none = 0.7', () => {
  it('SHOWTIME_PCT.none is 0.7', () => { expect(SHOWTIME_PCT.none).toBe(0.7); });
  it('3v3, 1v1 and ShowtimeDunk carry nothing of this tip', () => {
    for (const f of ['ThreeVThreeMode.ts', 'OneVOneMode.ts', '../core/ShowtimeDunk.ts']) {
      const src = readFileSync(path.join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/DUNK-LIVE-TIMING-FIX|liveRunwayHint|RUN_LIVE_HINT|zone === 'late'\) \{ const late/);
    }
  });
});

describe('LT-7 — the host gets a live run line on the frame the runway opens (load, each attempt, RUN IT BACK)', () => {
  it('the default runway line is static (blanked by the harness); the live line passes through, and is on the LIVE side', () => {
    expect(isStaticControlsHint(RUNWAY_DEFAULT)).toBe(true);
    expect(stripStaticControls({ hint: RUNWAY_DEFAULT }).hint).toBe('');
    expect(isStaticControlsHint(RUN_LIVE)).toBe(false);
    expect(stripStaticControls({ hint: RUN_LIVE }).hint).toBe(RUN_LIVE);
    expect(DUNK).toContain(`const RUN_LIVE_HINT = '${RUN_LIVE}';`);
    expect(fn('liveRunwayHint')).toContain('return isStaticControlsHint(runwayHint) ? RUN_LIVE_HINT : runwayHint;');
  });
  const LIVE_CALL = "if (turn === 'player' && isStaticControlsHint(runwayHint)) ctx.setHud({ hint: liveRunwayHint() });";
  it('load: setPhase(approach), then the static line, then the live one, with no hint written after it', () => {
    const l = method('load');
    const phase = l.indexOf("setPhase('approach');"), stat = l.indexOf('hint: (runwayHint = '), live = l.indexOf(LIVE_CALL);
    expect(phase).toBeGreaterThan(0);
    expect(stat).toBeGreaterThan(phase);
    expect(live).toBeGreaterThan(stat);
    expect(l.slice(live + LIVE_CALL.length)).not.toMatch(/\bhint\s*:/);
  });
  it('each attempt: the same, after the attempt\'s HUD; RUN IT BACK goes through it', () => {
    const r = fn('resetForNextAttempt');
    const phase = r.indexOf("setPhase('approach');"), stat = r.indexOf('hint: runwayHint,'), live = r.indexOf(LIVE_CALL);
    expect(phase).toBeGreaterThan(0);
    expect(stat).toBeGreaterThan(phase);
    expect(live).toBeGreaterThan(stat);
    expect(r.slice(live + LIVE_CALL.length, r.indexOf("if (turn === 'rival')", live))).not.toMatch(/\bhint\s*:/);
    expect(fn('runItBack')).toContain('retryThisDunk(ctx);');
    expect(fn('retryThisDunk')).toContain('resetForNextAttempt(ctx);');
  });
  it('the pinned runway literal is unchanged (2 copies) and still feeds the READY card', () => {
    expect(count(DUNK, `'${RUNWAY_DEFAULT}'`)).toBe(2);
  });
});

describe('LT-8 — the idle tip still comes at 3 s and gives back the live line; the watchdog stays the fallback at 30 s', () => {
  it('idleTip: nothing before IDLE_TIP_AFTER_SEC (3), a tip from then', () => {
    expect(IDLE_TIP_AFTER_SEC).toBe(3);
    expect(idleTip(2.99)).toBeNull();
    expect(RUNWAY_TIPS).toContain(idleTip(3));
  });
  it('leaving the tip restores liveRunwayHint(), never the blanked static line', () => {
    expect(DUNK).toContain('if (idleTipShown) { idleTipShown = null; if (player.root.position.z > gatherLine() + 0.2) ctx.setHud({ hint: liveRunwayHint() }); }');
    expect(DUNK).not.toContain('ctx.setHud({ hint: runwayHint })');
  });
  it('the watchdog: approach 30 s, its line and its put-back unchanged', () => {
    expect(DUNK).toMatch(/approach: 30, charge: 5,/);
    const w = fn('watchdog');
    expect(w).toContain("ctx.setHud({ hint: 'HOLD to run — then tap jump · LOOK stick orbits the camera' });");
    expect(w).toContain('player.root.position.set(0, 0, gatherLine());');
  });
});
