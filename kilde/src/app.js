'use strict';
/* ==========================================================================
   Fjollekameraet – betjening, kamera, album og hovedløkke
   ========================================================================== */

const $ = id => document.getElementById(id);
const els = {};
['video', 'gl', 'fx', 'flash', 'hint', 'toast', 'busy', 'busyText', 'btnSound', 'btnParent', 'btnLive', 'btnFlip',
  'rowWarp', 'rowCostume', 'btnAlbum', 'albumThumb', 'btnShutter', 'btnDice', 'start', 'demo', 'btnStart',
  'msg', 'msgTitle', 'msgText', 'msgBtns', 'album', 'albumBack', 'grid', 'albumEmpty', 'albumCount',
  'viewer', 'viewImg', 'viewBack', 'viewShare', 'viewSave', 'viewDel', 'confirm', 'delNo', 'delYes', 'file',
  'gate', 'gateText', 'gatePad', 'gateNums', 'gateClose', 'btnNews', 'appVersion', 'news', 'newsList', 'newsClose',
  'sleep', 'sleepTitle', 'sleepText', 'sleepParent', 'parent', 'parentBack', 'storyList', 'poolCostumes', 'poolWarps',
  'setVolume', 'setFlash', 'setLimit', 'limitInfo', 'moreTime', 'setEvening', 'eveningInfo', 'eveningOff', 'parentPick',
  'deleteAll', 'deleteAllAsk', 'deleteAllText', 'deleteAllNo', 'deleteAllYes', 'parentNews', 'parentVersion',
  'btnUniverse', 'btnShipStart', 'fog', 'btnNormal', 'btnIsland', 'isleFrame', 'islandList', 'appleAsk', 'appleSay', 'btnStrip', 'paws', 'pipAgain', 'fpsLine'
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
  wake: null,
  wakeAsk: false,
  universe: false,        // Kaptajn Knurhår's universe: the book's figures, entered on the ship Hvorfor
  island: false,          // Simsalabim-øen, where the ship sails on to (not from the book); universe stays true there
  prevNormal: null
};
let R = null;        // WebGL renderer
let g = null;        // overlay 2D context
let faces = [];

const store = {
  get(k, d) { try { const v = localStorage.getItem('fk.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fk.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

/* ---------------- sound (made on the fly, no files) ---------------- */
const Snd = {
  ctx: null,
  level: 1,               // 'lav' or 'normal' in the grown-up corner
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
    gn.gain.exponentialRampToValueAtTime(vol * this.level, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9; gn.gain.value = vol * this.level;
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
      else if (kind === 'bump') { this.tone('sine', 170, 62, 0.2, 0.32); this.noise(0.06, 0.22, 380); }
      else if (kind === 'pip') { this.tone('sine', 1500, 1900, 0.05, 0.1); this.tone('sine', 1700, 2150, 0.05, 0.1, 0.08); }
      else if (kind === 'kra') { this.noise(0.12, 0.3, 1150); this.tone('triangle', 640, 430, 0.14, 0.08); }
      else if (kind === 'svirr') { this.tone('triangle', 300, 1400, 0.6, 0.12); this.tone('sine', 600, 2600, 0.55, 0.05, 0.05); }
      else if (kind === 'normal') { this.tone('sine', 660, 660, 0.16, 0.1); this.tone('sine', 880, 880, 0.3, 0.09, 0.13); }
      else if (kind === 'gab') { this.tone('sine', 420, 200, 1.0, 0.05); this.tone('sine', 630, 300, 0.9, 0.018); }
      else if (kind === 'oe') [784, 988, 1175, 1568].forEach((fq, i) => this.tone('sine', fq, fq, 0.4, 0.06, i * 0.09));
      else if (kind === 'kast') { this.noise(0.22, 0.14, 900); this.tone('sine', 520, 330, 0.2, 0.05); }
      else if (kind === 'rundt') { this.tone('sine', 330, 990, 0.7, 0.05); [784, 1047, 1319].forEach((fq, i) => this.tone('sine', fq, fq, 0.45, 0.06, 0.55 + i * 0.1)); }
      else if (kind === 'tik') this.tone('triangle', 1250, 1150, 0.06, 0.1);
      else if (kind === 'kanin') { this.tone('sine', 260, 640, 0.16, 0.12); this.tone('sine', 620, 430, 0.12, 0.08, 0.16); }
      else if (kind === 'due') { [0, 0.11, 0.22, 0.33].forEach(w => this.noise(0.06, 0.12, 650, w)); this.tone('sine', 660, 700, 0.2, 0.04, 0.05); }
      else if (kind === 'fisk') { this.noise(0.1, 0.14, 1700); this.tone('sine', 420, 210, 0.12, 0.08); this.noise(0.16, 0.12, 1300, 1.25); }
      else if (kind === 'fundet') { this.tone('sine', 1047, 1047, 0.25, 0.06); this.tone('sine', 1568, 1568, 0.35, 0.05, 0.1); }
      else if (kind === 'maane') { [784, 988, 1175, 1568].forEach((fq, i) => this.tone('sine', fq, fq, 0.9, 0.045, i * 0.09)); }
      else if (kind === 'ritsj') { [0, 0.3, 0.6].forEach(w => { this.noise(0.15, 0.13, 3400, w); this.noise(0.09, 0.07, 1500, w + 0.03); }); }
      else if (kind === 'bonk') { this.tone('sine', 240, 150, 0.14, 0.26); this.noise(0.05, 0.22, 600); }
      else if (kind === 'klik') { this.noise(0.04, 0.45, 2600); this.tone('sine', 1800, 1700, 0.03, 0.04); }
      else if (kind === 'simsalabim') { [1319, 1568, 2093].forEach((fq, i) => this.tone('sine', fq, fq * 1.003, 0.55, 0.05, i * 0.07)); this.tone('triangle', 2637, 2637, 0.3, 0.018, 0.22); }
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
  // the floor things can fall onto: just above the menus, in canvas pixels
  const top = els.rowCostume.getBoundingClientRect().top - box.getBoundingClientRect().top;
  state.floor = box.clientHeight ? Math.max(0, top) * (els.fx.height / box.clientHeight) : 0;
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
    noteDetection(performance.now());
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
  retPipReset(true);         // each time the camera starts, Pip may try his rule once more
  state.lanternDone = false;  // …and the lantern light may come once on the island
  state.photoCanvas = null;
  state.lastVideoTime = -1;
  faces = [];
  parts.length = 0;
  R.hasFrame = false;
  if (state.detector && state.detReady) state.detector.reset();
  show(els.btnLive, false);
  show(els.btnStrip, true);
  appleReset();
  countCameras();
  updateBusy();
  // the album may have opened, or the app been hidden, while the camera was starting
  if (state.paused || document.hidden) { stopCamera(); restingCam = true; return; }
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
  const pick = { label: 'Vælg et billede i stedet', secondary: true, fn: pickPhoto };
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (framed) showMsg('Kameraet er spærret her', 'Siden kører inde i en anden side, som ikke giver adgang til kameraet. Åbn Fjollekameraet direkte i Safari eller Chrome.', [pick]);
    else showMsg('Kameraet har ikke fået lov', 'Tillad kameraet for denne side i browserens indstillinger, og tryk så på Prøv igen.', [{ label: 'Prøv igen', fn: onStart }, pick]);
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    showMsg('Der er ikke noget kamera', 'Jeg kan ikke finde et kamera på denne enhed. I kan stadig lege med et billede.', [{ label: 'Vælg et billede', fn: pickPhoto }]);
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
  if (sleepReason()) { syncSleep(); return; }
  show(els.start, false);
  stopDemo();
  try {
    await startCamera(state.facing);
  } catch (e) {
    cameraError(e);
  }
}
async function keepAwake() {
  if (!('wakeLock' in navigator) || state.wake || state.wakeAsk || document.hidden) return;
  state.wakeAsk = true;
  try {
    const w = await navigator.wakeLock.request('screen');
    w.addEventListener('release', () => { if (state.wake === w) state.wake = null; });
    // the album may have opened while we waited
    if (state.mode === 'live' && state.stream && !state.paused && !document.hidden) state.wake = w;
    else w.release().catch(() => {});
  } catch (e) { /* not supported or not allowed */ }
  state.wakeAsk = false;
}

/* ---------------- rest: camera and screen only run while the camera view is in use ---------------- */
// Opening the album, hiding the app or two minutes without a touch stops the camera or lets go of
// the screen lock, so the phone locks itself as it normally would.
const IDLE_MS = 2 * 60 * 1000;
let lastTouch = performance.now();
let restingCam = false;      // the camera was stopped while the live view was hidden; restart on return
function releaseWake() {
  const w = state.wake;
  state.wake = null;
  if (w) w.release().catch(() => {});
}
function restCamera() {
  releaseWake();
  if (state.mode !== 'live' || !state.stream) return;
  stopCamera();
  restingCam = true;
}
async function wakeCamera() {
  if (!restingCam || document.hidden || state.paused) return;
  restingCam = false;
  try { await startCamera(state.facing); } catch (e) { cameraError(e); }
}
function touched() {
  lastTouch = performance.now();
  if (state.mode === 'live' && state.stream && !state.wake && !state.paused) keepAwake();
}
function checkIdle() {
  if (state.wake && performance.now() - lastTouch > IDLE_MS) releaseWake();
}

/* ---------------- grown-up lock ---------------- */
// Saving and importing photos need a grown-up: hold two fingers on the circle for three seconds,
// then tap the number written in words. A five-year-old cannot yet do this on her own.
const GATE_WORDS = [['tolv', 12], ['tretten', 13], ['fjorten', 14], ['femten', 15], ['seksten', 16], ['sytten', 17], ['atten', 18], ['nitten', 19]];
const gateFingers = new Set();
let gateAction = null, gateTimer = 0;
function requireParent(action) {
  gateAction = action;
  gateReset();
  els.gateText.textContent = 'Hold to fingre på cirklen i tre sekunder.';
  show(els.gatePad, true);
  show(els.gateNums, false);
  show(els.gate, true);
}
function gateReset() {
  clearTimeout(gateTimer);
  gateTimer = 0;
  gateFingers.clear();
  els.gatePad.classList.remove('holding');
}
function closeGate() {
  gateReset();
  gateAction = null;
  show(els.gate, false);
}
function gateDown(e) {
  e.preventDefault();
  gateFingers.add(e.pointerId);
  if (gateFingers.size >= 2 && !gateTimer) {
    els.gatePad.classList.add('holding');
    gateTimer = setTimeout(gateAsk, 3000);
  }
}
function gateUp(e) {
  gateFingers.delete(e.pointerId);
  if (gateFingers.size < 2 && gateTimer) {
    clearTimeout(gateTimer);
    gateTimer = 0;
    els.gatePad.classList.remove('holding');
  }
}
function gateAsk() {
  gateTimer = 0;
  gateFingers.clear();
  els.gatePad.classList.remove('holding');
  const [word, n] = GATE_WORDS[Math.floor(Math.random() * GATE_WORDS.length)];
  const opts = [n, Number(String(n).split('').reverse().join('')), n % 10, n + 10];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  els.gateText.textContent = 'Tryk på ' + word + '.';
  els.gateNums.innerHTML = '';
  for (const k of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gate-num';
    b.textContent = String(k);
    b.addEventListener('click', ev => {
      ev.preventDefault();
      const act = k === n ? gateAction : null;
      closeGate();
      if (act) act();   // still inside the tap, so the browser allows opening files and downloads
    });
    els.gateNums.append(b);
  }
  show(els.gatePad, false);
  show(els.gateNums, true);
}
function pickPhoto() { requireParent(() => { pickedAt = performance.now(); els.file.click(); }); }

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
  restingCam = false;
  releaseWake();
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
  show(els.btnFlip, false);
  show(els.btnStrip, false);
  if (strip) strip.cancel = true;
  appleReset();
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
function tintCss(t) { return 'rgba(' + t.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ',' + Math.min(0.6, t[3] * 0.95) + ')'; }
function renderCostumeIcon(c) {
  const cv = iconCanvas(c.bg), x = cv.getContext('2d');
  x.save();
  x.beginPath(); x.arc(ICON / 2, ICON / 2, ICON / 2, 0, TAU); x.clip();
  const f = makeIconFace(ICON, { open: c.iconOpen || 0, scale: c.iconScale, top: c.iconTop });
  drawCartoon(x, f);
  if (c.tint) { fr(x, f, P(f, 0, 0.5, 0)); oval(x, 0, 0, 0.55, 0.69); x.fillStyle = tintCss(c.tint); x.fill(); }
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
  if (w.draw) {
    const fo = makeIconFace(ICON, { scale: 0.52, top: 0.15 });
    try { w.draw(x, fo, { t: 1.2, dt: 0, icon: true, since: 99, W: ICON, H: ICON }); } catch (e) { console.error(w.id, e); }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
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
  for (let k = parts.length - 1; k >= 0; k--) if (!parts[k].keep) parts.splice(k, 1);
  for (const f of faces) { f.springs = Object.create(null); f.mem = Object.create(null); }
  appleReset();
  pipBoardReset();
  crownReset();
  retPipReset();
  markRow(els.rowCostume, i, user);
  store.set(state.island ? 'islandCostume' : state.universe ? 'bookCostume' : 'costume', COSTUMES[i].id);
  if (user) { toast(COSTUMES[i].name); Snd.play('pop'); puffAll(); }
}
function selectWarp(i, user) {
  state.warp = i;
  markRow(els.rowWarp, i, user);
  store.set('warp', WARPS[i].id);
  if (user) { toast(WARPS[i].name); Snd.play('pop'); puffAll(); }
}
// the time fog covers each switch, so no face changes in plain sight (plan G3)
function puffAll() { for (const f of faces) if (f.alpha > 0.3) fogPuff(f); }

/* ---------------- the book's figures and Kaptajn Knurhår's universe ---------------- */
// Pip comes aboard with story 2 and Sukkertop visits from story 9, as in the book: a grown-up turns
// those stories on in the grown-up corner. In the universe the menus hold only the book's figures.
function unlocked(c) { return !c.story || storyHeard(c.story); }
// the island's figures live only on the island; the buddy for face 2 is never in the menu
function costumeVisible(c, i) {
  if (c.hidden) return false;
  if (i === 0) return !state.universe;
  if (!unlocked(c)) return false;
  if (state.island) return c.world === 'island';
  if (c.world) return false;
  return state.universe ? !!c.book : true;
}
function costumeIndex(id) { return COSTUMES.findIndex(c => c.id === id); }
function fallbackCostume() { const i = costumeIndex(state.island ? 'laerling' : state.universe ? 'knurhaar' : 'kat'); return i >= 0 ? i : 0; }
// Simsalabim-øen and the dream umbrella are on unless a grown-up turns them off in the corner
function islandOpen() { return store.get('island', true) !== false; }
function islandThing(key, def = true) { return store.get(key, def) !== false; }      // "Øens ting" in the grown-ups' corner
function umbrellaOn() { return store.get('umbrella', true) !== false; }
function refreshRows() {
  [...els.rowCostume.children].forEach((b, i) => { b.hidden = !costumeVisible(COSTUMES[i], i); });
  show(els.rowWarp, !state.universe);
  if (!costumeVisible(COSTUMES[state.costume], state.costume)) selectCostume(fallbackCostume(), false);
  const n = COSTUMES.filter((c, i) => costumeVisible(c, i)).length;
  // on the island the dice becomes the magic hat (plan M5)
  const hat = state.island && islandThing('tryllehat');
  if (!hat && TopHat.on) topHatReset(true);
  show(els.btnDice, hat || !state.universe || n > 1);
  els.btnDice.classList.toggle('hat', hat);
  els.btnDice.classList.toggle('on', hat && TopHat.on);
  els.btnDice.setAttribute('aria-label', hat ? 'Tryllehatten' : 'Overrask mig');
  if (hat) els.btnDice.setAttribute('aria-pressed', String(TopHat.on)); else els.btnDice.removeAttribute('aria-pressed');
  markRow(els.rowCostume, state.costume, false);
  show(els.btnIsland, state.universe && islandOpen());
  els.btnIsland.classList.toggle('on', state.island);
  els.btnIsland.setAttribute('aria-pressed', String(state.island));
  els.btnIsland.setAttribute('aria-label', state.island ? 'Sejl tilbage til Kaptajn Knurhår' : 'Sejl videre til Simsalabim-øen');
  show(els.isleFrame, state.island);
}
// with two faces in the universe, the second one is the first one's shipmate: Knurhår and Pip
function partnerOf(c) {
  if (state.island) { const mk = COSTUMES[costumeIndex('makker')]; return c.id === 'laerling' && mk ? mk : c; }
  const pip = COSTUMES[costumeIndex('pip')], kn = COSTUMES[costumeIndex('knurhaar')];
  if (c === kn) return pip && unlocked(pip) ? pip : kn;
  if (c.id === 'krone') return c;      // both wear the paper crown: it tears, and each gets a piece
  return c.book ? kn : c;
}
// "Spørgekompasset begyndte at summe. Nålen snurrede – svirrr! – og pegede ind i en tåge, der glitrede
// som stjernestøv." The ship sails in and out of the universe through the time fog.
const Fog = {
  busy: false,
  run(mid, look) {
    if (this.busy || document.hidden) { mid(); return; }
    this.busy = true;
    const cv = els.fog, box = $('app');
    cv.width = Math.max(1, Math.round(box.clientWidth * 0.5)); cv.height = Math.max(1, Math.round(box.clientHeight * 0.5));
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, m = Math.min(W, H);
    const blobs = Array.from({ length: REDUCED ? 0 : 34 }, () => ({ x: Math.random() * W, y: Math.random() * H,
      r: m * (0.25 + Math.random() * 0.35), vx: (Math.random() - 0.5) * m * 0.12, vy: (Math.random() - 0.5) * m * 0.08 }));
    const stars = Array.from({ length: REDUCED ? 0 : 46 }, () => ({ x: Math.random() * W, y: Math.random() * H,
      r: m * (0.008 + Math.random() * 0.016), ph: Math.random() * TAU }));
    const IN = REDUCED ? 0.2 : 0.45, HOLD = REDUCED ? 0.25 : 0.5, OUT = REDUCED ? 0.3 : 0.6;
    let t0 = 0, fired = false;
    show(cv, true);
    const step = now => {
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      const a = t < IN ? t / IN : t < IN + HOLD ? 1 : Math.max(0, 1 - (t - IN - HOLD) / OUT);
      if (!fired && t >= IN) { fired = true; try { mid(); } catch (e) { console.error(e); } }
      x.clearRect(0, 0, W, H);
      x.globalAlpha = a;
      x.fillStyle = look === 'island' ? 'rgba(226,208,255,0.88)' : 'rgba(232,226,255,0.84)'; x.fillRect(0, 0, W, H);
      for (const b of blobs) { b.x += b.vx * 0.016; b.y += b.vy * 0.016; x.drawImage(mistSprite(), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
      x.fillStyle = look === 'island' ? '#FFE7A3' : '#FFFFFF';
      for (const st of stars) { x.globalAlpha = a * (0.4 + 0.6 * Math.sin(t * 6 + st.ph) ** 2); star4(x, st.x, st.y, st.r * 2.2, st.ph); x.fill(); }
      x.globalAlpha = 1;
      if (t < IN + HOLD + OUT) requestAnimationFrame(step);
      else { show(cv, false); this.busy = false; }
    };
    requestAnimationFrame(step);
  }
};
function enterUniverseNow() {
  state.prevNormal = { c: state.costume, w: state.warp };
  state.universe = true;
  selectWarp(0, false);
  refreshRows();
  const want = costumeIndex(store.get('bookCostume', 'knurhaar'));
  selectCostume(want > 0 && costumeVisible(COSTUMES[want], want) ? want : fallbackCostume(), false);
  markRow(els.rowCostume, state.costume, true);
  els.btnUniverse.classList.add('on');
  els.btnUniverse.setAttribute('aria-pressed', 'true');
}
function leaveUniverseNow() {
  state.universe = false;
  state.island = false;
  refreshRows();
  const p = state.prevNormal || { c: fallbackCostume(), w: 0 };
  selectCostume(costumeVisible(COSTUMES[p.c], p.c) ? p.c : fallbackCostume(), false);
  selectWarp(p.w, false);
  markRow(els.rowCostume, state.costume, true);
  markRow(els.rowWarp, state.warp, true);
  els.btnUniverse.classList.remove('on');
  els.btnUniverse.setAttribute('aria-pressed', 'false');
}
// From Knurhår's ship the time fog leads on to Simsalabim-øen, where the child does the magic herself.
// The island is not part of the book; Knurhår's universe stays on underneath (no silly faces there either).
function enterIslandNow() {
  state.island = true;
  // the lantern light, once each time the camera starts, with the things from the stories she has heard
  if (islandThing('lygtelys') && !state.lanternDone) {
    state.lanternDone = true;
    lanternArm([storyHeard(1) && 'aeble', storyHeard(2) && 'krone', storyHeard(2) && 'skal'].filter(Boolean));
  }
  refreshRows();
  const want = costumeIndex(store.get('islandCostume', 'laerling'));
  selectCostume(want > 0 && costumeVisible(COSTUMES[want], want) ? want : fallbackCostume(), false);
  markRow(els.rowCostume, state.costume, true);
}
function leaveIslandNow() {
  state.island = false;
  topHatReset(true); moonRingReset(); lanternReset();
  refreshRows();
  const want = costumeIndex(store.get('bookCostume', 'knurhaar'));
  selectCostume(want > 0 && costumeVisible(COSTUMES[want], want) ? want : fallbackCostume(), false);
  markRow(els.rowCostume, state.costume, true);
}
function setIsland(on) {
  if (on === state.island || Fog.busy || !state.universe || (on && !islandOpen())) return;
  Snd.unlock();
  Snd.play('svirr');
  Fog.run(on ? enterIslandNow : leaveIslandNow, on ? 'island' : '');
  if (on) setTimeout(() => { toast('Simsalabim-øen!', 2200); Snd.play('oe'); }, 1300);
}
function setUniverse(on) {
  if (on === state.universe || Fog.busy) return;
  Snd.unlock();
  Snd.play('svirr');
  Fog.run(on ? enterUniverseNow : leaveUniverseNow);
  // "Alle mand på dæk!" råbte Kaptajn Knurhår.
  if (on) setTimeout(() => toast('Alle mand på dæk!', 2200), 1300);
}
function sailFromStart() {
  Snd.unlock();
  if (sleepReason()) { syncSleep(); return; }
  Snd.play('svirr');
  Fog.run(() => { enterUniverseNow(); onStart(); });
  setTimeout(() => toast('Alle mand på dæk!', 2200), 1300);
}
// "Alt normalt": one tap, always in the same place, and the face is just the face again. In the universe
// the ship sails home first, and nothing comes back on the way.
function allNormal() {
  Snd.unlock();
  if (Fog.busy) return;
  if (state.universe) {
    state.prevNormal = { c: 0, w: 0 };
    setUniverse(false);
  } else {
    const was = state.costume !== 0 || state.warp !== 0;
    selectCostume(0, false); selectWarp(0, false);
    markRow(els.rowCostume, 0, true); markRow(els.rowWarp, 0, true);
    if (was) puffAll();
  }
  Snd.play('normal');
  toast('Alt normalt');
}
function surprise() {
  if (state.island && islandThing('tryllehat')) {           // the magic hat goes on, or off again
    TopHat.on = !TopHat.on; topHatReset();
    Snd.play(TopHat.on ? 'simsalabim' : 'pop'); puffAll(); refreshRows();
    return;
  }
  Snd.play('dice');
  els.btnDice.classList.remove('roll'); void els.btnDice.offsetWidth; els.btnDice.classList.add('roll');
  const off = diceOff();
  const shown = COSTUMES.map((x, i) => i).filter(i => i > 0 && costumeVisible(COSTUMES[i], i));
  const inPool = shown.filter(i => !off.c.includes(COSTUMES[i].id));
  const cs = inPool.length ? inPool : shown;
  const ws = WARPS.map((x, i) => i).filter(i => i > 0 && !off.w.includes(WARPS[i].id));
  const pick = list => list[Math.floor(Math.random() * list.length)];
  let c = pick(cs.length ? cs : [state.costume || 1]);
  for (let n = 0; c === state.costume && cs.length > 1 && n < 20; n++) c = pick(cs);
  const w = state.universe || !ws.length || Math.random() < 0.45 ? 0 : pick(ws);
  selectCostume(c, false); selectWarp(w, false);
  puffAll();
  markRow(els.rowCostume, c, true); markRow(els.rowWarp, w, true);
  toast(w ? COSTUMES[c].name + ' + ' + WARPS[w].name : COSTUMES[c].name, 1600);
}

/* ---------------- the apple throw's two bubbles (story 1) ---------------- */
// "Hvad tror du, der sker?" is the book's second pause: a grown-up reads it aloud and taps it. Knurhår's answer,
// "Så falder det hele vejen rundt!", follows when the apple has fallen all the way round.
let askFor = '', sayFor = '', sayTimer = 0;
// a bubble's words, with a small Pip or Knurhår in front when one of them is talking, and an aside for the adult
function fillBubble(el, text, who, aside) {
  el.textContent = '';
  if (who) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    s.setAttribute('class', 'who'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#who-' + who);
    s.append(u); el.append(s);
  }
  el.append(document.createTextNode(text));
  if (aside) { const sm = document.createElement('small'); sm.textContent = aside; el.append(sm); }
}
function askShow(forWhat, text, opt = {}) {
  if (els.appleAsk.hidden || askFor !== forWhat) Snd.play('pop');
  askFor = forWhat;
  fillBubble(els.appleAsk, text, opt.who, opt.aside);
  show(els.appleAsk, true);
}
function askHide(forWhat) { if (!forWhat || askFor === forWhat) { askFor = ''; show(els.appleAsk, false); } }
function sayShow(text, ms = 3800, who = '', forWhat = '') {
  clearTimeout(sayTimer);
  sayFor = forWhat;
  fillBubble(els.appleSay, text, who);
  show(els.appleSay, true);
  sayTimer = setTimeout(() => { sayFor = ''; show(els.appleSay, false); }, ms);
}
function sayHide(forWhat) { if (!forWhat || sayFor === forWhat) { clearTimeout(sayTimer); sayFor = ''; show(els.appleSay, false); } }
// nothing else is talking or open, so Pip may try his rule
function bubbleBusy() { return !!askFor || !els.appleSay.hidden || !els.parent.hidden || state.mode !== 'live'; }
function appleUi(kind) {
  if (kind === 'ask') askShow('apple', 'Hvad tror du, der sker?');
  else if (kind === 'round') { askHide('apple'); sayShow('Så falder det hele vejen rundt!'); }
  else { askHide('apple'); sayHide(); }
}
// story 2: Pip comes aboard, in the book's words, and the vote that cannot be lost
function pipIsAboard() { return storyHeard(2) && store.get('pipAboard', false) === true; }
function boardUi(kind) {
  if (kind === 'up') askShow('pipUp', 'Pip! Jeg hedder Pip. Min båd er utæt. Må jeg komme op?', { who: 'pip' });
  else if (kind === 'vote') askShow('pipVote', 'Hvem stemmer for, at Pip bliver?', { who: 'knurhaar' });
  else if (kind === 'done') { askHide(); sayShow('Så er det besluttet. Pip bliver.', 3800, 'knurhaar'); }
  else { askHide('pipUp'); askHide('pipVote'); }
}
// Ret Pip, in the book's words: his rule with cheese in it, Knurhår's "Alt, Pip." and Pip saying it right
let retPipTimer = 0;
function retPipUi(kind) {
  clearTimeout(retPipTimer);
  if (kind === 'ask') { askShow('retPip', 'Ingen skal bestemme ost alene!', { who: 'pip', aside: 'Kan du rette Pip?' }); Snd.play('pip'); return; }
  if (kind === 'answer') {
    if (RetPip.st !== 'ask') return;
    RetPip.st = 'answer';
    askHide('retPip');
    sayShow('Alt, Pip. Ingen skal bestemme alt alene.', 4200, 'knurhaar', 'retPip');
    retPipTimer = setTimeout(() => {
      if (RetPip.st !== 'answer') return;
      RetPip.st = 'repeat';
      sayShow('Ingen skal bestemme alt alene.', 3800, 'pip', 'retPip');
      Snd.play('pip');
      retPipTimer = setTimeout(() => { if (RetPip.st === 'repeat') RetPip.st = 'done'; }, 3900);
    }, 4400);
    return;
  }
  askHide('retPip'); sayHide('retPip');
}
// the paper crown: when it has been torn and shared, Knurhår says the rule
function crownUi(kind) {
  if (kind === 'rule') sayShow('Ingen skal bestemme alt alene.', 4500, 'knurhaar', 'crown');
  else sayHide('crown');
}
function pipVote() {
  if (PipBoard.st !== 'vote') return;
  PipBoard.st = 'done';
  store.set('pipAboard', true);
  boardUi('done');
  Snd.play('pip');
}

/* ---------------- taking pictures ---------------- */
// One picture at a time: taps while a picture is being taken are ignored, not queued, and the
// white flash comes at most once a second (WCAG 2.3.1 allows at most three flashes a second).
let saving = Promise.resolve();
let snapping = false;
let lastFlash = -Infinity;
function snap() {
  if (!R || !R.hasFrame || state.mode === 'idle' || snapping || strip) return saving;
  snapping = true;
  saving = saving.then(snapNow).catch(e => console.error(e)).then(() => { snapping = false; });
  return saving;
}
function flash() {
  const now = performance.now();
  if (!store.get('flash', true) || now - lastFlash < 1000) return;
  lastFlash = now;
  els.flash.classList.remove('on'); void els.flash.offsetWidth; els.flash.classList.add('on');
}
async function snapNow() {
  Snd.play('shutter');
  flash();
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

/* ---------------- photo strip with a paw countdown (plan G5) ---------------- */
// One tap: three cat paws count down instead of numbers, then four pictures are taken a little apart and become
// one strip in the album. Nobody has to hold the shutter, so you can both be in it. Only one soft flash, at the
// very end (four in a row could exceed WCAG 2.3.1). A second tap stops it.
let strip = null;
const nap = ms => new Promise(res => setTimeout(res, ms));
function grabSquare(size = 480) {
  const W = els.gl.width, H = els.gl.height, side = Math.min(W, H);
  let cx = W / 2, cy = H * 0.45;
  const seen = faces.filter(f => f.alpha > 0.5);
  if (seen.length) {
    cx = 0; cy = 0;
    for (const f of seen) { const p = P(f, 0, 0.45, 0); cx += p[0] / seen.length; cy += p[1] / seen.length; }
  }
  const sx = clamp(cx - side / 2, 0, W - side), sy = clamp(cy - side / 2, 0, H - side);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.drawImage(els.gl, sx, sy, side, side, 0, 0, size, size);
  x.drawImage(els.fx, sx, sy, side, side, 0, 0, size, size);
  return c;
}
function pawPrint(x, cx, cy, s, rot, col) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = col;
  x.beginPath(); x.ellipse(0, s * 0.35, s * 0.62, s * 0.5, 0, 0, TAU); x.fill();
  for (const [tx, ty, a] of [[-0.62, -0.28, -0.35], [-0.22, -0.68, -0.1], [0.22, -0.68, 0.1], [0.62, -0.28, 0.35]]) {
    x.beginPath(); x.ellipse(tx * s, ty * s, s * 0.2, s * 0.27, a, 0, TAU); x.fill();
  }
  x.restore();
}
async function saveStrip(frames) {
  const S = frames[0].width, pad = 26, gap = 16, foot = 74;
  const c = document.createElement('canvas');
  c.width = S + pad * 2; c.height = pad + frames.length * (S + gap) - gap + foot;
  const x = c.getContext('2d');
  x.fillStyle = '#FBF3E2'; x.fillRect(0, 0, c.width, c.height);
  frames.forEach((fr, i) => x.drawImage(fr, pad, pad + i * (S + gap)));
  for (let i = 0; i < 4; i++) pawPrint(x, c.width / 2 + (i - 1.5) * 64, c.height - foot / 2 + (i % 2 ? 6 : -6), 15, (i % 2 ? 1 : -1) * 0.3, '#E2B98F');
  const blob = await toBlob(c, 'image/jpeg', 0.9);
  const t = document.createElement('canvas');
  t.width = t.height = 300;
  t.getContext('2d').drawImage(c, 0, 0, c.width, c.width, 0, 0, 300, 300);
  const thumb = await toBlob(t, 'image/jpeg', 0.75);
  if (!blob) { toast('Billedet kunne ikke gemmes', 2000); return; }
  await Album.add(blob, thumb);
  setAlbumThumb(thumb);
  els.btnAlbum.classList.remove('bump'); void els.btnAlbum.offsetWidth; els.btnAlbum.classList.add('bump');
}
async function photoStrip() {
  if (strip) { strip.cancel = true; return; }
  if (!R || !R.hasFrame || state.mode !== 'live' || snapping) return;
  Snd.unlock();
  const run = strip = { cancel: false };
  const live = () => !run.cancel && state.mode === 'live' && !state.paused && !sleeping && !document.hidden;
  const big = [...els.paws.querySelectorAll('.count svg')], small = [...els.paws.querySelectorAll('.shots svg')];
  big.forEach(p => p.classList.remove('gone'));
  small.forEach(p => p.classList.remove('on'));
  els.paws.classList.remove('shooting');
  show(els.paws, true);
  els.btnStrip.classList.add('on');
  els.btnStrip.setAttribute('aria-pressed', 'true');
  const frames = [];
  try {
    for (let i = 0; i < 3; i++) {
      Snd.play('tik');
      await nap(1000);
      if (!live()) return;
      big[2 - i].classList.add('gone');
    }
    await nap(300);
    els.paws.classList.add('shooting');
    for (let i = 0; i < 4; i++) {
      if (!live()) return;
      frames.push(grabSquare());
      small[i].classList.add('on');
      Snd.play('klik');
      if (i < 3) await nap(1300);
    }
    flash();
    await saveStrip(frames);
  } catch (e) {
    console.error(e);
  } finally {
    if (strip === run) strip = null;
    show(els.paws, false);
    els.btnStrip.classList.remove('on');
    els.btnStrip.setAttribute('aria-pressed', 'false');
  }
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
  restCamera();
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
    img.src = u; img.alt = ''; img.draggable = false;
    b.append(img);
    b.addEventListener('click', () => openViewer(rec));
    els.grid.append(b);
  }
  els.albumCount.textContent = list.length ? (list.length === 1 ? '1 billede' : list.length + ' billeder') : '';
  show(els.albumEmpty, !list.length);
  show(els.album, true);
}
function closeAlbum() { show(els.album, false); state.paused = false; wakeCamera(); }
let viewRec = null, viewUrl = null;
function openViewer(rec) {
  viewRec = rec;
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = URL.createObjectURL(rec.blob);
  els.viewImg.src = viewUrl;
  show(els.confirm, false);
  show(els.viewer, true);
}
function closeViewer() { show(els.viewer, false); }
function canShareFiles() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.jpg', { type: 'image/jpeg' })] })); }
  catch (e) { return false; }
}
function sharePhoto() {
  if (!viewRec) return;
  // called straight from the grown-up's tap, so the phone's share sheet is allowed to open
  const file = new File([viewRec.blob], 'fjollekamera_' + stamp() + '.jpg', { type: 'image/jpeg' });
  navigator.share({ files: [file] }).catch(e => { if (e && e.name !== 'AbortError') toast('Billedet kunne ikke deles', 2000); });
}
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

/* ---------------- version number and "Nyt i appen" (build.py puts them in from CHANGELOG.md) ---------------- */
function openNews() {
  if (!els.newsList.childElementCount) {
    for (const c of CHANGES) {
      const h = document.createElement('h3'), d = document.createElement('small'), ul = document.createElement('ul');
      h.textContent = 'Version ' + c.version + ' ';
      d.textContent = '· ' + c.date;
      h.append(d);
      for (const text of c.items) { const li = document.createElement('li'); li.textContent = text; ul.append(li); }
      els.newsList.append(h, ul);
    }
  }
  show(els.news, true);
  els.newsList.scrollTop = 0;
  els.newsClose.focus();
}
function closeNews() { show(els.news, false); }

/* ---------------- updates: a newer version is fetched when the app opens and when it comes back ---------------- */
// version.json lies next to index.html; the service worker never keeps it, so this always asks GitHub
let checkingUpdate = false, pickedAt = -Infinity;
function isNewer(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}
// never in the middle of a game with a photo from the album, while a photo is open, or while the grown-up lock is in use
function calmForUpdate() {
  return state.mode !== 'photo' && els.gate.hidden && els.viewer.hidden && els.parent.hidden && !Fog.busy && performance.now() - pickedAt > 60000;
}
async function checkUpdate(atStart) {
  if (checkingUpdate || navigator.onLine === false || !/^https?:$/.test(location.protocol) || window.self !== window.top) return;
  checkingUpdate = true;
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const v = String((await res.json()).version || '');
    if (!/^\d+(\.\d+)*$/.test(v) || !isNewer(v, APP_VERSION) || document.hidden) return;
    // at start only while the start screen is untouched; otherwise wait for the next time the app comes back
    if (atStart ? state.mode !== 'idle' || els.start.hidden : !calmForUpdate()) return;
    // at most one try per version every ten minutes, so a slow update can never make the app restart over and over
    const last = store.get('updateTry', null);
    if (last && last.v === v && Date.now() - last.t < 10 * 60 * 1000) return;
    store.set('updateTry', { v, t: Date.now() });
    // a changed service worker is fetched in the background, the page itself comes fresh with the restart
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    location.reload();
  } catch (e) { /* offline or no version.json: try again next time */ }
  finally { checkingUpdate = false; }
}

/* ---------------- grown-up corner: the book's stories, the dice, sound, time and photos ---------------- */
// The book's 12 stories, named as in its index. A story counts as heard when a grown-up says so here;
// nothing is unlocked by using the app.
const STORIES = [
  'Hvorfor falder månen ikke ned?',
  'Hvem bestemmer i Danmark?',
  'Hvorfor kan man købe is for en mønt?',
  'Hvordan husker man mere, end der kan være i hovedet?',
  'Hvad står der på den store sten i Jelling?',
  'Hvad er alting lavet af?',
  'Hvordan finder man ud af, hvad der skete for over 3.000 år siden?',
  'Hvorfor måtte Peder ikke flytte?',
  'Hvordan kom bananen til Danmark?',
  'Hvorfor har finkerne forskellige næb?',
  'Hvorfor stod der en mur midt i en by?',
  'Hvilke regler gælder for alle mennesker?'
];
const DICE_OFF = { c: [], w: ['trold', 'snurre'] };    // left out of the dice until a grown-up puts them back
const VOLUMES = { lav: 0.4, normal: 1 };
const LIMITS = [0, 10, 15, 20, 30];                     // minutes per time, 0 = no limit
const EVENINGS = ['', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];
const BREAK_MS = 60 * 60 * 1000;                        // an hour away starts the time limit over
const MORNING = 6 * 60;                                 // the evening lock lasts until six in the morning

function heard() { const h = store.get('stories', [1]); return Array.isArray(h) ? h : [1]; }
function storyHeard(n) { return heard().includes(n); }
function diceOff() {
  const d = store.get('diceOff', null);
  return d && Array.isArray(d.c) && Array.isArray(d.w) ? d : DICE_OFF;
}
function setMuted(m) {
  state.muted = m;
  store.set('muted', m);
  els.btnSound.classList.toggle('off', m);
  els.btnSound.setAttribute('aria-pressed', String(!m));
}

// time: counted while the app is open and in use, not on the start screen
function playLog() { const p = store.get('play', null); return p && typeof p.ms === 'number' ? p : { ms: 0, last: 0 }; }
function usedMs() { const p = playLog(); return Date.now() - p.last > BREAK_MS ? 0 : p.ms; }
function limitReached() { const m = store.get('limit', 0); return m > 0 && usedMs() >= m * 60000; }
let playTick = performance.now();
function tickPlay() {
  const now = performance.now(), d = Math.min(now - playTick, 10000);
  playTick = now;
  if (!document.hidden && state.mode !== 'idle' && !sleeping && els.parent.hidden) {
    store.set('play', { ms: usedMs() + d, last: Date.now() });
  }
  syncSleep();
}
function minutesOf(d) { return d.getHours() * 60 + d.getMinutes(); }
function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
// the evening a moment belongs to: before six in the morning it is still the evening before
function eveningKey(d = new Date()) { return minutesOf(d) < MORNING ? dayKey(new Date(d.getTime() - 864e5)) : dayKey(d); }
function eveningActive(d = new Date()) {
  const ev = store.get('evening', '');
  if (!ev) return false;
  const [h, m] = ev.split(':').map(Number), now = minutesOf(d);
  if (now < h * 60 + m && now >= MORNING) return false;
  return store.get('eveningOff', '') !== eveningKey(d);
}
function clock(t) { return t.replace(':', '.'); }

// sleep: the camera stops, the screen may lock itself, and Kaptajn Knurhår yawns and curls up in the
// hammock under the moon (plan G4). She never gets sad, counts down or offers "one more time".
let sleeping = '';
function sleepReason() { return eveningActive() ? 'aften' : limitReached() ? 'tid' : ''; }
function svgShow(el, on) { if (el) el.style.display = on ? '' : 'none'; }
function goToSleep(reason) {
  sleeping = reason;
  // the book's last line, "Godnat, Kaptajn Knurhår. Godnat, Pip." Story 1 ends "Godnat, Kaptajn Knurhår. Godnat, måne."
  const pip = storyHeard(2);
  els.sleepTitle.textContent = reason === 'aften' ? 'Godnat, Kaptajn Knurhår.' : 'Kameraet hviler nu';
  els.sleepText.textContent = reason === 'aften' ? (pip ? 'Godnat, Pip.' : 'Godnat, måne.') : 'Vi leger igen en anden gang.';
  appleReset();
  pipBoardReset();
  crownReset();
  retPipReset();
  if (strip) strip.cancel = true;
  show(els.sleepText, !!els.sleepText.textContent);
  // Pip sleeps in her hat from story 2; on deck lie the things from the stories that have been read
  svgShow($('nightPip'), pip);
  svgShow($('nightApple'), storyHeard(1));
  svgShow($('nightCrown'), storyHeard(2));
  svgShow($('nightUmbrella'), umbrellaOn());
  els.sleep.classList.remove('play'); void els.sleep.offsetWidth; els.sleep.classList.add('play');
  Snd.play('gab');
  state.paused = true;
  restCamera();
  releaseWake();
  for (const el of [els.album, els.viewer, els.news, els.start]) show(el, false);
  stopDemo();
  show(els.sleep, true);
}
function wakeUp() {
  sleeping = '';
  show(els.sleep, false);
  state.paused = false;
  if (state.mode === 'idle') { show(els.start, true); startDemo(); }
  else wakeCamera();
}
function syncSleep() {
  if (!els.parent.hidden || !els.gate.hidden) return;     // a grown-up is busy: decide when they are done
  const r = sleepReason();
  if (r && r !== sleeping) goToSleep(r);
  else if (!r && sleeping) wakeUp();
}

function segment(box, options, current, onPick) {
  box.innerHTML = '';
  for (const [value, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => {
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
      onPick(value);
    });
    box.append(b);
  }
}
function renderStories() {
  els.storyList.innerHTML = '';
  STORIES.forEach((title, i) => {
    const n = i + 1, b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-toggle';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(storyHeard(n)));
    const num = document.createElement('span'), ttl = document.createElement('span'), sw = document.createElement('span');
    num.className = 'num'; num.textContent = n;
    ttl.className = 'ttl'; ttl.textContent = title;
    sw.className = 'switch'; sw.setAttribute('aria-hidden', 'true');
    b.append(num, ttl, sw);
    b.addEventListener('click', () => {
      const set = new Set(heard());
      if (set.has(n)) set.delete(n); else set.add(n);
      store.set('stories', [...set].sort((a, c) => a - c));
      b.setAttribute('aria-checked', String(set.has(n)));
      show(els.pipAgain, storyHeard(2) && store.get('pipAboard', false) === true);
    });
    els.storyList.append(b);
  });
}
function renderIsland() {
  els.islandList.innerHTML = '';
  for (const [key, title, def = true] of [['island', 'Skibet kan sejle videre til øen'], ['umbrella', 'Drømmeparaplyen over hængekøjen'],
    ['tryllehat', 'Tryllehatten: på øen bliver terningen en høj hat'], ['maanering', 'Måneringen, når I er to og åbner munden samtidig'],
    ['lygtelys', 'Lygtelyset: når I kommer til øen, ligger der tåge, og et lille lys ved næsen visker den væk, så tingene fra de læste historier kommer frem'],
    ['trick', 'Tricket på far: med to i billedet lander hattens trylleri på den anden, og en lup viser bagefter de prikker, kameraet finder i hans ansigt. Prøv det på dig selv først', false]]) {
    const b = document.createElement('button'), ttl = document.createElement('span'), sw = document.createElement('span');
    b.type = 'button'; b.className = 'row-toggle'; b.setAttribute('role', 'switch'); b.dataset.key = key;
    b.setAttribute('aria-checked', String(store.get(key, def) !== false));
    ttl.className = 'ttl'; ttl.textContent = title;
    sw.className = 'switch'; sw.setAttribute('aria-hidden', 'true');
    b.append(ttl, sw);
    b.addEventListener('click', () => {
      const on = store.get(key, def) === false;
      store.set(key, on);
      b.setAttribute('aria-checked', String(on));
    });
    els.islandList.append(b);
  }
}
// how many pictures a second the face tracking manages, for the grown-ups: hands and background need about 15
const detTimes = [];
function noteDetection(now) {
  if (detTimes.length && now - detTimes[detTimes.length - 1] > 1000) detTimes.length = 0;     // after a pause
  detTimes.push(now);
  while (detTimes.length && now - detTimes[0] > 3000) detTimes.shift();
  if (detTimes.length < 10) return;
  state.detFps = ((detTimes.length - 1) * 1000) / (now - detTimes[0]);
  if (now - (state.fpsSaved || 0) > 5000) { state.fpsSaved = now; store.set('fps', Math.round(state.detFps)); }
}
function renderFps() {
  const fps = store.get('fps', 0);
  els.fpsLine.textContent = fps ? 'Ansigtssporingen nåede sidst ca. ' + fps + ' billeder i sekundet på denne enhed. Hænder og baggrund på øen kræver mindst 15.'
    : 'Ansigtssporingen er ikke målt endnu. Leg lidt med kameraet først.';
}
function renderPool() {
  const chips = (list, kind, box) => {
    box.innerHTML = '';
    const avail = list.filter((x, j) => j > 0 && (kind === 'w' || (unlocked(x) && !x.world && !x.hidden)));
    list.forEach((it, i) => {
      if (i === 0 || !avail.includes(it)) return;             // "Normal" and locked figures are not choices
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = it.name;
      b.setAttribute('aria-pressed', String(!diceOff()[kind].includes(it.id)));
      b.addEventListener('click', () => {
        const off = diceOff(), set = new Set(off[kind]);
        if (set.has(it.id)) set.delete(it.id);
        else {
          if (kind === 'c' && avail.filter(x => !set.has(x.id)).length <= 1) { toast('Terningen skal have mindst én udklædning', 2200); return; }
          set.add(it.id);
        }
        store.set('diceOff', Object.assign({ c: off.c, w: off.w }, { [kind]: [...set] }));
        b.setAttribute('aria-pressed', String(!set.has(it.id)));
      });
      box.append(b);
    });
  };
  chips(COSTUMES, 'c', els.poolCostumes);
  chips(WARPS, 'w', els.poolWarps);
}
function renderTime() {
  const m = store.get('limit', 0), used = usedMs();
  els.limitInfo.textContent = m
    ? 'Brugt nu: ' + Math.min(m, Math.floor(used / 60000)) + ' af ' + m + ' minutter. Efter en times pause starter tiden forfra.'
    : 'Ingen tidsgrænse.';
  show(els.moreTime, m > 0 && used > 0);
  const ev = store.get('evening', ''), lifted = !!ev && store.get('eveningOff', '') === eveningKey();
  els.eveningInfo.textContent = !ev ? 'Ingen aftenlås.'
    : lifted ? 'Slået fra i aften. I morgen sover appen igen fra kl. ' + clock(ev) + ' til kl. 6.'
    : 'Appen sover fra kl. ' + clock(ev) + ' til kl. 6.';
  show(els.eveningOff, !!ev && !lifted);
}
function renderParent() {
  renderStories();
  show(els.pipAgain, storyHeard(2) && store.get('pipAboard', false) === true);
  renderIsland();
  renderFps();
  renderPool();
  segment(els.setVolume, [['fra', 'Fra'], ['lav', 'Lav'], ['normal', 'Normal']], state.muted ? 'fra' : store.get('volume', 'normal'), v => {
    if (v === 'fra') { setMuted(true); return; }
    setMuted(false);
    store.set('volume', v);
    Snd.level = VOLUMES[v];
    Snd.unlock();
    Snd.play('pop');
  });
  segment(els.setFlash, [[true, 'Til'], [false, 'Fra']], store.get('flash', true), v => store.set('flash', v));
  segment(els.setLimit, LIMITS.map(m => [m, m ? m + ' min' : 'Ingen']), store.get('limit', 0), v => { store.set('limit', v); renderTime(); });
  segment(els.setEvening, EVENINGS.map(t => [t, t ? clock(t) : 'Fra']), store.get('evening', ''), v => { store.set('evening', v); renderTime(); });
  renderTime();
  show(els.deleteAllAsk, false);
}
function openParent() {
  state.paused = true;
  restCamera();
  renderParent();
  show(els.parent, true);
}
function closeParent() {
  show(els.parent, false);
  show(els.deleteAllAsk, false);
  if (state.island && !islandOpen()) leaveIslandNow();      // the island was closed: back on Knurhår's ship
  appleReset();                                            // story 1 or 2 may have been turned off
  pipBoardReset();
  crownReset();
  retPipReset();
  refreshRows();
  const r = sleepReason();
  if (r) { goToSleep(r); return; }
  if (sleeping) { wakeUp(); return; }
  state.paused = false;
  wakeCamera();
}
async function askDeleteAll() {
  const n = (await Album.list()).length;
  els.deleteAllText.textContent = !n ? 'Der er ingen billeder.'
    : n === 1 ? 'Slet det ene billede? Det kan ikke fortrydes.' : 'Slet alle ' + n + ' billeder? Det kan ikke fortrydes.';
  show(els.deleteAllYes, n > 0);
  show(els.deleteAllAsk, true);
}
async function deleteAll() {
  for (const r of await Album.list()) { try { await Album.remove(r.id); } catch (e) { /* keep going */ } }
  await refreshAlbumThumb();
  show(els.deleteAllAsk, false);
  toast('Alle billeder er slettet', 1800);
}

/* ---------------- start screen demo ---------------- */
let demoOn = false, demoFace = null, demoIdx = -1;
const DEMO_SET = ['knurhaar', 'kat', 'hund', 'enhjoerning', 'kanin', 'loeve', 'prinsesse', 'nisse', 'rumvaesen', 'sej', 'klovn'];
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
  if (c.tint) { fr(g2, f, P(f, 0, 0.5, 0)); oval(g2, 0, 0, 0.55, 0.69); x.fillStyle = tintCss(c.tint); x.fill(); }
  try { c.draw(g2, f, { t, dt: 1 / 60, icon: true, since: t - f.born, W: S, H: S }); } catch (e) { /* ignore */ }
  x.restore();
}

/* ---------------- main loop ---------------- */
function motion(f, now) {
  const M = f.M;
  const det = M[0] * M[4] - M[1] * M[3] || 1;
  f.px = Math.sqrt(Math.abs(det));
  f.grav = Math.atan2(M[1] / det, M[0] / det);
  const gx = -M[1] / det, gy = M[0] / det, gl = Math.hypot(gx, gy) || 1;
  f.gravX = gx / gl; f.gravY = gy / gl;
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
    f.accY = clamp((-M[3] * f.accS[0] + M[0] * f.accS[1]) / det, -60, 60);
  } else { f.vel[0] = f.vel[1] = 0; f.accX = 0; f.accY = 0; }
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
// average cheek colour from the camera image, so the big ears match the child's skin
const skinCan = document.createElement('canvas');
skinCan.width = skinCan.height = 6;
const skinCtx = skinCan.getContext('2d', { willReadFrequently: true });
function sampleSkin(f) {
  const src = state.mode === 'photo' ? state.photoCanvas : els.video;
  if (!src || (src === els.video && src.readyState < 2)) return;
  let r = 0, gg = 0, b = 0, n = 0;
  for (const i of [50, 280, 205, 425]) {
    const s = Math.max(4, f.U * 0.05), x = f.lm[3 * i] - s / 2, y = f.lm[3 * i + 1] - s / 2;
    try {
      skinCtx.clearRect(0, 0, 6, 6);
      skinCtx.drawImage(src, x, y, s, s, 0, 0, 6, 6);
      const d = skinCtx.getImageData(0, 0, 6, 6).data;
      for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 200) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++; }
    } catch (e) { return; }
  }
  if (!n) return;
  const c = [r / n, gg / n, b / n];
  f.skinRGB = f.skinRGB ? f.skinRGB.map((v, i) => lerp(v, c[i], 0.35)) : c;
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
  for (let fi = 0; fi < list.length; fi++) {
    const f = list[fi];
    f.warps = [];
    // a scary face is only ever the first face's own: a second face (often a grown-up's) is never turned
    // into a troll on its own (tryghedslaget)
    if (preset.fn && f.alpha > 0.05 && !(preset.scary && fi > 0)) {
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
  const env = { t, dt, icon: false, since: (now - state.costumeSince) / 1000, W, H, floor: state.floor || H,
    universe: state.universe, n: list.length, peek: state.peekAt ? (now - state.peekAt) / 1000 : 99 };
  for (let fi = 0; fi < list.length; fi++) {
    const f = list[fi];
    screenPoints(f, f.warps || []);
    fitPose(f.S, f.M, f.T);
    motion(f, now);
    f.t = t; f.dt = dt;
    if (f.alpha <= 0.01) continue;
    if (preset.skin && now - (f.skinAt || 0) > 400) { sampleSkin(f); f.skinAt = now; }
    if (fi === 0 && state.island) { try { lanternFog(g, env, list); } catch (e) { console.error('lygtelys', e); } }
    g.globalAlpha = f.alpha;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (preset.draw && !(preset.scary && fi > 0)) { try { preset.draw(g, f, env); } catch (e) { console.error(preset.id, e); } g.setLineDash([]); }
    const fc = state.universe && fi > 0 ? partnerOf(cos) : cos;
    env.fi = fi;
    try { fc.draw(g, f, env); } catch (e) { console.error(fc.id, e); }
    g.setLineDash([]);
  }
  g.globalAlpha = 1;
  updateParticles(dt, H);
  drawParticles(g);

  // "look into the camera" hint
  if (state.mode === 'live' && ready && !state.paused) {
    if (faces.length) {
      // peekaboo: the face was hidden (behind her hands) for a moment and is back
      if (state.noFaceSince && now - state.noFaceSince > 700) state.peekAt = now;
      state.noFaceSince = 0;
      if (!els.hint.hidden) show(els.hint, false);
    }
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
  selectCostume(ci > 0 && unlocked(COSTUMES[ci]) ? ci : 1, false);
  refreshRows();
  selectWarp(wi >= 0 ? wi : 0, false);
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  Album.open().then(refreshAlbumThumb);
  initDetector();
  startDemo();

  bind(els.btnStart, onStart);
  bind(els.btnShipStart, sailFromStart);
  bind(els.btnUniverse, () => setUniverse(!state.universe));
  bind(els.btnShutter, snap);
  bind(els.btnDice, surprise);
  bind(els.btnNormal, allNormal);
  bind(els.btnStrip, photoStrip);
  bind(els.appleAsk, () => {
    Snd.unlock();
    const what = askFor;
    if (what === 'apple') { if (appleRound()) { askHide('apple'); Snd.play('kast'); } }
    else if (what === 'pipUp') { askHide('pipUp'); if (pipClimb()) Snd.play('pip'); }
    else if (what === 'pipVote') { askHide('pipVote'); pipVote(); }
    else if (what === 'retPip') retPipUi('answer');
  });
  bind(els.pipAgain, () => { store.set('pipAboard', false); pipBoardReset(); show(els.pipAgain, false); toast('Pip venter i sin valnøddeskal', 2000); });
  bind(els.btnIsland, () => setIsland(!state.island));
  bind(els.btnAlbum, openAlbum);
  bind(els.albumBack, closeAlbum);
  bind(els.viewBack, closeViewer);
  bind(els.viewSave, () => requireParent(savePhoto));
  bind(els.viewDel, () => requireParent(() => show(els.confirm, true)));
  bind(els.viewShare, () => requireParent(sharePhoto));
  show(els.viewShare, canShareFiles() && !(window.claude && typeof window.claude.use === 'function'));
  bind(els.delNo, () => show(els.confirm, false));
  bind(els.delYes, deletePhoto);
  bind(els.gateClose, closeGate);
  els.appVersion.textContent = APP_VERSION;
  els.parentVersion.textContent = APP_VERSION;
  bind(els.btnNews, openNews);
  bind(els.newsClose, closeNews);
  // the grown-up corner
  Snd.level = VOLUMES[store.get('volume', 'normal')] || 1;
  bind(els.btnParent, () => requireParent(openParent));
  bind(els.sleepParent, () => requireParent(openParent));
  bind(els.parentBack, closeParent);
  bind(els.parentNews, openNews);
  bind(els.moreTime, () => { store.set('play', { ms: Math.max(0, usedMs() - 10 * 60000), last: Date.now() }); renderTime(); });
  bind(els.eveningOff, () => { store.set('eveningOff', eveningKey()); renderTime(); });
  bind(els.parentPick, () => { closeParent(); if (sleeping) return; pickedAt = performance.now(); els.file.click(); });
  bind(els.deleteAll, askDeleteAll);
  bind(els.deleteAllNo, () => show(els.deleteAllAsk, false));
  bind(els.deleteAllYes, deleteAll);
  els.gatePad.addEventListener('pointerdown', gateDown);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) els.gatePad.addEventListener(ev, gateUp);
  bind(els.btnLive, () => { Snd.unlock(); startCamera(state.facing).catch(cameraError); });
  bind(els.btnFlip, () => {
    const next = state.facing === 'user' ? 'environment' : 'user';
    els.btnFlip.classList.remove('spin'); void els.btnFlip.offsetWidth; els.btnFlip.classList.add('spin');
    startCamera(next).catch(cameraError);
  });
  bind(els.btnSound, () => {
    Snd.unlock();
    setMuted(!state.muted);
    if (!state.muted) Snd.play('pop');
  });
  els.file.addEventListener('change', () => {
    const file = els.file.files && els.file.files[0];
    els.file.value = '';
    if (file) usePhoto(file);
  });
  // the camera stops while the app is hidden and starts again when it comes back, and then a newer version is fetched
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { restCamera(); return; }
    lastTouch = performance.now();
    playTick = performance.now();               // time away does not count
    syncSleep();
    if (!sleeping) {
      if (restingCam) wakeCamera();
      else if (state.mode === 'live' && state.stream) { keepAwake(); els.video.play().catch(() => {}); }
    }
    checkUpdate(false);
  });
  // two minutes without a touch lets go of the screen lock, so the phone can lock itself
  document.addEventListener('pointerdown', touched, true);
  setInterval(() => { checkIdle(); tickPlay(); }, 5000);
  // no long-press menu and no dragging photos out of the app (Chrome on Android offers sharing there)
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  // no pinch zoom or double-tap zoom while playing
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  // inside Claude, offer saving through the viewer's download prompt
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(d => { state.dl = d || null; }).catch(() => {});
  }
  // keeps the app on the device for offline use (localhost too, for the tests)
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local) && window.self === window.top) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }
  syncSleep();                                  // in the evening the app opens asleep
  checkUpdate(true);
  requestAnimationFrame(frame);
}

// small hook for automated tests
window.__fk = {
  state, get faces() { return faces; }, get restingCam() { return restingCam; },
  get lastTouch() { return lastTouch; }, set lastTouch(v) { lastTouch = v; }, checkIdle,
  selectCostume, selectWarp, snap, COSTUMES, WARPS, parts, Album, checkUpdate, isNewer, APP_VERSION,
  store, openParent, closeParent, syncSleep, tickPlay, sleepReason, surprise, get sleeping() { return sleeping; },
  setUniverse, refreshRows, Fog, partnerOf, allNormal, setIsland, islandOpen, photoStrip, get strip() { return strip; }, pipVote,
  Crown, RetPip, crownReset, retPipReset, bubbleBusy, TopHat, MoonRing, islandThing, Lens, Lantern
};

init();
