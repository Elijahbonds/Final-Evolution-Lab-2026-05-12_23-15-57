// PRISMA-PUBLIC step 2: the app loads lib/generated/prisma. A file that still imports @/public/_prisma/client would pull
// the old client back into the server bundle (two clients, two engines) and break step 4, which deletes public/_prisma.
// Two such imports arrived from lanes merged after step 2 was written (athleteStatusServer, profile-v2/load); this
// catches the next one at the PR instead of at step 4.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '..', '..');
const ROOTS = ['app', 'lib', 'components', 'scripts', 'tests'];
const SKIP = new Set(['node_modules', 'generated', '.next']);
const IMPORT = /(?:from|import|require)\s*\(?\s*['"](?:@\/|(?:\.\.\/)+)public\/_prisma\/client['"]/;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.next')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe('no code imports the public Prisma client', () => {
  it('every import names @/lib/generated/prisma', () => {
    const bad = ROOTS.flatMap((r) => files(path.join(APP, r)))
      .filter((f) => f !== __filename && IMPORT.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(APP, f));
    expect(bad, 'import from @/lib/generated/prisma instead').toEqual([]);
  });
});
