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

const COSTUMES = [
  { id: 'ingen', name: 'Normal', bg: '#E9E6F5', draw() {} },

  /* ---- Enhjørning: hele forvandlingen ---- */
  {
    id: 'enhjoerning', name: 'Enhjørning', bg: '#E5D4FF', iconOpen: 0.75, tint: [1.0, 0.86, 0.97, 0.4],
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
      // long eyelashes on the outer upper lids
      g.lineCap = 'round';
      for (const [pts, side] of [[[33, 246, 161, 160], -1], [[263, 466, 388, 387], 1]]) {
        pts.forEach((i, k) => {
          fr(g, f, sp(f, i));
          const len = 0.07 - k * 0.01;
          g.beginPath(); g.moveTo(0, 0);
          g.quadraticCurveTo(side * 0.012, -len * 0.7, side * (0.03 + 0.012 * (3 - k)), -len);
          paint(g, null, '#3B2416', 0.014);
        });
      }
      blush(g, f, 'rgba(255,120,185,0.34)');
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
      blush(g, f, 'rgba(255,110,150,0.35)');
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
