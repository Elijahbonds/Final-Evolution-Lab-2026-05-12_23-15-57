import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideHeroBody, parseOwnerEmails, urlForHeroBody, isPlayerBodyUrl, proportionsFromFrame, bodyTypeOf,
  SCAN_BODY_URL, KIT_BODY_URL, SCAN_BODY_MOBILE_URL, KIT_BODY_MOBILE_URL, bodyUrlForTier,
} from './heroBody';
import { DEFAULT_HERO_URL } from './athleteRoster';

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
    expect(proportionsFromFrame({ heightScale: 102, buildScale: 96, reachScale: 'x' })).toEqual({ heightScale: 1.02, buildScale: 0.96, reachScale: 1 });
    // REACH-FREEZE: an old save clamps to the cosmetic range, and a saved reach is ignored
    expect(proportionsFromFrame({ heightScale: 110, buildScale: 92, reachScale: 110 })).toEqual({ heightScale: 1.04, buildScale: 0.94, reachScale: 1 });
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

  for (const url of [KIT_BODY_URL.male, KIT_BODY_URL.female, SCAN_BODY_URL, KIT_BODY_MOBILE_URL.male, KIT_BODY_MOBILE_URL.female, SCAN_BODY_MOBILE_URL]) {
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

// CREATOR-PLAN phase 4a (2026-10-06): the active slot's body is the preference; 'scan' only for an account that owns one.
describe('heroBody — a slot chooses the body, within what the account owns', () => {
  const owners = parseOwnerEmails('owner@example.com');
  it('the scan owner\'s kit-body slot is the kit body; his scan slot, or no slot, the scan', () => {
    expect(decideHeroBody('owner@example.com', owners, null, 'male')).toBe('kit-male');
    expect(decideHeroBody('owner@example.com', owners, null, 'female')).toBe('kit-female');
    expect(decideHeroBody('owner@example.com', owners, null, 'scan')).toBe('scan');
    expect(decideHeroBody('owner@example.com', owners, null, null)).toBe('scan');
  });
  it('anyone else\'s scan preference is ignored (the frame\'s kit body); a guest is the neutral kit', () => {
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'female' }, 'scan')).toBe('kit-female');
    expect(decideHeroBody('someone@else.com', owners, null, 'scan')).toBe('kit-male');
    expect(decideHeroBody(null, owners, null, 'scan')).toBe('kit-male');
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'male' }, 'female')).toBe('kit-female');
  });
});

// DEMO-SPEED (2026-10-27): the scan's phone file has ONE rule, shared by CharacterLibrary's tier swap and the library stage's
// early fetch. CharacterLibrary's rule was `url === DEFAULT_HERO_URL && tier === 'mobile'`; it reads bodyUrlForTier now, so
// the scan must still be the default hero's file, or the swap would quietly stop.
// DEMO-SPEED-2 (coordinator 2026-10-28, owner call 1): the kit bodies have phone files too, under the same rule. (This block
// asserted that a kit body was NOT swapped; that was the old behaviour, changed on purpose — it now asserts the swap.)
describe('the player bodies\' phone files', () => {
  it('are picked for the scan and the kit bodies on the mobile tier only; any other file loads as asked', () => {
    expect(DEFAULT_HERO_URL).toBe(SCAN_BODY_URL);
    expect(bodyUrlForTier(SCAN_BODY_URL, 'mobile')).toBe(SCAN_BODY_MOBILE_URL);
    expect(bodyUrlForTier(KIT_BODY_URL.male, 'mobile')).toBe(KIT_BODY_MOBILE_URL.male);
    expect(bodyUrlForTier(KIT_BODY_URL.female, 'mobile')).toBe(KIT_BODY_MOBILE_URL.female);
    for (const t of ['desktop', 'high', undefined, null]) for (const u of [SCAN_BODY_URL, KIT_BODY_URL.male, KIT_BODY_URL.female]) expect(bodyUrlForTier(u, t)).toBe(u);
    for (const u of ['/models/athletes/atlas.glb', SCAN_BODY_MOBILE_URL, KIT_BODY_MOBILE_URL.male]) expect(bodyUrlForTier(u, 'mobile')).toBe(u);
    for (const u of [SCAN_BODY_MOBILE_URL, KIT_BODY_MOBILE_URL.male, KIT_BODY_MOBILE_URL.female]) {
      expect(isPlayerBodyUrl(u), u).toBe(true);          // an opponent never lands on a phone file of a player body either
      expect(existsSync(join('public', u)), u).toBe(true);
    }
  });
});

// GATE 0 for the kit bodies' phone files, on the files themselves: a texture pass, so everything but the images is the kit
// file's — the same nodes (names, rest TRS, hierarchy), the same skins and joints, the same inverse bind matrices, the same
// vertex data and morph targets, the same materials — and every map is at most the phone size (skin 1024², the rest 512²).
describe('the kit bodies\' phone files are the kit bodies with smaller maps', () => {
  type Gltf = { nodes: Record<string, unknown>[]; skins: { joints: number[]; inverseBindMatrices: number }[]; meshes: { primitives: { attributes: Record<string, number>; indices?: number; targets?: Record<string, number>[]; material?: number }[] }[];
    accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]; bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
    materials: { name: string; doubleSided?: boolean; pbrMetallicRoughness?: Record<string, unknown>; extensions?: unknown }[]; images: { bufferView: number; mimeType: string }[] };
  const read = (url: string) => {
    const b = readFileSync(join('public', url)); const len = b.readUInt32LE(12);
    return { j: JSON.parse(b.toString('utf8', 20, 20 + len)) as Gltf, bin: b.subarray(20 + len + 8) };
  };
  const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const BYTES: Record<number, number> = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
  const bytesOf = (g: ReturnType<typeof read>, i: number): Buffer => {
    const a = g.j.accessors[i]; const v = g.j.bufferViews[a.bufferView]; const el = SIZE[a.type] * BYTES[a.componentType];
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = v.byteStride ?? el;
    return Buffer.concat(Array.from({ length: a.count }, (_, k) => g.bin.subarray(start + k * stride, start + k * stride + el)));
  };
  const matKey = (m: Gltf['materials'][number]) => JSON.stringify({ n: m.name, d: !!m.doubleSided, f: Object.fromEntries(Object.entries(m.pbrMetallicRoughness ?? {}).filter(([k]) => !/Texture$/.test(k)).sort()), e: m.extensions ?? null });
  for (const body of ['male', 'female'] as const) {
    it(`${body}: nodes, skins, inverse binds, vertices, morphs and materials are the kit file's; maps within the phone sizes`, async () => {
      const full = read(KIT_BODY_URL[body]), phone = read(KIT_BODY_MOBILE_URL[body]);
      expect(phone.j.nodes).toEqual(full.j.nodes);
      expect(phone.j.skins.map((s) => s.joints)).toEqual(full.j.skins.map((s) => s.joints));
      expect(phone.j.skins[0].joints.length).toBe(22);
      full.j.skins.forEach((s, i) => expect(bytesOf(phone, phone.j.skins[i].inverseBindMatrices).equals(bytesOf(full, s.inverseBindMatrices)), `skin ${i} IBMs`).toBe(true));
      let checked = 0;
      full.j.meshes.forEach((m, mi) => m.primitives.forEach((p, pi) => {
        const q = phone.j.meshes[mi].primitives[pi];
        expect(Object.keys(q.attributes).sort()).toEqual(Object.keys(p.attributes).sort());
        for (const k of Object.keys(p.attributes)) { expect(bytesOf(phone, q.attributes[k]).equals(bytesOf(full, p.attributes[k])), `mesh ${mi} ${k}`).toBe(true); checked++; }
        if (p.indices != null) expect(bytesOf(phone, q.indices!).equals(bytesOf(full, p.indices)), `mesh ${mi} indices`).toBe(true);
        expect(q.targets?.length ?? 0).toBe(p.targets?.length ?? 0);
        (p.targets ?? []).forEach((t, ti) => { for (const k of Object.keys(t)) expect(bytesOf(phone, q.targets![ti][k]).equals(bytesOf(full, t[k])), `mesh ${mi} target ${ti} ${k}`).toBe(true); });
        expect(phone.j.materials[q.material ?? -1]?.name).toBe(full.j.materials[p.material ?? -1]?.name);
      }));
      expect(checked).toBeGreaterThan(30);
      expect(phone.j.materials.map(matKey)).toEqual(full.j.materials.map(matKey));
      const { default: sharp } = await import('sharp');
      const edges: number[] = [];
      for (const im of phone.j.images) {
        const v = phone.j.bufferViews[im.bufferView]; const meta = await sharp(phone.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)).metadata();
        edges.push(Math.max(meta.width ?? 0, meta.height ?? 0));
      }
      expect(edges.length).toBe(full.j.images.length);
      expect(Math.max(...edges)).toBeLessThanOrEqual(1024);
      expect(edges.filter((e) => e > 512)).toHaveLength(1);   // the skin; every other map at 512² or less
    });
  }
});
