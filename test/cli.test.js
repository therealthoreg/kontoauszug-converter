'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, outputPathForInput, resolveInputPaths } = require('../src/index');

test('accepts multiple input files', () => {
  const args = parseArgs(['januar.pdf', 'februar.pdf', '--year', '2026']);

  assert.deepEqual(args.inputs, ['januar.pdf', 'februar.pdf']);
  assert.equal(args.year, '2026');
});

test('uses output option as directory for multiple inputs', () => {
  const args = parseArgs(['januar.pdf', 'februar.pdf', '-o', 'export']);
  const outputPath = outputPathForInput(path.resolve('januar.pdf'), args);

  assert.equal(outputPath, path.resolve('export', 'januar.csv'));
});

test('keeps output option as file for one input', () => {
  const args = parseArgs(['januar.pdf', '-o', 'konto.csv']);
  const outputPath = outputPathForInput(path.resolve('januar.pdf'), args);

  assert.equal(outputPath, path.resolve('konto.csv'));
});

test('resolves pdf files from a directory', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontoauszug-test-'));
  await fs.writeFile(path.join(tmpDir, 'februar.PDF'), '');
  await fs.writeFile(path.join(tmpDir, 'notiz.txt'), '');
  await fs.writeFile(path.join(tmpDir, 'januar.pdf'), '');

  const args = parseArgs([tmpDir]);
  const result = await resolveInputPaths(args);

  assert.equal(result.hasDirectoryInput, true);
  assert.deepEqual(result.inputPaths, [
    path.join(tmpDir, 'februar.PDF'),
    path.join(tmpDir, 'januar.pdf')
  ]);
});

test('resolves pdf files from a directory recursively when enabled', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kontoauszug-test-'));
  const nestedDir = path.join(tmpDir, 'unterordner');
  await fs.mkdir(nestedDir);
  await fs.writeFile(path.join(tmpDir, 'januar.pdf'), '');
  await fs.writeFile(path.join(nestedDir, 'februar.pdf'), '');

  const args = parseArgs([tmpDir, '--recursive']);
  const result = await resolveInputPaths(args);

  assert.deepEqual(result.inputPaths, [
    path.join(tmpDir, 'januar.pdf'),
    path.join(nestedDir, 'februar.pdf')
  ]);
});

test('uses output option as directory for directory input even with one pdf', () => {
  const args = {
    ...parseArgs(['kontoauszuege', '-o', 'export']),
    inputs: [path.resolve('kontoauszuege', 'januar.pdf')],
    outputIsDirectory: true
  };
  const outputPath = outputPathForInput(path.resolve('kontoauszuege', 'januar.pdf'), args);

  assert.equal(outputPath, path.resolve('export', 'januar.csv'));
});
