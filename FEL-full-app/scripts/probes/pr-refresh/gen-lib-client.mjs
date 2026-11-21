// pr-refresh (2026-11-12): regenerate ONLY lib/generated/prisma from prisma/schema.prisma, the same way
// scripts/prisma-generate.mjs does (generateLibClient + normalizeClientPaths), without regenerating public/_prisma/client.
// Used when a branch changes the schema and the release's parallel client (PRISMA-PUBLIC step 1) must follow it.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIB_CLIENT, generateLibClient, normalizeClientPaths } from '../../prisma-generate.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const prismaCli = createRequire(join(APP, 'package.json')).resolve('prisma/build/index.js');
generateLibClient(prismaCli);
console.log('[gen-lib-client] normalized:', normalizeClientPaths(LIB_CLIENT).join(', ') || '(already relative)');
