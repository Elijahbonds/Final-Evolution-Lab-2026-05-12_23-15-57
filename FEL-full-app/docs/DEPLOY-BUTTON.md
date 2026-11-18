# The deploy button: ship `main` from GitHub, no Mac needed

Owner decision 2026-11-18: "GitHub deploy button". The workflow is `.github/workflows/deploy.yml`. It runs only when
someone presses **Run workflow** (or the coordinator dispatches it); a push to `main` still deploys nothing.

| Mode | What it does |
|---|---|
| `dry-run` (default) | Installs, builds, and runs `firebase deploy --dry-run`. The live site does not change. Use it first. |
| `deploy` | The real deploy (`firebase deploy --only hosting --project final-evolution-lab --force`), then a live check of `/api/health`, `/`, `/play/venice` and `/try`. |
| `ref` (optional) | A commit on `main` to ship instead of the tip. To **roll back**, run `deploy` with the last good commit. |

What it does the same way the Mac did (`docs/LANES.md` §4):

- It ships `public/_prisma/client` exactly as committed, because the Linux engine Cloud Run loads lives there.
- It ships the **production** env file. Firebase copies the tree's `.env` files into the server function, so a deploy
  without it ships a site with no database; that happened on 2026-09-15. The file comes from either:
  1. the `FEL_PROD_ENV` secret, which is your production env file pasted whole, if you set it; or
  2. the **live** server function's own settings, read with the service account. Whatever is running now ships
     again. Anything bound to Secret Manager stays bound through `firebase.json`. If a value can't be copied into an
     env file byte-exactly (for example it contains `$`, `"` or a backslash), the job stops and asks for `FEL_PROD_ENV`.
- Before uploading, it checks the env file and stops on any of these:
  - a local database (`localhost` / `127.0.0.1`);
  - a missing `NEXTAUTH_SECRET`;
  - no database setting;
  - a key Firebase reserves;
  - a duplicate key.
- **The repo is public.** No value is ever printed: each one is masked before anything runs. The run summary lists
  the env **names** only.

## The owner's one-time setup (about 10 minutes, any browser)

### 1. Make a deploy service account and its key (Google Cloud console)

1. Open `https://console.cloud.google.com/iam-admin/serviceaccounts?project=final-evolution-lab`, then click
   **Create service account**. Name it `github-deploy`, then click **Create and continue**.
2. Grant these roles, then click **Done**:
   - Firebase Admin
   - Cloud Functions Admin
   - Cloud Run Admin
   - Service Account User
   - Artifact Registry Administrator
   - Cloud Build Editor
   - Secret Manager Admin
   - Service Usage Consumer
   
   `assumption:` this is the set a Next.js web-frameworks deploy needs. If a dry-run fails with "permission denied"
   on one more, add the role it names; the dry-run changes nothing.
3. Open the new account, then go to **Keys**, then **Add key**, then **Create new key**, choose **JSON**, and click
   **Create**. A `.json` file downloads. It is a password: don't email it or commit it.

### 2. Put it in GitHub (inside a protected environment)

1. Open `https://github.com/Elijahbonds/Final-Evolution-Lab-2026-05-12_23-15-57/settings/environments/new`.
   **Name:** `production-deploy`, exactly. Then click **Configure environment**.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**, then
   **Add deployment branch or tag rule**: `main`. Add `main` only. This rule is what keeps the key away from any
   other branch.
3. Under **Environment secrets**, click **Add environment secret**. **Name:** `FIREBASE_SERVICE_ACCOUNT`.
   **Value:** the whole contents of the `.json` file. Afterwards, delete the downloaded file.
4. Optional: add another secret, `FEL_PROD_ENV`, containing your production env file pasted whole
   (`mode-lanes/wt-webapp-deploy/FEL-full-app/.env.production`). If you skip it, the live settings are used.

### 3. The database step for PR #373

PR #373 adds a database table. Production gets it through the existing guarded job, `db-guard.yml`, which applies
only reviewed, additive SQL and never drops anything. Its one-time secret is `PROD_DIRECT_URL`, in the
`production-db` environment; `docs/DB-GUARD.md` §1.1 has the exact clicks. Database first, then the deploy that
needs it (`docs/DB-GUARD.md` §4).

## Pressing the button

1. Go to **Actions**, then **deploy**, then **Run workflow**. Keep the branch on `main` and the mode on `dry-run`.
   Run it. It should come back green.
2. Run it again with mode `deploy`. A green run means the live check passed. A red live check means the run summary
   names the page that failed: run `deploy` again with `ref` set to the previous good `main` commit to roll back.
