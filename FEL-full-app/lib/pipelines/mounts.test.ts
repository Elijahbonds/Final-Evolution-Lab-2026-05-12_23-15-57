// PIPELINES (owner, 2026-10-06): the soundtrack hooks lane/soundtrack exported are mounted where they belong. Source
// pins (the hosts need a browser and a GPU to run), each tied to the call that matters, plus the focus behaviour itself.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MusicFocus } from '@/lib/soundtrack/focus';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const body = (s: string, from: string, len = 1200) => s.slice(s.indexOf(from), s.indexOf(from) + len);

describe('soundtrack hook mounts', () => {
  it('boot-splash: useSoundtrackStage(props.phase) is the first line of BootSplash', () => {
    const s = src('components/games/boot-splash.tsx');
    expect(body(s, 'export function BootSplash(', 120)).toMatch(/\{\s*\n\s*useSoundtrackStage\(props\.phase\);/);
  });
  it('ModeHarness: enterBed() where the ambient bed starts (first input), exitBed() on teardown', () => {
    const s = src('lib/babylon/core/ModeHarness.ts');
    // INTEGRATION (2026-10-06): lane/ambient-fix renamed the harness's call to startVenueAmbient (the mood bed only over
    // a mode that chose none); enterBed() still follows it on the next line.
    expect(body(s, 'function firstInput(): void {', 600))
      .toMatch(/SoundKit\.(?:startAmbient|startVenueAmbient)\(bed\);[^\n]*\n\s*enterBed\(\);/);
    expect(s).toMatch(/SoundKit\.stopAmbient\(\);[^\n]*\n\s*exitBed\(\);/);
  });
  it('Dance claims music focus with the room and releases it on dispose; the Academy claims it while mounted', () => {
    const d = src('lib/babylon/modes/DanceMode.ts');
    expect(d).toMatch(/releaseSession = claimPlaybackSession\(\);\s*\n\s*releaseFocus\?\.\(\); releaseFocus = claimMusicFocus\('dance'\);/);
    expect(d).toMatch(/releaseSession\?\.\(\); releaseSession = null;[^\n]*\n\s*releaseFocus\?\.\(\); releaseFocus = null;/);
    expect(src('lib/babylon/music/StudioMode.tsx')).toMatch(/useEffect\(\(\) => claimMusicFocus\('academy'\), \[\]\);/);
  });
  it('a claim holds the soundtrack back until released (the behaviour the mounts rely on)', () => {
    const f = new MusicFocus();
    const seen: number[] = [];
    f.subscribe(() => seen.push(f.count));
    const release = f.claim('dance');
    expect(f.count).toBe(1);
    release(); release();   // releasing twice is harmless
    expect(f.count).toBe(0);
    expect(seen).toEqual([1, 0]);
  });
});
