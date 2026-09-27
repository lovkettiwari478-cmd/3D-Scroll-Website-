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

## Deploy
- **GitHub Pages:** Settings → Pages → Source: *GitHub Actions*. Merging to `main` deploys — first copy `docs/github-pages-workflow.yml` to `.github/workflows/deploy.yml` (the agent token cannot push workflow files).
- **Vercel / Netlify:** import the repo; build `npm run build`, output `dist`.
