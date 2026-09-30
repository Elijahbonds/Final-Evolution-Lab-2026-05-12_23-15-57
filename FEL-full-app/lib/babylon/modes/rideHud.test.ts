// SKATE-SCORE (GC-13, 2026-09-29): a body riding skate or the kart is told a body's words, never the pad's, and the ring's
// gamepad puck is off while it rides; a pad, the keys and touch keep exactly what they had.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  skateHudWords, kartHudWords, setRingGlyph, RideHudSwitch, RING_GLYPH_MESH, PAD_BOOST_HINT,
  SKATE_PAD_HINT, KART_PAD_HINT, KART_PAD_START_HINT, type GlyphMesh,
} from './rideHud';

/** Words that only mean something on a pad or a keyboard, said as an instruction. */
const PAD_ONLY = [/HOLD RB/i, /\bShift\b/, /\bB to\b/, /\bRT\b/, /\bX drift\b/i, /\bA fires\b/i, /THROTTLE DOWN/i, /hold forward/i];

describe('GC-13: a body is told a body\'s words', () => {
  it('skate: carve STEER, crouch PUMP, hop POP, hand to edge GRAB, shoulder quarter-turn SPIN, kick-push PUSH', () => {
    const w = skateHudWords(true);
    for (const verb of [/Carve to STEER/, /crouch to PUMP/, /hop to POP/, /hand to the board edge GRABS/, /shoulder quarter-turn SPINS/, /kick-push to PUSH/]) expect(w.hint).toMatch(verb);
    for (const pad of PAD_ONLY) { expect(w.hint).not.toMatch(pad); expect(w.boostHint).not.toMatch(pad); }
    expect(w.hint).toMatch(/BOOST on pad \/ touch/);   // the boost stays on the pad by design, and says so
    expect(w.boostHint).toMatch(/PAD \/ TOUCH/);
  });
  it('kart: grip GAS, turn STEER, hop into the turn DRIFT; the boost (RB) and the items (A) labelled pad / touch', () => {
    for (const started of [true, false]) {
      const w = kartHudWords(true, started);
      for (const pad of PAD_ONLY) { expect(w.hint).not.toMatch(pad); expect(w.boostHint).not.toMatch(pad); }
      expect(w.boostHint).toMatch(/PAD \/ TOUCH/);
    }
    const race = kartHudWords(true, true).hint;
    for (const verb of [/Grip the wheel for GAS/, /turn it to STEER/, /hop into the turn to DRIFT/, /BOOST \(RB\) and ITEMS \(A\) on pad \/ touch/]) expect(race).toMatch(verb);
    expect(kartHudWords(true, false).hint).toMatch(/GRIP THE WHEEL ON "2"/);
  });
});

describe('GC-13: a pad, the keys and touch keep exactly what they had', () => {
  it('skate says the words SkateRunMode said at the parent, and the gauge its own default', () => {
    expect(skateHudWords(false)).toEqual({ hint: 'HOLD FORWARD to push · POP to ollie · B to MANUAL · GRIND the rails · hold RB / Shift to BOOST', boostHint: 'HOLD RB · SHIFT' });
    const gauge = readFileSync(path.join(__dirname, '../../../components/games/boost-hud.tsx'), 'utf8');
    expect(gauge).toContain(`: '${PAD_BOOST_HINT}'}`);   // boost-hud's default line when no mode sets one
  });
  it('the kart\'s pad words are the ones VelocityKartMode said at the parent (26bec0cc), before and after GO', () => {
    expect(KART_PAD_HINT).toBe('RT throttle · X drift to fill BOOST · hold RB / Shift to burn it · A fires your item');
    expect(KART_PAD_START_HINT).toBe('THROTTLE DOWN ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS');
    // until the routed GC-13 wiring lands (movement-play holds the kart) the mode says them itself; after, it asks rideHud
    const kart = readFileSync(path.join(__dirname, 'VelocityKartMode.ts'), 'utf8');
    const saysThem = kart.includes(`'${KART_PAD_HINT}'`) && kart.includes(`'${KART_PAD_START_HINT}'`);
    expect(saysThem || /kartHudWords\(!!\(ctx\.body\?\.\(\) \?\? null\), S\.start\.go\)/.test(kart)).toBe(true);
    expect(kartHudWords(false, true)).toEqual({ hint: KART_PAD_HINT, boostHint: PAD_BOOST_HINT });
    expect(kartHudWords(false, false)).toEqual({ hint: KART_PAD_START_HINT, boostHint: PAD_BOOST_HINT });
    expect(SKATE_PAD_HINT).not.toBe(skateHudWords(true).hint);
  });
});

describe('GC-13: the ring\'s glyph puck', () => {
  const mesh = (name: string, on = true): GlyphMesh & { on: boolean } => {
    const m = { name, on, isEnabled: () => m.on, setEnabled: (v: boolean) => { m.on = v; } };
    return m;
  };
  it('off for a body and back for a pad; only the puck — the ring (the boost tank) and everything else untouched', () => {
    const tag = mesh(RING_GLYPH_MESH), ring = mesh('player_ring'), other = mesh('coin');
    const all = [tag, ring, other];
    expect(setRingGlyph(all, false)).toBe(1);
    expect([tag.on, ring.on, other.on]).toEqual([false, true, true]);
    expect(setRingGlyph(all, false)).toBe(0);   // idempotent
    expect(setRingGlyph(all, true)).toBe(1);
    expect(tag.on).toBe(true);
  });
  it('the switch answers once per change of rider, and re-asserts the puck once a second while a body rides', () => {
    const sw = new RideHudSwitch();
    expect(sw.next(false)).toBe(false);   // the first frame always answers (the pad's words)
    expect(sw.next(false)).toBeNull();
    expect(sw.next(true)).toBe(true);
    expect(sw.isBody).toBe(true);
    expect(sw.next(true)).toBeNull();
    let due = 0;
    for (let i = 0; i < 150; i++) if (sw.glyphDue(1 / 60)) due++;
    expect(due).toBe(2);   // 2.5 s of frames
    expect(sw.next(false)).toBe(false);
    expect(sw.isBody).toBe(false);
  });
  it('the ring\'s puck is the mesh the harness mounts under that name (visual/PlayerRing)', () => {
    const ring = readFileSync(path.join(__dirname, '../visual/PlayerRing.ts'), 'utf8');
    expect(ring).toContain(`MeshBuilder.CreatePlane('${RING_GLYPH_MESH}'`);
  });
});

describe('GC-13 wiring: VelocityKartMode says the words of whoever drives (source scan)', () => {
  const src = readFileSync(path.join(__dirname, 'VelocityKartMode.ts'), 'utf8');
  it('the hint and the boost line come from rideHud, and the puck switches with the body', () => {
    expect(src).toMatch(/const words = kartHudWords\(!!\(ctx\.body\?\.\(\) \?\? null\), S\.start\.go\);/);
    expect(src).toMatch(/hint: words\.hint,/);
    expect(src).toMatch(/boostHint: words\.boostHint,/);
    expect(src).toMatch(/const sw = hudSwitch\.next\(!!\(ctx\.body\?\.\(\) \?\? null\)\);\s*if \(sw !== null\) setRingGlyph\(ctx\.scene\.meshes, !sw\);/);
    expect(src).toMatch(/hudSwitch\.reset\(\);/);
    expect(src).not.toContain('hold RB / Shift to burn it');   // the pad's words live in rideHud only
  });
});

describe('GC-13 wiring: SkateRunMode says the words of whoever rides (source scan)', () => {
  const src = readFileSync(path.join(__dirname, 'SkateRunMode.ts'), 'utf8');
  it('switches the HUD and the puck on the body, and starts on the pad\'s words', () => {
    expect(src).toMatch(/const sw = hudSwitch\.next\(!!\(ctx\.body\?\.\(\) \?\? null\)\);/);
    expect(src).toMatch(/if \(sw !== null\) \{ ctx\.setHud\(\{ \.\.\.skateHudWords\(sw\) \}\); setRingGlyph\(ctx\.scene\.meshes, !sw\); \}/);
    expect(src).toMatch(/\.\.\.skateHudWords\(false\) \}\);/);
    expect(src).not.toContain('hold RB / Shift to BOOST');   // the pad's words live in rideHud only
  });
});
