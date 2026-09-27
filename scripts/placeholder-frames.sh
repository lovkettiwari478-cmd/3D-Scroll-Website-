#!/usr/bin/env bash
# Generates a TEMPORARY placeholder frame sequence (replace with the real MANISK frames).
set -e
N=${N:-96}; OUT=public/frames
mkdir -p $OUT/desktop $OUT/mobile
for i in $(seq 1 $N); do
  t=$(awk "BEGIN{print ($i-1)/($N-1)}")
  r=$(awk "BEGIN{print 60+$t*300}"); a=$(awk "BEGIN{print $t*360}")
  g=$(awk "BEGIN{printf \"%d\", 20+$t*60}")
  f=$(printf "frame_%04d.jpg" $i)
  convert -size 1600x900 radial-gradient:"rgb(10,$g,$((g+30)))"-"rgb(4,5,7)" \
    -fill none -stroke "rgba(90,200,255,0.55)" -strokewidth 2 -draw "circle 800,450 $(awk "BEGIN{print 800+$r}"),450" \
    -stroke "rgba(90,200,255,0.25)" -draw "arc $(awk "BEGIN{print 800-$r*0.7}"),$(awk "BEGIN{print 450-$r*0.7}") $(awk "BEGIN{print 800+$r*0.7}"),$(awk "BEGIN{print 450+$r*0.7}") $a $(awk "BEGIN{print $a+220}")" \
    -stroke none -fill "rgba(230,245,255,0.9)" -draw "circle 800,450 $(awk "BEGIN{print 806+$t*10}"),450" \
    -fill "rgba(255,255,255,0.35)" -font DejaVu-Sans -pointsize 18 -gravity south -annotate +0+40 "PLACEHOLDER FRAME $i / $N" \
    -quality 72 -strip $OUT/desktop/$f
  convert $OUT/desktop/$f -resize 960x540 -quality 70 -strip $OUT/mobile/$f
done
