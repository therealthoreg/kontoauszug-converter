'use strict';

const DATE_AT_START = /^(\d{2}\.\d{2}\.?(?:\d{2,4})?)(?:\s+(\d{2}\.\d{2}\.?(?:\d{2,4})?))?\s+(.*)$/;
const DATE_ONLY = /^\d{2}\.\d{2}\.(?:\d{4})?$/;
const ING_TRANSACTION_LINE = /^(\d{2}\.\d{2}\.\d{4})(.+?)([+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/;
const AMOUNT_PATTERN = /([+-]?\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(?:EUR|€)?\s*([SH])?/gi;
const BALANCE_WORDS = /\b(anfangssaldo|alter saldo|vortrag|endsaldo|neuer saldo|abschluss|saldo)\b/i;
const TABLE_HEADER = /Buchung\s*Buchung\s*\/\s*Verwendungszweck\s*Betrag\s*\(EUR\)/i;

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function inferYear(text, fallbackYear) {
  if (fallbackYear) {
    return Number(fallbackYear);
  }

  const match = text.match(/\b(?:19|20)\d{2}\b/);
  if (match) {
    return Number(match[0]);
  }

  return new Date().getFullYear();
}

function normalizeDate(dateText, year) {
  const parts = dateText.replace(/\.$/, '').split('.');
  const day = parts[0];
  const month = parts[1];
  let normalizedYear = parts[2] || String(year);

  if (normalizedYear.length === 2) {
    normalizedYear = Number(normalizedYear) >= 70 ? `19${normalizedYear}` : `20${normalizedYear}`;
  }

  return `${normalizedYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseAmount(rawAmount, marker) {
  const hasExplicitMinus = rawAmount.includes('-');
  const normalized = rawAmount
    .replace(/\s/g, '')
    .replace(/[+]/g, '')
    .replace(/-/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  let amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (hasExplicitMinus || marker === 'S') {
    amount *= -1;
  }

  return amount.toFixed(2);
}

function findAmounts(text) {
  const amounts = [];
  let match;

  AMOUNT_PATTERN.lastIndex = 0;
  while ((match = AMOUNT_PATTERN.exec(text)) !== null) {
    amounts.push({
      raw: match[1],
      marker: match[2],
      start: match.index,
      end: AMOUNT_PATTERN.lastIndex,
      value: parseAmount(match[1], match[2])
    });
  }

  return amounts.filter((amount) => amount.value !== null);
}

function cleanDescription(description) {
  return description
    .replace(/\s*(?:EUR|€)\s*/gi, ' ')
    .replace(/^Valuta\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnorableIngLine(line) {
  return (
    TABLE_HEADER.test(line) ||
    line === 'Valuta' ||
    /^34GIRO/i.test(line) ||
    /^Girokonto Nummer/i.test(line) ||
    /^Kontoauszug /i.test(line) ||
    /^Herrn$/i.test(line) ||
    /^Datum\d{2}\.\d{2}\.\d{4}$/i.test(line) ||
    /^Auszugsnummer/i.test(line) ||
    /^Eingeräumte Kontoüberziehung/i.test(line) ||
    /^Alter Saldo/i.test(line) ||
    /^Neuer Saldo/i.test(line) ||
    /^IBAN/i.test(line) ||
    /^BIC/i.test(line) ||
    /^Seite\d+\s+von\s+\d+/i.test(line) ||
    /^ING-DiBa AG/i.test(line) ||
    /^Steuernummer:/i.test(line) ||
    /^\d{5}\s+/.test(line)
  );
}

function buildIngBlocks(lines) {
  const blocks = [];
  let current = null;
  let hasSeenTable = false;

  for (const line of lines) {
    if (TABLE_HEADER.test(line)) {
      hasSeenTable = true;
      continue;
    }

    if (!hasSeenTable || isIgnorableIngLine(line)) {
      continue;
    }

    const transactionMatch = line.match(ING_TRANSACTION_LINE);
    if (transactionMatch) {
      if (current) {
        blocks.push(current);
      }

      current = {
        bookingDate: transactionMatch[1],
        descriptionStart: transactionMatch[2],
        amount: transactionMatch[3],
        valueDate: null,
        descriptionLines: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (!current.valueDate && DATE_ONLY.test(line)) {
      current.valueDate = line;
      continue;
    }

    current.descriptionLines.push(line);
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function parseIngBlock(block) {
  const description = cleanDescription([block.descriptionStart, ...block.descriptionLines].join(' '));

  if (!description || BALANCE_WORDS.test(description)) {
    return null;
  }

  return {
    Buchung: block.bookingDate,
    Valuta: block.valueDate || block.bookingDate,
    'Buchung / Verwendungszweck': description,
    'Betrag (EUR)': parseAmount(block.amount)
  };
}

function isLikelyTransactionStart(line) {
  if (!DATE_AT_START.test(line)) {
    return false;
  }

  DATE_AT_START.lastIndex = 0;
  return true;
}

function buildBlocks(lines) {
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (isLikelyTransactionStart(line)) {
      if (current) {
        blocks.push(current);
      }
      current = [line];
      continue;
    }

    if (current) {
      current.push(line);
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function parseBlock(block, year) {
  const firstLine = block[0];
  const dateMatch = firstLine.match(DATE_AT_START);

  if (!dateMatch) {
    return null;
  }

  const fullText = block.join(' ');
  const amounts = findAmounts(fullText);

  if (amounts.length === 0) {
    return null;
  }

  const amountCandidate = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
  const balanceCandidate = amounts.length >= 2 ? amounts[amounts.length - 1] : null;
  const textAfterDates = fullText.slice(fullText.indexOf(dateMatch[3]));
  const amountStartInTail = Math.max(0, amountCandidate.start - fullText.indexOf(dateMatch[3]));
  const description = cleanDescription(textAfterDates.slice(0, amountStartInTail));

  if (!description || BALANCE_WORDS.test(description)) {
    return null;
  }

  return {
    Buchung: normalizeDate(dateMatch[1], year),
    Valuta: normalizeDate(dateMatch[2] || dateMatch[1], year),
    'Buchung / Verwendungszweck': description,
    'Betrag (EUR)': amountCandidate.value
  };
}

function parseTransactions(rawText, options = {}) {
  const text = normalizeText(rawText);
  const year = inferYear(text, options.year);
  const lines = text.split('\n');
  const ingRows = buildIngBlocks(lines)
    .map((block) => parseIngBlock(block))
    .filter(Boolean);

  if (ingRows.length > 0) {
    return ingRows;
  }

  const blocks = buildBlocks(lines);

  return blocks
    .map((block) => parseBlock(block, year))
    .filter(Boolean);
}

module.exports = {
  findAmounts,
  normalizeDate,
  normalizeText,
  parseTransactions
};
