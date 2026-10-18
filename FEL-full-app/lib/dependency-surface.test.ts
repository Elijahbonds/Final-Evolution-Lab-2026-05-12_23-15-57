import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib', 'scripts', 'server'];
const UNUSED_CHART_MAP_PACKAGES = ['plotly.js', 'react-plotly.js', 'maplibre-gl', '@types/plotly.js', '@types/react-plotly.js'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('dependency surface', () => {
  it('does not ship the unused Plotly / MapLibre chain', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const dep of UNUSED_CHART_MAP_PACKAGES) {
      expect(pkg.dependencies ?? {}, `${dep} should not be a production dependency`).not.toHaveProperty(dep);
      expect(pkg.devDependencies ?? {}, `${dep} should not be a dev dependency`).not.toHaveProperty(dep);
    }

    for (const dir of SOURCE_DIRS) {
      for (const file of files(dir)) {
        if (file.endsWith('dependency-surface.test.ts')) continue;
        const src = readFileSync(file, 'utf8');
        expect(src, file).not.toMatch(/from ['"](?:plotly\.js|react-plotly\.js|maplibre-gl)['"]|require\(['"](?:plotly\.js|react-plotly\.js|maplibre-gl)['"]\)/);
      }
    }
  });
});
