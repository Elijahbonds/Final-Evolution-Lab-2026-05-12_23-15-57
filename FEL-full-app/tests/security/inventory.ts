// Writes (or checks) the route inventory in docs/SECURITY-REVIEW.md. `--write` regenerates it between its markers.
//   npx tsx tests/security/inventory.ts --write
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT, DOC, INVENTORY_END, INVENTORY_START, inventoryTable, scanAll } from './routeScan';

const file = join(APP_ROOT, DOC);
const doc = readFileSync(file, 'utf8');
const a = doc.indexOf(INVENTORY_START), b = doc.indexOf(INVENTORY_END);
if (a < 0 || b < 0) throw new Error(`${DOC} has no inventory markers`);
const next = doc.slice(0, a) + inventoryTable(scanAll()) + doc.slice(b + INVENTORY_END.length);
if (process.argv.includes('--write')) { writeFileSync(file, next); console.log(`wrote the route inventory into ${DOC}`); }
else if (next !== doc) { console.error(`${DOC}: the route inventory is stale — run npx tsx tests/security/inventory.ts --write`); process.exit(1); }
else console.log(`${DOC}: the route inventory is current`);
