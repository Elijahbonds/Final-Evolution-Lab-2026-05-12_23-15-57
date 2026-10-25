// LIBRARY-ANATOMY-2 (owner, 2026-10-25): the coach catalogue's knowledge-base rows show the library's stage where the
// library has the exercise by name, and the cue card otherwise — through the REAL GET /api/coach/catalogue, the real
// library files and the real matcher. Only the session and the database are stand-ins (the review tables answer nothing:
// the files are the library, as on a database that has not had them yet).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'coach' as string, dobYear: null as number | null }));
const KB = [
  { id: 'kb-croc', slug: 'crocodile-breathing', name: 'Crocodile Breathing', published: true, category: { id: 'c1', name: 'Breath & Pressure' }, videoUrl: '' },
  { id: 'kb-pogo', slug: 'single-leg-pogos', name: 'Single-Leg Pogo Hops', published: true, category: { id: 'c2', name: 'Oscillatory Drills' }, videoUrl: '' },
  { id: 'kb-audit', slug: 'aston-audit', name: 'Aston Postural Audit', published: true, category: { id: 'c3', name: 'Postural Audit' }, videoUrl: '' },
];
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    exercise: { findMany: async () => KB },
    exerciseCategory: { findMany: async () => [] },
    user: { findUnique: async () => ({ role: m.role, dobYear: m.dobYear }) },
    facilitatorProfile: { findUnique: async () => null },
    programExercise: { count: async () => 0 },
    coachClient: { count: async () => 0 },
    $queryRawUnsafe: async () => { throw new Error('relation "LibraryExercise" does not exist'); },
    $executeRawUnsafe: async () => { throw new Error('relation "LibraryExercise" does not exist'); },
  },
}));

import { GET } from '@/app/api/coach/catalogue/route';
import { resetLibraryCache } from './server';

type Lib = { id: string; avatarClip: string | null; cues: string[] } | null;
const library = async () => Object.fromEntries(((await (await GET()).json()) as { exercises: { slug: string; library: Lib }[] }).exercises.map((e) => [e.slug, e.library]));

describe('the coach catalogue\'s KB rows and the library', () => {
  beforeEach(() => { resetLibraryCache(); m.role = 'coach'; m.dobYear = null; });

  it('a KB exercise the library has by name carries its library card: the stage plays demoFor\'s loop', async () => {
    const r = await library();
    expect(r['crocodile-breathing']).toMatchObject({ id: 'crocodile-breathing', avatarClip: 'ex_pos_prone' });
    expect(r['crocodile-breathing']!.cues.length).toBeGreaterThan(0);
  });

  it('a near name is no match (no guess): the cue card', async () => {
    const r = await library();
    expect([r['single-leg-pogos'], r['aston-audit']]).toEqual([null, null]);
  });

  it('the library\'s own rules decide who sees an unreviewed entry: an athlete gets the cue card, as /api/library would', async () => {
    m.role = 'athlete';
    expect((await library())['crocodile-breathing']).toBeNull();
  });
});
