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
});
