# Kontoauszug Converter

Kleine lokale Web-App, die Kontoauszug-PDFs ausliest, Buchungen als CSV speichert und die erkannten Zeilen durchsuchbar macht.

## Installation

```bash
npm install
```

## Start

```bash
npm start
```

Danach die App im Browser oeffnen:

```text
http://localhost:3000
```

## Nutzung

1. Eine oder mehrere PDF-Dateien auswaehlen.
2. Optional ein Jahr angeben, falls der Kontoauszug nur Datumswerte wie `03.04.` enthaelt.
3. `Konvertieren` starten.
4. Die erkannten Buchungen in der Tabelle durchsuchen.

Die CSV-Dateien werden immer im Ordner `output` abgelegt, z.B. `januar.pdf` zu `output/januar.csv`.

Wenn der Ordner `output` bereits CSV-Dateien enthaelt, werden diese beim Oeffnen der App automatisch in die Tabelle geladen.

Die Suche filtert die sichtbaren Ergebniszeilen ueber alle Spalten. Zur aktuellen Filterung werden Trefferanzahl und Summe der Euro-Betraege angezeigt.

## Optionale CLI

Die bisherige Kommandozeile ist noch als Hilfsweg vorhanden:

```bash
npm run cli -- ./kontoauszug.pdf
```

Auch dabei landen die CSV-Dateien im Ordner `output`.

## Hinweis

Kontoauszugs-PDFs unterscheiden sich je nach Bank stark. Der Parser nutzt eine robuste Heuristik fuer deutsche Auszuege:

- Buchungen beginnen mit einem Datum im Format `TT.MM.` oder `TT.MM.JJJJ`.
- Optional wird ein zweites Datum als Wertstellung erkannt.
- Deutsche Betraege wie `1.234,56`, `-12,34`, `12,34 S` und `12,34 H` werden normalisiert.
- Mehrzeilige Buchungstexte werden zusammengefuehrt.

Wenn deine Bank ein spezielles Layout nutzt, ist die wichtigste Stelle [src/parser.js](/Users/thoregersen/Desktop/kontoauszug-converter/src/parser.js).
