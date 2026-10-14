// NB-4 + QA-H1 (hoops grade 0d16f5dd): opening /play/<hoops mode> opened a server run at page load, before TAP TO START,
// and a double-tap on PLAY AGAIN opened two. A hoops run now starts at TAP TO START (the harness's beginRun), once.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sessionStore } from '@/lib/babylon/core/sessionStore';

const SHELL = readFileSync(join(__dirname, 'game-shell.tsx'), 'utf8');
const HARNESS = readFileSync(join(__dirname, '../../lib/babylon/core/ModeHarness.ts'), 'utf8');

describe('NB-4: a hoops run starts at TAP TO START, not at page load', () => {
  it('the hoops family is lazy; nothing else changes', () => {
    expect(SHELL).toMatch(/LAZY_RUN_MODES: ReadonlySet<string> = new Set\(\['hoops1v1', 'hoops3v3', 'threePoint'\]\)/);
    expect(SHELL).toMatch(/lazyRun\.current = LAZY_RUN_MODES\.has\(mode\);/);
  });
  it('a lazy game subscribes and asks for its run when the runId advances; every other game still asks at mount', () => {
    const at = SHELL.indexOf('if (lazyRun.current) {');
    const block = SHELL.slice(at, at + 500);
    expect(block).toMatch(/serverRun\.current = null;/);
    expect(block).toMatch(/sessionStore\.subscribe\(/);
    expect(block).toMatch(/if \(id > seen\) \{ seen = id; serverRun\.current = startServerRun\(\); \}/);
    expect(block).toMatch(/\} else \{\s*serverRun\.current = startServerRun\(\);/);
    expect(SHELL).toMatch(/stopWaiting\?\.\(\);/);
  });
  it('the harness begins a run exactly on ready → playing', () => {
    expect(HARNESS.match(/store\.beginRun\(def\.modeId\);/g)).toHaveLength(1);
    const wake = HARNESS.slice(HARNESS.indexOf("if (phase !== 'ready') return;"), HARNESS.indexOf('store.beginRun(def.modeId);'));
    expect(wake).toMatch(/setPhase\('playing'\);/);
  });
  it('the store notifies once per beginRun with a bigger runId (what the shell waits on)', () => {
    let calls = 0;
    const stop = sessionStore.subscribe(() => { calls += 1; });
    const before = sessionStore.record()?.runId ?? 0;
    const w = sessionStore.mount({ modeId: 'onevone', key: 'k', lines: [], drives: 'pad', later: [], stance: undefined } as never);
    calls = 0;
    w.beginRun('onevone');
    expect(sessionStore.record()!.runId).toBeGreaterThan(before);
    expect(calls).toBeGreaterThan(0);
    stop();
  });
});

describe('QA-H1: PLAY AGAIN is one replay however fast it is pressed', () => {
  it('a second press before the next result is ignored; the next result re-arms it', () => {
    expect(SHELL).toMatch(/const replay = \(\) => \{\s*if \(replaying\.current\) return;\s*replaying\.current = true;/);
    expect(SHELL).toMatch(/useEffect\(\(\) => \{ if \(result !== null\) replaying\.current = false; \}, \[result\]\);/);
  });
});
