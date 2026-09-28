import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('creator platform boundaries', () => {
  it('Firestore is reached only from server code, never from a client component', () => {
    const client = [...files('components/creator-platform'), ...files('app/team'), ...files('app/media-kit'), ...files('app/work-with-us'), ...files('app/bookings')]
      .filter((f) => readFileSync(f, 'utf8').startsWith("'use client'"));
    expect(client.length).toBeGreaterThan(0);
    for (const f of client) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/firebase|creatorStore|creatorCatalog/);
    }
    expect(readFileSync('lib/creator/creatorStore.firestore.ts', 'utf8')).toContain("import 'server-only'");
  });

  it('no creator code reads a live Printful, Instagram or Connect endpoint', () => {
    const platform = ['creatorCatalog', 'creatorCheckout', 'creatorEnv', 'creatorSlots', 'creatorStore', 'creatorStore.firestore',
      'creatorViewer', 'creatorWebhook', 'fulfillment', 'inquiry', 'instagram', 'notify', 'payouts', 'printful'];
    for (const f of platform.map((name) => `lib/creator/${name}.ts`)) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/fetch\(/);
      expect(src, f).not.toMatch(/graph\.instagram\.com|graph\.facebook\.com|accountLinks|accounts\.create/);
    }
  });
});
