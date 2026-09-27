#!/usr/bin/env bash
# Usage: bash scripts/optimize-frames.sh <dir-with-source-jpgs>
# Resizes the real MANISK frames into desktop (1600w) and mobile (960w) sets,
# renames to frame_0001.jpg..., and writes public/frames/manifest.json.
set -e
SRC=${1:-source-frames}; OUT=public/frames
rm -rf $OUT/desktop $OUT/mobile; mkdir -p $OUT/desktop $OUT/mobile
i=0
for f in $(ls "$SRC"/*.jp*g | sort -V); do
  i=$((i+1)); n=$(printf "frame_%04d.jpg" $i)
  convert "$f" -resize '1600x>' -quality 72 -interlace Plane -strip $OUT/desktop/$n
  convert "$f" -resize '960x>'  -quality 68 -interlace Plane -strip $OUT/mobile/$n
done
read W H < <(identify -format "%w %h" $OUT/desktop/frame_0001.jpg)
printf '{ "count": %d, "width": %d, "height": %d, "pad": 4, "prefix": "frame_", "ext": "jpg", "placeholder": false }\n' $i $W $H > $OUT/manifest.json
echo "Frames: $i  ${W}x${H}"; du -sh $OUT/desktop $OUT/mobile
