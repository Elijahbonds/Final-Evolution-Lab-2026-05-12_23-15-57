#!/usr/bin/env bash
# scripts/binjgb-static-scan.sh — BINJGB-SHELF-1 G1(a) (Cyber A1, 2026-11-09). After `next build` and the firebase-tools
# frameworks codegen of Hosting's static layer, prove the player's bytes are NOT in anything Hosting serves as a file.
#
#   scripts/binjgb-static-scan.sh <hosting static dir> <.next/static dir> [more dirs...]
#
# For every regular file under each dir (symlinks are not followed): FAIL if its sha256 is binjgb.js's or binjgb.wasm's
# pin, or if it contains a 64-character slice of either file's base64 (the shape lib/binjgb/vendor-bytes.server.ts embeds,
# which must only ever be in the SERVER bundle). Zero hits required; a dir that is missing or empty is a FAIL too, so a
# wrong path can never pass. Prints one PASS/FAIL line per check; exits 1 on any FAIL, 2 on bad usage. Reads files only.
set -u

JS_SHA256='a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09'
WASM_SHA256='52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b'
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/third_party/binjgb"
FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

[ "$#" -ge 2 ] || { echo "usage: $0 <hosting static dir> <.next/static dir> [more dirs...]" >&2; exit 2; }
for f in binjgb.js binjgb.wasm; do [ -f "$SRC/$f" ] || { echo "missing $SRC/$f (the pinned source copy)" >&2; exit 2; }; done
[ "$(sha256_of "$SRC/binjgb.js")" = "$JS_SHA256" ] || { echo "third_party binjgb.js does not match its pin" >&2; exit 2; }
[ "$(sha256_of "$SRC/binjgb.wasm")" = "$WASM_SHA256" ] || { echo "third_party binjgb.wasm does not match its pin" >&2; exit 2; }

# Three 64-character slices per file from the middle of its base64, byte-0 aligned and each starting on a 100-character
# boundary, so each sits inside one of the 100-character string literals lib/binjgb/vendor-bytes.server.ts embeds (and a
# minifier keeps). A whole-file base64 (one long string) contains them too.
# F4 (Cyber review 467aa397): base64 groups 3 bytes, so the same file embedded at a 1- or 2-byte offset inside a bigger
# blob encodes to different text. Also emit the slices of the file shifted by 1 and 2 bytes (a dummy prefix, whose first
# 4 base64 characters — the only ones it touches — are dropped). 9 patterns per file.
slices() {
  local f="$1" shift_by
  for shift_by in 0 1 2; do
    { head -c "$shift_by" /dev/zero; cat "$f"; } | base64 | tr -d '\n' \
      | awk -v s="$shift_by" '{ if (s > 0) $0 = substr($0, 5); n = length($0); for (i = 1; i <= 3; i++) print substr($0, int(n * i / 400) * 100 + 1, 64) }'
  done
}
PATTERNS="$(mktemp)"; trap 'rm -f "$PATTERNS"' EXIT
{ slices "$SRC/binjgb.js"; slices "$SRC/binjgb.wasm"; } > "$PATTERNS"

for dir in "$@"; do
  if [ ! -d "$dir" ]; then fail "$dir is not a directory"; continue; fi
  n=0; hits=0
  while IFS= read -r -d '' f; do
    n=$((n + 1))
    s="$(sha256_of "$f")"
    if [ "$s" = "$JS_SHA256" ] || [ "$s" = "$WASM_SHA256" ]; then fail "$f has the sha256 of a vendored binjgb file"; hits=$((hits + 1)); fi
    if grep -qF -f "$PATTERNS" -- "$f"; then fail "$f embeds the base64 of a vendored binjgb file"; hits=$((hits + 1)); fi
  done < <(find "$dir" -type f -print0)
  if [ "$n" -eq 0 ]; then fail "$dir holds no files (wrong path?)"; continue; fi
  if [ "$hits" -eq 0 ]; then pass "$dir: $n files, no binjgb.js / binjgb.wasm bytes"; fi
  find "$dir" -iname '*binjgb*' -print | sed 's/^/INFO  name mentions binjgb: /'
done

if [ "$FAILS" -eq 0 ]; then echo "RESULT PASS (static scan)"; exit 0; fi
echo "RESULT FAIL (static scan): $FAILS hit(s)"; exit 1
