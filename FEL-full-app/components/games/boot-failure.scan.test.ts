import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('Babylon host boot failures', () => {
  it('surface rejected runMode boots through the splash error phase', () => {
    const dir = join(process.cwd(), 'components/games');
    const files = readdirSync(dir).filter((file) => file.endsWith('.tsx'));

    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      if (!source.includes('runMode(')) continue;

      expect(source, file).not.toMatch(/console\.error\([^)]*boot failed/);
      expect(source, file).not.toContain('setLoadError(String(');
      if (source.includes('.catch((e) =>')) {
        expect(source, file).toContain('failBabylonBoot(');
      }
    }
  });
});
