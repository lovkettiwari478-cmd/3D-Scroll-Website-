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
- `-filter Lanczos` + a mild `-unsharp` — sharper resize, micro-contrast restored without ringing.
- `-sampling-factor 1x1` — 4:4:4 chroma, so the cyan/blue UI accents don't bleed.
- `-interlace Plane` — progressive, first scan paints early.
- **Variant-aware manifest.** `variants[]` lists every set with its real dimensions;
  `pickVariant()` picks the smallest set that covers the viewport at the capped DPR, and
  steps up automatically as soon as a larger set exists. Emit one with:
  ```bash
  RETINA_WIDTH=2400 npm run frames:optimize   # needs a source at least that wide
  ```
  Manifests without `variants` still work — the old width-based path is kept as a fallback.

> The committed frames were produced before these encoder settings existed and there is no
> 1920×1080 source in the repo, so they were deliberately left untouched: re-encoding already
> downscaled JPEGs is lossy-on-lossy. Run `npm run frames:optimize` against the real source to
> pick up the quality gains.

## Deploy
- **GitHub Pages:** Settings → Pages → Source: *GitHub Actions*. Merging to `main` deploys — first copy `docs/github-pages-workflow.yml` to `.github/workflows/deploy.yml` (the agent token cannot push workflow files).
- **Vercel / Netlify:** import the repo; build `npm run build`, output `dist`.
