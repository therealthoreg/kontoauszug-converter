'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadOutputRows, parseCsvRows, parseMultipart, sanitizeBaseName } = require('../src/server');

test('parses multipart fields and uploaded files', () => {
  const boundary = '----kontoauszug-test';
  const body = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="year"',
    '',
    '2026',
    `--${boundary}`,
    'Content-Disposition: form-data; name="pdfs"; filename="januar.pdf"',
    'Content-Type: application/pdf',
    '',
    '%PDF-test',
    `--${boundary}--`,
    ''
  ].join('\r\n'), 'latin1');

  const parts = parseMultipart(body, boundary);

  assert.equal(parts.length, 2);
  assert.equal(parts[0].name, 'year');
  assert.equal(parts[0].data.toString('utf8'), '2026');
  assert.equal(parts[1].name, 'pdfs');
  assert.equal(parts[1].fileName, 'januar.pdf');
  assert.equal(parts[1].data.toString('latin1'), '%PDF-test');
});

test('sanitizes upload file names for output files', () => {
  assert.equal(sanitizeBaseName('../../Jan Kontoauszug 2026.pdf'), 'Jan-Kontoauszug-2026');
  assert.equal(sanitizeBaseName('---.pdf'), 'kontoauszug');
});

test('parses semicolon csv with escaped values', () => {
  const rows = parseCsvRows([
    'Buchung;Valuta;Buchung / Verwendungszweck;Betrag (EUR)',
    '2026-04-03;2026-04-03;"Text mit ; und ""Quote""";-42.19'
  ].join('\n'));

  assert.deepEqual(rows, [
    {
      Buchung: '2026-04-03',
      Valuta: '2026-04-03',
      'Buchung / Verwendungszweck': 'Text mit ; und "Quote"',
      'Betrag (EUR)': '-42.19'
    }
  ]);
});

test('loads existing csv rows from output directory', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontoauszug-output-test-'));
  await fs.writeFile(
    path.join(tmpDir, 'januar.csv'),
    [
      'Buchung;Valuta;Buchung / Verwendungszweck;Betrag (EUR)',
      '2026-01-02;2026-01-02;Supermarkt;-12.34'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(path.join(tmpDir, 'notiz.txt'), 'ignorieren', 'utf8');

  const result = await loadOutputRows(tmpDir);

  assert.deepEqual(result.files, [
    {
      fileName: 'januar.csv',
      outputFile: path.relative(process.cwd(), path.join(tmpDir, 'januar.csv')),
      rowCount: 1
    }
  ]);
  assert.deepEqual(result.rows, [
    {
      source_file: 'januar.csv',
      Buchung: '2026-01-02',
      Valuta: '2026-01-02',
      'Buchung / Verwendungszweck': 'Supermarkt',
      'Betrag (EUR)': '-12.34'
    }
  ]);
});
