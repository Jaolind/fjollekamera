"""Assemble the static site for Fjollekameraet into ./site"""
import json, os, re, shutil, sys
import numpy as np

# usage: python3 build.py [output dir]   (default ./site; in the repo: python3 build.py ..)
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'site')
MP = os.path.join(ROOT, 'node_modules', '@mediapipe', 'face_mesh')
FONTS = os.path.join(ROOT, 'node_modules', '@fontsource', 'fredoka', 'files')

# canonical face (MediaPipe face geometry, Apache-2.0) in face units
V = []
for line in open(os.path.join(ROOT, 'canonical_face_model.obj')):
    p = line.split()
    if p and p[0] == 'v':
        V.append([float(x) for x in p[1:4]])
V = np.array(V)
W = np.linalg.norm(V[234] - V[454])
o = V[10]
C = np.stack([(V[:, 0] - o[0]) / W, -(V[:, 1] - o[1]) / W, (V[:, 2] - o[2]) / W], axis=1)
canon = 'const CANON = new Float32Array([' + ','.join(f'{x:.4f}'.rstrip('0').rstrip('.') if abs(x) > 1e-9 else '0' for x in C.reshape(-1)) + ']);\n'

# version number and "Nyt i appen": the top "## 1.4 – 30. november 2026" heading in src/CHANGELOG.md is the current version
def read_changes(path):
    entries, cur = [], None
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip()
        m = re.match(r'^##\s+(\d+(?:\.\d+)*)\s*[–—-]\s*(\S.*)$', line)
        if m:
            cur = {'version': m.group(1), 'date': m.group(2).strip(), 'items': []}
            entries.append(cur)
        elif line.startswith('##'):
            sys.exit(f'CHANGELOG.md: skriv overskriften som "## 1.4 – 30. november 2026", ikke "{line}"')
        elif cur is not None and line.lstrip().startswith('- '):
            cur['items'].append(line.lstrip()[2:].strip())
        elif cur is not None and cur['items'] and line.strip() and raw[:1] in ' \t':
            cur['items'][-1] += ' ' + line.strip()      # an indented line continues the bullet above
    if not entries:
        sys.exit('CHANGELOG.md: der er ingen udgaver')
    for e in entries:
        if not e['items']:
            sys.exit(f"CHANGELOG.md: udgave {e['version']} har ingen linjer, der starter med '- '")
    nums = [tuple(int(x) for x in e['version'].split('.')) for e in entries]
    for a, b, e in zip(nums, nums[1:], entries[1:]):
        if not a > b:
            sys.exit(f"CHANGELOG.md: den nyeste udgave skal stå øverst, og hver udgave kun én gang (se {e['version']})")
    return entries

CHANGES = read_changes(os.path.join(SRC, 'CHANGELOG.md'))
VERSION = CHANGES[0]['version']

js = canon + 'const APP_VERSION = ' + json.dumps(VERSION) + ';\n'
js += 'const CHANGES = ' + json.dumps(CHANGES, ensure_ascii=False).replace('</', '<\\/') + ';\n'
for name in ('core.js', 'costumes.js', 'app.js'):
    js += '\n' + open(os.path.join(SRC, name), encoding='utf-8').read()
css = open(os.path.join(SRC, 'style.css'), encoding='utf-8').read()
html = open(os.path.join(SRC, 'index.template.html'), encoding='utf-8').read()
html = html.replace('/*CSS*/', css).replace('/*JS*/', js)

# only replace what this script makes (OUT may be the repository root)
for d in ('mp', 'fonts', 'licenses'):
    if os.path.isdir(os.path.join(OUT, d)):
        shutil.rmtree(os.path.join(OUT, d))
os.makedirs(os.path.join(OUT, 'mp'))
os.makedirs(os.path.join(OUT, 'fonts'))
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)

for f in ['face_mesh.js', 'face_mesh.binarypb', 'face_mesh_solution_packed_assets.data',
          'face_mesh_solution_packed_assets_loader.js', 'face_mesh_solution_simd_wasm_bin.js',
          'face_mesh_solution_simd_wasm_bin.wasm', 'face_mesh_solution_simd_wasm_bin.data',
          'face_mesh_solution_wasm_bin.js', 'face_mesh_solution_wasm_bin.wasm']:
    shutil.copy(os.path.join(MP, f), os.path.join(OUT, 'mp', f))
for w in (500, 600, 700):
    shutil.copy(os.path.join(FONTS, f'fredoka-latin-{w}-normal.woff2'), os.path.join(OUT, 'fonts'))

icons = os.path.join(SRC, 'icons')
if os.path.isdir(icons):
    for f in os.listdir(icons):
        shutil.copy(os.path.join(icons, f), os.path.join(OUT, f))

manifest = {
    'name': 'Fjollekameraet',
    'short_name': 'Fjollekamera',
    'description': 'Et legekamera med fjollede ansigtsfiltre. Alt sker på enheden.',
    'lang': 'da',
    'start_url': './',
    'scope': './',
    'display': 'standalone',
    'background_color': '#1B1830',
    'theme_color': '#1B1830',
    'icons': [
        {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
        {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
        {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}
    ]
}
json.dump(manifest, open(os.path.join(OUT, 'manifest.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

shutil.copy(os.path.join(SRC, 'sw.js'), os.path.join(OUT, 'sw.js'))
shutil.copy(os.path.join(SRC, 'README.md'), os.path.join(OUT, 'README.md'))
shutil.copy(os.path.join(SRC, 'CHANGELOG.md'), os.path.join(OUT, 'CHANGELOG.md'))
# the app asks for this file when it opens and when it comes back, to see if a newer version is out
json.dump({'version': VERSION}, open(os.path.join(OUT, 'version.json'), 'w', encoding='utf-8'))
os.makedirs(os.path.join(OUT, 'licenses'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'node_modules', '@fontsource', 'fredoka', 'LICENSE'), os.path.join(OUT, 'licenses', 'Fredoka-OFL.txt'))
shutil.copy(os.path.join(SRC, 'APACHE-2.0.txt'), os.path.join(OUT, 'licenses', 'MediaPipe-Apache-2.0.txt'))
open(os.path.join(OUT, '.nojekyll'), 'w').close()
print('built', OUT, 'version', VERSION, len(html) // 1024, 'KB index.html')
