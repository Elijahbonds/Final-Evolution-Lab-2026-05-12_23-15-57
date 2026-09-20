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
  it('public/_prisma/schema.prisma is identical to prisma/schema.prisma', () => {
    const source = readFileSync('prisma/schema.prisma', 'utf8');
    const shipped = readFileSync('public/_prisma/schema.prisma', 'utf8');
    if (source !== shipped) {
      throw new Error(
        'public/_prisma/schema.prisma is stale — run `node scripts/copy-prisma-schema.mjs` and commit it, '
        + 'or production will build its Prisma client from the old schema.',
      );
    }
    expect(shipped).toBe(source);
  });

  it('every model in the source schema reaches the shipped one', () => {
    const models = (s: string) => [...s.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(models(readFileSync('public/_prisma/schema.prisma', 'utf8')))
      .toEqual(models(readFileSync('prisma/schema.prisma', 'utf8')));
  });
});
