#!/bin/bash
# hoops-audit-play (2026-11-12): one JPG contact sheet of frame strips, a captioned row per moment (lane rule: JPG only).
#   scripts/probes/hoops-audit/sheet.sh <out.jpg> "<caption>|<frame.jpg>,<frame.jpg>,..." ["<caption>|..." ...]
# Each row is the caption over up to 8 frames scaled to 150 px high, in the order given. ImageMagick (convert / montage), which is on
# the box; nothing is added to the app.
set -e
OUT=$1; shift
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
i=0; rows=()
for spec in "$@"; do
  cap=${spec%%|*}; list=${spec#*|}; IFS=',' read -r -a frames <<< "$list"
  frames=("${frames[@]:0:8}")
  montage "${frames[@]}" -tile "${#frames[@]}x1" -geometry x150+3+3 -background '#101218' "$TMP/r$i.png"
  w=$(identify -format '%w' "$TMP/r$i.png"); h=$(identify -format '%h' "$TMP/r$i.png"); [ "$w" -lt 1180 ] && w=1180
  convert "$TMP/r$i.png" -background '#101218' -gravity west -extent "${w}x${h}" -gravity northwest -splice 0x26 -fill '#f0f0f0' -pointsize 15 -annotate +8+5 "$cap" "$TMP/c$i.png"
  rows+=("$TMP/c$i.png"); i=$((i+1))
done
convert "${rows[@]}" -background '#101218' -gravity west -append -quality 82 "$OUT"
echo "wrote $OUT $(identify -format '%wx%h' "$OUT")"
