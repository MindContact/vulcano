# Vulcano

Platform 2D a tema lava e vulcani, giocabile nel browser. Musica ed effetti
sonori escono da un'emulazione del chip SID (MOS 6581 / 8580) del Commodore 64,
in tempo reale: nessun file audio.

## Documentazione

* [Guida del giocatore](docs/GUIDA.md) — comandi, menu, livelli, punteggio.
* [Documentazione tecnica](docs/TECNICA.md) — avvio, test, come modificare
  livelli, brani, effetti e sprite, pubblicazione.
* [Architettura e funzionamento interno](docs/ARCHITETTURA.md) — moduli, ciclo
  di gioco, fisica, disegno, emulazione SID, player musicale, verifiche.

## Avvio

```bash
./start.sh             # avvia il server e apre il browser su http://localhost:8137/
./start.sh 9000        # su un'altra porta
./start.sh --no-open   # solo il server
```

Dopo un `git clone` servono anche i submodule (il SID e il motore):
`git clone --recurse-submodules`, oppure `git submodule update --init` in un
clone già fatto.

Se il gioco è già in esecuzione apre solo il browser; se la porta è occupata
da un'altra applicazione si ferma con un errore. Ctrl+C ferma il server. Serve un server HTTP (i moduli ES e
l'AudioWorklet non si caricano da `file://`). Nessuna dipendenza, nessuna build.

Comandi: frecce/WASD per muoversi, Spazio/Z/↑ per saltare (tenere premuto =
salto più alto), ↓ + salto per scendere da una crosta, P/Esc pausa, M muto.
Gamepad supportato; sul telefono compaiono i tasti a schermo.

Parametri URL utili per provare: `?level=3` parte da un livello, `?god` rende
immortali (tranne le cadute).

## Il gioco

Cinque livelli: *Le pendici*, *Camere di magma*, *Il condotto* (verticale, la
lava sale e accelera se ti allontani), *Il cratere* (con il golem di magma),
*La colata* (in fuga dall'eruzione, la lava insegue da sinistra). Cristalli (100 punti, una
vita ogni 30), lumache di magma e pipistrelli di cenere (si schiacciano
saltandoci sopra), bolle di fuoco, geyser, rocce che crollano, piattaforme
mobili, croste attraversabili da sotto, checkpoint. Bonus tempo e bonus "tutti i
cristalli" a fine livello. Tre difficoltà: facile (per i bambini: più vite,
lava e nemici più lenti), normale, difficile. Livello sbloccato, difficoltà e
record salvati in `localStorage`.

## Il motore

Loop, schermo, input, font, sprite, mappe, fisica del giocatore, camera,
particelle, macchina a stati, salvataggio e collegamento al SID vengono da
**motorino**, il motore 2D estratto da Vulcano per Stazione Zero, incluso
come submodule in `lib/motorino/`. In Vulcano restano livelli, regole,
nemici, disegno, testi, brani ed effetti.

## Il SID

Il motore è **[sidicio](https://github.com/MindContact/sidicio)**, una
libreria separata dello stesso autore, inclusa come submodule git in
`lib/sidicio/`. È il port JavaScript del motore di
[mcma-chip](../mcma-chip/native/sid_chip.cpp): tre oscillatori (triangolo,
dente di sega, impulso, rumore e combinazioni), ADSR con il decadimento
esponenziale del chip vero, ring mod, sync, filtro multimodo state-variable con
le curve 6581 e 8580, oversampling 4x. Gira in un AudioWorklet.

Due chip in parallelo, come una cartuccia dual-SID: uno per la musica, uno per
gli effetti, così un salto non ruba mai una voce alla melodia.

* `src/audio/songs.js` — i brani, scritti come righe di tracker (note, `.` tieni, `-`
  rilascia, `K S H` batteria, `@strumento`). Gli strumenti hanno arpeggi, vibrato,
  sweep della larghezza d'impulso, glide e wave table per la batteria.
* `src/audio/sfx.js` — gli effetti, come programmi a frame (50 Hz) di forma d'onda,
  frequenza e larghezza d'impulso.

Dal menu si sceglie il modello di chip (6581 più sporco e scuro, 8580 più
pulito con risonanza forte) e il volume di musica ed effetti.

## Controlli automatici

```bash
npm test                          # mondo deterministico, replay di ogni livello a ogni difficoltà
node tools/check.mjs              # brani e effetti si compilano e suonano, livelli validi
node tools/check.mjs --wav DIR    # in più scrive ogni brano e gli effetti in WAV
node tools/solve.mjs [n] [diff]   # dimostra che ogni livello si può finire, a ogni difficoltà
```

`solve.mjs` cerca un percorso fino all'uscita usando la fisica vera del gioco
(nemici, lava che sale e piattaforme comprese) e la scrive in `test/replays/`,
che `npm test` rigioca. Va rilanciato dopo ogni modifica ai livelli, alla
fisica del salto, alle difficoltà o a motorino.

## Struttura

```
index.html, style.css
src/main.js            schermate, punteggio, vite, impostazioni
src/i18n.js            testi a schermo in italiano e inglese
src/game/levels.js     livelli disegnati come testo (legenda in testa al file)
src/game/world.js      regole, nemici, pericoli, piattaforme, golem
src/game/difficulty.js facile, normale, difficile
src/game/render.js     disegno su canvas 320x180
src/game/sprites.js    sprite dei quattro personaggi e dei nemici
src/audio/             brani ed effetti
lib/motorino/          submodule: il motore (loop, input, font, fisica, camera…)
lib/sidicio/           submodule: il SID
tools/                 server di sviluppo, controlli, risolutore
test/                  test e replay dei livelli
```

## Licenza

[PolyForm Noncommercial 1.0.0](LICENSE) © MindContact | Roberto Luttino: il
gioco si può leggere, eseguire, modificare e condividere per scopi non
commerciali. Le librerie in `lib/` (motorino, sidicio) sono MIT.
