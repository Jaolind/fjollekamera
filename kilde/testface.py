"""Render a synthetic test face from MediaPipe's canonical face model.

Used only to test the app in a headless browser (fake camera). No real person.
Usage: python3 testface.py out_dir [--frames N] [--size WxH]
"""
import sys, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OBJ = os.path.join(os.path.dirname(__file__), 'canonical_face_model.obj')

def load():
    V, VT, F = [], [], []
    for line in open(OBJ):
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            V.append([float(x) for x in p[1:4]])
        elif p[0] == 'vt':
            VT.append([float(x) for x in p[1:3]])
        elif p[0] == 'f':
            F.append([[int(a) - 1 for a in t.split('/')[:2]] for t in p[1:4]])
    V = np.array(V); VT = np.array(VT); F = np.array(F)
    vuv = np.zeros((len(V), 2))
    for f in F:
        for v, t in f:
            vuv[v] = VT[t]
    return V, VT, F, vuv

V0, VT, F, VUV = load()
TRI_V = F[:, :, 0]
TRI_T = F[:, :, 1]

EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

TEX = 1024

def paint_texture():
    img = Image.new('RGB', (TEX, TEX), (226, 178, 148))
    d = ImageDraw.Draw(img)
    def uvpts(idx):
        return [(VUV[i][0] * (TEX - 1), (1 - VUV[i][1]) * (TEX - 1)) for i in idx]
    # subtle cheek colour
    for c in (50, 280):
        u, v = VUV[c]
        x, y = u * TEX, (1 - v) * TEX
        d.ellipse([x - 45, y - 30, x + 45, y + 30], fill=(232, 166, 142))
    img = img.filter(ImageFilter.GaussianBlur(18))
    d = ImageDraw.Draw(img)
    for loop in (BROW_R, BROW_L):
        d.polygon(uvpts(loop), fill=(70, 45, 30))
    d.polygon(uvpts(LIPS_OUT), fill=(190, 92, 96))
    d.line(uvpts(LIPS_IN) + uvpts(LIPS_IN)[:1], fill=(120, 40, 45), width=4)
    for loop in (EYE_R, EYE_L):
        pts = uvpts(loop)
        d.polygon(pts, fill=(245, 242, 238))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        h = (max(ys) - min(ys))
        r = h * 0.55
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(92, 64, 40))
        r2 = r * 0.5
        d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(15, 10, 8))
        d.ellipse([cx - r2 * 0.9 + r * 0.25, cy - r * 0.55, cx - r2 * 0.9 + r * 0.25 + r * 0.35, cy - r * 0.2], fill=(255, 255, 255))
        d.line(pts + pts[:1], fill=(50, 32, 25), width=5)
    for n in (98, 327):
        u, v = VUV[n]
        x, y = u * TEX, (1 - v) * TEX
        d.ellipse([x - 9, y - 5, x + 9, y + 5], fill=(120, 70, 60))
    return np.asarray(img).astype(np.float32) / 255.0

TEXARR = paint_texture()

def rot(yaw, pitch, roll):
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def deform(open_cm):
    V = V0.copy()
    y13, y14 = V0[13, 1], V0[14, 1]
    w = smoothstep(y13, y14, V[:, 1]) * (1 - 0.6 * smoothstep(3, 7.6, np.abs(V[:, 0])))
    V[:, 1] -= open_cm * w
    V[:, 2] -= open_cm * 0.25 * w
    return V

def vertex_normals(V):
    n = np.cross(V[TRI_V[:, 1]] - V[TRI_V[:, 0]], V[TRI_V[:, 2]] - V[TRI_V[:, 0]])
    vn = np.zeros_like(V)
    for k in range(3):
        np.add.at(vn, TRI_V[:, k], n)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-9
    return vn

def render(W, H, yaw=0.0, pitch=0.0, roll=0.0, open_cm=0.0, scale=None, cx=None, cy=None):
    scale = scale or W * 0.024
    cx = W / 2 if cx is None else cx
    cy = H * 0.47 if cy is None else cy
    V = deform(open_cm)
    R = rot(yaw, pitch, roll)
    Vr = V @ R.T
    N = vertex_normals(V) @ R.T
    P = np.stack([cx + scale * Vr[:, 0], cy - scale * Vr[:, 1]], axis=1)
    Z = Vr[:, 2]
    # background
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 3), np.float32)
    img[:] = np.array([0.80, 0.84, 0.88])
    img *= (0.85 + 0.15 * (1 - yy / H))[..., None]
    pil = Image.fromarray((img * 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    def proj(p):
        q = R @ np.array(p)
        return (cx + scale * q[0], cy - scale * q[1])
    # shoulders + neck
    sx, sy = proj((0, -16, -4))
    d.ellipse([sx - scale * 17, sy - scale * 4, sx + scale * 17, sy + scale * 14], fill=(60, 110, 170))
    nx, ny = proj((0, -11, -4))
    d.rectangle([nx - scale * 4.2, ny - scale * 5, nx + scale * 4.2, ny + scale * 4], fill=(205, 155, 125))
    # hair (behind the face)
    hx, hy = proj((0, 4.0, -4.5))
    d.ellipse([hx - scale * 9.4, hy - scale * 9.0, hx + scale * 9.4, hy + scale * 8.5], fill=(62, 40, 28))
    # mouth interior
    if open_cm > 0.05:
        d.polygon([tuple(P[i]) for i in LIPS_IN], fill=(70, 18, 22))
    img = np.asarray(pil).astype(np.float32) / 255.0
    zbuf = np.full((H, W), -1e9, np.float32)
    L = np.array([-0.35, 0.45, 1.0]); L /= np.linalg.norm(L)
    shade_v = 0.42 + 0.72 * np.clip(N @ L, 0, 1)
    out = img.copy()
    for t in range(len(TRI_V)):
        vi = TRI_V[t]
        # backface cull (normal z after rotation)
        a, b, c = Vr[vi[0]], Vr[vi[1]], Vr[vi[2]]
        nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if nz <= 0:
            continue
        p0, p1, p2 = P[vi[0]], P[vi[1]], P[vi[2]]
        xmin = int(max(0, math.floor(min(p0[0], p1[0], p2[0]))))
        xmax = int(min(W - 1, math.ceil(max(p0[0], p1[0], p2[0]))))
        ymin = int(max(0, math.floor(min(p0[1], p1[1], p2[1]))))
        ymax = int(min(H - 1, math.ceil(max(p0[1], p1[1], p2[1]))))
        if xmax < xmin or ymax < ymin:
            continue
        gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
        den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(den) < 1e-9:
            continue
        w0 = ((p1[1] - p2[1]) * (gx - p2[0]) + (p2[0] - p1[0]) * (gy - p2[1])) / den
        w1 = ((p2[1] - p0[1]) * (gx - p2[0]) + (p0[0] - p2[0]) * (gy - p2[1])) / den
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not m.any():
            continue
        z = w0 * Z[vi[0]] + w1 * Z[vi[1]] + w2 * Z[vi[2]]
        zb = zbuf[ymin:ymax + 1, xmin:xmax + 1]
        m &= z > zb
        if not m.any():
            continue
        ti = TRI_T[t]
        uv = (w0[..., None] * VT[ti[0]] + w1[..., None] * VT[ti[1]] + w2[..., None] * VT[ti[2]])
        u = np.clip(uv[..., 0] * (TEX - 1), 0, TEX - 1).astype(int)
        v = np.clip((1 - uv[..., 1]) * (TEX - 1), 0, TEX - 1).astype(int)
        col = TEXARR[v, u]
        sh = w0 * shade_v[vi[0]] + w1 * shade_v[vi[1]] + w2 * shade_v[vi[2]]
        col = col * sh[..., None]
        region = out[ymin:ymax + 1, xmin:xmax + 1]
        region[m] = col[m]
        zb[m] = z[m]
    out = np.clip(out, 0, 1)
    im = Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    return im

if __name__ == '__main__':
    out_dir = sys.argv[1] if len(sys.argv) > 1 else 'frames'
    nframes = 1
    W, H = 720, 960
    args = sys.argv[2:]
    if '--frames' in args:
        nframes = int(args[args.index('--frames') + 1])
    if '--size' in args:
        W, H = [int(x) for x in args[args.index('--size') + 1].split('x')]
    os.makedirs(out_dir, exist_ok=True)
    for i in range(nframes):
        ph = i / max(1, nframes)
        yaw = math.sin(ph * 2 * math.pi) * 0.30
        roll = math.sin(ph * 4 * math.pi + 0.5) * 0.14
        pitch = math.sin(ph * 2 * math.pi + 1.2) * 0.08
        open_cm = max(0.0, math.sin(ph * 2 * math.pi * 2 - 0.6)) * 1.6
        if nframes == 1:
            yaw = roll = pitch = 0.0
            open_cm = 0.0
        im = render(W, H, yaw, pitch, roll, open_cm)
        im.save(os.path.join(out_dir, f'f{i:03d}.png'))
        print('frame', i, f'yaw={yaw:.2f} roll={roll:.2f} open={open_cm:.2f}', flush=True)
