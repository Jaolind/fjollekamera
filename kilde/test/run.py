"""Drive Fjollekameraet in headless Chrome with a fake camera and take screenshots.

usage: python3 test/run.py <video.y4m> <outdir> [steps...]
steps: start | costume:<id> | warp:<id> | shot:<name> | wait:<sec> | snap | album | viewer | eval:<js>
"""
import sys, time, json, os, subprocess, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
PORT = 8765

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                          '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json'}
        def log_message(self, *a):
            pass
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=SITE))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def main():
    video = sys.argv[1]
    out = sys.argv[2]
    steps = sys.argv[3:]
    os.makedirs(out, exist_ok=True)
    httpd = serve()
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch(
            executable_path='/usr/bin/google-chrome', headless=True,
            args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                  f'--use-file-for-fake-video-capture={video}', '--enable-unsafe-swiftshader',
                  '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': int(os.environ.get('VW', 390)), 'height': int(os.environ.get('VH', 844))}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            permissions=['camera'])
        page = ctx.new_page()
        page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        page.goto(f'http://127.0.0.1:{PORT}/index.html')
        page.wait_for_timeout(800)
        for st in steps:
            kind, _, arg = st.partition(':')
            if kind == 'start':
                page.click('#btnStart')
                t0 = time.time()
                page.wait_for_function('window.__fk && window.__fk.state.detReady && window.__fk.faces.length > 0', timeout=90000)
                print(f'ready+face after {time.time()-t0:.1f}s', flush=True)
                page.wait_for_timeout(1500)
            elif kind == 'costume':
                page.evaluate(f"(() => {{ const i = __fk.COSTUMES.findIndex(c => c.id === '{arg}'); __fk.selectCostume(i, true); }})()")
                page.wait_for_timeout(900)
            elif kind == 'warp':
                page.evaluate(f"(() => {{ const i = __fk.WARPS.findIndex(c => c.id === '{arg}'); __fk.selectWarp(i, true); }})()")
                page.wait_for_timeout(900)
            elif kind == 'shot':
                page.screenshot(path=os.path.join(out, arg + '.png'))
            elif kind == 'wait':
                page.wait_for_timeout(int(float(arg) * 1000))
            elif kind == 'snap':
                page.click('#btnShutter')
                page.wait_for_timeout(1200)
            elif kind == 'click':
                page.click(arg)
                page.wait_for_timeout(700)
            elif kind == 'file':
                page.set_input_files('#file', arg)
                page.wait_for_timeout(2500)
            elif kind == 'eval':
                print('eval:', page.evaluate(arg), flush=True)
            elif kind == 'info':
                print(json.dumps(page.evaluate("""(() => ({faces: __fk.faces.length, open: __fk.faces.map(f => +f.open.toFixed(2)),
                  px: __fk.faces.map(f => +f.px.toFixed(1)), view: __fk.state.view, mode: __fk.state.mode, det: __fk.state.detReady}))()""")), flush=True)
        b.close()
    httpd.shutdown()
    print('\n'.join(logs[-40:]))

if __name__ == '__main__':
    main()
