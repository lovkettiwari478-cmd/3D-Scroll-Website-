// Progressive, cached, coarse-to-fine frame loader for the hero sequence.

/** A frame set at one resolution. A manifest may describe several; the best is picked at runtime. */
export interface Variant {
  /** Directory relative to the frames root, e.g. "desktop", "desktop@2x", "mobile". */
  dir: string;
  /** Natural pixel size of the frames in this set. */
  width: number;
  height: number;
  ext: string;
  prefix: string;
  pad: number;
}

export interface Manifest {
  count: number;
  // Flat fields describe a single inline set — the shape older manifests use.
  // Prefer `variants`; when present it wins and these are treated as the base set.
  width: number;
  height: number;
  pad: number;
  prefix: string;
  ext: string;
  placeholder?: boolean;
  variants?: Variant[];
}

export interface PickOptions {
  /** Device pixel ratio. */
  dpr: number;
  /** Viewport width in CSS pixels. */
  viewport: number;
  /** Small screen, save-data, or a slow connection — prefer the smallest set. */
  small?: boolean;
}

/* ------------------------------------------------------------------ *
 * Surfaces. OffscreenCanvas keeps the resample off the layout path and
 * is cheaper to hand to drawImage; fall back to a plain canvas.
 * ------------------------------------------------------------------ */
type Surface = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const hasOffscreen = typeof OffscreenCanvas !== 'undefined';

function makeSurface(w: number, h: number): Surface {
  if (hasOffscreen) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctxOf(s: Surface): AnyCtx | null {
  // Guarded so this module can be imported where the DOM is absent.
  if (typeof HTMLCanvasElement !== 'undefined' && s instanceof HTMLCanvasElement) {
    return s.getContext('2d', { alpha: false });
  }
  return (s as OffscreenCanvas).getContext('2d');
}

function paint(c: AnyCtx | null, src: CanvasImageSource, w: number, h: number) {
  if (!c) return;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, w, h);
}

/**
 * High-quality downscale. A single drawImage() scale is one bilinear resample
 * of already-DCT-blocked JPEG data, which reads soft and shimmers on fine
 * detail while scrubbing. Halving repeatedly is a box filter — each step
 * averages a 2x2 block — so detail survives and edges stay stable. Returns
 * null when no scaling is needed (1:1 or an upscale), meaning the caller
 * should draw the decoded image directly.
 */
function resample(src: CanvasImageSource, sw: number, sh: number, dw: number, dh: number): Surface | null {
  if (dw <= 0 || dh <= 0 || dw >= sw || dh >= sh) return null;
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  let made = false;
  // Halve while we stay comfortably above the target, then one exact final pass.
  while (cw >= dw * 2 && ch >= dh * 2) {
    const nw = Math.max(dw, cw >> 1);
    const nh = Math.max(dh, ch >> 1);
    const s = makeSurface(nw, nh);
    paint(ctxOf(s), cur, nw, nh);
    cur = s;
    cw = nw;
    ch = nh;
    made = true;
  }
  if (cw !== dw || ch !== dh) {
    const s = makeSurface(dw, dh);
    paint(ctxOf(s), cur, dw, dh);
    cur = s;
    made = true;
  }
  return made ? (cur as Surface) : null;
}

/* ------------------------------------------------------------------ *
 * Variant selection
 * ------------------------------------------------------------------ */
const withDefaults = (v: Partial<Variant>): Variant => ({
  dir: v.dir ?? 'desktop',
  width: v.width ?? 0,
  height: v.height ?? 0,
  ext: v.ext ?? 'jpg',
  prefix: v.prefix ?? 'frame_',
  pad: v.pad ?? 4,
});

/** Every set the manifest describes, smallest first. */
export function variants(m: Manifest): Variant[] {
  const list = m.variants?.length
    ? m.variants.map(withDefaults)
    : [withDefaults({ dir: 'desktop', width: m.width, height: m.height, ext: m.ext, prefix: m.prefix, pad: m.pad })];
  return list.sort((a, b) => a.width - b.width);
}

/**
 * Pick the set that best matches the device: the smallest one that still
 * covers the viewport at the capped DPR. Phones and save-data users never
 * pull desktop frames, and a retina screen steps up automatically as soon as
 * a larger set exists in the manifest.
 */
export function pickVariant(m: Manifest, o: PickOptions): Variant {
  const all = variants(m);
  if (o.small) return all[0];
  const need = Math.max(1, o.viewport) * Math.min(Math.max(o.dpr || 1, 1), 2);
  return all.find((v) => v.width >= need) ?? all[all.length - 1];
}

/** Legacy manifests describe one set inline — wrap it as a single variant. */
export function inlineVariant(m: Manifest, dir: string): Variant {
  return withDefaults({ dir, width: m.width, height: m.height, ext: m.ext, prefix: m.prefix, pad: m.pad });
}

/* ------------------------------------------------------------------ *
 * FrameStore
 * ------------------------------------------------------------------ */
export class FrameStore {
  readonly frames: (HTMLImageElement | null)[];
  private requested = new Set<number>();
  private loadedCount = 0;
  /** Rendered frames keyed by index, sized to the current target. */
  private cache = new Map<number, Surface>();
  private tw = 0;
  private th = 0;
  onProgress?: (loaded: number, total: number) => void;
  onFrame?: (index: number) => void;

  constructor(private m: Manifest, private v: Variant, private concurrency = 6) {
    this.frames = new Array(m.count).fill(null);
  }

  /** Natural pixel size of the current set — used for fit maths. */
  get naturalWidth() {
    return this.v.width;
  }
  get naturalHeight() {
    return this.v.height;
  }

  url(i: number) {
    return `${this.v.dir}${this.v.prefix}${String(i + 1).padStart(this.v.pad, '0')}.${this.v.ext}`;
  }

  /** Coarse-to-fine order: 0, last, then stride 16, 8, 4, 2, 1. Scrubbing is usable early. */
  private order(): number[] {
    const n = this.m.count, out: number[] = [], seen = new Set<number>();
    const push = (i: number) => { if (i >= 0 && i < n && !seen.has(i)) { seen.add(i); out.push(i); } };
    push(0); push(n - 1);
    for (const s of [16, 8, 4, 2, 1]) for (let i = 0; i < n; i += s) push(i);
    return out;
  }

  /**
   * Device-pixel size frames are rendered at. Changing it invalidates the
   * cache; entries rebuild lazily as they are next drawn.
   */
  setTarget(w: number, h: number) {
    const nw = Math.round(w);
    const nh = Math.round(h);
    if (nw === this.tw && nh === this.th) return;
    this.tw = nw;
    this.th = nh;
    this.cache.clear();
  }

  /**
   * The exact frame at i, pre-resampled to the current target size.
   * Returns null when it hasn't loaded yet — callers should hold the previous
   * frame rather than substitute a neighbouring one, which reads as the
   * content jumping while you scrub.
   *
   * `width`/`height` are always the frame's natural size so fit maths stays
   * exact; only `source` is the resampled surface.
   */
  get(i: number): { source: CanvasImageSource; width: number; height: number } | null {
    const img = this.frames[i];
    if (!img) return null;
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (!sw || !sh) return null;
    if (this.tw > 0 && this.th > 0) {
      const hit = this.cache.get(i);
      if (hit) return { source: hit, width: sw, height: sh };
      try {
        const s = resample(img, sw, sh, this.tw, this.th);
        if (s) {
          this.cache.set(i, s);
          return { source: s, width: sw, height: sh };
        }
      } catch {
        // Surface allocation failed (huge frame, low memory) — draw the raw image.
      }
    }
    return { source: img, width: sw, height: sh };
  }

  private load(i: number): Promise<void> {
    if (this.requested.has(i)) return Promise.resolve();
    this.requested.add(i);
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = this.url(i);
      const done = () => { resolve(); };
      img.decode().then(() => {
        this.frames[i] = img;
        this.loadedCount++;
        this.onProgress?.(this.loadedCount, this.m.count);
        this.onFrame?.(i);
        // Pre-render now, while we're idle, so scrubbing never pays for it.
        this.get(i);
      }).catch(() => { this.requested.delete(i); }).finally(done);
    });
  }

  /** Load frame 0 first (critical), then the rest in background with bounded concurrency. */
  async start(onlyFirst = false) {
    await this.load(0);
    if (onlyFirst) return;
    const queue = this.order();
    const worker = async () => { while (queue.length) await this.load(queue.shift()!); };
    const idle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 50));
    idle(() => { for (let k = 0; k < this.concurrency; k++) worker(); });
  }
}
