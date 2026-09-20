// Put prisma/schema.prisma inside the build output (2026-09-12 deploy).
//
// The hosting packager copies exactly these things into the deployed function:
// .env*, next.config.js, package.json, package-lock.json, server.js, public/ and
// .next/ — no prisma/ directory. It then runs `npm install` in a clean workspace,
// which reinstalls @prisma/client and resets node_modules/.prisma to stubs. With no
// schema anywhere in the bundle, @prisma/client's own postinstall has nothing to
// generate from, so every page threw "@prisma/client did not initialize yet".
//
// .next IS copied, so the schema goes there and package.json's `prisma.schema`
// points at it. The cloud install then generates a real client, engine included.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// public/ is the only directory that reaches the deployed function intact. .next is
// copied as a curated subset and silently drops anything extra (measured: the schema
// written to .next/prisma never arrived), node_modules/.prisma is reinstalled to stubs,
// and the function's package.json has its scripts stripped.
const src = join('prisma', 'schema.prisma');
if (!existsSync(src)) { console.error(`[prisma-schema] ${src} missing`); process.exit(1); }
const destDir = join('public', '_prisma');
mkdirSync(destDir, { recursive: true });
// THE OUTPUT PATH IS RELATIVE TO THE SCHEMA FILE. This copy already lives in public/_prisma, so the client it names
// is simply ./client — whereas the source schema, two directories up, has to walk down into public/. Both name the
// same directory; copied verbatim they would not.
writeFileSync(
  join(destDir, 'schema.prisma'),
  readFileSync(src, 'utf8').replace('output   = "../public/_prisma/client"', 'output   = "./client"'),
);
console.log(`[prisma-schema] copied ${src} -> ${join(destDir, 'schema.prisma')}`);
