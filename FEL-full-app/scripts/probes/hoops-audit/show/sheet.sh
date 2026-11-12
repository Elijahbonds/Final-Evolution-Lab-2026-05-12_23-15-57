#!/bin/bash
# hoops-audit-show (2026-11-12): a captioned contact sheet (JPG) of the worst sights, with ImageMagick (the system's; Pillow on this
# box has no compiled core).
#   scripts/probes/hoops-audit/show/sheet.sh <out.jpg> <cols> <tile width> "<image>[@WxH+X+Y]|<caption>" ...
# @WxH+X+Y crops the source first (source pixels) to zoom into one detail. Each tile is scaled to the tile width with its caption under it.
set -eu
out=$1; cols=$2; tw=$3; shift 3
tmp=$(mktemp -d); i=0
for arg in "$@"; do
  img=${arg%%|*}; cap=${arg#*|}; crop=""
  case "$img" in *@*) crop=${img#*@}; img=${img%@*};; esac
  f=$(printf '%s/t%03d.jpg' "$tmp" $i)
  if [ -n "$crop" ]; then convert "$img" -crop "$crop" +repage -resize "${tw}x" "$f"; else convert "$img" -resize "${tw}x" "$f"; fi
  convert "$f" -background '#0e0e12' -fill '#f0f0f0' -font DejaVu-Sans-Bold -pointsize $((tw / 36 > 13 ? tw / 36 : 13)) -size "${tw}x" caption:"$cap" -gravity center -append "$f"
  i=$((i + 1))
done
montage "$tmp"/t*.jpg -tile "${cols}x" -geometry "+8+8" -background '#0e0e12' -quality 84 "$out"
rm -rf "$tmp"
echo "wrote $out"
