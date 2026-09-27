import './style.css';
import { FrameStore, type Manifest } from './frames';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const BASE = import.meta.env.BASE_URL;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------- NAV ---------- */
const nav = $('[data-nav]');
const menuBtn = $<HTMLButtonElement>('[data-menu]');
const setMenu = (open: boolean) => {
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('lock', open);
};
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });
$('[data-year]').textContent = String(new Date().getFullYear());

/* ---------- REVEALS ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  (el as HTMLElement).style.setProperty('--d', `${(i % 4) * 70}ms`);
  io.observe(el);
});
requestAnimationFrame(() => document.body.classList.add('ready'));

/* ---------- CARD POINTER GLOW (fine pointers only) ---------- */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('.card').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/* ---------- HERO SEQUENCE ---------- */
const hero = $('[data-hero]');
const stage = $('[data-stage]');
const heroUI = $('[data-hero-ui]');
const canvas = $<HTMLCanvasElement>('[data-canvas]');
const ctx = canvas.getContext('2d', { alpha: false })!;
const loader = $('[data-loader]');
const loadPct = $('[data-load-pct]');
const frameLabel = $('[data-frame-label]');
const progressBar = $('[data-progress]');
const scrollHint = $('[data-scroll-hint]');
const parallaxEls = document.querySelectorAll<HTMLElement>('[data-parallax]');

async function initHero() {
  const manifest: Manifest = await fetch(`${BASE}frames/manifest.json`).then((r) => r.json());
  const conn = (navigator as any).connection;
  const small = innerWidth < 768 || conn?.saveData || /2g/.test(conn?.effectiveType || '');
  const store = new FrameStore(manifest, `${BASE}frames/${small ? 'mobile' : 'desktop'}/`, small ? 4 : 6);
  const last = manifest.count - 1;

  let target = 0, current = 0, drawn = -1, raf = 0, w = 0, h = 0;
  let isReduced = reduced.matches;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    drawn = -1; draw(Math.round(current));
  };

  // Aspect-preserving fit. Landscape: cover. Portrait: keep the subject large
  // without cropping it to a sliver — fit to ~62% of height and let the black bg + vignette extend it.
  const draw = (i: number) => {
    const img = store.nearest(i);
    if (!img || !w) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const portrait = h > w * 1.1;
    const s = portrait ? Math.max(w / iw, (h * 0.62) / ih) : Math.max(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    const dx = (w - dw) / 2, dy = portrait ? h * 0.42 - dh / 2 : (h - dh) / 2;
    ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, dx, dy, dw, dh);
    drawn = i;
  };

  const progress = () => {
    const r = hero.getBoundingClientRect();
    const total = hero.offsetHeight - innerHeight;
    return total > 0 ? clamp(-r.top / total) : 0;
  };

  // Scroll → target; only runs an rAF loop while interpolating, then sleeps.
  const tick = () => {
    const diff = target - current;
    current = Math.abs(diff) < 0.05 || isReduced ? target : current + diff * 0.18;
    const idx = Math.round(current);
    if (idx !== drawn) draw(idx);
    raf = current !== target ? requestAnimationFrame(tick) : 0;
  };

  const onScroll = () => {
    const p = progress();
    target = isReduced ? Math.round(last * 0.5) : p * last;
    if (!raf) raf = requestAnimationFrame(tick);

    // Atmospheric layers — transforms/opacity only (compositor-friendly).
    if (!isReduced) {
      const ui = smooth(0.02, 0.22, p);
      heroUI.style.opacity = String(1 - ui);
      heroUI.style.transform = `translate3d(0, ${-ui * 60}px, 0)`;
      heroUI.style.visibility = ui >= 1 ? 'hidden' : 'visible';
      const scale = 1.1 - 0.1 * smooth(0, 0.85, p);
      const out = smooth(0.9, 1, p);
      stage.style.transform = `translate3d(0, ${-out * 40}px, 0) scale(${scale})`;
      stage.style.opacity = String(1 - out * 0.85);
      progressBar.style.transform = `scaleX(${p})`;
      frameLabel.textContent = `SEQ ${String(Math.round(p * last) + 1).padStart(3, '0')} / ${manifest.count}`;
      scrollHint.style.opacity = String(1 - smooth(0, 0.08, p));
    }
    nav.classList.toggle('scrolled', scrollY > 40);
    parallaxEls.forEach((el) => {
      const r = el.parentElement!.getBoundingClientRect();
      el.style.transform = `translate3d(0, ${r.top * Number(el.dataset.parallax)}px, 0)`;
    });
  };

  store.onProgress = (n, total) => {
    const pct = Math.round((n / total) * 100);
    loadPct.textContent = String(pct);
    if (pct >= 100 || (n > total / 4)) loader.classList.add('done');
  };
  store.onFrame = (i) => { if (drawn === -1 || Math.abs(i - target) < Math.abs(drawn - target)) draw(Math.round(current)); };

  const applyMode = () => {
    isReduced = reduced.matches;
    document.documentElement.classList.toggle('reduced', isReduced);
    if (isReduced) { heroUI.removeAttribute('style'); stage.removeAttribute('style'); }
    onScroll(); resize();
  };

  addEventListener('scroll', onScroll, { passive: true });
  new ResizeObserver(resize).observe(canvas);
  reduced.addEventListener('change', () => { applyMode(); if (!isReduced) store.start(); });

  applyMode();
  if (isReduced) {
    // Static experience: load only a single representative frame.
    await store.start(true);
    const mid = Math.round(last * 0.5);
    await new Promise<void>((res) => { const im = new Image(); im.src = store.url(mid); im.decode().then(() => { store.frames[mid] = im; res(); }).catch(() => res()); });
    loader.classList.add('done'); draw(mid);
  } else {
    await store.start();
    draw(Math.round(current));
  }
}

initHero().catch((e) => { console.warn('Hero sequence unavailable', e); loader.classList.add('done'); });
