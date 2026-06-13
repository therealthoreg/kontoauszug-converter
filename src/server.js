'use strict';

const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { convertPdfBuffer } = require('./converter');
const { toCsv } = require('./csv');

const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_DIR = path.join(process.cwd(), 'output');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const CSV_COLUMNS = [
  'Buchung',
  'Valuta',
  'Buchung / Verwendungszweck',
  'Betrag (EUR)'
];

function sanitizeBaseName(fileName) {
  const parsed = path.parse(fileName || 'kontoauszug.pdf');
  const baseName = parsed.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return baseName || 'kontoauszug';
}

function parseCsvRows(csvText, delimiter = ';') {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value !== '')) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    Object.fromEntries(headers.map((header, index) => [header, dataRow[index] || '']))
  );
}

async function loadOutputRows(outputDir = OUTPUT_DIR) {
  let entries;

  try {
    entries = await fs.readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        files: [],
        rows: []
      };
    }
    throw error;
  }

  const files = [];
  const rows = [];
  const csvEntries = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.csv')
    .sort((left, right) => left.name.localeCompare(right.name, 'de'));

  for (const entry of csvEntries) {
    const filePath = path.join(outputDir, entry.name);

    try {
      const csvText = await fs.readFile(filePath, 'utf8');
      const fileRows = parseCsvRows(csvText)
        .filter((row) => CSV_COLUMNS.every((column) => Object.hasOwn(row, column)))
        .map((row) => ({
          source_file: row.source_file || entry.name,
          ...row
        }));

      files.push({
        fileName: entry.name,
        outputFile: path.relative(process.cwd(), filePath),
        rowCount: fileRows.length
      });
      rows.push(...fileRows);
    } catch (error) {
      files.push({
        fileName: entry.name,
        error: error.message
      });
    }
  }

  return {
    files,
    rows
  };
}

function parseContentDisposition(header) {
  const result = {};
  const matches = header.matchAll(/;\s*([^=]+)="([^"]*)"/g);

  for (const match of matches) {
    result[match[1].toLowerCase()] = match[2];
  }

  return result;
}

function parseMultipart(buffer, boundary) {
  const marker = `--${boundary}`;
  const body = buffer.toString('latin1');
  const parts = [];

  for (const rawPart of body.split(marker)) {
    if (!rawPart || rawPart === '--\r\n' || rawPart === '--') {
      continue;
    }

    const cleanedPart = rawPart.replace(/^\r\n/, '').replace(/\r\n--$/, '');
    const headerEnd = cleanedPart.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      continue;
    }

    const rawHeaders = cleanedPart.slice(0, headerEnd);
    let rawBody = cleanedPart.slice(headerEnd + 4);
    if (rawBody.endsWith('\r\n')) {
      rawBody = rawBody.slice(0, -2);
    }

    const headers = Object.fromEntries(
      rawHeaders.split('\r\n').map((line) => {
        const separator = line.indexOf(':');
        return [
          line.slice(0, separator).toLowerCase(),
          line.slice(separator + 1).trim()
        ];
      })
    );
    const disposition = parseContentDisposition(headers['content-disposition'] || '');

    parts.push({
      name: disposition.name,
      fileName: disposition.filename,
      contentType: headers['content-type'] || 'application/octet-stream',
      data: Buffer.from(rawBody, 'latin1')
    });
  }

  return parts;
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_SIZE) {
      throw new Error('Upload ist zu gross. Maximal erlaubt sind 50 MB.');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch (error) {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function handleConvert(req, res) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    sendJson(res, 400, { error: 'Upload konnte nicht gelesen werden.' });
    return;
  }

  const body = await readRequestBody(req);
  const parts = parseMultipart(body, boundaryMatch[1] || boundaryMatch[2]);
  const yearPart = parts.find((part) => part.name === 'year');
  const year = yearPart ? yearPart.data.toString('utf8').trim() : '';
  const files = parts.filter((part) => part.name === 'pdfs' && part.fileName);

  if (year && !/^\d{4}$/.test(year)) {
    sendJson(res, 400, { error: 'Das Jahr muss vierstellig sein, z.B. 2026.' });
    return;
  }

  if (files.length === 0) {
    sendJson(res, 400, { error: 'Bitte mindestens eine PDF-Datei hochladen.' });
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const results = [];
  const allRows = [];

  for (const file of files) {
    const fileName = path.basename(file.fileName);
    const baseName = sanitizeBaseName(fileName);
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.csv`);

    if (path.extname(fileName).toLowerCase() !== '.pdf') {
      results.push({
        fileName,
        error: 'Keine PDF-Datei.'
      });
      continue;
    }

    try {
      const converted = await convertPdfBuffer(file.data, { year });
      await fs.writeFile(outputPath, toCsv(converted.rows), 'utf8');

      const rows = converted.rows.map((row) => ({
        source_file: fileName,
        ...row
      }));
      allRows.push(...rows);
      results.push({
        fileName,
        outputFile: path.relative(process.cwd(), outputPath),
        rowCount: rows.length
      });
    } catch (error) {
      results.push({
        fileName,
        error: error.message
      });
    }
  }

  if (allRows.length === 0) {
    sendJson(res, 422, {
      error: 'In den hochgeladenen PDFs wurden keine Buchungen erkannt.',
      files: results
    });
    return;
  }

  sendJson(res, 200, {
    files: results,
    rows: allRows
  });
}

async function handleRows(res) {
  sendJson(res, 200, await loadOutputRows());
}

function createServer() {
  return http.createServer((req, res) => {
    Promise.resolve()
      .then(async () => {
        if (req.method === 'POST' && req.url === '/api/convert') {
          await handleConvert(req, res);
          return;
        }

        if (req.method === 'GET' && req.url === '/api/rows') {
          await handleRows(res);
          return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
          await serveStatic(req, res);
          return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      })
      .catch((error) => {
        sendJson(res, 500, { error: error.message });
      });
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Kontoauszug Converter laeuft auf http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  loadOutputRows,
  parseCsvRows,
  parseMultipart,
  sanitizeBaseName
};
