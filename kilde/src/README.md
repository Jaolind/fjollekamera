# Fjollekameraet

Et legekamera med fjollede ansigtsfiltre, lavet til min datter. Det fungerer som fjolleansigterne i Snapchat, men uden nogen form for afsendelse, konto, reklamer eller køb i appen.

**Åbn den:** https://jaolind.github.io/fjollekamera/

## Sådan bruges den

- Tryk **Start**, og giv lov til kameraet.
- Øverste række er **udklædninger** (enhjørning, sørøverkat, hund, kanin, prinsesse, drage, løve, mus, rumvæsen, klovn, nisse, fin herre, seje briller, sommerfugl).
- Nederste række er **fjolleansigter** (kæmpeøjne, tegnefilmsøjne, rulleøjne, kæmpenæse, kæmpemund, store ører, babyansigt, lillebitte, ballonhoved, trold, langt ansigt, pandekage, snurretop, gele, spejlansigt).
- Rækkerne kan kombineres. Terningen vælger en tilfældig kombination.
- Prøv at åbne munden med hund, enhjørning, drage, klovn, sørøverkat og mus. Ryst på hovedet med rulleøjne.
- Den store knap tager et billede. Billederne ligger i albummet nederst til venstre.
- Knappen med billedet øverst bruger et foto fra albummet i stedet for kameraet. Den kræver en voksen.
- Knappen med pilene skifter mellem kameraet foran og bagpå.

**Tip:** Læg den på hjemskærmen. På iPhone eller iPad gør du det i Safari med *Del → Føj til hjemmeskærm*. På Android gør du det i Chrome med *⋮ → Føj til startskærm*. Så åbner den i fuld skærm som en app og virker også uden internet efter første gang.

## Privatliv

- Ansigtsgenkendelsen kører i browseren på enheden (MediaPipe Face Mesh). Der bliver ikke sendt billeder eller video nogen steder hen.
- Billederne gemmes kun i browseren på den enhed, de er taget på (højst de 60 nyeste). Med *Gem* lægger en voksen et billede i telefonens egne filer.
- Der er ingen deleknapper, ingen konto og ingen målinger. Menuen ved langt tryk på billederne er slået fra, så et barn ikke kan dele dem.
- *Gem* og fotos fra albummet kræver en voksen: hold to fingre på cirklen i tre sekunder, og tryk på det tal, der står med bogstaver.

## Tryghed

- Blinket ved et billede er blødt og kommer højst én gang i sekundet, selv hvis man trykker mange gange.
- Kameraet slukker, når albummet er åbent, og når appen er skjult. Efter to minutter uden tryk må telefonen låse sig selv igen.

## Teknik

Én statisk side (`index.html`) med WebGL til forvrængningerne og et 2D-lærred til udklædningerne. Alle tegningerne er lavet i kode. Der er ingen billedfiler med figurer.

## Licenser

- MediaPipe Face Mesh og den kanoniske ansigtsmodel: Apache License 2.0, Google LLC (`licenses/MediaPipe-Apache-2.0.txt`).
- Skrifttypen Fredoka: SIL Open Font License 1.1 (`licenses/Fredoka-OFL.txt`).
