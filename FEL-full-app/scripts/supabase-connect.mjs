// Write the Supabase connection strings into .env.local (2026-09-12).
//
// The password is typed into YOUR terminal with echo off and goes straight to
// .env.local. It is never printed, never logged, and never passes through the
// assistant's conversation.
//
//   node scripts/supabase-connect.mjs
//
// Project: "Final Evolution LAB" (ref gixblzifegglbcpombpw, us-west-2).
// Override with:  PROJECT_REF=xxx REGION=us-west-2 node scripts/supabase-connect.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const REF = process.env.PROJECT_REF || 'gixblzifegglbcpombpw';
const REGION = process.env.REGION || 'us-west-2';
const POOLER = `aws-0-${REGION}.pooler.supabase.com`;

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let shown = false;
    rl._writeToOutput = function (s) {
      if (!shown && s.includes(prompt)) { shown = true; rl.output.write(prompt); }
      else if (s.trim().length) rl.output.write('*');
    };
    rl.question(prompt, (a) => { rl.output.write(String.fromCharCode(10)); rl.close(); resolve(a.trim()); });
  });
}

const pw = await askHidden(`Database password for project ${REF}: `);
if (!pw) { console.error('no password given - nothing written'); process.exit(1); }

// Supabase passwords routinely contain @ : / ? # & which silently corrupt a URL
const enc = encodeURIComponent(pw);
const DATABASE_URL = `postgresql://postgres.${REF}:${enc}@${POOLER}:6543/postgres?pgbouncer=true&connection_limit=1`;
const DIRECT_URL = `postgresql://postgres.${REF}:${enc}@${POOLER}:5432/postgres`;

const f = '.env.local';
if (existsSync(f)) copyFileSync(f, f + '.bak');
const kept = (existsSync(f) ? readFileSync(f, 'utf8').split(String.fromCharCode(10)) : [])
  .filter((l) => !/^(DATABASE_URL|DIRECT_URL)=/.test(l.trim()))
  .filter((l) => l.trim() !== '');
const out = kept.concat([`DATABASE_URL="${DATABASE_URL}"`, `DIRECT_URL="${DIRECT_URL}"`, '']);
writeFileSync(f, out.join(String.fromCharCode(10)));

console.log('');
console.log(`OK  wrote DATABASE_URL (pooled :6543, pgbouncer) and DIRECT_URL (direct :5432) to ${f}`);
console.log(`    host: ${POOLER}   (previous file backed up to ${f}.bak)`);
console.log('');
console.log('Next:  node scripts/setup-supabase.mjs');
