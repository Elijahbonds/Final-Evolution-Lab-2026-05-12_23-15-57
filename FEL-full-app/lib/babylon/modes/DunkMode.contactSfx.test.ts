// CONTACT-RIM-SOUND (2026-10-22) — DunkMode wiring scan for K-SFX1–4 (DUNK-MODE-PLAN §11.3). The decision and the latch are
// tested where they live (core/DunkHands.contact.test.ts); this pins that the mode takes its contact from them and only there:
// the rim sound / contactPunch / onContact ride the one geometric contact frame, the flush step never punches, the timeout never
// lets go, and punchPending is gone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const between = (from: string, to: string): string => {
  const i = DUNK.indexOf(from); expect(i, from).toBeGreaterThan(0);
  const j = DUNK.indexOf(to, i + from.length); expect(j, to).toBeGreaterThan(i);
  return DUNK.slice(i, j);
};
const count = (s: string, needle: string | RegExp): number => (typeof needle === 'string' ? s.split(needle).length - 1 : (s.match(needle) ?? []).length);

describe('K-SFX1 — the contact, its punch and onContact share the [HANDS] iron contact frame', () => {
  it('the jam asks jamIronStep (geometry only) and never ironContact (the timeout)', () => {
    expect(DUNK).toMatch(/const ironStep = jamIronStep\(\{ ball: bp, rim, rimRadius: RIM_RADIUS, ballRadius: ballSim\.radius, sincePress: jamSec, centred: true \}\);/);
    expect(DUNK).not.toMatch(/\bironContact\(/);
    expect(DUNK).not.toMatch(/timeout:/);
  });
  it('the contact branch logs the iron contact, punches and emits onContact — one place, one frame', () => {
    const contact = between("if (ironStep?.kind === 'contact') {", "} else if (ironStep?.kind === 'short') {");
    expect(contact).toContain('console.info(`[HANDS] iron contact');
    expect(contact).toMatch(/setWin\('contact'\); contactPunch\(ctx\); dunkHooks\.contact\(aerialClip, ironStep\.quality, tierFromAccuracy\(qteAccuracy, aHeld\), hookWho\(\)\);/);
    expect(count(DUNK, 'contactPunch(ctx)')).toBe(1);
    expect(count(DUNK, 'dunkHooks.contact(')).toBe(1);
    expect(count(DUNK, "setWin('contact')")).toBe(1);
    expect(count(DUNK, '[HANDS] iron contact')).toBe(1);
  });
});

describe('K-SFX2 — the timeout never contacts: no iron by the safety is SHORT OF THE IRON', () => {
  it('the short branch is a miss: one onMiss(short), no punch, no flush, no contact', () => {
    const short = between("} else if (ironStep?.kind === 'short') {", '} else { jamPrevBall.copyFrom(bp); jamPrevLive = true; }');
    expect(short).toContain("dunkHooks.miss('short', hookWho());");
    expect(short).toContain('qteHit = false; jamSec = -1;');
    expect(short).not.toMatch(/contactPunch|dunkHooks\.contact|startFlush|jamContact = true|setWin\('contact'\)/);
    expect(count(DUNK, "dunkHooks.miss('short'")).toBe(1);
  });
});

describe('K-SFX3 — the flush step never contacts, and punchPending is gone', () => {
  it('no punchPending symbol anywhere in DunkMode', () => {
    expect(DUNK).not.toMatch(/punchPending/);
  });
  it('the flush step moves the ball and lets it out of the net — nothing in it punches or emits a hook', () => {
    const flush = between("if (flush && flush.phase !== 'free') {", 'const through = sinceRelease > FLUSH_BEAT_SEC;');
    expect(flush).toContain('stepFlush(flush, rim, RIM_RADIUS, ballSim.radius, dt)');
    expect(flush).not.toMatch(/contactPunch|dunkHooks|setWin\('contact'\)/);
  });
});

describe('K-SFX4 — every hook latches once per attempt', () => {
  it('the hooks reset everywhere contactLatch resets, and nowhere else', () => {
    const resets = count(DUNK, /^\s*[^\n]*\bcontactLatch = false;/gm) - count(DUNK, /let contactLatch = false;/g);
    expect(resets).toBeGreaterThanOrEqual(3);
    expect(count(DUNK, 'dunkHooks.reset();')).toBe(resets);
    for (const m of DUNK.matchAll(/^[^\n]*\bcontactLatch = false;[^\n]*\n([^\n]*)/gm)) {
      if (/let contactLatch/.test(m[0])) continue;
      expect(m[1]).toMatch(/^\s*dunkHooks\.reset\(\);/);
    }
  });
  it('a rim clank emits onMiss(rim) on the clank path only; glass / short never borrow it', () => {
    expect(count(DUNK, "dunkHooks.miss('rim'")).toBe(1);
    expect(DUNK).toMatch(/ballSim\.launch\(releasePos, clankOffRim\(ball, rim\)\); looseBall = true; missClank\(ctx\); setTrail\('off'\); armSettle\(\); dunkHooks\.miss\('rim', hookWho\(\)\); \}/);
  });
  it("the rival's hooks carry his actor id (DUNK-MODE-PLAN §11.9)", () => {
    expect(DUNK).toMatch(/function hookWho\(\): DunkHookWho \{ return turn === 'rival' \? \{ source: 'rival', actorId: foe\.id \} : \{ source: 'player' \}; \}/);
  });
});
