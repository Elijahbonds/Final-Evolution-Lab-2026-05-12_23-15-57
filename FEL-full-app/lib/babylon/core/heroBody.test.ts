import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideHeroBody, parseOwnerEmails, urlForHeroBody, isPlayerBodyUrl, proportionsFromFrame, bodyTypeOf,
  SCAN_BODY_URL, KIT_BODY_URL,
} from './heroBody';

describe('heroBody — the scan is the owner\'s body only; everyone else wears the creator\'s kit body', () => {
  const owners = parseOwnerEmails(' Owner@Example.com , ,second@example.com');

  it('parses the allowlist case- and whitespace-insensitively, dropping empties', () => {
    expect([...owners].sort()).toEqual(['owner@example.com', 'second@example.com']);
    expect(parseOwnerEmails(undefined).size).toBe(0);
    expect(parseOwnerEmails('').size).toBe(0);
  });

  it('an allowlisted account plays the scan whatever its creator frame says', () => {
    expect(decideHeroBody('OWNER@example.com', owners, { bodyType: 'female' })).toBe('scan');
  });

  it('any other account plays the kit body its creator frame chose', () => {
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'female' })).toBe('kit-female');
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'male' })).toBe('kit-male');
    expect(decideHeroBody('someone@else.com', owners, null)).toBe('kit-male');
  });

  it('a guest never gets the scan — even with an empty allowlist and no email', () => {
    expect(decideHeroBody(null, owners, null)).toBe('kit-male');
    expect(decideHeroBody(undefined, new Set(), null)).toBe('kit-male');
    expect(decideHeroBody('', new Set(['']), null)).toBe('kit-male');
  });

  it('maps kinds to files, and every player file counts as a player body', () => {
    expect(urlForHeroBody('scan')).toBe(SCAN_BODY_URL);
    expect(urlForHeroBody('kit-female')).toBe(KIT_BODY_URL.female);
    expect(urlForHeroBody('kit-male')).toBe(KIT_BODY_URL.male);
    for (const u of [SCAN_BODY_URL, KIT_BODY_URL.male, KIT_BODY_URL.female]) expect(isPlayerBodyUrl(u)).toBe(true);
    expect(isPlayerBodyUrl('/models/athletes/atlas.glb')).toBe(false);
  });

  it('reads the frame\'s percent scales as multipliers, 1 for anything unset or junk', () => {
    expect(proportionsFromFrame({ heightScale: 110, buildScale: 92, reachScale: 'x' })).toEqual({ heightScale: 1.1, buildScale: 0.92, reachScale: 1 });
    expect(proportionsFromFrame(null)).toBeNull();
    expect(bodyTypeOf('Female')).toBe('female');
    expect(bodyTypeOf(42)).toBe('male');
  });
});

describe('the creator offers exactly the bodies heroBody can spawn', async () => {
  const { BODY } = await import('../../creator/schema/body');
  it('has a Body Type row whose options are the shipped kit bodies, defaulting to the guest body', () => {
    const r = BODY.rows.find((x) => x.id === 'bodyType') as { options: readonly string[]; defaultOption: string; allowNone: boolean } | undefined;
    expect(r).toBeDefined();
    expect([...r!.options]).toEqual(['male', 'female']);
    expect(r!.defaultOption).toBe('male');
    expect(r!.allowNone).toBe(false);
    for (const o of r!.options) expect(urlForHeroBody(decideHeroBody('x@y.z', new Set(), { bodyType: o }))).toBe(KIT_BODY_URL[o as 'male' | 'female']);
  });
});

// FEL-KIT-GLB-LOAD (2026-09-14): QA failed the dunk on "fel-kit-male.glb load FAIL". That run's LoadFileError was status 0,
// meaning the :3000 server had gone away, not a missing file. These checks make a missing, truncated, rig-less, or unparseable
// body file (or a second spelling of the kit path) fail the suite instead of a live boot.
describe('heroBody — every player body file ships whole, parseable, and under one path', () => {
  const ROOT = process.cwd();
  const EXT_DIR = join(ROOT, 'node_modules/@babylonjs/loaders/glTF/2.0/Extensions');

  for (const url of [KIT_BODY_URL.male, KIT_BODY_URL.female, SCAN_BODY_URL]) {
    it(`${url} is a whole glTF 2.0 binary with a rig the loader can parse`, () => {
      const file = join(ROOT, 'public', url);
      expect(existsSync(file)).toBe(true);
      const b = readFileSync(file);
      expect(b.toString('latin1', 0, 4)).toBe('glTF');
      expect(b.readUInt32LE(4)).toBe(2);
      expect(b.readUInt32LE(8)).toBe(b.length);                                  // header length = bytes on disk (not truncated)
      const jsonLen = b.readUInt32LE(12);
      expect(b.toString('latin1', 16, 20)).toBe('JSON');
      const gltf = JSON.parse(b.toString('utf8', 20, 20 + jsonLen)) as {
        extensionsRequired?: string[]; skins?: { joints: number[] }[]; nodes: { name?: string }[];
        bufferViews: { byteOffset?: number; byteLength: number; buffer: number }[];
      };
      const binStart = 20 + jsonLen;
      const binLen = b.readUInt32LE(binStart);
      expect(b.toString('latin1', binStart + 4, binStart + 8)).toBe('BIN\0');
      for (const v of gltf.bufferViews.filter((v) => v.buffer === 0)) expect((v.byteOffset ?? 0) + v.byteLength).toBeLessThanOrEqual(binLen);
      for (const ext of gltf.extensionsRequired ?? []) expect(existsSync(join(EXT_DIR, `${ext}.js`)), `loader lacks ${ext}`).toBe(true);
      expect(gltf.skins?.length ?? 0).toBeGreaterThan(0);
      const joints = new Set(gltf.skins![0].joints.map((j) => gltf.nodes[j].name));
      for (const bone of ['Hips', 'Neck', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) expect(joints.has(bone), `no ${bone} joint`).toBe(true);
    });
  }

  it('the kit body files are spelled in exactly one source file (heroBody.ts)', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'node_modules' && !name.startsWith('.')) walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (/fel-kit-(male|female)\.glb/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(ROOT.length + 1));
      }
    };
    for (const d of ['lib', 'components', 'app']) walk(join(ROOT, d));
    expect(hits).toEqual(['lib/babylon/core/heroBody.ts']);
  });
});
