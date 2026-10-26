# Quality gates: what runs now, and the CI change for the owner

Lane `quality-gates`, round 8 (QG-01 to QG-06), 2026-10-25. Owner, quality round (2026-10-20): "Playwright E2E of the
key flows on every PR, blocking … screenshot diffs of key screens, plus one frame per mode on the static rig … a
phone-profile perf budget gate against `mobileBudget.json` … This changes the CI workflow, which counts as a
deploy-adjacent config change: show the owner the exact workflow diff."

The coordinator's rule for this lane: **do not edit `.github/workflows/**`, `firebase.json`, `package.json`, lockfiles,
`next.config.*` or the build script** (owner item OWN-22). So the gates were built to be blocking **without** a
workflow change, and the workflow change that makes them better is written out here, exactly, for the owner to apply.

## 1. What already runs on every push and PR (no workflow change)

`scripts/ci-suite.ts` runs every `scripts/*-tests.ts` in CI's "headless suites" step, and a failing suite fails the job.
`npx vitest run` runs every `tests/**/*.test.ts(x)` and `lib/**/*.test.ts(x)`. So these are live and blocking today:

| Gate | File | What fails it | CI time (measured) |
|---|---|---|---|
| E2E, the five key flows | `scripts/e2e-tests.ts` | a flow step, a page error, a request leaving the rig | 109 s |
| Visual, 7 key screens + 1 mode frame | `scripts/visual-tests.ts` | more than 1.5% of a screen changed (8% for a 3D frame) | see §6 |
| Phone perf, the sentinel mode | `scripts/perf-gate-tests.ts` | any of the five counts over the mode's `mobileBudget.json` row | see §6 |
| File size | `scripts/file-size-guard-tests.ts` | a >1,000-line file grew, or a new file crossed 1,000 | 1 s |
| Security: routes | `tests/security/route-guard.test.ts` | a route not in the review's inventory; a write route with no check | vitest |
| Security: secrets | `tests/security/secrets-in-tree.test.ts` | a live key, private key, DB password or high-entropy secret in the tree | vitest |
| Release | `lib/release/*.test.ts` | malformed release record; the rollback script picks wrong or deploys | vitest |

How the browser gates work: `scripts/e2e/rig.ts` (the static rig), `scripts/e2e/run.ts` (retries and the quarantine),
`scripts/visual/checks.ts`, `scripts/perf-gate/measure.ts`. Flaky checks: one retry per check, two per run, a pass on
retry printed as FLAKY; `tests/e2e/quarantine.json` is the owner-visible quarantine (empty), never deletion.

## 2. The workflow change (apply as one commit on a lane; the owner merges it)

Why a separate job, when the gates already block inside the headless step:

- **Evidence you can open.** A failed visual check writes `current.png` and a magenta `diff.png`; inside ci-suite those
  live only on the runner. The job uploads them as the run's artifact (14 days).
- **Room.** ci-suite gives each suite 10 minutes and runs four at a time on a 4-core runner, beside 200 other suites.
  Software GL is slow; a job of its own runs the browser checks with the whole runner.
- **Every mode, nightly.** One frame of every registry mode and every budget row takes 1–2 minutes a mode: too slow for
  each PR, right for a nightly run (and on demand from the Actions tab). Red there is a finding for the mode's lane.
- **No double run.** `FEL_SKIP_BROWSER_GATES=1` in the headless step makes the three gates step aside there
  (`scripts/e2e/run.ts`); until this diff lands that variable is unset and they run in ci-suite as now.

`git apply --check` passes on `lane/finish-release` at `e173f413`:

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -5,8 +5,12 @@
   push:
     branches: ['**']
   pull_request:
+  schedule:
+    - cron: '17 10 * * *'   # 03:17 PDT: the nightly mode sweeps (mode-sweeps job only)
+  workflow_dispatch:
 jobs:
   check:
+    if: github.event_name != 'schedule'
     runs-on: ubuntu-latest
     timeout-minutes: 45
     # The headless suites include ten that talk to Postgres through lib/db. They have no
@@ -91,6 +95,8 @@
       # database suite fatal here rather than quietly green.
       - name: headless suites
         env:
+          # the E2E, visual and perf gates run in the browser-gates job below, with their screenshots kept
+          FEL_SKIP_BROWSER_GATES: '1'
           DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
           DIRECT_URL: postgresql://ci:ci@localhost:5432/ci
           NEXTAUTH_SECRET: ci-only-not-a-secret
@@ -105,3 +111,70 @@
           NEXTAUTH_SECRET: ci-only-not-a-secret
           NEXTAUTH_URL: http://localhost:3000
         run: npx next build
+
+  # QUALITY ROUND (owner, 2026-10-20): blocking E2E, visual and perf gates on every PR (docs/QUALITY-GATES-PROPOSAL.md).
+  # Static esbuild rig + playwright-core + the runner image's Chrome: no next build, no database, no new dependency.
+  # A failure fails the PR; every check's current.png / diff.png / failure.png is kept as the run's artifact.
+  browser-gates:
+    if: github.event_name != 'schedule'
+    runs-on: ubuntu-latest
+    timeout-minutes: 40
+    defaults:
+      run:
+        working-directory: FEL-full-app
+    steps:
+      - uses: actions/checkout@v4
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+          cache-dependency-path: FEL-full-app/package-lock.json
+      - run: npm ci
+      - name: E2E — the five key flows
+        run: npx tsx scripts/e2e-tests.ts
+        env: { E2E_OUT: '${{ runner.temp }}/gates' }
+      - name: visual — key screens and the sentinel mode
+        if: always()
+        run: npx tsx scripts/visual-tests.ts
+        env: { E2E_OUT: '${{ runner.temp }}/gates' }
+      - name: perf — the sentinel mode against mobileBudget.json
+        if: always()
+        run: npx tsx scripts/perf-gate-tests.ts
+        env: { E2E_OUT: '${{ runner.temp }}/gates' }
+      - uses: actions/upload-artifact@v4
+        if: always()
+        with:
+          name: gates-${{ github.run_id }}
+          path: ${{ runner.temp }}/gates
+          retention-days: 14
+
+  # Every registry mode's frame and every budget row, re-measured: too slow for each PR (1–2 min a mode on software GL),
+  # so nightly and on demand. Red here is a finding for the mode's lane; it does not block a PR.
+  mode-sweeps:
+    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
+    runs-on: ubuntu-latest
+    timeout-minutes: 180
+    defaults:
+      run:
+        working-directory: FEL-full-app
+    steps:
+      - uses: actions/checkout@v4
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          cache: npm
+          cache-dependency-path: FEL-full-app/package-lock.json
+      - run: npm ci
+      - name: visual — one frame per mode
+        run: npx tsx scripts/visual-tests.ts --modes all
+        env: { E2E_OUT: '${{ runner.temp }}/sweeps' }
+      - name: perf — every mode with a budget row
+        if: always()
+        run: npx tsx scripts/perf-gate-tests.ts --modes all
+        env: { E2E_OUT: '${{ runner.temp }}/sweeps' }
+      - uses: actions/upload-artifact@v4
+        if: always()
+        with:
+          name: sweeps-${{ github.run_id }}
+          path: ${{ runner.temp }}/sweeps
+          retention-days: 14
```

Nothing in it deploys, reads a secret, or writes outside the runner: `npm ci`, three `npx tsx` scripts, and
`actions/upload-artifact`. The `check` job is unchanged except that it skips the nightly schedule event.

## 3. What to check after applying

1. The PR that carries the diff shows two jobs, `check` and `browser-gates`, both green, and an artifact `gates-<run>`.
2. Actions → ci → "Run workflow" on `lane/finish-release` runs `mode-sweeps` (about an hour): every mode's frame and
   every budget row. A mode with no baseline yet fails with "no baseline … run --update": baseline it from that run's
   artifact (copy `current.png` through `scripts/visual/compare.ts` `toBaseline`, or run `--update --only mode-<key>`
   on a lane box) and commit it.

## 4. Release notes in CI, and a preview channel (owner-gated, not applied)

**Notes on every PR into `lane/finish-release`** (read-only, safe): add to the `browser-gates` job, before `npm ci`,
with `fetch-depth: 0` on its checkout:

```yaml
      - name: release notes for this merge
        if: github.event_name == 'pull_request'
        run: |
          git fetch --no-tags origin main lane/finish-release
          npx tsx scripts/release-notes.ts --from origin/main --to HEAD >> "$GITHUB_STEP_SUMMARY"
```

(`release-notes.ts` needs only `tsx`; put the step after `npm ci`.)

**A preview channel per release** is a deploy: it builds the release and serves it at its own URL against the
production database and secrets. It needs a Firebase service-account secret in GitHub. If the owner wants it, a manual
workflow, `.github/workflows/release-preview.yml`:

```yaml
name: release-preview
on:
  workflow_dispatch:
    inputs:
      ref: { description: 'commit or branch to preview', required: true, default: 'lane/finish-release' }
jobs:
  preview:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
        with: { ref: '${{ inputs.ref }}' }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: FEL-full-app/package-lock.json }
      - run: npm ci
        working-directory: FEL-full-app
      - run: git checkout -- public/_prisma/client yarn.lock
        working-directory: FEL-full-app
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_FINAL_EVOLUTION_LAB }}'
          projectId: final-evolution-lab
          entryPoint: FEL-full-app
          channelId: rc
          expires: 7d
        env:
          FIREBASE_CLI_EXPERIMENTS: webframeworks
```

assumption: the web-frameworks backend deploys a separate function revision for a preview channel; check the Firebase
console after the first run that live traffic did not move. The env file the preview needs is the production one,
which CI does not have: this is why the preview is the owner's to set up, not this lane's.

## 5. HSTS (security review S-05)

First check whether production already sends it: `curl -sI https://<SITE_HOST>/ | grep -i strict-transport`. Firebase
Hosting may add it for its own domains. If it is missing:

```diff
--- a/FEL-full-app/next.config.js
+++ b/FEL-full-app/next.config.js
@@ -42,6 +42,9 @@
         { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
         { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
         { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
+        // SECURITY-REVIEW S-05 (2026-10-25): a browser that has seen this site once uses HTTPS only, for a year. Not
+        // includeSubDomains or preload: both reach other hosts and are slow to undo (docs/QUALITY-GATES-PROPOSAL.md §5).
+        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
       ],
     }];
   },
```

`lib/build-config.test.ts` pins the header list: add `'Strict-Transport-Security'` to its expected keys in the same
commit. Not `includeSubDomains` or `preload`: both reach every subdomain (the party server's host among them) and are
slow to undo.

## 6. CI calibration (filled in from the runs on this lane)

See the lane report and the commit bodies for the measured times and the planted-regression runs (each gate red on a
planted regression, green on its revert).

## Owner calls

| | Question | Options (recommended first) |
|---|---|---|
| Q-1 | Apply the §2 workflow diff? | **a) yes, as is** · b) the browser-gates job only, no nightly sweeps · c) not now (the gates still block inside ci-suite) |
| Q-2 | Release notes in the PR summary (§4)? | **a) yes** · b) no |
| Q-3 | A preview channel per release (§4)? | a) yes, manual workflow · **b) not before launch: preview = a deploy against production data** |
| Q-4 | HSTS (§5)? | **a) check with curl first; apply if missing** · b) skip |
