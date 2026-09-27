# MANISK — Personal AI Operating System

Cinematic, scroll-controlled website for MANISK. Built by Lovket.

## Stack
Vite + vanilla TypeScript (no framework — ~3 kB gzipped JS). Hero = `<canvas>` driven by a JPG frame sequence.

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
