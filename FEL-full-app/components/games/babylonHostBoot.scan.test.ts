// G7 BOOT GUARD — a Babylon host owns its engine for the component mount.
//
// A parent re-render can hand a fresh onEnd callback identity to a host while a
// run is live. If the boot effect depends on that callback, React disposes the
// Babylon engine and cold-boots the venue underneath the player. Hosts keep the
// latest callback in onEndRef; the boot effect mounts once.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const GAMES = path.join(ROOT, 'components', 'games');

function babylonHosts(): string[] {
  return fs.readdirSync(GAMES)
    .filter((name) => name.endsWith('-babylon.tsx'))
    .map((name) => path.join('components', 'games', name))
    .filter((rel) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).includes('runMode('))
    .sort();
}

const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('Babylon hosts mount once and keep callbacks fresh', () => {
  it('every runMode host uses an onEnd ref instead of rebooting on onEnd identity changes', () => {
    const hosts = babylonHosts();
    expect(hosts.length).toBeGreaterThanOrEqual(21);

    const failures: string[] = [];
    for (const host of hosts) {
      const src = read(host);
      if (!src.includes('onEndRef')) failures.push(`${host}: missing onEndRef`);
      if (/\bonEnd\s*\(/.test(src)) failures.push(`${host}: calls onEnd(...) directly`);
      if (/\},\s*\[onEnd\]\s*\);/.test(src)) failures.push(`${host}: boot effect depends on [onEnd]`);
    }

    expect(failures).toEqual([]);
  });
});
