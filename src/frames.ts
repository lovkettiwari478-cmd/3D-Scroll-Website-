// Progressive, cached, coarse-to-fine frame loader for the hero sequence.
export interface Manifest {
  count: number; width: number; height: number;
  pad: number; prefix: string; ext: string; placeholder?: boolean;
}

export class FrameStore {
  readonly frames: (HTMLImageElement | null)[];
  private requested = new Set<number>();
  private loadedCount = 0;
  onProgress?: (loaded: number, total: number) => void;
  onFrame?: (index: number) => void;

  constructor(private m: Manifest, private dir: string, private concurrency = 6) {
    this.frames = new Array(m.count).fill(null);
  }

  url(i: number) {
    return `${this.dir}${this.m.prefix}${String(i + 1).padStart(this.m.pad, '0')}.${this.m.ext}`;
  }

  /** Coarse-to-fine order: 0, last, then stride 16, 8, 4, 2, 1. Scrubbing is usable early. */
  private order(): number[] {
    const n = this.m.count, out: number[] = [], seen = new Set<number>();
    const push = (i: number) => { if (i >= 0 && i < n && !seen.has(i)) { seen.add(i); out.push(i); } };
    push(0); push(n - 1);
    for (const s of [16, 8, 4, 2, 1]) for (let i = 0; i < n; i += s) push(i);
    return out;
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
        this.frames[i] = img; this.loadedCount++;
        this.onProgress?.(this.loadedCount, this.m.count);
        this.onFrame?.(i);
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

  /** Nearest loaded frame to i (so scrubbing never shows a blank). */
  nearest(i: number): HTMLImageElement | null {
    if (this.frames[i]) return this.frames[i];
    for (let d = 1; d < this.m.count; d++) {
      const a = this.frames[i - d], b = this.frames[i + d];
      if (a) return a; if (b) return b;
    }
    return null;
  }
}
