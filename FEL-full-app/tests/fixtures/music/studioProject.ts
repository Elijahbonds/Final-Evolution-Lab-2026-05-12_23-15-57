// MUSIC-SUITE P3 (2026-09-25): a representative Academy project for StudioProject.test.ts and studioStore.test.ts.
// Lives under tests/ (not lib/): support for the tests, not app code — vitest collects *.test.ts only, and lib/nav/modules.test.ts
// counts lib/ modules nothing in the app imports.
import { emptyKitTracks, newProject, withFlipHit, withFlipRow, type ProjectFlipRow, type StudioProject } from '@/lib/babylon/music/StudioProject';
import { PAD_COUNT } from '@/lib/babylon/music/Flip';

export const NOW = Date.UTC(2026, 8, 25, 17, 40);
export const steps = (on: number[]): boolean[] => Array.from({ length: 16 }, (_, i) => on.includes(i));
export const ref = (key: string, bytes = 1000) => ({ key, mime: 'audio/webm', bytes });

/** The P1 probe's beat (14 lit cells: kick 1/5/9/13, snare 5/13, hats on the eighths), two sections at their own swing,
 *  a chain, two takes, an own-recording Flip source with edited chops, a row sent from it, MASTER on, a remix credit. */
export function representativeProject(): StudioProject {
  const p = newProject({ now: NOW, id: 'prj_test0001', title: 'Late Night Loop', kit: 'neon', bpm: 104, swing: 0.22 });
  p.tracks = p.tracks.map((t) =>
    t.sampleId === 'kick' ? { ...t, pattern: steps([0, 4, 8, 12]) }
      : t.sampleId === 'snare' ? { ...t, pattern: steps([4, 12]), volume: 0.7, pan: -0.2 }
        : t.sampleId === 'hat' ? { ...t, pattern: steps([0, 2, 4, 6, 8, 10, 12, 14]), muted: true }
          : t);
  const verse = { id: 'verse_a1', name: 'verse', tracks: p.tracks.map((t) => ({ ...t, pattern: [...t.pattern] })), swing: 0 };
  const hook = { id: 'hook_b2', name: 'hook', tracks: emptyKitTracks().map((t) => (t.sampleId === 'kick' ? { ...t, pattern: steps([0, 8]) } : t)), swing: 0.4 };
  p.sections = [verse, hook];
  p.chain = [{ sectionId: 'verse_a1', bars: 2 }, { sectionId: 'hook_b2', bars: 4 }, { sectionId: 'verse_a1', bars: 1 }];
  p.takes = [
    { id: 't1', atBar: 0, gain: 0.9, durationSec: 5.2, audio: ref('aud_mfz1abcd1234', 42_000) },
    { id: 't2', atBar: 3, gain: 1.1, durationSec: 2.5, audio: ref('aud_mfz1abcd5678', 20_000) },
  ];
  const source = { id: 'mic_1', label: 'mic take', kind: 'own' as const, note: 'Recorded in the room.', audio: ref('aud_mfz1abcd9999', 60_000) };
  p.flip = {
    source, slicing: 'grid', gridN: 6,
    chops: Array.from({ length: PAD_COUNT }, (_, i) => ({ slice: i < 6 ? { start: i * 1000, end: (i + 1) * 1000 } : null, pitch: i === 1 ? -5 : 0, reverse: i === 2, gate: i !== 3 })),
  };
  const row: ProjectFlipRow = { sampleId: 'flip_1', pad: 1, label: 'FLIP 2', source, slice: { start: 1000, end: 2000 }, reverse: false, pitch: -5, gate: true };
  const withRow = withFlipHit(withFlipHit(withFlipRow(p, row), 'flip_1', 3), 'flip_1', 11);
  return { ...withRow, mixer: { polish: true, channels: {} }, remixOf: { id: 'trk_1', title: 'Original', authorName: 'Okta' } };
}

