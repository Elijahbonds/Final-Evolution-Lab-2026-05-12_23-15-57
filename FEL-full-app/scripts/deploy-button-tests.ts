// The deploy button (.github/workflows/deploy.yml + scripts/deploy/live-env.mjs). docs/DEPLOY-BUTTON.md.
// Guards the workflow's safety shape and the env-file builder, which decides what production env ships.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as liveEnv from './deploy/live-env.mjs';

const APP = path.resolve(__dirname, '..');
let pass = 0;
function ok(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ok  ${name}`);
}

console.log('deploy-button: the workflow');
const wf = fs.readFileSync(path.join(APP, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
const code = wf.replace(/^\s*#.*$/gm, '');
const ci = fs.readFileSync(path.join(APP, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

ok('manual only: workflow_dispatch, never push or pull_request', () => {
  assert.match(wf, /^on:\n {2}workflow_dispatch:/m);
  assert.ok(!/^\s*(push|pull_request|pull_request_target|schedule):/m.test(code));
});

ok('dry-run is the default mode', () => {
  assert.match(wf, /options: \[dry-run, deploy\]\n\s+default: dry-run/);
  assert.match(code, /if \[ "\$MODE" = "dry-run" \]; then args\+=\(--dry-run\); fi/);
});

ok('least privilege, one deploy at a time, pinned actions', () => {
  assert.match(wf, /^permissions: \{\}$/m);
  assert.match(wf, /^concurrency:\n {2}group: deploy-production\n {2}cancel-in-progress: false$/m);
  const uses = wf.match(/uses: \S+/g) ?? [];
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} is not pinned to a commit`);
  assert.match(wf, /FIREBASE_TOOLS: firebase-tools@\d+\.\d+\.\d+$/m);
});

ok('secrets sit behind the production-deploy environment, and the main-only check runs first', () => {
  assert.match(wf, /^ {4}environment: production-deploy$/m);
  const refCheck = wf.indexOf('refs/heads/main) ;;');
  assert.ok(refCheck > 0);
  for (const s of ['secrets.FIREBASE_SERVICE_ACCOUNT', 'secrets.FEL_PROD_ENV']) {
    assert.ok(wf.indexOf(s) > refCheck, `${s} is read after the ref check`);
  }
});

ok('ships the committed Prisma client, deploys hosting only, checks the live site', () => {
  assert.match(code, /git diff --exit-code -- public\/_prisma/);
  assert.match(code, /deploy --only hosting --project "\$PROJECT"/);
  assert.match(code, /for p in \/api\/health \/ \/play\/venice/);
});

ok('the env file is validated before the deploy step, and no value is printed', () => {
  assert.ok(code.indexOf('live-env.mjs --check .env.production') < code.indexOf('firebase deploy'));
  assert.ok(!/cat \.env|echo "\$PROD_ENV"|printenv/.test(code));
  assert.match(code, /cut -d= -f1 \.env\.production/);
});

ok('ci.yml never sees the deploy secrets', () => {
  assert.ok(!ci.includes('FIREBASE_SERVICE_ACCOUNT'));
  assert.ok(!ci.includes('FEL_PROD_ENV'));
});

console.log('deploy-button: the env file');

ok('live env: reserved keys dropped, Secret Manager bindings left to firebase.json', () => {
  const svc = { spec: { template: { spec: { containers: [{ env: [
    { name: 'NEXTAUTH_SECRET', value: 'abc' },
    { name: 'FIREBASE_CONFIG', value: '{}' },
    { name: 'K_SERVICE', value: 'ssr' },
    { name: 'X_GOOGLE_THING', value: '1' },
    { name: '__FIREBASE_FRAMEWORKS_ENTRY__', value: 'next' },
    { name: 'COACH_STORE_RECONCILE_SECRET', valueFrom: { secretKeyRef: { name: 'x', key: 'latest' } } },
    { name: 'CLOUD_SQL_INSTANCE', value: 'p:r:i' },
  ] }] } } } };
  const r = liveEnv.envFromService(svc);
  assert.deepStrictEqual(r.out.map((x: string[]) => x[0]), ['NEXTAUTH_SECRET', 'CLOUD_SQL_INSTANCE']);
  assert.deepStrictEqual(r.bound, ['COACH_STORE_RECONCILE_SECRET']);
});

ok('live env: a value dotenv cannot carry byte-exactly is refused', () => {
  for (const v of ['a$b', 'a"b', 'a\\b', 'a\nb', 'a`b']) assert.ok(liveEnv.unsafeValue(v), v);
  for (const v of ['postgresql://u:p@10.0.0.1:5432/db?sslmode=require', 'a b #c', 'https://x.y/z?a=1&b=2']) {
    assert.ok(!liveEnv.unsafeValue(v), v);
  }
});

ok('check: a local database (the 2026-09-15 outage) stops the deploy', () => {
  const p = liveEnv.checkRows(liveEnv.parseEnvFile('NEXTAUTH_SECRET=x\nDATABASE_URL="postgresql://u:p@127.0.0.1:5432/db"\n'));
  assert.ok(p.some((s: string) => /local database/.test(s)));
});

ok('check: missing login secret, missing database, reserved or duplicate keys stop the deploy', () => {
  assert.ok(liveEnv.checkRows(liveEnv.parseEnvFile('DATABASE_URL=postgresql://u:p@db.example:5432/x\n')).some((s: string) => /NEXTAUTH_SECRET/.test(s)));
  assert.ok(liveEnv.checkRows(liveEnv.parseEnvFile('NEXTAUTH_SECRET=x\n')).some((s: string) => /no database/.test(s)));
  assert.ok(liveEnv.checkRows(liveEnv.parseEnvFile('NEXTAUTH_SECRET=x\nCLOUD_SQL_INSTANCE=a\nPORT=1\n')).some((s: string) => /reserved/.test(s)));
  assert.ok(liveEnv.checkRows(liveEnv.parseEnvFile('NEXTAUTH_SECRET=x\nNEXTAUTH_SECRET=y\nCLOUD_SQL_INSTANCE=a\n')).some((s: string) => /twice/.test(s)));
});

ok('check: a production-shaped file passes', () => {
  const f = '# prod\nNEXTAUTH_SECRET="s"\nNEXTAUTH_URL=https://final-evolution-lab.web.app\nDATABASE_URL="postgresql://u:p@10.1.2.3:5432/fel?connection_limit=5"\nexport NEXT_PUBLIC_X=1\n';
  assert.deepStrictEqual(liveEnv.checkRows(liveEnv.parseEnvFile(f)), []);
});

console.log(`\ndeploy-button: ${pass} checks passed`);
