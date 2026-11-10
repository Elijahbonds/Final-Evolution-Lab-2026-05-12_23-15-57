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
#   G2 / G3 (Cyber gate ruling on the 2026-11-09 real-build run): a redirect counts only as a 308 whose Location is the
#     same-origin canonical path (relative, or exactly BASE_URL's origin); it is followed one hop and the hop must give 404
#     (off) or the expected 200 (on). Any other redirect or Location FAILs. Every vendor row, in both modes, prints an INFO
#     line with its status, Content-Type, Content-Length, byte count and body sha256; with the flag off any non-404 FAILs.
#     C2 (Cyber F2F6 review): odd spellings of /play/gb-shelf/local-frame are either not served (404 / redirect) or served
#     WITH `sandbox allow-scripts` — never the local-frame document without its sandbox.
#     C4 / G6: /play/gb-shelf/local-frame with NO cookie → 404; with a TEEN test account (FEL_GATE_TEEN_COOKIE, if a local
#     teen test account exists) → 404. Without FEL_GATE_TEEN_COOKIE the teen row prints SKIP (not a PASS, not a FAIL).
#
# Cookies (C4, Cyber F2F6 review): FEL_GATE_COOKIE / FEL_GATE_TEEN_COOKIE must be sessions of LOCAL TEST accounts on the
# local or preview database only — never Elijah's session, never a production session. Never paste them into chat, NOTES or
# logs (this script never prints them; don't run it under `bash -x`). Sign the test accounts out afterwards.
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
#   BASE_URL=http://localhost:3100 MODE=on FEL_GATE_COOKIE='<local test ADULT session>' \
#     [FEL_GATE_TEEN_COOKIE='<local test TEEN session>'] scripts/binjgb-curl-gate.sh
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
MODE="${MODE:-}"
COOKIE="${FEL_GATE_COOKIE:-}"
TEEN_COOKIE="${FEL_GATE_TEEN_COOKIE:-}"
# Which flip this MODE=on run is evidence for (Cyber C1C4 review): `local` (default, strict) = BINJGB_LOCAL_FILE_ENABLED,
# server started with BOTH flags on, teen row REQUIRED; `shelf` = BINJGB_SHELF_ENABLED only, server started with
# BINJGB_LOCAL_FILE_ENABLED=0, the local frame must 404 even for the adult, and a missing teen row is a loud SKIP.
GATE="${FEL_GATE_FOR:-local}"
FAILS=0
SKIPS=0

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
if [ "$GATE" != "shelf" ] && [ "$GATE" != "local" ]; then echo "FEL_GATE_FOR must be shelf or local" >&2; exit 2; fi
command -v curl >/dev/null || { echo "curl not found" >&2; exit 2; }

[ -f .next/BUILD_ID ] && echo "BUILD_ID $(cat .next/BUILD_ID)"
echo "BASE_URL $BASE_URL  MODE $MODE  GATE $GATE"

# HEAD-like fetch (GET, body discarded — some handlers don't answer HEAD) with the raw path kept as typed (--path-as-is).
# headers_as <cookie or empty> <path>: the cookie goes in a header only, never on the screen.
headers_as() {
  local cookie="$1" path="$2"
  if [ -n "$cookie" ]; then
    curl -s --path-as-is -o /dev/null -D - -H "Cookie: $cookie" "$BASE_URL$path" | tr -d '\r'
  else
    curl -s --path-as-is -o /dev/null -D - "$BASE_URL$path" | tr -d '\r'
  fi
}
headers() { headers_as "$COOKIE" "$1"; }
status_of() { printf '%s\n' "$1" | awk 'toupper($1) ~ /^HTTP\// {s=$2} END {print s}'; }
values_of() { printf '%s\n' "$1" | awk -v k="$(echo "$2" | tr '[:upper:]' '[:lower:]')" -F': ' 'tolower($1) == k { sub(/^[^:]*: /, ""); print }'; }

expect_404() {
  local path="$1" h s loc c
  h="$(headers "$path")"; s="$(status_of "$h")"
  if [ "$s" = "404" ]; then pass "off: $path -> 404"; return; fi
  # G2 (Cyber gate ruling, 2026-11-09): only a 308 to the same-origin canonical path counts, followed exactly one hop.
  loc="$(values_of "$h" 'Location' | tail -1)"
  if [ "$s" = "308" ] && c="$(canonical_location "$loc")"; then
    s="$(status_of "$(headers "$c")")"
    if [ "$s" = "404" ]; then pass "off: $path -> 308 $c -> 404"; else fail "off: $path -> 308 $c -> ${s:-no response} (want 404)"; fi
  else
    fail "off: $path -> ${s:-no response}${loc:+ Location $loc} (want 404; a redirect counts only as a 308 to the same-origin canonical path)"
  fi
}

# G2: a Location is the same-origin canonical path when it is a path starting with exactly one "/" (relative), or exactly
# BASE_URL's origin followed by such a path; and the path has no "%", no "//", no backslash and no "." or ".." segment.
# Prints the path to follow; returns 1 (prints nothing) for any other Location, which the caller FAILs.
canonical_location() {
  local loc="$1" origin
  origin="$(printf '%s' "$BASE_URL" | sed -E 's#^([a-z]+://[^/]+).*$#\1#')"
  case "$loc" in "$origin"/*) loc="${loc#"$origin"}" ;; esac
  case "$loc" in
    ''|//*|*'%'*|*'//'*|*\\*|*'/./'*|*'/../'*|*'/.'|*'/..') return 1 ;;
    /*) printf '%s' "$loc" ;;
    *) return 1 ;;
  esac
}

# G3 (Cyber gate ruling): every vendor row in both modes is fetched once with its body, and the status, Content-Type,
# Content-Length and body sha256 are recorded on an INFO line. fetch_row <path> sets R_STATUS R_TYPE R_LEN R_BYTES R_SHA
# R_LOC. The session cookie (if any) goes in a header only, never on the screen.
sha256_stdin() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
fetch_row() {
  local path="$1" body h
  body="$(mktemp)"
  if [ -n "$COOKIE" ]; then
    h="$(curl -s --path-as-is -o "$body" -D - -H "Cookie: $COOKIE" "$BASE_URL$path" | tr -d '\r')"
  else
    h="$(curl -s --path-as-is -o "$body" -D - "$BASE_URL$path" | tr -d '\r')"
  fi
  R_STATUS="$(status_of "$h")"; R_TYPE="$(values_of "$h" 'Content-Type' | tail -1)"; R_LEN="$(values_of "$h" 'Content-Length' | tail -1)"
  R_LOC="$(values_of "$h" 'Location' | tail -1)"; R_BYTES="$(wc -c < "$body" | tr -d ' ')"; R_SHA="$(sha256_stdin < "$body")"
  rm -f "$body"
}
record_row() { printf 'INFO  %s\n' "$MODE: $1 status=${R_STATUS:-none} type=${R_TYPE:--} length=${R_LEN:--} bytes=$R_BYTES sha256=$R_SHA${R_LOC:+ location=$R_LOC}"; }

# vendor_row <path> <want status> [<sha256 a 200 must match>]: want is 404 (flag off) or 200 (flag on). A 308 to the
# same-origin canonical path is followed one hop and the hop must give <want>; any other status or Location is a FAIL.
vendor_row() {
  local path="$1" want="$2" pin="${3:-}" c
  fetch_row "$path"; record_row "$path"
  if [ "$R_STATUS" = "308" ]; then
    if c="$(canonical_location "$R_LOC")"; then
      fetch_row "$c"; record_row "$path => $c"
    else
      fail "$MODE: $path -> 308 to a non-canonical Location: ${R_LOC:-none}"; return
    fi
  fi
  if [ "$R_STATUS" != "$want" ]; then fail "$MODE: vendor $path -> ${R_STATUS:-no response} (want $want)"; return; fi
  if [ -n "$pin" ] && [ "$R_SHA" != "$pin" ]; then fail "$MODE: vendor $path -> 200 with bytes that differ from the canonical file"; return; fi
  pass "$MODE: vendor $path -> $want"
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
    /vendor//binjgb/binjgb.wasm /play/gb-shelf /play/gb-shelf/local-frame /play/gb-shelf/any-slug \
    /vendor/binjgb/%2E%2E/binjgb/binjgb.js /vendor/%2e%2e/vendor/binjgb/binjgb.wasm /vendor/binjgb/%5Cbinjgb.js \
    /vendor/binjgb/%252E%252E/binjgb.js /%67b-shelf/x/y.bin \
    /Vendor/binjgb/binjgb.wasm /VENDOR/BINJGB/BINJGB.JS /vendor/Binjgb/binjgb.wasm /vendor/binjgb/BINJGB.WASM \
    /vendor/binjgb/binjgb.wasm/ '/vendor/binjgb/binjgb.wasm;x' '/vendor/binjgb/binjgb.wasm?x=1' ; do
    # Cyber G1 clearance (efc40be6): the case / trailing-slash / ';' / '?' rows above carry no '%', so they test the
    # matcher's case-sensitivity against a case-insensitive disk (the Mini's APFS). Middleware does not special-case them;
    # the real build decides whether that is needed.
    # G3: with the flag off, every vendor row must end in 404 (after at most one canonical 308 hop); anything else FAILs.
    case "$p" in /play/*) expect_404 "$p" ;; *) vendor_row "$p" 404 ;; esac
  done
else
  if [ -z "$COOKIE" ]; then fail "on: FEL_GATE_COOKIE not set (a LOCAL test adult account's session; C4)"; fi
  check_page /play/gb-shelf shelf
  if [ "$GATE" = "local" ]; then
    check_page /play/gb-shelf/local-frame frame
  else
    h="$(headers /play/gb-shelf/local-frame)"; s="$(status_of "$h")"
    if [ "$s" = "404" ]; then pass "on (shelf only): adult: /play/gb-shelf/local-frame -> 404"; else fail "on (shelf only): adult: /play/gb-shelf/local-frame -> ${s:-no response} (want 404; start the server with BINJGB_LOCAL_FILE_ENABLED=0)"; fi
  fi
  for p in /play/gb-shelf/local%2Dframe /play/gb-shelf/local%2dframe /play/gb-shelf//local-frame /play/gb-shelf/local-frame/ /play/%67b-shelf/local-frame /play/gb-shelf/%6Cocal-frame; do
    h="$(headers "$p")"; s="$(status_of "$h")"; c="$(values_of "$h" 'Content-Security-Policy')"
    # G2: a redirect counts only as a 308 to the same-origin canonical path; follow that one hop and judge the hop.
    if [ "$s" = "308" ]; then
      loc="$(values_of "$h" 'Location' | tail -1)"
      if hop="$(canonical_location "$loc")"; then
        h="$(headers "$hop")"; s="$(status_of "$h")"; c="$(values_of "$h" 'Content-Security-Policy')"; p="$p => 308 $hop"
      else
        fail "on: $p -> 308 to a non-canonical Location: ${loc:-none}"; continue
      fi
    fi
    case "$s" in
      404) pass "on: $p -> $s (not served unsandboxed)";;
      200) if printf '%s' "$c" | grep -q 'sandbox allow-scripts'; then pass "on: $p -> 200 sandboxed"; else fail "on: $p -> 200 WITHOUT sandbox allow-scripts"; fi;;
      *) fail "on: $p -> ${s:-no response}";;
    esac
  done
  # C4 / G6: the local frame is adults only, decided on the server.
  h="$(headers_as "" /play/gb-shelf/local-frame)"; s="$(status_of "$h")"
  if [ "$s" = "404" ]; then pass "on: no cookie: /play/gb-shelf/local-frame -> 404"; else fail "on: no cookie: /play/gb-shelf/local-frame -> ${s:-no response} (want 404)"; fi
  if [ -n "$TEEN_COOKIE" ]; then
    h="$(headers_as "$TEEN_COOKIE" /play/gb-shelf/local-frame)"; s="$(status_of "$h")"
    if [ "$s" = "404" ]; then pass "on: teen account: /play/gb-shelf/local-frame -> 404"; else fail "on: teen account: /play/gb-shelf/local-frame -> ${s:-no response} (want 404)"; fi
  else
    SKIPS=$((SKIPS + 1))
    if [ "$GATE" = "local" ]; then
      fail "on: teen account row NOT RUN (FEL_GATE_TEEN_COOKIE not set) - REQUIRED for BINJGB_LOCAL_FILE_ENABLED (G-FILE)"
    else
      printf 'SKIP  %s\n' "on: teen account row NOT RUN (FEL_GATE_TEEN_COOKIE not set) - this run does NOT count for BINJGB_LOCAL_FILE_ENABLED"
    fi
  fi
  h="$(headers /vendor/binjgb/binjgb.js)"; s="$(status_of "$h")"
  if [ "$s" = "200" ]; then pass "on: /vendor/binjgb/binjgb.js -> 200 (flag read at runtime)"; else fail "on: /vendor/binjgb/binjgb.js -> ${s:-no response} (want 200; if this build was started flag-off before, flips need a redeploy)"; fi
  # G3: the canonical vendor rows, recorded; then odd spellings. The six encoded spellings may only 404, or serve exactly the
  # canonical file's bytes (the flag is on, so that is the same allow-listed file); double-encoded, backslash and
  # dot-segment spellings must 404.
  vendor_row /vendor/binjgb/binjgb.js 200; JS_SHA="$R_SHA"
  vendor_row /vendor/binjgb/binjgb.wasm 200; WASM_SHA="$R_SHA"
  for p in /vendor%2Fbinjgb/binjgb.wasm /vendor%2fbinjgb/binjgb.js /vendor/binjgb%2Fbinjgb.js /vendor/binjgb%2fbinjgb.wasm /%76endor/binjgb/binjgb.js /vendor/%62injgb/binjgb.wasm; do
    case "$p" in *.wasm) pin="$WASM_SHA" ;; *) pin="$JS_SHA" ;; esac
    fetch_row "$p"; record_row "$p"
    if [ "$R_STATUS" = "404" ]; then pass "on: vendor $p -> 404"
    elif [ "$R_STATUS" = "200" ] && [ -n "$pin" ] && [ "$R_SHA" = "$pin" ]; then pass "on: vendor $p -> 200, same bytes as the canonical file"
    else fail "on: vendor $p -> ${R_STATUS:-no response} (want 404, or 200 with the canonical file's bytes)"; fi
  done
  for p in /vendor%252Fbinjgb/binjgb.js /vendor/binjgb/%2E%2E/binjgb/binjgb.js /vendor/%2e%2e/vendor/binjgb/binjgb.wasm /vendor/binjgb/%5Cbinjgb.js /vendor/binjgb/%252E%252E/binjgb.js; do
    vendor_row "$p" 404
  done
fi

if [ "$FAILS" -eq 0 ] && [ "$SKIPS" -gt 0 ]; then echo "RESULT PASS ($MODE, gate $GATE) WITH $SKIPS SKIP - NOT VALID FOR BINJGB_LOCAL_FILE_ENABLED"; exit 0; fi
if [ "$FAILS" -eq 0 ]; then echo "RESULT PASS ($MODE, gate $GATE)"; exit 0; fi
echo "RESULT FAIL ($MODE): $FAILS check(s) failed"; exit 1
