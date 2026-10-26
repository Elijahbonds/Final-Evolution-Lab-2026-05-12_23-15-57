// QG-05: plain-language release notes from merged PRs (lib/release/notes.ts).
import { describe, expect, it } from 'vitest';
import { areaOf, buildRelease, cleanTitle, noteFor, parseMergeLog, publicReleases, releaseMarkdown } from './notes';
import data from './releases.json';

const rec = (sha: string, date: string, subject: string, body: string) => `${sha}\u001f${date}\u001f${subject}\u001f${body}\u001e`;

describe('release notes', () => {
  it('reads GitHub merge commits (title = the first body line) and skips other merges', () => {
    const log = rec('a1', '2026-10-25', 'Merge pull request #458 from Elijahbonds/lane/vbt', 'Velocity-based training by camera (pending SQL)\n')
      + rec('b2', '2026-10-25', "Merge remote-tracking branch 'origin/lane/finish-release' into lane/x", '')
      + rec('c3', '2026-10-24', 'Merge pull request #12 from x/y', '\n\nHoops: pulling the stick back now reverses\n');
    expect(parseMergeLog(log)).toEqual([
      { number: 458, title: 'Velocity-based training by camera (pending SQL)', sha: 'a1', mergedAt: '2026-10-25' },
      { number: 12, title: 'Hoops: pulling the stick back now reverses', sha: 'c3', mergedAt: '2026-10-24' },
    ]);
  });

  it('cleans a lane title into a sentence: no lane code, no brackets, nothing after the first ";"', () => {
    expect(cleanTitle('Combine day: coach-run tryout (jump, agility) → ranked report; pending SQL, teen-held')).toBe('Combine day: coach-run tryout to ranked report');
    expect(cleanTitle('RATE-LIMITS (PR #289 rebuilt): login, signup, run start')).toBe('Login, signup, run start');
    expect(cleanTitle('quality-gates QG-04: file-size guard')).toBe('File-size guard');
    expect(cleanTitle('App feel: installable FEL (manifest) + offline service worker (OFF by default)')).toBe('App feel: installable FEL and offline service worker');
    expect(cleanTitle('fight body only for 18+ players')).toBe('Fight body only for 18+ players');
  });

  it("a PR body's What's new: line wins, and What's new: none keeps it off the public page", () => {
    expect(noteFor({ number: 1, title: 'HOOPS-H3 (x): stuff', body: "Summary\nWhat's new: Your teammate now calls for the ball.\n" }))
      .toEqual({ pr: 1, area: 'Games', text: 'Your teammate now calls for the ball.', public: true });
    expect(noteFor({ number: 2, title: 'Coach: camera form review', body: "What's new: none" }).public).toBe(false);
  });

  it('team-only work stays off the public page; player-facing work is on it', () => {
    for (const t of ['Docs: platform roadmap', 'Pin volleyball set to 25', 'Test: fix release red', 'Prisma move, step 1: a parallel client', 'SCREEN-MINOR-LOCK', 'DB guard: apply pending SQL to production'])
      expect(noteFor({ number: 3, title: t }).public, t).toBe(false);
    for (const t of ['Jump tests: SJ, CMJ arms/hips', 'Hoops: pulling the stick back now reverses', 'App feel: installable FEL'])
      expect(noteFor({ number: 4, title: t }).public, t).toBe(true);
  });

  it('files each note under an area by its words', () => {
    expect(areaOf('Coach parity: check-in forms')).toBe('Coaching');
    expect(areaOf('3v3: a tie at the buzzer goes to overtime')).toBe('Games');
    expect(areaOf('Exercise library: muscles on your own avatar')).toBe('Training and body');
    expect(areaOf('Coach payments: 5% and Stripe fee on top')).toBe('Store');
    expect(areaOf('Profile v2: progress-first profile')).toBe('Account and privacy');
    expect(areaOf('Fix the login loop')).toBe('Fixes');
    expect(areaOf('Installable app')).toBe('The app');
  });

  it('builds a release, its owner markdown, and the public view (public notes only, newest first)', () => {
    const r = buildRelease([{ number: 9, title: 'Docs: x' }, { number: 8, title: 'Hoops: a new crossover' }], { date: '2026-10-26', sha: 'f'.repeat(40), fromSha: 'e'.repeat(40) });
    expect(releaseMarkdown(r)).toContain('- Hoops: a new crossover (#8)');
    expect(releaseMarkdown(r)).toContain('(#9) (team only)');
    const older = { ...r, date: '2026-10-01', sha: 'a'.repeat(40) };
    const view = publicReleases([older, r]);
    expect(view.map((v) => v.date)).toEqual(['2026-10-26', '2026-10-01']);
    expect(view[0].areas).toEqual([{ area: 'Games', notes: ['Hoops: a new crossover'] }]);
    expect(publicReleases([{ ...r, notes: r.notes.filter((n) => !n.public) }])).toEqual([]);
  });

  it('the committed releases are well formed: shas, dates, and a public note in each', () => {
    const rs = (data as { releases: Array<{ sha: string; fromSha: string; date: string; deployedAt: string | null; notes: unknown[] }> }).releases;
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(r.fromSha).toMatch(/^[0-9a-f]{40}$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.deployedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(r.deployedAt)).toBe(true);
    }
    expect(publicReleases(rs as never).length).toBe(rs.length);
  });
});
