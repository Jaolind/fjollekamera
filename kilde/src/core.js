'use strict';
/* ==========================================================================
   Fjollekameraet – kerne: geometri, ansigtssporing, forvrængning, WebGL
   ========================================================================== */

const NL = 468;
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
// Landmarks that barely move with expressions: used to fit the head pose.
const FIT_IDX = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 2, 98, 327, 129, 358, 109, 338, 67, 297, 103, 332, 54, 284, 21, 251, 127, 356, 234, 454, 116, 345, 50, 280, 33, 133, 263, 362, 130, 359, 243, 463];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ---------- head pose fit: screen = M * canonical + T (least squares) ---------- */
const FIT_PINV = (() => {
  const n = FIT_IDX.length;
  const A = FIT_IDX.map(i => [CANON[3 * i], CANON[3 * i + 1], CANON[3 * i + 2], 1]);
  const AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const r of A) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) AtA[a][b] += r[a] * r[b];
  // invert 4x4 (Gauss-Jordan)
  const m = AtA.map((r, i) => r.concat([0, 0, 0, 0].map((_, j) => (i === j ? 1 : 0))));
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 8; j++) m[c][j] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = m[r][c]; for (let j = 0; j < 8; j++) m[r][j] -= f * m[c][j]; }
  }
  const inv = m.map(r => r.slice(4));
  const P = new Float64Array(4 * n);
  for (let a = 0; a < 4; a++) for (let k = 0; k < n; k++) {
    let s = 0;
    for (let b = 0; b < 4; b++) s += inv[a][b] * A[k][b];
    P[a * n + k] = s;
  }
  return P;
})();

function fitPose(S, M, T) {
  const n = FIT_IDX.length;
  const rx = [0, 0, 0, 0], ry = [0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    const i = FIT_IDX[k], x = S[2 * i], y = S[2 * i + 1];
    for (let a = 0; a < 4; a++) { const p = FIT_PINV[a * n + k]; rx[a] += p * x; ry[a] += p * y; }
  }
  M[0] = rx[0]; M[1] = rx[1]; M[2] = rx[2]; T[0] = rx[3];
  M[3] = ry[0]; M[4] = ry[1]; M[5] = ry[2]; T[1] = ry[3];
}

/* ---------- warps (shared math with the shader) ---------- */
// A warp maps an output position to the position it samples from (inverse map).
function warpPoint(w, x, y) {
  const dx = x - w.cx, dy = y - w.cy;
  const lx = dx * w.ax + dy * w.ay, ly = -dx * w.ay + dy * w.ax;
  const t2 = (lx * lx) / (w.rx * w.rx) + (ly * ly) / (w.ry * w.ry);
  if (t2 >= 1) return [x, y];
  let f = 1 - t2; f *= f;
  let nx = lx, ny = ly;
  if (w.type === 0) { nx = lx * (1 - w.kx * f); ny = ly * (1 - w.ky * f); }
  else if (w.type === 1) { const a = w.kx * f, c = Math.cos(a), s = Math.sin(a); nx = lx * c - ly * s; ny = lx * s + ly * c; }
  else if (w.type === 2) { nx = lx + Math.sin(ly * w.fr + w.ph) * w.kx * f; ny = ly + Math.sin(lx * w.fr * 0.8 + w.ph * 1.3) * w.ky * f; }
  else { nx = lx - w.kx * f; ny = ly - w.ky * f; }
  return [w.cx + nx * w.ax - ny * w.ay, w.cy + nx * w.ay + ny * w.ax];
}

function inRegion(w, x, y) {
  const dx = x - w.cx, dy = y - w.cy;
  const lx = dx * w.ax + dy * w.ay, ly = -dx * w.ay + dy * w.ax;
  return (lx * lx) / (w.rx * w.rx) + (ly * ly) / (w.ry * w.ry) < 1;
}

// Where does source point (qx,qy) end up on screen? Solve warpPoint(p) = q (Newton).
function unwarpPoint(w, qx, qy) {
  if (!inRegion(w, qx, qy)) return [qx, qy];
  let px = qx, py = qy;
  const h = 0.5;
  for (let it = 0; it < 7; it++) {
    const [fx, fy] = warpPoint(w, px, py);
    const rx = fx - qx, ry = fy - qy;
    if (rx * rx + ry * ry < 0.01) return [px, py];
    const [ax, ay] = warpPoint(w, px + h, py);
    const [bx, by] = warpPoint(w, px, py + h);
    const j00 = (ax - fx) / h, j10 = (ay - fy) / h, j01 = (bx - fx) / h, j11 = (by - fy) / h;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-6) break;
    let sx = (j11 * rx - j01 * ry) / det, sy = (-j10 * rx + j00 * ry) / det;
    const lim = Math.max(w.rx, w.ry) * 0.35, len = Math.hypot(sx, sy);
    if (len > lim) { sx *= lim / len; sy *= lim / len; }
    px -= sx; py -= sy;
  }
  const [fx, fy] = warpPoint(w, px, py);
  return (fx - qx) ** 2 + (fy - qy) ** 2 < 9 ? [px, py] : [qx, qy];
}

function unwarpAll(warps, x, y) {
  for (let i = warps.length - 1; i >= 0; i--) [x, y] = unwarpPoint(warps[i], x, y);
  return [x, y];
}

function mkWarp(f, c, rx, ry, kx, ky, type = 0, fr = 0, ph = 0) {
  return { cx: c[0], cy: c[1], rx: Math.max(1, rx), ry: Math.max(1, ry), kx, ky, ax: f.ax, ay: f.ay, type, fr, ph };
}

/* ---------- tracked faces ---------- */
let faceSeq = 0;
class Face {
  constructor() {
    this.id = ++faceSeq;
    this.lm = new Float32Array(NL * 3);
    this.S = new Float32Array(NL * 2);
    this.M = [1, 0, 0, 0, 1, 0];
    this.T = [0, 0];
    this.springs = Object.create(null);
    this.mem = Object.create(null);
    this.alpha = 0;
    this.seen = 0;
    this.open = 0;
    this.U = 100;
    this.px = 100;
    this.grav = 0;
    this.accX = 0;
    this.prevC = null;
    this.vel = [0, 0];
    this.accS = [0, 0];
    this.t = 0;
    this.dt = 0;
  }
}

function width3(L) {
  const dx = L[3 * 454] - L[3 * 234], dy = L[3 * 454 + 1] - L[3 * 234 + 1], dz = L[3 * 454 + 2] - L[3 * 234 + 2];
  return Math.hypot(dx, dy, dz) || 1;
}
function centroidV(L, idx) {
  let x = 0, y = 0;
  for (const i of idx) { x += L[3 * i]; y += L[3 * i + 1]; }
  return [x / idx.length, y / idx.length];
}
const vp = (L, i) => [L[3 * i], L[3 * i + 1]];
const vdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const vmix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// geometry in camera-image pixels, used for the warps
function deriveVideo(f) {
  const L = f.lm;
  f.U = width3(L);
  f.eyeR = centroidV(L, EYE_R);
  f.eyeL = centroidV(L, EYE_L);
  const ax = f.eyeL[0] - f.eyeR[0], ay = f.eyeL[1] - f.eyeR[1];
  const n = Math.hypot(ax, ay) || 1;
  f.ax = ax / n; f.ay = ay / n; f.iod = n;
  f.mouth = vmix(vp(L, 13), vp(L, 14), 0.5);
  f.mouthW = vdist(vp(L, 61), vp(L, 291)) || 1;
  f.gap = vdist(vp(L, 13), vp(L, 14));
  f.nose = vmix(vp(L, 4), vp(L, 1), 0.5);
  f.top = vp(L, 10);
  f.chin = vp(L, 152);
  f.bridge = vp(L, 168);
  f.center = vmix(vp(L, 168), vp(L, 2), 0.55);
  const ratio = f.gap / f.mouthW;
  f.openTarget = clamp((ratio - 0.1) / 0.42, 0, 1);
}

function smoothInto(f, d, U) {
  const dx = d[3] - f.lm[3], dy = d[4] - f.lm[4];
  const speed = Math.hypot(dx, dy) / U;
  const a = clamp(0.42 + speed * 9, 0.42, 1);
  for (let k = 0; k < NL * 3; k++) f.lm[k] += (d[k] - f.lm[k]) * a;
}

/* ---------- warp presets ("fjolleansigter") ---------- */
const WARPS = [
  { id: 'ingen', name: 'Normal', fn: null },
  {
    id: 'oejne', name: 'Kæmpeøjne', fn(f, t, out) {
      const r = f.iod * 0.56;
      out.push(mkWarp(f, f.eyeR, r, r * 0.88, 0.66, 0.66));
      out.push(mkWarp(f, f.eyeL, r, r * 0.88, 0.66, 0.66));
    }
  },
  {
    id: 'mund', name: 'Kæmpemund', fn(f, t, out) {
      out.push(mkWarp(f, f.mouth, f.mouthW * 1.05, f.mouthW * 0.78 + f.gap * 0.8, 0.68, 0.68));
    }
  },
  {
    id: 'naese', name: 'Kæmpenæse', fn(f, t, out) {
      out.push(mkWarp(f, f.nose, f.U * 0.31, f.U * 0.31, 0.7, 0.7));
    }
  },
  {
    id: 'baby', name: 'Babyansigt', fn(f, t, out) {
      const r = f.iod * 0.54;
      out.push(mkWarp(f, f.eyeR, r, r * 0.88, 0.6, 0.6));
      out.push(mkWarp(f, f.eyeL, r, r * 0.88, 0.6, 0.6));
      out.push(mkWarp(f, f.mouth, f.mouthW * 0.9, f.mouthW * 0.62 + f.gap, -0.8, -0.8));
      out.push(mkWarp(f, f.nose, f.U * 0.18, f.U * 0.18, -0.6, -0.6));
    }
  },
  {
    id: 'lille', name: 'Lillebitte', fn(f, t, out) {
      out.push(mkWarp(f, f.center, f.U * 0.92, f.U * 1.08, -1.05, -1.05));
    }
  },
  {
    id: 'ballon', name: 'Ballonhoved', fn(f, t, out) {
      const c = vmix(f.top, f.bridge, 0.25);
      out.push(mkWarp(f, c, f.U * 0.86, f.U * 0.8, 0.5, 0.5));
    }
  },
  {
    id: 'trold', name: 'Trold', fn(f, t, out) {
      const r = f.iod * 0.42;
      out.push(mkWarp(f, f.eyeR, r, r * 0.85, -0.7, -0.7));
      out.push(mkWarp(f, f.eyeL, r, r * 0.85, -0.7, -0.7));
      out.push(mkWarp(f, f.nose, f.U * 0.27, f.U * 0.27, 0.6, 0.6));
      out.push(mkWarp(f, f.mouth, f.mouthW * 1.15, f.mouthW * 0.7 + f.gap, 0.5, 0.18));
    }
  },
  {
    id: 'lang', name: 'Langt ansigt', fn(f, t, out) {
      out.push(mkWarp(f, f.center, f.U * 0.78, f.U * 1.12, -0.38, 0.42));
    }
  },
  {
    id: 'pandekage', name: 'Pandekage', fn(f, t, out) {
      out.push(mkWarp(f, f.center, f.U * 0.86, f.U * 0.95, 0.4, -0.5));
    }
  },
  {
    id: 'snurre', name: 'Snurretop', fn(f, t, out) {
      out.push(mkWarp(f, f.center, f.U * 0.9, f.U * 0.9, Math.sin(t * 1.7) * 1.7, 0, 1));
    }
  },
  {
    id: 'gele', name: 'Gele', fn(f, t, out) {
      out.push(mkWarp(f, f.center, f.U * 0.85, f.U * 1.0, f.U * 0.055, f.U * 0.035, 2, TAU / (f.U * 0.38), t * 7));
    }
  },
  {
    id: 'spejl', name: 'Spejlansigt', sym: true, fn(f, t, out) {
      out.sym = [f.bridge[0], f.bridge[1], f.ax, f.ay];
    }
  }
];

/* ---------- WebGL renderer ---------- */
const MAXW = 12;
const VS = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';
const FS = (prec) => `precision ${prec} float;
uniform sampler2D uTex;uniform sampler2D uMask;
uniform vec2 uCanvas;uniform vec2 uVideo;uniform vec2 uOffset;uniform float uScale;uniform float uMirror;
uniform int uCount;uniform vec4 uW0[${MAXW}];uniform vec4 uW1[${MAXW}];uniform vec4 uW2[${MAXW}];
uniform vec4 uSym;uniform float uSymOn;uniform vec4 uTint;
vec2 warp1(vec2 v,vec4 w0,vec4 w1,vec4 w2){
  vec2 a=w1.zw;vec2 b=vec2(-a.y,a.x);vec2 d=v-w0.xy;
  float lx=dot(d,a);float ly=dot(d,b);
  float t2=lx*lx/(w0.z*w0.z)+ly*ly/(w0.w*w0.w);
  if(t2>=1.0)return v;
  float f=1.0-t2;f*=f;
  float nx=lx;float ny=ly;
  if(w2.x<0.5){nx=lx*(1.0-w1.x*f);ny=ly*(1.0-w1.y*f);}
  else if(w2.x<1.5){float an=w1.x*f;float c=cos(an);float s=sin(an);nx=lx*c-ly*s;ny=lx*s+ly*c;}
  else if(w2.x<2.5){nx=lx+sin(ly*w2.y+w2.z)*w1.x*f;ny=ly+sin(lx*w2.y*0.8+w2.z*1.3)*w1.y*f;}
  else{nx=lx-w1.x*f;ny=ly-w1.y*f;}
  return w0.xy+nx*a+ny*b;
}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uCanvas.y-gl_FragCoord.y);
  if(uMirror>0.5)p.x=uCanvas.x-p.x;
  vec2 v=(p-uOffset)/uScale;
  if(uSymOn>0.5){float s=dot(v-uSym.xy,uSym.zw);if(s>0.0)v-=2.0*s*uSym.zw;}
  for(int i=0;i<${MAXW};i++){if(i>=uCount)break;v=warp1(v,uW0[i],uW1[i],uW2[i]);}
  vec2 uv=clamp(v/uVideo,vec2(0.0),vec2(1.0));
  vec4 col=texture2D(uTex,uv);
  float m=texture2D(uMask,uv).a*uTint.a;
  if(m>0.002){float l=dot(col.rgb,vec3(0.299,0.587,0.114));col.rgb=mix(col.rgb,uTint.rgb*(0.22+1.1*l),m);}
  gl_FragColor=vec4(col.rgb,1.0);
}`;

class Renderer {
  constructor(canvas) {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('webgl');
    this.gl = gl;
    this.canvas = canvas;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS(prec)));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.prog = p;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uTex', 'uMask', 'uCanvas', 'uVideo', 'uOffset', 'uScale', 'uMirror', 'uCount', 'uW0', 'uW1', 'uW2', 'uSym', 'uSymOn', 'uTint'])
      this.u[n] = gl.getUniformLocation(p, n);
    const mkTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 22, 40, 255]));
      return t;
    };
    this.tex = [mkTex(), mkTex()];
    this.cur = 0;
    this.hasFrame = false;
    this.texMask = mkTex();
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.w0 = new Float32Array(MAXW * 4);
    this.w1 = new Float32Array(MAXW * 4);
    this.w2 = new Float32Array(MAXW * 4);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1i(this.u.uMask, 1);
  }
  upload(slot, src) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      return true;
    } catch (e) { return false; }
  }
  // live: upload straight into the shown texture
  uploadShown(src) { if (this.upload(this.cur, src)) this.hasFrame = true; }
  // synced: upload into the other texture, show it once the face results for it arrive
  uploadPending(src) { return this.upload(1 - this.cur, src); }
  swap() { this.cur = 1 - this.cur; this.hasFrame = true; }
  updateMask(faces, vw, vh) {
    const mc = this.maskCanvas, g = this.maskCtx;
    const W = 192, H = Math.max(8, Math.round(192 * vh / vw));
    if (mc.width !== W || mc.height !== H) { mc.width = W; mc.height = H; }
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    const sx = W / vw, sy = H / vh;
    for (const f of faces) {
      g.globalAlpha = f.alpha;
      g.beginPath();
      FACE_OVAL.forEach((i, k) => {
        // pull the outline in a touch so the tint does not spill onto hair
        const x = lerp(f.lm[3 * i], f.center[0], 0.04) * sx, y = lerp(f.lm[3 * i + 1], f.center[1], 0.04) * sy;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);
    gl.activeTexture(gl.TEXTURE0);
  }
  clearMask() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.activeTexture(gl.TEXTURE0);
  }
  draw(view, warps, sym, tint) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.hasFrame) { gl.clearColor(0.09, 0.086, 0.157, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(u.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uVideo, view.vw, view.vh);
    gl.uniform2f(u.uOffset, view.ox, view.oy);
    gl.uniform1f(u.uScale, view.s);
    gl.uniform1f(u.uMirror, view.mirror ? 1 : 0);
    const n = Math.min(MAXW, warps.length);
    for (let i = 0; i < n; i++) {
      const w = warps[i];
      this.w0.set([w.cx, w.cy, w.rx, w.ry], i * 4);
      this.w1.set([w.kx, w.ky, w.ax, w.ay], i * 4);
      this.w2.set([w.type, w.fr, w.ph, 0], i * 4);
    }
    gl.uniform1i(u.uCount, n);
    gl.uniform4fv(u.uW0, this.w0);
    gl.uniform4fv(u.uW1, this.w1);
    gl.uniform4fv(u.uW2, this.w2);
    if (sym) { gl.uniform4f(u.uSym, sym[0], sym[1], sym[2], sym[3]); gl.uniform1f(u.uSymOn, 1); }
    else gl.uniform1f(u.uSymOn, 0);
    if (tint) gl.uniform4f(u.uTint, tint[0], tint[1], tint[2], tint[3]);
    else gl.uniform4f(u.uTint, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* ---------- CPU version of the warp, for the menu icons ---------- */
function warpCanvas(src, warps, sym) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const sd = sctx.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const od = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let vx = x + 0.5, vy = y + 0.5;
    if (sym) { const s = (vx - sym[0]) * sym[2] + (vy - sym[1]) * sym[3]; if (s > 0) { vx -= 2 * s * sym[2]; vy -= 2 * s * sym[3]; } }
    for (const wp of warps) [vx, vy] = warpPoint(wp, vx, vy);
    const fx = clamp(vx - 0.5, 0, w - 1.001), fy = clamp(vy - 0.5, 0, h - 1.001);
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
    const o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) {
      const i00 = (y0 * w + x0) * 4 + c, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
      od.data[o + c] = (sd[i00] * (1 - ax) + sd[i10] * ax) * (1 - ay) + (sd[i01] * (1 - ax) + sd[i11] * ax) * ay;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}
