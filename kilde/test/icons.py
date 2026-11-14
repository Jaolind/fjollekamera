import base64, os, sys, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site'); OUT = os.path.join(ROOT, 'src', 'icons'); os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 8766), functools.partial(Q, directory=SITE))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
JS = """([size, frac]) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = '#1B1830'; x.fillRect(0, 0, size, size);
  for (const [u, v, r, col] of [[0.13,0.15,0.075,'rgba(255,201,60,0.32)'],[0.88,0.13,0.05,'rgba(89,195,255,0.35)'],[0.86,0.87,0.095,'rgba(255,107,91,0.36)'],[0.11,0.86,0.055,'rgba(89,195,255,0.28)']]) {
    x.fillStyle = col; x.beginPath(); x.arc(u * size, v * size, r * size, 0, Math.PI * 2); x.fill();
  }
  const f = makeIconFace(size, { scale: frac, top: 0.5 - 0.36 * frac });
  drawCartoon(x, f);
  const kat = COSTUMES.find(k => k.id === 'kat');
  kat.draw(x, f, { t: 1.2, dt: 0, icon: true, since: 99, W: size, H: size });
  return c.toDataURL('image/png');
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    pg = b.new_page()
    pg.goto('http://127.0.0.1:8766/index.html'); pg.wait_for_timeout(1200)
    for name, size, frac in [('apple-touch-icon.png', 180, 0.5), ('icon-192.png', 192, 0.5), ('icon-512.png', 512, 0.5), ('icon-maskable-512.png', 512, 0.4)]:
        data = pg.evaluate(JS, [size, frac])
        open(os.path.join(OUT, name), 'wb').write(base64.b64decode(data.split(',')[1]))
        print('wrote', name)
    b.close()
httpd.shutdown()
