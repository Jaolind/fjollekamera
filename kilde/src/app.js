'use strict';
/* ==========================================================================
   Fjollekameraet – betjening, kamera, album og hovedløkke
   ========================================================================== */

const $ = id => document.getElementById(id);
const els = {};
['video', 'gl', 'fx', 'flash', 'hint', 'toast', 'busy', 'busyText', 'btnSound', 'btnPick', 'btnLive', 'btnFlip',
  'rowWarp', 'rowCostume', 'btnAlbum', 'albumThumb', 'btnShutter', 'btnDice', 'start', 'demo', 'btnStart',
  'msg', 'msgTitle', 'msgText', 'msgBtns', 'album', 'albumBack', 'grid', 'albumEmpty', 'albumCount',
  'viewer', 'viewImg', 'iosTip', 'viewBack', 'viewSave', 'viewDel', 'confirm', 'delNo', 'delYes', 'file'
].forEach(id => (els[id] = $(id)));

const state = {
  mode: 'idle',            // 'live' | 'photo'
  facing: 'user',
  stream: null,
  costume: 1,
  warp: 0,
  costumeSince: 0,
  detector: null,
  detReady: false,
  detBusy: false,
  detFailed: false,
  detErrors: 0,
  pending: false,
  lastVideoTime: -1,
  view: { cw: 1, ch: 1, vw: 1, vh: 1, s: 1, ox: 0, oy: 0, mirror: true },
  noFaceSince: 0,
  muted: false,
  t0: performance.now(),
  lastNow: 0,
  photoCanvas: null,
  paused: false,
  sync: true,
  detMs: 0,
  detStart: 0,
  shownTime: -1,
  cameras: 0,
  dl: null,
  wake: null
};
let R = null;        // WebGL renderer
let g = null;        // overlay 2D context
let faces = [];

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const store = {
  get(k, d) { try { const v = localStorage.getItem('fk.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fk.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

/* ---------------- sound (made on the fly, no files) ---------------- */
const Snd = {
  ctx: null,
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  },
  tone(type, f0, f1, dur, vol, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9; gn.gain.value = vol;
    s.connect(f).connect(gn).connect(c.destination);
    s.start(t);
  },
  play(kind) {
    if (state.muted || !this.ctx) return;
    try {
      if (kind === 'pop') this.tone('sine', 520, 980, 0.09, 0.22);
      else if (kind === 'shutter') { this.noise(0.05, 0.9, 2600); this.noise(0.06, 0.7, 1700, 0.075); }
      else if (kind === 'dice') [523, 659, 784, 1047, 880].forEach((fq, i) => this.tone('triangle', fq, fq * 1.01, 0.08, 0.16, i * 0.06));
      else if (kind === 'oops') this.tone('sine', 440, 260, 0.18, 0.18);
    } catch (e) { /* ignore */ }
  }
};

/* ---------------- album: photos stay on this device ---------------- */
const Album = {
  db: null,
  mem: [],
  ready: null,
  open() {
    this.ready = new Promise(res => {
      try {
        const rq = indexedDB.open('fjollekamera', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        rq.onsuccess = () => { this.db = rq.result; res(); };
        rq.onerror = () => res();
        rq.onblocked = () => res();
      } catch (e) { res(); }
    });
    return this.ready;
  },
  req(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('photos', mode);
      const r = fn(tx.objectStore('photos'));
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  async add(blob, thumb) {
    await this.ready;
    const rec = { created: Date.now(), blob, thumb };
    if (this.db) {
      try {
        rec.id = await this.req('readwrite', s => s.add(rec));
        await this.trim();
        return rec;
      } catch (e) { /* fall back to memory */ }
    }
    rec.id = 'm' + Date.now();
    this.mem.unshift(rec);
    return rec;
  },
  async list() {
    await this.ready;
    let rows = [];
    if (this.db) { try { rows = (await this.req('readonly', s => s.getAll())) || []; } catch (e) { rows = []; } }
    return rows.concat(this.mem).sort((a, b) => b.created - a.created);
  },
  async remove(id) {
    if (typeof id === 'string') { this.mem = this.mem.filter(r => r.id !== id); return; }
    if (this.db) await this.req('readwrite', s => s.delete(id));
  },
  async trim() {
    const all = await this.list();
    for (const r of all.slice(60)) await this.remove(r.id);
  }
};

/* ---------------- helpers ---------------- */
function show(el, on = true) { el.hidden = !on; }
function toast(text, ms = 1300) {
  const t = els.toast;
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), ms);
}
function showMsg(title, text, buttons) {
  els.msgTitle.textContent = title;
  els.msgText.textContent = text;
  els.msgBtns.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'cta' + (b.secondary ? ' secondary' : '');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { show(els.msg, false); b.fn && b.fn(); });
    els.msgBtns.append(btn);
  }
  show(els.msg, true);
}
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const toBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));

/* ---------------- layout ---------------- */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const box = $('app');
  let w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
  const max = 2.8e6;
  if (w * h > max) { const k = Math.sqrt(max / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
  for (const c of [els.gl, els.fx]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  updateView();
}
function updateView() {
  const v = state.view;
  v.cw = els.gl.width; v.ch = els.gl.height;
  v.s = Math.max(v.cw / v.vw, v.ch / v.vh);
  v.ox = (v.cw - v.vw * v.s) / 2;
  v.oy = (v.ch - v.vh * v.s) / 2;
}

/* ---------------- face detection (MediaPipe Face Mesh, runs on the device) ---------------- */
function initDetector() {
  if (state.detector) return;
  if (typeof FaceMesh === 'undefined') { detFail(); return; }
  try {
    const fm = new FaceMesh({ locateFile: f => 'mp/' + f });
    fm.setOptions({ maxNumFaces: 2, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5, selfieMode: false });
    fm.onResults(onResults);
    state.detector = fm;
    fm.initialize().then(() => {
      state.detReady = true;
      updateBusy();
      if (state.mode === 'photo' && state.photoCanvas) detectPhoto();
    }).catch(err => { console.error(err); detFail(); });
  } catch (e) { console.error(e); detFail(); }
}
function detFail() {
  state.detFailed = true;
  updateBusy();
  showMsg('Fjolleansigterne kunne ikke starte', 'Kameraet virker, men filtrene kunne ikke indlæses. Tjek internetforbindelsen og prøv igen.', [
    { label: 'Prøv igen', fn: () => location.reload() },
    { label: 'Brug kameraet uden filtre', secondary: true }
  ]);
}
function updateBusy() {
  const on = state.mode !== 'idle' && !state.detReady && !state.detFailed;
  show(els.busy, on);
}
function onResults(res) {
  const now = performance.now();
  if (state.mode === 'live' && state.pending) { R.swap(); state.pending = false; }
  ingest(res.multiFaceLandmarks || [], now, state.mode === 'photo');
}
function ingest(list, now, replace) {
  const vw = state.view.vw, vh = state.view.vh;
  const dets = list.map(l => {
    const a = new Float32Array(NL * 3);
    for (let i = 0; i < NL; i++) { a[3 * i] = l[i].x * vw; a[3 * i + 1] = l[i].y * vh; a[3 * i + 2] = l[i].z * vw; }
    return a;
  });
  if (replace) faces = [];
  const used = new Set();
  for (const d of dets) {
    const U = width3(d);
    let best = null, bd = Infinity;
    for (const f of faces) {
      if (used.has(f)) continue;
      const dd = Math.hypot(f.lm[3] - d[3], f.lm[4] - d[4]);
      if (dd < bd) { bd = dd; best = f; }
    }
    if (best && bd < U * 0.7) smoothInto(best, d, U);
    else {
      best = new Face();
      best.lm.set(d);
      best.alpha = replace ? 1 : 0;
      faces.push(best);
    }
    used.add(best);
    best.seen = now;
    best.updated = true;
    deriveVideo(best);
    if (replace) best.open = best.openTarget;
  }
}
function pumpDetector() {
  if (state.mode !== 'live' || !state.detReady || state.detBusy || state.paused) return;
  const v = els.video;
  if (v.readyState < 2 || !v.videoWidth) return;
  if (v.currentTime === state.lastVideoTime) return;
  state.lastVideoTime = v.currentTime;
  state.detBusy = true;
  state.detStart = performance.now();
  // fast devices: show exactly the frame the face was found in; slow devices: show live video
  state.pending = state.sync ? R.uploadPending(v) : false;
  state.detector.send({ image: v }).then(() => {
    const ms = performance.now() - state.detStart;
    state.detMs = state.detMs ? lerp(state.detMs, ms, 0.1) : ms;
    if (state.detMs > 75) state.sync = false;
    else if (state.detMs < 50) state.sync = true;
    state.detBusy = false;
    state.detErrors = 0;
    if (state.pending) { R.swap(); state.pending = false; }
  }).catch(e => {
    console.error(e);
    state.detBusy = false;
    state.pending = false;
    if (++state.detErrors > 8) detFail();
  });
}
async function detectPhoto() {
  if (!state.detReady || !state.photoCanvas) return;
  const c = state.photoCanvas;
  try {
    state.detector.reset();
    await state.detector.send({ image: c });
    await state.detector.send({ image: c });
  } catch (e) { console.error(e); }
  if (state.mode === 'photo' && !faces.length) { toast('Jeg kan ikke finde et ansigt', 2200); Snd.play('oops'); }
}

/* ---------------- camera ---------------- */
function stopCamera() {
  if (state.stream) for (const t of state.stream.getTracks()) t.stop();
  state.stream = null;
  els.video.srcObject = null;
}
function waitForVideo(v, ms = 5000) {
  return new Promise((res, rej) => {
    if (v.readyState >= 2 && v.videoWidth) return res();
    const t = setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms);
    v.addEventListener('loadeddata', () => { clearTimeout(t); res(); }, { once: true });
  });
}
async function startCamera(facing = state.facing) {
  stopCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nomedia'), { name: 'NoMedia' });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }
  });
  state.stream = stream;
  state.facing = facing;
  const v = els.video;
  v.srcObject = stream;
  try { await v.play(); } catch (e) { /* autoplay is muted, keep going */ }
  await waitForVideo(v);
  const st = (stream.getVideoTracks()[0].getSettings && stream.getVideoTracks()[0].getSettings()) || {};
  state.view.mirror = (st.facingMode || facing) !== 'environment';
  state.view.vw = v.videoWidth; state.view.vh = v.videoHeight;
  updateView();
  state.mode = 'live';
  state.photoCanvas = null;
  state.lastVideoTime = -1;
  faces = [];
  parts.length = 0;
  R.hasFrame = false;
  if (state.detector && state.detReady) state.detector.reset();
  show(els.btnLive, false);
  show(els.btnPick, true);
  countCameras();
  updateBusy();
  keepAwake();
}
async function countCameras() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    state.cameras = list.filter(d => d.kind === 'videoinput').length;
  } catch (e) { state.cameras = 1; }
  show(els.btnFlip, state.mode === 'live' && state.cameras > 1);
}
function cameraError(e) {
  console.error(e);
  const name = e && e.name;
  const framed = window.self !== window.top;
  const pick = { label: 'Vælg et billede i stedet', secondary: true, fn: () => els.file.click() };
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (framed) showMsg('Kameraet er spærret her', 'Siden kører inde i en anden side, som ikke giver adgang til kameraet. Åbn Fjollekameraet direkte i Safari eller Chrome.', [pick]);
    else showMsg('Kameraet har ikke fået lov', 'Tillad kameraet for denne side i browserens indstillinger, og tryk så på Prøv igen.', [{ label: 'Prøv igen', fn: onStart }, pick]);
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    showMsg('Der er ikke noget kamera', 'Jeg kan ikke finde et kamera på denne enhed. I kan stadig lege med et billede.', [{ label: 'Vælg et billede', fn: () => els.file.click() }]);
  } else if (name === 'NotReadableError' || name === 'TimeoutError') {
    showMsg('Kameraet er optaget', 'En anden app bruger måske kameraet. Luk den, og prøv igen.', [{ label: 'Prøv igen', fn: onStart }, pick]);
  } else if (name === 'NoMedia') {
    showMsg('Kameraet kan ikke bruges her', 'Browseren giver ikke adgang til kameraet på denne adresse. Åbn siden via https i Safari eller Chrome.', [pick]);
  } else {
    showMsg('Kameraet startede ikke', 'Noget gik galt med kameraet. Prøv igen om lidt.', [{ label: 'Prøv igen', fn: onStart }, pick]);
  }
}
async function onStart() {
  Snd.unlock();
  show(els.start, false);
  stopDemo();
  try {
    await startCamera(state.facing);
  } catch (e) {
    cameraError(e);
  }
}
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !state.wake && !document.hidden) {
      state.wake = await navigator.wakeLock.request('screen');
      state.wake.addEventListener('release', () => { state.wake = null; });
    }
  } catch (e) { /* not supported */ }
}

/* ---------------- photo mode: filters on a picture from the album ---------------- */
async function loadPhoto(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width, h0 = src.height, k = Math.min(1, 1440 / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function usePhoto(file) {
  let c;
  try { c = await loadPhoto(file); }
  catch (e) { toast('Billedet kunne ikke åbnes', 2200); return; }
  Snd.unlock();
  stopCamera();
  show(els.start, false);
  stopDemo();
  state.mode = 'photo';
  state.photoCanvas = c;
  state.view.vw = c.width; state.view.vh = c.height; state.view.mirror = false;
  updateView();
  faces = [];
  parts.length = 0;
  R.uploadShown(c);
  show(els.btnLive, true);
  show(els.btnPick, true);
  show(els.btnFlip, false);
  show(els.hint, false);
  updateBusy();
  detectPhoto();
}

/* ---------------- menus ---------------- */
const ICON = 120;
const WARP_BG = ['#E9E6F5', '#CDEBFF', '#FFE0B2', '#D1F2D6', '#F8D3F0', '#FFF3B0', '#D7E3FF', '#FFD6CC', '#E2F7CF', '#FFE7F3', '#D9F4F7', '#F1E1FF', '#FFE9C7'];
function iconCanvas(bg) {
  const c = document.createElement('canvas');
  c.width = c.height = ICON;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.beginPath(); x.arc(ICON / 2, ICON / 2, ICON / 2, 0, TAU); x.fill();
  return c;
}
function renderCostumeIcon(c) {
  const cv = iconCanvas(c.bg), x = cv.getContext('2d');
  x.save();
  x.beginPath(); x.arc(ICON / 2, ICON / 2, ICON / 2, 0, TAU); x.clip();
  const f = makeIconFace(ICON, { open: c.iconOpen || 0 });
  drawCartoon(x, f);
  if (c.tint) { fr(x, f, P(f, 0, 0.5, 0)); oval(x, 0, 0, 0.55, 0.69); x.fillStyle = 'rgba(110,225,80,0.55)'; x.fill(); }
  try { c.draw(x, f, { t: 1.2, dt: 0, icon: true, since: 99, W: ICON, H: ICON }); } catch (e) { console.error(c.id, e); }
  x.restore();
  return cv;
}
function renderWarpIcon(w, i) {
  const base = document.createElement('canvas');
  base.width = base.height = ICON;
  const b = base.getContext('2d');
  b.fillStyle = WARP_BG[i % WARP_BG.length];
  b.fillRect(0, 0, ICON, ICON);
  const f = makeIconFace(ICON, { scale: 0.52, top: 0.15 });
  drawCartoon(b, f);
  let img = base;
  if (w.fn) {
    const out = [];
    w.fn(f, 0.9, out);
    // exaggerate a little so the small icons read clearly
    for (const wp of out) if (wp.type === 0) { wp.kx = clamp(wp.kx * 1.2, -1.15, 0.85); wp.ky = clamp(wp.ky * 1.2, -1.15, 0.85); }
    img = warpCanvas(base, out, out.sym);
  }
  const cv = iconCanvas('#000'), x = cv.getContext('2d');
  x.save(); x.beginPath(); x.arc(ICON / 2, ICON / 2, ICON / 2, 0, TAU); x.clip();
  x.drawImage(img, 0, 0);
  if (w.sym) {
    x.setLineDash([6, 6]); x.strokeStyle = 'rgba(43,27,18,0.75)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(ICON / 2, 6); x.lineTo(ICON / 2, ICON - 6); x.stroke();
  }
  x.restore();
  return cv;
}
function makeItem(name, canvas, onTap) {
  const b = document.createElement('button');
  b.className = 'item';
  b.type = 'button';
  b.setAttribute('aria-label', name);
  b.setAttribute('aria-pressed', 'false');
  b.append(canvas);
  b.addEventListener('click', onTap);
  return b;
}
function buildRows() {
  COSTUMES.forEach((c, i) => els.rowCostume.append(makeItem(c.name, renderCostumeIcon(c), () => selectCostume(i, true))));
  WARPS.forEach((w, i) => els.rowWarp.append(makeItem(w.name, renderWarpIcon(w, i), () => selectWarp(i, true))));
}
function markRow(row, idx, scroll) {
  [...row.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
  const el = row.children[idx];
  if (scroll && el) {
    const left = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left, behavior: 'smooth' });
  }
}
function selectCostume(i, user) {
  state.costume = i;
  state.costumeSince = performance.now();
  parts.length = 0;
  for (const f of faces) { f.springs = Object.create(null); f.mem = Object.create(null); }
  markRow(els.rowCostume, i, user);
  store.set('costume', COSTUMES[i].id);
  if (user) { toast(COSTUMES[i].name); Snd.play('pop'); }
}
function selectWarp(i, user) {
  state.warp = i;
  markRow(els.rowWarp, i, user);
  store.set('warp', WARPS[i].id);
  if (user) { toast(WARPS[i].name); Snd.play('pop'); }
}
function surprise() {
  Snd.play('dice');
  els.btnDice.classList.remove('roll'); void els.btnDice.offsetWidth; els.btnDice.classList.add('roll');
  let c = state.costume, w = state.warp;
  while (c === state.costume) c = 1 + Math.floor(Math.random() * (COSTUMES.length - 1));
  w = Math.random() < 0.45 ? 0 : 1 + Math.floor(Math.random() * (WARPS.length - 1));
  selectCostume(c, false); selectWarp(w, false);
  markRow(els.rowCostume, c, true); markRow(els.rowWarp, w, true);
  toast(w ? COSTUMES[c].name + ' + ' + WARPS[w].name : COSTUMES[c].name, 1600);
}

/* ---------------- taking pictures ---------------- */
let saving = Promise.resolve();
function snap() {
  if (!R || !R.hasFrame || state.mode === 'idle') return;
  saving = saving.then(snapNow).catch(e => console.error(e));
  return saving;
}
async function snapNow() {
  Snd.play('shutter');
  els.flash.classList.remove('on'); void els.flash.offsetWidth; els.flash.classList.add('on');
  const c = document.createElement('canvas');
  c.width = els.gl.width; c.height = els.gl.height;
  const x = c.getContext('2d');
  x.drawImage(els.gl, 0, 0);
  x.drawImage(els.fx, 0, 0);
  const blob = await toBlob(c, 'image/jpeg', 0.9);
  const tw = 300, th = Math.round((300 * c.height) / c.width);
  const t = document.createElement('canvas');
  t.width = tw; t.height = th;
  t.getContext('2d').drawImage(c, 0, 0, tw, th);
  const thumb = await toBlob(t, 'image/jpeg', 0.75);
  if (!blob) { toast('Billedet kunne ikke gemmes', 2000); return; }
  await Album.add(blob, thumb);
  setAlbumThumb(thumb);
  els.btnAlbum.classList.remove('bump'); void els.btnAlbum.offsetWidth; els.btnAlbum.classList.add('bump');
}
let thumbUrl = null;
function setAlbumThumb(blob) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  thumbUrl = blob ? URL.createObjectURL(blob) : null;
  els.albumThumb.src = thumbUrl || '';
  els.btnAlbum.classList.toggle('has', !!blob);
}
async function refreshAlbumThumb() {
  const list = await Album.list();
  setAlbumThumb(list[0] ? list[0].thumb || list[0].blob : null);
}

let gridUrls = [];
async function openAlbum() {
  state.paused = true;
  await saving;
  const list = await Album.list();
  gridUrls.forEach(u => URL.revokeObjectURL(u));
  gridUrls = [];
  els.grid.innerHTML = '';
  for (const rec of list) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.type = 'button';
    b.setAttribute('aria-label', 'Vis billedet');
    const img = new Image();
    const u = URL.createObjectURL(rec.thumb || rec.blob);
    gridUrls.push(u);
    img.src = u; img.alt = '';
    b.append(img);
    b.addEventListener('click', () => openViewer(rec));
    els.grid.append(b);
  }
  els.albumCount.textContent = list.length ? (list.length === 1 ? '1 billede' : list.length + ' billeder') : '';
  show(els.albumEmpty, !list.length);
  show(els.album, true);
}
function closeAlbum() { show(els.album, false); state.paused = false; }
let viewRec = null, viewUrl = null;
function openViewer(rec) {
  viewRec = rec;
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = URL.createObjectURL(rec.blob);
  els.viewImg.src = viewUrl;
  show(els.confirm, false);
  show(els.iosTip, isIOS);
  show(els.viewer, true);
}
function closeViewer() { show(els.viewer, false); }
async function savePhoto() {
  if (!viewRec) return;
  const name = 'fjollekamera_' + stamp() + '.jpg';
  if (state.dl) {
    try { await state.dl.save({ filename: name, data: viewRec.blob }); toast('Gemt'); } catch (e) { if (e && e.code !== 'declined') toast('Billedet kunne ikke gemmes', 2000); }
    return;
  }
  const a = document.createElement('a');
  const u = URL.createObjectURL(viewRec.blob);
  a.href = u; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
async function deletePhoto() {
  if (!viewRec) return;
  try { await Album.remove(viewRec.id); } catch (e) { toast('Billedet kunne ikke slettes', 2000); return; }
  closeViewer();
  await refreshAlbumThumb();
  await openAlbum();
}

/* ---------------- start screen demo ---------------- */
let demoOn = false, demoFace = null, demoIdx = -1;
const DEMO_SET = ['kat', 'hund', 'enhjoerning', 'kanin', 'loeve', 'prinsesse', 'nisse', 'rumvaesen', 'sej', 'klovn'];
function startDemo() { demoOn = true; requestAnimationFrame(demoLoop); }
function stopDemo() { demoOn = false; }
function demoLoop(now) {
  if (!demoOn) return;
  requestAnimationFrame(demoLoop);
  const cv = els.demo, x = cv.getContext('2d'), S = cv.width;
  const t = now / 1000;
  const idx = Math.floor(t / 1.8) % DEMO_SET.length;
  const c = COSTUMES.find(k => k.id === DEMO_SET[idx]);
  if (idx !== demoIdx) { demoIdx = idx; demoFace = makeIconFace(S, { scale: 0.36, top: 0.36 }); demoFace.icon = false; demoFace.born = t; }
  const f = demoFace;
  f.dt = 1 / 60;
  f.accX = Math.sin(t * 3.2) * 9;
  f.open = c.iconOpen ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0;
  const pop = Math.min(1, (t - f.born) / 0.35);
  const k = 0.85 + 0.15 * (1 - Math.pow(1 - pop, 3)) + Math.sin(pop * Math.PI) * 0.05;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, S, S);
  x.fillStyle = c.bg;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, TAU); x.fill();
  x.save();
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, TAU); x.clip();
  x.translate(S / 2, S / 2); x.scale(k, k); x.translate(-S / 2, -S / 2);
  const base = x.getTransform();
  // draw with the scale applied: wrap setTransform so costume code keeps it
  const g2 = new Proxy(x, {
    get(target, prop) {
      if (prop === 'setTransform') return (a, b, c2, d, e, f2) => { target.setTransform(base); target.transform(a, b, c2, d, e, f2); };
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
  drawCartoon(g2, f);
  if (c.tint) { fr(g2, f, P(f, 0, 0.5, 0)); oval(g2, 0, 0, 0.55, 0.69); x.fillStyle = 'rgba(110,225,80,0.55)'; x.fill(); }
  try { c.draw(g2, f, { t, dt: 1 / 60, icon: true, since: t - f.born, W: S, H: S }); } catch (e) { /* ignore */ }
  x.restore();
}

/* ---------------- main loop ---------------- */
function motion(f, now) {
  const M = f.M;
  const det = M[0] * M[4] - M[1] * M[3] || 1;
  f.px = Math.sqrt(Math.abs(det));
  f.grav = Math.atan2(M[1] / det, M[0] / det);
  if (!f.updated) return;
  f.updated = false;
  const c = [M[1] * 0.5 + f.T[0], M[4] * 0.5 + f.T[1]];
  const dtu = f.lastUpd ? (now - f.lastUpd) / 1000 : 0;
  f.lastUpd = now;
  if (f.prevC && dtu > 0.004 && dtu < 0.25) {
    const vx = (c[0] - f.prevC[0]) / dtu, vy = (c[1] - f.prevC[1]) / dtu;
    const ax = (vx - f.vel[0]) / dtu, ay = (vy - f.vel[1]) / dtu;
    f.vel[0] = vx; f.vel[1] = vy;
    f.accS[0] = lerp(f.accS[0], ax, 0.35); f.accS[1] = lerp(f.accS[1], ay, 0.35);
    f.accX = clamp((M[4] * f.accS[0] - M[1] * f.accS[1]) / det, -60, 60);
  } else { f.vel[0] = f.vel[1] = 0; f.accX = 0; }
  f.prevC = c;
}
function screenPoints(f, warps) {
  const L = f.lm, S = f.S, v = state.view, has = warps.length > 0;
  for (let i = 0; i < NL; i++) {
    let x = L[3 * i], y = L[3 * i + 1];
    if (has) [x, y] = unwarpAll(warps, x, y);
    let sx = v.ox + x * v.s;
    if (v.mirror) sx = v.cw - sx;
    S[2 * i] = sx;
    S[2 * i + 1] = v.oy + y * v.s;
  }
}
let maskOn = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = state.lastNow ? Math.min(0.05, (now - state.lastNow) / 1000) : 0.016;
  state.lastNow = now;
  if (document.hidden || !R) return;
  const t = (now - state.t0) / 1000;
  const v = els.video;

  if (state.mode === 'live') {
    if (v.videoWidth && (v.videoWidth !== state.view.vw || v.videoHeight !== state.view.vh)) {
      state.view.vw = v.videoWidth; state.view.vh = v.videoHeight; updateView(); faces = [];
    }
    if (!state.detReady || state.detFailed || state.paused) {
      if (v.readyState >= 2 && v.currentTime !== state.lastVideoTime) { state.lastVideoTime = v.currentTime; R.uploadShown(v); }
    } else {
      if (state.detBusy && now - state.detStart > 2500) { state.detBusy = false; state.pending = false; state.sync = false; }
      if (!state.sync && v.readyState >= 2 && v.currentTime !== state.shownTime) { state.shownTime = v.currentTime; R.uploadShown(v); }
      pumpDetector();
    }
  }

  // faces: fade in/out, smooth the mouth
  for (let i = faces.length - 1; i >= 0; i--) {
    const f = faces[i];
    const lost = state.mode === 'live' && now - f.seen > 300;
    f.alpha = clamp(f.alpha + (lost ? -dt * 5 : dt * 6), 0, 1);
    if (lost && f.alpha <= 0) { faces.splice(i, 1); continue; }
    f.open += (f.openTarget - f.open) * Math.min(1, dt * 16);
  }
  const ready = state.detReady && !state.detFailed;
  const list = ready ? faces : [];

  // warps
  const preset = WARPS[state.warp];
  const warps = [];
  let sym = null;
  for (const f of list) {
    f.warps = [];
    if (preset.fn && f.alpha > 0.05) {
      preset.fn(f, t, f.warps);
      if (f.warps.sym && !sym) sym = f.warps.sym;
      // fade warps in and out with the face
      for (const w of f.warps) { if (w.type === 0) { w.kx *= f.alpha; w.ky *= f.alpha; } else { w.kx *= f.alpha; w.ky *= f.alpha; } warps.push(w); }
    }
  }
  const cos = COSTUMES[state.costume];
  let tint = null;
  if (cos.tint && list.length) { R.updateMask(list, state.view.vw, state.view.vh); tint = cos.tint; maskOn = true; }
  else if (maskOn) { R.clearMask(); maskOn = false; }
  R.draw(state.view, warps, sym, tint);

  // stickers
  const W = els.fx.width, H = els.fx.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const env = { t, dt, icon: false, since: (now - state.costumeSince) / 1000, W, H };
  for (const f of list) {
    screenPoints(f, f.warps || []);
    fitPose(f.S, f.M, f.T);
    motion(f, now);
    f.t = t; f.dt = dt;
    if (f.alpha <= 0.01) continue;
    g.globalAlpha = f.alpha;
    g.lineJoin = 'round'; g.lineCap = 'round';
    try { cos.draw(g, f, env); } catch (e) { console.error(cos.id, e); }
    g.setLineDash([]);
  }
  g.globalAlpha = 1;
  updateParticles(dt, H);
  drawParticles(g);

  // "look into the camera" hint
  if (state.mode === 'live' && ready && !state.paused) {
    if (faces.length) { state.noFaceSince = 0; if (!els.hint.hidden) show(els.hint, false); }
    else {
      if (!state.noFaceSince) state.noFaceSince = now;
      if (now - state.noFaceSince > 1600 && els.hint.hidden) show(els.hint, true);
    }
  } else if (!els.hint.hidden) show(els.hint, false);
}

/* ---------------- wiring ---------------- */
function bind(el, fn) { el.addEventListener('click', e => { e.preventDefault(); fn(e); }); }
function init() {
  try { R = new Renderer(els.gl); }
  catch (e) {
    console.error(e);
    show(els.start, false);
    showMsg('Denne browser er for gammel', 'Fjolleansigterne kræver WebGL. Prøv en nyere udgave af Safari eller Chrome.', []);
    return;
  }
  g = els.fx.getContext('2d');
  state.muted = store.get('muted', false);
  els.btnSound.classList.toggle('off', state.muted);
  const ci = COSTUMES.findIndex(c => c.id === store.get('costume', 'kat'));
  const wi = WARPS.findIndex(w => w.id === store.get('warp', 'ingen'));
  buildRows();
  selectCostume(ci >= 0 ? ci : 1, false);
  selectWarp(wi >= 0 ? wi : 0, false);
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  Album.open().then(refreshAlbumThumb);
  initDetector();
  startDemo();

  bind(els.btnStart, onStart);
  bind(els.btnShutter, snap);
  bind(els.btnDice, surprise);
  bind(els.btnAlbum, openAlbum);
  bind(els.albumBack, closeAlbum);
  bind(els.viewBack, closeViewer);
  bind(els.viewSave, savePhoto);
  bind(els.viewDel, () => show(els.confirm, true));
  bind(els.delNo, () => show(els.confirm, false));
  bind(els.delYes, deletePhoto);
  bind(els.btnPick, () => els.file.click());
  bind(els.btnLive, () => { Snd.unlock(); startCamera(state.facing).catch(cameraError); });
  bind(els.btnFlip, () => {
    const next = state.facing === 'user' ? 'environment' : 'user';
    els.btnFlip.classList.remove('spin'); void els.btnFlip.offsetWidth; els.btnFlip.classList.add('spin');
    startCamera(next).catch(cameraError);
  });
  bind(els.btnSound, () => {
    Snd.unlock();
    state.muted = !state.muted;
    store.set('muted', state.muted);
    els.btnSound.classList.toggle('off', state.muted);
    els.btnSound.setAttribute('aria-pressed', String(!state.muted));
    if (!state.muted) Snd.play('pop');
  });
  els.file.addEventListener('change', () => {
    const file = els.file.files && els.file.files[0];
    els.file.value = '';
    if (file) usePhoto(file);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.mode === 'live') { keepAwake(); els.video.play().catch(() => {}); }
  });
  // no pinch zoom or double-tap zoom while playing
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  // inside Claude, offer saving through the viewer's download prompt
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(d => { state.dl = d || null; }).catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  requestAnimationFrame(frame);
}

// small hook for automated tests
window.__fk = { state, get faces() { return faces; }, selectCostume, selectWarp, snap, COSTUMES, WARPS, parts, Album };

init();
