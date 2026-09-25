import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREDITS, FIRST_PARTY_LICENCES, LICENCE_PENDING, OPEN_LICENCES, PENDING_OWNER, REVIEWED_TERMS, bannedTerms,
  creditForManifestLicence, creditForPublicPath, licenceProblems, licenceRule, notAssetReason, type Credit,
} from './credits';
import { MOCAP_OPPONENT_CLIPS } from '../babylon/anim/authored/mocapOpponents';
import { MOCAP_STYLE_CLIPS } from '../babylon/anim/authored/mocapStyles';

// HOTFIX (2026-09-24): the credits page is only as honest as its coverage. These tests walk what actually ships
// (every file under public/) and every licence string the manifests carry, and fail when something has no entry, or
// when an entry's licence breaks the owner's ban on NC, ND, SA, personal-use and unlabeled licences.
//
// HOTFIX (2026-09-24): the ban is an allowlist, and a folder credit is no longer a blank cheque. A file dropped into a
// credited folder must match that folder's own record (the Kenney manifest, a Meshy sidecar, the skins manifest, a
// voice index, the maker's name inside a clip), and every source/licence/copyright line in a JSON or a GLB is screened.
// The licences still being confirmed are an exact list (PENDING_OWNER): the suite passes on them and prints them.

const ROOT = join(__dirname, '..', '..');
const PUBLIC = join(ROOT, 'public');
const byId = (id: string): Credit => {
  const c = CREDITS.find((x) => x.id === id);
  if (!c) throw new Error(`no credit "${id}"`);
  return c;
};
const readJson = (abs: string): unknown => JSON.parse(readFileSync(abs, 'utf8'));

/** Every file under public/, relative to it. Dotfiles are skipped; a symlink counts as a file (its target is walked where it lives). */
function publicFiles(dir = PUBLIC, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const abs = join(dir, name), r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(abs);
    if (st.isDirectory()) out.push(...publicFiles(abs, r));
    else out.push(r);
  }
  return out;
}
const FILES = publicFiles();

/** The JSON chunk of a .glb, read without the binary body. */
interface GltfJson { asset?: { copyright?: string; extras?: unknown }; extras?: unknown; animations?: { name?: string }[] }
function readGlbJson(abs: string): GltfJson {
  const fd = openSync(abs, 'r');
  try {
    const head = Buffer.alloc(20);
    readSync(fd, head, 0, 20, 0);
    const body = Buffer.alloc(head.readUInt32LE(12));
    readSync(fd, body, 0, body.length, 20);
    return JSON.parse(body.toString('utf8')) as GltfJson;
  } finally { closeSync(fd); }
}

/** Every licence/license value anywhere inside a JSON value. */
function licenceFields(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) licenceFields(x, out);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (/^licen[cs]e$/i.test(k) && typeof x === 'string') out.push(x);
      else licenceFields(x, out);
    }
  }
  return out;
}

/** Every string under a provenance key (source, licence, credit, attribution, author, copyright), as [key, value]. */
function provenanceFields(v: unknown, out: [string, string][] = []): [string, string][] {
  if (Array.isArray(v)) for (const x of v) provenanceFields(x, out);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (/^(?:source|licen[cs]e|credit|attribution|author|artist|copyright|rights|usage[_ ]?terms)$/i.test(k) && typeof x === 'string') out.push([k, x]);
      else provenanceFields(x, out);
    }
  }
  return out;
}

/** Every string anywhere inside a JSON value. */
const allStrings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === 'object' ? Object.values(v).flatMap(allStrings) : [];

// ── the reverse checks, as pure functions over a tree so they can be tried on a made-up one ─────────────────────────
interface Tree { files: string[]; json(rel: string): unknown; glb(rel: string): GltfJson }
const REAL: Tree = {
  files: FILES,
  json: (rel) => readJson(join(PUBLIC, rel)),
  glb: (rel) => readGlbJson(join(PUBLIC, rel)),
};

/** Kenney's folder credit holds only what props/manifest.json lists: a kit folder it names, a model it names, a kit texture. */
function kenneyProblems(t: Tree): string[] {
  const m = t.json('models/props/manifest.json') as { kits: Record<string, string[]> };
  const out: string[] = [];
  for (const f of t.files) {
    if (creditForPublicPath(f)?.id !== 'kenney' || f === 'models/props/manifest.json') continue;
    const hit = f.match(/^models\/props\/([^/]+)\/(.+)$/);
    const kit = hit?.[1], rest = hit?.[2] ?? '';
    if (!kit || !m.kits[kit]) { out.push(`${f}: not in a kit props/manifest.json names — add a credit for it`); continue; }
    if (/^Textures\/[^/]+\.png$/.test(rest)) continue;
    if (!rest.endsWith('.glb') || !m.kits[kit].includes(rest.slice(0, -4))) out.push(`${f}: props/manifest.json does not list it under ${kit} — add a credit for it`);
  }
  return out;
}

/** The roster and crowd folders hold Meshy bodies only: every body has a sidecar, and every sidecar says Meshy. */
function sidecarProblems(t: Tree): string[] {
  const out: string[] = [];
  for (const f of t.files.filter((x) => /^models\/(?:athletes|crowd)\/[^/]+$/.test(x))) {
    if (f.endsWith('.glb')) {
      const side = f.replace(/\.glb$/, '.json');
      if (!t.files.includes(side)) { out.push(`${f}: no sidecar saying where it came from — add one, or a credit`); continue; }
    } else if (f.endsWith('.json')) {
      const source = (t.json(f) as { source?: unknown })?.source;
      if (typeof source !== 'string' || !/^Meshy\b/i.test(source)) out.push(`${f}: source "${String(source)}" is not Meshy — add a credit for it`);
    } else out.push(`${f}: neither a body nor its sidecar — add a credit for it`);
  }
  return out;
}

/** The skins folder holds only the maps skins/manifest.json names, and their -1024 copies. */
function skinsProblems(t: Tree): string[] {
  const named = new Set(allStrings(t.json('models/skins/manifest.json')).filter((s) => s.startsWith('/models/skins/')).map((s) => s.slice(1)));
  const out: string[] = [];
  for (const f of t.files.filter((x) => x.startsWith('models/skins/') && x !== 'models/skins/manifest.json')) {
    if (!named.has(f) && !named.has(f.replace(/-1024(\.[a-z]+)$/, '$1'))) out.push(`${f}: skins/manifest.json does not name it — add a credit for it`);
  }
  return out;
}

/** The voice folder holds only rendered indexes and the banks they name. */
function voiceProblems(t: Tree): string[] {
  const named = new Set<string>();
  for (const f of t.files.filter((x) => x.startsWith('audio/voice/') && x.endsWith('.json'))) {
    const { bank } = t.json(f) as { bank?: string };
    if (bank) named.add(f.replace(/[^/]+$/, bank));
  }
  return t.files
    .filter((f) => f.startsWith('audio/voice/') && !f.endsWith('.json') && !named.has(f))
    .map((f) => `${f}: no voice index names it — add a credit for it`);
}

/** DeepMotion Animate 3D names a take "My Movie 198_customModel_…"; Meshy names a clip "Armature|running|baselayer". */
const MAKER_MARK: Record<string, RegExp> = {
  'owner-captures': /^My Movie \d+_customModel_/,
  meshy: /baselayer$/,
};
/** Every clip in models/clips/ carries its maker's own naming, so a clip from anywhere else cannot ride the folder credit. */
function clipProblems(t: Tree): string[] {
  const out: string[] = [];
  for (const f of t.files.filter((x) => /^models\/clips\/[^/]+\.glb$/.test(x))) {
    const id = creditForPublicPath(f)?.id ?? '(none)';
    const mark = MAKER_MARK[id];
    const names = (t.glb(f).animations ?? []).map((a) => a.name ?? '');
    if (!mark) out.push(`${f}: credited to ${id}, which has no maker mark to check — add one`);
    else if (!names.some((n) => mark.test(n))) out.push(`${f}: credited to ${id}, but no animation carries its naming (${names.join(', ') || 'none'}) — add a credit for it`);
  }
  return out;
}

/** Every source/licence/copyright line in a JSON under public/ is screened for a banned kind. */
function provenanceTextProblems(t: Tree): string[] {
  const out: string[] = [];
  for (const f of t.files.filter((x) => x.endsWith('.json'))) {
    let doc: unknown;
    try { doc = t.json(f); } catch { continue; }
    for (const [k, v] of provenanceFields(doc)) {
      const rule = bannedTerms(v);
      if (rule) out.push(`${f}: ${k} "${v}" is ${rule}`);
    }
  }
  return out;
}

/** A GLB's own copyright and extras (Sketchfab writes author/license/source there) are screened, and a licence it names must be claimed by its credit. */
function glbHeaderProblems(t: Tree): string[] {
  const out: string[] = [];
  for (const f of t.files.filter((x) => x.endsWith('.glb'))) {
    const j = t.glb(f);
    const lines = [j.asset?.copyright ?? '', ...allStrings(j.asset?.extras), ...allStrings(j.extras)].filter(Boolean);
    for (const l of lines) {
      const rule = bannedTerms(l);
      if (rule) out.push(`${f}: "${l}" is ${rule}`);
    }
    for (const l of licenceFields([j.asset?.extras, j.extras])) {
      const claimed = creditForManifestLicence(l);
      if (!claimed || claimed.id !== creditForPublicPath(f)?.id) out.push(`${f}: names licence "${l}", which its credit does not claim — add a credit for it`);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('CMU’s acknowledgement', () => {
  it('is on the CMU entry word for word', () => {
    expect(byId('cmu').notice).toBe(
      'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',
    );
  });
});

describe('the ban on NC, ND, SA, personal-use and unlabeled licences', () => {
  it('names every banned kind, however it is spelled', () => {
    const cases: [string, string][] = [
      ['CC BY-NC 4.0', 'NC'], ['CC-BY-NC-SA-4.0', 'NC'], ['Creative Commons Attribution-NonCommercial 4.0 International', 'NC'],
      ['non-commercial use only', 'NC'], ['not for commercial use', 'NC'], ['No commercial use', 'NC'], ['Commercial use prohibited', 'NC'],
      ['CC BY-ND 4.0', 'ND'], ['Attribution-NoDerivatives 4.0', 'ND'],
      ['CC BY-SA 4.0', 'SA'], ['Attribution-ShareAlike 4.0', 'SA'],
      ['Free for personal use', 'personal-use'], ['Educational use only', 'personal-use'],
      ['royalty free, personal projects only', 'personal-use'], ['Personal license', 'personal-use'],
      ['GPL-3.0', 'copyleft'], ['AGPL-3.0', 'copyleft'], ['ODbL', 'copyleft'],
      ['Sketchfab — CC BY-NC 4.0 (personal use only)', 'NC'],
    ];
    for (const [text, rule] of cases) expect(bannedTerms(text), text).toBe(rule);
  });

  it('does not call a company suffix a licence term', () => {
    expect(bannedTerms('© Google SA')).toBeNull();
    expect(bannedTerms('Meshy — Athletic Female NPC 1 (figure 1 of 5)')).toBeNull();
    expect(bannedTerms(byId('cmu').licence)).toBeNull();
    expect(bannedTerms(byId('cmu').manifestLicences[0])).toBeNull();
  });

  it('lets through only a named open licence, a first-party statement, or terms pinned for that entry', () => {
    for (const l of Object.keys(OPEN_LICENCES)) expect(licenceRule({ id: 'x', licence: l, status: 'open' }), l).toBeNull();
    for (const l of FIRST_PARTY_LICENCES) expect(licenceRule({ id: 'x', licence: l, status: 'first-party' }), l).toBeNull();
    for (const [id, l] of Object.entries(REVIEWED_TERMS)) expect(licenceRule({ id, licence: l, status: 'terms' }), id).toBeNull();
    // Anything else is unlabeled: an unknown string, a placeholder, terms pinned for another entry, a first-party
    // claim nobody wrote down, and a pending licence.
    for (const l of ['', '   ', 'none', 'N/A', 'TODO', '-', '?', 'see source', 'Unknown', 'Proprietary', 'royalty free', '© Google SA', 'toString']) {
      expect(licenceRule({ id: 'x', licence: l, status: 'open' }), JSON.stringify(l)).toBe('unlabeled');
    }
    expect(licenceRule({ id: 'kenney', licence: REVIEWED_TERMS.cmu, status: 'terms' })).toBe('unlabeled');
    expect(licenceRule({ id: 'x', licence: 'Ours, trust me', status: 'first-party' })).toBe('unlabeled');
    expect(licenceRule({ id: 'x', licence: LICENCE_PENDING, status: 'pending' })).toBe('unlabeled');
    // And a banned kind is named even where the status would otherwise pass it.
    expect(licenceRule({ id: 'x', licence: 'CC BY-SA 4.0', status: 'open' })).toBe('SA');
    expect(licenceRule({ id: 'x', licence: 'GPL-3.0', status: 'open' })).toBe('copyleft');
  });

  it('holds on the real list: nothing banned, nothing unlabeled beyond the owner’s pending list, which it prints', () => {
    expect(licenceProblems(), 'BANNED OR UNLABELED LICENCE SHIPPING').toEqual([]);
    const pending = CREDITS.filter((c) => PENDING_OWNER.includes(c.id));
    expect(pending.length).toBe(PENDING_OWNER.length);
    // eslint-disable-next-line no-console
    console.warn([
      `PENDING_OWNER: ${pending.length} licence(s) being confirmed by the owner (lib/credits/credits.ts):`,
      ...pending.map((c) => `  - ${c.id} (${c.title}): ${c.missing}`),
    ].join('\n'));
  });

  it('fails a NEW unlabeled entry, a banned one even on the pending list, and a pending list gone stale', () => {
    const base = CREDITS;
    const extra = (c: Partial<Credit>): Credit[] => [...base, { ...byId('venue-cards'), id: 'new-thing', ...c }];
    // A new entry nobody has a licence for.
    expect(licenceProblems(extra({}))).toEqual([expect.stringMatching(/^new-thing: UNLABELED/)]);
    // A new source whose own terms were never read and pinned.
    expect(licenceProblems(extra({ status: 'terms', licence: 'Royalty-free asset store licence' }))).toEqual([expect.stringMatching(/^new-thing: UNLABELED/)]);
    // A banned licence fails even when its id is on the pending list.
    expect(licenceProblems(extra({ status: 'pending', licence: 'CC BY-NC 4.0' }), [...PENDING_OWNER, 'new-thing'])).toEqual([expect.stringMatching(/^new-thing: BANNED NC/)]);
    // A banned string in a manifest an entry claims.
    expect(licenceProblems(extra({ status: 'open', licence: 'CC0 1.0', manifestLicences: ['Attribution-ShareAlike 4.0'] }))).toEqual([expect.stringMatching(/^new-thing: BANNED SA manifest/)]);
    // A pending entry whose licence has been recorded must leave the list.
    const recorded = base.map((c) => c.id === 'story-hub' ? { ...c, status: 'terms' as const, licence: REVIEWED_TERMS.meshy, id: 'meshy-2' } : c);
    expect(licenceProblems(recorded)).toContain('story-hub: on PENDING_OWNER but no entry has this id.');
    const cleared = base.map((c) => c.id === 'story-hub' ? { ...c, status: 'open' as const, licence: 'CC0 1.0' } : c);
    expect(licenceProblems(cleared)).toEqual(['story-hub: its licence is recorded now; take it off PENDING_OWNER.']);
    // A pending entry must say it is pending and ask the owner something.
    const mute = base.map((c) => c.id === 'story-hub' ? { ...c, missing: undefined } : c);
    expect(licenceProblems(mute)).toEqual([expect.stringMatching(/^story-hub: on PENDING_OWNER, so it must/)]);
  });
});

describe('creditForPublicPath', () => {
  it('takes the longest match, so a folder can hand one file to another entry', () => {
    expect(creditForPublicPath('models/props/nature/tree_pineTallA.glb')?.id).toBe('kenney');
    expect(creditForPublicPath('models/props/venice/pier_far.glb')?.id).toBe('fel');
    expect(creditForPublicPath('models/props/meshy')?.id).toBe('meshy');
    expect(creditForPublicPath('models/candidates/fel-kit-male.glb')?.id).toBe('makehuman');
    expect(creditForPublicPath('models/candidates/elijah-meshy.glb')?.id).toBe('meshy');
    expect(creditForPublicPath('models/_forge/athletes/atlas.glb')?.id).toBe('fel');
    expect(creditForPublicPath('models/clips/golf_swing.glb')?.id).toBe('owner-captures');
    expect(creditForPublicPath('models/clips/npc_tall_walk.glb')?.id).toBe('meshy');
    expect(creditForPublicPath('backdrops/baked/beach.jpg')?.id).toBe('fel');
    expect(creditForPublicPath('backdrops/baked/city.jpg')?.id).toBe('meshy');
    expect(creditForPublicPath('models/maps/baked/venice-blue-court.glb')?.id).toBe('venice-court-scan');
    expect(creditForPublicPath('models/maps/venice-golden-hour.png')?.id).toBe('openai-image');
    expect(creditForPublicPath('models/maps/dojo.glb')?.id).toBe('meshy');
    expect(creditForPublicPath('og-image.png')?.id).toBe('fel');
    expect(creditForPublicPath('venues/venicebeach.jpg')?.id).toBe('venue-cards');
    expect(creditForPublicPath('models/story-hub.glb')?.id).toBe('story-hub');
  });

  it('accepts a URL path or a public/ path, and a file cover never swallows a sibling', () => {
    expect(creditForPublicPath('/audio/voice/v1/moss/dunk.json')?.id).toBe('kokoro');
    expect(creditForPublicPath('public/loaders/basis/basis_transcoder.wasm')?.id).toBe('basis');
    expect(creditForPublicPath('models/fel-hero.glbx')).toBeNull();
    expect(creditForPublicPath('models/clips/npc_tall_walk.glb.bak')?.id).toBe('owner-captures');
    expect(creditForPublicPath('somewhere/new.png')).toBeNull();
  });
});

describe('every file that ships is credited', () => {
  it('walked a real public/ folder', () => {
    expect(FILES.length).toBeGreaterThan(400);
  });

  it('every file under public/ resolves to a credit, or is listed as not an asset with a reason', () => {
    const uncredited = FILES.filter((f) => !creditForPublicPath(f) && !notAssetReason(f));
    expect(uncredited, 'these files ship with no entry in lib/credits/credits.ts').toEqual([]);
  });
});

describe('a folder credit covers only what that folder’s own record lists', () => {
  it('the Kenney kits hold only what props/manifest.json lists', () => {
    expect(kenneyProblems(REAL)).toEqual([]);
  });
  it('the roster and crowd hold only Meshy bodies, each with a sidecar that says so', () => {
    expect(sidecarProblems(REAL)).toEqual([]);
  });
  it('the skins folder holds only the maps skins/manifest.json names', () => {
    expect(skinsProblems(REAL)).toEqual([]);
  });
  it('the voice folder holds only rendered indexes and the banks they name', () => {
    expect(voiceProblems(REAL)).toEqual([]);
  });
  it('every clip carries its maker’s own naming: DeepMotion’s for the owner’s takes, Meshy’s for the rest', () => {
    expect(clipProblems(REAL)).toEqual([]);
  });
  it('no source, licence or copyright line in a JSON or a GLB names a banned kind, and a GLB’s own licence is claimed', () => {
    expect(provenanceTextProblems(REAL)).toEqual([]);
    expect(glbHeaderProblems(REAL)).toEqual([]);
  });

  it('catches the asset that used to slip in: an NC body in the roster, a stray model in a Kenney kit, a foreign clip', () => {
    // The adversarial review's probe, as a made-up tree: every one of these passed the folder-only check.
    const docs: Record<string, unknown> = {
      'models/props/manifest.json': { kits: { nature: ['tree_pineTallA'] } },
      'models/athletes/zz-sketchfab.json': { source: 'Sketchfab — CC BY-NC 4.0 (personal use only)' },
      'models/skins/manifest.json': { skins: [{ albedo: '/models/skins/dark-male.jpg' }] },
      'audio/voice/v1/mc/dunk.json': { bank: 'dunk.1.bin' },
    };
    const glbs: Record<string, GltfJson> = {
      'models/clips/borrowed.glb': { animations: [{ name: 'mixamo.com' }] },
      'models/meshy/found.glb': { asset: { extras: { author: 'someone', license: 'CC-BY-NC-4.0 (http://creativecommons.org/licenses/by-nc/4.0/)' } } },
    };
    const fake: Tree = {
      files: [
        'models/props/manifest.json', 'models/props/nature/tree_pineTallA.glb', 'models/props/nature/stray.glb', 'models/props/newkit/rock.glb',
        'models/athletes/zz-sketchfab.glb', 'models/athletes/zz-sketchfab.json', 'models/athletes/nosidecar.glb',
        'models/skins/manifest.json', 'models/skins/dark-male.jpg', 'models/skins/dark-male-1024.jpg', 'models/skins/extra.jpg',
        'audio/voice/v1/mc/dunk.json', 'audio/voice/v1/mc/dunk.1.bin', 'audio/voice/v1/mc/found.wav',
        'models/clips/borrowed.glb', 'models/meshy/found.glb',
      ],
      json: (rel) => { if (!(rel in docs)) throw new Error(`no ${rel}`); return docs[rel]; },
      glb: (rel) => glbs[rel] ?? {},
    };
    expect(kenneyProblems(fake)).toEqual([
      expect.stringMatching(/^models\/props\/nature\/stray\.glb: props\/manifest\.json does not list it/),
      expect.stringMatching(/^models\/props\/newkit\/rock\.glb: not in a kit/),
    ]);
    expect(sidecarProblems(fake)).toEqual([
      expect.stringMatching(/^models\/athletes\/zz-sketchfab\.json: source "Sketchfab/),
      expect.stringMatching(/^models\/athletes\/nosidecar\.glb: no sidecar/),
    ]);
    expect(skinsProblems(fake)).toEqual([expect.stringMatching(/^models\/skins\/extra\.jpg/)]);
    expect(voiceProblems(fake)).toEqual([expect.stringMatching(/^audio\/voice\/v1\/mc\/found\.wav/)]);
    expect(clipProblems(fake)).toEqual([expect.stringMatching(/^models\/clips\/borrowed\.glb: credited to owner-captures, but no animation/)]);
    expect(provenanceTextProblems(fake)).toEqual([expect.stringMatching(/^models\/athletes\/zz-sketchfab\.json: source .* is NC/)]);
    expect(glbHeaderProblems(fake)).toEqual([
      expect.stringMatching(/^models\/meshy\/found\.glb: "CC-BY-NC-4\.0.*" is NC/),
      expect.stringMatching(/^models\/meshy\/found\.glb: names licence/),
    ]);
  });
});

describe('every source the manifests record has a credit', () => {
  it('scripts/mocap/sources.mts: every source kind’s licence', async () => {
    const { LICENSE } = await import('../../scripts/mocap/sources.mts');
    const kinds = Object.entries(LICENSE as Record<string, string>);
    expect(kinds.length).toBeGreaterThanOrEqual(4);
    const expected: Record<string, string> = { cmu: 'cmu', ual: 'quaternius-ual', deepmotion: 'owner-captures', meshy: 'meshy' };
    for (const [kind, licence] of kinds) {
      expect(creditForManifestLicence(licence)?.id, `${kind}: "${licence}"`).toBe(expected[kind] ?? '(a credit for this new kind)');
    }
  });

  it('the shipped mocap clips: every licence they carry, and it matches the source kind named on the clip', async () => {
    const { LICENSE } = await import('../../scripts/mocap/sources.mts');
    const clips = [...MOCAP_OPPONENT_CLIPS, ...MOCAP_STYLE_CLIPS];
    expect(clips.length).toBeGreaterThan(40);
    for (const clip of clips) {
      const credit = creditForManifestLicence(clip.license);
      expect(credit, `${clip.name}: "${clip.license}"`).not.toBeNull();
      expect(bannedTerms(clip.source), `${clip.name}: ${clip.source}`).toBeNull();
      const kind = clip.source.split(':')[0];
      expect(creditForManifestLicence((LICENSE as Record<string, string>)[kind])?.id, `${clip.name}: ${clip.source}`).toBe(credit?.id);
    }
  });

  it('the pose test captures: every licence they carry', () => {
    const dir = join(ROOT, 'lib', 'pose', '__fixtures__');
    // index.json is the list of captures, not a capture; every capture it names must be one of the files checked.
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    const listed = (readJson(join(dir, 'index.json')) as { name: string }[]).map((e) => `${e.name}.json`);
    expect(files.length).toBeGreaterThan(5);
    for (const f of listed) expect(files, f).toContain(f);
    for (const f of files) {
      const src = (readJson(join(dir, f)) as { source?: { license?: string } }).source;
      expect(src?.license, f).toBeTruthy();
      expect(creditForManifestLicence(src!.license!), `${f}: "${src!.license}"`).not.toBeNull();
    }
  });

  it('any JSON under public/ that carries a licence: the string is claimed, by the entry that credits the file', () => {
    let seen = 0;
    for (const f of FILES.filter((x) => x.endsWith('.json'))) {
      let doc: unknown;
      try { doc = readJson(join(PUBLIC, f)); } catch { continue; }
      for (const l of licenceFields(doc)) {
        seen++;
        const claimed = creditForManifestLicence(l);
        expect(claimed, `${f}: "${l}"`).not.toBeNull();
        expect(creditForPublicPath(f)?.id, `${f} is credited to a different source than its own licence names`).toBe(claimed?.id);
      }
    }
    expect(seen, 'the props and skins manifests carry licences').toBeGreaterThanOrEqual(2);
  });

  it('the props manifest: every model it lists sits under the Kenney credit', () => {
    const m = readJson(join(PUBLIC, 'models', 'props', 'manifest.json')) as { kits: Record<string, string[]> };
    const kits = Object.entries(m.kits);
    expect(kits.length).toBeGreaterThan(0);
    for (const [kit, models] of kits) for (const model of models) {
      expect(creditForPublicPath(`models/props/${kit}/${model}.glb`)?.id, `${kit}/${model}`).toBe('kenney');
    }
  });

  it('the skins manifest: every skin map sits under the MakeHuman credit', () => {
    const m = readJson(join(PUBLIC, 'models', 'skins', 'manifest.json')) as { skins: { key: string; albedo: string }[] };
    expect(m.skins.length).toBeGreaterThan(0);
    for (const s of m.skins) expect(creditForPublicPath(s.albedo)?.id, s.key).toBe('makehuman');
  });

  it('the model sidecars: a body whose sidecar says Meshy is credited to Meshy', () => {
    let meshy = 0;
    for (const f of FILES.filter((x) => x.startsWith('models/') && x.endsWith('.json'))) {
      let doc: unknown;
      try { doc = readJson(join(PUBLIC, f)); } catch { continue; }
      const source = (doc as { source?: unknown })?.source;
      if (typeof source !== 'string') continue;
      expect(creditForPublicPath(f), f).not.toBeNull();
      if (/^meshy\b/i.test(source)) {
        meshy++;
        expect(creditForPublicPath(f)?.id, `${f}: "${source}"`).toBe('meshy');
        expect(creditForPublicPath(f.replace(/\.json$/, '.glb'))?.id, f).toBe('meshy');
      }
    }
    expect(meshy, 'the roster and crowd sidecars').toBeGreaterThan(20);
  });

  it('derived files inherit the credit of what they were made from', () => {
    // Retargeted clips name the capture they were cut from.
    for (const f of FILES.filter((x) => x.startsWith('models/clips/mocap/') && x.endsWith('.json'))) {
      const { source } = readJson(join(PUBLIC, f)) as { source: string };
      expect(creditForPublicPath(f)?.id, f).toBe(creditForPublicPath(`models/clips/${source}`)?.id);
    }
    // Baked sky domes name their source image, except one we painted ourselves.
    const baked = readJson(join(PUBLIC, 'backdrops', 'baked', 'manifest.json')) as Record<string, { file: string; source: string }>;
    for (const { file, source } of Object.values(baked)) {
      const mine = creditForPublicPath(`backdrops/baked/${file}`);
      if (mine?.status === 'first-party') continue;
      expect(mine?.id, file).toBe(creditForPublicPath(`backdrops/${source}`)?.id);
    }
  });

  it('the voice banks: every index and every bank it names is credited to Kokoro', () => {
    const idx = FILES.filter((x) => x.startsWith('audio/voice/') && x.endsWith('.json'));
    expect(idx.length).toBeGreaterThan(10);
    for (const f of idx) {
      const { bank } = readJson(join(PUBLIC, f)) as { bank?: string };
      expect(creditForPublicPath(f)?.id, f).toBe('kokoro');
      if (bank) expect(creditForPublicPath(f.replace(/[^/]+$/, bank))?.id, bank).toBe('kokoro');
    }
  });
});

describe('every licence matches the record it cites', () => {
  it('a software entry’s licence is the one its installed package declares', () => {
    const pkgs = CREDITS.filter((c) => c.npmPackage);
    expect(pkgs.length).toBeGreaterThanOrEqual(4);
    for (const c of pkgs) {
      const pkg = readJson(join(ROOT, 'node_modules', c.npmPackage!, 'package.json')) as { license?: string };
      expect(pkg.license, c.npmPackage).toBe(c.licence);
    }
  });

  it('the Basis transcoder’s README records Apache 2.0', () => {
    const readme = readFileSync(join(PUBLIC, 'loaders', 'basis', 'README.md'), 'utf8');
    expect(readme).toMatch(/## License\s+\[Apache License 2\.0\]/);
    expect(byId('basis').licence).toBe('Apache-2.0');
  });

  it('public/pose/README.md records the licence the MediaPipe entry shows, for the wasm and the pose models', () => {
    // HOTFIX (2026-09-24): the pose files are self-hosted (d03c24b3), so the README is required, not optional.
    const licence = readFileSync(join(PUBLIC, 'pose', 'README.md'), 'utf8').split(/^## License$/m)[1] ?? '';
    expect(licence).toMatch(/Tasks Vision wasm\): Apache License 2\.0/);
    expect(licence).toMatch(/Pose Landmarker models: Apache License 2\.0/);
    expect(byId('mediapipe').licence).toBe('Apache-2.0');
    expect(byId('mediapipe').recordedIn).toContain('public/pose/README.md');
  });

  it('every file an entry cites as its record exists', () => {
    for (const c of CREDITS) for (const r of c.recordedIn) {
      const path = r.replace(/\/?\*[^/]*$/, '');   // 'public/models/athletes/*.json' → the folder
      expect(existsSync(join(ROOT, path)), `${c.id}: ${r}`).toBe(true);
    }
  });

  it('a source’s own terms, and anything settled outside this repo, name the record that settles them', () => {
    for (const c of CREDITS.filter((x) => x.status === 'terms')) expect(c.evidence?.length ?? 0, c.id).toBeGreaterThan(0);
    for (const c of CREDITS) expect(c.recordedIn.length + (c.evidence?.length ?? 0), c.id).toBeGreaterThan(0);
  });
});

describe('the entries themselves', () => {
  it('have unique ids and say who made the thing and what it is used for', () => {
    expect(new Set(CREDITS.map((c) => c.id)).size).toBe(CREDITS.length);
    for (const c of CREDITS) {
      expect(c.title.trim(), c.id).not.toBe('');
      expect(c.by.trim(), c.id).not.toBe('');
      expect(c.used.trim(), c.id).not.toBe('');
    }
  });

  it('link every public licence to its own text', () => {
    for (const c of CREDITS.filter((x) => x.status === 'open')) expect(c.licenceUrl, c.id).toBe(OPEN_LICENCES[c.licence]);
  });
});
