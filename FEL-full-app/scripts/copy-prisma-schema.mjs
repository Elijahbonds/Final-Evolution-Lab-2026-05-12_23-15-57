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
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.env.NEXT_DIST_DIR || '.next';
const src = join('prisma', 'schema.prisma');
if (!existsSync(src)) { console.error(`[prisma-schema] ${src} missing`); process.exit(1); }
const destDir = join(dist, 'prisma');
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, 'schema.prisma'));
console.log(`[prisma-schema] copied ${src} -> ${join(destDir, 'schema.prisma')}`);
