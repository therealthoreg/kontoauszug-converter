'use strict';

const pdf = require('pdf-parse');
const { normalizeText, parseTransactions } = require('./parser');

async function convertPdfBuffer(buffer, options = {}) {
  const data = await pdf(buffer);
  const normalizedText = normalizeText(data.text || '');
  const rows = parseTransactions(normalizedText, { year: options.year });

  if (rows.length === 0) {
    throw new Error('Keine Buchungen erkannt.');
  }

  return {
    rows,
    text: normalizedText
  };
}

module.exports = {
  convertPdfBuffer
};
