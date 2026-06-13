# Kontoauszug Converter

Kleines Node.js-CLI, das Kontoauszug-PDFs ausliest und Buchungen als CSV speichert.

## Installation

```bash
npm install
```

## Nutzung

```bash
npm start -- ./kontoauszug.pdf -o ./kontoauszug.csv
```

Du kannst auch nur einen Ordner angeben. Dann werden alle PDFs direkt in diesem Ordner konvertiert:

```bash
npm start -- ./kontoauszuege
```

Die CSV-Dateien werden mit gleichem Namen neben den PDFs erzeugt, z.B. `januar.pdf` zu `januar.csv`.
Mit `-o` kannst du einen Zielordner angeben:

```bash
npm start -- ./kontoauszuege -o ./csv-export
```

PDFs in Unterordnern findest du mit:

```bash
npm start -- ./kontoauszuege --recursive -o ./csv-export
```

Mehrere PDFs kannst du in einem Durchlauf konvertieren:

```bash
npm start -- ./januar.pdf ./februar.pdf ./maerz.pdf
```

Dabei wird fuer jede PDF eine CSV mit gleichem Namen erzeugt, also z.B. `januar.csv`.
Mit `-o` kannst du bei mehreren PDFs einen Zielordner angeben:

```bash
npm start -- ./januar.pdf ./februar.pdf -o ./csv-export
```

Wenn du alle Buchungen zusaetzlich in einer gemeinsamen CSV haben willst:

```bash
npm start -- ./kontoauszuege --merge-output ./alle-buchungen.csv
```

Optional kannst du ein Jahr angeben, falls der Kontoauszug nur Datumswerte wie `03.04.` enthält:

```bash
npm start -- ./kontoauszug.pdf -o ./kontoauszug.csv --year 2026
```

Weitere Optionen:

```bash
node src/index.js ./kontoauszug.pdf --delimiter "," --debug-text ./auszug.txt
```

Bei mehreren PDFs wird `--debug-text` als Zielordner behandelt:

```bash
node src/index.js ./januar.pdf ./februar.pdf --debug-text ./debug-text
```

Die CSV-Spalten sind:

```text
Buchung,Valuta,Buchung / Verwendungszweck,Betrag (EUR)
```

Bei `--merge-output` kommt vorne die Spalte `source_file` hinzu.

## Hinweis

Kontoauszugs-PDFs unterscheiden sich je nach Bank stark. Der Parser nutzt eine robuste Heuristik für deutsche Auszüge:

- Buchungen beginnen mit einem Datum im Format `TT.MM.` oder `TT.MM.JJJJ`.
- Optional wird ein zweites Datum als Wertstellung erkannt.
- Deutsche Beträge wie `1.234,56`, `-12,34`, `12,34 S` und `12,34 H` werden normalisiert.
- Mehrzeilige Buchungstexte werden zusammengeführt.

Wenn deine Bank ein spezielles Layout nutzt, ist die wichtigste Stelle [src/parser.js](/Users/thoregersen/Desktop/kontoauszug-converter/src/parser.js).
