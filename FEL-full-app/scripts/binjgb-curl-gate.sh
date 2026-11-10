#!/usr/bin/env bash
# scripts/binjgb-curl-gate.sh — BINJGB-SHELF-1 F6 (Cyber build review dcbbec16; extends F-A / N-2). The PR-time / deploy
# gate for the Homebrew Shelf headers and its flag-off static 404s, on a REAL build (next.config.js headers only exist on
# a built server; a unit test can't see them). Prints one PASS/FAIL line per check and exits non-zero on any FAIL.
#
# NEVER point this at the live site. Run it against a local `next start` (or a preview deploy) only.
#
#   MODE=off  (BINJGB_SHELF_ENABLED unset/0 on the server)
#     /vendor/binjgb/binjgb.{js,wasm}, LICENSE, VENDOR.md and percent-encoded / double-encoded spellings → 404;
#     /play/gb-shelf and /play/gb-shelf/local-frame → 404.
#   MODE=on   (BINJGB_SHELF_ENABLED=1 and BINJGB_LOCAL_FILE_ENABLED=1; FEL_GATE_COOKIE = a signed-in ADULT session)
#     /play/gb-shelf and /play/gb-shelf/local-frame → 200, and each response has:
#       exactly ONE Permissions-Policy, containing camera=() and gamepad=(self);
#       exactly ONE Referrer-Policy, equal to no-referrer;
#       the middleware's ENFORCED CSP present ('nonce-, 'wasm-unsafe-eval', style-src 'self' 'unsafe-inline'), with no
#       'unsafe-eval' and no 'unsafe-inline' in script-src (rule 0's frame-ancestors-only CSP may be a second header);
#       local-frame: the CSP carries `sandbox allow-scripts` and never allow-same-origin (F3); the shelf's CSP: no sandbox.
#     /vendor/binjgb/binjgb.js → 200 (the flag opens the static path).
#
# Runtime flag read (F6): start ONE build with the flag off, run MODE=off; restart the SAME build (no `next build`) with
# the flag on, run MODE=on. Both PASS → the middleware reads BINJGB_SHELF_ENABLED at runtime. If MODE=on still gets 404 on
# /vendor/binjgb/binjgb.js, write "shelf flag flips need a redeploy" in the runbook. The script prints .next/BUILD_ID
# (when run from the app folder) so the two runs can be shown to be the same build.
#
# Usage (from FEL-full-app):
#   npm run build
#   BINJGB_SHELF_ENABLED=0 npx next start -p 3100 &   ;  BASE_URL=http://localhost:3100 MODE=off scripts/binjgb-curl-gate.sh
#   (stop it) BINJGB_SHELF_ENABLED=1 BINJGB_LOCAL_FILE_ENABLED=1 npx next start -p 3100 &
#   BASE_URL=http://localhost:3100 MODE=on FEL_GATE_COOKIE='next-auth.session-token=…' scripts/binjgb-curl-gate.sh
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
MODE="${MODE:-}"
COOKIE="${FEL_GATE_COOKIE:-}"
FAILS=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*) ;;
  *) if [ "${FEL_GATE_ALLOW_REMOTE:-}" != "preview" ]; then
       echo "refusing: BASE_URL must be localhost (set FEL_GATE_ALLOW_REMOTE=preview for a preview deploy; never live)" >&2
       exit 2
     fi ;;
esac
if [ "$MODE" != "on" ] && [ "$MODE" != "off" ]; then echo "MODE must be on or off" >&2; exit 2; fi
command -v curl >/dev/null || { echo "curl not found" >&2; exit 2; }

[ -f .next/BUILD_ID ] && echo "BUILD_ID $(cat .next/BUILD_ID)"
echo "BASE_URL $BASE_URL  MODE $MODE"

# HEAD-like fetch (GET, body discarded — some handlers don't answer HEAD) with the raw path kept as typed (--path-as-is).
headers() {
  local path="$1"
  if [ -n "$COOKIE" ]; then
    curl -s --path-as-is -o /dev/null -D - -H "Cookie: $COOKIE" "$BASE_URL$path" | tr -d '\r'
  else
    curl -s --path-as-is -o /dev/null -D - "$BASE_URL$path" | tr -d '\r'
  fi
}
status_of() { printf '%s\n' "$1" | awk 'toupper($1) ~ /^HTTP\// {s=$2} END {print s}'; }
values_of() { printf '%s\n' "$1" | awk -v k="$(echo "$2" | tr '[:upper:]' '[:lower:]')" -F': ' 'tolower($1) == k { sub(/^[^:]*: /, ""); print }'; }

expect_404() {
  local path="$1" h s
  h="$(headers "$path")"; s="$(status_of "$h")"
  if [ "$s" = "404" ]; then pass "off: $path -> 404"; else fail "off: $path -> ${s:-no response} (want 404)"; fi
}

check_page() {
  local path="$1" kind="$2" h s pp rp csp n_pp n_rp enforced
  h="$(headers "$path")"; s="$(status_of "$h")"
  if [ "$s" = "200" ]; then pass "on: $path -> 200"; else fail "on: $path -> ${s:-no response} (want 200; adult session cookie set?)"; fi

  pp="$(values_of "$h" 'Permissions-Policy')"; n_pp="$(printf '%s' "$pp" | grep -c . || true)"
  if [ "$n_pp" = "1" ]; then pass "on: $path exactly one Permissions-Policy"; else fail "on: $path Permissions-Policy count $n_pp (want 1): $pp"; fi
  case "$pp" in *"camera=()"*) pass "on: $path Permissions-Policy has camera=()";; *) fail "on: $path Permissions-Policy lacks camera=()";; esac
  case "$pp" in *"gamepad=(self)"*) pass "on: $path Permissions-Policy has gamepad=(self)";; *) fail "on: $path Permissions-Policy lacks gamepad=(self)";; esac
  # a server may fold two headers into one comma-joined line: the value must then still name camera exactly once, as ()
  if [ "$(printf '%s' "$pp" | grep -o 'camera=' | wc -l | tr -d ' ')" = "1" ] && ! printf '%s' "$pp" | grep -q 'camera=(self)'; then
    pass "on: $path Permissions-Policy names camera once, never camera=(self)"
  else
    fail "on: $path Permissions-Policy folded or wrong: $pp"
  fi

  rp="$(values_of "$h" 'Referrer-Policy')"; n_rp="$(printf '%s' "$rp" | grep -c . || true)"
  if [ "$n_rp" = "1" ] && [ "$rp" = "no-referrer" ]; then pass "on: $path exactly one Referrer-Policy: no-referrer"; else fail "on: $path Referrer-Policy ($n_rp): $rp"; fi

  csp="$(values_of "$h" 'Content-Security-Policy')"
  enforced="$(printf '%s\n' "$csp" | grep "'nonce-" | grep "'wasm-unsafe-eval'" || true)"
  if [ -n "$enforced" ]; then pass "on: $path middleware enforced CSP present"; else fail "on: $path middleware enforced CSP MISSING or replaced: $csp"; fi
  case "$enforced" in *"style-src 'self' 'unsafe-inline'"*) pass "on: $path CSP style-src (F1)";; *) fail "on: $path CSP lacks style-src 'self' 'unsafe-inline'";; esac
  if printf '%s' "$csp" | grep -q "'unsafe-eval'"; then fail "on: $path CSP has 'unsafe-eval'"; else pass "on: $path no 'unsafe-eval'"; fi
  if printf '%s' "$enforced" | tr ';' '\n' | grep '^ *script-src' | grep -q "'unsafe-inline'"; then fail "on: $path script-src has 'unsafe-inline'"; else pass "on: $path script-src has no 'unsafe-inline'"; fi
  if printf '%s' "$csp" | grep -q 'allow-same-origin'; then fail "on: $path CSP mentions allow-same-origin"; else pass "on: $path no allow-same-origin"; fi
  if [ "$kind" = "frame" ]; then
    case "$enforced" in *"sandbox allow-scripts"*) pass "on: $path CSP sandbox allow-scripts (F3)";; *) fail "on: $path CSP lacks sandbox allow-scripts";; esac
  else
    case "$enforced" in *"sandbox"*) fail "on: $path shelf CSP has a sandbox directive";; *) pass "on: $path shelf CSP has no sandbox";; esac
  fi
}

if [ "$MODE" = "off" ]; then
  for p in \
    /vendor/binjgb/binjgb.wasm /vendor/binjgb/binjgb.js /vendor/binjgb/LICENSE /vendor/binjgb/VENDOR.md \
    /vendor%2Fbinjgb/binjgb.wasm /vendor%2fbinjgb/binjgb.js /vendor/binjgb%2Fbinjgb.js /vendor/binjgb%2fbinjgb.wasm \
    /%76endor/binjgb/binjgb.js /vendor/%62injgb/binjgb.wasm /vendor/binjgb/binjgb%2Ewasm /vendor/binjgb/%62injgb.js \
    /vendor%252Fbinjgb/binjgb.js /vendor/binjgb/./binjgb.js /vendor/./binjgb/binjgb.wasm //vendor/binjgb/binjgb.js \
    /vendor//binjgb/binjgb.wasm /play/gb-shelf /play/gb-shelf/local-frame /play/gb-shelf/any-slug ; do
    expect_404 "$p"
  done
else
  check_page /play/gb-shelf shelf
  check_page /play/gb-shelf/local-frame frame
  h="$(headers /vendor/binjgb/binjgb.js)"; s="$(status_of "$h")"
  if [ "$s" = "200" ]; then pass "on: /vendor/binjgb/binjgb.js -> 200 (flag read at runtime)"; else fail "on: /vendor/binjgb/binjgb.js -> ${s:-no response} (want 200; if this build was started flag-off before, flips need a redeploy)"; fi
fi

if [ "$FAILS" -eq 0 ]; then echo "RESULT PASS ($MODE)"; exit 0; fi
echo "RESULT FAIL ($MODE): $FAILS check(s) failed"; exit 1
