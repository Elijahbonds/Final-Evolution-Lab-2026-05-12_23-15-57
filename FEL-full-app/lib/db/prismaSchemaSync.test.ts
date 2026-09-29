import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * THE DEPLOYED SCHEMA MUST MATCH THE SOURCE SCHEMA.
 *
 * The hosting packager copies `public/` out of the SOURCE TREE, while `npm run build` writes the schema copy INTO
 * public/_prisma as one of its last steps. So a schema change lands in the deployed bundle only if the copy was
 * committed — build-time is too late, the snapshot has already been taken.
 *
 * This is not hypothetical. Adding CoachInvite and CoachClient (2026-09-19) worked locally, worked against the hosted
 * database, and 500'd in production, because the function's Prisma client was generated from a copy of the schema
 * that predated both models. A test is cheaper than finding that twice.
 */
describe('the prisma schema that ships', () => {
  const source = () => readFileSync('prisma/schema.prisma', 'utf8');
  const shipped = () => readFileSync('public/_prisma/schema.prisma', 'utf8');

  it('the shipped copy differs from the source in EXACTLY one line: the generator output path', () => {
    const a = source().split('\n');
    const b = shipped().split('\n');
    expect(b.length).toBe(a.length);
    const differing = a.map((line, i) => (line === b[i] ? null : i)).filter((i): i is number => i !== null);
    // The copy sits one directory deeper, so its relative `output` needs one more hop — see copy-prisma-schema.mjs.
    // Everything else being byte-identical is the property that matters: a model added to one must reach the other.
    expect(differing).toHaveLength(1);
    expect(a[differing[0]]).toContain('output');
    expect(a[differing[0]]).toContain('../public/_prisma/client');
    expect(b[differing[0]]).toContain('./client');
  });

  it('every model in the source schema reaches the shipped one', () => {
    const models = (s: string) => [...s.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(models(shipped())).toEqual(models(source()));
  });

  it('the generated client is built from the same schema, so a new model is actually callable', () => {
    // The whole point of generating into the source tree: this file ships with the build. If it drifts from the
    // schema, production gets a client that has never heard of the newest table — which is the bug this exists for.
    const generated = readFileSync('public/_prisma/client/schema.prisma', 'utf8');
    const models = (s: string) => [...s.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(models(generated)).toEqual(models(source()));
  });

  // MIRROR-COACH P2 review (2026-09-26): model NAMES alone let a stale client through. P2 added 10 columns, 3 enums and a
  // unique key to existing models; a client generated before them has every model name and 500s on every query that
  // names a new column. So the whole schema is compared (the generator runs `prisma format`, which only moves
  // whitespace), and so is the data model the client actually runs on — fields, enums, unique keys.
  it('the generated client\'s schema is the shipped schema, character for character outside whitespace', () => {
    const squash = (s: string) => s.replace(/\s+/g, '');
    expect(squash(readFileSync('public/_prisma/client/schema.prisma', 'utf8'))).toBe(squash(shipped()));
  });

  it('the data model inside the generated client has every field, enum and unique key of the source schema', () => {
    const js = readFileSync('public/_prisma/client/index.js', 'utf8');
    const raw = /config\.runtimeDataModel = JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(js);
    expect(raw, 'runtimeDataModel in index.js').toBeTruthy();
    const dm = JSON.parse(JSON.parse(raw![1])) as {
      models: Record<string, { fields: { name: string; isUnique: boolean }[]; uniqueFields: string[][] }>;
      enums: Record<string, { values: { name: string }[] }>;
    };
    const src = source();
    const blocks = (kind: string) => [...src.matchAll(new RegExp(`^${kind}\\s+(\\w+)\\s*\\{([\\s\\S]*?)^\\}`, 'gm'))].map((m) => [m[1], m[2]] as const);
    const lines = (body: string) => body.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    for (const [name, body] of blocks('model')) {
      const fields = lines(body).filter((l) => !l.startsWith('@@')).map((l) => l.split(/\s+/)[0]).sort();
      expect(dm.models[name]?.fields.map((f) => f.name).sort(), name).toEqual(fields);
      const compound = lines(body).filter((l) => l.startsWith('@@unique(')).map((l) => /\[([^\]]*)\]/.exec(l)![1].split(',').map((x) => x.trim()));
      expect(dm.models[name].uniqueFields, name).toEqual(compound);
      const single = lines(body).filter((l) => !l.startsWith('@@') && /\s@unique\b/.test(l)).map((l) => l.split(/\s+/)[0]).sort();
      expect(dm.models[name].fields.filter((f) => f.isUnique).map((f) => f.name).sort(), name).toEqual(single);
    }
    for (const [name, body] of blocks('enum')) {
      expect(dm.enums[name]?.values.map((v) => v.name), name).toEqual(lines(body));
    }
    expect(Object.keys(dm.models).sort()).toEqual(blocks('model').map(([n]) => n).sort());
  });
});
