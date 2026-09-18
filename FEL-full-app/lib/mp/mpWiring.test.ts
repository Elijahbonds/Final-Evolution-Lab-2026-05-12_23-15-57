// MP WIRING — can a challenge you stake a run against actually SETTLE? (2026-09-13)
//
// match-core already records this bug happening once: "Measured 2026-09-04: twelve of the fourteen keys
// never matched a session mode, so best scores read 0 and those challenges settled as ties." It happened
// again, quietly, to the two newest modes — aeroaces and velocitykart were listed as challenges while no
// host posted a session under the mode they map to, because neither had a player-facing route at all.
//
// The chain a challenge depends on is: MP key → MP_SESSION_MODE → a GameShell somewhere posting that mode.
// Every link is a string in a different file, so every link is checked here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MP_MODES, MP_SESSION_MODE, sessionModeFor, isValidMpMode } from './match-core';

const ROOT = path.resolve(__dirname, '../..');

/** Every `mode="..."` a GameShell is given, across the app. */
function postedSessionModes(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.tsx?$/.test(e.name) || e.name.includes('.test.')) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const m of src.matchAll(/mode=["']([A-Za-z0-9_-]+)["']/g)) out.add(m[1]);
    }
  };
  walk('app'); walk('components');
  return out;
}

describe('every challenge can settle', () => {
  it('EVERY MP MODE MAPS TO A SESSION MODE SOME HOST ACTUALLY POSTS', () => {
    const posted = postedSessionModes();
    const orphans = MP_MODES
      .map((m) => ({ key: m.key, session: sessionModeFor(m.key) }))
      .filter((x) => !posted.has(x.session))
      .map((x) => `${x.key} → "${x.session}" (no host posts it)`);
    expect(orphans).toEqual([]);
  });

  it('every MP key has an explicit session mapping rather than falling through', () => {
    // sessionModeFor falls back to the raw key, which is how a typo becomes a challenge that looks fine and
    // never matches anything
    const unmapped = MP_MODES.filter((m) => !(m.key in MP_SESSION_MODE)).map((m) => m.key);
    expect(unmapped).toEqual([]);
  });

  it('every listed challenge is a valid one', () => {
    for (const m of MP_MODES) expect(isValidMpMode(m.key), m.key).toBe(true);
  });

  it('labels are human and keys are not', () => {
    for (const m of MP_MODES) {
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.key).toMatch(/^[a-z0-9_-]+$/);
    }
    expect(new Set(MP_MODES.map((m) => m.key)).size).toBe(MP_MODES.length);
  });
});
