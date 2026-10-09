// BODY-PLAY-WORKS: a recording committed here is pose numbers only. Never a video, never an image, never a child.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CAPTURE_FIXTURE_FORMAT, captureFixtureProblems, isPictureOrVideo, poseTakeProblems, POSE_TAKE_FORMAT } from './recordingsGuard';
import { CAPTURE_PROTOCOL } from './captureProtocol';

const ROOT = join(__dirname, '../..');
// MIRROR PHASE 3: the owner-led capture's fixtures (lib/mirror/fixtures/captured, gzip) are scanned too.
const ROOTS = ['lib/pose', 'components/dev/pose-recorder', 'public/pose', 'lib/mirror/fixtures/captured'];
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
        // a captured session is gzip: read it whole, whatever its size (it is exactly what must be checked)
        const gz = rel.endsWith('.gz');
        if (!gz && statSync(file).size > 8_000_000) continue;
        const text = gz ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8');
        if (DATA_MEDIA.test(text)) embedded.push(rel);
        if (rel.endsWith('.json') && text.includes(POSE_TAKE_FORMAT)) {
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { badTakes.push(`${rel}: not json`); continue; }
          const problems = poseTakeProblems(parsed);
          if (problems.length) badTakes.push(`${rel}: ${problems.join('; ')}`);
        }
        if (/\.json(\.gz)?$/.test(rel) && text.includes(CAPTURE_FIXTURE_FORMAT)) {
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { badTakes.push(`${rel}: not json`); continue; }
          const problems = captureFixtureProblems(parsed);
          if (problems.length) badTakes.push(`${rel}: ${problems.join('; ')}`);
        } else if (gz) badTakes.push(`${rel}: a gzip file in a pose tree that is not a capture fixture`);
      }
    }
    expect(found).toEqual([]);
    expect(embedded).toEqual([]);
    expect(badTakes).toEqual([]);
  });
});

// MIRROR PHASE 3 (2026-10-07): the owner-led capture. The owner and two adults, two phones, numbers only, never video,
// no minors. A capture file carries an alias (never a name), the phone, and the two statements; the fixture the ingest
// writes carries no free text at all.
describe('the owner-led capture: numbers only, adults only, an alias', () => {
  const meta = { protocol: CAPTURE_PROTOCOL, person: 'P2', device: 'iphone', adult: true, consent: true };
  const take = { id: 'squat.good', frames: [{ t: 0, present: true, image: [{ x: 0.5, y: 0.2, z: 0, v: 1 }] }] };
  const file = { format: POSE_TAKE_FORMAT, origin: 'owner-capture', child: false, notes: '', capture: meta, takes: [take] };

  it('a capture file of numbers, an alias and both statements passes', () => {
    expect(poseTakeProblems(file)).toEqual([]);
  });

  it('a name instead of an alias, an unknown phone, or a missing statement is refused', () => {
    expect(poseTakeProblems({ ...file, capture: { ...meta, person: 'Jordan' } }).join()).toMatch(/alias/);
    expect(poseTakeProblems({ ...file, capture: { ...meta, device: 'pixel-9' } }).join()).toMatch(/device/);
    expect(poseTakeProblems({ ...file, capture: { ...meta, consent: false } }).join()).toMatch(/consent/);
    expect(poseTakeProblems({ ...file, capture: { ...meta, protocol: 'other' } }).join()).toMatch(/protocol/);
  });

  it('a minor: a capture not stated as adults only, or marked as a child, is refused', () => {
    expect(poseTakeProblems({ ...file, capture: { ...meta, adult: false } }).join()).toMatch(/adults only, no minors/);
    expect(poseTakeProblems({ ...file, capture: { ...meta, adult: undefined } }).join()).toMatch(/adults only/);
    expect(poseTakeProblems({ ...file, child: true }).join()).toMatch(/child must be false/);
  });

  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);
  const fixture = {
    format: CAPTURE_FIXTURE_FORMAT, origin: 'owner-capture', child: false, capture: meta, device: 'Safari 18.0 · iOS', model: 'pose_landmarker_lite/float16/1',
    recordedOn: '2026-10-09',
    takes: [{ id: 'squat.good', movement: 'squat', label: 'good', view: 'front', reps: 5, video: { width: 480, height: 640 }, clock: 'capture', detectFps: 30, inferMs: 9, highRate: false, goT: 3000, frames: [{ t: 0, lm }, { t: 33.3, lm: [] }] }],
  };

  it('an ingested fixture of rows of numbers passes', () => {
    expect(captureFixtureProblems(fixture)).toEqual([]);
  });

  it('a fixture with any free text, a picture, a non-number or a child is refused', () => {
    expect(captureFixtureProblems({ ...fixture, notes: 'with Jordan' }).join()).toMatch(/unexpected key notes/);
    expect(captureFixtureProblems({ ...fixture, takes: [{ ...fixture.takes[0], who: 'Jordan' }] }).join()).toMatch(/unexpected take key who/);
    expect(captureFixtureProblems({ ...fixture, takes: [{ ...fixture.takes[0], frames: [{ t: 0, lm, jpeg: 'x' }] }] }).join()).toMatch(/unexpected frame key jpeg/);
    expect(captureFixtureProblems({ ...fixture, model: 'data:image/png;base64,AAAA' }).join()).toMatch(/embedded image or video/);
    expect(captureFixtureProblems({ ...fixture, takes: [{ ...fixture.takes[0], frames: [{ t: 0, lm: [[0.5, 'left', 0, 1]] }] }] }).join()).toMatch(/not 4 numbers/);
    expect(captureFixtureProblems({ ...fixture, child: true }).join()).toMatch(/child must be false/);
    expect(captureFixtureProblems({ ...fixture, capture: { ...meta, adult: false } }).join()).toMatch(/adults only/);
    expect(captureFixtureProblems({ ...fixture, origin: 'phone-video' }).join()).toMatch(/origin/);
  });
});
