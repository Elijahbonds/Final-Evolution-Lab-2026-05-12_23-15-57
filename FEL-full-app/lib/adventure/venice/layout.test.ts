// lane/venice-hub (2026-11-12): the Venice hub layout holds together — every cell has one district, every spot stands in
// its own district, every shelf mode has exactly one home (a Venice spot or a zone), every route a spot opens exists.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FAMILIES } from '@/lib/nav/families';
import {
  DISTRICTS, HUB_COLS, HUB_ROWS, PIECE_M, SPOTS, ZONES, cellAt, cellRect, districtAt, districtById, hubHome, spotAt, tiersAround,
} from './layout';

const SHELF = FAMILIES.flatMap((f) => f.modes);

describe('venice hub layout', () => {
  it('covers every hub cell with exactly one district', () => {
    const seen = new Map<string, string>();
    for (const d of DISTRICTS) for (const [i, j] of d.cells) {
      expect(i >= 0 && i < HUB_COLS && j >= 0 && j < HUB_ROWS, `${d.id} cell ${i},${j} off the grid`).toBe(true);
      expect(seen.get(`${i},${j}`), `cell ${i},${j} in ${seen.get(`${i},${j}`)} and ${d.id}`).toBeUndefined();
      seen.set(`${i},${j}`, d.id);
    }
    expect(seen.size).toBe(HUB_COLS * HUB_ROWS);
  });

  it('puts every spot inside its own district', () => {
    for (const s of SPOTS) {
      expect(districtById(s.district), `${s.id}: no district ${s.district}`).toBeDefined();
      expect(districtAt(s.at[0], s.at[1])?.id, `${s.id} stands outside ${s.district}`).toBe(s.district);
    }
  });

  it('gives every shelf mode exactly one home: a Venice spot or a zone', () => {
    const homes = new Map<string, string>();
    const add = (k: string, where: string) => { expect(homes.get(k), `${k} homed twice: ${homes.get(k)} and ${where}`).toBeUndefined(); homes.set(k, where); };
    for (const s of SPOTS) for (const m of s.modes) add(m, `spot ${s.id}`);
    for (const z of ZONES) for (const m of z.homes) add(m, `zone ${z.id}`);
    for (const k of SHELF) expect(homes.has(k), `${k} has no home`).toBe(true);
    for (const k of homes.keys()) expect(SHELF, `${k} is not a shelf mode`).toContain(k);
  });

  it('only names shelf modes as a zone\'s extra spots, never its own homes again', () => {
    for (const z of ZONES) for (const m of z.extraSpots) { expect(SHELF).toContain(m); expect(z.homes).not.toContain(m); }
  });

  it('opens only routes that exist', () => {
    const app = resolve(__dirname, '../../../app');
    for (const s of SPOTS) {
      if (!s.route) continue;
      const dir = s.route === '/train' ? resolve(app, 'train') : resolve(app, s.route.replace(/^\//, ''));
      expect(existsSync(dir), `${s.id}: ${s.route} has no page`).toBe(true);
    }
  });

  it('points every zone door at a district and every door spot at a zone', () => {
    const ids = new Set(ZONES.map((z) => z.id));
    for (const z of ZONES) expect(districtById(z.door), `${z.id} door ${z.door}`).toBeDefined();
    for (const s of SPOTS) if (s.zone) expect(s.zone === '*' || ids.has(s.zone), `${s.id} → ${s.zone}`).toBe(true);
  });

  it('builds the hoops park first, and V1 starts the player at the courts', () => {
    expect(DISTRICTS.filter((d) => d.phase === 'V1').map((d) => d.id)).toEqual(['courts']);
    expect(hubHome('V1').district).toBe('courts');
    expect(hubHome('V3').district).toBe('plaza');
    const courts = SPOTS.filter((s) => s.district === 'courts').flatMap((s) => s.modes);
    for (const m of ['hoops1v1', 'hoops3v3']) expect(courts).toContain(m);
  });

  it('finds the walk-up spot under the player, and nothing between spots', () => {
    const run = SPOTS.find((s) => s.id === 'court.run')!;
    expect(spotAt(run.at[0] + 1, run.at[1] - 1)?.id).toBe('court.run');
    expect(spotAt(-44, -70)).toBeNull();   // the walk between the four courts
  });

  it('maps cells and metres both ways', () => {
    for (let j = 0; j < HUB_ROWS; j++) for (let i = 0; i < HUB_COLS; i++) {
      const r = cellRect(i, j);
      expect(r.maxX - r.minX).toBe(PIECE_M);
      expect(cellAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)).toEqual([i, j]);
    }
    expect(cellAt(10_000, 0)).toBeNull();
  });

  it('streams 9 cells full and the next ring at low detail around the player', () => {
    const t = tiersAround(-40, -100);   // between courts 1 and 2: cell (1, 2)
    const n = (k: string) => [...t.values()].filter((v) => v === k).length;
    expect(n('full')).toBe(9);
    expect(n('full') + n('lod') + n('far')).toBe(HUB_COLS * HUB_ROWS);
    expect(t.get('1,2')).toBe('full');
    expect(t.get('4,7')).toBe('far');
  });

  it('keeps every name a placeholder until the owner names it', () => {
    for (const d of DISTRICTS) expect(d.name.startsWith('[PLACEHOLDER]'), d.id).toBe(true);
    for (const s of SPOTS) expect(s.label.startsWith('[PLACEHOLDER]'), s.id).toBe(true);
    for (const z of ZONES) expect(z.name.startsWith('[PLACEHOLDER]'), z.id).toBe(true);
  });
});
