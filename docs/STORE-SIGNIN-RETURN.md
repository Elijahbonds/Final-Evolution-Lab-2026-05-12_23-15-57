Implement STORE-SIGNIN-RETURN ONLY on branch lane/store-signin-return (PR into lane/finish-release @ 418c0a75, after PR #193 STORE-PRICE-ON-CARD merged). Work in FEL-full-app.

## Specs (source of truth)
1) COACHING-UX tip 2 STORE-SIGNIN-RETURN: Signed-out Continue -> raw "unauthorized", slot lost. Breaks Mirror->book at money. On 401, show "Sign in to continue" with ?next= restoring listing + time; keep adult gate; plain under-18 copy.
2) STORE-PREFLIP-FIXES.md scope item 2: When app/api/coach-store/checkout/route.ts returns 401, the book and program forms show "Sign in to continue" with a link that brings the buyer back to the same listing and chosen time slot (put the slot in the return URL). Keep the signed-in requirement and the verified-adult check (lib/coach-store/adult.ts) exactly as they are. Creating the account after payment is NOT in scope. The 403 for "not a verified adult" shows a plain message and a link to where the birth year gets confirmed, if that page exists.

## Goal
After sign-in from the coach store, the buyer lands back on the same listing and slot with their selection kept (slot preselected).

## Allowed file areas (ONLY — coach-store files)
- FEL-full-app/components/coach-store/book-form.tsx and other coach-store form/UI components (program form, Continue handling)
- FEL-full-app/app/coach/[slug]/page.tsx
- FEL-full-app/app/coach/[slug]/programs/[lane]/page.tsx
- FEL-full-app/app/coach/[slug]/book/[listingId]/page.tsx (read slot/listing from return URL params to preselect)
- Small pure helpers under FEL-full-app/lib/coach-store/ (e.g. build/parse a safe same-origin relative next= URL; reject absolute/external next)
- Matching vitest under lib/coach-store/ or components/coach-store/

## Do NOT touch
- dunkTracker*, prove-it*, rounds summary, dunk-session*, hang*, anything under dunk-rounds
- Test-suite harness files (suite runners/configs, vitest config, gate scripts) — Claude's GATE-HANG PR #194 owns those
- prisma/, schema, migrations, lib/db.ts
- package.json, yarn.lock, any new packages
- Storage / IAM / env secrets
- lib/coach-store/adult.ts adults-only gate (leave unchanged); checkout route auth requirement unchanged
- lib/flags.ts defaults — COACH_STORE_ENABLED stays off by default; flag-off store stays
- Auth core config (NextAuth options) — only pass a callbackUrl/next through existing sign-in page
- Do not merge this PR

## Stop-and-ask
If you need schema, deps, Storage, lib/db.ts, or auth-core changes — stop and comment on the PR instead of changing them.

## PASS checks
- Signed out, Continue shows "Sign in to continue" link (no raw "unauthorized"); after sign-in the same listing opens with the same slot preselected
- next= is a same-origin relative path only (open-redirect test)
- 403 not-verified-adult shows plain copy (+ link to birth-year confirm page if it exists)
- Adults-only checkout behavior unchanged; flag-off / unpublished coach page behavior unchanged; /coach/elijahbonds stays 404 while published=false
- Self-report in the PR: tsc --noEmit, project suites, vitest, and lint results (pass/fail with counts)
- Stage only your files by explicit path (never git add -A). Do not commit public/_prisma/client/*.js or yarn.lock dirt.

Commit on lane/store-signin-return and push. Keep the PR draft until Autopilot review.
