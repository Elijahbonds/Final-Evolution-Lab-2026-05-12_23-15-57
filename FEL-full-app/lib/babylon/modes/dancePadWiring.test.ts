// dancePadWiring.test.ts — lane/dance-extras (2026-10-14). The phone pad (dance/ui/DancePad.tsx) and the room it plays: the lines that
// connect them, pinned to source because the room's closure needs the whole scene to run (the danceChartWiring pattern).
//   1. THE PAD IS DISPLAY AND INPUT, NEVER A JUDGE: DanceMode publishes what the buttons are FOR (padStore) from state it
//      already holds, in functions that touch no score, and nothing in the room reads that store back.
//   2. THE ROOM'S INPUT CHAIN IS THE ONE tests/helpers/dancePressChain mirrors — danceTap → matchPress → STYLE tap → MATCH
//      fumble → perf.hit, in that order — so "touch ≡ pad" (DancePad.test.tsx) is a statement about the real chain.
//   3. TouchOverlay hands dance to the pad (one overlay, the same bus), and the host passes it the HUD's pad state.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
const mode = read('DanceMode.ts');
const bodyOf = (src: string, start: string, end: string): string => { const a = src.indexOf(start); expect(a, start).toBeGreaterThan(-1); return src.slice(a, src.indexOf(end, a)); };

describe('DanceMode publishes the pad state and nothing reads it back', () => {
  it('publishPad sets only the pad\'s display state, from matchMode, and no score or judge state', () => {
    const body = bodyOf(mode, 'function publishPad(', '\n  }\n');
    expect(body).toContain("padStore.set({ mode: mode === 'pick' ? 'pick' : matchMode ? 'match' : 'any', matchOn: matchMode, free: {} })");
    expect(body).not.toMatch(/perf\.|score|combo|style\s*[+=]|MISS_AFTER|JUDGE|setHud/);
  });
  it('it is called where the pad changes meaning: the pick screen, a MATCH toggle, and the lock-in', () => {
    expect(bodyOf(mode, 'function showPick(', '\n  }\n')).toContain("publishPad('pick')");
    expect(bodyOf(mode, 'function changeOption(', '\n  }\n')).toContain("publishPad('pick')");
    expect(bodyOf(mode, 'function beginCountIn(', '\n  }\n')).toContain("publishPad('play')");
  });
  it('the store is reset when a room loads and when it goes away', () => {
    expect(bodyOf(mode, 'async load(ctx: ModeContext) {', '\n')).toBe('async load(ctx: ModeContext) {');
    expect(mode).toMatch(/async load\(ctx: ModeContext\) \{\n\s+padStore\.reset\(\);/);
    expect(mode).toMatch(/dispose\(\) \{\n\s+padStore\.reset\(\);/);
  });
  it('nothing in the room reads the store back: only set and reset are called on it', () => {
    const calls = [...mode.matchAll(/padStore\.(set|reset|get|getServer|subscribe)\b/g)].map((m) => m[1]);
    expect(new Set(calls)).toEqual(new Set(['set', 'reset']));
  });
});

describe('the room\'s input chain is the one the helper mirrors', () => {
  const onInput = bodyOf(mode, 'onInput(ctx: ModeContext, e: FelInput) {', '\n    update(ctx: ModeContext, dt: number) {');
  const pressAt = bodyOf(mode, 'function pressAt(', '\n  }\n');
  it('onInput: danceTap first, then MATCH reads the button (matchPress), a non-tap with no button returns', () => {
    const tap = onInput.indexOf('const t = danceTap(trig, e);');
    const btn = onInput.indexOf('const btn = matchMode ? matchPress(e, t.tap) : null;');
    const guard = onInput.indexOf('if (!t.tap && !btn) return;');
    expect(tap).toBeGreaterThan(-1);
    expect(btn).toBeGreaterThan(tap);
    expect(guard).toBeGreaterThan(btn);
    // nothing returns on a bare `!t.tap` before MATCH has read the button: in MATCH, X and Y are taps that are not `t.tap`
    expect(onInput).not.toMatch(/if \(!t\.tap\) return;/);
  });
  it('pressAt: the STYLE tap, then the MATCH fumble, then perf.hit — in that order', () => {
    const style = pressAt.indexOf('styleTapAt(grooves, near, heardNow,');
    const fumble = pressAt.indexOf('if (fumbled.has(target.step)) return;');
    const want = pressAt.indexOf('buttonForStep(target.step)');
    const hit = pressAt.indexOf('perf.hit(heardNow)');
    expect(style).toBeGreaterThan(-1);
    expect(fumble).toBeGreaterThan(style);
    expect(want).toBeGreaterThan(fumble);
    expect(hit).toBeGreaterThan(want);
  });
});

describe('TouchOverlay hands dance to the pad', () => {
  const overlay = read('../ui/TouchOverlay.tsx');
  const host = read('../../../components/games/timing-babylon.tsx');
  it('only the dance mode, after the overlay\'s own hooks and its hidden / pad-connected / no-touch exits, on the same bus', () => {
    const exit = overlay.indexOf("if (!props.visible || props.bus.gamepadActive || deck === 'none') return null;");
    const branch = overlay.indexOf("if (props.modeId === 'dance') {");
    expect(exit).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(exit);
    expect(overlay.slice(branch, branch + 400)).toContain('<DancePad bus={props.bus}');
  });
  it('every other mode still draws the generic rig: the branch returns before it and names only dance', () => {
    expect(overlay.match(/props\.modeId === '/g)!.length).toBe(1);
  });
  it('the shared timing host is not touched: the pad reads the room through padStore, so no host passes it anything', () => {
    expect(host).not.toMatch(/padStore|DancePad|dancePad/);
  });
});
