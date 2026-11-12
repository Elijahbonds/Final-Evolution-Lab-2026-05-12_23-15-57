// The user-facing source files the readability floor reads (tests/readable/source-floor.test.ts and
// scripts/readable/source-baseline.mts share this, so the test and the baseline it reads can never disagree on scope).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** app/, components/ and lib/, .ts and .tsx; app/dev (dev-only pages), tests, scans and fixtures aside. */
export function readableFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(root, rel))) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = `${rel}/${name}`;
      if (statSync(join(root, p)).isDirectory()) {
        if (p === 'app/dev' || p === 'app/api' || name === '__tests__' || name === 'fixtures') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(name) || /\.d\.ts$/.test(name) || /\.(test|spec|scan)\.[^.]*\.?tsx?$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) continue;
      out.push(p);
    }
  };
  for (const top of ['app', 'components', 'lib']) walk(top);
  return out.sort();
}
