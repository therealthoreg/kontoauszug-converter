#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const pdf = require('pdf-parse');
const { toCsv } = require('./csv');
const { normalizeText, parseTransactions } = require('./parser');

const OUTPUT_DIR = 'output';

function printHelp() {
  console.log(`
Usage:
  kontoauszug-converter <input.pdf|ordner...> [options]

Options:
  -o, --output <path>       Dateiname oder Unterordner innerhalb von output
  --merge-output <file>     Alle erkannten Buchungen in eine CSV innerhalb von output schreiben
  --recursive               PDFs in Ordnern rekursiv suchen
  --year <year>             Jahr fuer Datumsangaben ohne Jahr, z.B. 2026
  --delimiter <char>        CSV-Trennzeichen, Standard: ;
  --debug-text <path>       Extrahierten PDF-Text speichern, bei mehreren PDFs als Zielordner
  -h, --help                Hilfe anzeigen
`);
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    output: null,
    mergeOutput: null,
    recursive: false,
    outputIsDirectory: false,
    year: null,
    delimiter: ';',
    debugText: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '-o' || arg === '--output') {
      args.output = argv[++index];
    } else if (arg === '--merge-output') {
      args.mergeOutput = argv[++index];
    } else if (arg === '--recursive') {
      args.recursive = true;
    } else if (arg === '--year') {
      args.year = argv[++index];
    } else if (arg === '--delimiter') {
      args.delimiter = argv[++index];
    } else if (arg === '--debug-text') {
      args.debugText = argv[++index];
    } else if (arg.startsWith('-')) {
      throw new Error(`Unbekanntes Argument: ${arg}`);
    } else {
      args.inputs.push(arg);
    }
  }

  return args;
}

function outputRoot() {
  return path.resolve(OUTPUT_DIR);
}

function relativeOutputPath(outputPath) {
  if (!outputPath) {
    return '';
  }

  let rootlessPath = outputPath;
  if (path.isAbsolute(outputPath)) {
    const cwdRelativePath = path.relative(process.cwd(), outputPath);
    rootlessPath = cwdRelativePath && !cwdRelativePath.startsWith('..') && !path.isAbsolute(cwdRelativePath)
      ? cwdRelativePath
      : path.basename(outputPath);
  }

  const segments = path.normalize(rootlessPath)
    .split(path.sep)
    .filter((segment) => segment && segment !== '.' && segment !== '..');

  if (segments[0] === OUTPUT_DIR) {
    segments.shift();
  }

  return path.join(...segments);
}

function pathInOutput(outputPath) {
  const relativePath = relativeOutputPath(outputPath);
  return relativePath ? path.join(outputRoot(), relativePath) : outputRoot();
}

function outputPathForInput(inputPath, args) {
  const parsed = path.parse(inputPath);
  const outputPath = args.output ? pathInOutput(args.output) : null;

  if (args.inputs.length === 1 && !args.outputIsDirectory && outputPath) {
    if (path.extname(outputPath).toLowerCase() === '.csv') {
      return outputPath;
    }

    return path.join(outputPath, `${parsed.name}.csv`);
  }

  const outputDir = outputPath || outputRoot();
  return path.join(outputDir, `${parsed.name}.csv`);
}

function debugTextPathForInput(inputPath, args) {
  if (!args.debugText) {
    return null;
  }

  if (args.inputs.length === 1 && !args.outputIsDirectory) {
    return path.resolve(args.debugText);
  }

  const parsed = path.parse(inputPath);
  return path.join(path.resolve(args.debugText), `${parsed.name}.txt`);
}

async function collectPdfFiles(inputPath, options = {}) {
  const resolvedPath = path.resolve(inputPath);
  const stat = await fs.stat(resolvedPath);

  if (stat.isFile()) {
    if (path.extname(resolvedPath).toLowerCase() !== '.pdf') {
      throw new Error(`Keine PDF-Datei: ${resolvedPath}`);
    }

    return {
      paths: [resolvedPath],
      wasDirectory: false
    };
  }

  if (!stat.isDirectory()) {
    throw new Error(`Eingabe ist weder Datei noch Ordner: ${resolvedPath}`);
  }

  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const entryPath = path.join(resolvedPath, entry.name);

    if (entry.isDirectory() && options.recursive) {
      const nested = await collectPdfFiles(entryPath, options);
      paths.push(...nested.paths);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') {
      paths.push(entryPath);
    }
  }

  return {
    paths: paths.sort((left, right) => left.localeCompare(right, 'de')),
    wasDirectory: true
  };
}

async function resolveInputPaths(args) {
  const allPaths = [];
  let hasDirectoryInput = false;

  for (const input of args.inputs) {
    const result = await collectPdfFiles(input, { recursive: args.recursive });
    allPaths.push(...result.paths);
    hasDirectoryInput = hasDirectoryInput || result.wasDirectory;
  }

  const uniquePaths = [...new Set(allPaths)].sort((left, right) => left.localeCompare(right, 'de'));

  if (uniquePaths.length === 0) {
    throw new Error('Keine PDF-Dateien gefunden.');
  }

  return {
    inputPaths: uniquePaths,
    hasDirectoryInput
  };
}

async function extractPdfText(inputPath) {
  const buffer = await fs.readFile(inputPath);
  const data = await pdf(buffer);
  return data.text || '';
}

async function convertOne(input, args) {
  const inputPath = input;
  const outputPath = outputPathForInput(inputPath, args);
  const rawText = await extractPdfText(inputPath);
  const normalizedText = normalizeText(rawText);
  const rows = parseTransactions(normalizedText, { year: args.year });
  const debugPath = debugTextPathForInput(inputPath, args);

  if (debugPath) {
    await fs.mkdir(path.dirname(debugPath), { recursive: true });
    await fs.writeFile(debugPath, `${normalizedText}\n`, 'utf8');
  }

  if (rows.length === 0) {
    throw new Error(
      `Keine Buchungen erkannt in ${inputPath}. Speichere den Text mit --debug-text und passe bei Bedarf src/parser.js an.`
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, toCsv(rows, { delimiter: args.delimiter }), 'utf8');

  return {
    inputPath,
    outputPath,
    rows
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.inputs.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  if (args.year && !/^\d{4}$/.test(args.year)) {
    throw new Error('--year muss vierstellig sein, z.B. 2026');
  }

  if (!args.delimiter || args.delimiter.length !== 1) {
    throw new Error('--delimiter muss genau ein Zeichen sein');
  }

  const resolvedInputs = await resolveInputPaths(args);
  const conversionArgs = {
    ...args,
    inputs: resolvedInputs.inputPaths,
    outputIsDirectory: resolvedInputs.hasDirectoryInput || resolvedInputs.inputPaths.length > 1
  };

  if (conversionArgs.outputIsDirectory && args.output && path.extname(args.output).toLowerCase() === '.csv') {
    throw new Error('Bei Ordnern oder mehreren PDFs muss --output ein Zielordner sein. Nutze --merge-output fuer eine gemeinsame CSV-Datei.');
  }

  const results = [];
  for (const input of conversionArgs.inputs) {
    const result = await convertOne(input, conversionArgs);
    results.push(result);
    console.log(`CSV geschrieben: ${result.outputPath}`);
    console.log(`Buchungen erkannt: ${result.rows.length}`);
  }

  if (args.mergeOutput) {
    const mergedRows = results.flatMap((result) =>
      result.rows.map((row) => ({
        source_file: path.basename(result.inputPath),
        ...row
      }))
    );
    const mergeOutputPath = pathInOutput(args.mergeOutput);

    await fs.mkdir(path.dirname(mergeOutputPath), { recursive: true });
    await fs.writeFile(
      mergeOutputPath,
      toCsv(mergedRows, {
        delimiter: args.delimiter,
        columns: ['source_file', 'Buchung', 'Valuta', 'Buchung / Verwendungszweck', 'Betrag (EUR)']
      }),
      'utf8'
    );
    console.log(`Gemeinsame CSV geschrieben: ${mergeOutputPath}`);
    console.log(`Buchungen insgesamt: ${mergedRows.length}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fehler: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  outputPathForInput,
  resolveInputPaths
};
