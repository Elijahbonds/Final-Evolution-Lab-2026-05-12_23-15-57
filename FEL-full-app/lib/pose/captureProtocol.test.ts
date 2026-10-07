// MIRROR PHASE 3: the owner-led capture's one list of takes — complete for the owner's movements, every fault named and
// replayed by some grader, the doc in step with it, and people as aliases only.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAPTURE_DEVICES, CAPTURE_TAKES, FAULT_LABELS, GOOD_LABELS, LABEL_NAME, MOVEMENT_NAME, PERSON_ALIASES, captureFileName, captureMetaProblems,
  isPersonAlias, type CaptureMovement,
} from './captureProtocol';
import { CHECKS, roleOf } from '@/lib/mirror/fixtures/capture/checks';
import type { CapturedTake } from '@/lib/mirror/fixtures/capture/format';

const DOC = readFileSync(join(__dirname, '../../docs/MIRROR-CAPTURE-PROTOCOL.md'), 'utf8');

describe('the capture protocol', () => {
  it('every take id is unique and starts with its movement', () => {
    expect(new Set(CAPTURE_TAKES.map((t) => t.id)).size).toBe(CAPTURE_TAKES.length);
    for (const t of CAPTURE_TAKES) expect(t.id.startsWith(`${t.movement}.`), t.id).toBe(true);
  });

  it('covers the owner\'s list: squat, lunge, press/row, the jump (T5), hinge, push-up and the Quick Screen T1/T2/T3, each with good reps AND named faults', () => {
    const wanted: CaptureMovement[] = ['squat', 'lunge', 'pressRow', 'jump', 'hinge', 'pushup', 't1', 't2', 't3'];
    for (const m of wanted) {
      const takes = CAPTURE_TAKES.filter((t) => t.movement === m);
      expect(takes.some((t) => t.label === 'good'), `${m} good`).toBe(true);
      expect(takes.some((t) => t.label !== 'good'), `${m} fault`).toBe(true);
      for (const t of takes.filter((x) => x.label === 'good')) expect(t.reps, t.id).toBeGreaterThanOrEqual(3);
    }
    expect(CAPTURE_TAKES.filter((t) => t.movement === 'stand').map((t) => t.id)).toEqual(['stand.front', 'stand.side']);
  });

  it('follows the Mirror tabs\' framing (lane/mirror-moves): 11 clean hinges and push-ups, full lunge sets, the push-ups from the floor', () => {
    const tk = (id: string) => CAPTURE_TAKES.find((t) => t.id === id)!;
    expect(tk('hinge.good').reps).toBe(11);
    expect(tk('pushup.good').reps).toBe(11);
    expect(tk('lunge.left.good').reps).toBe(8);
    expect(tk('lunge.right.good').reps).toBe(8);
    for (const t of CAPTURE_TAKES) expect(t.placement === 'floor', t.id).toBe(t.movement === 'pushup');
    for (const t of CAPTURE_TAKES.filter((x) => x.movement === 'hinge' || x.movement === 'pushup')) expect(t.view, t.id).toBe('side');
    const labels = (m: string) => CAPTURE_TAKES.filter((t) => t.movement === m).map((t) => t.label);
    expect(labels('hinge')).toEqual(expect.arrayContaining(['good', 'kneeDominant', 'headPoke', 'walkIn']));
    expect(labels('pushup')).toEqual(expect.arrayContaining(['good', 'kneePushup', 'hipsSag', 'partial', 'walkIn']));
  });

  it('walk-ins and knee push-ups are good takes: nothing may fire on them', () => {
    expect(GOOD_LABELS).toEqual(['good', 'walkIn', 'kneePushup']);
    for (const l of GOOD_LABELS) expect(FAULT_LABELS).not.toContain(l);
  });

  it('the jump takes (and only they) ask for 60 fps', () => {
    for (const t of CAPTURE_TAKES) expect(!!t.highRate, t.id).toBe(t.movement === 'jump');
  });

  it('every label has a plain name, every movement a name, and a prompt readable at 3 m', () => {
    for (const t of CAPTURE_TAKES) {
      expect(LABEL_NAME[t.label], t.label).toBeTruthy();
      expect(MOVEMENT_NAME[t.movement]).toBeTruthy();
      expect(t.prompt.length).toBeGreaterThan(20);
      expect(t.prompt.length).toBeLessThan(140);
      expect(t.seconds).toBeGreaterThanOrEqual(3);
    }
  });

  it('every fault done on purpose is one some grader is meant to catch (no orphan labels)', () => {
    const orphans: string[] = [];
    for (const t of CAPTURE_TAKES.filter((x) => !GOOD_LABELS.includes(x.label))) {
      const take = { ...t, video: { width: 480, height: 640 }, clock: 'capture', detectFps: 30, inferMs: 9, highRate: false, goT: 0, frames: [] } as CapturedTake;
      if (!CHECKS.some((c) => roleOf(c, take) === 'fault')) orphans.push(t.id);
    }
    expect(orphans).toEqual([]);
    expect(FAULT_LABELS.length).toBeGreaterThan(15);
  });

  it('people are aliases P1–P3 and the phones are the owner\'s two', () => {
    expect(PERSON_ALIASES).toEqual(['P1', 'P2', 'P3']);
    expect(CAPTURE_DEVICES).toEqual(['android-mid', 'iphone']);
    expect(isPersonAlias('P2')).toBe(true);
    expect(isPersonAlias('Jordan')).toBe(false);
    expect(captureFileName('P2', 'android-mid', new Date(2026, 9, 9, 15, 30))).toBe('fel-capture-P2-android-mid-2026-10-09-1530.json');
  });

  it('a minor is never in a capture: the block must say adults only, and consent', () => {
    const ok = { protocol: 'mirror-capture-1', person: 'P3', device: 'iphone', adult: true, consent: true };
    expect(captureMetaProblems(ok)).toEqual([]);
    expect(captureMetaProblems({ ...ok, adult: false }).join()).toMatch(/no minors/);
    expect(captureMetaProblems({ ...ok, consent: undefined }).join()).toMatch(/consent/);
  });
});

describe('docs/MIRROR-CAPTURE-PROTOCOL.md is the same list in plain words', () => {
  it('names every take id, every person alias and both phones', () => {
    for (const t of CAPTURE_TAKES) expect(DOC, t.id).toContain(`\`${t.id}\``);
    for (const p of PERSON_ALIASES) expect(DOC).toContain(p);
    for (const d of CAPTURE_DEVICES) expect(DOC).toContain(d);
  });

  it('says numbers only and never video, no minors, carries the consent wording, and the two commands', () => {
    expect(DOC).toMatch(/never video/i);
    expect(DOC).toMatch(/no minors|no one under 18/i);
    expect(DOC).toMatch(/## .*consent/i);
    expect(DOC).toContain('scripts/mirror-capture.ts ingest');
    expect(DOC).toContain('scripts/mirror-capture.ts report');
    expect(DOC).toMatch(/auto-lock/i);
  });
});
