// What an arena's walls and floor are drawn with (lane/vis-combat, 2026-10-13): every arena has a look, every look paints.
import { describe, expect, it } from 'vitest';
import { COMBAT_ARENAS } from './arenas';
import {
  FLOOR_HAS_EMISSIVE, FLOOR_STYLE_OF, WALL_HAS_EMISSIVE, WALL_STYLE_OF, WALL_TILE_M, floorStyleOf, paintFloor, paintWall, rgba, shade, wallStyleOf,
  type FloorStyle, type WallStyle,
} from './arenaPaint';
import { allFinite, recordingCtx } from './canvasShim.test-helper';

describe('arena wall and floor styles', () => {
  it('every combat arena names a wall style and a floor style', () => {
    for (const a of COMBAT_ARENAS) {
      expect(WALL_STYLE_OF[a.id], `${a.id} has no wall style`).toBeTruthy();
      expect(FLOOR_STYLE_OF[a.id], `${a.id} has no floor style`).toBeTruthy();
    }
  });
  it('a rope arena is ropes (no slab to paint), a walled one is something to paint', () => {
    for (const a of COMBAT_ARENAS) {
      if (a.edge === 'ropes') expect(wallStyleOf(a)).toBe('ropes');
      if (a.edge === 'wall') expect(['plaster', 'stone', 'steel', 'rock']).toContain(wallStyleOf(a));
    }
  });
  it('a style the arena does not know falls back to something paintable', () => {
    const odd = { ...COMBAT_ARENAS[0], id: 'nowhere', edge: 'wall' as const };
    expect(wallStyleOf(odd)).toBe('plaster');
    expect(floorStyleOf(odd)).toBeNull();
  });
  it('the tile is a sensible size: a few metres, so it neither blurs nor shimmers', () => {
    expect(WALL_TILE_M).toBeGreaterThan(2); expect(WALL_TILE_M).toBeLessThan(5);
  });
});

describe('the wall painters', () => {
  const styles: WallStyle[] = ['plaster', 'stone', 'steel', 'billboard', 'rock'];
  for (const st of styles) {
    it(`${st} paints a full tile, finitely`, () => {
      const c = recordingCtx();
      expect(paintWall(c, 512, st, '#a89b88', '#ff2d55')).toBe(true);
      expect(c.calls.some((k) => k.fn === 'fillRect')).toBe(true);
      expect(allFinite(c.calls)).toBe(true);
    });
    it(`${st}: it has an emissive pass exactly when it is listed as glowing`, () => {
      const c = recordingCtx();
      expect(paintWall(c, 512, st, '#a89b88', '#ff2d55', true)).toBe(WALL_HAS_EMISSIVE.has(st));
    });
  }
  it('ropes have no painted tile', () => {
    expect(paintWall(recordingCtx(), 512, 'ropes', '#fff', '#fff')).toBe(false);
  });
  it('the dojo wall is built from the arena\'s own colour, the foundry\'s hazard band from its accent', () => {
    const a = recordingCtx(); paintWall(a, 512, 'plaster', '#a89b88', '#ff2d55');
    expect(JSON.stringify(a.calls)).toContain('rgba(255,45,85');   // the mon, in the accent
    const b = recordingCtx(); paintWall(b, 512, 'steel', '#3a3b40', '#ff7b3d');
    expect(b.calls.some((k) => k.fn === 'clip')).toBe(true);        // the hazard band is clipped to the foot
  });
});

describe('the floor painters', () => {
  for (const a of COMBAT_ARENAS) {
    const fs = floorStyleOf(a) as FloorStyle;
    const w = 1024, h = a.shape.kind === 'box' ? Math.round((1024 * a.shape.halfZ) / a.shape.halfX) : 1024;
    it(`${a.id}: the ${fs} overlay paints, on a canvas at the arena's own aspect`, () => {
      const c = recordingCtx();
      paintFloor(c, fs, { accent: a.look.accent, wall: a.look.wallColor, w, h, disc: a.shape.kind === 'disc' });
      expect(c.calls.some((k) => ['stroke', 'fill', 'fillText', 'strokeRect'].includes(k.fn))).toBe(true);
      expect(allFinite(c.calls)).toBe(true);
      expect(h / w).toBeCloseTo(a.shape.kind === 'box' ? a.shape.halfZ / a.shape.halfX : 1, 2);
    });
    it(`${a.id}: an emissive pass is painted exactly for the glowing styles`, () => {
      const c = recordingCtx();
      paintFloor(c, fs, { accent: a.look.accent, wall: a.look.wallColor, w, h, disc: a.shape.kind === 'disc' }, true);
      const drew = c.calls.some((k) => ['stroke', 'strokeRect', 'fillRect'].includes(k.fn));
      expect(drew && c.calls.some((k) => k.fn === 'stroke')).toBe(FLOOR_HAS_EMISSIVE.has(fs));
    });
  }
});

describe('colour helpers', () => {
  it('shade darkens below 1 and lightens above it, and keeps bytes in range', () => {
    expect(shade('#808080', 0.5)).toBe('rgb(64,64,64)');
    expect(shade('#808080', 2)).toBe('rgb(255,255,255)');
    expect(shade('#ff0000', 1.5)).toMatch(/^rgb\(255,\d+,\d+\)$/);
    expect(shade('#fff', 1)).toBe('rgb(255,255,255)');
  });
  it('rgba reads a short hex too', () => {
    expect(rgba('#f00', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(rgba('#22d3ee', 1)).toBe('rgba(34,211,238,1)');
  });
});
