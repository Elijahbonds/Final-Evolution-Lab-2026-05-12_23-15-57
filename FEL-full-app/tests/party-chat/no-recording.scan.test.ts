// PARTY-CHAT (2026-10-13), owner: party voice and chat are NEVER recorded. Same scan as the coach call's
// (lib/coach-store/call/no-recording.scan.test.ts): no recorder, no captured stream, no recording library, anywhere in
// the party — the page's voice and chat code, its UI, its routes, and the netd party server.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.(ts|tsx|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
  } catch {
    return [];
  }
}

const ROOTS = ['lib/party/social', 'components/party/social', 'app/party', 'app/api/party', 'server/netd/src'];
const RECORDER = /MediaRecorder|captureStream|recordRTC|getDisplayMedia|createMediaStreamDestination/i;

describe('the party does not record', () => {
  it('the roots exist (a renamed folder must not pass this silently)', () => {
    for (const r of ROOTS) expect(files(r).length, r).toBeGreaterThan(0);
  });
  it('no recorder, captured stream or recording library under any party root', () => {
    const hit = ROOTS.flatMap(files).filter((f) => RECORDER.test(readFileSync(f, 'utf8')));
    expect(hit).toEqual([]);
  });
  it('netd never writes a party message anywhere (no file system, no database, no logging of frames)', () => {
    for (const f of ['server/netd/src/party.ts', 'server/netd/src/partyServer.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from 'node:fs'|from 'fs'|writeFile|appendFile|createWriteStream|console\.(log|info|warn|error)\(/);
    }
  });
  it('the page keeps the feed in memory only: the only things stored are the token, blocks, mutes and voice prefs', () => {
    const src = readFileSync('lib/party/social/persist.ts', 'utf8');
    const keys = [...src.matchAll(/'(fel\.party\.[a-z]+)'/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(['fel.party.blocks', 'fel.party.mutes', 'fel.party.session', 'fel.party.voice']);
    // and nothing else in the party code touches storage
    const others = ['lib/party/social', 'components/party/social'].flatMap(files).filter((f) => !f.endsWith('persist.ts'));
    expect(others.filter((f) => /localStorage|sessionStorage|indexedDB/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
