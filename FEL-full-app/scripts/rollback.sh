#!/usr/bin/env bash
# scripts/rollback.sh — the one-command rollback (QG-05, quality-gates lane, 2026-10-25). docs/RELEASE.md §4.
#
# Finds the commit production should go back to, VERIFIES it is safe to deploy, and prints the exact steps. It NEVER
# deploys and never pushes: the deploy is the owner's command (docs/OWNER-RUNBOOK.md §11), printed at the end.
#
#   scripts/rollback.sh                 # = --dry-run: print the rollback SHA, the checks and the steps; change nothing
#   scripts/rollback.sh --dry-run
#   scripts/rollback.sh --to <sha>      # roll back to this commit instead of the previous release
#   scripts/rollback.sh --checkout      # in the DEPLOY TREE: also check the rollback commit out (detached), restore the
#                                       # committed Prisma client, and stop before the deploy
#   --current <sha>                     # what is live now (default: this tree's HEAD, which is what it last deployed)
#   --releases <file>                   # the release record (default: lib/release/releases.json)
#
# Which commit: --to, else ROLLBACK_SHA from the environment (the SHA written down in runbook §2), else the newest
# release in lib/release/releases.json that was deployed (deployedAt set) and is not the live one.
set -euo pipefail

cd "$(dirname "$0")/.."
MODE=dry-run TO="" CURRENT="" RELEASES="lib/release/releases.json"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry-run ;;
    --checkout) MODE=checkout ;;
    --to) TO="${2:?--to needs a sha}"; shift ;;
    --current) CURRENT="${2:?--current needs a sha}"; shift ;;
    --releases) RELEASES="${2:?--releases needs a file}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "rollback: unknown argument $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

fail() { echo "ROLLBACK REFUSED: $*" >&2; exit 1; }
ok() { echo "  ✓ $*"; }
warn() { echo "  ! $*"; }

CURRENT="$(git rev-parse --verify "${CURRENT:-HEAD}^{commit}" 2>/dev/null)" || fail "the live commit ${CURRENT:-HEAD} is not a commit here (git fetch origin?)"

if [ -z "$TO" ] && [ -n "${ROLLBACK_SHA:-}" ]; then TO="$ROLLBACK_SHA"; FROM_WHERE="ROLLBACK_SHA (runbook §2)"; fi
if [ -z "$TO" ]; then
  [ -f "$RELEASES" ] || fail "no --to, no ROLLBACK_SHA, and no release record at $RELEASES"
  TO="$(node -e '
    const [file, live] = process.argv.slice(1);
    const rs = (JSON.parse(require("fs").readFileSync(file, "utf8")).releases || [])
      .filter((r) => r.deployedAt && !live.startsWith(r.sha) && !r.sha.startsWith(live))
      .sort((a, b) => (b.deployedAt + b.date).localeCompare(a.deployedAt + a.date));
    process.stdout.write(rs[0] ? rs[0].sha : "");
  ' "$RELEASES" "$CURRENT")"
  [ -n "$TO" ] || fail "no earlier deployed release in $RELEASES (mark deploys with: npx tsx scripts/release-notes.ts --deployed <sha>), and no --to or ROLLBACK_SHA"
  FROM_WHERE="the previous deployed release in $RELEASES"
fi
FROM_WHERE="${FROM_WHERE:---to}"
TARGET="$(git rev-parse --verify "$TO^{commit}" 2>/dev/null)" || fail "$TO is not a commit here (git fetch origin first)"

echo "rollback: live $CURRENT"
echo "ROLLBACK_SHA=$TARGET   (from $FROM_WHERE)"
echo "  $(git log -1 --format='%h %ad %s' --date=short "$TARGET")"
echo
echo "checks:"
[ "$TARGET" != "$CURRENT" ] || fail "the rollback commit IS the live commit"
if git merge-base --is-ancestor "$TARGET" "$CURRENT"; then ok "it is an ancestor of the live commit (a step back, not sideways)"
else warn "it is NOT an ancestor of the live commit: this is a different line, not a rollback. Check it is the commit you mean."; fi
# the trap that has cost the most deploys (/CLAUDE.md): the committed Prisma client must be in the rollback commit
for f in public/_prisma/client/schema.prisma public/_prisma/client/index.js public/_prisma/schema.prisma; do
  git cat-file -e "$TARGET:./$f" 2>/dev/null || fail "$f is not committed in $TARGET: that commit deploys a function with no query engine"
done
if git ls-tree -r --name-only "$TARGET" -- public/_prisma/client | grep -q 'libquery_engine-.*debian.*\.so\.node$'; then ok "the committed Prisma client carries the Linux (debian) engine Cloud Run loads"
else fail "no debian query engine under public/_prisma/client in $TARGET"; fi
if git diff --quiet "$TARGET" "$CURRENT" -- prisma/schema.prisma; then ok "same Prisma schema as live"
else warn "the Prisma schema differs from live. Tables added since stay in the database; the old code ignores them (runbook §11.4). Nothing is dropped by a rollback."; fi
if git diff --quiet "$TARGET" "$CURRENT" -- package-lock.json; then ok "same package-lock.json as live: no npm ci"
else warn "package-lock.json differs from live: run npm ci in the deploy tree after the checkout (step 2)"; fi
if git diff --quiet "$TARGET" "$CURRENT" -- firebase.json; then ok "same firebase.json as live (same secrets wiring)"
else warn "firebase.json differs from live: the rollback deploys the OLD hosting config (check its secrets list)"; fi
if [ "$MODE" = checkout ]; then
  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "this tree has local changes; a deploy tree must be clean (runbook §2)"
fi
echo

if [ "$MODE" = checkout ]; then
  git checkout --detach "$TARGET"
  git checkout -- public/_prisma/client yarn.lock 2>/dev/null || git checkout -- public/_prisma/client
  ok "checked out $TARGET (detached) and restored the committed Prisma client"
  echo
fi

cat <<EOF
steps (the owner runs these; this script never deploys):
  FAST (seconds, no build): send traffic back to the previous Cloud Run revision
    gcloud run services list --project final-evolution-lab --region us-central1     # the service whose name starts with ssr
    gcloud run revisions list --service <SSR_SERVICE> --project final-evolution-lab --region us-central1
    gcloud run services update-traffic <SSR_SERVICE> --to-revisions <PREVIOUS_REVISION>=100 --project final-evolution-lab --region us-central1
  CLEAN (a rebuild of the rollback commit), in the deploy tree (runbook §2 and §11):
    1. git fetch origin && git checkout --detach $TARGET        $( [ "$MODE" = checkout ] && echo '(done above)' )
    2. git diff --quiet $CURRENT HEAD -- package-lock.json || npm ci
    3. git checkout -- public/_prisma/client yarn.lock
    4. restore the env file's previous lines (runbook §10), if this release changed them
    5. npx -y firebase-tools@latest deploy --only hosting --project final-evolution-lab --force      # [DEPLOY]
    6. curl -s https://<SITE_HOST>/healthz   → a new "release" revision; then the §11.3 checks
  After: npx tsx scripts/release-notes.ts --deployed $TARGET   (so the next rollback starts from here)
EOF
