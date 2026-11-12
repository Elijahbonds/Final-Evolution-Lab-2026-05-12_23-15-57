// COACH-LIVE (2026-10-25): what a live session can never do, pinned on the source. Recording is off and nothing is stored
// but the summary; never ranked or paid; the camera picture is shown only through SelfView; a minor's camera never
// reaches the link.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const ROOTS = ['lib/coach/live', 'components/coach/live', 'app/coach/live', 'app/api/coach/live'];
function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs).flatMap((n) => {
    const rel = path.join(dir, n);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : [];
  });
}
const ALL = ROOTS.flatMap(files);
const read = (rel: string) => stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));

describe('a live session', () => {
  it('the scan reaches every live file', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(15);
    for (const f of ['lib/coach/live/link.ts', 'components/coach/live/client-live.tsx', 'components/coach/live/coach-live.tsx', 'app/api/coach/live/signal/route.ts']) {
      expect(ALL).toContain(f);
    }
  });

  it.each(ALL)('%s records nothing and keeps nothing on the device', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/MediaRecorder|captureStream|recordRTC|\.toDataURL\s*\(|\.toBlob\s*\(|getImageData/);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it.each(ALL)('%s is never ranked or paid', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/\/api\/sessions|\/api\/wallet|\bstake|ladder|leaderboard|checkout|stripe|coins?\b/i);
  });

  it('the only database write is the summary\'s one thread message', () => {
    const writes = ALL.flatMap((rel) => [...read(rel).matchAll(/\b(?:db|prisma)\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|\$executeRaw\w*)\s*\(/g)].map((m) => `${rel}:${m[1]}`));
    expect(writes).toEqual(['lib/coach/live/server.ts:create']);
    expect(read('lib/coach/live/server.ts')).toContain('db.programMessage.create({ data: { programId, authorId: door.coachId, body: text } })');
  });

  it('the camera picture is shown only through SelfView; the coach\'s page never touches the pose service', () => {
    for (const rel of ALL) expect(read(rel), rel).not.toMatch(/\.showIn\(/);
    expect(read('components/coach/live/client-live.tsx')).toContain('<SelfView');
    for (const rel of ['components/coach/live/coach-live.tsx', 'components/coach/live/pose-stage.tsx']) expect(read(rel)).not.toMatch(/poseService|PoseService/);
  });

  it('a client\'s camera video goes to the link only when the door allowed it AND they chose it', () => {
    const src = read('components/coach/live/client-live.tsx');
    expect(src).toContain('if (join.clientVideo && wantVideo) {');
    expect([...src.matchAll(/getUserMedia\(\{ video:/g)]).toHaveLength(1);
    expect(src.indexOf('getUserMedia({ video:')).toBeGreaterThan(src.indexOf('if (join.clientVideo && wantVideo) {'));
    expect(read('lib/coach/live/gate.ts')).toContain("clientVideo: band === 'adult' && input.clientVerifiedAdult");
  });

  it('the coach sends a cue by its key; the client shows only a preset\'s words', () => {
    expect(read('components/coach/live/coach-live.tsx')).toContain("sendCtl({ t: 'cue', id, key })");
    expect(read('components/coach/live/client-live.tsx')).toContain('const text = cueText(m.key);');
  });
});
