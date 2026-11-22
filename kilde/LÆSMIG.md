# Kildekode

- `src/` – appens kode: `core.js` (ansigtssporing, forvrængning, WebGL), `costumes.js` (udklædningerne), `app.js` (betjening, kamera, album, opdateringer), `style.css`, `index.template.html`, `sw.js`, og `CHANGELOG.md` (versionsnummer og *Nyt i appen*).
- `build.py` – samler alt til én `index.html`, skriver `version.json` og kopierer MediaPipe-filer, skrift og ikoner.
- `testface.py`, `test/` – et computertegnet testansigt og en testkører til headless Chrome med falsk kamera.

Byg og læg ud:

```
cd kilde
npm install
python3 build.py ..
```

Ændringer i roden (index.html m.m.) går ud på GitHub Pages, når de er skubbet til `main`.
Hvis MediaPipe-filerne eller ikonerne ændres, så hæv `CACHE`-versionen i `src/sw.js`, så telefonerne henter de nye filer.

## Ny udgave

1. Skriv den nye udgave øverst i `src/CHANGELOG.md`, fx `## 1.4 – 30. november 2026`, og under den én linje pr. ændring, der starter med `- `.
2. Byg med `python3 build.py ..`. Versionsnummeret kommer fra den øverste overskrift og havner i `index.html` og `version.json`. Bygningen stopper med en forklaring, hvis overskriften er skrevet forkert, eller hvis den nyeste udgave ikke står øverst.
3. Skub til `main`. Når GitHub Pages har lagt den ud (fanen *Actions* i repoet), henter telefonerne den, næste gang appen åbnes eller kommer frem igen.

Appen genstarter kun, når `version.json` har et højere nummer end den udgave, der kører. Den forsøger højst én gang pr. udgave hvert tiende minut.
