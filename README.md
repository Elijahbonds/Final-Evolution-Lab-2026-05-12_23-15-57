# Final Evolution Lab

The active app and game implementation lives in [`FEL-full-app/`](FEL-full-app/).

This repository also contains historical audits, root-level experiments, and archived
copies. Treat `FEL-full-app/` as the source of truth for product code, package
scripts, game routes, API routes, and verification.

## Run locally

```bash
cd FEL-full-app
npm ci
cp .env.example .env
npm run dev
```

Fill the required database and auth values in `.env` before exercising authenticated
routes such as `/play/*`, `/coach`, and training/program-builder flows.

## Verify

```bash
cd FEL-full-app
node scripts/copy-prisma-schema.mjs
npx prisma generate
npx tsc --noEmit
npx vitest run
DATABASE_URL="postgresql://ci:ci@localhost:5432/ci" \
  NEXTAUTH_SECRET="ci-only-not-a-secret" \
  NEXTAUTH_URL="http://localhost:3000" \
  NEXT_DIST_DIR=".next-verify" \
  npx next build
```

For browser/gameplay probes, start the app first and set `CHROMIUM_EXE` or
`CHROME_PATH` if Chromium is not installed in a standard system or Playwright
cache location.

## Realtime netplay

The WebSocket relay is a separate service under `FEL-full-app/server/netd/`.
Run it locally with:

```bash
cd FEL-full-app/server/netd
npm install
npm run dev
```

Point the web app at it with `NEXT_PUBLIC_NETD_URL`, for example
`ws://localhost:8080`.
