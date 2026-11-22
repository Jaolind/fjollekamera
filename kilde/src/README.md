# Fjollekameraet

Et legekamera med fjollede ansigtsfiltre, lavet til min datter. Det fungerer som fjolleansigterne i Snapchat, men uden nogen form for afsendelse, konto, reklamer eller køb i appen.

**Åbn den:** https://jaolind.github.io/fjollekamera/

## Sådan bruges den

- Tryk **Start**, og giv lov til kameraet.
- Øverste række er **udklædninger** (enhjørning, Kaptajn Knurhår fra godnatbogen, sørøverkat, hund, kanin, prinsesse, drage, løve, mus, rumvæsen, klovn, nisse, fin herre, seje briller, sommerfugl).
- Nederste række er **fjolleansigter** (kæmpeøjne, tegnefilmsøjne, rulleøjne, kæmpenæse, kæmpemund, store ører, babyansigt, lillebitte, ballonhoved, trold, langt ansigt, pandekage, snurretop, gele, spejlansigt).
- Rækkerne kan kombineres. Terningen vælger en tilfældig kombination, og knappen med det glade ansigt ved siden af gør alt normalt igen.
- Prøv at åbne munden med hund, enhjørning, drage, klovn, sørøverkat og mus. Ryst på hovedet med rulleøjne. Læn hovedet langt tilbage som Kaptajn Knurhår, så glider hatten af. Åbn munden som Kaptajn Knurhår, så kaster hun æbler som i historie 1.
- Den store knap tager et billede. Billederne ligger i albummet nederst til venstre. Poten ved siden af er selvudløseren: tre kattepoter tæller ned, og fire billeder bliver til én fotostribe.
- Tandhjulet øverst til højre åbner **forældrehjørnet**, som kræver en voksen. Her slår du bogens historier og Simsalabim-øen til og fra, vælger hvad terningen må bruge, indstiller lyd, blink, tidsgrænse og aftenlås, bruger et foto fra telefonens album og kan slette alle billeder.
- Knappen med pilene skifter mellem kameraet foran og bagpå.

**Kaptajn Knurhårs univers:** Tryk på skibet Hvorfor på startskærmen eller øverst i kameraet. Så sejler appen gennem tidstågen ind til bogens figurer. Pip kommer med, når historie 2 er slået til i forældrehjørnet: første gang gynger han i sin valnøddeskal og spørger, om han må komme op, og bagefter bor han i Knurhårs hat, hvor han af og til siger huskesætningen forkert, så barnet kan rette ham. Med historie 2 kommer også papirkronen: er I to i billedet, rives den i stykker, så I får et stykke hver. Papegøjen Sukkertop kommer, når historie 9 er slået til. Er I to i billedet, bliver den anden Knurhårs skibskammerat. Tryk på skibet igen for at sejle hjem.

**Simsalabim-øen:** Fra Knurhårs skib kan I sejle videre til en ø, hvor barnet selv tryller. Øen er ikke en del af bogen, og alt på den er tegnet til appen. På øen bliver man tryllelærling, og når munden åbner sig og siger Simsalabim, flyver der glimmer ud. På øen bliver terningen til en høj tryllehat, og åbner barnet munden, hopper en kanin, en due eller en fisk op af den. Er I to, og åbner I munden samtidig, danser en ring af månelys om jer begge. Når Knurhår sover i hængekøjen, folder en drømmeparaply sig ud over hende. Øens ting kan slås til og fra i forældrehjørnet, hvor I også kan se, hvor mange billeder i sekundet ansigtssporingen nåede sidst.

**Tip:** Læg den på hjemskærmen. På iPhone eller iPad gør du det i Safari med *Del → Føj til hjemmeskærm*. På Android gør du det i Chrome med *⋮ → Føj til startskærm*. Så åbner den i fuld skærm som en app og virker også uden internet efter første gang.

## Udgaver og opdateringer

- Versionsnummeret står nederst på startskærmen. Tryk på det for at se, hvad der er nyt. Listen ligger også i [CHANGELOG.md](CHANGELOG.md).
- Appen tjekker selv efter en ny udgave, når den åbnes, og når den kommer frem igen. Findes der en, genstarter den med den nye. Den venter, mens der leges med et foto fra albummet, mens et billede er åbent, og mens en voksen bruger låsen.
- Uden internet bruger appen den udgave, der allerede ligger på enheden.

## Privatliv

- Ansigtsgenkendelsen kører i browseren på enheden (MediaPipe Face Mesh). Der bliver ikke sendt billeder eller video nogen steder hen.
- Billederne gemmes kun i browseren på den enhed, de er taget på (højst de 60 nyeste). Med *Gem* lægger en voksen et billede i telefonens egne filer.
- Der er ingen deleknapper, ingen konto og ingen målinger. Menuen ved langt tryk på billederne er slået fra, så et barn ikke kan dele dem.
- *Gem*, *Del*, *Slet* og forældrehjørnet kræver en voksen: hold to fingre på cirklen i tre sekunder, og tryk på det tal, der står med bogstaver.
- Når appen åbnes, spørger den GitHub, om der er en ny udgave (filen `version.json`). Det svarer til at åbne siden, og der sendes intet om jer eller billederne.

## Tryghed

- Blinket ved et billede er blødt og kommer højst én gang i sekundet, selv hvis man trykker mange gange.
- Kameraet slukker, når albummet er åbent, og når appen er skjult. Efter to minutter uden tryk må telefonen låse sig selv igen.
- Med en tidsgrænse hviler kameraet, når tiden er gået. Med aftenlåsen sover appen fra det valgte klokkeslæt til kl. 6. I begge tilfælde gaber Kaptajn Knurhår og falder i søvn i hængekøjen, og kameraet slukker.
- Knappen *Alt normalt* ligger altid samme sted og fjerner udklædning og fjolleansigt med ét tryk.
- Terningen vælger ikke Trold og Snurretop, medmindre en voksen slår dem til i forældrehjørnet, og de kommer kun på det første ansigt i billedet.
- Hvert skift sker bag et lille pust af glitrende tidståge, så ingen forvandler sig for øjnene af en.
- Ingen udklædning forskønner: enhjørningen har glimmer i manken, men ingen lyserød hud, vipper eller rouge, og prinsessen har krone og glimmer uden rouge.

## Teknik

Én statisk side (`index.html`) med WebGL til forvrængningerne og et 2D-lærred til udklædningerne. Alle tegningerne er lavet i kode. Der er ingen billedfiler med figurer.

## Licenser

- MediaPipe Face Mesh og den kanoniske ansigtsmodel: Apache License 2.0, Google LLC (`licenses/MediaPipe-Apache-2.0.txt`).
- Skrifttypen Fredoka: SIL Open Font License 1.1 (`licenses/Fredoka-OFL.txt`).
