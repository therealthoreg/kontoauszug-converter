'use strict';

const DEFAULT_COLUMNS = [
  'Buchung',
  'Valuta',
  'Buchung / Verwendungszweck',
  'Betrag (EUR)'
];

function escapeCell(value, delimiter) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text.includes(delimiter)
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(rows, options = {}) {
  const delimiter = options.delimiter || ';';
  const columns = options.columns || DEFAULT_COLUMNS;
  const lines = [columns.map((column) => escapeCell(column, delimiter)).join(delimiter)];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row[column], delimiter)).join(delimiter));
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_COLUMNS,
  toCsv
};
