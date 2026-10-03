import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Error(`redirected to ${to}`); },
}));

import WorkoutPage from '@/app/workout/page';

function pageFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return pageFiles(path);
      return entry === 'page.tsx' ? [path] : [];
    });
}

function routeForPage(file: string): string {
  const rel = relative(process.cwd(), file).split(sep).join('/');
  return '/' + rel.replace(/^app\//, '').replace(/\/page\.tsx$/, '');
}

describe('protected route redirects', () => {
  it('keeps the workout destination through login', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);

    await expect(WorkoutPage()).rejects.toThrow('redirected to /login?next=%2Fworkout');
  });

  it('keeps non-mirror play destinations through login', () => {
    const mirrorOwned = '/app/play/mirror/';
    const pages = pageFiles(join(process.cwd(), 'app/play'))
      .filter((file) => !file.split(sep).join('/').includes(mirrorOwned));

    for (const file of pages) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('getServerSession(authOptions)')) continue;

      expect(source, routeForPage(file)).not.toContain("redirect('/login')");
      if (routeForPage(file) === '/play/calibrate') {
        expect(source, routeForPage(file)).toContain('/login?next=');
      } else {
        expect(source, routeForPage(file)).toContain('redirect(loginRedirect(');
      }
    }
  });
});
