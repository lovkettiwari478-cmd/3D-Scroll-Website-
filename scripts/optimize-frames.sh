#!/usr/bin/env bash
# Usage: bash scripts/optimize-frames.sh <dir-with-source-jpgs>
#
# Resizes the source MANISK frames into per-device sets and writes a
# variant-aware public/frames/manifest.json that the site selects from at
# runtime (see src/frames.ts → pickVariant).
#
# Encoding choices, and why:
#   -filter Lanczos          sharper than the default downscale filter; keeps
#                            edges and fine detail instead of smearing them
#   -unsharp                 a resize always loses micro-contrast — this puts
#                            it back without ringing (radius 0, mild amount)
#   -sampling-factor 1x1     4:4:4 chroma. The default 2x2 halves colour
#                            resolution, which bleeds the cyan/blue UI accents
#   -interlace Plane         progressive, so the first scan paints early
#   -strip                   drop EXIF/colour profiles we never read
#
# Env overrides:
#   DESKTOP_WIDTH (1600)  MOBILE_WIDTH (960)
#   DESKTOP_QUALITY (76)  MOBILE_QUALITY (72)
#   RETINA_WIDTH          e.g. 2400 — also emits a desktop@2x set. Only worth
#                         setting when the source is at least this wide; the
#                         manifest always reports the width actually written.
set -euo pipefail

SRC=${1:-source-frames}
OUT=public/frames
DW=${DESKTOP_WIDTH:-1600}
MW=${MOBILE_WIDTH:-960}
DQ=${DESKTOP_QUALITY:-76}
MQ=${MOBILE_QUALITY:-72}
RW=${RETINA_WIDTH:-}
SHARPEN=${SHARPEN:-0x0.6+0.5+0}

shopt -s nullglob
srcs=("$SRC"/*.jp*g)
shopt -u nullglob
if [ ${#srcs[@]} -eq 0 ]; then
  echo "No source .jpg/.jpeg frames found in '$SRC'" >&2
  exit 1
fi

rm -rf "$OUT/desktop" "$OUT/mobile" "$OUT/desktop@2x"
mkdir -p "$OUT/desktop" "$OUT/mobile"
if [ -n "$RW" ]; then mkdir -p "$OUT/desktop@2x"; fi

encode() { # $1=src $2=dest $3=width $4=quality
  convert "$1" -filter Lanczos -resize "$3x>" -unsharp "$SHARPEN" \
    -sampling-factor 1x1 -interlace Plane -strip -quality "$4" "$2"
}

i=0
while IFS= read -r -d '' f; do
  i=$((i + 1))
  n=$(printf 'frame_%04d.jpg' "$i")
  encode "$f" "$OUT/desktop/$n" "$DW" "$DQ"
  encode "$f" "$OUT/mobile/$n" "$MW" "$MQ"
  if [ -n "$RW" ]; then
    # '>' means shrink-only, so a narrow source simply passes through.
    encode "$f" "$OUT/desktop@2x/$n" "$RW" "$DQ"
  fi
done < <(printf '%s\0' "${srcs[@]}" | sort -z -V)

first=$(printf 'frame_%04d.jpg' 1)
# One identify call per set; the here-string guarantees read() sees a newline.
dims() { identify -format '%w %h' "$1"; }
read -r DW_A DH_A <<< "$(dims "$OUT/desktop/$first")"
read -r MW_A MH_A <<< "$(dims "$OUT/mobile/$first")"

# Manifest: flat fields stay for the base set; `variants` drives selection.
{
  printf '{\n'
  printf '  "count": %d,\n' "$i"
  printf '  "width": %d,\n' "$DW_A"
  printf '  "height": %d,\n' "$DH_A"
  printf '  "pad": 4,\n'
  printf '  "prefix": "frame_",\n'
  printf '  "ext": "jpg",\n'
  printf '  "placeholder": false,\n'
  printf '  "variants": [\n'
  printf '    { "dir": "mobile", "width": %d, "height": %d, "ext": "jpg", "prefix": "frame_", "pad": 4 }' "$MW_A" "$MH_A"
  if [ -n "$RW" ] && [ -d "$OUT/desktop@2x" ]; then
    read -r RW_A RH_A <<< "$(dims "$OUT/desktop@2x/$first")"
    printf ',\n    { "dir": "desktop@2x", "width": %d, "height": %d, "ext": "jpg", "prefix": "frame_", "pad": 4 }' "$RW_A" "$RH_A"
  fi
  printf ',\n    { "dir": "desktop", "width": %d, "height": %d, "ext": "jpg", "prefix": "frame_", "pad": 4 }\n' "$DW_A" "$DH_A"
  printf '  ]\n'
  printf '}\n'
} > "$OUT/manifest.json"

echo "Frames: $i  desktop ${DW_A}x${DH_A}  mobile ${MW_A}x${MH_A}"
[ -n "$RW" ] && echo "        retina ${RW_A}x${RH_A}"
du -sh "$OUT/desktop" "$OUT/mobile" 2>/dev/null || true
