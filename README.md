# MANISK — Personal AI Operating System

Cinematic, scroll-controlled website for MANISK. Built by Lovket.

## Stack
Vite + vanilla TypeScript (no framework, no external runtime libraries — ~4 kB gzipped JS).

## How it works
The full 150-frame MANISK sequence lives on a fixed `<canvas>` stage behind the whole page.
The entire document scroll drives the sequence: scrolling down plays the frames forward,
scrolling up reverses them — normal browser scrolling, no hijacking.

- **Six chapters:** Intro · Intelligence · Execution · Security · Future · Creator
- **HUD:** top progress bar with chapter ticks, live frame counter, chapter rail,
  chapter menu, `SYS · ONLINE` status chip
- **Sound:** procedural WebAudio ambience (no audio files), **off by default** — starts
  only after the user taps the Sound button
- **Motion:** progressive reveals per chapter; full `prefers-reduced-motion` support
  (static opening frame, no autonomous animation)
- **Mobile:** serves the 960w frame set on small screens / save-data, compact HUD

## Develop
```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/
```

## Hero frames
Frames live in `public/frames/{desktop,mobile}/frame_0001.jpg…` and are described by `public/frames/manifest.json`.
The hero uses the real MANISK sequence (150 frames, 1920×1080 source). To replace it:
```bash
mkdir source-frames && cp /path/to/your/frames/*.jpg source-frames/
npm run frames:optimize   # resizes to 1600w/960w, renames, writes manifest.json
```
No code changes are required. Target budget: ≤ ~120 frames, ≤ ~60 KB/frame desktop, ≤ ~30 KB mobile.

### Frame quality

**Rendering** (`src/frames.ts`, `src/main.ts`)
- **Exact-frame gating.** `draw()` only renders the frame whose index was asked for. If it
  hasn't arrived yet the previous frame is held, rather than substituting the nearest loaded
  one — that substitution made the sequence appear to jump mid-scrub.
- **Mipmap downscale.** Frames are resampled once into a cached surface at the exact device
  resolution they occupy, by repeated halving (a box filter) rather than a single bilinear
  `drawImage` scale. Halving keeps detail and stops the shimmer you get scrubbing a 1600w
  frame into a small viewport. Surfaces are `OffscreenCanvas` where available, and rebuild
  lazily after a resize.
- **DPR-aware.** The render target follows `devicePixelRatio`, including a
  `(resolution: …dppx)` listener so dragging the window between displays re-renders crisply.

**Encoding & delivery** (`scripts/optimize-frames.sh`, `manifest.json`)
- `-filter Lanczos` — a sharper downscale than the default filter; keeps edges and fine detail.
- `-sampling-factor 1x1` — 4:4:4 chroma, so the cyan/blue UI accents don't bleed.
- `-interlace Plane` — progressive, first scan paints early.
- **No sharpening.** The MANISK masters are already clean, so an unsharp mask would only
  amplify JPEG blocking rather than recover detail. Set `SHARPEN=0x0.6+0.5+0` to opt in.
- **Variant-aware manifest.** `variants[]` lists every set with its real dimensions;
  `pickVariant()` picks the smallest set that covers the viewport at the capped DPR, and
  steps up automatically as soon as a larger set exists. Emit one with:
  ```bash
  RETINA_WIDTH=2400 npm run frames:optimize   # needs a source at least that wide
  ```
  Manifests without `variants` still work — the old width-based path is kept as a fallback.

### Regenerating the frames

The committed frames are built from the 1920×1080 MANISK masters
(`MANISK_hero_frames.zip`, 150 frames, `manisk_0001.jpg`…`manisk_0150.jpg`):

```bash
unzip MANISK_hero_frames.zip -d source-frames
npm run frames:optimize          # source-frames/ → public/frames/{desktop,mobile}/
```

Current production settings — **desktop** 1600×900, JPEG q84, 4:4:4, progressive;
**mobile** 960×540, JPEG q78, 4:4:4, progressive. Both tiers are downscaled directly from
the masters, never from each other.

The previous production set was encoded from the same masters at q72 with 4:2:0 chroma,
which measured **30.9 dB** against a master-derived reference; the current set measures
**47.6 dB**. That is the visible difference — the old frames carried clear JPEG blocking
around the glowing chest light and along panel edges, the new ones are clean.

The trade-off is size: desktop went 9.5 MB → 17.4 MB and mobile 4.5 MB → 7.4 MB
(14.0 MB → 24.9 MB total, ~64.6 KB → 119.1 KB per desktop frame). Lower the quality env
vars if you need the old footprint back.

## Deploy
- **GitHub Pages:** Settings → Pages → Source: *GitHub Actions*. Merging to `main` deploys — first copy `docs/github-pages-workflow.yml` to `.github/workflows/deploy.yml` (the agent token cannot push workflow files).
- **Vercel / Netlify:** import the repo; build `npm run build`, output `dist`.
