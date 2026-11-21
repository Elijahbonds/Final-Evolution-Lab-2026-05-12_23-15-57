#!/usr/bin/env node
// The deploy button's production env file (docs/DEPLOY-BUTTON.md). Used only by .github/workflows/deploy.yml.
//
//   node scripts/deploy/live-env.mjs <service.json> <out>   write <out> from a `gcloud run services describe --format=json`
//   node scripts/deploy/live-env.mjs --check <file>         validate an env file before it ships
//
// THE REPO IS PUBLIC and run logs are public: this script never prints a value. Every value is masked with GitHub's
// `::add-mask::` command (consumed by the runner, not shown) before anything else happens, and errors name keys only.

import fs from 'node:fs';

// firebase-tools refuses these keys in a function's .env (functions/env), and the platform sets them itself.
export const RESERVED_KEYS = new Set([
  'FIREBASE_CONFIG', 'CLOUD_RUNTIME_CONFIG', 'EVENTARC_CLOUD_EVENT_SOURCE', 'ENTRY_POINT', 'GCP_PROJECT',
  'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FUNCTION_TRIGGER_TYPE', 'FUNCTION_NAME', 'FUNCTION_MEMORY_MB',
  'FUNCTION_TIMEOUT_SEC', 'FUNCTION_IDENTITY', 'FUNCTION_REGION', 'FUNCTION_TARGET', 'FUNCTION_SIGNATURE_TYPE',
  'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION', 'PORT', 'LOG_EXECUTION_ID',
]);
export const RESERVED_PREFIXES = ['X_GOOGLE_', 'FIREBASE_', 'EXT_', '__'];

export function isReserved(key) {
  return RESERVED_KEYS.has(key) || RESERVED_PREFIXES.some((p) => key.startsWith(p));
}

// A value is written as KEY="value". Both readers of the file (Next's dotenv + dotenv-expand at build, and
// firebase-tools' own parser for the function) read that byte-exactly only when the value has none of these.
export function unsafeValue(v) {
  return /[\n\r"\\$`]/.test(v);
}

const isLocalDb = (v) => /(^|[@/])(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(v);

function mask(v) {
  if (typeof v === 'string' && v.length >= 3) process.stdout.write(`::add-mask::${v}\n`);
}

function fail(msg) {
  process.stdout.write(`::error title=deploy env::${msg}\n`);
  process.exit(1);
}

/** Live service JSON → [[key, value]] it is safe to ship, plus the keys left to Secret Manager. */
export function envFromService(svc) {
  const containers = svc?.spec?.template?.spec?.containers ?? [];
  if (containers.length !== 1) throw new Error(`expected one container, found ${containers.length}`);
  const out = [];
  const bound = [];
  for (const e of containers[0].env ?? []) {
    if (!e?.name || isReserved(e.name)) continue;
    if (e.valueFrom) { bound.push(e.name); continue; } // Secret Manager: firebase.json frameworksBackend.secrets rebinds it
    out.push([e.name, String(e.value ?? '')]);
  }
  return { out, bound };
}

export function parseEnvFile(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) { rows.push([null, null]); continue; }
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    rows.push([m[1], v]);
  }
  return rows;
}

export function checkRows(rows) {
  const problems = [];
  const keys = new Set();
  rows.forEach(([k], i) => { if (k === null) problems.push(`line ${i + 1} is not KEY=value`); });
  for (const [k, v] of rows) {
    if (k === null) continue;
    if (keys.has(k)) problems.push(`${k} appears twice`);
    keys.add(k);
    if (isReserved(k)) problems.push(`${k} is reserved by Firebase and cannot be in the env file`);
    if (k === 'DATABASE_URL' || k === 'DIRECT_URL') {
      if (isLocalDb(v)) problems.push(`${k} points at a local database (the 2026-09-15 outage)`);
    }
  }
  if (!keys.has('NEXTAUTH_SECRET')) problems.push('NEXTAUTH_SECRET is missing (login would break)');
  if (!keys.has('DATABASE_URL') && !keys.has('CLOUD_SQL_INSTANCE')) problems.push('no database setting (DATABASE_URL or CLOUD_SQL_INSTANCE)');
  return problems;
}

function main(argv) {
  if (argv[0] === '--check') {
    const rows = parseEnvFile(fs.readFileSync(argv[1], 'utf8'));
    for (const [, v] of rows) mask(v);
    const problems = checkRows(rows);
    if (problems.length) fail(`the env file will not ship: ${problems.join('; ')}`);
    process.stdout.write(`env file ok: ${rows.length} keys\n`);
    return;
  }
  const [svcPath, outPath] = argv;
  if (!svcPath || !outPath) fail('usage: live-env.mjs <service.json> <out> | --check <file>');
  let res;
  try { res = envFromService(JSON.parse(fs.readFileSync(svcPath, 'utf8'))); } catch (e) { fail(`could not read the live service: ${e.message}`); }
  for (const [, v] of res.out) mask(v);
  const unsafe = res.out.filter(([, v]) => unsafeValue(v)).map(([k]) => k);
  if (unsafe.length) {
    fail(`these live values cannot be written to a dotenv file byte-exactly: ${unsafe.join(', ')}. Set the FEL_PROD_ENV secret (docs/DEPLOY-BUTTON.md) instead.`);
  }
  const body = res.out.map(([k, v]) => `${k}="${v}"`).join('\n') + '\n';
  fs.writeFileSync(outPath, body, { mode: 0o600 });
  process.stdout.write(`wrote ${res.out.length} keys from the live function; left to Secret Manager: ${res.bound.join(', ') || 'none'}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
