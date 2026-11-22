'use strict';
/* ==========================================================================
   Fjollekameraet – udklædninger, partikler og tegnefiguren til menuen.
   Alt er tegnet i "ansigtsenheder": 1 = ansigtets bredde (kind til kind),
   origo i panden (landmark 10), x mod højre, y nedad, z ud mod kameraet.
   ========================================================================== */

const LINE = '#2B1B12';
const LW = 0.014;

const sp = (f, i) => [f.S[2 * i], f.S[2 * i + 1]];
const smix = (f, i, j, t = 0.5) => [lerp(f.S[2 * i], f.S[2 * j], t), lerp(f.S[2 * i + 1], f.S[2 * j + 1], t)];
function scent(f, idx) {
  let x = 0, y = 0;
  for (const i of idx) { x += f.S[2 * i]; y += f.S[2 * i + 1]; }
  return [x / idx.length, y / idx.length];
}
// canonical face point -> screen
function P(f, x, y, z = 0) {
  const M = f.M;
  return [M[0] * x + M[1] * y + M[2] * z + f.T[0], M[3] * x + M[4] * y + M[5] * z + f.T[1]];
}
// draw in the face plane with origin at screen point p
function fr(g, f, p) { const M = f.M; g.setTransform(M[0], M[3], M[1], M[4], p[0], p[1]); }
function frS(g, f, p, side) { fr(g, f, p); if (side < 0) g.scale(-1, 1); }
function downDir(f) { const l = Math.hypot(f.M[1], f.M[4]) || 1; return [f.M[1] / l, f.M[4] / l]; }

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.abs(r), 0, TAU); }
function oval(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); }
function paint(g, fill, stroke = LINE, lw = LW) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}

// Pendulum-ish spring per face and element. dir: +1 hanging, -1 standing.
function spring(f, key, target, o = {}) {
  const k = o.k ?? 70, c = o.c ?? 6, gain = (o.g ?? 1.6) * (o.dir ?? 1), lim = o.lim ?? 1.2;
  let s = f.springs[key];
  if (!s) s = f.springs[key] = { a: target, v: 0 };
  const dt = Math.min(f.dt, 0.05);
  if (dt > 0) {
    const h = dt / 3;
    for (let i = 0; i < 3; i++) {
      const acc = -k * (s.a - target) - c * s.v + gain * f.accX;
      s.v += acc * h;
      s.a += s.v * h;
    }
    s.a = clamp(s.a, target - lim, target + lim);
  } else if (f.icon) { s.a = target; s.v = 0; }
  return s.a;
}

/* ---------- particles (screen pixels) ---------- */
const parts = [];
function emit(p) { if (parts.length < 600) parts.push(p); }
function every(f, key, rate, dt, fn) {
  f.mem[key] = (f.mem[key] || 0) + rate * dt;
  while (f.mem[key] >= 1) { f.mem[key] -= 1; fn(); }
}
const sprites = {};
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function mistSprite() {
  if (sprites.mist) return sprites.mist;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,252,255,0.95)');
  gr.addColorStop(0.45, 'rgba(238,232,255,0.7)');
  gr.addColorStop(1, 'rgba(225,218,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return (sprites.mist = c);
}
// The book's time fog ("en tåge, der glitrer som stjernestøv") as a small puff around a face. It covers
// the moment one costume or silly face turns into another, so nothing changes in plain sight.
function fogPuff(f) {
  const c = P(f, 0, 0.55, 0), n = REDUCED ? 8 : 16, move = REDUCED ? 0 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, rr = f.px * (0.1 + Math.random() * 0.45);
    const max = 0.6 + Math.random() * 0.25;
    emit({ type: 'mist', keep: true, x: c[0] + Math.cos(a) * rr, y: c[1] + Math.sin(a) * rr * 1.25,
      vx: Math.cos(a) * f.px * 0.22 * move, vy: (Math.sin(a) * 0.18 - 0.06) * f.px * move,
      life: max * 0.1, max, r0: f.px * 0.22, r1: f.px * (0.38 + Math.random() * 0.16) });
  }
  for (let i = 0; i < (REDUCED ? 0 : 10); i++) {
    const a = Math.random() * TAU, rr = f.px * (0.2 + Math.random() * 0.5);
    emit({ type: 'spark', keep: true, x: c[0] + Math.cos(a) * rr, y: c[1] + Math.sin(a) * rr * 1.2, vx: 0, vy: -f.px * 0.05,
      life: 0, max: 0.5 + Math.random() * 0.4, r: f.px * (0.025 + Math.random() * 0.03), rot: Math.random(), col: '#FFFFFF' });
  }
}
function fireSprite(kind) {
  if (sprites[kind]) return sprites[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const sets = {
    a: ['rgba(255,255,220,1)', 'rgba(255,220,90,0.9)', 'rgba(255,150,40,0.35)', 'rgba(255,120,0,0)'],
    b: ['rgba(255,230,120,1)', 'rgba(255,150,40,0.85)', 'rgba(230,70,20,0.3)', 'rgba(200,40,0,0)'],
    c: ['rgba(255,140,60,0.9)', 'rgba(220,60,30,0.6)', 'rgba(150,30,20,0.2)', 'rgba(100,20,20,0)']
  }[kind];
  sets.forEach((col, i) => gr.addColorStop(i / 3, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return (sprites[kind] = c);
}
function star4(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}
function updateParticles(dt, H) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max || p.y > H + 200) { parts.splice(i, 1); continue; }
    p.vx += (p.ax || 0) * dt; p.vy += (p.ay || 0) * dt;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vr) p.rot += p.vr * dt;
  }
}
function drawParticles(g) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.type === 'fire') {
      g.globalCompositeOperation = 'lighter';
      const r = lerp(p.r0, p.r1, k);
      g.globalAlpha = (1 - k) * 0.9;
      g.drawImage(fireSprite(k < 0.3 ? 'a' : k < 0.65 ? 'b' : 'c'), p.x - r, p.y - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
    } else if (p.type === 'spark') {
      g.globalAlpha = Math.sin(Math.PI * k);
      g.fillStyle = p.col || '#FFF7C2';
      star4(g, p.x, p.y, p.r * (0.7 + 0.3 * Math.sin(p.life * 12)), p.rot || 0);
      g.fill();
    } else if (p.type === 'conf') {
      g.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.life * 9));
      g.fillStyle = p.col;
      g.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
      g.restore();
    } else if (p.type === 'snow') {
      g.globalAlpha = Math.min(1, (p.max - p.life) * 2) * 0.9;
      g.fillStyle = '#FFFFFF';
      circle(g, p.x + Math.sin(p.life * 1.7 + p.seed) * p.r * 3, p.y, p.r);
      g.fill();
    } else if (p.type === 'smoke') {
      g.globalAlpha = (1 - k) * 0.45;
      g.fillStyle = '#E9E4DF';
      circle(g, p.x, p.y, lerp(p.r0, p.r1, k));
      g.fill();
    } else if (p.type === 'mist') {
      const r = lerp(p.r0, p.r1, k);
      g.globalAlpha = k < 0.2 ? 0.5 + 2.5 * k : Math.pow(1 - (k - 0.2) / 0.8, 1.4);
      g.drawImage(mistSprite(), p.x - r, p.y - r, r * 2, r * 2);
    } else if (p.type === 'bubble') {
      g.globalAlpha = 1 - k * k;
      circle(g, p.x, p.y, p.r);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1.5, p.r * 0.12); g.stroke();
      g.fillStyle = 'rgba(180,230,255,0.25)'; g.fill();
    }
  }
  g.globalAlpha = 1;
}
function sparkleAround(f, env, rate, col) {
  if (env.icon || !env.dt) return;
  every(f, 'spk', rate, env.dt, () => {
    const a = Math.random() * TAU, rr = 0.55 + Math.random() * 0.25;
    const p = P(f, Math.cos(a) * rr, 0.35 + Math.sin(a) * rr * 0.95, 0);
    emit({ type: 'spark', x: p[0], y: p[1], vx: 0, vy: -f.px * 0.08, life: 0, max: 0.7 + Math.random() * 0.6, r: f.px * (0.03 + Math.random() * 0.035), rot: Math.random(), col });
  });
}

/* ---------- small shared pieces ---------- */
function whiskers(g, f, env, color, len = 0.3, lw = 0.011) {
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    frS(g, f, sp(f, side < 0 ? 205 : 425), side);
    g.strokeStyle = color; g.lineWidth = lw;
    for (let k = -1; k <= 1; k++) {
      const tw = Math.sin(env.t * 3.1 + k * 1.7 + side) * 0.012;
      g.beginPath();
      g.moveTo(0.03, k * 0.028);
      g.quadraticCurveTo(len * 0.55, k * 0.035 - 0.012 + tw, len, k * 0.08 + tw);
      g.stroke();
    }
  }
}
function blush(g, f, col = 'rgba(255,105,140,0.33)', r = 0.075) {
  for (const i of [50, 280]) { fr(g, f, sp(f, i)); oval(g, 0, 0.02, r, r * 0.72); g.fillStyle = col; g.fill(); }
}
function noseTip(f) { return smix(f, 4, 1, 0.55); }
function mouthC(f) { return smix(f, 13, 14); }
function openAmt(f, from = 0.15, span = 0.5) { return clamp((f.open - from) / span, 0, 1); }

/* ---------- the cartoon face used for menu icons and the start screen ---------- */
function drawCartoon(g, f) {
  fr(g, f, P(f, 0, 0.5, 0));
  oval(g, 0, 0, 0.56, 0.7);
  paint(g, '#FFCE45', '#C98B00', 0.035);
  g.fillStyle = 'rgba(255,120,110,0.38)';
  oval(g, -0.31, 0.1, 0.09, 0.06); g.fill();
  oval(g, 0.31, 0.1, 0.09, 0.06); g.fill();
  for (const s of [-1, 1]) {
    oval(g, s * 0.207, -0.13, 0.062, 0.085); paint(g, '#3B2416', null);
    circle(g, s * 0.207 - 0.018, -0.165, 0.022); paint(g, '#FFFFFF', null);
    g.beginPath(); g.moveTo(s * 0.29, -0.27); g.quadraticCurveTo(s * 0.21, -0.33, s * 0.13, -0.27);
    g.lineCap = 'round'; paint(g, null, '#8A5A1E', 0.03);
  }
  g.beginPath(); g.moveTo(-0.035, 0.12); g.quadraticCurveTo(0, 0.155, 0.035, 0.12);
  paint(g, null, '#C98B00', 0.025);
  g.beginPath();
  g.moveTo(-0.17, 0.29); g.quadraticCurveTo(0, 0.315, 0.17, 0.29);
  g.quadraticCurveTo(0.15, 0.47, 0, 0.47); g.quadraticCurveTo(-0.15, 0.47, -0.17, 0.29);
  g.closePath();
  paint(g, '#7A1F2B', null);
  g.save(); g.clip(); oval(g, 0, 0.45, 0.1, 0.065); paint(g, '#FF7C93', null); g.restore();
  g.beginPath();
  g.moveTo(-0.17, 0.29); g.quadraticCurveTo(0, 0.315, 0.17, 0.29);
  g.quadraticCurveTo(0.15, 0.47, 0, 0.47); g.quadraticCurveTo(-0.15, 0.47, -0.17, 0.29);
  paint(g, null, '#5A1420', 0.022);
}

function makeIconFace(size, o = {}) {
  const s = size * (o.scale || 0.4);
  const cx = size / 2, cy = size * (o.top ?? 0.33);
  const f = new Face();
  f.alpha = 1; f.open = o.open || 0; f.dt = 0; f.icon = true;
  for (let i = 0; i < NL; i++) {
    const x = cx + CANON[3 * i] * s, y = cy + CANON[3 * i + 1] * s;
    f.lm[3 * i] = x; f.lm[3 * i + 1] = y; f.lm[3 * i + 2] = -CANON[3 * i + 2] * s;
    f.S[2 * i] = x; f.S[2 * i + 1] = y;
  }
  f.M = [s, 0, 0, 0, s, 0];
  f.T = [cx, cy];
  f.px = s;
  deriveVideo(f);
  return f;
}

/* ==========================================================================
   Udklædningerne
   ========================================================================== */

function drawCatEars(g, f, env, base, col, inner, tilt, h) {
  for (const side of [-1, 1]) {
    const a = spring(f, 'ear' + side, 0, { k: 220, c: 12, g: 0.5, dir: -1, lim: 0.25 });
    frS(g, f, P(f, side * base[0], base[1], base[2]), side);
    g.rotate(tilt + a * side);
    g.beginPath();
    g.moveTo(-0.15, 0.03);
    g.quadraticCurveTo(-0.08, -0.2, -0.01, -h);
    g.quadraticCurveTo(0.05, -h - 0.025, 0.08, -h + 0.04);
    g.quadraticCurveTo(0.15, -0.16, 0.16, 0.03);
    g.closePath();
    paint(g, col);
    g.beginPath();
    g.moveTo(-0.08, 0.01);
    g.quadraticCurveTo(-0.04, -0.15, 0.0, -h + 0.1);
    g.quadraticCurveTo(0.06, -0.14, 0.09, 0.01);
    g.closePath();
    paint(g, inner, null);
  }
}

/* ---------- Kaptajn Knurhår: the hat, the neckerchief, and the hat falling off ---------- */
// After the book's character sheet: a much-too-big, soft dark-blue captain's cap with a black visor,
// a gold band and buttons, and a round gold badge with a question mark.
function questionMark(g, x, y, s, col = '#2B1B12') {
  g.save(); g.translate(x, y);
  // the selfie view is a mirror image: turn the question mark back, so it always reads the right way round
  const t = g.getTransform();
  g.scale(t.a * t.d - t.b * t.c < 0 ? -s : s, s);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col; g.lineWidth = 0.27;
  g.beginPath();
  g.moveTo(-0.42, -0.36);
  g.bezierCurveTo(-0.42, -0.95, 0.5, -0.95, 0.5, -0.42);
  g.bezierCurveTo(0.5, -0.06, 0, -0.02, 0, 0.3);
  g.stroke();
  circle(g, 0, 0.72, 0.17); g.fillStyle = col; g.fill();
  g.restore();
}
// Pip, small: his head with the big round ears (s = head radius), looking a little to one side
function drawPipHead(g, s, look = 0, paws = false) {
  for (const sd of [-1, 1]) {
    circle(g, sd * s * 0.92, -s * 0.78, s * 0.62); paint(g, '#B39B80', '#6E5A47', s * 0.08);
    circle(g, sd * s * 0.9, -s * 0.74, s * 0.4); paint(g, '#F2A79C', null);
  }
  g.beginPath(); g.ellipse(0, 0, s, s * 0.86, 0, 0, TAU); paint(g, '#B39B80', '#6E5A47', s * 0.08);
  for (const sd of [-1, 1]) {
    circle(g, sd * s * 0.36 + look * s * 0.1, -s * 0.12, s * 0.15); paint(g, '#1E1410', null);
    circle(g, sd * s * 0.36 + look * s * 0.1 - s * 0.05, -s * 0.18, s * 0.05); paint(g, '#FFFFFF', null);
  }
  g.beginPath(); g.ellipse(0, s * 0.3, s * 0.17, s * 0.13, 0, 0, TAU); paint(g, '#EF8B9C', '#B2456E', s * 0.05);
  g.lineCap = 'round'; g.strokeStyle = '#FFFDF7'; g.lineWidth = s * 0.045;
  for (const sd of [-1, 1]) for (const dy of [-0.02, 0.12]) {
    g.beginPath(); g.moveTo(sd * s * 0.22, s * (0.32 + dy)); g.lineTo(sd * s * 1.15, s * (0.24 + dy * 2)); g.stroke();
  }
  if (paws) for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * s * 0.5, s * 0.84, s * 0.24, s * 0.16, 0, 0, TAU); paint(g, '#C9B49B', '#6E5A47', s * 0.06); }
}
// where Pip sits under the brim: hat units, and on screen with the hat at rest (lifted 0.03, tilted -0.12)
const PIP_X = -0.3, PIP_Y = 0.2;
function pipSpot(f) {
  const c = Math.cos(-0.12), sn = Math.sin(-0.12);
  return P(f, PIP_X * c - PIP_Y * sn, 0.03 + PIP_X * sn + PIP_Y * c, -0.05);
}
function drawCaptainHat(g, pip = 0) {
  // the crown: big, soft and a little lopsided
  g.beginPath();
  g.moveTo(-0.5, 0.02);
  g.bezierCurveTo(-0.8, -0.02, -0.76, -0.44, -0.47, -0.57);
  g.bezierCurveTo(-0.2, -0.72, 0.26, -0.74, 0.52, -0.57);
  g.bezierCurveTo(0.83, -0.38, 0.8, -0.03, 0.52, 0.04);
  g.closePath();
  paint(g, lin(g, 0, -0.72, 0, 0.05, ['#4262B0', '#22356F']), '#18224A', 0.016);
  g.lineCap = 'round'; g.strokeStyle = 'rgba(16,24,60,0.38)'; g.lineWidth = 0.014;
  g.beginPath(); g.moveTo(-0.32, -0.6); g.quadraticCurveTo(-0.2, -0.32, -0.36, -0.08); g.stroke();
  g.beginPath(); g.moveTo(0.4, -0.6); g.quadraticCurveTo(0.5, -0.3, 0.34, -0.06); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 0.035;
  g.beginPath(); g.moveTo(-0.26, -0.62); g.quadraticCurveTo(0.02, -0.69, 0.3, -0.61); g.stroke();
  // gold band
  g.beginPath();
  g.moveTo(-0.47, -0.02); g.quadraticCurveTo(0, -0.09, 0.47, -0.02);
  g.lineTo(0.47, 0.035); g.quadraticCurveTo(0, -0.035, -0.47, 0.035);
  g.closePath();
  paint(g, '#E3BA3C', '#9A7414', 0.01);
  // Pip lives in the hat and peeks out under the brim (from story 2): drawn before the visor, so it covers his ears
  if (pip > 0) {
    g.save();
    // only below the visor's top edge: above it he is still inside the hat
    g.beginPath(); g.moveTo(-1, 0.06); g.lineTo(-0.45, 0.03); g.quadraticCurveTo(0, -0.025, 0.45, 0.03);
    g.lineTo(1, 0.06); g.lineTo(1, 1.2); g.lineTo(-1, 1.2); g.closePath(); g.clip();
    g.translate(PIP_X, PIP_Y - 0.16 * (1 - pip));
    drawPipHead(g, 0.095, 0.4);
    g.restore();
  }
  // the visor
  g.beginPath();
  g.moveTo(-0.45, 0.03); g.quadraticCurveTo(0, -0.025, 0.45, 0.03);
  g.quadraticCurveTo(0.37, 0.14, 0, 0.155); g.quadraticCurveTo(-0.37, 0.14, -0.45, 0.03);
  g.closePath();
  paint(g, lin(g, 0, 0, 0, 0.155, ['#2C2C38', '#0D0D13']), '#000000', 0.012);
  g.beginPath(); g.moveTo(-0.25, 0.065); g.quadraticCurveTo(0, 0.045, 0.21, 0.065);
  paint(g, null, 'rgba(255,255,255,0.32)', 0.013);
  // gold buttons and the badge
  for (const s of [-1, 1]) { circle(g, s * 0.445, 0.005, 0.033); paint(g, '#F0C84C', '#9A7414', 0.008); }
  circle(g, 0, -0.22, 0.1);
  paint(g, lin(g, 0, -0.32, 0, -0.12, ['#F8D873', '#D6A42B']), '#9A7414', 0.012);
  questionMark(g, 0, -0.225, 0.074);
}
function stripes(g, path, angle = 0.75, w = 0.045) {
  g.save();
  path(); g.fillStyle = '#FFFFFF'; g.fill(); g.clip();
  g.rotate(angle); g.fillStyle = '#D8343C';
  for (let x = -1.2; x < 1.2; x += w * 2) g.fillRect(x, -1.2, w, 2.4);
  g.restore();
  path(); g.strokeStyle = '#7A1C22'; g.lineWidth = 0.011; g.stroke();
}
function drawNeckerchief(g, f, env, k = 1) {
  fr(g, f, P(f, 0, 1.1, -0.16));
  g.scale(k, k);
  // the band around the neck, under the chin
  stripes(g, () => {
    g.beginPath();
    g.moveTo(-0.37, -0.05); g.quadraticCurveTo(0, 0.22, 0.37, -0.05);
    g.lineTo(0.35, 0.07); g.quadraticCurveTo(0, 0.34, -0.35, 0.07);
    g.closePath();
  });
  // two loose ends that swing a little, and the knot
  const sw = spring(f, 'scarf', 0, { k: 55, c: 5, g: 1.4, lim: 0.45 });
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * 0.035, 0.24);
    g.rotate(side * 0.38 + sw * 0.7);
    stripes(g, () => {
      g.beginPath();
      g.moveTo(-0.065, 0); g.lineTo(0.065, 0); g.lineTo(side * 0.02, 0.27);
      g.closePath();
    }, -0.75);
    g.restore();
  }
  stripes(g, () => { oval(g, 0, 0.22, 0.065, 0.055); });
}
// how far the head is tipped back (0 straight, about 0.5 looking well up); from the face pose
function headUp(f) {
  const M = f.M, s = Math.hypot(M[0], M[3]) || 1, l = Math.hypot(M[1], M[4]) || 1;
  return -(M[2] * M[1] + M[5] * M[4]) / (l * s);
}
// A word from the book in a bubble beside the mouth while it is open, with a soft sound when it opens.
function say(g, f, env, key, text, amt) {
  const m = f.mem, was = !!m[key];
  m[key] = amt > 0.5 ? true : amt < 0.15 ? false : was;
  if (!was && m[key] && !env.icon && env.dt && typeof Snd !== 'undefined') Snd.play(key);
  if (amt <= 0 || env.icon) return;
  const roll = Math.atan2(-f.M[1], f.M[4]), size = f.px * 0.15 * (0.65 + 0.35 * Math.min(1, amt * 1.5));
  const mir = f.M[0] * f.M[4] - f.M[1] * f.M[3] < 0, at = P(f, mir ? -0.58 : 0.58, 0.98, 0);   // to the right of the mouth on screen
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.font = '700 ' + Math.round(size) + 'px Fredoka, sans-serif';
  const w = g.measureText(text).width + size * 1.1, h = size * 1.6;
  g.translate(clamp(at[0], w / 2 + 6, env.W - w / 2 - 6), clamp(at[1], h, (env.floor || env.H) - h));
  g.rotate(roll * 0.6);
  g.beginPath();
  if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, h / 2); else g.rect(-w / 2, -h / 2, w, h);
  // the tail is sized by the bubble's height, so long words get the same small tail as short ones
  const tx = -w / 2 + h * 0.5;
  g.moveTo(tx, h * 0.34); g.lineTo(tx - h * 0.42, h * 0.78); g.lineTo(tx + h * 0.42, h * 0.4);
  g.fillStyle = '#FFFFFF'; g.fill();
  g.strokeStyle = '#2B1B12'; g.lineWidth = Math.max(2, size * 0.1); g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#2B1B12'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 0, size * 0.06);
  g.restore();
}
function bubbleAt(g, env, x, y, text, size, alpha = 1) {
  if (alpha <= 0) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= alpha;
  g.font = '700 ' + Math.round(size) + 'px Fredoka, sans-serif';
  const w = g.measureText(text).width + size * 1.1, h = size * 1.6;
  g.translate(clamp(x, w / 2 + 6, env.W - w / 2 - 6), clamp(y, h, (env.floor || env.H) - h));
  g.beginPath();
  if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, h / 2); else g.rect(-w / 2, -h / 2, w, h);
  const tx = -w / 2 + h * 0.5;
  g.moveTo(tx, h * 0.34); g.lineTo(tx - h * 0.42, h * 0.78); g.lineTo(tx + h * 0.42, h * 0.4);
  g.fillStyle = '#FFFFFF'; g.fill();
  g.strokeStyle = '#2B1B12'; g.lineWidth = Math.max(2, size * 0.1); g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#2B1B12'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 0, size * 0.06);
  g.restore();
}
const HAT_OFF = 0.34, HAT_REARM = 0.15;   // a clear lean back; straight again before it can fall once more
function hatSim(g, x, y, a, s, mir, pip = 0) {
  const c = Math.cos(a) * s, n = Math.sin(a) * s;
  g.setTransform(c, n, -n, c, x, y);
  if (mir) g.scale(-1, 1);
  drawCaptainHat(g, pip);
}
function knurhaarHat(g, f, env, pip = 0) {
  const sway = spring(f, 'hat', 0, { k: 90, c: 7, g: 1.2, lim: 0.25 });
  const tilt = -0.12 + sway * 0.5;
  const at = P(f, 0, 0.03, -0.05);
  const onHead = () => { fr(g, f, at); g.rotate(tilt); drawCaptainHat(g, pip); };
  if (env.icon || !env.dt) { onHead(); return; }
  const h = f.mem.hat || (f.mem.hat = { st: 'on', armed: true, up: 0, upFor: 0, t: 0 });
  // the face's tilt on screen, from its downward axis (the x axis is reversed in the mirrored selfie view)
  const dt = env.dt, px = f.px, roll = Math.atan2(-f.M[1], f.M[4]);
  const mir = f.M[0] * f.M[4] - f.M[1] * f.M[3] < 0, ta = roll + (mir ? -tilt : tilt);
  h.up = lerp(h.up, headUp(f), Math.min(1, dt * 10));
  if (h.st === 'on') {
    if (!h.armed && h.up < HAT_REARM) h.armed = true;
    h.upFor = h.up > HAT_OFF ? h.upFor + dt : 0;
    if (!(h.armed && h.upFor > 0.15)) { onHead(); return; }
    // "Kaptajn Knurhår lænede hovedet så langt tilbage for at se op, at hatten gled af. Bump!"
    const side = at[0] < env.W / 2 ? -1 : 1;
    Object.assign(h, { st: 'fall', armed: false, t: 0, x: at[0], y: at[1], a: ta, a0: ta, s: px, s0: px, mir,
      vx: side * px * 0.7, vy: -px * 1.5, side });
  }
  if (h.st === 'fall') {
    h.t += dt;
    h.vy += px * 9 * dt;
    h.x = clamp(h.x + h.vx * dt, h.s * 0.7, env.W - h.s * 0.7);
    h.y += h.vy * dt;
    h.a = h.a0 + h.side * Math.min(1, h.t / 0.6) * 0.9;
    h.s = h.s0 * (1 - 0.2 * Math.min(1, h.t / 0.6));      // a little smaller, as it falls away onto the deck
    const floor = Math.min(env.floor || env.H, env.H) - h.s * 0.16;
    if (h.y >= floor && h.vy > 0) {
      Object.assign(h, { st: 'down', t: 0, y: floor, land: h.a });
      if (typeof Snd !== 'undefined') Snd.play('bump');
    }
    hatSim(g, h.x, h.y, h.a, h.s, h.mir, pip);
    return;
  }
  if (h.st === 'down') {
    h.t += dt;
    const rest = h.side * 0.12;
    h.a = rest + (h.land - rest) * Math.exp(-h.t * 5) * Math.cos(h.t * 12);
    hatSim(g, h.x, h.y, h.a, h.s, h.mir);
    if (pip > 0) {
      // Pip rolls out, one whole turn towards the middle, and sits up beside the hat
      const u = Math.min(1, h.t / 0.6), k = 1 - (1 - u) * (1 - u), dir = h.x < env.W / 2 ? 1 : -1, ps = h.s * 0.09;
      const x = h.x + dir * h.s * 0.62 * k, y = h.y - ps * 0.6;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.save(); g.translate(x, y); g.rotate(dir * TAU * k);
      drawPipHead(g, ps, 0, true);
      g.restore();
      if (h.t > 0.6 && !h.pipSaid) { h.pipSaid = true; if (typeof Snd !== 'undefined') Snd.play('pip'); }
      if (h.t > 0.6) bubbleAt(g, env, x + dir * ps * 2.2, y - ps * 2.6, 'Pip!', ps * 1.6, Math.min(1, (1.55 - h.t) / 0.25));
    }
    // "Bump!"
    if (h.t < 1) {
      const k = Math.min(1, h.t / 0.15), fade = 1 - Math.max(0, (h.t - 0.6) / 0.4);
      const size = h.s * 0.2 * (0.7 + 0.3 * k);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.save();
      g.globalAlpha *= fade;
      g.translate(clamp(h.x - h.side * h.s * 0.55, size * 1.6, env.W - size * 1.6), h.y - h.s * 0.55);
      g.rotate(-h.side * 0.12);
      g.font = '700 ' + Math.round(size) + 'px Fredoka, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = '#2B1B12';
      g.strokeText('Bump!', 0, 0);
      g.fillStyle = '#FFE066'; g.fillText('Bump!', 0, 0);
      g.restore();
    }
    if (h.t > 1.6) Object.assign(h, { st: 'back', t: 0, fx: h.x, fy: h.y, fa: h.a, fs: h.s, pipSaid: false });
    return;
  }
  if (h.st === 'back') {
    h.t += dt;
    const u = Math.min(1, h.t / 0.8), k = u * u * (3 - 2 * u);
    const x = lerp(h.fx, at[0], k), y = lerp(h.fy, at[1], k) - Math.sin(k * Math.PI) * px * 0.7;
    hatSim(g, x, y, lerp(h.fa, ta, k), lerp(h.fs, px, k), h.mir, pip);
    if (u >= 1) { h.st = 'on'; h.upFor = 0; const sp2 = f.springs.hat; if (sp2) sp2.v += 2.5; }
  }
}

/* ---------- Historie 1: æblekastet (plan H1b) ---------- */
// "Kast et æble," sagde Isaac. "Lige ud." Her head is the Earth and the top of the hat is the high mountain.
// The first apple falls close by – bump – and the second far away. Then the book's second pause, "Hvad tror du,
// der sker?", waits for a grown-up to read it and tap; the third apple falls all the way round her head and comes
// back, and Knurhår's answer from the book follows. No points, no time, nothing can go wrong.
const AppleToss = { n: 0, a: null, waiting: false, side: 1 };
function appleReset() {
  AppleToss.n = 0; AppleToss.a = null; AppleToss.waiting = false;
  if (typeof appleUi === 'function') appleUi('');
}
function appleRound() {
  const A = AppleToss;
  if (!A.waiting) return false;
  A.waiting = false; A.n = 3; A.a = { st: 'round', t: 0, side: A.side };
  return true;
}
function drawApple(g, x, y, r, rot = 0, alpha = 1) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.rotate(rot);
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -r * 0.8); g.quadraticCurveTo(r * 0.05, -r * 1.2, r * 0.25, -r * 1.45); paint(g, null, '#5A3A1A', r * 0.13);
  oval(g, r * 0.55, -r * 1.2, r * 0.38, r * 0.17, -0.5); paint(g, '#5BAA4A', '#2F6B3A', r * 0.05);
  circle(g, 0, 0, r); paint(g, '#D9443C', '#8E2A24', r * 0.09);
  g.beginPath(); g.arc(-r * 0.22, -r * 0.22, r * 0.5, Math.PI * 1.05, Math.PI * 1.5); paint(g, null, 'rgba(255,255,255,0.6)', r * 0.14);
  g.restore();
}
function bumpText(g, env, x, y, size, alpha, side, text) {
  if (alpha <= 0) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(clamp(x, size * 1.6, env.W - size * 1.6), Math.max(size, y));
  g.rotate(-side * 0.12);
  g.font = '700 ' + Math.round(size) + 'px Fredoka, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = '#2B1B12';
  g.strokeText(text, 0, 0);
  g.fillStyle = '#FFE066'; g.fillText(text, 0, 0);
  g.restore();
}
function appleToss(g, f, env) {
  const A = AppleToss, px = f.px, dt = env.dt, r = px * 0.085;
  const m = f.mem, was = !!m.appleMouth, o = openAmt(f, 0.25, 0.35);
  m.appleMouth = o > 0.5 ? true : o < 0.15 ? false : was;
  if (!A.a && !A.waiting && A.n < 2 && !was && m.appleMouth) {
    // a throw, straight out from the top of the hat, to the side with the most room
    A.n += 1;
    const top = P(f, 0, -0.62, 0), side = top[0] < env.W / 2 ? 1 : -1, far = A.n === 2;
    // the landing places are worked out first, so they are always on the screen and above the menus:
    // the first one beside her shoulder, the second down by the edge of the screen on the same side
    const floorY = Math.min(env.floor || env.H, env.H) - r * 1.2;
    const nearX = clamp(top[0] + side * px * 0.75, r * 1.5, env.W - r * 1.5), farX = side > 0 ? env.W - r * 1.6 : r * 1.6;
    A.side = side;
    A.a = { st: 'fly', x0: top[0], y0: top[1], x: top[0], y: top[1], side, rot: 0, t: 0,
      x1: far ? farX : nearX, y1: far ? floorY : Math.min(P(f, 0, 1.25, 0)[1], floorY - r * 2),
      h: px * (far ? 0.75 : 0.4), D: far ? 1.1 : 0.75 };
    if (typeof Snd !== 'undefined') Snd.play('kast');
  }
  const a = A.a;
  if (!a) return;
  a.t += dt;
  if (a.st === 'fly') {
    const u = Math.min(1, a.t / a.D);
    a.x = lerp(a.x0, a.x1, u);
    a.y = lerp(a.y0, a.y1, u) - a.h * 4 * u * (1 - u);
    a.rot += a.side * 6 * dt;
    if (u >= 1) {
      a.st = 'rest'; a.t = 0;
      if (typeof Snd !== 'undefined') Snd.play('bump');
    }
    drawApple(g, a.x, a.y, r, a.rot);
  } else if (a.st === 'rest') {
    drawApple(g, a.x, a.y, r, a.rot, clamp(1 - (a.t - 1.4) / 0.5, 0, 1));
    // "Æblet fløj et lille stykke – og faldt ned. Bump."
    if (a.t < 1) bumpText(g, env, a.x, a.y - r * 2.4, r * 1.6, 1 - Math.max(0, (a.t - 0.6) / 0.4), a.side, 'Bump.');
    if (a.t > 1.9) {
      A.a = null;
      if (A.n >= 2) { A.waiting = true; if (typeof appleUi === 'function') appleUi('ask'); }
    }
  } else if (a.st === 'round') {
    // all the way round the Earth – her head – and back again, with a dotted trail like the arcs in the book's picture
    const c = P(f, 0, 0.42, 0), rx = px * 0.95, ry = px * 1.18, D = 2.8;
    const u = Math.min(1, a.t / D), k = u * u * (3 - 2 * u), at = q => -Math.PI / 2 + a.side * TAU * q;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.fillStyle = '#FFF3C4';
    for (let i = 1; i <= 16; i++) {
      const q = k - i * 0.02;
      if (q <= 0) break;
      g.globalAlpha = f.alpha * (1 - i / 17) * 0.75;
      circle(g, c[0] + rx * Math.cos(at(q)), c[1] + ry * Math.sin(at(q)), r * 0.17); g.fill();
    }
    g.restore();
    const th = at(k);
    drawApple(g, c[0] + rx * Math.cos(th), c[1] + ry * Math.sin(th), r, th * 0.6);
    if (u >= 1) {
      A.a = null; A.n = 0;
      const top = P(f, 0, -0.62, 0);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * TAU, v = px * (0.6 + Math.random() * 0.5);
        emit({ type: 'spark', x: top[0], y: top[1], vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 2, life: 0, max: 0.9, r: px * 0.035, rot: Math.random(), col: '#FFF3A0' });
      }
      if (typeof Snd !== 'undefined') Snd.play('rundt');
      if (typeof appleUi === 'function') appleUi('round');
    }
  }
}

/* ---------- Historie 2: Pip kommer om bord (plan H2a) ---------- */
// "Bonk! Nede på vandet gyngede en valnøddeskal, og i den sad en lille, våd mus." The first time she is Kaptajn
// Knurhår after story 2, Pip rocks in his walnut shell at the bottom of the screen and asks, in the book's words,
// to come up; a grown-up reads it and taps. Pip jumps up under the hat, and then the book's vote follows. If no one
// taps, Pip simply stays happily in his shell. The vote cannot be lost.
const PipBoard = { st: 'shell', t: 0, shown: false };
function pipBoardReset() {
  PipBoard.st = 'shell'; PipBoard.t = 0; PipBoard.shown = false;
  if (typeof boardUi === 'function') boardUi('');
}
function pipClimb() { if (PipBoard.st !== 'shell') return false; PipBoard.st = 'climb'; PipBoard.t = 0; return true; }
function drawShell(g, x, y, s, rock, t, alpha = 1, withPip = true) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.rotate(rock);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(134,205,242,0.95)'; g.lineWidth = s * 0.08;
  for (const k of [-1, 1]) {
    g.beginPath(); g.moveTo(k * s * 1.3, s * 0.5); g.quadraticCurveTo(k * s * 1.6, s * 0.36, k * s * 1.9, s * 0.5); g.stroke();
  }
  if (withPip) {
    g.save(); g.translate(0, -s * 0.2); drawPipHead(g, s * 0.42, Math.sin(t * 1.3) * 0.7); g.restore();
    // he is still wet: a drop runs down now and then
    const dk = (t * 0.7) % 1;
    g.globalAlpha *= 1 - dk;
    oval(g, s * 0.5, -s * 0.36 + dk * s * 0.4, s * 0.05, s * 0.08); paint(g, '#7FC8F0', null);
    g.globalAlpha = alpha;
  }
  // the half walnut shell, with its ridges
  g.beginPath(); g.moveTo(-s * 1.2, -s * 0.05); g.quadraticCurveTo(-s * 1.1, s * 0.74, 0, s * 0.8); g.quadraticCurveTo(s * 1.1, s * 0.74, s * 1.2, -s * 0.05); g.closePath();
  paint(g, lin(g, 0, -s * 0.05, 0, s * 0.8, ['#B07A42', '#6E4423']), '#4A2C14', s * 0.06);
  g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = s * 0.05;
  for (const [a, b] of [[-0.8, -0.55], [-0.32, -0.2], [0.2, 0.32], [0.55, 0.8]]) {
    g.beginPath(); g.moveTo(s * a, s * 0.05); g.quadraticCurveTo(s * (a + b) * 0.55, s * 0.42, s * b * 0.85, s * 0.72); g.stroke();
  }
  g.beginPath(); g.ellipse(0, -s * 0.05, s * 1.2, s * 0.15, 0, 0, TAU); paint(g, '#C9915A', '#4A2C14', s * 0.05);
  if (withPip) for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * s * 0.26, -s * 0.09, s * 0.12, s * 0.08, 0, 0, TAU); paint(g, '#C9B49B', '#6E5A47', s * 0.03); }
  g.restore();
}
// returns how far Pip is out under the brim of the hat (0: still in his shell)
function pipBoarding(g, f, env) {
  const B = PipBoard, px = f.px, s = px * 0.27, t = env.t;
  B.t += env.dt;
  const floorY = Math.min(env.floor || env.H, env.H);
  const side = P(f, 0, 0.4, 0)[0] < env.W / 2 ? 1 : -1;
  const sx = clamp(env.W / 2 + side * env.W * 0.24, s * 2, env.W - s * 2), sy = floorY - s * 1.05;
  const rock = Math.sin(t * 2.2) * 0.12;
  if (B.st === 'shell') {
    if (!B.shown) {
      B.shown = true; B.t = 0;
      if (typeof Snd !== 'undefined') Snd.play('bonk');
      if (typeof boardUi === 'function') boardUi('up');
    }
    drawShell(g, sx, sy, s, rock, t);
    if (B.t < 1.2) bumpText(g, env, sx - side * s * 0.6, sy - s * 1.5, s * 0.7, 1 - Math.max(0, (B.t - 0.8) / 0.4), side, 'Bonk!');
    return 0;
  }
  if (B.st === 'climb') {
    // a big hop from the shell up under the hat
    const D = 1.1, u = Math.min(1, B.t / D), k = u * u * (3 - 2 * u);
    drawShell(g, sx, sy + s * 0.3 * k, s, rock, t, 1 - k, false);
    const to = pipSpot(f), x = lerp(sx, to[0], k), y = lerp(sy - s * 0.2, to[1], k) - Math.sin(k * Math.PI) * px * 0.6;
    if (u < 1) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.save(); g.translate(x, y); drawPipHead(g, lerp(s * 0.42, px * 0.095, k), 0, true); g.restore();
      return 0;
    }
    B.st = 'vote'; B.t = 0;
    if (typeof boardUi === 'function') boardUi('vote');
    return 1;
  }
  return 1;      // the vote, and after it: Pip is in the hat
}

// Ret Pip (plan H2d): Pip says the rule from story 2 a little wrong, with cheese in it, so she can put him right.
// He tries once each time the camera starts, when Knurhår has been calm for a moment. The adult reads and taps.
const RetPip = { st: 'idle', calm: 0 };
function retPipReset(again = false) {
  if (again || RetPip.st !== 'done') RetPip.st = 'idle';
  RetPip.calm = 0;
  if (typeof retPipUi === 'function') retPipUi('');
}
function retPipBusy() { return RetPip.st === 'ask' || RetPip.st === 'answer' || RetPip.st === 'repeat'; }
function retPipTick(f, env) {
  const R = RetPip, A = AppleToss;
  if (R.st !== 'idle') return;
  const calm = f.mem.hat && f.mem.hat.st === 'on' && env.peek > 1.6 && !A.a && !A.waiting && A.n === 0
    && !(typeof bubbleBusy === 'function' && bubbleBusy());
  R.calm = calm ? R.calm + env.dt : 0;
  if (R.calm > 4) { R.st = 'ask'; if (typeof retPipUi === 'function') retPipUi('ask'); }
}

// The paper crown from story 2. Hans: "Jeg er kongen! Og kongen bestemmer!" Sophie tears it – ritsj, ritsj, ritsj –
// and gives everyone a piece (plan H2c). Alone she wears the whole crown. When one more face comes in, it tears into
// two pieces of the same size, one flies over to the other head, and Knurhår says the rule. Alone again: a new crown.
const Crown = { st: 'whole', t: 0, two: 0, alone: 0, L0: null, from: null };
function crownReset() {
  Object.assign(Crown, { st: 'whole', t: 0, two: 0, alone: 0, L0: null, from: null });
  if (typeof crownUi === 'function') crownUi('');
}
const CROWN_AT = [0, -0.03, -0.05], CROWN_S = 1.08;
const CROWN_PEAKS = [[-0.5, -0.36], [-0.3, -0.39], [-0.1, -0.35], [0.1, -0.35], [0.3, -0.39], [0.5, -0.36]];
const CROWN_VALLEYS = [[-0.4, -0.17], [-0.2, -0.18], [0, -0.17], [0.2, -0.18], [0.4, -0.17]];
const CROWN_TEAR = [[0, -0.17], [0.018, -0.135], [-0.014, -0.1], [0.02, -0.065], [-0.012, -0.032], [0.006, 0]];
const crownBend = (x, y) => [x, y + 0.035 * (1 - 4 * x * x)];      // the band curves round the head
// the crown in its own units: 1 wide, the band's bottom at y 0; part 0 = whole, -1 / 1 = the left / right piece
function crownPath(g, part) {
  const pts = [], B = crownBend, T = CROWN_TEAR;
  const bottom = (x0, x1) => { for (let i = 0; i <= 6; i++) pts.push(B(x0 + (x1 - x0) * i / 6, 0)); };
  if (part === 0) {
    pts.push(B(-0.5, 0));
    for (let i = 0; i < 6; i++) { pts.push(B(...CROWN_PEAKS[i])); if (i < 5) pts.push(B(...CROWN_VALLEYS[i])); }
    bottom(0.5, -0.5);
  } else if (part < 0) {
    pts.push(B(-0.5, 0));
    for (let i = 0; i < 3; i++) { pts.push(B(...CROWN_PEAKS[i])); pts.push(B(...CROWN_VALLEYS[i])); }
    for (const p of T.slice(1)) pts.push(B(...p));
    bottom(T[5][0], -0.5);
  } else {
    pts.push(B(...CROWN_VALLEYS[2]));
    for (let i = 3; i < 6; i++) { pts.push(B(...CROWN_PEAKS[i])); if (i < 5) pts.push(B(...CROWN_VALLEYS[i])); }
    bottom(0.5, T[5][0]);
    for (const p of T.slice(1).reverse()) pts.push(B(...p));
  }
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
function drawCrown(g, part = 0, crack = 0) {
  const B = crownBend;
  crownPath(g, part);
  paint(g, lin(g, 0, -0.39, 0, 0.04, ['#FFE683', '#FFD23F', '#F2AE22']), '#B07A0C', 0.013);
  g.save(); crownPath(g, part); g.clip();
  g.lineCap = 'round'; g.lineJoin = 'round';
  // the fold between the points and the band, and a wavy crayon line along the band
  g.strokeStyle = 'rgba(176,122,12,0.38)'; g.lineWidth = 0.01;
  g.beginPath(); for (let i = 0; i <= 20; i++) { const p = B(-0.5 + i / 20, -0.13); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
  g.strokeStyle = 'rgba(229,72,77,0.85)'; g.lineWidth = 0.014;
  g.beginPath(); for (let i = 0; i <= 40; i++) { const p = B(-0.47 + 0.94 * i / 40, -0.04 + Math.sin(i * 1.3) * 0.012); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke();
  // crayon jewels on the band and dots on the points, the same on both halves
  const jewels = ['#E5484D', '#3E7BE0', '#3E7BE0', '#E5484D'];
  [-0.4, -0.2, 0.2, 0.4].forEach((x, i) => { const p = B(x, -0.085); circle(g, p[0], p[1], 0.032); paint(g, jewels[i], 'rgba(60,40,10,0.5)', 0.006); });
  const dots = ['#3BAA5C', '#E5484D', '#3E7BE0', '#3E7BE0', '#E5484D', '#3BAA5C'];
  CROWN_PEAKS.forEach(([x, y], i) => { const p = B(Math.abs(x) > 0.45 ? Math.sign(x) * 0.479 : x, y + 0.08); circle(g, p[0], p[1], 0.019); paint(g, dots[i], null); });
  g.restore();
  if (crack > 0) {          // the tear running down from the middle point
    const T = CROWN_TEAR, n = (T.length - 1) * Math.min(1, crack), k = Math.floor(n);
    g.strokeStyle = '#7A520A'; g.lineWidth = 0.013; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); let p = B(...T[0]); g.moveTo(p[0], p[1]);
    for (let i = 1; i <= k; i++) { p = B(...T[i]); g.lineTo(p[0], p[1]); }
    if (k < T.length - 1 && n > k) { const a = T[k], b = T[k + 1], u = n - k; p = B(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u); g.lineTo(p[0], p[1]); }
    g.stroke();
  }
}
// put a crown (or a piece, centred on the head and tilted a little) on face f
function putCrown(g, f, part, x = 0, rot = 0, sc = 1, crack = 0) {
  const cx = part * 0.25, cy = -0.18;
  fr(g, f, P(f, ...CROWN_AT)); g.scale(CROWN_S, CROWN_S);
  g.translate(x + cx, cy); g.rotate(rot); g.scale(sc, sc); g.translate(-cx, -cy);
  drawCrown(g, part, crack);
}
function paperCrown(g, f, env) {
  const C = Crown, dt = env.dt, ease = u => u * u * (3 - 2 * u);
  if (env.fi === 0) {            // the state moves on once a frame, with the first face
    C.t += dt;
    if (C.st === 'whole') {
      C.two = env.n > 1 ? C.two + dt : 0;
      if (C.two > 0.6 && C.t > 1.2) { C.st = 'tear'; C.t = 0; if (typeof Snd !== 'undefined') Snd.play('ritsj'); }
    } else if (C.st === 'tear' && C.t >= 1) {
      const M = f.M, at = P(f, ...CROWN_AT), px = 0.25 * CROWN_S, py = -0.18 * CROWN_S;
      Object.assign(C, { st: 'split', t: 0, L0: [M[0], M[3], M[1], M[4]], from: [at[0] + M[0] * px + M[1] * py, at[1] + M[3] * px + M[4] * py] });
    } else if (C.st === 'split' && C.t >= 0.8) {
      C.st = 'pieces'; C.t = 0; C.alone = 0;
      if (typeof crownUi === 'function') crownUi('rule');
    } else if (C.st === 'pieces') {
      C.alone = env.n > 1 ? 0 : C.alone + dt;
      if (C.alone > 3) { C.st = 'whole'; C.t = 0; C.two = 0; if (typeof Snd !== 'undefined') Snd.play('pop'); }
    }
    if (C.st === 'whole') putCrown(g, f, 0, 0, 0, 0.85 + 0.15 * ease(Math.min(1, C.t / 0.3)));
    else if (C.st === 'tear') {
      // three tugs, ritsj, ritsj, ritsj: the tear runs a third of the way down with each one
      const step = Math.min(3, Math.floor(C.t / 0.3) + Math.min(1, (C.t % 0.3) / 0.12));
      putCrown(g, f, 0, 0, Math.sin(C.t * 40) * 0.015 * (1 - C.t), 1, step / 3);
      for (let i = 0; i < 3; i++) {
        const u = C.t - i * 0.3;
        if (u < 0) continue;
        const top = P(f, (i - 1) * 0.42, -0.5, 0);
        bumpText(g, env, top[0], top[1] - f.px * 0.06 * i, f.px * 0.13, 1 - Math.max(0, (u - 0.4) / 0.25), i % 2 ? 1 : -1, 'ritsj');
      }
    } else {
      const k = C.st === 'split' ? ease(Math.min(1, C.t / 0.8)) : 1;
      putCrown(g, f, -1, 0.25 * k, -0.07 * k);
    }
    return;
  }
  if (env.fi !== 1) return;
  if (C.st === 'split' && C.L0) {
    // the other piece flies over to the second head in a little arc
    const k = ease(Math.min(1, C.t / 0.8)), M = f.M, at = P(f, ...CROWN_AT), L1 = [M[0], M[3], M[1], M[4]];
    const to = [at[0] + M[1] * -0.18 * CROWN_S, at[1] + M[4] * -0.18 * CROWN_S];
    const L = C.L0.map((v, i) => lerp(v, L1[i], k));
    g.setTransform(L[0], L[1], L[2], L[3], lerp(C.from[0], to[0], k), lerp(C.from[1], to[1], k) - Math.sin(k * Math.PI) * f.px * 0.35);
    g.scale(CROWN_S, CROWN_S); g.rotate(0.07 * k + Math.sin(k * Math.PI) * 0.5); g.translate(-0.25, 0.18);
    drawCrown(g, 1);
  } else if (C.st === 'pieces') putCrown(g, f, 1, -0.25, 0.07);
}

/* ---------- Simsalabim-øen: tryllelærlingen ---------- */
// An original figure for the island the ship Hvorfor sails on to: a soft, pointed hat of night-blue cloth
// with embroidered stars that folds over at the top, a glowing question mark hanging from the tip, and a
// cape of patched sailcloth tied with a rope bow. Saying "Simsalabim!" (an open mouth) sends out glitter.
const APPRENTICE = [
  { hat: ['#6268DA', '#2E318C'], line: '#1E1F5C', star: '#FFD66B' },   // the apprentice
  { hat: ['#3DB8A0', '#1E6E60'], line: '#134A40', star: '#FFF3C4' },   // the second face: the apprentice's buddy
];
function star5(g, x, y, r, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}
function drawSailCape(g, f) {
  fr(g, f, P(f, 0, 1.08, -0.22));
  const cape = () => {
    g.beginPath();
    g.moveTo(-0.4, -0.04);
    g.quadraticCurveTo(0, 0.14, 0.4, -0.04);
    g.bezierCurveTo(0.62, 0.06, 0.86, 0.22, 0.98, 0.52);
    g.lineTo(1.02, 0.98); g.lineTo(-1.02, 0.98); g.lineTo(-0.98, 0.52);
    g.bezierCurveTo(-0.86, 0.22, -0.62, 0.06, -0.4, -0.04);
    g.closePath();
  };
  cape(); paint(g, lin(g, 0, 0, 0, 0.98, ['#F7EFDC', '#E2D2AE']), '#A3855A', 0.012);
  g.save(); cape(); g.clip();
  // soft folds in the cloth
  g.lineCap = 'round'; g.strokeStyle = 'rgba(120,90,50,0.22)'; g.lineWidth = 0.022;
  for (const [x0, x1, x2] of [[-0.56, -0.62, -0.72], [-0.2, -0.22, -0.26], [0.2, 0.22, 0.26], [0.56, 0.62, 0.72]]) {
    g.beginPath(); g.moveTo(x0, 0.22); g.quadraticCurveTo(x1, 0.6, x2, 0.98); g.stroke();
  }
  // two patches, sewn on like the patches in the ship's sail
  for (const [x, y, w, h, r, fill, st] of [[0.36, 0.4, 0.18, 0.15, 0.12, '#D9A799', '#9C6E5E'], [-0.62, 0.52, 0.16, 0.14, -0.1, '#B8C7E3', '#7F8FB5']]) {
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(r);
    g.beginPath(); g.rect(-w / 2, -h / 2, w, h); paint(g, fill, null);
    g.setLineDash([0.022, 0.018]); g.beginPath(); g.rect(-w / 2 + 0.014, -h / 2 + 0.014, w - 0.028, h - 0.028);
    paint(g, null, st, 0.008); g.setLineDash([]);
    g.restore();
  }
  g.restore();
  // the rope bow at the throat
  g.lineCap = 'round'; g.strokeStyle = '#8A5A2B'; g.lineWidth = 0.032;
  for (const sd of [-1, 1]) {
    g.beginPath(); g.ellipse(sd * 0.075, 0.06, 0.07, 0.04, sd * 0.35, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(sd * 0.012, 0.08); g.quadraticCurveTo(sd * 0.05, 0.16, sd * 0.03, 0.24); g.stroke();
  }
  circle(g, 0, 0.065, 0.026); paint(g, '#A06B35', '#6B4423', 0.008);
}

// Tryllehatten (plan M5): on the island the dice becomes a tall magic hat. An open mouth makes something hop out of
// it: a rabbit, a dove or a fish, all three as good and as likely. The hat reads nothing from her face but the mouth.
const TopHat = { on: false, cur: null, last: '', revealed: false };
const HOPPERS = ['kanin', 'due', 'fisk'];
function topHatReset(off = false) { TopHat.cur = null; if (off) { TopHat.on = false; TopHat.revealed = false; Lens.st = 'idle'; } }
const HAT_TOP = -0.8;
function drawRabbit(g, y, t) {
  const wig = Math.sin(t * 13) * 0.12;
  for (const sd of [-1, 1]) {
    g.save(); g.translate(sd * 0.07, y - 0.13); g.rotate(sd * (0.18 + wig * (sd > 0 ? 1 : -1)));
    g.beginPath(); g.ellipse(0, -0.17, 0.055, 0.19, 0, 0, TAU); paint(g, '#FFFFFF', '#8C8296', 0.012);
    g.beginPath(); g.ellipse(0, -0.16, 0.027, 0.14, 0, 0, TAU); paint(g, '#F7B6C8', null);
    g.restore();
  }
  g.beginPath(); g.ellipse(0, y, 0.16, 0.14, 0, 0, TAU); paint(g, '#FFFFFF', '#8C8296', 0.012);
  for (const sd of [-1, 1]) { circle(g, sd * 0.055, y - 0.025, 0.02); paint(g, '#2A2233', null); circle(g, sd * 0.05, y - 0.033, 0.007); paint(g, '#FFFFFF', null); }
  g.beginPath(); g.ellipse(0, y + 0.03, 0.022, 0.016, 0, 0, TAU); paint(g, '#F08AA6', null);
  g.lineCap = 'round'; g.strokeStyle = 'rgba(120,110,130,0.7)'; g.lineWidth = 0.006;
  for (const sd of [-1, 1]) for (const dy of [0.025, 0.05]) { g.beginPath(); g.moveTo(sd * 0.04, y + dy); g.lineTo(sd * 0.15, y + dy * 1.4 - 0.01); g.stroke(); }
}
function drawDove(g, x, y, t, side) {
  g.save(); g.translate(x, y); g.scale(side, 1);
  const flap = Math.sin(t * 22);
  g.beginPath(); g.ellipse(0, 0, 0.13, 0.075, -0.25, 0, TAU); paint(g, '#FFFFFF', '#9BA3B5', 0.012);
  g.beginPath(); g.moveTo(-0.11, 0.02); g.lineTo(-0.22, -0.02); g.lineTo(-0.2, 0.06); g.closePath(); paint(g, '#F4F6FA', '#9BA3B5', 0.01);
  circle(g, 0.12, -0.06, 0.05); paint(g, '#FFFFFF', '#9BA3B5', 0.01);
  circle(g, 0.135, -0.07, 0.01); paint(g, '#2A2233', null);
  g.beginPath(); g.moveTo(0.165, -0.06); g.lineTo(0.2, -0.05); g.lineTo(0.165, -0.04); g.closePath(); paint(g, '#F2A33A', null);
  g.save(); g.translate(-0.01, -0.03); g.rotate(-0.6 - flap * 0.7);
  g.beginPath(); g.ellipse(-0.02, -0.08, 0.06, 0.12, -0.3, 0, TAU); paint(g, '#FFFFFF', '#9BA3B5', 0.011);
  g.restore();
  g.restore();
}
function drawFish(g, x, y, rot, side = 1) {
  g.save(); g.translate(x, y); g.scale(side, 1); g.rotate(rot);
  g.beginPath(); g.moveTo(-0.1, 0); g.lineTo(-0.2, -0.07); g.lineTo(-0.19, 0.07); g.closePath(); paint(g, '#F59A2E', '#B8641A', 0.01);
  g.beginPath(); g.ellipse(0, 0, 0.13, 0.065, 0, 0, TAU); paint(g, lin(g, 0, -0.065, 0, 0.065, ['#FFC04A', '#F58A2A']), '#B8641A', 0.011);
  g.beginPath(); g.moveTo(-0.02, -0.055); g.quadraticCurveTo(0.03, -0.11, 0.06, -0.05); paint(g, '#F59A2E', '#B8641A', 0.008);
  circle(g, 0.075, -0.012, 0.016); paint(g, '#FFFFFF', null); circle(g, 0.079, -0.012, 0.008); paint(g, '#2A2233', null);
  g.restore();
}
function drawTopHat(g, f, env, o) {
  const T = TopHat, m = f.mem, was = !!m.hatMouth;
  m.hatMouth = o > 0.5 ? true : o < 0.15 ? false : was;
  if (!was && m.hatMouth && !T.cur) {
    const pool = HOPPERS.filter(k => k !== T.last), kind = pool[Math.floor(Math.random() * pool.length)];
    const onDad = env.n > 1 && typeof islandThing === 'function' && islandThing('trick', false);    // the trick on the other one
    T.cur = { kind, t: 0, side: Math.random() < 0.5 ? -1 : 1, splash: false, on: onDad ? 1 : 0, seen: env.t };
    T.last = kind;
    if (typeof Snd !== 'undefined') Snd.play(kind);
  }
  const sway = spring(f, 'that', 0, { k: 70, c: 6, g: 1.3, lim: 0.25 });
  fr(g, f, P(f, 0, 0.0, -0.06));
  g.rotate(-0.03 + sway * 0.3);
  const H = HAT_TOP;
  // the brim, the crown and its band with a gold question mark
  g.beginPath(); g.ellipse(0, 0, 0.66, 0.11, 0, 0, TAU); paint(g, '#1F1C33', '#0C0A17', 0.014);
  const crown = () => {
    g.beginPath(); g.moveTo(-0.38, -0.02); g.lineTo(-0.42, H);
    g.ellipse(0, H, 0.42, 0.085, 0, Math.PI, TAU, false);
    g.lineTo(0.38, -0.02);
    g.ellipse(0, -0.02, 0.38, 0.07, 0, 0, Math.PI, false);
    g.closePath();
  };
  crown(); paint(g, lin(g, -0.42, 0, 0.42, 0, ['#2B2745', '#403A66', '#24213A']), '#0C0A17', 0.014);
  g.save(); crown(); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.05; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-0.27, -0.1); g.lineTo(-0.3, H + 0.1); g.stroke();
  g.beginPath(); g.moveTo(-0.39, -0.06); g.lineTo(-0.392, -0.2); g.ellipse(0, -0.2, 0.392, 0.07, 0, Math.PI, 0, true);
  g.lineTo(0.385, -0.06); g.ellipse(0, -0.06, 0.385, 0.07, 0, 0, Math.PI, false); g.closePath();
  paint(g, lin(g, 0, -0.27, 0, -0.0, ['#9C8CFF', '#6E5FD8']), '#3E3290', 0.01);
  g.restore();
  questionMark(g, 0, -0.1, 0.075, '#6B4E0E');
  questionMark(g, 0, -0.1, 0.064, '#FFE27A');
  // the opening at the top, dark inside
  g.beginPath(); g.ellipse(0, H, 0.42, 0.085, 0, 0, TAU); paint(g, '#0B0915', '#3C3760', 0.012);
  // the other face went away in the middle of a trick on him
  if (T.cur && T.cur.on === 1 && env.t - T.cur.seen > 0.5) T.cur = null;
  // whatever hops out comes up out of the opening
  if (T.cur && !T.cur.on) {
    g.save();
    g.beginPath(); g.rect(-4, -5, 8, 5 + H); g.ellipse(0, H, 0.42, 0.085, 0, 0, TAU); g.clip();
    const done = drawHopper(g, f, env, T.cur, H);
    g.restore();
    // the front of the rim goes in front of it
    g.beginPath(); g.ellipse(0, H, 0.42, 0.085, 0, 0, Math.PI, false); paint(g, null, '#4A4470', 0.022);
    if (done) T.cur = null;
  }
}
// one of the three, coming up out of an opening at height H in the current frame; true when it is done
function drawHopper(g, f, env, c, H) {
  const ease = u => u * u * (3 - 2 * u);
  c.t += env.dt;
  if (c.kind === 'kanin') {
    const up = c.t < 1.5 ? ease(Math.min(1, c.t / 0.35)) : 1 - ease(Math.min(1, (c.t - 1.5) / 0.35));
    drawRabbit(g, H + 0.12 - 0.36 * up, c.t);
    return c.t > 1.9;
  }
  if (c.kind === 'due') {
    const u = Math.min(1, c.t / 1.8);
    g.save(); g.globalAlpha *= 1 - Math.max(0, (u - 0.8) / 0.2);
    drawDove(g, c.side * (0.12 + 1.1 * ease(u)), H + 0.05 - 0.28 * Math.min(1, c.t / 0.3) - 0.5 * u, c.t, c.side);   // out to the side
    g.restore();
    return c.t > 1.8;
  }
  // the fish: a low, wide leap, so it stays in the picture
  const D = 1.4, u = Math.min(1, c.t / D), x = c.side * 0.38 * (u * 2 - 1), y = H + 0.06 - 0.6 * Math.sin(Math.PI * u);
  drawFish(g, x, y, Math.atan2(-0.6 * Math.PI * Math.cos(Math.PI * u), 0.76), c.side);
  if (!c.splash && u > 0.9) {
    c.splash = true;
    const mm = g.getTransform();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = f.px * (0.5 + Math.random() * 0.4);
      emit({ type: 'spark', x: mm.c * H + mm.e, y: mm.d * H + mm.f, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: f.px * 2.4, life: 0, max: 0.6, r: f.px * 0.025, rot: 0, col: i % 2 ? '#A8E6FF' : '#FFFFFF' });
    }
  }
  return c.t > D;
}
// Tricket på far (plan M11): with two on the island, the magic hat's trick lands on the other one and comes up out of
// his hood with a puff. The first time on each visit, a magnifying glass then shows him the secret: the dots the
// camera finds in his face.
const Lens = { st: 'idle', t: 0 };
function trickHop(g, f, env) {
  // out of the middle of the hood, so it is still in the picture when your faces are close to the camera
  const c = TopHat.cur, H = -0.6, k = Math.min(1, c.t / 0.25), s = 0.3 + 0.7 * k * k * (3 - 2 * k);
  c.seen = env.t;
  g.save();
  g.translate(0.04, H); g.scale(s, s); g.translate(-0.04, -H);
  g.translate(0.04, 0);
  const done = drawHopper(g, f, env, c, H);
  g.restore();
  if (c.t < 0.5) {               // the puff it comes out of
    g.save(); g.globalAlpha *= 1 - c.t / 0.5;
    for (const [x, y, r] of [[-0.08, 0.03, 0.09], [0.06, -0.02, 0.11], [0.16, 0.04, 0.08], [0.03, 0.08, 0.1]]) { circle(g, x, H + y, r * (1 + c.t)); paint(g, '#F4EEFF', null); }
    g.restore();
  }
  if (done) {
    TopHat.cur = null;
    if (!TopHat.revealed) { TopHat.revealed = true; Lens.st = 'on'; Lens.t = 0; if (typeof Snd !== 'undefined') Snd.play('klik'); }
  }
}
function drawLens(g, f, env) {
  if (Lens.st !== 'on') return;
  const D = 5.5;
  Lens.t += env.dt;
  if (Lens.t > D) { Lens.st = 'idle'; return; }
  // a slow sweep: one eye, the other eye, the nose and the mouth
  const path = [[-0.22, 0.4], [0.22, 0.4], [0, 0.62], [0, 0.86]];
  const q = Math.min(path.length - 1.001, (Lens.t / D) * (path.length - 1)), i = Math.floor(q), w = q - i, e = w * w * (3 - 2 * w);
  const at = P(f, lerp(path[i][0], path[i + 1][0], e), lerp(path[i][1], path[i + 1][1], e), 0), r = f.px * 0.3;
  const fade = Math.max(0, Math.min(1, Lens.t / 0.4, (D - Lens.t) / 0.5));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= fade;
  g.beginPath(); g.arc(at[0], at[1], r, 0, TAU); g.fillStyle = 'rgba(16,24,52,0.42)'; g.fill();
  g.save(); g.beginPath(); g.arc(at[0], at[1], r, 0, TAU); g.clip();
  g.fillStyle = '#7CF2FF';
  const dot = Math.max(1.3, f.px * 0.006);
  for (let k = 0; k < 468; k++) { g.beginPath(); g.arc(f.S[2 * k], f.S[2 * k + 1], dot, 0, TAU); g.fill(); }
  g.restore();
  // the handle, the brass rim and a gleam on the glass
  g.lineCap = 'round';
  g.strokeStyle = '#6B4423'; g.lineWidth = r * 0.24;
  g.beginPath(); g.moveTo(at[0] + r * 0.78, at[1] + r * 0.78); g.lineTo(at[0] + r * 1.55, at[1] + r * 1.55); g.stroke();
  g.beginPath(); g.arc(at[0], at[1], r, 0, TAU); g.strokeStyle = '#C99A3A'; g.lineWidth = r * 0.14; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = r * 0.06;
  g.beginPath(); g.arc(at[0], at[1], r * 0.78, -2.6, -1.9); g.stroke();
  g.restore();
}


// Lygtelyset (plan M9): when you come to the island, a light, glittering fog lies over the picture, but never over your
// faces. A little light follows her nose and wipes the fog away, and the things from the stories she has heard come
// out: Newton's apple, the piece of the paper crown and Pip's walnut shell. There is no clock: the round ends by itself
// when everything is found, or after a while. It comes once each time the camera starts.
const Lantern = { st: 'off', t: 0, light: null, things: [], fog: null, fx: null, sc: 0.25 };
function lanternReset() { Lantern.st = 'off'; Lantern.things = []; Lantern.fog = null; }
function lanternArm(kinds) { if (kinds.length) Object.assign(Lantern, { st: 'armed', t: 0, light: null, kinds, things: [] }); }
function lanternThing(g, th, px, t) {
  const bob = th.found ? Math.sin(t * 2.4 + th.x) * px * 0.04 : 0, x = th.x, y = th.y + bob;
  if (th.found) {
    const gr = g.createRadialGradient(x, y, 0, x, y, px * 0.34);
    gr.addColorStop(0, 'rgba(255,244,190,0.75)'); gr.addColorStop(1, 'rgba(255,244,190,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, px * 0.34, 0, TAU); g.fill();
  }
  if (th.kind === 'aeble') { drawApple(g, x, y, px * 0.12, 0.2); return; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save(); g.translate(x, y);
  if (th.kind === 'krone') { g.scale(px * 0.5, px * 0.5); g.rotate(-0.15); g.translate(-0.25, 0.18); drawCrown(g, 1); }
  else { g.restore(); drawShell(g, x, y, px * 0.2, Math.sin(t * 2) * 0.08, t, 1, false); return; }
  g.restore();
}
function lanternFog(g, env, list) {
  const L = Lantern, f = list[0];
  if (L.st === 'off' || !f) return;
  const W = env.W, H = env.H, px = f.px, c = P(f, 0, 0.5, 0);
  if (L.st === 'armed') {
    // the fog, a quarter of the screen's size, and the things placed round her head, never on a face
    const fog = document.createElement('canvas');
    fog.width = Math.max(8, Math.round(W * L.sc)); fog.height = Math.max(8, Math.round(H * L.sc));
    const x = fog.getContext('2d');
    x.fillStyle = 'rgba(238,232,255,0.86)'; x.fillRect(0, 0, fog.width, fog.height);
    for (let i = 0; i < 26; i++) {
      const bx = Math.random() * fog.width, by = Math.random() * fog.height, br = fog.width * (0.12 + Math.random() * 0.2);
      const gr = x.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, i % 3 ? 'rgba(255,255,255,0.5)' : 'rgba(205,190,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, fog.width, fog.height);
    }
    // places on a grid over the picture, nearest to her first, but never on a face, behind the hat or the cape, or by the edges
    const m = px * 0.3, top = Math.max(m, H * 0.1), bottom = (env.floor || H) - m, cand = [], things = [];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 9; j++) {
      const qx = m + ((W - 2 * m) * (i + 0.5)) / 7, qy = top + ((bottom - top) * (j + 0.5)) / 9;
      if (list.some(fc => { const cc = P(fc, 0, 0.5, 0), dx = (qx - cc[0]) / (fc.px * 0.95), dy = (qy - cc[1]) / (fc.px * 1.2); return dx * dx + dy * dy < 1; })) continue;
      if (Math.abs(qx - c[0]) < px * 0.75 && qy < c[1] - px * 0.3 && qy > c[1] - px * 1.9) continue;
      if (Math.abs(qx - c[0]) < px * 1.5 && qy > c[1] + px * 0.45 && qy < c[1] + px * 2.3) continue;     // the cape
      cand.push({ x: qx, y: qy, d: Math.hypot((qx - c[0]) / px, (qy - c[1]) / px) + Math.random() * 0.8 });
    }
    cand.sort((a, b) => a.d - b.d);
    for (const kind of L.kinds) {
      const q = cand.find(o => !things.some(t => Math.hypot(t.x - o.x, t.y - o.y) < px * 0.7));
      if (q) things.push({ kind, x: q.x, y: q.y, found: false });
    }
    if (!things.length) { L.st = 'off'; return; }
    Object.assign(L, { st: 'on', t: 0, fog, fx: x, things, light: noseTip(f).slice() });
  }
  L.t += env.dt;
  const nose = noseTip(f);
  L.light[0] = lerp(L.light[0], nose[0], Math.min(1, env.dt * 7)); L.light[1] = lerp(L.light[1], nose[1], Math.min(1, env.dt * 7));
  // the light wipes the fog away where it goes, softly at the edge
  if (L.st === 'on') {
    const x = L.fx, lx = L.light[0] * L.sc, ly = L.light[1] * L.sc, r = px * 0.8 * L.sc;
    x.globalCompositeOperation = 'destination-out';
    const gr = x.createRadialGradient(lx, ly, 0, lx, ly, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(lx, ly, r, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-over';
    for (const th of L.things) {
      if (th.found || Math.hypot(th.x - L.light[0], th.y - L.light[1]) > px * 0.75) continue;
      th.found = true;
      if (typeof Snd !== 'undefined') Snd.play('fundet');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU, v = px * (0.5 + Math.random() * 0.4);
        emit({ type: 'spark', x: th.x, y: th.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.8, life: 0, max: 0.8, r: px * 0.03, rot: Math.random(), col: i % 2 ? '#FFF3A0' : '#FFFFFF' });
      }
    }
    if (L.things.every(th => th.found) || L.t > 50) { L.st = 'clear'; L.t = 0; if (typeof Snd !== 'undefined') Snd.play('simsalabim'); }
  }
  const fade = L.st === 'clear' ? Math.max(0, 1 - L.t / 1.6) : Math.min(1, L.t / 0.6);
  if (L.st === 'clear' && L.t > 4) { lanternReset(); return; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  // the things under the fog, then the fog, and then the faces cut free of it
  g.globalAlpha = L.st === 'clear' ? Math.max(0, Math.min(1, (4 - L.t) / 1)) : 1;
  for (const th of L.things) lanternThing(g, th, px, env.t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = fade;
  g.drawImage(L.fog, 0, 0, W, H);
  for (let i = 0; i < 12; i++) {           // a little glitter in the fog
    const sx = ((i * 0.6180339 + 0.11) % 1) * W, sy = ((i * 0.3819660 + 0.23) % 1) * H, tw = 0.5 + 0.5 * Math.sin(env.t * 2.2 + i * 1.9);
    g.globalAlpha = fade * 0.7 * tw; star4(g, sx, sy, px * 0.035, 0.3); g.fillStyle = '#FFFFFF'; g.fill();
  }
  g.globalAlpha = 1;
  for (const fc of list) {
    if (!fc.M) continue;
    const at = P(fc, 0, 0.52, 0), roll = Math.atan2(-fc.M[1], fc.M[4]);
    g.save(); g.beginPath(); g.ellipse(at[0], at[1], fc.px * 0.64, fc.px * 0.84, roll, 0, TAU); g.clip();
    g.clearRect(0, 0, W, H); g.restore();
  }
  // the little light itself, by her nose
  if (L.st === 'on') {
    const lx = L.light[0], ly = L.light[1], gr = g.createRadialGradient(lx, ly, 0, lx, ly, px * 0.16);
    gr.addColorStop(0, 'rgba(255,250,210,0.95)'); gr.addColorStop(0.35, 'rgba(255,226,120,0.6)'); gr.addColorStop(1, 'rgba(255,226,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, px * 0.16, 0, TAU); g.fill();
  }
  g.restore();
}

// Måneringen (plan M10): when you are two on the island and open your mouths at the same time, a ring of moonlight
// dances round you both and your glitter meets in the middle. It can only be done together, and nobody wins.
const MoonRing = { st: 'idle', t: 0, armed: true, burst: false, seen: [null, null] };
function moonRingReset() { Object.assign(MoonRing, { st: 'idle', t: 0, armed: true, burst: false, seen: [null, null] }); }
function crescent(g, x, y, r, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.arc(0, 0, r, 0.941, TAU - 0.941, false); g.arc(r * 0.45, 0, r * 0.82, -1.4004, 1.4004, true); g.closePath();
  g.restore();
}
function moonRing(g, f, env, o) {
  const R = MoonRing, fi = env.fi;
  if (typeof fi !== 'number' || fi > 1 || (typeof islandThing === 'function' && !islandThing('maanering'))) return;
  R.seen[fi] = { o, m: smix(f, 13, 14, 0.5), c: P(f, 0, 0.55, 0), px: f.px, at: env.t };
  if (fi !== 1) return;
  const a = R.seen[0], b = R.seen[1];
  if (!a || env.t - a.at > 0.3) return;            // the first face was not seen just now
  if (R.st === 'idle') {
    if (!R.armed && Math.max(a.o, b.o) < 0.2) R.armed = true;
    if (R.armed && a.o > 0.55 && b.o > 0.55) {
      Object.assign(R, { st: 'on', t: 0, armed: false, burst: false });
      if (typeof Snd !== 'undefined') Snd.play('maane');
    }
    return;
  }
  const D = 3.4;
  R.t += env.dt;
  if (R.t > D) { R.st = 'idle'; return; }
  const mid = [(a.c[0] + b.c[0]) / 2, (a.c[1] + b.c[1]) / 2], px = (a.px + b.px) / 2;
  const cols = ['#FFF3A0', '#FFFFFF', '#D9C8FF', '#A8E6FF'];
  // the glitter from both mouths flies to the middle and meets there with a little burst
  if (R.t < 1.3) [a, b].forEach((s, k) => every(f, 'ring' + k, 24, env.dt, () => {
    const T = 0.7 + Math.random() * 0.2;
    emit({ type: 'spark', x: s.m[0], y: s.m[1], vx: (mid[0] - s.m[0]) / T, vy: (mid[1] - s.m[1]) / T, life: 0, max: T,
      r: px * (0.025 + Math.random() * 0.02), rot: Math.random(), col: cols[Math.floor(Math.random() * cols.length)] });
  }));
  if (!R.burst && R.t > 0.8) {
    R.burst = true;
    for (let i = 0; i < 18; i++) {
      const an = (i / 18) * TAU, v = px * (0.6 + Math.random() * 0.5);
      emit({ type: 'spark', x: mid[0], y: mid[1], vx: Math.cos(an) * v, vy: Math.sin(an) * v, drag: 1.6, life: 0, max: 0.9, r: px * 0.035, rot: Math.random(), col: '#FFF3A0' });
    }
  }
  // the ring of moonlight round you both, with little moons and stars dancing along it
  const ang = Math.atan2(b.c[1] - a.c[1], b.c[0] - a.c[0]), half = Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) / 2;
  const rx = half + px * 0.85, ry = px * 1.05, fade = Math.min(1, R.t / 0.35, (D - R.t) / 0.6);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.globalAlpha *= Math.max(0, fade);
  g.translate(mid[0], mid[1]); g.rotate(ang > Math.PI / 2 ? ang - Math.PI : ang < -Math.PI / 2 ? ang + Math.PI : ang);
  g.lineCap = 'round';
  for (const [w, al] of [[px * 0.16, 0.12], [px * 0.07, 0.3], [px * 0.022, 0.9]]) {
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.strokeStyle = 'rgba(236,228,255,' + al + ')'; g.lineWidth = w; g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const ph = R.t * 1.3 + (i / 12) * TAU, bob = Math.sin(R.t * 6 + i * 1.7) * px * 0.05;
    const x = Math.cos(ph) * rx, y = Math.sin(ph) * ry + bob, r = px * (i % 2 ? 0.05 : 0.07);
    if (i % 2) { star5(g, x, y, r, R.t * 2 + i); paint(g, '#FFF3A0', 'rgba(140,110,30,0.6)', px * 0.006); }
    else { crescent(g, x, y, r, -0.6 + Math.sin(R.t * 3 + i) * 0.4); paint(g, '#FFF6C8', 'rgba(150,130,60,0.7)', px * 0.007); }
  }
  g.restore();
}
function drawApprentice(g, f, env, pal) {
  drawSailCape(g, f);
  const o = openAmt(f, 0.2, 0.4);
  // "Simsalabim!": glitter flies up from the mouth while it is open
  if (o > 0 && !env.icon && env.dt) {
    const cols = ['#FFF3A0', '#FFFFFF', '#D9C8FF', '#A8E6FF', pal.star];
    every(f, 'sim', 24 * o, env.dt, () => {
      const m = smix(f, 13, 14, 0.5), a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = f.px * (0.9 + Math.random() * 0.9);
      emit({ type: 'spark', x: m[0], y: m[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.4, life: 0,
        max: 0.8 + Math.random() * 0.6, r: f.px * (0.03 + Math.random() * 0.03), rot: Math.random(), col: cols[Math.floor(Math.random() * cols.length)] });
    });
  }
  if (pal === APPRENTICE[0] && TopHat.on && !env.icon && env.dt && env.fi === 0) drawTopHat(g, f, env, o);
  else drawHood(g, f, env, pal, o);
  // the word itself, in a bubble beside the mouth, with a bell-like chime
  say(g, f, env, 'simsalabim', 'Simsalabim!', o);
  if (!env.icon && env.dt) moonRing(g, f, env, o);
  if (!env.icon && env.dt && env.fi === 1) drawLens(g, f, env);
}
// the apprentice's soft, pointed hat with the glowing question mark on a thread
function drawHood(g, f, env, pal, o) {
  // the hat, swaying a little as she moves
  const sway = spring(f, 'lhat', 0, { k: 70, c: 6, g: 1.3, lim: 0.25 });
  fr(g, f, P(f, 0, 0.0, -0.06));
  g.rotate(-0.05 + sway * 0.35);
  const cone = () => {
    g.beginPath();
    g.moveTo(-0.5, 0.0);
    g.bezierCurveTo(-0.42, -0.4, -0.27, -0.78, -0.1, -0.93);
    g.quadraticCurveTo(0.04, -1.07, 0.22, -1.0);
    g.bezierCurveTo(0.42, -0.94, 0.56, -0.8, 0.57, -0.62);
    g.bezierCurveTo(0.5, -0.66, 0.36, -0.76, 0.22, -0.8);
    g.bezierCurveTo(0.26, -0.6, 0.42, -0.3, 0.5, 0.0);
    g.closePath();
  };
  cone(); paint(g, lin(g, 0, -1.02, 0, 0, pal.hat), pal.line, 0.016);
  g.save(); cone(); g.clip();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,20,0.22)'; g.lineWidth = 0.06;                 // shade under the fold
  g.beginPath(); g.moveTo(0.18, -0.84); g.quadraticCurveTo(0.42, -0.78, 0.6, -0.6); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.045;           // a soft sheen on the cloth
  g.beginPath(); g.moveTo(-0.3, -0.12); g.quadraticCurveTo(-0.22, -0.55, -0.06, -0.86); g.stroke();
  for (const [x, y, r, k] of [[-0.24, -0.32, 0.055, 5], [0.12, -0.5, 0.045, 5], [-0.04, -0.76, 0.04, 4], [0.3, -0.2, 0.05, 5], [0.4, -0.84, 0.035, 4], [-0.36, -0.12, 0.035, 4]]) {
    if (k === 5) star5(g, x, y, r, 0.2); else star4(g, x, y, r * 1.2, 0.3);
    paint(g, pal.star, null);
  }
  g.restore();
  // the cuff, of the same sailcloth as the cape
  g.beginPath();
  g.moveTo(-0.56, -0.03); g.quadraticCurveTo(0, -0.1, 0.56, -0.03);
  g.lineTo(0.57, 0.07); g.quadraticCurveTo(0, 0.0, -0.57, 0.07); g.closePath();
  paint(g, lin(g, 0, -0.1, 0, 0.07, ['#FBF3E2', '#E6D7B6']), '#A3855A', 0.012);
  g.setLineDash([0.03, 0.024]);
  g.beginPath(); g.moveTo(-0.52, 0.02); g.quadraticCurveTo(0, -0.045, 0.52, 0.02); paint(g, null, '#B99C6A', 0.008);
  g.setLineDash([]);
  if (pal === APPRENTICE[1] && !env.icon && env.dt && TopHat.cur && TopHat.cur.on === 1) trickHop(g, f, env);
  // the question mark hangs from the tip on a thread and glows; it shines brightest at "Simsalabim!"
  const swing = spring(f, 'lq', 0, { k: 55, c: 4, g: 2.2, lim: 0.7 });
  g.translate(0.57, -0.62);
  g.rotate(swing * 0.8);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.03, 0.06, 0.02, 0.11); paint(g, null, '#C9B48A', 0.012);
  const pulse = env.icon ? 0.5 : 0.5 + 0.5 * Math.sin(env.t * 3), glow = 0.3 + 0.25 * pulse + 0.45 * o;
  const gr = g.createRadialGradient(0.02, 0.2, 0, 0.02, 0.2, 0.17 + 0.1 * o);
  gr.addColorStop(0, 'rgba(255,240,170,' + glow.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,240,170,0)');
  circle(g, 0.02, 0.2, 0.17 + 0.1 * o); g.fillStyle = gr; g.fill();
  questionMark(g, 0.02, 0.2, 0.092, '#6B4E0E');
  questionMark(g, 0.02, 0.2, 0.08, '#FFE27A');
}

const COSTUMES = [
  { id: 'ingen', name: 'Normal', bg: '#E9E6F5', draw() {} },

  /* ---- Enhjørning: eventyrlig, ikke forskønnet – manke, horn og glimmer, men ingen hudfarve, vipper eller rouge ---- */
  {
    id: 'enhjoerning', name: 'Enhjørning', bg: '#E5D4FF', iconOpen: 0.75,
    draw(g, f, env) {
      // pastel rainbow mane around the top and sides of the face (the chin stays free)
      const c = P(f, 0, 0.55, 0);
      const pastel = ['#FFB3D9', '#D9B8FF', '#A8D8FF', '#B6F0D2', '#FFF0A0', '#FFC8A8'];
      const mane = (off, r, shift) => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        FACE_OVAL.forEach((i, k) => {
          if (CANON[3 * i + 1] > 0.86) return;
          const p = sp(f, i);
          let dx = p[0] - c[0], dy = p[1] - c[1];
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const rr = f.px * (r + 0.012 * Math.sin(env.t * 2.2 + k * 1.1 + shift));
          circle(g, p[0] + dx * f.px * off, p[1] + dy * f.px * off, rr);
          g.fillStyle = pastel[(k + shift) % pastel.length];
          g.fill();
        });
      };
      mane(0.2, 0.15, 0);
      mane(0.1, 0.11, 3);
      // glitter in the mane: little stars that twinkle one by one
      FACE_OVAL.forEach((i, k) => {
        if (k % 3 || CANON[3 * i + 1] > 0.8) return;
        const p = sp(f, i);
        let dx = p[0] - c[0], dy = p[1] - c[1];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const tw = env.icon ? 1 : 0.2 + 0.8 * Math.sin(env.t * 2.4 + k * 2.3) ** 2;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha *= tw;
        g.fillStyle = (k / 3) % 2 ? '#FFFFFF' : '#FFF1A6';
        star4(g, p[0] + dx * f.px * 0.15, p[1] + dy * f.px * 0.15, f.px * (0.05 + 0.022 * tw), k * 0.7);
        g.fill();
        g.restore();
      });
      // white horse ears
      for (const side of [-1, 1]) {
        const a = spring(f, 'uear' + side, 0, { k: 140, c: 8, g: 0.6, dir: -1, lim: 0.3 });
        frS(g, f, P(f, side * 0.34, -0.1, -0.2), side);
        g.rotate(0.42 + a);
        g.beginPath(); g.moveTo(-0.1, 0.03); g.quadraticCurveTo(-0.09, -0.2, 0.02, -0.34); g.quadraticCurveTo(0.12, -0.18, 0.1, 0.03); g.closePath();
        paint(g, '#FFFFFF', '#A88FC2', 0.014);
        g.beginPath(); g.moveTo(-0.05, 0.0); g.quadraticCurveTo(-0.04, -0.15, 0.02, -0.25); g.quadraticCurveTo(0.07, -0.13, 0.05, 0.0); g.closePath();
        paint(g, '#F8B4D0', null);
      }
      // two flowers tucked into the mane
      for (const side of [-1, 1]) {
        fr(g, f, P(f, side * 0.42, 0.06, -0.1));
        for (let k = 0; k < 5; k++) { const a = (k * TAU) / 5; circle(g, Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0.03); paint(g, side < 0 ? '#F48FB1' : '#CE93D8', null); }
        circle(g, 0, 0, 0.022); paint(g, '#FFF59D', null);
      }
      // forelock curls under the horn
      for (const [x, y, r, col] of [[-0.1, 0.03, 0.07, '#FFB3D9'], [0.1, 0.03, 0.07, '#A8D8FF'], [0, 0.0, 0.08, '#D9B8FF']]) {
        fr(g, f, P(f, x, y, 0)); circle(g, 0, 0, r); paint(g, col, null);
      }
      // horn
      fr(g, f, P(f, 0, -0.04, 0));
      const horn = () => { g.beginPath(); g.moveTo(-0.078, 0); g.quadraticCurveTo(-0.03, -0.27, 0, -0.54); g.quadraticCurveTo(0.03, -0.27, 0.078, 0); g.closePath(); };
      horn(); paint(g, lin(g, 0, 0, 0, -0.54, ['#FFD36B', '#FFF6CF']), '#C7911A', 0.012);
      g.save(); horn(); g.clip();
      g.strokeStyle = 'rgba(235,170,50,0.85)'; g.lineWidth = 0.018;
      for (let i = 0; i < 7; i++) { const y = -0.04 - i * 0.08; g.beginPath(); g.moveTo(-0.1, y + 0.035); g.lineTo(0.1, y - 0.035); g.stroke(); }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.45 * Math.sin(env.t * 4)) + ')';
      star4(g, 0, -0.56, 0.06 + 0.015 * Math.sin(env.t * 4), env.t * 0.6); g.fill();
      // rainbow from the mouth
      const o = openAmt(f, 0.16, 0.45);
      if (o > 0) {
        fr(g, f, smix(f, 13, 14, 0.5));
        const cols = ['#FF5E5B', '#FF9F45', '#FFE45E', '#5BD36B', '#4CA7FF', '#9B6BFF'];
        const L = env.icon ? 1.4 : 3.4, n = 60;
        for (let j = 0; j < 6; j++) {
          g.beginPath();
          for (let i = 0; i <= n; i++) {
            const s2 = (i / n) * L, w = (0.15 + 0.34 * s2) * o, wave = Math.sin(s2 * 5 - env.t * 7) * 0.05 * (s2 + 0.15);
            const x = -w / 2 + (j / 6) * w + wave;
            i ? g.lineTo(x, s2) : g.moveTo(x, s2);
          }
          for (let i = n; i >= 0; i--) {
            const s2 = (i / n) * L, w = (0.15 + 0.34 * s2) * o, wave = Math.sin(s2 * 5 - env.t * 7) * 0.05 * (s2 + 0.15);
            g.lineTo(-w / 2 + ((j + 1) / 6) * w + wave, s2);
          }
          g.closePath();
          g.fillStyle = cols[j];
          g.fill();
        }
        if (!env.icon && env.dt) {
          every(f, 'rb', 18 * o, env.dt, () => {
            const s2 = Math.random() * 1.6;
            const p = P(f, (Math.random() - 0.5) * 0.4 * s2, 0.82 + s2, 0);
            emit({ type: 'spark', x: p[0], y: p[1], vx: 0, vy: 0, life: 0, max: 0.6, r: f.px * 0.04, rot: 0 });
          });
        }
      }
      sparkleAround(f, env, 6);
    }
  },

  /* ---- Kaptajn Knurhår, bogens figur: hatten falder af, når man læner hovedet langt tilbage ---- */
  {
    id: 'knurhaar', name: 'Kaptajn Knurhår', bg: '#C9D8F2', iconOpen: 0, book: true,
    draw(g, f, env) {
      // orange ears that stick out under the big hat
      drawCatEars(g, f, env, [0.45, 0.1, -0.28], '#F2A03D', '#F6B8C4', 0.95, 0.3);
      // tabby stripes on the outer cheeks (no lashes, no blush)
      g.lineCap = 'round';
      for (const side of [-1, 1]) {
        frS(g, f, P(f, side * 0.4, 0.58, -0.25), side);
        g.strokeStyle = 'rgba(224,124,28,0.72)'; g.lineWidth = 0.026;
        for (const [y, l] of [[-0.065, 0.12], [0, 0.15], [0.065, 0.12]]) {
          g.beginPath(); g.moveTo(0.05, y); g.quadraticCurveTo(-0.02, y + 0.012, 0.05 - l, y + 0.03); g.stroke();
        }
      }
      // pink cat nose and very long, white whiskers
      fr(g, f, noseTip(f));
      g.beginPath();
      g.moveTo(0, 0.045);
      g.bezierCurveTo(-0.035, 0.04, -0.065, 0.0, -0.06, -0.022);
      g.bezierCurveTo(-0.055, -0.045, 0.055, -0.045, 0.06, -0.022);
      g.bezierCurveTo(0.065, 0.0, 0.035, 0.04, 0, 0.045);
      paint(g, '#F7A1B5', '#B2456E', 0.01);
      whiskers(g, f, env, 'rgba(70,45,30,0.5)', 0.5, 0.02);
      whiskers(g, f, env, '#FFFDF7', 0.5, 0.011);
      drawNeckerchief(g, f, env);
      // Pip (story 2) lives in her hat, for the first face, unless the second face is Pip himself
      const first = !env.icon && env.dt && env.fi === 0 && typeof storyHeard === 'function';
      const book2 = first && storyHeard(2) && !(env.universe && env.n > 1);
      const aboard = book2 && typeof pipIsAboard === 'function' && pipIsAboard();
      let pip = 0;
      if (aboard) {
        pip = env.peek < 0.35 ? Math.max(0, env.peek / 0.35) : 1;     // pops out again after peekaboo
        retPipTick(f, env);
        if (RetPip.st === 'ask' || RetPip.st === 'repeat') pip = 1 + 0.12 * (0.5 + 0.5 * Math.sin(env.t * 9));   // he bobs while he talks
      } else if (book2) pip = pipBoarding(g, f, env);
      knurhaarHat(g, f, env, pip);
      // peekaboo: hands over the face, and when she looks out again, Pip pops out with "Pip!"
      if (aboard && env.peek < 1.6 && f.mem.hat && f.mem.hat.st === 'on') {
        if (!f.mem.peekSaid) { f.mem.peekSaid = true; if (typeof Snd !== 'undefined') Snd.play('pip'); }
        const p = pipSpot(f), mir = f.M[0] * f.M[4] - f.M[1] * f.M[3] < 0;
        bubbleAt(g, env, p[0] + (mir ? 1 : -1) * f.px * 0.32, p[1] - f.px * 0.2, 'Pip!', f.px * 0.12, Math.min(1, (env.peek - 0.25) / 0.15, (1.6 - env.peek) / 0.3));
      }
      // the apple throw from story 1: only once story 1 has been read, and not while Pip is still coming aboard
      if (first && storyHeard(1) && !(book2 && !aboard) && !retPipBusy()) appleToss(g, f, env);
    }
  },

  /* ---- Papirkronen fra historie 2: alene har hun hele kronen på, kommer der et ansigt mere, rives den i stykker ---- */
  {
    id: 'krone', name: 'Papirkronen', bg: '#FFF1C9', iconOpen: 0, book: true, story: 2,
    draw(g, f, env) {
      if (env.icon || !env.dt) { putCrown(g, f, 0); return; }
      paperCrown(g, f, env);
    }
  },

  /* ---- Pip, bogens mus (fra historie 2): store runde ører, lyserød næse og et halstørklæde magen til kaptajnens ---- */
  {
    id: 'pip', name: 'Pip', bg: '#EADFCF', iconOpen: 0, book: true, story: 2,
    draw(g, f, env) {
      for (const side of [-1, 1]) {
        const a = spring(f, 'pipear' + side, 0, { k: 150, c: 8, g: 0.7, dir: -1, lim: 0.35 });
        fr(g, f, P(f, side * 0.47, -0.05, -0.25));
        g.rotate(a * side * 0.6);
        circle(g, 0, 0, 0.3); paint(g, '#B39B80', '#6E5A47', 0.014);
        circle(g, side * 0.02, 0.025, 0.215); paint(g, '#F2A79C', null);
        oval(g, side * 0.05, 0.05, 0.12, 0.1); paint(g, 'rgba(255,196,186,0.7)', null);
      }
      // a tuft of fur on the forehead
      fr(g, f, P(f, 0, 0.04, 0));
      g.lineCap = 'round'; g.strokeStyle = '#8A7158'; g.lineWidth = 0.022;
      for (const [x, d] of [[-0.06, -0.6], [0, -0.1], [0.06, 0.5]]) {
        g.beginPath(); g.moveTo(x, 0.04); g.quadraticCurveTo(x + d * 0.05, -0.05, x + d * 0.11, -0.11); g.stroke();
      }
      // pink nose and long, light whiskers
      fr(g, f, noseTip(f));
      oval(g, 0, 0, 0.05, 0.04); paint(g, '#EF8B9C', '#B2456E', 0.01);
      circle(g, -0.016, -0.013, 0.012); paint(g, 'rgba(255,255,255,0.8)', null);
      whiskers(g, f, env, 'rgba(70,50,35,0.45)', 0.42, 0.018);
      whiskers(g, f, env, '#FFFDF7', 0.42, 0.009);
      drawNeckerchief(g, f, env, 0.78);
      // "Pip!" – his first word in story 2
      say(g, f, env, 'pip', 'Pip!', openAmt(f, 0.25, 0.35));
    }
  },

  /* ---- Sukkertop, papegøjen (gæst fra historie 9): grøn, gul fjertop som en lille sukkertop, røde fjer i vingekanten ---- */
  {
    id: 'sukkertop', name: 'Sukkertop', bg: '#D3F0CB', iconOpen: 0, book: true, story: 9,
    draw(g, f, env) {
      // green feathers framing the face (the chin stays free)
      const c = P(f, 0, 0.55, 0);
      const ring = (off, len, wid, cols, shift) => {
        FACE_OVAL.forEach((i, k) => {
          if (CANON[3 * i + 1] > 0.84) return;
          const p = sp(f, i);
          let dx = p[0] - c[0], dy = p[1] - c[1];
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const wob = env.icon ? 0 : 0.04 * Math.sin(env.t * 2 + k * 1.3);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.save();
          g.translate(p[0] + dx * f.px * off, p[1] + dy * f.px * off);
          g.rotate(Math.atan2(dy, dx) + wob);
          oval(g, f.px * len * 0.45, 0, f.px * len * 0.55, f.px * wid);
          paint(g, cols[(k + shift) % cols.length], 'rgba(30,90,40,0.55)', Math.max(1, f.px * 0.008));
          g.restore();
        });
      };
      ring(0.12, 0.26, 0.085, ['#3E9E4A', '#47AE52', '#379043'], 0);
      ring(0.03, 0.2, 0.075, ['#6CC66A', '#5DB95E', '#79CF73'], 1);
      // a few red feathers at the wing edges, low on each side
      for (const side of [-1, 1]) {
        for (let j = 0; j < 3; j++) {
          frS(g, f, P(f, side * 0.5, 0.66 + j * 0.06, -0.35), side);
          g.rotate(0.55 + j * 0.18);
          oval(g, 0.1, 0, 0.11, 0.035); paint(g, j === 1 ? '#E0453E' : '#EE5A4C', '#9C2A24', 0.009);
        }
      }
      // the yellow crest that stands up like a little sugarloaf
      fr(g, f, P(f, 0, -0.03, 0));
      const sway = spring(f, 'crest', 0, { k: 80, c: 6, g: 1.1, dir: -1, lim: 0.4 });
      g.rotate(sway * 0.5);
      for (const [a, h, col] of [[-0.26, 0.36, '#F2C230'], [0.26, 0.36, '#F2C230'], [-0.12, 0.47, '#FFD84D'], [0.12, 0.47, '#FFD84D'], [0, 0.57, '#FFE27A']]) {
        g.save(); g.rotate(a);
        g.beginPath(); g.moveTo(-0.055, 0); g.quadraticCurveTo(-0.06, -h * 0.6, 0, -h); g.quadraticCurveTo(0.06, -h * 0.6, 0.055, 0); g.closePath();
        paint(g, col, '#B98A10', 0.011);
        g.restore();
      }
      // a small, curved, light-grey beak over the nose
      fr(g, f, noseTip(f));
      g.beginPath();
      g.moveTo(-0.085, -0.07);
      g.quadraticCurveTo(0, -0.12, 0.085, -0.07);
      g.quadraticCurveTo(0.1, 0.06, 0.012, 0.15);
      g.quadraticCurveTo(0.0, 0.1, -0.03, 0.06);
      g.quadraticCurveTo(-0.08, 0.02, -0.085, -0.07);
      g.closePath();
      paint(g, lin(g, 0, -0.12, 0, 0.15, ['#E6E6EA', '#B9B9C2']), '#6D6D78', 0.012);
      circle(g, 0.0, -0.06, 0.012); paint(g, '#6D6D78', null);
      // "Kra!" – what she says in the book
      say(g, f, env, 'kra', 'Kra!', openAmt(f, 0.25, 0.35));
    }
  },

  /* ---- Simsalabim-øen (ikke fra bogen): tryllelærlingen og makkeren til ansigt nr. 2 ---- */
  {
    id: 'laerling', name: 'Tryllelærling', bg: '#D9D2FF', iconOpen: 0, world: 'island', iconScale: 0.3, iconTop: 0.5,
    draw(g, f, env) { drawApprentice(g, f, env, APPRENTICE[0]); }
  },
  {
    id: 'makker', name: 'Makker', bg: '#CDEFE6', iconOpen: 0, world: 'island', hidden: true, iconScale: 0.3, iconTop: 0.5,
    draw(g, f, env) { drawApprentice(g, f, env, APPRENTICE[1]); }
  },

  /* ---- Sørøverkat ---- */
  {
    id: 'kat', name: 'Sørøverkat', bg: '#FFD7A6', iconOpen: 0,
    draw(g, f, env) {
      drawCatEars(g, f, env, [0.4, -0.02, -0.25], '#F39A2E', '#F7B6C6', 0.5, 0.34);
      // tabby stripes on the forehead
      fr(g, f, P(f, 0, 0.0, 0));
      g.lineCap = 'round'; g.strokeStyle = 'rgba(205,110,25,0.8)'; g.lineWidth = 0.032;
      for (const [x0, x1] of [[-0.07, -0.05], [0, 0], [0.07, 0.05]]) {
        g.beginPath(); g.moveTo(x0, 0.0); g.lineTo(x1, 0.12 - Math.abs(x0)); g.stroke();
      }
      // tricorn hat
      fr(g, f, P(f, 0, -0.1, -0.1));
      g.beginPath();
      g.moveTo(-0.4, -0.02);
      g.bezierCurveTo(-0.36, -0.12, -0.26, -0.22, -0.18, -0.3);
      g.bezierCurveTo(-0.1, -0.4, 0.1, -0.4, 0.18, -0.3);
      g.bezierCurveTo(0.26, -0.22, 0.36, -0.12, 0.4, -0.02);
      g.bezierCurveTo(0.24, 0.06, 0.1, 0.03, 0, 0.03);
      g.bezierCurveTo(-0.1, 0.03, -0.24, 0.06, -0.4, -0.02);
      g.closePath();
      paint(g, lin(g, 0, -0.4, 0, 0.04, ['#4A3C36', '#231C19']));
      g.beginPath();
      g.moveTo(-0.37, -0.045);
      g.bezierCurveTo(-0.22, 0.02, -0.1, -0.005, 0, -0.005);
      g.bezierCurveTo(0.1, -0.005, 0.22, 0.02, 0.37, -0.045);
      paint(g, null, '#F2C14E', 0.024);
      // fish-bone emblem
      g.save(); g.translate(0, -0.19);
      g.strokeStyle = '#FFFFFF'; g.fillStyle = '#FFFFFF'; g.lineWidth = 0.014; g.lineCap = 'round';
      circle(g, -0.075, 0, 0.034); g.fill();
      g.beginPath(); g.moveTo(-0.045, 0); g.lineTo(0.07, 0); g.stroke();
      for (const x of [-0.015, 0.015, 0.045]) { g.beginPath(); g.moveTo(x - 0.01, -0.032); g.quadraticCurveTo(x + 0.006, 0, x - 0.01, 0.032); g.stroke(); }
      g.beginPath(); g.moveTo(0.07, 0); g.lineTo(0.11, -0.035); g.lineTo(0.11, 0.035); g.closePath(); g.fill();
      circle(g, -0.083, -0.008, 0.009); g.fillStyle = '#231C19'; g.fill();
      g.restore();
      // eye patch on one eye, with its strap
      const ec = scent(f, EYE_L);
      fr(g, f, ec);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-0.07, -0.06); g.quadraticCurveTo(-0.32, -0.26, -0.66, -0.24); paint(g, null, '#17161A', 0.024);
      g.beginPath(); g.moveTo(0.08, -0.03); g.quadraticCurveTo(0.2, 0.0, 0.3, 0.06); paint(g, null, '#17161A', 0.024);
      oval(g, 0, 0.0, 0.11, 0.088, -0.12);
      paint(g, '#17161A', '#000000', 0.012);
      oval(g, -0.035, -0.03, 0.03, 0.018, -0.5); paint(g, 'rgba(255,255,255,0.28)', null);
      // nose + whiskers
      fr(g, f, noseTip(f));
      g.beginPath();
      g.moveTo(0, 0.045);
      g.bezierCurveTo(-0.035, 0.04, -0.065, 0.0, -0.06, -0.022);
      g.bezierCurveTo(-0.055, -0.045, 0.055, -0.045, 0.06, -0.022);
      g.bezierCurveTo(0.065, 0.0, 0.035, 0.04, 0, 0.045);
      paint(g, '#F48FB1', '#B2456E', 0.01);
      whiskers(g, f, env, '#3B2A20', 0.32);
      // a fish when the mouth opens
      const o = openAmt(f, 0.25, 0.4);
      if (o > 0) {
        fr(g, f, mouthC(f));
        g.scale(o, o);
        g.translate(0.07, 0);
        g.rotate(Math.sin(env.t * 8) * 0.12);
        g.beginPath(); g.moveTo(0.11, 0); g.lineTo(0.21, -0.06); g.lineTo(0.2, 0.06); g.closePath(); paint(g, '#29B6F6');
        oval(g, 0.02, 0, 0.11, 0.055); paint(g, '#4FC3F7');
        circle(g, -0.03, -0.012, 0.015); paint(g, '#FFFFFF', null);
        circle(g, -0.033, -0.012, 0.007); paint(g, '#17161A', null);
      }
    }
  },

  /* ---- Hund ---- */
  {
    id: 'hund', name: 'Hund', bg: '#EBCDAA', iconOpen: 0.7,
    draw(g, f, env) {
      for (const side of [-1, 1]) {
        const a = spring(f, 'ear' + side, f.grav * 0.85 - side * 0.32, { k: 55, c: 5, g: 1.7 });
        fr(g, f, P(f, side * 0.45, -0.15, -0.3));
        g.rotate(a);
        if (side < 0) g.scale(-1, 1);
        g.beginPath();
        g.moveTo(-0.06, -0.03);
        g.bezierCurveTo(-0.18, 0.05, -0.2, 0.38, -0.1, 0.53);
        g.bezierCurveTo(-0.04, 0.61, 0.08, 0.59, 0.11, 0.48);
        g.bezierCurveTo(0.15, 0.34, 0.13, 0.08, 0.07, -0.04);
        g.closePath();
        paint(g, '#7B4B2A');
        oval(g, 0.0, 0.3, 0.06, 0.17); paint(g, 'rgba(160,104,58,0.65)', null);
      }
      // muzzle dots
      fr(g, f, smix(f, 2, 0));
      g.fillStyle = '#3B2A20';
      for (const s of [-1, 1]) for (const [x, y] of [[0.07, 0.0], [0.11, -0.02], [0.1, 0.025]]) { circle(g, s * x, y, 0.009); g.fill(); }
      // nose
      fr(g, f, smix(f, 1, 4, 0.35));
      g.beginPath();
      g.moveTo(0, 0.07);
      g.bezierCurveTo(-0.06, 0.07, -0.11, 0.0, -0.105, -0.035);
      g.bezierCurveTo(-0.1, -0.075, 0.1, -0.075, 0.105, -0.035);
      g.bezierCurveTo(0.11, 0.0, 0.06, 0.07, 0, 0.07);
      paint(g, '#1E1A1A', '#000000', 0.01);
      oval(g, -0.035, -0.035, 0.035, 0.018, -0.2); paint(g, 'rgba(255,255,255,0.55)', null);
      // tongue
      const o = openAmt(f, 0.12, 0.55);
      if (o > 0) {
        fr(g, f, smix(f, 13, 14, 0.35));
        g.rotate(Math.sin(env.t * 6) * 0.1);
        const L = 0.08 + 0.42 * o;
        g.beginPath();
        g.moveTo(-0.095, -0.02); g.lineTo(-0.095, L * 0.55);
        g.bezierCurveTo(-0.095, L + 0.05, 0.095, L + 0.05, 0.095, L * 0.55);
        g.lineTo(0.095, -0.02); g.closePath();
        paint(g, lin(g, 0, 0, 0, L, ['#E24E78', '#FF7EA2']), '#A93A5A', 0.012);
        g.beginPath(); g.moveTo(0, 0.02); g.lineTo(0, L * 0.72); paint(g, null, '#C9446A', 0.013);
      }
    }
  },

  /* ---- Kanin ---- */
  {
    id: 'kanin', name: 'Kanin', bg: '#FAD3E0',
    draw(g, f, env) {
      for (const side of [-1, 1]) {
        const a = spring(f, 'ear' + side, side * 0.14 + f.grav * 0.2, { k: 45, c: 4, g: 1.0, dir: -1, lim: 0.6 });
        fr(g, f, P(f, side * 0.17, -0.16, -0.12));
        g.rotate(a);
        g.beginPath();
        g.moveTo(-0.08, 0.02);
        g.bezierCurveTo(-0.14, -0.25, -0.11, -0.62, 0, -0.72);
        g.bezierCurveTo(0.11, -0.62, 0.14, -0.25, 0.08, 0.02);
        g.closePath();
        paint(g, '#F7F3EF', '#7E6E64');
        g.beginPath();
        g.moveTo(-0.04, -0.02);
        g.bezierCurveTo(-0.075, -0.22, -0.055, -0.52, 0, -0.6);
        g.bezierCurveTo(0.055, -0.52, 0.075, -0.22, 0.04, -0.02);
        g.closePath();
        paint(g, '#F8B4C6', null);
      }
      blush(g, f);
      whiskers(g, f, env, '#8E8E8E', 0.28, 0.009);
      fr(g, f, noseTip(f));
      oval(g, 0, 0, 0.05, 0.034); paint(g, '#F48FB1', '#B2456E', 0.01);
      oval(g, -0.015, -0.012, 0.016, 0.009); paint(g, 'rgba(255,255,255,0.7)', null);
      // buck teeth
      fr(g, f, sp(f, 13));
      for (const s of [-1, 1]) {
        g.beginPath();
        g.roundRect ? g.roundRect(s > 0 ? 0.004 : -0.058, -0.012, 0.054, 0.085, 0.014) : g.rect(s > 0 ? 0.004 : -0.058, -0.012, 0.054, 0.085);
        paint(g, '#FFFFFF', '#9E9E9E', 0.008);
      }
    }
  },

  /* ---- Prinsesse ---- */
  {
    id: 'prinsesse', name: 'Prinsesse', bg: '#FFE6A0',
    draw(g, f, env) {
      fr(g, f, P(f, 0, -0.09, -0.05));
      g.scale(1.25, 1.25);
      const crown = () => {
        g.beginPath();
        g.moveTo(-0.3, 0.02); g.lineTo(-0.31, -0.13); g.lineTo(-0.22, -0.06); g.lineTo(-0.15, -0.21);
        g.lineTo(-0.07, -0.07); g.lineTo(0, -0.26); g.lineTo(0.07, -0.07); g.lineTo(0.15, -0.21);
        g.lineTo(0.22, -0.06); g.lineTo(0.31, -0.13); g.lineTo(0.3, 0.02); g.closePath();
      };
      g.lineJoin = 'round';
      crown(); paint(g, lin(g, 0, -0.26, 0, 0.02, ['#FFF0A8', '#FFC531', '#F2A100']), '#A8730B', 0.014);
      g.beginPath(); g.rect(-0.3, -0.035, 0.6, 0.055); paint(g, '#F5A300', '#A8730B', 0.01);
      for (const [x, y] of [[-0.31, -0.13], [-0.15, -0.21], [0, -0.26], [0.15, -0.21], [0.31, -0.13]]) { circle(g, x, y, 0.024); paint(g, '#FFFFFF', '#C9B9A0', 0.008); }
      g.beginPath(); g.moveTo(0, -0.05); g.lineTo(0.035, -0.008); g.lineTo(0, 0.034); g.lineTo(-0.035, -0.008); g.closePath(); paint(g, '#E53935', '#8E1B1B', 0.008);
      circle(g, -0.15, -0.008, 0.024); paint(g, '#1E88E5', '#0D47A1', 0.008);
      circle(g, 0.15, -0.008, 0.024); paint(g, '#43A047', '#1B5E20', 0.008);
      // moving glint
      g.save(); crown(); g.clip();
      const gx = ((env.t * 0.5) % 1.6) - 0.8;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.moveTo(gx - 0.03, 0.05); g.lineTo(gx + 0.05, -0.3); g.lineTo(gx + 0.09, -0.3); g.lineTo(gx + 0.01, 0.05); g.closePath(); g.fill();
      g.restore();
      // no rouge: a crown and sparkles, nothing that beautifies the face
      sparkleAround(f, env, 4 + 18 * openAmt(f, 0.2, 0.4), '#FFF3B0');
    }
  },

  /* ---- Drage ---- */
  {
    id: 'drage', name: 'Drage', bg: '#CBEFB3', iconOpen: 0.8,
    draw(g, f, env) {
      // crest
      for (const [y, z, s] of [[-0.36, -0.28, 0.07], [-0.24, -0.2, 0.09], [-0.12, -0.12, 0.08]]) {
        fr(g, f, P(f, 0, y, z));
        g.beginPath(); g.moveTo(-s, 0.02); g.lineTo(0, -s * 1.5); g.lineTo(s, 0.02); g.closePath();
        paint(g, '#7CB342');
      }
      // horns
      for (const side of [-1, 1]) {
        frS(g, f, P(f, side * 0.22, -0.05, -0.1), side);
        g.beginPath(); g.moveTo(-0.055, 0.01); g.quadraticCurveTo(0.0, -0.22, 0.17, -0.36); g.quadraticCurveTo(0.08, -0.17, 0.07, 0.01); g.closePath();
        paint(g, lin(g, 0, 0, 0.17, -0.36, ['#F4E9C1', '#D9C58A']), '#7A6438');
        g.strokeStyle = 'rgba(122,100,56,0.7)'; g.lineWidth = 0.01;
        for (const k of [0.25, 0.5, 0.72]) { g.beginPath(); g.moveTo(-0.05 + k * 0.12, -k * 0.28); g.lineTo(0.06 + k * 0.08, -k * 0.24); g.stroke(); }
      }
      // cheek scales
      for (const i of [50, 280]) {
        fr(g, f, sp(f, i));
        for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) {
          const x = c * 0.055 + (r ? 0.027 : 0), y = r * 0.045 - 0.02;
          g.beginPath(); g.arc(x, y, 0.03, 0, Math.PI);
          paint(g, 'rgba(129,199,132,0.45)', 'rgba(46,125,50,0.75)', 0.01);
        }
      }
      // fire / smoke
      const o = openAmt(f, 0.2, 0.45);
      if (!env.icon && env.dt) {
        if (o > 0) {
          const m = mouthC(f), d = downDir(f);
          every(f, 'fire', 170 * o, env.dt, () => {
            const a = (Math.random() - 0.5) * 0.9, c = Math.cos(a), s = Math.sin(a);
            const sp2 = f.px * (1.3 + Math.random() * 1.3);
            emit({ type: 'fire', x: m[0], y: m[1], vx: (d[0] * c - d[1] * s) * sp2, vy: (d[0] * s + d[1] * c) * sp2, life: 0, max: 0.45 + Math.random() * 0.35, r0: f.px * 0.05, r1: f.px * (0.2 + Math.random() * 0.14), drag: 1.2 });
          });
        } else {
          every(f, 'smoke', 0.8, env.dt, () => {
            for (const i of [98, 327]) {
              const p = sp(f, i);
              emit({ type: 'smoke', x: p[0], y: p[1], vx: (Math.random() - 0.5) * f.px * 0.2, vy: -f.px * 0.35, life: 0, max: 1.1, r0: f.px * 0.02, r1: f.px * 0.09 });
            }
          });
        }
      }
      if (env.icon && o > 0) {
        fr(g, f, mouthC(f));
        g.globalCompositeOperation = 'source-over';
        for (const [x, y, r, c] of [[0, 0.18, 0.17, '#FF7043'], [0, 0.12, 0.12, '#FFCA28'], [0, 0.07, 0.07, '#FFF59D']]) { oval(g, x, y, r * 0.8, r); paint(g, c, null); }
      }
    }
  },

  /* ---- Løve ---- */
  {
    id: 'loeve', name: 'Løve', bg: '#FFD18C',
    draw(g, f, env) {
      const c = P(f, 0, 0.55, 0);
      const ring = (off, r, col, phase) => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = col;
        g.beginPath();
        FACE_OVAL.forEach((i, k) => {
          const p = sp(f, i);
          let dx = p[0] - c[0], dy = p[1] - c[1];
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const rr = f.px * (r + 0.015 * Math.sin(env.t * 2 + k * 1.3 + phase));
          const x = p[0] + dx * f.px * off, y = p[1] + dy * f.px * off;
          g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
        });
        g.fill();
      };
      ring(0.2, 0.17, '#B5601A', 0);
      ring(0.11, 0.13, '#E58A2C', 1);
      for (const side of [-1, 1]) {
        fr(g, f, P(f, side * 0.36, -0.2, -0.2));
        circle(g, 0, 0, 0.1); paint(g, '#B5601A');
        circle(g, 0, 0.01, 0.055); paint(g, '#F2C38B', null);
      }
      fr(g, f, smix(f, 2, 0, 0.3));
      g.fillStyle = '#4E342E';
      for (const s of [-1, 1]) for (const [x, y] of [[0.06, 0.01], [0.1, -0.01], [0.09, 0.03]]) { circle(g, s * x, y, 0.009); g.fill(); }
      whiskers(g, f, env, 'rgba(255,248,235,0.95)', 0.26, 0.01);
      fr(g, f, smix(f, 1, 4, 0.4));
      g.beginPath(); g.moveTo(0, 0.06); g.bezierCurveTo(-0.05, 0.06, -0.09, 0, -0.085, -0.03); g.bezierCurveTo(-0.08, -0.06, 0.08, -0.06, 0.085, -0.03); g.bezierCurveTo(0.09, 0, 0.05, 0.06, 0, 0.06);
      paint(g, '#4E342E', '#2B1B12', 0.01);
      const o = openAmt(f, 0.3, 0.4);
      if (o > 0) {
        fr(g, f, mouthC(f));
        g.strokeStyle = 'rgba(255,255,255,' + 0.9 * o + ')'; g.lineWidth = 0.022; g.lineCap = 'round';
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
          const r = 0.24 + k * 0.07 + ((env.t * 0.4) % 0.07);
          g.beginPath(); g.arc(0, 0, r, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5); g.stroke();
        }
      }
    }
  },

  /* ---- Mus ---- */
  {
    id: 'mus', name: 'Mus', bg: '#DADDEA', iconOpen: 0,
    draw(g, f, env) {
      for (const side of [-1, 1]) {
        const a = spring(f, 'ear' + side, 0, { k: 160, c: 9, g: 0.6, dir: -1, lim: 0.3 });
        fr(g, f, P(f, side * 0.42, -0.06, -0.25));
        g.rotate(a);
        circle(g, 0, 0, 0.21); paint(g, '#A9ABB8');
        circle(g, side * 0.012, 0.012, 0.14); paint(g, '#F6B3C5', null);
      }
      whiskers(g, f, env, '#55555F', 0.34, 0.009);
      fr(g, f, noseTip(f));
      circle(g, 0, 0, 0.042); paint(g, '#F48FB1', '#B2456E', 0.01);
      circle(g, -0.013, -0.014, 0.012); paint(g, 'rgba(255,255,255,0.8)', null);
      fr(g, f, sp(f, 13));
      for (const s of [-1, 1]) { g.beginPath(); g.rect(s > 0 ? 0.003 : -0.04, -0.01, 0.037, 0.055); paint(g, '#FFFFFF', '#9E9E9E', 0.007); }
      const o = openAmt(f, 0.28, 0.4);
      if (o > 0) {
        fr(g, f, mouthC(f));
        g.scale(o, o);
        g.beginPath(); g.moveTo(-0.13, 0.05); g.lineTo(0.13, 0.05); g.lineTo(0.13, -0.07); g.closePath();
        paint(g, '#FFD54F', '#C98F00', 0.012);
        for (const [x, y, r] of [[0.06, 0.01, 0.018], [0.1, -0.03, 0.012], [-0.03, 0.03, 0.013]]) { circle(g, x, y, r); paint(g, '#F2B705', null); }
      }
    }
  },

  /* ---- Rumvæsen ---- */
  {
    id: 'rumvaesen', name: 'Rumvæsen', bg: '#C7F3BF', tint: [0.42, 1.0, 0.36, 0.58],
    draw(g, f, env) {
      const glow = 0.5 + 0.5 * Math.sin(env.t * 5) + f.open;
      for (const side of [-1, 1]) {
        const a = spring(f, 'ant' + side, side * 0.28 + f.grav * 0.25, { k: 40, c: 3.2, g: 1.3, dir: -1, lim: 0.9 });
        fr(g, f, P(f, side * 0.15, -0.08, -0.1));
        g.rotate(a);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(side * 0.05, -0.22, 0, -0.42); paint(g, null, '#558B2F', 0.034);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(side * 0.05, -0.22, 0, -0.42); paint(g, null, '#8BC34A', 0.02);
        const r = 0.065 * (1 + 0.12 * glow);
        const gr = g.createRadialGradient(0, -0.42, 0, 0, -0.42, r * 2.4);
        gr.addColorStop(0, 'rgba(238,255,65,' + clamp(0.35 + 0.3 * glow, 0, 1) + ')'); gr.addColorStop(1, 'rgba(118,255,3,0)');
        g.fillStyle = gr; circle(g, 0, -0.42, r * 2.4); g.fill();
        circle(g, 0, -0.42, r); paint(g, '#C6FF00', '#33691E', 0.012);
        circle(g, -r * 0.35, -0.42 - r * 0.35, r * 0.28); paint(g, 'rgba(255,255,255,0.8)', null);
      }
      // third eye that blinks
      fr(g, f, P(f, 0, 0.11, 0.06));
      const bl = (env.t % 3.2) < 0.16;
      oval(g, 0, 0, 0.078, 0.056); paint(g, '#FFFFFF', '#33691E', 0.012);
      circle(g, 0, 0, 0.036); paint(g, '#43A047', null);
      circle(g, 0, 0, 0.018); paint(g, '#111111', null);
      circle(g, -0.012, -0.012, 0.008); paint(g, '#FFFFFF', null);
      if (bl) { oval(g, 0, 0, 0.08, 0.058); paint(g, '#7CB342', '#33691E', 0.012); g.beginPath(); g.moveTo(-0.07, 0.005); g.quadraticCurveTo(0, 0.03, 0.07, 0.005); paint(g, null, '#33691E', 0.01); }
    }
  },

  /* ---- Klovn ---- */
  {
    id: 'klovn', name: 'Klovn', bg: '#FFC9C9', iconOpen: 0,
    draw(g, f, env) {
      const cols = ['#FF5252', '#FFEB3B', '#40C4FF', '#69F0AE', '#E040FB', '#FF9100'];
      for (const side of [-1, 1]) {
        frS(g, f, P(f, side * 0.5, 0.18, -0.3), side);
        const puffs = [[0, 0, 0.12], [0.05, -0.14, 0.11], [-0.02, 0.15, 0.1], [0.1, 0.06, 0.1], [0.08, -0.26, 0.085], [0.0, 0.28, 0.085]];
        puffs.forEach(([x, y, r], k) => {
          const b = 1 + 0.04 * Math.sin(env.t * 3 + k);
          circle(g, x, y, r * b); paint(g, cols[(k + (side > 0 ? 2 : 0)) % cols.length], 'rgba(43,27,18,0.6)', 0.01);
        });
      }
      // little party hat
      fr(g, f, P(f, 0.1, -0.08, -0.05));
      g.rotate(0.22);
      g.beginPath(); g.moveTo(-0.11, 0); g.lineTo(0, -0.3); g.lineTo(0.11, 0); g.closePath();
      paint(g, '#40C4FF');
      g.save(); g.beginPath(); g.moveTo(-0.11, 0); g.lineTo(0, -0.3); g.lineTo(0.11, 0); g.closePath(); g.clip();
      g.strokeStyle = '#FFEB3B'; g.lineWidth = 0.035;
      for (const y of [-0.06, -0.15, -0.24]) { g.beginPath(); g.moveTo(-0.15, y + 0.05); g.lineTo(0.15, y - 0.03); g.stroke(); }
      g.restore();
      circle(g, 0, -0.31, 0.04); paint(g, '#FF5252');
      blush(g, f, 'rgba(255,60,60,0.4)', 0.08);
      // red nose
      fr(g, f, noseTip(f));
      const gr = g.createRadialGradient(-0.03, -0.035, 0.01, 0, 0, 0.095);
      gr.addColorStop(0, '#FF8A80'); gr.addColorStop(0.5, '#E53935'); gr.addColorStop(1, '#A31515');
      circle(g, 0, 0, 0.088); paint(g, gr, '#7F0000', 0.01);
      oval(g, -0.03, -0.035, 0.025, 0.016, -0.6); paint(g, 'rgba(255,255,255,0.75)', null);
      const o = openAmt(f, 0.3, 0.4);
      if (!env.icon && env.dt && o > 0) {
        const m = mouthC(f), d = downDir(f);
        every(f, 'conf', 55 * o, env.dt, () => {
          const a = (Math.random() - 0.5) * 2.2, c = Math.cos(a), s = Math.sin(a);
          const v = f.px * (1.2 + Math.random() * 1.4);
          emit({ type: 'conf', x: m[0], y: m[1], vx: (d[0] * c - d[1] * s) * v, vy: (d[0] * s + d[1] * c) * v - f.px * 0.8, ay: f.px * 2.2, drag: 0.8, life: 0, max: 1.8, r: f.px * 0.025, rot: Math.random() * 3, vr: (Math.random() - 0.5) * 12, col: cols[(Math.random() * cols.length) | 0] });
        });
      }
    }
  },

  /* ---- Nisse ---- */
  {
    id: 'nisse', name: 'Nisse', bg: '#FFCDD2',
    draw(g, f, env) {
      // beard: fluffy circles on the jaw and chin landmarks (follows the jaw)
      g.setTransform(1, 0, 0, 1, 0, 0);
      const c = P(f, 0, 0.55, 0);
      const pts = BEARD_IDX.map(i => {
        const p = sp(f, i);
        const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
        return [p[0] + (dx / l) * f.px * 0.03, p[1] + (dy / l) * f.px * 0.03];
      });
      for (const [col, r] of [['#D9D4CF', 0.085], ['#FFFFFF', 0.07]]) {
        g.fillStyle = col; g.beginPath();
        for (const [x, y] of pts) { g.moveTo(x + f.px * r, y); g.arc(x, y, f.px * r, 0, TAU); }
        g.fill();
      }
      // moustache
      fr(g, f, smix(f, 0, 2, 0.45));
      for (const s of [-1, 1]) {
        oval(g, s * 0.085, 0.005, 0.1, 0.05, s * 0.28); paint(g, '#FFFFFF', '#CFC8C2', 0.01);
        circle(g, s * 0.17, 0.02, 0.04); paint(g, '#FFFFFF', '#CFC8C2', 0.01);
      }
      blush(g, f, 'rgba(255,80,90,0.38)', 0.08);
      // hat with a floppy tip
      const a = spring(f, 'tip', 1.15 + f.grav * 0.6, { k: 30, c: 3, g: 1.4, lim: 1.0 });
      fr(g, f, P(f, 0, -0.06, -0.12));
      const hx = 0.03, hy = -0.4;
      const tx = hx + Math.sin(a) * 0.3, ty = hy - Math.cos(a) * 0.3;
      g.beginPath();
      g.moveTo(-0.38, -0.05);
      g.quadraticCurveTo(-0.24, -0.34, hx - 0.06, hy);
      g.quadraticCurveTo(hx + 0.02, hy - 0.12, tx, ty);
      g.quadraticCurveTo(hx + 0.1, hy + 0.04, 0.2, -0.24);
      g.quadraticCurveTo(0.33, -0.12, 0.38, -0.05);
      g.closePath();
      paint(g, lin(g, -0.3, 0, 0.3, -0.3, ['#E53935', '#C62828', '#B71C1C']));
      // fluffy brim
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.rect(-0.4, -0.1, 0.8, 0.09); g.fill();
      for (let x = -0.4; x <= 0.401; x += 0.08) { circle(g, x, -0.055, 0.055); paint(g, '#FFFFFF', '#D6D0CA', 0.01); }
      g.beginPath(); g.rect(-0.4, -0.1, 0.8, 0.09); g.fill();
      circle(g, tx, ty, 0.075); paint(g, '#FFFFFF', '#D6D0CA', 0.012);
      // snow
      if (!env.icon && env.dt) {
        every(f, 'snow', 10, env.dt, () => {
          emit({ type: 'snow', x: Math.random() * env.W, y: -10, vx: 0, vy: env.H * (0.07 + Math.random() * 0.06), life: 0, max: 16, r: 2 + Math.random() * 4, seed: Math.random() * 6 });
        });
      }
    }
  },

  /* ---- Fin herre ---- */
  {
    id: 'herre', name: 'Fin herre', bg: '#DCD0CA', iconOpen: 0,
    draw(g, f, env) {
      // bow tie under the chin
      fr(g, f, sp(f, 152));
      g.translate(0, 0.15);
      g.rotate(Math.sin(env.t * 2) * 0.05);
      const bow = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.17, -0.09); g.lineTo(-0.17, 0.09); g.closePath(); g.moveTo(0, 0); g.lineTo(0.17, -0.09); g.lineTo(0.17, 0.09); g.closePath(); };
      bow(); paint(g, '#C62828');
      g.save(); bow(); g.clip(); g.fillStyle = '#FFFFFF';
      for (let x = -0.16; x <= 0.16; x += 0.06) for (let y = -0.08; y <= 0.08; y += 0.06) { circle(g, x + (Math.round(y * 50) % 2 ? 0.03 : 0), y, 0.012); g.fill(); }
      g.restore();
      g.beginPath(); g.roundRect ? g.roundRect(-0.04, -0.045, 0.08, 0.09, 0.02) : g.rect(-0.04, -0.045, 0.08, 0.09); paint(g, '#B71C1C');
      // top hat
      fr(g, f, P(f, 0, -0.09, -0.1));
      g.beginPath(); g.ellipse(0, 0, 0.42, 0.07, 0, Math.PI, TAU); paint(g, '#1C1C1C');
      g.beginPath(); g.moveTo(-0.27, 0); g.lineTo(-0.25, -0.5); g.quadraticCurveTo(0, -0.54, 0.25, -0.5); g.lineTo(0.27, 0); g.closePath();
      paint(g, lin(g, -0.27, 0, 0.27, 0, ['#3A3A3A', '#1C1C1C', '#111111']));
      g.beginPath(); g.moveTo(-0.27, -0.03); g.lineTo(-0.262, -0.12); g.lineTo(0.262, -0.12); g.lineTo(0.27, -0.03); g.closePath(); paint(g, '#7B1FA2', null);
      g.beginPath(); g.ellipse(0, 0, 0.42, 0.07, 0, 0, Math.PI); paint(g, '#1C1C1C');
      // monocle + chain
      const ec = scent(f, EYE_R);
      fr(g, f, ec);
      g.setLineDash([0.012, 0.022]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(-0.06, 0.1); g.quadraticCurveTo(-0.26, 0.5, -0.12, 0.72); paint(g, null, '#D4AF37', 0.016);
      g.setLineDash([]);
      circle(g, 0, 0, 0.115); paint(g, 'rgba(210,235,255,0.2)', '#D4AF37', 0.024);
      g.beginPath(); g.arc(0, 0, 0.085, -2.4, -1.5); paint(g, null, 'rgba(255,255,255,0.75)', 0.014);
      // moustache
      fr(g, f, smix(f, 0, 2, 0.45));
      g.translate(0, -0.02 * f.open + Math.sin(env.t * 9) * 0.004 * f.open);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -0.01);
        g.bezierCurveTo(s * 0.06, -0.05, s * 0.14, -0.04, s * 0.17, 0.0);
        g.bezierCurveTo(s * 0.2, 0.03, s * 0.25, 0.02, s * 0.26, -0.035);
        g.bezierCurveTo(s * 0.25, 0.055, s * 0.16, 0.065, s * 0.1, 0.045);
        g.bezierCurveTo(s * 0.06, 0.035, s * 0.02, 0.03, 0, 0.03);
        g.closePath();
        paint(g, '#3E2723', '#1B0F0C', 0.01);
      }
    }
  },

  /* ---- Seje briller ---- */
  {
    id: 'sej', name: 'Seje briller', bg: '#B5E5FB',
    draw(g, f, env) {
      const e1 = scent(f, EYE_R), e2 = scent(f, EYE_L);
      const c = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
      fr(g, f, c);
      let k = env.icon ? 1 : clamp(env.since / 0.7, 0, 1);
      const drop = k < 1 ? -1.4 * Math.pow(1 - k, 2) + Math.sin(k * Math.PI) * 0.04 : 0;
      g.translate(0, drop - 0.01);
      const px = 0.03, cols = SHADES[0].length;
      g.translate(-(cols * px) / 2, -0.04);
      SHADES.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          g.fillStyle = ch === 'w' ? '#FFFFFF' : '#0D0D0D';
          g.fillRect(x * px, y * px, px * 1.04, px * 1.04);
        }
      });
    }
  },

  /* ---- Sommerfugl ---- */
  {
    id: 'sommerfugl', name: 'Sommerfugl', bg: '#F7D0EF',
    draw(g, f, env) {
      const e = [scent(f, EYE_R), scent(f, EYE_L)];
      const o = P(f, 0, 0.33, 0);
      // clip away the eyes so the paint goes around them
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath();
      g.rect(-10, -10, env.W + 20, env.H + 20);
      const M = f.M;
      for (const ec of e) {
        g.save();
        g.transform(M[0], M[3], M[1], M[4], ec[0], ec[1]);
        g.moveTo(0.1, 0); g.ellipse(0, 0, 0.1, 0.06, 0, 0, TAU);
        g.restore();
      }
      g.clip('evenodd');
      for (const side of [-1, 1]) {
        frS(g, f, o, side);
        g.globalAlpha = 0.8 * f.alpha;
        g.beginPath();
        g.moveTo(0.02, -0.02);
        g.bezierCurveTo(0.08, -0.3, 0.42, -0.44, 0.52, -0.2);
        g.bezierCurveTo(0.58, -0.04, 0.44, 0.08, 0.32, 0.08);
        g.bezierCurveTo(0.2, 0.08, 0.06, 0.06, 0.02, -0.02);
        g.closePath();
        const gr = g.createRadialGradient(0.2, -0.1, 0.02, 0.25, -0.12, 0.38);
        gr.addColorStop(0, '#FFE066'); gr.addColorStop(0.45, '#FF6EC7'); gr.addColorStop(1, '#7E57FF');
        paint(g, gr, '#3B1F5C', 0.012);
        g.beginPath();
        g.moveTo(0.03, 0.09);
        g.bezierCurveTo(0.1, 0.22, 0.32, 0.36, 0.42, 0.25);
        g.bezierCurveTo(0.48, 0.16, 0.38, 0.1, 0.26, 0.11);
        g.bezierCurveTo(0.16, 0.12, 0.07, 0.1, 0.03, 0.09);
        g.closePath();
        const gr2 = g.createRadialGradient(0.2, 0.18, 0.02, 0.22, 0.2, 0.25);
        gr2.addColorStop(0, '#9CF6FB'); gr2.addColorStop(1, '#3FA7FF');
        paint(g, gr2, '#3B1F5C', 0.012);
        g.globalAlpha = 0.9 * f.alpha;
        for (const [x, y, r] of [[0.46, -0.2, 0.02], [0.4, -0.3, 0.016], [0.3, -0.34, 0.014], [0.38, 0.22, 0.016], [0.3, 0.27, 0.012]]) { circle(g, x, y, r); paint(g, '#FFFFFF', null); }
        g.globalAlpha = f.alpha;
      }
      g.restore();
      // body + antennae
      fr(g, f, o);
      oval(g, 0, -0.03, 0.026, 0.12); paint(g, '#3B1F5C', null);
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(0, -0.14); g.quadraticCurveTo(s * 0.02, -0.28, s * 0.09, -0.32); paint(g, null, '#3B1F5C', 0.014);
        circle(g, s * 0.095, -0.325, 0.016); paint(g, '#3B1F5C', null);
      }
      // two small butterflies fluttering around
      for (let k = 0; k < 2; k++) {
        const t = env.t + k * 3.1;
        const p = P(f, Math.cos(t * 0.9 + k * Math.PI) * 0.78, 0.3 + Math.sin(t * 1.3 + k) * 0.5, 0);
        fr(g, f, p);
        g.rotate(Math.sin(t * 2) * 0.4);
        const flap = 0.25 + 0.75 * Math.abs(Math.sin(t * 11));
        for (const s of [-1, 1]) {
          g.save(); g.scale(s * flap, 1);
          oval(g, 0.045, -0.025, 0.05, 0.035, -0.4); paint(g, k ? '#FFB300' : '#29B6F6', '#3B1F5C', 0.008);
          oval(g, 0.035, 0.03, 0.032, 0.024, 0.4); paint(g, k ? '#FF7043' : '#7E57FF', '#3B1F5C', 0.008);
          g.restore();
        }
        oval(g, 0, 0, 0.01, 0.04); paint(g, '#3B1F5C', null);
      }
    }
  }
];

// beard landmarks: below the lower lip and along the lower jaw
const BEARD_IDX = (() => {
  const out = [];
  for (let i = 0; i < NL; i++) {
    const x = CANON[3 * i], y = CANON[3 * i + 1];
    if ((y > 0.95 && Math.abs(x) < 0.43) || (y > 0.66 && Math.abs(x) > 0.4)) out.push(i);
  }
  return out;
})();

// 8-bit sunglasses, one character per pixel
const SHADES = (() => {
  const lens = ['############', '#ww#########', '#w##########', '.##########.', '..########..'];
  const rows = lens.map((r, i) => (i === 0 ? '##' + r + '####' + r + '##' : '..' + r + '....' + r + '..'));
  return rows;
})();


/* ==========================================================================
   Overlays for the "fjolleansigter" row (they can be combined with a costume)
   ========================================================================== */
function rgbCss(c, k = 1) { return 'rgb(' + c.map(v => clamp(Math.round(v * k), 0, 255)).join(',') + ')'; }

// big, sparkly cartoon eyes on top of the real eyes; they blink when the child blinks
function drawToonEyes(g, f, env) {
  for (const [idx, side, open] of [[EYE_R, -1, f.eyeOpenR], [EYE_L, 1, f.eyeOpenL]]) {
    frS(g, f, scent(f, idx), side);
    const closed = !f.icon && open !== undefined && open < 0.12;
    g.lineCap = 'round';
    if (closed) {
      g.beginPath(); g.moveTo(-0.13, -0.01); g.quadraticCurveTo(0, 0.07, 0.13, -0.01); paint(g, null, LINE, 0.024);
    } else {
      oval(g, 0, -0.01, 0.13, 0.15); paint(g, '#FFFFFF', LINE, 0.022);
      const gr = g.createRadialGradient(-0.02, -0.01, 0.01, 0, 0.02, 0.1);
      gr.addColorStop(0, '#9BE0FF'); gr.addColorStop(0.55, '#3A7BE0'); gr.addColorStop(1, '#1B2B78');
      circle(g, 0, 0.02, 0.092); paint(g, gr, null);
      circle(g, 0, 0.02, 0.048); paint(g, '#0C0C16', null);
      circle(g, -0.034, -0.022, 0.03); paint(g, '#FFFFFF', null);
      circle(g, 0.03, 0.055, 0.014); paint(g, '#FFFFFF', null);
    }
    for (let k = 0; k < 3; k++) {
      const a = -0.12 - k * 0.36;
      const x0 = Math.cos(a) * 0.13, y0 = -0.01 + Math.sin(a) * 0.15;
      g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + 0.03, y0 - 0.02, x0 + 0.05 + (2 - k) * 0.01, y0 - 0.05);
      paint(g, null, LINE, 0.02);
    }
  }
}

// googly eyes whose pupils roll around when the head moves
function drawGooglyEyes(g, f, env) {
  const R = 0.135, pr = 0.066, travel = R - pr - 0.012;
  if (!f.mem.goog) f.mem.goog = [{ x: 0, y: travel, vx: 0, vy: 0 }, { x: 0, y: travel, vx: 0, vy: 0 }];
  const dt = Math.min(f.dt || 0, 0.05);
  [EYE_R, EYE_L].forEach((idx, k) => {
    const p = f.mem.goog[k];
    if (dt > 0) {
      const ax = f.gravX * 3.4 - f.accX * 0.4, ay = f.gravY * 3.4 - f.accY * 0.4;
      p.vx += ax * dt; p.vy += ay * dt;
      const d = Math.exp(-1.8 * dt); p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const l = Math.hypot(p.x, p.y);
      if (l > travel) {
        const nx = p.x / l, ny = p.y / l;
        p.x = nx * travel; p.y = ny * travel;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) { p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny; }
      }
    }
    fr(g, f, scent(f, idx));
    circle(g, 0, 0, R); paint(g, '#FFFFFF', LINE, 0.018);
    g.beginPath(); g.arc(0, 0, R * 0.8, 0.4, 1.6); paint(g, null, 'rgba(0,0,0,0.08)', 0.03);
    circle(g, p.x, p.y, pr); paint(g, '#121212', null);
    circle(g, p.x - pr * 0.35, p.y - pr * 0.38, pr * 0.26); paint(g, 'rgba(255,255,255,0.9)', null);
  });
}

// big ears in the child's own skin colour, flapping a little
function drawBigEars(g, f, env) {
  const base = f.skinRGB || (f.icon ? [255, 206, 69] : [236, 190, 160]);
  for (const side of [-1, 1]) {
    const a = spring(f, 'bigear' + side, 0, { k: 60, c: 4, g: 1.1, dir: -1, lim: 0.45 }) + Math.sin(env.t * 2.6 + side) * 0.05;
    frS(g, f, sp(f, side < 0 ? 234 : 454), side);
    g.translate(-0.03, 0);
    g.rotate(a);
    g.beginPath();
    g.moveTo(0.0, -0.22);
    g.bezierCurveTo(0.17, -0.44, 0.45, -0.32, 0.43, -0.04);
    g.bezierCurveTo(0.42, 0.17, 0.28, 0.28, 0.17, 0.36);
    g.bezierCurveTo(0.08, 0.41, -0.01, 0.37, 0.0, 0.24);
    g.closePath();
    paint(g, rgbCss(base), rgbCss(base, 0.6), 0.016);
    g.beginPath();
    g.moveTo(0.07, -0.16);
    g.bezierCurveTo(0.19, -0.31, 0.37, -0.22, 0.35, -0.02);
    g.bezierCurveTo(0.34, 0.13, 0.24, 0.22, 0.15, 0.26);
    g.bezierCurveTo(0.22, 0.13, 0.24, -0.05, 0.13, -0.09);
    g.closePath();
    paint(g, rgbCss(base, 0.82), null);
    oval(g, 0.13, 0.05, 0.065, 0.085, 0.2); paint(g, rgbCss(base, 0.68), null);
  }
}

(() => {
  const set = (id, fn) => { const w = WARPS.find(x => x.id === id); if (w) w.draw = fn; };
  set('tegneoejne', drawToonEyes);
  set('rulleoejne', drawGooglyEyes);
  set('oerer', drawBigEars);
})();
