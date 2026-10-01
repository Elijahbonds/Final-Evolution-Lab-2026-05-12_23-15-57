// BODY-PLAY-WORKS: a recording committed here is pose numbers only. Never a video, never an image, never a child.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPictureOrVideo, poseTakeProblems, POSE_TAKE_FORMAT } from './recordingsGuard';

const ROOT = join(__dirname, '../..');
const ROOTS = ['lib/pose', 'components/dev/pose-recorder', 'public/pose'];
const DATA_MEDIA = /data:(?:image|video)\//i;

function filesUnder(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!statSafe(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (!/\.test\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}
const statSafe = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };

describe('committed motion is pose numbers only', () => {
  it('a synthetic take of numbers passes, and a picture, a video or a child does not', () => {
    const good = {
      format: POSE_TAKE_FORMAT,
      origin: 'synthetic',
      child: false,
      notes: 'A scripted windmill. No person was recorded.',
      takes: [{ frames: [{ image: [{ x: 0.5, y: 0.2, z: 0, v: 1 }], world: [{ x: 0, y: 0, z: 0 }] }] }],
    };
    expect(poseTakeProblems(good)).toEqual([]);
    expect(poseTakeProblems({ ...good, origin: 'game-clip' })).toEqual([]);
    expect(poseTakeProblems({ ...good, origin: 'owner-capture' })).toEqual([]);
    expect(poseTakeProblems({ ...good, origin: 'phone-video' })).toContain('origin must be synthetic, game-clip, owner-capture');
    expect(poseTakeProblems({ ...good, child: true }).some((p) => p.includes('child'))).toBe(true);
    expect(poseTakeProblems({ ...good, notes: 'my child jumping' })).toContain('notes name a child');
    expect(poseTakeProblems({ ...good, shot: 'data:image/png;base64,aaaa' })).toContain('embedded image or video');
    expect(poseTakeProblems({ ...good, takes: [{ frames: [{ image: [{ x: 'left' }] }] }] }).some((p) => p.includes('not a number'))).toBe(true);
    expect(isPictureOrVideo('take.webm')).toBe(true);
    expect(isPictureOrVideo('take.PNG')).toBe(true);
    expect(isPictureOrVideo('take.json')).toBe(false);
    expect(isPictureOrVideo('pose_landmarker_full.task')).toBe(false);
  });

  it('the pose trees hold no picture or video, and no take file of a child', () => {
    const found: string[] = [];
    const badTakes: string[] = [];
    const embedded: string[] = [];
    for (const dir of ROOTS) {
      for (const file of filesUnder(dir)) {
        const rel = relative(ROOT, file);
        if (isPictureOrVideo(rel)) found.push(rel);
        if (/\.(task|wasm|js)$/i.test(rel)) continue;
        if (statSync(file).size > 8_000_000) continue;
        const text = readFileSync(file, 'utf8');
        if (DATA_MEDIA.test(text)) embedded.push(rel);
        if (rel.endsWith('.json') && text.includes(POSE_TAKE_FORMAT)) {
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { badTakes.push(`${rel}: not json`); continue; }
          const problems = poseTakeProblems(parsed);
          if (problems.length) badTakes.push(`${rel}: ${problems.join('; ')}`);
        }
      }
    }
    expect(found).toEqual([]);
    expect(embedded).toEqual([]);
    expect(badTakes).toEqual([]);
  });
});
