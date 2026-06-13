'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTransactions } = require('../src/parser');
const { toCsv } = require('../src/csv');

test('parses multiline German account statement entries', () => {
  const text = `
    Buchung Wertstellung Vorgang Betrag Saldo
    03.04. 03.04. Kartenzahlung Supermarkt
    Referenz 12345 -42,19 1.234,56
    04.04. 05.04. Gehalt Firma Beispiel GmbH 2.500,00 H 3.734,56
    30.04. Endsaldo 3.734,56
  `;

  const rows = parseTransactions(text, { year: 2026 });

  assert.deepEqual(rows, [
    {
      Buchung: '2026-04-03',
      Valuta: '2026-04-03',
      'Buchung / Verwendungszweck': 'Kartenzahlung Supermarkt Referenz 12345',
      'Betrag (EUR)': '-42.19'
    },
    {
      Buchung: '2026-04-04',
      Valuta: '2026-04-05',
      'Buchung / Verwendungszweck': 'Gehalt Firma Beispiel GmbH',
      'Betrag (EUR)': '2500.00'
    }
  ]);
});

test('parses ING statement layout and ignores preamble', () => {
  const text = `
    Girokonto Nummer 5427799233
    Kontoauszug Dezember 2024
    BuchungBuchung / VerwendungszweckBetrag (EUR)
    Valuta
    02.12.2024Dauerauftrag/Terminueberw.Mareike Koehnke-34,57
    02.12.2024
    Unfallversicherung
    Alter Saldo2.533,78 Euro
    Neuer Saldo2.332,72 Euro
    BuchungBuchung / VerwendungszweckBetrag (EUR)
    Valuta
    03.12.2024GutschriftThore Gersen80,00
    03.12.2024
  `;

  const rows = parseTransactions(text);

  assert.deepEqual(rows, [
    {
      Buchung: '02.12.2024',
      Valuta: '02.12.2024',
      'Buchung / Verwendungszweck': 'Dauerauftrag/Terminueberw.Mareike Koehnke Unfallversicherung',
      'Betrag (EUR)': '-34.57'
    },
    {
      Buchung: '03.12.2024',
      Valuta: '03.12.2024',
      'Buchung / Verwendungszweck': 'GutschriftThore Gersen',
      'Betrag (EUR)': '80.00'
    }
  ]);
});

test('escapes csv cells', () => {
  const csv = toCsv(
    [
      {
        Buchung: '2026-04-03',
        Valuta: '2026-04-03',
        'Buchung / Verwendungszweck': 'Text mit ; und "Quote"',
        'Betrag (EUR)': '-1.00'
      }
    ],
    { delimiter: ';' }
  );

  assert.match(csv, /"Text mit ; und ""Quote"""/);
});
