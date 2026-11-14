# Kildekode

- `src/` – appens kode: `core.js` (ansigtssporing, forvrængning, WebGL), `costumes.js` (udklædningerne), `app.js` (betjening, kamera, album), `style.css`, `index.template.html`, `sw.js`.
- `build.py` – samler alt til én `index.html` og kopierer MediaPipe-filer, skrift og ikoner.
- `testface.py`, `test/` – et computertegnet testansigt og en testkører til headless Chrome med falsk kamera.

Byg og læg ud:

```
cd kilde
npm install
python3 build.py ..
```

Ændringer i roden (index.html m.m.) går ud på GitHub Pages, når de er skubbet til `main`.
Hvis MediaPipe-filerne eller ikonerne ændres, så hæv `CACHE`-versionen i `src/sw.js`, så telefonerne henter de nye filer.
