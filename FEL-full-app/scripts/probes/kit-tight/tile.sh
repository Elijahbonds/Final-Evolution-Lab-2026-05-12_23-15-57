#!/bin/bash
# KIT-TIGHT: tile pick.sh's shots into pick-closeups.jpg (three columns a cell) and pick-phone.jpg (the far phone frames, cropped and enlarged).
S=/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/kit-tight
P=$S/pick; mkdir -p $P/img
node -e '
const fs=require("fs"),dir=process.argv[1];
for (const n of ["today","new","new50"]) { const c=JSON.parse(fs.readFileSync(`${dir}/${n}.json`)); c.forEach((x,i)=>{ if(!x.shot) return; fs.writeFileSync(`${dir}/img/${String(i).padStart(2,"0")}-${n}.jpg`, Buffer.from(x.shot.split(",")[1],"base64")); fs.writeFileSync(`${dir}/img/${String(i).padStart(2,"0")}.txt`, `${x.subject} · ${x.tier} · ${x.pose}`); }); }' $P
rows=(); for t in $P/img/*.txt; do i=$(basename $t .txt); lab=$(cat $t)
  convert \( $P/img/$i-today.jpg -resize 360x \) \( $P/img/$i-new.jpg -resize 360x \) \( $P/img/$i-new50.jpg -resize 360x \) +append -background '#111' -fill white -pointsize 18 label:"$lab   —   (1) today   |   (2) new garments   |   (3) new, 0.5 lift" +swap -gravity west -append $P/img/row-$i.jpg
  rows+=($P/img/row-$i.jpg); done
n=${#rows[@]}
convert "${rows[@]:0:$((n-2))}" -append -quality 82 $S/pick-closeups.jpg
convert "${rows[@]:$((n-2))}" -append -quality 82 $S/pick-phone.jpg
ls -la $S/pick-closeups.jpg $S/pick-phone.jpg | awk '{print $5, $9}'
