'use strict';

const form = document.querySelector('#upload-form');
const fileInput = document.querySelector('#pdfs');
const fileLabel = document.querySelector('#file-label');
const yearInput = document.querySelector('#year');
const submitButton = document.querySelector('#submit-button');
const statusEl = document.querySelector('#status');
const fileResultsEl = document.querySelector('#file-results');
const searchInput = document.querySelector('#search');
const matchCountEl = document.querySelector('#match-count');
const amountSumEl = document.querySelector('#amount-sum');
const rowsEl = document.querySelector('#rows');

let rows = [];

const amountFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
});

function parseAmount(value) {
  const amount = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(amount) ? amount : 0;
}

function formatAmount(value) {
  return amountFormatter.format(parseAmount(value));
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
}

function rowMatches(row, token) {
  if (!token) {
    return true;
  }

  const haystack = Object.values(row).join(' ').toLowerCase();
  return haystack.includes(token.toLowerCase());
}

function filteredRows() {
  const token = searchInput.value.trim();
  return rows.filter((row) => rowMatches(row, token));
}

function renderRows() {
  const visibleRows = filteredRows();
  const amountSum = visibleRows.reduce((sum, row) => sum + parseAmount(row['Betrag (EUR)']), 0);

  matchCountEl.textContent = String(visibleRows.length);
  amountSumEl.textContent = amountFormatter.format(amountSum);

  if (visibleRows.length === 0) {
    const label = rows.length === 0 ? 'Noch keine Daten geladen.' : 'Keine Treffer.';
    rowsEl.innerHTML = `<tr><td colspan="5" class="empty-cell">${label}</td></tr>`;
    return;
  }

  rowsEl.replaceChildren(
    ...visibleRows.map((row) => {
      const tr = document.createElement('tr');
      const amount = parseAmount(row['Betrag (EUR)']);
      tr.innerHTML = `
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="amount-cell"></td>
      `;

      tr.children[0].textContent = row.source_file || '';
      tr.children[1].textContent = row.Buchung || '';
      tr.children[2].textContent = row.Valuta || '';
      tr.children[3].textContent = row['Buchung / Verwendungszweck'] || '';
      tr.children[4].textContent = formatAmount(row['Betrag (EUR)']);
      tr.children[4].classList.toggle('amount-negative', amount < 0);
      tr.children[4].classList.toggle('amount-positive', amount > 0);

      return tr;
    })
  );
}

function renderFileResults(files) {
  fileResultsEl.replaceChildren(
    ...files.map((file) => {
      const pill = document.createElement('div');
      pill.className = `file-pill${file.error ? ' is-error' : ''}`;
      pill.title = file.error || file.outputFile || file.fileName;
      pill.textContent = file.error
        ? `${file.fileName}: ${file.error}`
        : `${file.fileName}: ${file.rowCount} Zeilen`;
      return pill;
    })
  );
}

async function loadOutputRows(successMessage) {
  setStatus('Lade vorhandene CSV-Dateien ...');

  try {
    const response = await fetch('/api/rows');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Vorhandene CSV-Dateien konnten nicht geladen werden.');
    }

    rows = payload.rows || [];
    renderRows();
    renderFileResults(payload.files || []);

    if (successMessage) {
      setStatus(successMessage);
    } else if (rows.length > 0) {
      setStatus(`${rows.length} Buchungen aus output geladen.`);
    } else {
      setStatus('Keine CSV-Dateien in output gefunden.');
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

function updateFileLabel() {
  const files = [...fileInput.files];

  if (files.length === 0) {
    fileLabel.textContent = 'PDF-Dateien auswaehlen';
    return;
  }

  fileLabel.textContent = files.length === 1 ? files[0].name : `${files.length} PDF-Dateien`;
}

fileInput.addEventListener('change', updateFileLabel);
searchInput.addEventListener('input', renderRows);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const files = [...fileInput.files];
  if (files.length === 0) {
    setStatus('Bitte mindestens eine PDF-Datei auswaehlen.', true);
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append('pdfs', file);
  }
  formData.append('year', yearInput.value.trim());

  submitButton.disabled = true;
  setStatus('Konvertiere PDF-Dateien ...');
  fileResultsEl.replaceChildren();

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    });
    const payload = await response.json();

    if (!response.ok) {
      renderFileResults(payload.files || []);
      setStatus(payload.error || 'Konvertierung fehlgeschlagen.', true);
      return;
    }

    searchInput.value = '';
    await loadOutputRows(`${payload.rows.length} neue Buchungen konvertiert. output wurde neu geladen.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

renderRows();
loadOutputRows();
