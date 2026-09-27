import './style.css';
import { FrameStore, type Manifest } from './frames';

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const BASE = import.meta.env.BASE_URL;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const pad3 = (n: number) => String(n).padStart(3, '0');

/* ---------- REFS ---------- */
const stage = $('[data-stage]');
const canvas = $<HTMLCanvasElement>('[data-canvas]');
const ctx = canvas.getContext('2d', { alpha: false })!;
const nav = $('[data-nav]');
const loader = $('[data-loader]');
const loadPct = $('[data-load-pct]');
const progressBar = $('[data-progress]');
const ticksBox = $('[data-ticks]');
const frameNow = $('[data-frame-now]');
const frameTotal = $('[data-frame-total]');
const chLabel = $('[data-ch-label]');
const sysChip = $('[data-sys]');
const sysState = $('[data-sys-state]');
const hint = $('[data-hint]');
const chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
const rail = $('[data-rail]');
const railBtns = [...rail.querySelectorAll<HTMLButtonElement>('button')];
const navChLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-ch-link]')];

/* ---------- STATE ---------- */
let store: FrameStore | null = null;
let last = 149;
let target = 0, current = 0, drawn = -1, raf = 0;
let cw = 0, chh = 0;
let activeCh = -1;
let chTops: number[] = [];
let online = false;
let fullLoadStarted = false;

const maxScrollNow = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);

/* ---------- FRAME DRAWING ---------- */
// Aspect-preserving fit. Landscape: cover. Portrait: keep the subject large
// without cropping — fit to ~62% of height, black bg + vignette extend the rest.
function draw(i: number) {
  if (!store || !cw) return;
  const img = store.nearest(clamp(Math.round(i), 0, last));
  if (!img) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const portrait = chh > cw * 1.1;
  const s = portrait ? Math.max(cw / iw, (chh * 0.62) / ih) : Math.max(cw / iw, chh / ih);
  const dw = iw * s, dh = ih * s;
  const dx = (cw - dw) / 2, dy = portrait ? chh * 0.42 - dh / 2 : (chh - dh) / 2;
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, cw, chh);
  ctx.drawImage(img, dx, dy, dw, dh);
  drawn = i;
  if (!online) {
    online = true;
    sysState.textContent = 'ONLINE';
    sysChip.classList.add('online');
    loader.classList.add('done');
  }
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cw = canvas.clientWidth;
  chh = canvas.clientHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(chh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  measure();
  drawn = -1;
  draw(Math.round(current));
}

/* ---------- SCROLL → FRAMES (whole page drives the sequence) ---------- */
function tick() {
  raf = 0;
  const diff = target - current;
  current = !reduced.matches && Math.abs(diff) >= 0.04 ? current + diff * 0.14 : target;
  const idx = Math.round(clamp(current, 0, last));
  if (idx !== drawn) {
    draw(idx);
    frameNow.textContent = pad3(idx + 1);
  }
  const p = last ? current / last : 0;
  progressBar.style.transform = `scaleX(${clamp(p)})`;
  if (!reduced.matches) stage.style.transform = `scale(${(1.1 - 0.09 * p).toFixed(4)})`;
  hint.style.opacity = String(1 - smooth(0, 0.03, p));
  if (current !== target) raf = requestAnimationFrame(tick);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };

function onScroll() {
  target = clamp(scrollY / maxScrollNow()) * last;
  updateChapter();
  nav.classList.toggle('scrolled', scrollY > 40);
  schedule();
}

/* ---------- CHAPTERS ---------- */
function measure() {
  const max = maxScrollNow();
  chTops = chapters.map((c) => c.offsetTop);
  ticksBox.innerHTML = '';
  for (let i = 1; i < chTops.length; i++) {
    const t = document.createElement('i');
    t.style.left = `${clamp((chTops[i] - innerHeight * 0.5) / max) * 100}%`;
    ticksBox.appendChild(t);
  }
}

function updateChapter() {
  const mid = scrollY + innerHeight * 0.5;
  let idx = 0;
  for (let i = 0; i < chTops.length; i++) if (chTops[i] <= mid) idx = i;
  if (idx === activeCh) return;
  activeCh = idx;
  const el = chapters[idx];
  railBtns.forEach((b, i) => {
    b.classList.toggle('on', i === idx);
    if (i === idx) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
  navChLinks.forEach((a) => a.classList.toggle('on', a.dataset.chLink === el.dataset.chapter));
  chLabel.textContent = `CH ${pad3(idx + 1).slice(1)} · ${(el.dataset.chName || el.dataset.chapter || '').toUpperCase()}`;
  blip();
}

railBtns.forEach((b, i) => b.addEventListener('click', () => {
  chapters[i]?.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
}));

/* ---------- PROGRESSIVE REVEALS ---------- */
chapters.forEach((c) => {
  c.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el, i) => {
    el.style.setProperty('--d', `${Math.min(i * 90, 540)}ms`);
  });
});
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { rootMargin: '0px 0px -9% 0px', threshold: 0.12 });
document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
requestAnimationFrame(() => document.body.classList.add('ready'));

/* ---------- AMBIENT SOUND (procedural WebAudio — OFF until the user taps) ---------- */
let audio: { ctx: AudioContext; master: GainNode } | null = null;
let soundOn = false;
const soundBtn = $<HTMLButtonElement>('[data-sound]');
const soundLabel = $('[data-sound-label]');

function buildAudio() {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  const master = actx.createGain();
  master.gain.value = 0;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 760; lp.Q.value = 0.4;
  lp.connect(master); master.connect(actx.destination);
  // Detuned sine drone — slow cinematic hum.
  const drone = (freq: number, g: number) => {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const og = actx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(lp); o.start();
  };
  drone(54, 0.5); drone(54.4, 0.5); drone(108.2, 0.16); drone(27.5, 0.24);
  // Filtered noise "air", slowly swept by an LFO.
  const len = actx.sampleRate * 2;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
  const ng = actx.createGain(); ng.gain.value = 0.045;
  noise.connect(bp); bp.connect(ng); ng.connect(lp); noise.start();
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.06;
  const lfoG = actx.createGain(); lfoG.gain.value = 180;
  lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
  audio = { ctx: actx, master };
}

function blip() {
  // Soft chapter-transition tone — only while sound is on.
  if (!audio || !soundOn || reduced.matches) return;
  const { ctx: a } = audio;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = 880;
  const g = a.createGain();
  o.connect(g); g.connect(audio.master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.45, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.start(t); o.stop(t + 0.36);
}

soundBtn.addEventListener('click', () => {
  if (!audio) buildAudio();
  const a = audio!;
  if (a.ctx.state === 'suspended') void a.ctx.resume();
  soundOn = !soundOn;
  const t = a.ctx.currentTime;
  a.master.gain.cancelScheduledValues(t);
  a.master.gain.setValueAtTime(a.master.gain.value, t);
  a.master.gain.linearRampToValueAtTime(soundOn ? 0.14 : 0.0001, t + (soundOn ? 1.4 : 0.5));
  if (!soundOn) setTimeout(() => { if (!soundOn && a.ctx.state === 'running') void a.ctx.suspend(); }, 700);
  soundBtn.classList.toggle('on', soundOn);
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.setAttribute('aria-label', `Toggle ambient sound — currently ${soundOn ? 'on' : 'off'}`);
  soundLabel.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  document.body.classList.toggle('sound-on', soundOn);
});

/* ---------- CLICK RIPPLES (buttons, cards, rail — touch included) ---------- */
document.addEventListener('pointerdown', (e) => {
    if (reduced.matches) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('.btn, .rail button, .sound-btn, .card');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.left = `${e.clientX - r.left}px`;
    s.style.top = `${e.clientY - r.top}px`;
    t.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }, { passive: true });

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

/* ---------- REDUCED MOTION ---------- */
function applyMotion() {
  const r = reduced.matches;
  document.documentElement.classList.toggle('reduced', r);
  if (r) {
    stage.style.transform = '';
    current = target;
    drawn = -1;
    draw(Math.round(current));
  } else {
    startSequence();
    schedule();
  }
}
reduced.addEventListener('change', applyMotion);

function startSequence() {
  if (!store || fullLoadStarted) return;
  fullLoadStarted = true;
  void store.start();
}

/* ---------- INIT ---------- */
async function init() {
  const manifest: Manifest = await fetch(`${BASE}frames/manifest.json`).then((r) => r.json());
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const small = innerWidth < 768 || conn?.saveData || /2g/.test(conn?.effectiveType || '');
  store = new FrameStore(manifest, `${BASE}frames/${small ? 'mobile' : 'desktop'}/`, small ? 4 : 6);
  last = manifest.count - 1;
  frameTotal.textContent = String(manifest.count);

  store.onProgress = (n, total) => {
    const pct = Math.round((n / total) * 100);
    loadPct.textContent = String(pct);
    if (pct >= 20) loader.classList.add('done');
  };
  store.onFrame = (i) => {
    if (i === Math.round(current) || drawn === -1 || Math.abs(i - current) < Math.abs(drawn - current)) draw(Math.round(current));
  };

  resize();
  // Honour restored scroll position (e.g. refresh mid-page).
  current = target = clamp(scrollY / maxScrollNow()) * last;
  frameNow.textContent = pad3(Math.round(current) + 1);
  updateChapter();

  document.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', resize, { passive: true });
  addEventListener('load', () => { measure(); schedule(); });
  // Re-measure once fonts settle (layout height can shift).
  document.fonts?.ready.then(() => { measure(); schedule(); });

  if (reduced.matches) {
    // Reduced motion: load just the opening frame; the page stays fully readable.
    document.documentElement.classList.add('reduced');
    await store.start(true);
    loader.classList.add('done');
    draw(Math.round(current));
  } else {
    startSequence();
    schedule();
  }
}

$('[data-year]').textContent = String(new Date().getFullYear());
init().catch((e) => { console.warn('Frame sequence unavailable', e); loader.classList.add('done'); });
