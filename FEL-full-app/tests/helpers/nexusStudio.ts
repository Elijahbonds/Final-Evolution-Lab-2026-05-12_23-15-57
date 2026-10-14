// Test helpers for Nexus Studio (lib/nexus-studio): an in-memory storage with failure switches, and a venue with one of
// every placeable kind, built the editor's way (from the catalog) so a test exercises what the editor produces.

import { catalogItem, instantiate } from '@/lib/nexus-studio/catalog';
import { newProject, newVenue, type StudioObject, type StudioProject, type StudioVenue, type V3 } from '@/lib/nexus-studio/doc';
import type { KV } from '@/lib/nexus-studio/storage';

export interface MemoryKV extends KV {
  data: Map<string, string>;
  /** throw on the next setItem (a quota error by default) */
  failWrites: false | 'quota' | 'other';
  failReads: boolean;
}

export function memoryKV(): MemoryKV {
  const kv: MemoryKV = {
    data: new Map(),
    failWrites: false,
    failReads: false,
    getItem(k) { if (kv.failReads) throw new Error('SecurityError: access denied'); return kv.data.get(k) ?? null; },
    setItem(k, v) {
      if (kv.failWrites === 'quota') { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      if (kv.failWrites === 'other') throw new Error('SecurityError: blocked');
      kv.data.set(k, v);
    },
    removeItem(k) { kv.data.delete(k); },
  };
  return kv;
}

/** Place a catalog item at `p`, turned `ry`, scaled `s`. */
export function placed(catalogId: string, p: V3, ry = 0, s = 1): StudioObject {
  const item = catalogItem(catalogId);
  if (!item) throw new Error(`no catalog item ${catalogId}`);
  const o = instantiate(item, p, ry);
  o.t.s = s;
  return o;
}

/** A Tiebreak venue with one of every kind (and one hidden prop), as a creator would place them. */
export function everyKindVenue(): StudioVenue {
  const v = newVenue('Every kind', { spec: 'tennis', target: 'tiebreak' }, 'nightGame');
  v.sky = { top: '#0b0f1e', bottom: '#1e1035', fog: '#140c24', sun: '#9ad7ff', ambient: 0.42, fogDensity: 0.004 };
  v.ground = { color: '#1d3b6e', line: '#bfe9ff' };
  v.intro = 'walkIn';
  v.replayAngles = ['low', 'side'];
  v.weather = 'rain';
  const hiddenPalm = placed('kit:nature/tree_palmTall', [-30, 0, 30]);
  hiddenPalm.hidden = true;
  v.objects = [
    placed('spec:banner', [0, 0, -21]),
    placed('kit:nature/tree_palmDetailedTall', [-14, 0, -24], 0.5, 1.6),
    placed('meshy:hoopbus', [-21, 0, 16], 1.1),
    placed('fixture:flood', [-11, 0, -17], 0.6),
    placed('fixture:lamp', [9.6, 0, 0]),
    placed('crowd:bleacher', [-11.5, 0, -3], Math.PI / 2),
    placed('decal:scuff', [0.6, 0, 11.4], 0.3, 1.5),
    placed('camera:subject', [0, 0, 10]),
    hiddenPalm,
  ];
  return v;
}

export function everyKindProject(): StudioProject {
  return newProject('Test project', everyKindVenue(), new Date('2026-10-14T12:00:00Z'));
}
