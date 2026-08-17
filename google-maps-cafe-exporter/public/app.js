const form = document.querySelector('#search-form');
const submit = document.querySelector('#submit');
const status = document.querySelector('#status');
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');
const body = document.querySelector('#table-body');
const csvButton = document.querySelector('#csv');
const parserView = document.querySelector('#parser-view');
const arraysView = document.querySelector('#arrays-view');
const scoringsView = document.querySelector('#scorings-view');
const candidatesView = document.querySelector('#candidates-view');
const productionView = document.querySelector('#production-view');
const sendingsView = document.querySelector('#sendings-view');
const tabs = [...document.querySelectorAll('.app-tab')];
const arraysBody = document.querySelector('#arrays-body');
const arraysStatus = document.querySelector('#arrays-status');
const arraysSelectAll = document.querySelector('#arrays-select-all');
const arraysBulkActions = document.querySelector('#arrays-bulk-actions');
const arraysSelectionCount = document.querySelector('#arrays-selection-count');
const arraysBulkDelete = document.querySelector('#arrays-bulk-delete');
const scoringsBody = document.querySelector('#scorings-body');
const scoringsStatus = document.querySelector('#scorings-status');
const scoringsSelectAll = document.querySelector('#scorings-select-all');
const scoringsBulkActions = document.querySelector('#scorings-bulk-actions');
const scoringsSelectionCount = document.querySelector('#scorings-selection-count');
const scoringsBulkDelete = document.querySelector('#scorings-bulk-delete');
const candidatesBody = document.querySelector('#candidates-body');
const candidatesStatus = document.querySelector('#candidates-status');
const candidatesSelectAll = document.querySelector('#candidates-select-all');
const candidatesBulkActions = document.querySelector('#candidates-bulk-actions');
const candidatesSelectionCount = document.querySelector('#candidates-selection-count');
const candidatesBulkDelete = document.querySelector('#candidates-bulk-delete');
const candidateMenuButtons = [...document.querySelectorAll('[data-candidate-menu]')];
const productionMenuButtons = [...document.querySelectorAll('[data-production-menu]')];
const productionStatus = document.querySelector('#production-status');
const productionBody = document.querySelector('#production-body');
const productionSelectAll = document.querySelector('#production-select-all');
const productionRun = document.querySelector('#production-run');
const productionTemplate = document.querySelector('#production-template');
const productionResults = document.querySelector('#production-results');
const productionSummary = document.querySelector('#production-summary');
const productionAudit = document.querySelector('#production-audit');
const productionDownload = document.querySelector('#production-download');
const sendingsBody = document.querySelector('#sendings-body');
const sendingsStatus = document.querySelector('#sendings-status');
const sendingsSelectAll = document.querySelector('#sendings-select-all');
const sendingsBulkDelete = document.querySelector('#sendings-bulk-delete');
const offerDialog = document.querySelector('#offer-dialog');
const offerDialogKind = offerDialog?.querySelector('.eyebrow');
const offerDialogTitle = document.querySelector('#offer-dialog-title');
const offerDialogLanguage = document.querySelector('#offer-dialog-language');
const offerDialogText = document.querySelector('#offer-dialog-text');
const offerDialogClose = document.querySelector('#offer-dialog-close');
let offerDialogSubject = document.querySelector('#offer-dialog-subject');
let offerDialogNote = document.querySelector('#offer-dialog-note');
const stopButton = document.querySelector('#stop');
let rows = [];
let arrays = [];
let arraySort = { key: 'createdAt', direction: 'desc' };
const arraySelections = new Set();
let scorings = [];
let scoringSort = { key: 'scoredAt', direction: 'desc' };
const scoringSelections = new Set();
let candidates = [];
let candidateSort = { key: 'selectedAt', direction: 'desc' };
const candidateBatchSelections = new Set();
let candidateMenuFilter = 'with';
let activeParsing = null;
const arrayDetails = new Map();
const detailsLoading = new Set();
const scoringDetails = new Map();
const scoringDetailsLoading = new Set();
const scoringCafeSorts = new Map();
const candidateDetails = new Map();
const candidateDetailsLoading = new Set();
const candidateCafeSorts = new Map();
const candidateSelections = new Map();
let productionCafes = [];
let productionSelections = new Set();
let productionMenuFilter = 'with';
let productionCafeSort = { key: null, direction: 'asc' };
let productionPackage = null;
const productionApproved = new Set();
let sendings = [];
let sendingSort = { key: null, direction: 'asc' };
const sendingSelections = new Set();

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`;
}

function link(url, label) {
  if (!url) return muted('—');
  const node = document.createElement('a');
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.textContent = label;
  return node;
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return 'Открыть сайт'; }
}

function socialLabel(_network, url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./i, '')}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

function muted(value) {
  const node = document.createElement('span');
  node.className = 'muted';
  node.textContent = value;
  return node;
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function appendLinks(cell, entries) {
  if (!entries.length) return cell.append(muted('—'));
  const list = document.createElement('div');
  list.className = 'link-list';
  entries.forEach(([label, url]) => list.append(link(url, label)));
  cell.append(list);
}

function render() {
  body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.append(link(row.mapsUrl, row.name || 'Открыть в Maps'));
    const address = document.createElement('td'); address.textContent = row.address || '—';
    const reviewCount = document.createElement('td'); reviewCount.textContent = Number.isFinite(row.reviewCount) ? new Intl.NumberFormat('ru-RU').format(row.reviewCount) : '—';
    const website = document.createElement('td'); website.append(link(row.website, row.website ? hostLabel(row.website) : ''));
    const socials = document.createElement('td'); appendLinks(socials, Object.entries(row.socials || {}).map(([network, url]) => [socialLabel(network, url), url]));
    const emails = document.createElement('td');
    if (row.emails?.length) appendLinks(emails, row.emails.map((email) => [email, `mailto:${email}`])); else emails.append(muted('—'));
    const review = document.createElement('td');
    if (row.lastReview) {
      review.append(document.createTextNode(row.lastReview));
      const note = document.createElement('small');
      note.className = 'review-note';
      note.textContent = row.reviewSort || 'Сначала новые';
      review.append(note);
    } else review.append(muted('—'));
    tr.append(name, address, reviewCount, website, socials, emails, review);
    body.append(tr);
  }
  results.hidden = !rows.length;
}

async function downloadXlsx({ headers, rows: spreadsheetRows, filename, sheetName }) {
  const response = await fetch('/api/xlsx', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ headers, rows: spreadsheetRows, sheetName })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Не удалось сформировать Excel-отчёт.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadRowsExcel(sourceRows, filename) {
  const header = ['Название', 'Адрес', 'Google Maps', 'Количество отзывов', 'Сайт', 'Соцсети', 'E-mail', 'Самый новый отзыв', 'Сортировка отзывов'];
  const spreadsheetRows = sourceRows.map((row) => [
    row.name, row.address, row.mapsUrl, row.reviewCount, row.website,
    Object.values(row.socials || {}).join(' | '),
    (row.emails || []).join(' | '), row.lastReview, row.reviewSort
  ]);
  return downloadXlsx({ headers: header, rows: spreadsheetRows, filename, sheetName: 'Кафе' });
}

function setArrayStatus(message, type = '') {
  arraysStatus.textContent = message;
  arraysStatus.className = `table-subtitle ${type}`;
}

function setScoringStatus(message, type = '') {
  scoringsStatus.textContent = message;
  scoringsStatus.className = `table-subtitle ${type}`;
}

function setCandidateStatus(message, type = '') {
  candidatesStatus.textContent = message;
  candidatesStatus.className = `table-subtitle ${type}`;
}

function syncBulkSelection(items, selections, selectAll, panel, count, noun) {
  const availableIds = new Set(items.map((item) => item.id));
  for (const id of selections) {
    if (!availableIds.has(id)) selections.delete(id);
  }
  const selectedCount = selections.size;
  selectAll.checked = Boolean(items.length) && selectedCount === items.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < items.length;
  panel.hidden = selectedCount === 0;
  count.textContent = `Выбрано: ${selectedCount} ${noun}`;
}

function createRowSelection(id, label, attribute, selections) {
  const cell = document.createElement('td');
  cell.className = 'table-select-cell';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selections.has(id);
  checkbox.dataset[attribute] = id;
  checkbox.setAttribute('aria-label', `Выбрать ${label}`);
  cell.append(checkbox);
  return cell;
}

function activateTab(tabName) {
  parserView.hidden = tabName !== 'parser';
  arraysView.hidden = tabName !== 'arrays';
  scoringsView.hidden = tabName !== 'scorings';
  candidatesView.hidden = tabName !== 'candidates';
  productionView.hidden = tabName !== 'production';
  sendingsView.hidden = tabName !== 'sendings';
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === tabName));
  if (tabName === 'arrays') loadArrays();
  if (tabName === 'scorings') loadScorings();
  if (tabName === 'candidates') loadCandidates();
  if (tabName === 'production') loadProduction();
  if (tabName === 'sendings') loadSendings();
}

function compareArrayValues(first, second, key) {
  if (key === 'number') return first.number - second.number;
  if (key === 'createdAt') return new Date(first.createdAt) - new Date(second.createdAt);
  if (key === 'score') {
    if (first.score === null) return 1;
    if (second.score === null) return -1;
    return first.score - second.score;
  }
  if (key === 'action') return Number(Boolean(first.score)) - Number(Boolean(second.score));
  return String(first.name || '').localeCompare(String(second.name || ''), 'ru');
}

function formatArrayDate(value) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function createArrayAction(action, label, id, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `array-action ${className}`.trim();
  button.dataset.arrayAction = action;
  button.dataset.arrayId = id;
  button.textContent = label;
  return button;
}

function createStoredRowsTable(storedRows) {
  const wrapper = document.createElement('div');
  wrapper.className = 'array-details';
  const heading = document.createElement('p');
  heading.className = 'array-details-title';
  heading.textContent = `Карточки в массиве: ${storedRows.length}`;
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap array-details-wrap';
  const table = document.createElement('table');
  table.className = 'stored-rows-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Название', 'Отзывов', 'Сайт', 'Соцсети', 'E-mail', 'Самый новый отзыв'].forEach((label) => {
    const th = document.createElement('th'); th.textContent = label; headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement('tbody');
  for (const row of storedRows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'); name.append(link(row.mapsUrl, row.name || 'Открыть в Google Maps'));
    const reviewCount = document.createElement('td'); reviewCount.textContent = Number.isFinite(row.reviewCount) ? new Intl.NumberFormat('ru-RU').format(row.reviewCount) : '—';
    const website = document.createElement('td'); website.append(link(row.website, row.website ? hostLabel(row.website) : ''));
    const socials = document.createElement('td'); appendLinks(socials, Object.entries(row.socials || {}).map(([network, url]) => [socialLabel(network, url), url]));
    const emails = document.createElement('td');
    if (row.emails?.length) appendLinks(emails, row.emails.map((email) => [email, `mailto:${email}`])); else emails.append(muted('—'));
    const latestReview = document.createElement('td'); latestReview.textContent = row.lastReview || '—';
    tr.append(name, reviewCount, website, socials, emails, latestReview);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  wrapper.append(heading, tableWrap);
  return wrapper;
}

function renderArrays() {
  arraysBody.replaceChildren();
  const sortedArrays = [...arrays].sort((first, second) => compareArrayValues(first, second, arraySort.key) * (arraySort.direction === 'asc' ? 1 : -1));
  for (const item of sortedArrays) {
    const tr = document.createElement('tr');
    const select = createRowSelection(item.id, `массив №${item.number}`, 'arrayCheck', arraySelections);
    const number = document.createElement('td'); number.textContent = item.number;
    const name = document.createElement('td');
    const titleButton = createArrayAction('toggle', item.name, item.id, 'array-name-button');
    titleButton.setAttribute('aria-expanded', String(arrayDetails.has(item.id)));
    const meta = document.createElement('small'); meta.className = 'array-meta'; meta.textContent = `${item.city} · ${item.cardCount} карточек`;
    name.append(titleButton, meta);
    const date = document.createElement('td'); date.textContent = formatArrayDate(item.createdAt);
    const score = document.createElement('td');
    if (Number.isFinite(item.score)) {
      const badge = document.createElement('span'); badge.className = 'score-badge'; badge.textContent = `${item.score} / 100`;
      score.append(badge);
    } else score.append(muted('—'));
    const action = document.createElement('td');
    const actionList = document.createElement('div'); actionList.className = 'array-actions';
    actionList.append(
      createArrayAction('score', Number.isFinite(item.score) ? 'Повт. скоринг' : 'Скоринг', item.id, 'score-button'),
      createArrayAction('download', 'Скачать Excel', item.id, 'download-button'),
      createArrayAction('delete', 'Удалить', item.id, 'delete-button')
    );
    action.append(actionList);
    tr.append(select, number, name, date, score, action);
    arraysBody.append(tr);

    if (arrayDetails.has(item.id) || detailsLoading.has(item.id)) {
      const detailsRow = document.createElement('tr');
      detailsRow.className = 'array-details-row';
      const cell = document.createElement('td'); cell.colSpan = 6;
      if (detailsLoading.has(item.id)) cell.append(muted('Загрузка карточек массива…'));
      else cell.append(createStoredRowsTable(arrayDetails.get(item.id).rows || []));
      detailsRow.append(cell);
      arraysBody.append(detailsRow);
    }
  }
  if (!arrays.length) {
    const tr = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-cell';
    cell.textContent = 'Пока нет сохранённых парсингов. Запустите сбор на вкладке «Парсинг».';
    tr.append(cell);
    arraysBody.append(tr);
  }
  document.querySelectorAll('[data-array-sort]').forEach((button) => {
    const active = button.dataset.arraySort === arraySort.key;
    button.classList.toggle('is-sorted', active);
    button.dataset.direction = active ? arraySort.direction : '';
  });
  syncBulkSelection(arrays, arraySelections, arraysSelectAll, arraysBulkActions, arraysSelectionCount, 'массивов');
}

async function loadArrays() {
  setArrayStatus('Загрузка сохранённых запусков…');
  try {
    const response = await fetch('/api/arrays');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить массивы.');
    arrays = payload.arrays || [];
    renderArrays();
    setArrayStatus(arrays.length ? `Сохранено массивов: ${arrays.length}. Нажмите «Скоринг», чтобы оценить готовность кафе к контакту.` : 'Сохранённых запусков пока нет.');
  } catch (error) {
    arrays = [];
    renderArrays();
    setArrayStatus(error.message || 'Не удалось загрузить массивы.', 'error');
  }
}

csvButton.addEventListener('click', async () => {
  csvButton.disabled = true;
  try {
    await downloadRowsExcel(rows, `cafe-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setStatus('Excel-отчёт скачан.');
  } catch (error) {
    setStatus(error.message || 'Не удалось скачать Excel-отчёт.', 'error');
  } finally {
    csvButton.disabled = false;
  }
});

tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));

const initialTab = window.location.hash.replace('#', '');
if (tabs.some((tab) => tab.dataset.tab === initialTab)) queueMicrotask(() => activateTab(initialTab));

document.querySelectorAll('[data-array-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.arraySort;
  arraySort = {
    key,
    direction: arraySort.key === key && arraySort.direction === 'asc' ? 'desc' : 'asc'
  };
  renderArrays();
}));

arraysBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-array-action]');
  if (!button) return;
  const { arrayAction: action, arrayId: id } = button.dataset;
  const array = arrays.find((item) => item.id === id);
  if (!array) return;

  if (action === 'toggle') {
    if (arrayDetails.has(id)) {
      arrayDetails.delete(id);
      renderArrays();
      return;
    }
    detailsLoading.add(id);
    renderArrays();
    try {
      const response = await fetch(`/api/arrays/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карточки массива.');
      arrayDetails.set(id, payload.array);
    } catch (error) {
      setArrayStatus(error.message || 'Не удалось загрузить карточки массива.', 'error');
    } finally {
      detailsLoading.delete(id);
      renderArrays();
    }
    return;
  }

  if (action === 'download') {
    button.disabled = true;
    try {
      let data = arrayDetails.get(id);
      if (!data) {
        const response = await fetch(`/api/arrays/${id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить массив для Excel.');
        data = payload.array;
        arrayDetails.set(id, data);
      }
      await downloadRowsExcel(data.rows || [], `cafe-array-${array.number}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setArrayStatus(`Excel-отчёт массива №${array.number} скачан.`);
    } catch (error) {
      setArrayStatus(error.message || 'Не удалось скачать Excel-отчёт.', 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Удалить массив №${array.number} «${array.name}»? Это действие нельзя отменить.`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/arrays/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить массив.');
      arrays = arrays.filter((item) => item.id !== id);
      arraySelections.delete(id);
      arrayDetails.delete(id);
      detailsLoading.delete(id);
      const removedScorings = scorings.filter((item) => item.arrayId === id);
      scorings = scorings.filter((item) => item.arrayId !== id);
      removedScorings.forEach((item) => {
        scoringDetails.delete(item.id);
        scoringDetailsLoading.delete(item.id);
        scoringCafeSorts.delete(item.id);
      });
      renderArrays();
      setArrayStatus(`Массив №${payload.deleted.number} удалён.`);
    } catch (error) {
      setArrayStatus(error.message || 'Не удалось удалить массив.', 'error');
      button.disabled = false;
    }
    return;
  }

  button.disabled = true;
  setArrayStatus('Выполняется скоринг сохранённого массива…');
  try {
    const response = await fetch(`/api/arrays/${id}/score`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить скоринг.');
    arrays = arrays.map((item) => item.id === payload.array.id ? payload.array : item);
    if (payload.scoring) {
      const hasScoring = scorings.some((item) => item.id === payload.scoring.id);
      scorings = hasScoring ? scorings.map((item) => item.id === payload.scoring.id ? payload.scoring : item) : scorings;
      scoringDetails.delete(payload.scoring.id);
    }
    renderArrays();
    setArrayStatus(`Скоринг завершён: ${payload.array.score} / 100.`);
  } catch (error) {
    setArrayStatus(error.message || 'Не удалось выполнить скоринг.', 'error');
    button.disabled = false;
  }
});

arraysBody.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-array-check]');
  if (!checkbox) return;
  if (checkbox.checked) arraySelections.add(checkbox.dataset.arrayCheck);
  else arraySelections.delete(checkbox.dataset.arrayCheck);
  renderArrays();
});

arraysSelectAll.addEventListener('change', () => {
  arraySelections.clear();
  if (arraysSelectAll.checked) arrays.forEach((item) => arraySelections.add(item.id));
  renderArrays();
});

arraysBulkDelete.addEventListener('click', async () => {
  const selected = arrays.filter((item) => arraySelections.has(item.id));
  if (!selected.length) return;
  if (!window.confirm(`Удалить выбранные массивы (${selected.length})? Связанные результаты скоринга будут удалены. Это действие нельзя отменить.`)) return;
  arraysBulkDelete.disabled = true;
  setArrayStatus(`Удаляю массивы: 0 из ${selected.length}…`);
  const failed = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    try {
      const response = await fetch(`/api/arrays/${item.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить массив.');
      arrays = arrays.filter((entry) => entry.id !== item.id);
      arraySelections.delete(item.id);
      arrayDetails.delete(item.id);
      detailsLoading.delete(item.id);
      scorings.filter((entry) => entry.arrayId === item.id).forEach((entry) => {
        scoringSelections.delete(entry.id);
        scoringDetails.delete(entry.id);
        scoringDetailsLoading.delete(entry.id);
        scoringCafeSorts.delete(entry.id);
      });
      scorings = scorings.filter((entry) => entry.arrayId !== item.id);
    } catch (error) {
      failed.push(`№${item.number}`);
    }
    setArrayStatus(`Удаляю массивы: ${index + 1} из ${selected.length}…`);
  }
  arraysBulkDelete.disabled = false;
  renderArrays();
  if (failed.length) setArrayStatus(`Удалено массивов: ${selected.length - failed.length}. Не удалось удалить: ${failed.join(', ')}.`, 'error');
  else setArrayStatus(`Удалено массивов: ${selected.length}.`);
});

function compareScoringValues(first, second, key) {
  if (key === 'number') return Number(first.number) - Number(second.number);
  if (key === 'scoredAt') return new Date(first.scoredAt) - new Date(second.scoredAt);
  if (key === 'action') return Number(first.priorityCount || 0) - Number(second.priorityCount || 0);
  return String(first.name || '').localeCompare(String(second.name || ''), 'ru');
}

function compareScoredCafeValues(first, second, key) {
  if (key === 'score') return Number(first.score || 0) - Number(second.score || 0);
  if (key === 'priority') return Number(first.priorityCount || 0) - Number(second.priorityCount || 0);
  if (key === 'lastReview') return Number(first.reviewActivity || 0) - Number(second.reviewActivity || 0);
  if (key === 'email') return Number(Boolean(first.emails?.length)) - Number(Boolean(second.emails?.length));
  if (key === 'socials') return Object.keys(first.socials || {}).length - Object.keys(second.socials || {}).length;
  if (key === 'website') return Number(Boolean(first.website)) - Number(Boolean(second.website));
  return String(first[key] || '').localeCompare(String(second[key] || ''), 'ru');
}

function createScoringAction(action, label, id, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `array-action ${className}`.trim();
  button.dataset.scoringAction = action;
  button.dataset.scoringId = id;
  button.textContent = label;
  return button;
}

async function downloadScoringExcel(scoring) {
  const metric = (row, key) => row.metrics?.[key] ?? 'нет данных';
  const header = [
    'Название', 'Адрес', 'Google Maps', 'Сайт', 'Соцсети', 'E-mail', 'Самый новый отзыв',
    'Нет меню в Google Maps (+5)',
    'Нет меню на сайте (+15)', 'Только один язык меню (+2)', 'Нет аллергенов в меню (+1)',
    'Соцсети в Google Maps (+10)', 'Соцсети на сайте (+5)', 'Отзывов > 25 (+3)', 'Последний отзыв ≤ 1 недели (+7)',
    'Нет меню на английском (+10)',
    'Нет URL сайта в Google Maps (+20)',
    'E-mail в Google Maps (+10)', 'E-mail на сайте (+10)', 'Score', 'Приоритет', 'Причины приоритета'
  ];
  const spreadsheetRows = (scoring.rows || []).map((row) => [
    row.name, row.address, row.mapsUrl, row.website,
    Object.values(row.socials || {}).join(' | '), (row.emails || []).join(' | '),
    row.lastReview,
    metric(row, 'noMapsMenu'),
    metric(row, 'noSiteMenu'), metric(row, 'oneMenuLanguage'), metric(row, 'noAllergens'),
    metric(row, 'mapsSocials'), metric(row, 'siteSocials'), metric(row, 'moreThan25Reviews'), metric(row, 'freshReview'),
    metric(row, 'noEnglishMenu'),
    metric(row, 'noWebsite'),
    metric(row, 'mapsEmail'), metric(row, 'siteEmail'), row.score,
    '⚠️'.repeat(row.priorityCount || 0), (row.priorityReasons || []).join(' | ')
  ]);
  return downloadXlsx({
    headers: header,
    rows: spreadsheetRows,
    filename: `cafe-scoring-${scoring.number}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Скоринг'
  });
}

function createScoringCafeSortButton(label, key, scoringId, sort) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sort-button';
  button.dataset.scoringCafeSort = key;
  button.dataset.scoringId = scoringId;
  button.textContent = label;
  const active = sort.key === key;
  button.classList.toggle('is-sorted', active);
  button.dataset.direction = active ? sort.direction : '';
  return button;
}

function createScoredRowsTable(scoring) {
  const wrapper = document.createElement('div');
  wrapper.className = 'array-details';
  const heading = document.createElement('p');
  heading.className = 'array-details-title';
  heading.textContent = `Кафе после скоринга: ${(scoring.rows || []).length}`;
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap array-details-wrap';
  const table = document.createElement('table');
  table.className = 'scored-rows-table';
  const sort = scoringCafeSorts.get(scoring.id) || { key: 'score', direction: 'desc' };
  const columns = [
    ['name', 'Название'], ['address', 'Адрес'], ['website', 'Сайт'], ['socials', 'Соцсети'],
    ['email', 'E-mail'], ['lastReview', 'Самый новый отзыв'], ['score', 'Score'], ['priority', 'Приоритет']
  ];
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(([key, label]) => {
    const th = document.createElement('th');
    th.append(createScoringCafeSortButton(label, key, scoring.id, sort));
    headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement('tbody');
  const sortedRows = [...(scoring.rows || [])].sort((first, second) => compareScoredCafeValues(first, second, sort.key) * (sort.direction === 'asc' ? 1 : -1));
  for (const row of sortedRows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'); name.append(link(row.mapsUrl, row.name || 'Открыть в Google Maps'));
    const address = document.createElement('td'); address.textContent = row.address || '—';
    const website = document.createElement('td'); website.append(link(row.website, row.website ? hostLabel(row.website) : ''));
    const socials = document.createElement('td'); appendLinks(socials, Object.entries(row.socials || {}).map(([network, url]) => [socialLabel(network, url), url]));
    const emails = document.createElement('td');
    if (row.emails?.length) appendLinks(emails, row.emails.map((email) => [email, `mailto:${email}`])); else emails.append(muted('—'));
    const review = document.createElement('td');
    if (row.lastReview) {
      review.append(document.createTextNode(row.lastReview));
      if (row.reviewSort) { const note = document.createElement('small'); note.className = 'review-note'; note.textContent = row.reviewSort; review.append(note); }
    } else review.append(muted('—'));
    const score = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'score-badge'; badge.textContent = `${row.score} / 100`; score.append(badge);
    const priority = document.createElement('td');
    priority.textContent = row.priorityCount ? '⚠️'.repeat(row.priorityCount) : '—';
    if (row.priorityReasons?.length) priority.title = row.priorityReasons.join('; ');
    tr.append(name, address, website, socials, emails, review, score, priority);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  wrapper.append(heading, tableWrap);
  return wrapper;
}

function renderScorings() {
  scoringsBody.replaceChildren();
  const sortedScorings = [...scorings].sort((first, second) => compareScoringValues(first, second, scoringSort.key) * (scoringSort.direction === 'asc' ? 1 : -1));
  for (const item of sortedScorings) {
    const tr = document.createElement('tr');
    const select = createRowSelection(item.id, `скоринг №${item.number}`, 'scoringCheck', scoringSelections);
    const number = document.createElement('td'); number.textContent = item.number;
    const name = document.createElement('td');
    const titleButton = createScoringAction('toggle', item.name, item.id, 'array-name-button');
    titleButton.setAttribute('aria-expanded', String(scoringDetails.has(item.id)));
    const meta = document.createElement('small'); meta.className = 'array-meta'; meta.textContent = `${item.city} · ${item.cardCount} карточек`;
    name.append(titleButton, meta);
    const date = document.createElement('td'); date.textContent = formatArrayDate(item.scoredAt);
    const action = document.createElement('td');
    const actionList = document.createElement('div'); actionList.className = 'array-actions';
    actionList.append(
      createScoringAction('delete', 'Удалить', item.id, 'delete-button'),
      createScoringAction('repeat', 'Повторить', item.id, 'score-button'),
      createScoringAction('download', 'Скачать Excel', item.id, 'download-button'),
      createScoringAction('candidates', 'Отбор', item.id, 'score-button')
    );
    action.append(actionList);
    tr.append(select, number, name, date, action);
    scoringsBody.append(tr);

    if (scoringDetails.has(item.id) || scoringDetailsLoading.has(item.id)) {
      const detailsRow = document.createElement('tr');
      detailsRow.className = 'array-details-row';
      const cell = document.createElement('td'); cell.colSpan = 5;
      if (scoringDetailsLoading.has(item.id)) cell.append(muted('Загрузка результатов скоринга…'));
      else cell.append(createScoredRowsTable(scoringDetails.get(item.id)));
      detailsRow.append(cell);
      scoringsBody.append(detailsRow);
    }
  }
  if (!scorings.length) {
    const tr = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-cell';
    cell.textContent = 'Результатов скоринга пока нет. Запустите «Скоринг» для массива на предыдущей вкладке.';
    tr.append(cell);
    scoringsBody.append(tr);
  }
  document.querySelectorAll('[data-scoring-sort]').forEach((button) => {
    const active = button.dataset.scoringSort === scoringSort.key;
    button.classList.toggle('is-sorted', active);
    button.dataset.direction = active ? scoringSort.direction : '';
  });
  syncBulkSelection(scorings, scoringSelections, scoringsSelectAll, scoringsBulkActions, scoringsSelectionCount, 'скорингов');
}

async function loadScorings() {
  setScoringStatus('Загрузка результатов скоринга…');
  try {
    const response = await fetch('/api/scorings');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить результаты скоринга.');
    scorings = payload.scorings || [];
    renderScorings();
    setScoringStatus(scorings.length ? `Сохранено скорингов: ${scorings.length}. Нажмите на название, чтобы открыть кафе.` : 'Результатов скоринга пока нет.');
  } catch (error) {
    scorings = [];
    renderScorings();
    setScoringStatus(error.message || 'Не удалось загрузить результаты скоринга.', 'error');
  }
}

document.querySelectorAll('[data-scoring-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.scoringSort;
  scoringSort = {
    key,
    direction: scoringSort.key === key && scoringSort.direction === 'asc' ? 'desc' : 'asc'
  };
  renderScorings();
}));

scoringsBody.addEventListener('click', async (event) => {
  const cafeSortButton = event.target.closest('[data-scoring-cafe-sort]');
  if (cafeSortButton) {
    const { scoringId, scoringCafeSort: key } = cafeSortButton.dataset;
    const current = scoringCafeSorts.get(scoringId) || { key: 'score', direction: 'desc' };
    scoringCafeSorts.set(scoringId, {
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    });
    renderScorings();
    return;
  }

  const button = event.target.closest('[data-scoring-action]');
  if (!button) return;
  const { scoringAction: action, scoringId: id } = button.dataset;
  const scoring = scorings.find((item) => item.id === id);
  if (!scoring) return;

  if (action === 'toggle') {
    if (scoringDetails.has(id)) {
      scoringDetails.delete(id);
      renderScorings();
      return;
    }
    scoringDetailsLoading.add(id);
    renderScorings();
    try {
      const response = await fetch(`/api/scorings/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить кафе после скоринга.');
      scoringDetails.set(id, payload.scoring);
    } catch (error) {
      setScoringStatus(error.message || 'Не удалось загрузить кафе после скоринга.', 'error');
    } finally {
      scoringDetailsLoading.delete(id);
      renderScorings();
    }
    return;
  }

  if (action === 'download') {
    button.disabled = true;
    try {
      let data = scoringDetails.get(id);
      if (!data) {
        const response = await fetch(`/api/scorings/${id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить скоринг для Excel.');
        data = payload.scoring;
        scoringDetails.set(id, data);
      }
      await downloadScoringExcel(data);
      setScoringStatus(`Excel-отчёт скоринга №${scoring.number} скачан.`);
    } catch (error) {
      setScoringStatus(error.message || 'Не удалось скачать Excel-отчёт скоринга.', 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (action === 'candidates') {
    button.disabled = true;
    setScoringStatus('Формируем кандидатов со Score 22 и выше…');
    try {
      const response = await fetch(`/api/scorings/${id}/candidates`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сформировать кандидатов.');
      const count = payload.candidate.candidateCount;
      setScoringStatus(count
        ? `Отбор завершён: ${count} кафе сохранено в разделе «Кандидаты».`
        : 'В этом скоринге нет кафе со Score 22 и выше.');
    } catch (error) {
      setScoringStatus(error.message || 'Не удалось сформировать кандидатов.', 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Удалить результат скоринга №${scoring.number} для «${scoring.name}»? Сам массив кафе останется.`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/scorings/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить результат скоринга.');
      scorings = scorings.filter((item) => item.id !== id);
      scoringSelections.delete(id);
      scoringDetails.delete(id);
      scoringDetailsLoading.delete(id);
      scoringCafeSorts.delete(id);
      renderScorings();
      setScoringStatus(`Скоринг №${payload.deleted.number} удалён. Массив кафе сохранён.`);
    } catch (error) {
      setScoringStatus(error.message || 'Не удалось удалить результат скоринга.', 'error');
      button.disabled = false;
    }
    return;
  }

  button.disabled = true;
  setScoringStatus('Повторный скоринг массива…');
  try {
    const response = await fetch(`/api/scorings/${id}/repeat`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось повторить скоринг.');
    scorings = scorings.map((item) => item.id === payload.scoring.id ? payload.scoring : item);
    scoringDetails.delete(id);
    renderScorings();
    setScoringStatus(`Скоринг №${payload.scoring.number} обновлён.`);
  } catch (error) {
    setScoringStatus(error.message || 'Не удалось повторить скоринг.', 'error');
    button.disabled = false;
  }
});

scoringsBody.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-scoring-check]');
  if (!checkbox) return;
  if (checkbox.checked) scoringSelections.add(checkbox.dataset.scoringCheck);
  else scoringSelections.delete(checkbox.dataset.scoringCheck);
  renderScorings();
});

scoringsSelectAll.addEventListener('change', () => {
  scoringSelections.clear();
  if (scoringsSelectAll.checked) scorings.forEach((item) => scoringSelections.add(item.id));
  renderScorings();
});

scoringsBulkDelete.addEventListener('click', async () => {
  const selected = scorings.filter((item) => scoringSelections.has(item.id));
  if (!selected.length) return;
  if (!window.confirm(`Удалить выбранные результаты скоринга (${selected.length})? Массивы кафе сохранятся. Это действие нельзя отменить.`)) return;
  scoringsBulkDelete.disabled = true;
  setScoringStatus(`Удаляю скоринги: 0 из ${selected.length}…`);
  const failed = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    try {
      const response = await fetch(`/api/scorings/${item.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить результат скоринга.');
      scorings = scorings.filter((entry) => entry.id !== item.id);
      scoringSelections.delete(item.id);
      scoringDetails.delete(item.id);
      scoringDetailsLoading.delete(item.id);
      scoringCafeSorts.delete(item.id);
      arrays = arrays.map((entry) => entry.id === item.arrayId ? { ...entry, score: null, scoredAt: null } : entry);
    } catch (error) {
      failed.push(`№${item.number}`);
    }
    setScoringStatus(`Удаляю скоринги: ${index + 1} из ${selected.length}…`);
  }
  scoringsBulkDelete.disabled = false;
  renderScorings();
  if (failed.length) setScoringStatus(`Удалено скорингов: ${selected.length - failed.length}. Не удалось удалить: ${failed.join(', ')}.`, 'error');
  else setScoringStatus(`Удалено скорингов: ${selected.length}. Массивы кафе сохранены.`);
});

function compareCandidateValues(first, second, key) {
  if (key === 'number') return Number(first.number) - Number(second.number);
  if (key === 'selectedAt') return new Date(first.selectedAt) - new Date(second.selectedAt);
  if (key === 'action') return Number(first.productionCount || 0) - Number(second.productionCount || 0);
  return String(first.name || '').localeCompare(String(second.name || ''), 'ru');
}

function compareCandidateCafeValues(first, second, key) {
  if (key === 'number') return Number(first.candidateNumber) - Number(second.candidateNumber);
  if (key === 'score') return Number(first.score || 0) - Number(second.score || 0);
  if (key === 'priority') return Number(first.priorityCount || 0) - Number(second.priorityCount || 0);
  if (key === 'email') return Number(Boolean(first.emails?.length)) - Number(Boolean(second.emails?.length));
  if (key === 'socials') return Object.keys(first.socials || {}).length - Object.keys(second.socials || {}).length;
  if (key === 'website') return Number(Boolean(first.website)) - Number(Boolean(second.website));
  return String(first[key] || '').localeCompare(String(second[key] || ''), 'ru');
}

function createCandidateAction(action, label, id, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `array-action ${className}`.trim();
  button.dataset.candidateAction = action;
  button.dataset.candidateId = id;
  button.textContent = label;
  return button;
}

async function downloadCandidatesExcel(candidate) {
  const header = ['№', 'Название кафе', 'Google Maps', 'Сайт', 'Соцсети', 'E-mail', 'Score', 'Приоритет', 'Меню на сайте', 'Передано в прод'];
  const spreadsheetRows = (candidate.rows || []).map((row) => [
    row.candidateNumber, row.name, row.mapsUrl, row.website,
    Object.values(row.socials || {}).join(' | '), (row.emails || []).join(' | '),
    row.score, '⚠️'.repeat(row.priorityCount || 0), row.menuOnSite ? 'Есть' : 'Нет',
    row.productionSentAt ? formatArrayDate(row.productionSentAt) : ''
  ]);
  return downloadXlsx({
    headers: header,
    rows: spreadsheetRows,
    filename: `cafe-candidates-${candidate.number}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: 'Кандидаты'
  });
}

function isCandidateVisibleForMenu(row) {
  return candidateMenuFilter === 'with' ? row.menuOnSite === true : row.menuOnSite !== true;
}

function createCandidateCafeSortButton(label, key, candidateId, sort) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sort-button';
  button.dataset.candidateCafeSort = key;
  button.dataset.candidateId = candidateId;
  button.textContent = label;
  const active = sort.key === key;
  button.classList.toggle('is-sorted', active);
  button.dataset.direction = active ? sort.direction : '';
  return button;
}

function createCandidateRowsTable(candidate) {
  const wrapper = document.createElement('div');
  wrapper.className = 'array-details';
  const visibleRows = (candidate.rows || []).filter(isCandidateVisibleForMenu);
  const selected = candidateSelections.get(candidate.id) || new Set();
  const heading = document.createElement('p');
  heading.className = 'array-details-title';
  heading.textContent = `${candidateMenuFilter === 'with' ? 'Кафе с меню на сайте' : 'Кафе без меню на сайте'}: ${visibleRows.length}`;
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap array-details-wrap';
  const table = document.createElement('table');
  table.className = 'candidate-rows-table';
  const sort = candidateCafeSorts.get(candidate.id) || { key: 'score', direction: 'desc' };
  const columns = [
    ['number', '№'], ['name', 'Название кафе'], ['website', 'Сайт'], ['socials', 'Соцсети'],
    ['email', 'E-mail'], ['score', 'Score'], ['priority', 'Приоритет']
  ];
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const selectHeader = document.createElement('th');
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.title = 'Выбрать все кафе в текущем списке';
  selectAll.dataset.candidateSelectAll = 'true';
  selectAll.dataset.candidateId = candidate.id;
  selectAll.checked = Boolean(visibleRows.length) && visibleRows.every((row) => selected.has(row.candidateNumber));
  selectAll.indeterminate = visibleRows.some((row) => selected.has(row.candidateNumber)) && !selectAll.checked;
  selectHeader.append(selectAll);
  headerRow.append(selectHeader);
  columns.forEach(([key, label]) => {
    const th = document.createElement('th');
    th.append(createCandidateCafeSortButton(label, key, candidate.id, sort));
    headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement('tbody');
  const sortedRows = [...visibleRows].sort((first, second) => compareCandidateCafeValues(first, second, sort.key) * (sort.direction === 'asc' ? 1 : -1));
  if (!sortedRows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length + 1;
    td.className = 'empty-cell';
    td.textContent = candidateMenuFilter === 'with' ? 'В этой подборке нет кафе с меню на сайте.' : 'В этой подборке нет кафе без меню на сайте.';
    tr.append(td);
    tbody.append(tr);
  }
  for (const row of sortedRows) {
    const tr = document.createElement('tr');
    const select = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(row.candidateNumber);
    checkbox.dataset.candidateCheck = 'true';
    checkbox.dataset.candidateId = candidate.id;
    checkbox.dataset.candidateNumber = String(row.candidateNumber);
    checkbox.setAttribute('aria-label', `Выбрать ${row.name}`);
    select.append(checkbox);
    const number = document.createElement('td'); number.textContent = row.candidateNumber;
    const name = document.createElement('td'); name.append(link(row.mapsUrl, row.name || 'Открыть в Google Maps'));
    const website = document.createElement('td'); website.append(link(row.website, row.website ? hostLabel(row.website) : ''));
    const socials = document.createElement('td'); appendLinks(socials, Object.entries(row.socials || {}).map(([network, url]) => [socialLabel(network, url), url]));
    const emails = document.createElement('td');
    if (row.emails?.length) appendLinks(emails, row.emails.map((email) => [email, `mailto:${email}`])); else emails.append(muted('—'));
    const score = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'score-badge'; badge.textContent = `${row.score} / 100`; score.append(badge);
    const priority = document.createElement('td');
    priority.textContent = row.priorityCount ? '⚠️'.repeat(row.priorityCount) : '—';
    if (row.priorityReasons?.length) priority.title = row.priorityReasons.join('; ');
    tr.append(select, number, name, website, socials, emails, score, priority);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  wrapper.append(heading, tableWrap);
  return wrapper;
}

function renderCandidates() {
  candidatesBody.replaceChildren();
  const sortedCandidates = [...candidates].sort((first, second) => compareCandidateValues(first, second, candidateSort.key) * (candidateSort.direction === 'asc' ? 1 : -1));
  for (const item of sortedCandidates) {
    const tr = document.createElement('tr');
    const select = createRowSelection(item.id, `подборку кандидатов №${item.number}`, 'candidateBatchCheck', candidateBatchSelections);
    const number = document.createElement('td'); number.textContent = item.number;
    const name = document.createElement('td');
    const titleButton = createCandidateAction('toggle', item.name, item.id, 'array-name-button');
    titleButton.setAttribute('aria-expanded', String(candidateDetails.has(item.id)));
    const currentCount = candidateMenuFilter === 'with' ? item.withMenuCount : item.withoutMenuCount;
    const meta = document.createElement('small'); meta.className = 'array-meta'; meta.textContent = `${item.city} · ${item.candidateCount} кандидатов · ${currentCount} в текущем разделе`;
    name.append(titleButton, meta);
    const date = document.createElement('td'); date.textContent = formatArrayDate(item.selectedAt);
    const action = document.createElement('td');
    const actionList = document.createElement('div'); actionList.className = 'array-actions';
    actionList.append(
      createCandidateAction('delete', 'Удалить', item.id, 'delete-button'),
      createCandidateAction('download', 'Скачать Excel', item.id, 'download-button'),
      createCandidateAction('production', 'Передать в прод', item.id, 'score-button')
    );
    action.append(actionList);
    tr.append(select, number, name, date, action);
    candidatesBody.append(tr);

    if (candidateDetails.has(item.id) || candidateDetailsLoading.has(item.id)) {
      const detailsRow = document.createElement('tr');
      detailsRow.className = 'array-details-row';
      const cell = document.createElement('td'); cell.colSpan = 5;
      if (candidateDetailsLoading.has(item.id)) cell.append(muted('Загрузка кандидатов…'));
      else cell.append(createCandidateRowsTable(candidateDetails.get(item.id)));
      detailsRow.append(cell);
      candidatesBody.append(detailsRow);
    }
  }
  if (!candidates.length) {
    const tr = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-cell';
    cell.textContent = 'Подборок кандидатов пока нет. Нажмите «Отбор» в разделе «Скоринг».';
    tr.append(cell);
    candidatesBody.append(tr);
  }
  document.querySelectorAll('[data-candidate-sort]').forEach((button) => {
    const active = button.dataset.candidateSort === candidateSort.key;
    button.classList.toggle('is-sorted', active);
    button.dataset.direction = active ? candidateSort.direction : '';
  });
  candidateMenuButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.candidateMenu === candidateMenuFilter));
  syncBulkSelection(candidates, candidateBatchSelections, candidatesSelectAll, candidatesBulkActions, candidatesSelectionCount, 'подборок');
}

async function loadCandidates() {
  setCandidateStatus('Загрузка кандидатов…');
  try {
    const response = await fetch('/api/candidates');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить кандидатов.');
    candidates = payload.candidates || [];
    renderCandidates();
    const total = candidates.reduce((sum, item) => sum + Number(item.candidateCount || 0), 0);
    setCandidateStatus(candidates.length ? `Сохранено подборок: ${candidates.length}. Всего кандидатов: ${total}.` : 'Подборок кандидатов пока нет.');
  } catch (error) {
    candidates = [];
    renderCandidates();
    setCandidateStatus(error.message || 'Не удалось загрузить кандидатов.', 'error');
  }
}

function setProductionStatus(message, type = '') {
  productionStatus.textContent = message;
  productionStatus.className = `table-subtitle ${type}`;
}

function renderProductionCafes() {
  productionBody.replaceChildren();
  productionSelectAll.checked = Boolean(productionCafes.length) && productionCafes.every((cafe) => productionSelections.has(cafe.productionId));
  productionSelectAll.indeterminate = productionCafes.some((cafe) => productionSelections.has(cafe.productionId)) && !productionSelectAll.checked;
  productionRun.disabled = !productionSelections.size;
  if (!productionCafes.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty-cell';
    td.textContent = 'В проде пока нет кафе. Во вкладке «Кандидаты» откройте подборку, отметьте кафе чекбоксами и нажмите «Передать в прод».';
    tr.append(td);
    productionBody.append(tr);
    return;
  }
  for (const cafe of productionCafes) {
    const tr = document.createElement('tr');
    const select = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = productionSelections.has(cafe.productionId);
    checkbox.dataset.productionCheck = cafe.productionId;
    checkbox.setAttribute('aria-label', `Выбрать ${cafe.name}`);
    select.append(checkbox);
    const name = document.createElement('td');
    name.innerHTML = `<strong>${escapeHtml(cafe.name)}</strong><small class="array-meta">${escapeHtml(cafe.address || cafe.city || '')}</small>`;
    const website = document.createElement('td');
    website.append(link(cafe.website, cafe.website ? hostLabel(cafe.website) : ''));
    const score = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'score-badge';
    badge.textContent = `${cafe.score ?? '—'} / 100`;
    score.append(badge);
    const source = document.createElement('td');
    source.textContent = `Подборка №${cafe.batchNumber || '—'} · ${cafe.batchName || '—'}`;
    const sent = document.createElement('td');
    sent.textContent = cafe.productionSentAt ? formatArrayDate(cafe.productionSentAt) : '—';
    tr.append(select, name, website, score, source, sent);
    productionBody.append(tr);
  }
}

async function loadProduction() {
  return loadProductionFull();
}

function assetCard(asset, brandIndex) {
  const id = `${brandIndex}:${asset.id}`;
  const chosen = productionApproved.has(id);
  return `<button class="prod-asset-card ${chosen ? 'is-approved' : ''}" type="button" data-prod-approve="${escapeHtml(id)}">
    <span class="prod-asset-preview">${asset.previewUrl ? `<img src="${escapeHtml(asset.previewUrl)}" alt="${escapeHtml(asset.label)}" loading="lazy" />` : 'Нет превью'}</span>
    <strong>${escapeHtml(asset.label)}</strong>
    <small>${escapeHtml(asset.kind)}${asset.recommended ? ' · кандидат системы' : ''}</small>
    <em>${chosen ? 'Подтверждено' : 'Подтвердить'}</em>
  </button>`;
}

function colorSwatch(color) {
  return `<span class="prod-color"><i style="background:${escapeHtml(color.value)}"></i>${escapeHtml(color.value)} <small>${color.mentions}</small></span>`;
}

function renderProductionPackage() {
  if (!productionPackage) return;
  const { template, brands, validation } = productionPackage;
  productionResults.hidden = false;
  productionSummary.innerHTML = `<article><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(template.structure.note)}</span></article><article><strong>${validation.status}</strong><span>${validation.errors} ошибок · ${validation.warnings} предупреждений</span></article>`;
  productionAudit.innerHTML = brands.map((brand, index) => {
    const menu = brand.contentAssets?.menuByLanguage?.[0];
    const fonts = brand.typography?.fonts || [];
    const colors = [...(brand.colorRoles?.text || []), ...(brand.colorRoles?.surface || [])];
    const seo = brand.contentAssets?.seoDrafts || [];
    const contacts = brand.contacts || {};
    return `<section class="prod-brand">
      <div class="prod-brand-head">
        <div><p class="eyebrow">кафе ${index + 1}</p><h2>${escapeHtml(brand.cafe.name)}</h2><p>${escapeHtml(brand.cafe.address || '')}</p></div>
        ${brand.source?.url ? `<a href="${escapeHtml(brand.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(hostLabel(brand.source.url))} ↗</a>` : ''}
      </div>
      <div class="prod-grid">
        <article><h3>Шрифты</h3>${fonts.length ? fonts.map((font) => `<p><strong>${escapeHtml(font.family)}</strong><br><a href="${escapeHtml(font.evidenceUrl)}" target="_blank" rel="noreferrer">CSS-источник ↗</a></p>`).join('') : '<p class="muted">Не найдены.</p>'}</article>
        <article><h3>Цвета</h3><div class="prod-colors">${colors.length ? colors.map(colorSwatch).join('') : '<span class="muted">Не найдены.</span>'}</div></article>
        <article><h3>Контакты</h3><p>${escapeHtml(contacts.address || '—')}</p><p>${escapeHtml(contacts.phone || '')}</p><p>${escapeHtml(contacts.email || '')}</p></article>
      </div>
      <article class="prod-section"><h3>Текстовые ассеты</h3><div class="prod-seo">${seo.map((draft) => `<button class="prod-text-card ${productionApproved.has(`${index}:${draft.id}`) ? 'is-approved' : ''}" type="button" data-prod-approve="${index}:${escapeHtml(draft.id)}"><strong>${escapeHtml(draft.language.label)}</strong><span>H1: ${escapeHtml(draft.h1)}</span><span>Title: ${escapeHtml(draft.title)}</span><small>${escapeHtml(draft.description)}</small></button>`).join('')}</div></article>
      <article class="prod-section"><h3>Меню: текст и цены</h3>${menu?.items?.length ? `<div class="prod-menu">${menu.items.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.price)}</span><small>${escapeHtml(item.description || item.productType)}</small></div>`).join('')}</div>` : '<p class="muted">Меню с ценами не найдено в HTML сайта.</p>'}</article>
      <article class="prod-section"><h3>Ассеты сайта клиента</h3><div class="prod-assets">${brand.assets?.length ? brand.assets.map((asset) => assetCard(asset, index)).join('') : '<p class="muted">Ассеты не найдены.</p>'}</div></article>
    </section>`;
  }).join('');
}

async function runProductionAudit() {
  if (!productionSelections.size) {
    setProductionStatus('Выберите хотя бы одно кафе в проде.', 'error');
    return;
  }
  productionRun.disabled = true;
  setProductionStatus('Собираю ассеты, CSS-шрифты, цвета, тексты и меню с сайтов клиентов…');
  try {
    const response = await fetch('/api/production/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productionIds: [...productionSelections], templateId: productionTemplate.value })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось собрать prod package.');
    productionPackage = payload.audit;
    productionApproved.clear();
    renderProductionPackage();
    setProductionStatus(`Готово: собрано бренд-пакетов ${productionPackage.brands.length}. Подтвердите нужные ассеты вручную.`, productionPackage.validation.warnings ? 'error' : '');
  } catch (error) {
    setProductionStatus(error.message || 'Не удалось собрать prod package.', 'error');
  } finally {
    productionRun.disabled = !productionSelections.size;
  }
}

document.querySelectorAll('[data-candidate-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.candidateSort;
  candidateSort = {
    key,
    direction: candidateSort.key === key && candidateSort.direction === 'asc' ? 'desc' : 'asc'
  };
  renderCandidates();
}));

candidateMenuButtons.forEach((button) => button.addEventListener('click', () => {
  candidateMenuFilter = button.dataset.candidateMenu;
  renderCandidates();
}));

candidatesBody.addEventListener('change', (event) => {
  const batchCheckbox = event.target.closest('[data-candidate-batch-check]');
  if (batchCheckbox) {
    if (batchCheckbox.checked) candidateBatchSelections.add(batchCheckbox.dataset.candidateBatchCheck);
    else candidateBatchSelections.delete(batchCheckbox.dataset.candidateBatchCheck);
    renderCandidates();
    return;
  }
  const all = event.target.closest('[data-candidate-select-all]');
  const checkbox = event.target.closest('[data-candidate-check]');
  const target = all || checkbox;
  if (!target) return;
  const candidate = candidateDetails.get(target.dataset.candidateId);
  if (!candidate) return;
  const selected = new Set(candidateSelections.get(candidate.id) || []);
  if (all) {
    const visibleRows = (candidate.rows || []).filter(isCandidateVisibleForMenu);
    visibleRows.forEach((row) => {
      if (all.checked) selected.add(row.candidateNumber);
      else selected.delete(row.candidateNumber);
    });
  } else {
    const number = Number(target.dataset.candidateNumber);
    if (target.checked) selected.add(number);
    else selected.delete(number);
  }
  candidateSelections.set(candidate.id, selected);
  renderCandidates();
});

candidatesBody.addEventListener('click', async (event) => {
  const cafeSortButton = event.target.closest('[data-candidate-cafe-sort]');
  if (cafeSortButton) {
    const { candidateId, candidateCafeSort: key } = cafeSortButton.dataset;
    const current = candidateCafeSorts.get(candidateId) || { key: 'score', direction: 'desc' };
    candidateCafeSorts.set(candidateId, {
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    });
    renderCandidates();
    return;
  }

  const button = event.target.closest('[data-candidate-action]');
  if (!button) return;
  const { candidateAction: action, candidateId: id } = button.dataset;
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) return;

  if (action === 'toggle') {
    if (candidateDetails.has(id)) {
      candidateDetails.delete(id);
      renderCandidates();
      return;
    }
    candidateDetailsLoading.add(id);
    renderCandidates();
    try {
      const response = await fetch(`/api/candidates/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить кандидатов.');
      candidateDetails.set(id, payload.candidate);
    } catch (error) {
      setCandidateStatus(error.message || 'Не удалось загрузить кандидатов.', 'error');
    } finally {
      candidateDetailsLoading.delete(id);
      renderCandidates();
    }
    return;
  }

  if (action === 'download') {
    button.disabled = true;
    try {
      let data = candidateDetails.get(id);
      if (!data) {
        const response = await fetch(`/api/candidates/${id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить кандидатов для Excel.');
        data = payload.candidate;
        candidateDetails.set(id, data);
      }
      await downloadCandidatesExcel(data);
      setCandidateStatus(`Excel-отчёт подборки №${candidate.number} скачан.`);
    } catch (error) {
      setCandidateStatus(error.message || 'Не удалось скачать Excel-отчёт кандидатов.', 'error');
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Удалить подборку кандидатов №${candidate.number} для «${candidate.name}»? Это действие нельзя отменить.`)) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить подборку кандидатов.');
      candidates = candidates.filter((item) => item.id !== id);
      candidateBatchSelections.delete(id);
      candidateDetails.delete(id);
      candidateDetailsLoading.delete(id);
      candidateCafeSorts.delete(id);
      candidateSelections.delete(id);
      renderCandidates();
      setCandidateStatus(`Подборка кандидатов №${payload.deleted.number} удалена.`);
    } catch (error) {
      setCandidateStatus(error.message || 'Не удалось удалить подборку кандидатов.', 'error');
      button.disabled = false;
    }
    return;
  }

  const selectedNumbers = [...(candidateSelections.get(id) || [])];
  if (!selectedNumbers.length) {
    setCandidateStatus('Выберите кафе чекбоксами перед передачей в прод.', 'error');
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch(`/api/candidates/${id}/production`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateNumbers: selectedNumbers })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось передать кандидатов в прод.');
    candidates = candidates.map((item) => item.id === id ? payload.candidate : item);
    candidateSelections.set(id, new Set());
    renderCandidates();
    setCandidateStatus(`Передано в прод: ${payload.sentCount} кафе.`);
    await loadProduction();
    activateTab('production');
  } catch (error) {
    setCandidateStatus(error.message || 'Не удалось передать кандидатов в прод.', 'error');
    button.disabled = false;
  }
});

candidatesSelectAll.addEventListener('change', () => {
  candidateBatchSelections.clear();
  if (candidatesSelectAll.checked) candidates.forEach((item) => candidateBatchSelections.add(item.id));
  renderCandidates();
});

candidatesBulkDelete.addEventListener('click', async () => {
  const selected = candidates.filter((item) => candidateBatchSelections.has(item.id));
  if (!selected.length) return;
  if (!window.confirm(`Удалить выбранные подборки кандидатов (${selected.length})? Переданные в прод кафе останутся в проде. Это действие нельзя отменить.`)) return;
  candidatesBulkDelete.disabled = true;
  setCandidateStatus(`Удаляю подборки: 0 из ${selected.length}…`);
  const failed = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    try {
      const response = await fetch(`/api/candidates/${item.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось удалить подборку кандидатов.');
      candidates = candidates.filter((entry) => entry.id !== item.id);
      candidateBatchSelections.delete(item.id);
      candidateDetails.delete(item.id);
      candidateDetailsLoading.delete(item.id);
      candidateCafeSorts.delete(item.id);
      candidateSelections.delete(item.id);
    } catch (error) {
      failed.push(`№${item.number}`);
    }
    setCandidateStatus(`Удаляю подборки: ${index + 1} из ${selected.length}…`);
  }
  candidatesBulkDelete.disabled = false;
  renderCandidates();
  if (failed.length) setCandidateStatus(`Удалено подборок: ${selected.length - failed.length}. Не удалось удалить: ${failed.join(', ')}.`, 'error');
  else setCandidateStatus(`Удалено подборок кандидатов: ${selected.length}.`);
});

productionBody.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-production-check]');
  if (!checkbox) return;
  if (checkbox.checked) productionSelections.add(checkbox.dataset.productionCheck);
  else productionSelections.delete(checkbox.dataset.productionCheck);
  renderProductionCafes();
});

productionSelectAll.addEventListener('change', () => {
  productionSelections = productionSelectAll.checked ? new Set(productionCafes.map((cafe) => cafe.productionId)) : new Set();
  renderProductionCafes();
});

productionRun.addEventListener('click', runProductionAudit);

productionAudit.addEventListener('click', (event) => {
  const button = event.target.closest('[data-prod-approve]');
  if (!button) return;
  const id = button.dataset.prodApprove;
  if (productionApproved.has(id)) productionApproved.delete(id);
  else productionApproved.add(id);
  renderProductionPackage();
});

productionDownload.addEventListener('click', () => {
  if (!productionPackage) return;
  const payload = { ...productionPackage, manualApproval: [...productionApproved] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prod-package-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeParsing) return;
  const values = new FormData(form);
  const jobId = crypto.randomUUID();
  const controller = new AbortController();
  activeParsing = { jobId, controller };
  rows = [];
  render();
  summary.hidden = true;
  submit.disabled = true;
  stopButton.hidden = false;
  stopButton.disabled = false;
  setStatus('Запуск Chromium и поиск в Google Maps. Это может занять несколько минут…', 'loading');
  try {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ jobId, city: values.get('city'), radiusKm: Number(values.get('radius')), limit: Number(values.get('limit')) })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить сбор.');
    rows = payload.rows || [];
    render();
    await loadArrays();
    summary.hidden = false;
    const savedNotice = payload.array ? ` Сохранено в «Массивы» как №${payload.array.number}.` : '';
    const foodFilterNotice = Number(payload.skippedNonFood) > 0
      ? ` Отсеяно не-общепита по типу Google Maps: ${payload.skippedNonFood}.`
      : '';
    summary.textContent = `Центр поиска: ${payload.center.lat.toFixed(5)}, ${payload.center.lng.toFixed(5)}. Найдено карточек в выдаче: ${payload.scanned}.${foodFilterNotice} В таблицу попало: ${rows.length}.${savedNotice}`;
    setStatus(rows.length ? 'Готово. Таблицу можно скачать в Excel.' : 'По этому запросу ничего не найдено. Уточните город или увеличьте радиус.');
  } catch (error) {
    if (error.name === 'AbortError') setStatus('Парсинг остановлен. Незавершённый запуск не сохранён.');
    else setStatus(error.message || 'Неизвестная ошибка.', 'error');
  } finally {
    if (activeParsing?.jobId === jobId) {
      activeParsing = null;
      submit.disabled = false;
      stopButton.hidden = true;
      stopButton.disabled = false;
    }
  }
});

stopButton.addEventListener('click', async () => {
  if (!activeParsing) return;
  const { jobId, controller } = activeParsing;
  stopButton.disabled = true;
  setStatus('Останавливаем парсинг и закрываем Chromium…', 'loading');
  try {
    await fetch(`/api/export/${jobId}/stop`, { method: 'POST' });
  } catch {
    // Даже если ответ не успел прийти, отменяем ожидание исходного запроса в браузере.
  } finally {
    controller.abort();
  }
});

function setSendingsStatus(message, type = '') {
  if (!sendingsStatus) return;
  sendingsStatus.textContent = message;
  sendingsStatus.className = `table-subtitle ${type}`;
}

function sendingSortValue(item, key) {
  if (key === 'language') return item.nativeLanguage?.label || item.nativeLanguage?.code || '';
  if (key === 'landingUrl') return item.landingUrl || '';
  if (key === 'adminUrl') return item.adminUrl || '';
  if (key === 'template') return item.template?.name || '';
  if (key === 'emails') return (item.emails || []).join(' ');
  if (key === 'socials') return sendingSocialEntries(item.socials).map(({ network, url }) => `${network} ${url}`).join(' ');
  if (key === 'phone') return item.phone || '';
  if (key === 'password') return item.adminPassword || '';
  return item.cafeName || '';
}

function sortedSendings() {
  const result = sendings.slice();
  if (!sendingSort.key) return result;
  const multiplier = sendingSort.direction === 'asc' ? 1 : -1;
  return result.sort((first, second) => String(sendingSortValue(first, sendingSort.key))
    .localeCompare(String(sendingSortValue(second, sendingSort.key)), 'ru', { numeric: true, sensitivity: 'base' }) * multiplier);
}

function sendingLink(url, label) {
  const clean = String(url || '').trim();
  if (!clean) return muted('—');
  const anchor = document.createElement('a');
  anchor.href = clean;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = label || hostLabel(clean);
  return anchor;
}

function sendingContactLinks(values, kind = 'email') {
  const container = document.createElement('div');
  container.className = 'link-list';
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) {
    container.append(muted('—'));
    return container;
  }
  list.forEach((value) => {
    const address = String(value || '').trim();
    const anchor = document.createElement('a');
    anchor.href = kind === 'email' ? `mailto:${address}` : `tel:${address.replace(/\s+/gu, '')}`;
    anchor.textContent = address;
    container.append(anchor);
  });
  return container;
}

function sendingSocialEntries(socials) {
  if (Array.isArray(socials)) {
    return socials
      .map((entry) => typeof entry === 'string' ? { network: 'social', url: entry } : entry)
      .filter((entry) => entry && entry.url);
  }
  return Object.entries(socials || {})
    .flatMap(([network, rawValue]) => (Array.isArray(rawValue) ? rawValue : [rawValue])
      .map((url) => ({ network, url })))
    .filter((entry) => entry.url);
}

function sendingSocialLinks(socials) {
  const container = document.createElement('div');
  container.className = 'link-list';
  const entries = sendingSocialEntries(socials);
  if (!entries.length) {
    container.append(muted('—'));
    return container;
  }
  entries.forEach(({ network, url }) => container.append(sendingLink(url, socialLabel(network, url))));
  return container;
}

function ensureSendingMessageHeaders() {
  const headerRow = document.querySelector('#sendings-view .sendings-table thead tr');
  if (!headerRow) return;
  let passwordHeader = headerRow.querySelector('[data-sending-password-header]');
  if (!passwordHeader) {
    passwordHeader = [...headerRow.children].at(-1);
    if (passwordHeader) {
      passwordHeader.dataset.sendingPasswordHeader = 'true';
      const passwordSort = document.createElement('button');
      passwordSort.className = 'sort-button';
      passwordSort.type = 'button';
      passwordSort.dataset.sendingSort = 'password';
      passwordSort.textContent = 'Пароль';
      passwordHeader.replaceChildren(passwordSort);
    }
  }
  if (!headerRow.querySelector('[data-sending-mail-header]')) {
    const mailHeader = document.createElement('th');
    mailHeader.dataset.sendingMailHeader = 'true';
    mailHeader.textContent = 'Мейл';
    headerRow.append(mailHeader);
  }
  if (!headerRow.querySelector('[data-sending-chat-header]')) {
    const chatHeader = document.createElement('th');
    chatHeader.dataset.sendingChatHeader = 'true';
    chatHeader.textContent = 'Чаты';
    headerRow.append(chatHeader);
  }
}

function ensureOfferDialogFields() {
  if (!offerDialog) return;
  if (!offerDialogSubject) {
    offerDialogSubject = document.createElement('p');
    offerDialogSubject.id = 'offer-dialog-subject';
    offerDialogSubject.className = 'offer-dialog-subject';
    offerDialogText?.before(offerDialogSubject);
  }
  if (!offerDialogNote) {
    offerDialogNote = document.createElement('p');
    offerDialogNote.id = 'offer-dialog-note';
    offerDialogNote.className = 'offer-dialog-note';
    offerDialogText?.after(offerDialogNote);
  }
}

function renderSendingSortButtons() {
  document.querySelectorAll('[data-sending-sort]').forEach((button) => {
    const label = button.dataset.sendingLabel || button.textContent.trim();
    button.dataset.sendingLabel = label;
    const isCurrent = sendingSort.key === button.dataset.sendingSort;
    button.classList.toggle('is-sorted', isCurrent);
    button.textContent = `${label}${isCurrent ? (sendingSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}`;
  });
}

function renderSendings() {
  if (!sendingsBody) return;
  ensureSendingMessageHeaders();
  const visible = sortedSendings();
  const availableIds = new Set(sendings.map((item) => item.id));
  for (const id of sendingSelections) {
    if (!availableIds.has(id)) sendingSelections.delete(id);
  }

  sendingsBody.replaceChildren();
  if (!visible.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 12;
    cell.className = 'sending-empty-cell';
    cell.textContent = 'Очередь пуста. Опубликуйте демо в разделе «Прод» и передайте кафе в «Отправку». ';
    row.append(cell);
    sendingsBody.append(row);
  }

  visible.forEach((item) => {
    const row = document.createElement('tr');
    row.append(createRowSelection(item.id, item.cafeName || 'кафе', 'sendingSelection', sendingSelections));

    const cafe = document.createElement('td');
    cafe.className = 'sending-cafe';
    const name = document.createElement('strong');
    name.textContent = item.cafeName || 'Кафе';
    cafe.append(name);
    if (item.city) {
      const city = document.createElement('small');
      city.textContent = item.city;
      cafe.append(city);
    }

    const language = document.createElement('td');
    language.textContent = item.nativeLanguage?.label || item.nativeLanguage?.code || '—';
    const landing = document.createElement('td');
    landing.append(sendingLink(item.landingUrl, 'Открыть ↗'));
    const admin = document.createElement('td');
    admin.append(sendingLink(item.adminUrl, 'Открыть ↗'));
    const template = document.createElement('td');
    template.textContent = item.template?.name || '—';
    const emails = document.createElement('td');
    emails.append(sendingContactLinks(item.emails, 'email'));
    const socials = document.createElement('td');
    socials.append(sendingSocialLinks(item.socials));
    const phone = document.createElement('td');
    phone.append(sendingContactLinks(item.phone ? [item.phone] : [], 'phone'));
    const password = document.createElement('td');
    password.className = 'sending-password';
    password.textContent = item.adminPassword || 'Не сохранён';
    const offer = document.createElement('td');
    offer.className = 'sending-offer-cell';
    const offerButton = document.createElement('button');
    offerButton.type = 'button';
    offerButton.className = 'sending-offer-button';
    offerButton.dataset.sendingOffer = item.id;
    offerButton.dataset.sendingMessageType = 'email';
    offerButton.title = 'Открыть текст письма';
    offerButton.setAttribute('aria-label', `Открыть письмо для ${item.cafeName || 'кафе'}`);
    offerButton.textContent = '✉';
    offer.append(offerButton);
    offer.append(createSendingCopyButton(item, 'email'));

    const chats = document.createElement('td');
    chats.className = 'sending-offer-cell';
    const chatLinks = sendingSocialEntries(item.chatLinks);
    const chatButton = document.createElement('button');
    chatButton.type = 'button';
    chatButton.className = 'sending-offer-button sending-chat-button';
    chatButton.dataset.sendingOffer = item.id;
    chatButton.dataset.sendingMessageType = 'messenger';
    chatButton.title = chatLinks.length
      ? `Открыть текст для чатов: ${chatLinks.map(({ network, url }) => socialLabel(network, url)).join(', ')}`
      : 'Открыть текст для чатов';
    chatButton.setAttribute('aria-label', `Открыть сообщение для ${item.cafeName || 'кафе'}`);
    chatButton.textContent = '💬';
    chats.append(chatButton);
    chats.append(createSendingCopyButton(item, 'messenger'));

    row.append(cafe, language, landing, admin, template, emails, socials, phone, password, offer, chats);
    sendingsBody.append(row);
  });

  if (sendingsSelectAll) {
    sendingsSelectAll.checked = Boolean(visible.length) && visible.every((item) => sendingSelections.has(item.id));
    sendingsSelectAll.indeterminate = visible.some((item) => sendingSelections.has(item.id)) && !sendingsSelectAll.checked;
    sendingsSelectAll.disabled = !visible.length;
  }
  if (sendingsBulkDelete) {
    const count = sendingSelections.size;
    sendingsBulkDelete.hidden = count === 0;
    sendingsBulkDelete.disabled = count === 0;
    sendingsBulkDelete.textContent = count ? `Удалить выбранные (${count})` : 'Удалить выбранные';
  }
  renderSendingSortButtons();
}

async function loadSendings() {
  setSendingsStatus('Загружаю очередь…', 'loading');
  try {
    const response = await fetch('/api/sendings', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить очередь отправки.');
    sendings = Array.isArray(payload.sendings) ? payload.sendings : [];
    renderSendings();
    setSendingsStatus(sendings.length ? `В очереди: ${sendings.length}. Выберите кафе для удаления или откройте письмо.` : 'Пока нет переданных кафе.');
  } catch (error) {
    renderSendings();
    setSendingsStatus(error instanceof Error ? error.message : 'Не удалось загрузить очередь отправки.', 'error');
  }
}

function showSendingOffer(item) {
  if (!offerDialog || !item) return;
  const language = item.nativeLanguage?.label || item.nativeLanguage?.code || 'нативный язык';
  if (offerDialogTitle) offerDialogTitle.textContent = `Письмо для «${item.cafeName || 'кафе'}»`;
  if (offerDialogLanguage) offerDialogLanguage.textContent = `Язык будущего письма: ${language}`;
  if (offerDialogText) {
    offerDialogText.textContent = [
      'Текст оффера для этого языка пока не добавлен.',
      '',
      `Кафе: ${item.cafeName || '—'}`,
      `Лендинг: ${item.landingUrl || '—'}`,
      `Админка: ${item.adminUrl || '—'}`
    ].join('\n');
  }
  if (typeof offerDialog.showModal === 'function') offerDialog.showModal();
}

function showSendingMessage(item, type = 'email') {
  if (!offerDialog || !item) return;
  ensureOfferDialogFields();
  const offer = item.offers?.[type] || {};
  const isEmail = type === 'email';
  const actualLanguage = offer.language?.label || item.nativeLanguage?.label || item.nativeLanguage?.code || 'English';
  const requestedLanguage = item.nativeLanguage?.label || item.nativeLanguage?.code || actualLanguage;
  if (offerDialogKind) offerDialogKind.textContent = isEmail ? 'E-mail оффер' : 'Оффер для чатов';
  if (offerDialogTitle) offerDialogTitle.textContent = `${isEmail ? 'Письмо' : 'Сообщение'} для «${item.cafeName || 'кафе'}»`;
  if (offerDialogLanguage) {
    offerDialogLanguage.textContent = offer.fallback
      ? `Нет версии на ${requestedLanguage}: используется ${actualLanguage}.`
      : `Язык: ${actualLanguage}.`;
  }
  if (offerDialogSubject) {
    offerDialogSubject.hidden = !isEmail || !offer.subject;
    offerDialogSubject.textContent = offer.subject ? `Тема: ${offer.subject}` : '';
  }
  if (offerDialogText) {
    offerDialogText.textContent = offer.available
      ? offer.body
      : 'Для этого языка пока нет готового текста оффера. Добавьте локализацию в menu_on_outreach_localizations_v1.md.';
  }
  if (offerDialogNote) {
    offerDialogNote.textContent = isEmail
      ? 'Название кафе и ссылки на лендинг и админку уже подставлены автоматически.'
      : 'Используйте этот вариант для Instagram, Facebook, Telegram, WhatsApp и других чатов.';
  }
  if (typeof offerDialog.showModal === 'function' && !offerDialog.open) offerDialog.showModal();
}

function createSendingCopyButton(item, type) {
  const isEmail = type === 'email';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `sending-offer-button sending-copy-button${isEmail ? '' : ' sending-chat-copy-button'}`;
  button.dataset.sendingCopy = item.id;
  button.dataset.sendingMessageType = type;
  button.title = isEmail ? 'Скопировать текст письма' : 'Скопировать текст для чатов';
  button.setAttribute('aria-label', `${isEmail ? 'Скопировать письмо' : 'Скопировать сообщение'} для ${item.cafeName || 'кафе'}`);
  const glyph = document.createElement('span');
  glyph.className = 'sending-copy-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  return button;
}

function sendingMessageCopyText(item, type = 'email') {
  const offer = item?.offers?.[type] || {};
  const body = String(offer.body || '').trim();
  if (!body) return '';
  const subject = String(offer.subject || '').trim();
  return type === 'email' && subject ? `${subject}\n\n${body}` : body;
}

async function copySendingMessage(item, type, button) {
  const text = sendingMessageCopyText(item, type);
  if (!text) throw new Error('Текст сообщения пока не готов для копирования.');

  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Браузер не дал скопировать текст.');
  }

  const originalTitle = button.title;
  button.classList.add('is-copied');
  button.title = 'Скопировано';
  window.setTimeout(() => {
    button.classList.remove('is-copied');
    button.title = originalTitle;
  }, 1800);
}

async function deleteSelectedSendings() {
  const ids = [...sendingSelections];
  if (!ids.length) return;
  if (!window.confirm(`Удалить из очереди ${ids.length} кафе? Лендинг и данные в «Прод» останутся.`)) return;
  if (sendingsBulkDelete) sendingsBulkDelete.disabled = true;
  setSendingsStatus('Удаляю выбранные кафе…', 'loading');
  try {
    const response = await fetch('/api/sendings', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось удалить кафе из очереди.');
    sendingSelections.clear();
    sendings = Array.isArray(payload.sendings) ? payload.sendings : [];
    renderSendings();
    setSendingsStatus(`Удалено из очереди: ${payload.deletedCount || ids.length}.`, 'success');
  } catch (error) {
    renderSendings();
    setSendingsStatus(error instanceof Error ? error.message : 'Не удалось удалить кафе из очереди.', 'error');
  }
}

sendingsBody?.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-sending-selection]');
  if (!checkbox) return;
  if (checkbox.checked) sendingSelections.add(checkbox.dataset.sendingSelection);
  else sendingSelections.delete(checkbox.dataset.sendingSelection);
  renderSendings();
});

sendingsBody?.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-sending-copy]');
  if (copyButton) {
    const item = sendings.find((entry) => entry.id === copyButton.dataset.sendingCopy);
    try {
      await copySendingMessage(item, copyButton.dataset.sendingMessageType || 'email', copyButton);
    } catch (error) {
      setSendingsStatus(error instanceof Error ? error.message : 'Не удалось скопировать текст сообщения.', 'error');
    }
    return;
  }
  const button = event.target.closest('[data-sending-offer]');
  if (!button) return;
  showSendingMessage(sendings.find((item) => item.id === button.dataset.sendingOffer), button.dataset.sendingMessageType || 'email');
});

sendingsSelectAll?.addEventListener('change', () => {
  const visible = sortedSendings();
  if (sendingsSelectAll.checked) visible.forEach((item) => sendingSelections.add(item.id));
  else visible.forEach((item) => sendingSelections.delete(item.id));
  renderSendings();
});

document.querySelectorAll('[data-sending-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.sendingSort;
  sendingSort = { key, direction: sendingSort.key === key && sendingSort.direction === 'asc' ? 'desc' : 'asc' };
  renderSendings();
}));

sendingsBulkDelete?.addEventListener('click', deleteSelectedSendings);
offerDialogClose?.addEventListener('click', () => offerDialog?.close());
offerDialog?.addEventListener('click', (event) => {
  if (event.target === offerDialog) offerDialog.close();
});

const productionFullNodes = {
  count: document.querySelector('#production-selected-count'),
  selectedCafes: document.querySelector('#selected-cafes'),
  cafesStatus: document.querySelector('#production-cafes-status'),
  cafesBody: document.querySelector('#production-cafes-body'),
  cafeSelectAll: document.querySelector('#production-cafe-select-all'),
  deleteCafes: document.querySelector('#delete-production-cafes'),
  templateSelect: document.querySelector('#template-select'),
  backgroundSelect: document.querySelector('#classic-light-background'),
  templateStepTitle: document.querySelector('#template-step-title'),
  templateStepDescription: document.querySelector('#template-step-description'),
  templateStepSource: document.querySelector('#template-step-source'),
  runAudit: document.querySelector('#run-audit'),
  auditStatus: document.querySelector('#audit-status'),
  auditResults: document.querySelector('#audit-results'),
  downloadAudit: document.querySelector('#download-audit'),
  auditState: document.querySelector('#audit-state'),
  classicLightSection: document.querySelector('#classic-light-section'),
  classicLightComponents: document.querySelector('#classic-light-components'),
  classicLightCafeName: document.querySelector('#classic-light-cafe-name'),
  classicLightPreview: document.querySelector('#classic-light-preview'),
  classicLightAnatomy: document.querySelector('#classic-light-anatomy'),
  classicLightPublishSlug: document.querySelector('#classic-light-publish-slug'),
  classicLightPublish: document.querySelector('#classic-light-publish'),
  classicLightPublishStatus: document.querySelector('#classic-light-publish-status'),
  classicLightPublishedLink: document.querySelector('#classic-light-published-link'),
  classicLightAdminLink: document.querySelector('#classic-light-admin-link'),
  classicLightSend: document.querySelector('#classic-light-send'),
  classicLightAdminCredentials: document.querySelector('#classic-light-admin-credentials'),
  templateSource: document.querySelector('#template-source'),
  templateTitle: document.querySelector('#template-title'),
  templateSlots: document.querySelector('#template-slots'),
  templateGroupingNote: document.querySelector('#template-grouping-note'),
  templateMenuGroups: document.querySelector('#template-menu-groups'),
  brandSelect: document.querySelector('#brand-select'),
  brandSummary: document.querySelector('#brand-summary'),
  brandTypography: document.querySelector('#brand-typography'),
  brandTextColors: document.querySelector('#brand-text-colors'),
  brandSurfaceColors: document.querySelector('#brand-surface-colors'),
  brandFacts: document.querySelector('#brand-facts'),
  brandSeoDrafts: document.querySelector('#brand-seo-drafts'),
  brandMenuContent: document.querySelector('#brand-menu-content'),
  brandAssets: document.querySelector('#brand-assets'),
  approvalCount: document.querySelector('#approval-count'),
  validationList: document.querySelector('#validation-list'),
  landingPreview: document.querySelector('#landing-preview')
};

let productionFullAudit = null;
let productionFullBrandIndex = 0;
let productionFullApprovals = {};
let productionAuditIndex = new Map();
let classicComponentSort = { key: null, direction: 'asc' };
let classicLightBackgrounds = [];

function pSelectedClassicLightBackgroundId() {
  return String(productionFullNodes.backgroundSelect?.value || '').trim();
}

function pSavedClassicLightBackgroundId(brand) {
  return String(brand?.classicLight?.model?.templateOptions?.value?.background?.id || '').trim();
}

function pRenderClassicLightBackgroundOptions(selectedId = pSelectedClassicLightBackgroundId()) {
  const select = productionFullNodes.backgroundSelect;
  if (!select) return;
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Без фона';
  select.append(none);
  classicLightBackgrounds.forEach((background) => {
    const option = document.createElement('option');
    option.value = background.id;
    option.textContent = background.label;
    select.append(option);
  });
  select.value = classicLightBackgrounds.some((background) => background.id === selectedId) ? selectedId : '';
}

async function pLoadClassicLightBackgrounds() {
  const response = await fetch('/api/production/classic-light-backgrounds');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить фоны Classic Light.');
  classicLightBackgrounds = Array.isArray(payload.backgrounds) ? payload.backgrounds : [];
  pRenderClassicLightBackgroundOptions();
}

async function pSaveClassicLightBackground() {
  const brand = productionFullAudit?.brands?.[productionFullBrandIndex];
  const productionId = String(brand?.cafe?.productionId || '').trim();
  const select = productionFullNodes.backgroundSelect;
  if (!brand?.classicLight || !productionId || !select) {
    pSetAuditStatus('Сначала откройте сохранённый разбор Classic Light для нужного кафе.', 'warning');
    return;
  }

  const backgroundId = pSelectedClassicLightBackgroundId();
  const label = select.selectedOptions?.[0]?.textContent || 'Без фона';
  select.disabled = true;
  pSetAuditStatus(`Сохраняю фон «${label}» без повторного разбора ассетов…`, 'progress');

  try {
    const response = await fetch(`/api/production/audits/${encodeURIComponent(productionId)}/classic-light-background`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backgroundId })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить фон Classic Light.');

    const optionsField = brand.classicLight?.model?.templateOptions;
    if (optionsField && typeof optionsField === 'object') {
      optionsField.value = { ...(optionsField.value || {}), background: payload.background || null };
    }
    pRenderClassicLight(brand);
    pSetAuditStatus(`Фон «${label}» сохранён для «${brand.cafe?.name || 'кафе'}». Повторный разбор не нужен.`, 'success');
  } catch (error) {
    pRenderClassicLightBackgroundOptions(pSavedClassicLightBackgroundId(brand));
    pSetAuditStatus(error instanceof Error ? error.message : 'Не удалось сохранить фон Classic Light.', 'error');
  } finally {
    if (productionFullNodes.backgroundSelect) productionFullNodes.backgroundSelect.disabled = false;
  }
}

function pPublicationSlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63)
    .replace(/-+$/u, '') || 'cafe-demo';
}

function pSetClassicPublicationStatus(message, type = '') {
  const node = productionFullNodes.classicLightPublishStatus;
  if (!node) return;
  node.textContent = message;
  node.className = `classic-publish-status ${type}`.trim();
}

function pRenderClassicPublication(brand) {
  const productionId = String(brand?.cafe?.productionId || '');
  const available = Boolean(productionId && brand?.classicLight);
  const publication = productionFullAudit?.publication || {};
  const landingUrl = pCleanUrl(publication.landingUrl || publication.url || '');
  const adminUrl = pCleanUrl(publication.adminUrl || publication.admin?.url || '');
  const published = Boolean(available && landingUrl);
  const input = productionFullNodes.classicLightPublishSlug;
  const button = productionFullNodes.classicLightPublish;
  const link = productionFullNodes.classicLightPublishedLink;
  const adminLink = productionFullNodes.classicLightAdminLink;
  const send = productionFullNodes.classicLightSend;
  const adminCredentials = productionFullNodes.classicLightAdminCredentials;
  if (input) {
    const changedCafe = input.dataset.productionId !== productionId;
    input.disabled = !available;
    if (changedCafe) {
      input.dataset.productionId = productionId;
      input.value = available ? pPublicationSlug(brand?.cafe?.name) : '';
      if (adminCredentials) { adminCredentials.hidden = true; adminCredentials.textContent = ''; }
    }
  }
  if (link) {
    link.href = landingUrl || '#';
    link.hidden = !published;
  }
  if (adminLink) {
    adminLink.href = adminUrl || '#';
    adminLink.hidden = !adminUrl;
  }
  if (button) button.disabled = !available;
  if (send) send.disabled = !published;
  if (!available) pSetClassicPublicationStatus('Сначала выберите кафе с сохранённым разбором.');
  else if (!published) pSetClassicPublicationStatus('Поддомен можно изменить перед публикацией.');
}

async function pPublishClassicLight() {
  const brand = productionFullAudit?.brands?.[productionFullBrandIndex];
  const productionId = String(brand?.cafe?.productionId || '');
  const input = productionFullNodes.classicLightPublishSlug;
  const button = productionFullNodes.classicLightPublish;
  const link = productionFullNodes.classicLightPublishedLink;
  const adminLink = productionFullNodes.classicLightAdminLink;
  const adminCredentials = productionFullNodes.classicLightAdminCredentials;
  const slug = String(input?.value || '').trim().toLowerCase();
  if (!productionId || !brand?.classicLight) return;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(slug)) {
    pSetClassicPublicationStatus('Поддомен: строчные латинские буквы, цифры и дефис; от 1 до 63 символов.', 'error');
    input?.focus();
    return;
  }
  if (button) button.disabled = true;
  pSetClassicPublicationStatus('Собираю и отправляю статическую версию на VPS…', 'loading');
  try {
    const response = await fetch(`/api/production/audits/${encodeURIComponent(productionId)}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось опубликовать демо-лендинг.');
    if (link && payload.url) {
      link.href = payload.url;
      link.hidden = false;
    }
    if (adminLink && payload.admin?.url) {
      adminLink.href = payload.admin.url;
      adminLink.hidden = false;
    }
    if (adminCredentials) {
      const credentials = payload.admin?.provisioned && payload.admin?.username && payload.admin?.password
        ? `Кабинет создан. Логин: ${payload.admin.username} · временный пароль: ${payload.admin.password}. Сохраните их сейчас: после обновления страницы пароль не показывается.`
        : payload.admin?.url ? 'Кабинет уже существует. Используйте сохранённые ранее логин и пароль.' : '';
      adminCredentials.textContent = credentials;
      adminCredentials.hidden = !credentials;
    }
    if (payload.publication && productionFullAudit) productionFullAudit.publication = payload.publication;
    pRenderClassicPublication(brand);
    pSetClassicPublicationStatus(`Готово: ${payload.url || `${slug}.menu-on.com`} — отправляйте ссылку клиенту.`, 'success');
  } catch (error) {
    pSetClassicPublicationStatus(error.message || 'Не удалось опубликовать демо-лендинг.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function pSendClassicLightToSendings() {
  const brand = productionFullAudit?.brands?.[productionFullBrandIndex];
  const productionId = String(brand?.cafe?.productionId || '');
  const button = productionFullNodes.classicLightSend;
  if (!productionId || !productionFullAudit?.publication?.landingUrl) return;
  if (button) button.disabled = true;
  pSetClassicPublicationStatus('Передаю кафе в раздел «Отправка»…', 'loading');
  try {
    const response = await fetch('/api/sendings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productionId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось передать кафе в «Отправку».');
    pSetClassicPublicationStatus(payload.created ? 'Кафе передано в «Отправку». Текст письма добавим после настройки языков.' : 'Данные кафе в «Отправке» обновлены.', 'success');
  } catch (error) {
    pSetClassicPublicationStatus(error instanceof Error ? error.message : 'Не удалось передать кафе в «Отправку».', 'error');
  } finally {
    pRenderClassicPublication(brand);
  }
}

const productionFullTemplateMeta = {
  'classic-light-1': {
    name: 'Шаблон №1 · Classic Light',
    anatomyUrl: '/templates/classic-light/template.anatomy.json',
    description: 'Контракт Classic Light: только значения с источником, статусом и замечанием для каждого элемента 01–52.'
  },
  'cinematic-video-2': {
    name: 'Шаблон №2 · Cinematic Video',
    pending: true,
    description: 'Каркас пока не задан. Разбор будет доступен после добавления отдельного контракта Cinematic Video.'
  }
};

function pEscape(value) {
  const node = document.createElement('span');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function pCleanUrl(value) {
  try { return new URL(value).href; } catch { return ''; }
}

function pHostName(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return 'Нет URL'; }
}

function pMuted(value) {
  return `<span class="muted">${pEscape(value)}</span>`;
}

function pSetAuditStatus(message, type = '') {
  if (!productionFullNodes.auditStatus) return;
  productionFullNodes.auditStatus.textContent = message;
  productionFullNodes.auditStatus.className = `status ${type}`;
}

function pProductionEmails(cafe) {
  return [...new Set((cafe.emails || [])
    .map((email) => String(email || '').replace(/^mailto:/i, '').trim())
    .filter(Boolean))];
}

function pProductionAuditSummary(cafe) {
  return productionAuditIndex.get(cafe.productionId) || null;
}

function pProductionCafesForCurrentMenu() {
  const filtered = productionCafes.filter((cafe) => (
    productionMenuFilter === 'with' ? cafe.menuOnSite === true : cafe.menuOnSite !== true
  ));
  if (!productionCafeSort.key) return filtered;
  return filtered.slice().sort((first, second) => {
    let result = 0;
    if (productionCafeSort.key === 'score') {
      result = Number(first.score || 0) - Number(second.score || 0);
    } else if (productionCafeSort.key === 'assets') {
      result = Number(Boolean(pProductionAuditSummary(first))) - Number(Boolean(pProductionAuditSummary(second)));
    } else if (productionCafeSort.key === 'priority') {
      result = Number(first.priorityCount || 0) - Number(second.priorityCount || 0);
    } else if (productionCafeSort.key === 'email') {
      result = pProductionEmails(first).join(' ').localeCompare(pProductionEmails(second).join(' '), 'ru');
    } else {
      result = String(first[productionCafeSort.key] || '').localeCompare(String(second[productionCafeSort.key] || ''), 'ru');
    }
    return productionCafeSort.direction === 'asc' ? result : -result;
  });
}

function pPriorityMarker(cafe) {
  const reasons = (cafe.priorityReasons || []).filter(Boolean);
  const count = Math.min(3, Math.max(1, Number(cafe.priorityCount) || reasons.length || 1));
  const marker = document.createElement('span');
  marker.className = 'production-priority';
  marker.textContent = cafe.priority ? '⚠️'.repeat(count) : '—';
  if (reasons.length) marker.title = reasons.join('\n');
  return marker;
}

function pInvalidateAuditForCafeSelection() {
  // Чекбоксы управляют только следующим запуском. Уже сохранённый и открытый
  // разбор не скрываем: он относится к конкретному кафе в таблице.
}

function renderProductionCafeTable() {
  const visible = pProductionCafesForCurrentMenu();
  if (productionFullNodes.cafesStatus) {
    if (!productionCafes.length) {
      productionFullNodes.cafesStatus.textContent = 'В прод пока нет переданных кафе. Выберите их в разделе «Кандидаты» и нажмите «Передать в прод».';
    } else {
      const mode = productionMenuFilter === 'with' ? 'с меню на сайте' : 'без меню на сайте';
      productionFullNodes.cafesStatus.textContent = `Передано кафе: ${productionCafes.length}. В текущем режиме (${mode}): ${visible.length}.`;
    }
  }
  if (!productionFullNodes.cafesBody) return;
  productionFullNodes.cafesBody.replaceChildren();
  if (!visible.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'production-empty-cell';
    cell.textContent = productionCafes.length ? 'В этом режиме пока нет кафе.' : 'Передайте кафе из раздела «Кандидаты», чтобы разложить их на ассеты.';
    row.append(cell);
    productionFullNodes.cafesBody.append(row);
  } else {
    for (const cafe of visible) {
      const row = document.createElement('tr');
      const selectCell = document.createElement('td');
      selectCell.className = 'production-check-column';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = productionSelections.has(cafe.productionId);
      checkbox.dataset.productionCafeCheck = cafe.productionId;
      checkbox.setAttribute('aria-label', `Выбрать ${cafe.name}`);
      selectCell.append(checkbox);

      const nameCell = document.createElement('td');
      const mapsUrl = pCleanUrl(cafe.mapsUrl);
      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'production-cafe-name';
      nameButton.dataset.productionAuditView = cafe.productionId;
      nameButton.textContent = cafe.name || 'Без названия';
      nameButton.title = pProductionAuditSummary(cafe) ? 'Открыть сохранённый разбор ассетов' : 'Разбор ассетов для этого кафе ещё не выполнен';
      nameCell.append(nameButton);
      const city = document.createElement('small');
      city.textContent = cafe.city || cafe.batchName || '';
      nameCell.append(city);
      if (mapsUrl) {
        const mapsLink = document.createElement('a');
        mapsLink.className = 'production-maps-link';
        mapsLink.href = mapsUrl;
        mapsLink.target = '_blank';
        mapsLink.rel = 'noreferrer';
        mapsLink.textContent = 'Google Maps ↗';
        nameCell.append(mapsLink);
      }

      const websiteCell = document.createElement('td');
      const website = pCleanUrl(cafe.website);
      if (website) {
        const websiteLink = document.createElement('a');
        websiteLink.href = website;
        websiteLink.target = '_blank';
        websiteLink.rel = 'noreferrer';
        websiteLink.textContent = pHostName(website);
        websiteCell.append(websiteLink);
      } else websiteCell.textContent = '—';

      const emailCell = document.createElement('td');
      const emails = pProductionEmails(cafe);
      if (emails.length) {
        emails.forEach((email, index) => {
          if (index) emailCell.append(document.createElement('br'));
          const emailLink = document.createElement('a');
          emailLink.href = `mailto:${email}`;
          emailLink.textContent = email;
          emailCell.append(emailLink);
        });
      } else emailCell.textContent = '—';

      const scoreCell = document.createElement('td');
      scoreCell.className = 'production-score';
      scoreCell.textContent = Number.isFinite(Number(cafe.score)) ? String(cafe.score) : '—';
      const assetsCell = document.createElement('td');
      const auditSummary = pProductionAuditSummary(cafe);
      if (auditSummary) {
        const marker = document.createElement('span');
        marker.className = 'production-audit-ready';
        marker.textContent = '✓';
        const auditedAt = auditSummary.auditedAt ? new Date(auditSummary.auditedAt).toLocaleString('ru-RU') : '';
        marker.title = `Разбор выполнен${auditedAt ? `: ${auditedAt}` : ''}. Нажмите на название кафе, чтобы открыть ассеты.`;
        assetsCell.append(marker);
      } else {
        assetsCell.className = 'production-audit-missing';
        assetsCell.textContent = '—';
      }
      const priorityCell = document.createElement('td');
      priorityCell.append(pPriorityMarker(cafe));
      row.append(selectCell, nameCell, websiteCell, emailCell, scoreCell, assetsCell, priorityCell);
      productionFullNodes.cafesBody.append(row);
    }
  }
  if (productionFullNodes.cafeSelectAll) {
    productionFullNodes.cafeSelectAll.checked = Boolean(visible.length) && visible.every((cafe) => productionSelections.has(cafe.productionId));
    productionFullNodes.cafeSelectAll.indeterminate = visible.some((cafe) => productionSelections.has(cafe.productionId)) && !productionFullNodes.cafeSelectAll.checked;
    productionFullNodes.cafeSelectAll.disabled = !visible.length;
  }
  document.querySelectorAll('[data-production-sort]').forEach((button) => {
    if (!button.dataset.sortLabel) button.dataset.sortLabel = button.textContent.trim();
    const active = productionCafeSort.key === button.dataset.productionSort;
    button.classList.toggle('is-sorted', active);
    button.textContent = `${button.dataset.sortLabel}${active ? (productionCafeSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}`;
  });
  productionMenuButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.productionMenu === productionMenuFilter));
  if (productionFullNodes.deleteCafes) {
    const selectedCount = productionSelections.size;
    productionFullNodes.deleteCafes.disabled = !selectedCount;
    productionFullNodes.deleteCafes.textContent = selectedCount ? `Удалить выбранные (${selectedCount})` : 'Удалить выбранные';
  }
}

function selectedProductionCafes() {
  return productionCafes.filter((cafe) => productionSelections.has(cafe.productionId));
}

function renderProductionSelectedFull() {
  const chosen = selectedProductionCafes();
  const templateMeta = productionFullTemplateMeta[productionFullNodes.templateSelect?.value || 'classic-light-1'] || {};
  if (productionFullNodes.count) productionFullNodes.count.textContent = chosen.length;
  if (productionFullNodes.runAudit) productionFullNodes.runAudit.disabled = !chosen.length || Boolean(templateMeta.pending);
  if (!productionFullNodes.selectedCafes) return;
  productionFullNodes.selectedCafes.replaceChildren();
  if (!chosen.length) {
    productionFullNodes.selectedCafes.innerHTML = '<p class="empty-state">Пока ничего не выбрано. Вернитесь к кандидатам, отметьте кафе и нажмите «Передать в прод».</p>';
    return;
  }
  for (const cafe of chosen) {
    const card = document.createElement('article');
    card.className = 'selected-cafe';
    card.innerHTML = `<span>${pEscape(cafe.city || cafe.batchName || '')}</span><strong>${pEscape(cafe.name)}</strong><a href="${pEscape(cafe.website)}" target="_blank" rel="noreferrer">${pEscape(pHostName(cafe.website))} ↗</a>`;
    productionFullNodes.selectedCafes.append(card);
  }
}

async function pLoadProductionAuditIndex() {
  const response = await fetch('/api/production/audits');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить статусы разборов.');
  productionAuditIndex = new Map((payload.audits || [])
    .filter((audit) => audit.templateId === 'classic-light-1')
    .map((audit) => [audit.productionId, audit]));
}

async function pOpenStoredProductionAudit(productionId) {
  if (!productionAuditIndex.has(productionId)) {
    pSetAuditStatus('Для этого кафе разбор ещё не выполнен. Отметьте его чекбоксом и нажмите «Разложить на ассеты».', 'warning');
    return;
  }
  pSetAuditStatus('Загружаю сохранённые ассеты выбранного кафе…', 'loading');
  try {
    const response = await fetch(`/api/production/audits/${encodeURIComponent(productionId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить сохранённый разбор.');
    productionFullAudit = payload.audit;
    productionFullBrandIndex = 0;
    productionFullApprovals = {};
    pRenderAudit();
    const cafeName = productionFullAudit.brands?.[0]?.cafe?.name || 'кафе';
    pSetAuditStatus(`Загружен сохранённый разбор: ${cafeName}.`, productionFullAudit.validation?.warnings ? 'warning' : 'success');
    productionFullNodes.auditResults?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    pSetAuditStatus(error.message || 'Не удалось загрузить сохранённый разбор.', 'error');
  }
}

async function loadProductionFull() {
  pSetAuditStatus('Загрузка прод-кандидатов…');
  try {
    const [response] = await Promise.all([
      fetch('/api/production'),
      pLoadClassicLightBackgrounds().catch(() => {
        classicLightBackgrounds = [];
        pRenderClassicLightBackgroundOptions();
      })
    ]);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить прод.');
    productionCafes = payload.cafes || [];
    try {
      await pLoadProductionAuditIndex();
    } catch {
      productionAuditIndex = new Map();
    }
    const available = new Set(productionCafes.map((cafe) => cafe.productionId));
    productionSelections = new Set([...productionSelections].filter((id) => available.has(id)));
    renderProductionCafeTable();
    renderProductionSelectedFull();
    pUpdateTemplateContext(productionFullNodes.templateSelect?.value || 'classic-light-1');
    pSetAuditStatus(productionCafes.length ? `В проде: ${productionCafes.length}. Отметьте кафе в таблице выше и нажмите «Разложить на ассеты».` : 'В проде пока нет кафе.');
  } catch (error) {
    productionCafes = [];
    productionSelections = new Set();
    productionAuditIndex = new Map();
    renderProductionCafeTable();
    renderProductionSelectedFull();
    pSetAuditStatus(error.message || 'Не удалось загрузить прод.', 'error');
  }
}

function pSelectionSet(index) {
  if (!productionFullApprovals[index]) productionFullApprovals[index] = new Set();
  return productionFullApprovals[index];
}

function pSelectedApprovalCount() {
  return Object.values(productionFullApprovals).reduce((sum, set) => sum + set.size, 0);
}

function pToggleApproval(brandIndex, id) {
  const selectedItems = pSelectionSet(brandIndex);
  selectedItems.has(id) ? selectedItems.delete(id) : selectedItems.add(id);
  pRenderBrand();
  pRenderValidation();
}

function pApprovalAction(brandIndex, id) {
  const chosen = pSelectionSet(brandIndex).has(id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'content-choice';
  button.textContent = chosen ? 'Подтверждено вами' : 'Подтвердить';
  button.setAttribute('aria-pressed', String(chosen));
  button.addEventListener('click', () => pToggleApproval(brandIndex, id));
  return button;
}

function pUpdateTemplateContext(templateId, template = null) {
  const meta = { ...(productionFullTemplateMeta[templateId] || {}), ...(template || {}) };
  const usesClassicLight = templateId === 'classic-light-1';
  if (productionFullNodes.backgroundSelect) {
    productionFullNodes.backgroundSelect.disabled = !usesClassicLight;
    const picker = productionFullNodes.backgroundSelect.closest('.background-picker');
    if (picker) picker.hidden = !usesClassicLight;
  }
  if (productionFullNodes.templateStepTitle) productionFullNodes.templateStepTitle.textContent = `Фиксируем: ${meta.name || 'шаблон'}`;
  if (productionFullNodes.templateStepDescription) productionFullNodes.templateStepDescription.textContent = meta.description || 'Из прототипа фиксируется только структура меню и блоков страницы.';
  if (productionFullNodes.templateStepSource) productionFullNodes.templateStepSource.href = meta.prototypeUrl || meta.anatomyUrl || meta.source?.url || meta.source || '#';
}

function pClassicStatusLabel(status) {
  return ({ found: 'found', derived: 'derived', needs_review: 'needs_review', missing: 'missing' })[status] || 'missing';
}

function pClassicValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return value.map((item) => {
      if (typeof item === 'string') return item;
      const itemTranslation = item?.translations && Object.values(item.translations)[0];
      if (itemTranslation?.name?.value) return itemTranslation.name.value;
      if (item?.label) return item.label;
      if (item?.platform) return item.platform;
      if (item?.name) return item.name;
      return item?.id || '';
    }).filter(Boolean).join(', ') || `${value.length} элемент(ов)`;
  }
  if (value.display) return value.display;
  if (value.formatted) return value.formatted;
  if (value.name) return value.name;
  if (value.schedule) return `${value.schedule.length} строк расписания`;
  if (value.url) return pHostName(value.url);
  if (value.fonts || value.colors) return `${value.fonts?.length || 0} шрифтов · ${(value.colors?.text?.length || 0) + (value.colors?.surface?.length || 0)} цветов`;
  return 'Есть данные';
}

function pClassicComponentSortValue(component, key) {
  if (key === 'number') return Number.parseInt(String(component.number || ''), 10) || Number.MAX_SAFE_INTEGER;
  if (key === 'element') return `${component.section || ''} ${component.label || ''}`.toLocaleLowerCase('ru');
  if (key === 'status') return ({ found: 1, derived: 2, needs_review: 3, missing: 4 })[component.status] || 5;
  if (key === 'data') return pClassicValue(component.value).toLocaleLowerCase('ru');
  if (key === 'note') return String(component.note || '').toLocaleLowerCase('ru');
  if (key === 'source') return String(component.sourceUrl || '').toLocaleLowerCase('ru');
  return '';
}

function pSortClassicComponents(components) {
  const rows = [...(components || [])];
  if (!classicComponentSort.key) return rows;
  const direction = classicComponentSort.direction === 'asc' ? 1 : -1;
  return rows.sort((left, right) => {
    const leftValue = pClassicComponentSortValue(left, classicComponentSort.key);
    const rightValue = pClassicComponentSortValue(right, classicComponentSort.key);
    const result = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' });
    return result * direction;
  });
}

function pRenderClassicLight(brand) {
  const section = productionFullNodes.classicLightSection;
  const body = productionFullNodes.classicLightComponents;
  const classic = brand?.classicLight;
  if (!section || !body) return;
  section.hidden = !classic;
  const cafeName = String(brand?.cafe?.name || '').trim();
  if (productionFullNodes.classicLightCafeName) {
    productionFullNodes.classicLightCafeName.textContent = cafeName ? `Кафе: ${cafeName}` : '';
    productionFullNodes.classicLightCafeName.hidden = !cafeName || !classic;
  }
  if (!classic) {
    body.replaceChildren();
    if (productionFullNodes.classicLightPreview) productionFullNodes.classicLightPreview.hidden = true;
    return;
  }
  if (productionFullNodes.backgroundSelect) {
    pRenderClassicLightBackgroundOptions(pSavedClassicLightBackgroundId(brand));
  }
  if (productionFullNodes.classicLightPreview) {
    const productionId = brand?.cafe?.productionId || '';
    const contentPath = `/api/production/audits/${encodeURIComponent(productionId)}/classic-light-content`;
    productionFullNodes.classicLightPreview.href = `/templates/classic-light/template.html?content=${encodeURIComponent(contentPath)}&v=${Date.now()}`;
    productionFullNodes.classicLightPreview.hidden = !productionId;
  }
  if (productionFullNodes.classicLightAnatomy) productionFullNodes.classicLightAnatomy.href = productionFullAudit?.template?.anatomyUrl || '/templates/classic-light/template.anatomy.json';
  pRenderClassicPublication(brand);
  body.replaceChildren(...pSortClassicComponents(classic.components).map((component) => {
    const row = document.createElement('tr');
    const source = pCleanUrl(component.sourceUrl);
    row.innerHTML = `<td>${pEscape(component.number)}</td><td><strong>${pEscape(component.section)}</strong><span>${pEscape(component.label)}</span></td><td><span class="classic-status ${pEscape(component.status)}">${pEscape(pClassicStatusLabel(component.status))}</span></td><td>${pEscape(pClassicValue(component.value))}${component.raw && component.raw !== String(component.value || '') ? `<small>raw: ${pEscape(component.raw)}</small>` : ''}</td><td>${pEscape(component.note || '—')}</td><td>${source ? `<a href="${pEscape(source)}" target="_blank" rel="noreferrer">Источник ↗</a>` : '—'}</td>`;
    return row;
  }));
  section.querySelectorAll('[data-classic-sort]').forEach((button) => {
    if (!button.dataset.sortLabel) button.dataset.sortLabel = button.textContent.trim();
    const active = classicComponentSort.key === button.dataset.classicSort;
    button.classList.toggle('is-sorted', active);
    button.textContent = `${button.dataset.sortLabel}${active ? (classicComponentSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}`;
    button.setAttribute('aria-pressed', String(active));
    button.closest('th')?.setAttribute('aria-sort', active ? (classicComponentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

productionFullNodes.classicLightSection?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-classic-sort]');
  if (!button) return;
  const key = button.dataset.classicSort;
  classicComponentSort = {
    key,
    direction: classicComponentSort.key === key && classicComponentSort.direction === 'asc' ? 'desc' : 'asc'
  };
  pRenderBrand();
});

function pRenderTemplate() {
  const template = productionFullAudit.template;
  if (productionFullNodes.templateSource) productionFullNodes.templateSource.href = template.prototypeUrl;
  if (productionFullNodes.templateTitle) productionFullNodes.templateTitle.textContent = template.name;
  pUpdateTemplateContext(template.id, template);
  const slots = template.structure?.slots || [];
  productionFullNodes.templateSlots?.replaceChildren(...slots.map((slot) => {
    const card = document.createElement('article');
    card.className = 'slot-card';
    card.innerHTML = `<span>${pEscape(slot.id)}</span><h3>${pEscape(slot.label)}</h3><p>${(slot.required || []).map(pEscape).join(' · ')}</p>`;
    return card;
  }));
  if (productionFullNodes.templateGroupingNote) productionFullNodes.templateGroupingNote.textContent = template.structure?.navigation?.rule || 'Шаблон задаёт только паттерн навигации; текст и количество пунктов берутся из меню кафе.';
  const patternCards = [
    { title: 'Типы продукции', label: 'ПЕРВЫЙ УРОВЕНЬ', text: 'Место для навигации по типам продукции из меню выбранного кафе.' },
    { title: 'Подтипы при необходимости', label: 'ВТОРОЙ УРОВЕНЬ', text: template.structure?.navigation?.supportsSubgroups ? 'Раскрываются только если это подтверждено меню кафе.' : 'Не используются в этом контракте.' },
    { title: 'Результаты в сетке', label: 'ОСНОВНОЙ БЛОК', text: 'Выбранные позиции кафе показываются в основной сетке карточек.' }
  ];
  productionFullNodes.templateMenuGroups?.replaceChildren(...patternCards.map((pattern) => {
    const card = document.createElement('article');
    card.className = 'template-menu-group';
    card.innerHTML = `<h3>${pEscape(pattern.title)}</h3><p>${pEscape(pattern.label)}</p><div class="template-pattern-copy">${pEscape(pattern.text)}</div>`;
    return card;
  }));
}

function pRenderAssetCards(container, assets, brandIndex) {
  if (!container) return;
  container.replaceChildren();
  if (!assets.length) {
    container.innerHTML = '<p class="empty-state">Ассеты не найдены.</p>';
    return;
  }
  const selectedAssets = brandIndex === null ? new Set() : pSelectionSet(brandIndex);
  for (const asset of assets) {
    const card = document.createElement(brandIndex === null ? 'article' : 'button');
    card.className = `asset-card ${asset.recommended ? 'recommended' : ''} ${selectedAssets.has(asset.id) ? 'chosen' : ''}`;
    if (brandIndex !== null) {
      card.type = 'button';
      card.setAttribute('aria-pressed', String(selectedAssets.has(asset.id)));
      card.addEventListener('click', () => {
        selectedAssets.has(asset.id) ? selectedAssets.delete(asset.id) : selectedAssets.add(asset.id);
        pRenderBrand();
        pRenderValidation();
      });
    }
    card.innerHTML = `<div class="asset-preview">${asset.previewUrl ? `<img src="${pEscape(asset.previewUrl)}" alt="${pEscape(asset.label)}" loading="lazy" />` : '<span>Нет превью</span>'}</div><div class="asset-copy"><div><strong>${pEscape(asset.label)}</strong><span class="asset-kind">${pEscape(asset.kind)}</span></div>${asset.recommended ? '<em>кандидат системы</em>' : ''}${brandIndex !== null ? `<span class="asset-choice">${selectedAssets.has(asset.id) ? 'Подтверждено вами' : 'Выбрать'}</span>` : ''}<a href="${pEscape(asset.sourceUrl)}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">Источник ↗</a><small>${pEscape(asset.evidence?.alt || asset.evidence?.context || '')}</small></div>`;
    container.append(card);
  }
}

function pRenderSeoDrafts(container, drafts, brandIndex) {
  if (!container) return;
  container.replaceChildren();
  if (!drafts.length) {
    container.innerHTML = '<p class="empty-state">Не удалось определить язык сайта для текстового черновика.</p>';
    return;
  }
  for (const draft of drafts) {
    const selectedItems = pSelectionSet(brandIndex);
    const card = document.createElement('article');
    card.className = `seo-draft ${selectedItems.has(draft.id) ? 'chosen' : ''}`;
    const origin = draft.origin === 'translation-draft' ? `переводческий черновик из ${String(draft.translationFrom || '').toUpperCase()}` : 'официальная языковая версия';
    card.innerHTML = `<div class="content-card-heading"><div><strong>${pEscape(draft.language?.label)}</strong><span>${pEscape(draft.language?.code)} · ${pEscape(origin)}</span></div><a href="${pEscape(draft.sourceUrl)}" target="_blank" rel="noreferrer">Источник ↗</a></div><dl><div><dt>H1</dt><dd>${pEscape(draft.h1)}</dd></div><div><dt>TITLE</dt><dd>${pEscape(draft.title)}</dd></div><div><dt>DESCRIPTION</dt><dd>${pEscape(draft.description)}</dd></div></dl><small>Автоматический черновик: ${(draft.inputs || []).map(pEscape).join(' · ')}</small>`;
    card.append(pApprovalAction(brandIndex, draft.id));
    container.append(card);
  }
}

function pRenderMenuByLanguage(container, languages, brandIndex) {
  if (!container) return;
  container.replaceChildren();
  if (!languages.length) {
    container.innerHTML = '<p class="empty-state">На сайте не объявлены языковые версии меню.</p>';
    return;
  }
  for (const menu of languages) {
    const language = document.createElement('article');
    language.className = 'menu-language';
    const groups = menu.navigationGroups || [];
    const isTemplateMenu = ['template-menu', 'classic-light-source', 'translation-draft'].includes(menu.origin);
    const origin = isTemplateMenu ? 'шаблонное меню' : menu.origin === 'translation-draft' ? `перевод с ${String(menu.translationFrom || '').toUpperCase()}` : 'официальная версия';
    const source = menu.sourceUrl ? `<a href="${pEscape(menu.sourceUrl)}" target="_blank" rel="noreferrer">Источник ↗</a>` : '';
    language.innerHTML = `<div class="content-card-heading"><div><strong>${pEscape(menu.language?.label)}</strong><span>${pEscape(menu.language?.code)} · ${(menu.items || []).length} из 12 поз. · ${groups.length} типа · ${pEscape(origin)}</span></div>${source}</div>${isTemplateMenu ? `<small>${pEscape(menu.disclaimer || 'Перед публикацией подтвердите состав, цены и аллергенную маркировку.')}</small>` : ''}`;
    if (!(menu.items || []).length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'На официальной версии сайта не найдено меню.';
      language.append(empty);
    } else {
      for (const group of groups) {
        const section = document.createElement('section');
        section.className = 'menu-group';
        section.innerHTML = `<div class="menu-group-heading"><strong>${pEscape(group.label)}</strong><span>${group.count}</span></div>`;
        const list = document.createElement('div');
        list.className = 'menu-entry-list';
        (menu.items || []).filter((item) => item.productType === group.id).forEach((item) => {
          const entry = document.createElement('article');
          entry.className = `menu-entry ${pSelectionSet(brandIndex).has(item.id) ? 'chosen' : ''}`;
          const sourceLabel = menu.origin === 'translation-draft' ? 'Основа для английской копии ↗' : item.sourceFormat === 'image-ocr' ? 'OCR официального меню ↗' : 'Источник ↗';
          const allergens = item.allergens?.length ? `Аллергены: ${item.allergens.join(', ')}` : item.allergenNote ? `Аллергены: ${item.allergenNote}` : '';
          const sourceLink = item.sourceUrl ? `<a href="${pEscape(item.sourceUrl)}" target="_blank" rel="noreferrer">${sourceLabel}</a>` : '';
          entry.innerHTML = `<div><strong>${pEscape(item.name)}</strong>${item.volumeOrWeight ? `<span>${pEscape(item.volumeOrWeight)}</span>` : ''}${item.description ? `<small>${pEscape(item.description)}</small>` : ''}${allergens ? `<small>${pEscape(allergens)}</small>` : ''}</div><div class="menu-entry-price"><b>${pEscape(item.price)}</b>${sourceLink}</div>`;
          entry.append(pApprovalAction(brandIndex, item.id));
          list.append(entry);
        });
        section.append(list);
        language.append(section);
      }
    }
    container.append(language);
  }
}

function pRenderColorRole(container, colors, emptyMessage) {
  if (!container) return;
  container.innerHTML = colors.length ? colors.map((color) => `<article><span style="background:${pEscape(color.value)}"></span><strong>${pEscape(color.value)}</strong><small>${color.mentions} CSS-правил</small></article>`).join('') : `<p class="empty-state">${pEscape(emptyMessage)}</p>`;
}

function pPreviewColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) && !/^#(?:0{3,8})$/i.test(color) ? color : fallback;
}

function pShortBrandName(value) {
  return String(value || '').split(/[—–|-]/)[0].trim() || String(value || '');
}

function pPreviewAsset(assets, selectedAssets, kind) {
  const matching = assets.filter((asset) => asset.kind === kind);
  return matching.find((asset) => selectedAssets.has(asset.id)) || matching.find((asset) => asset.recommended) || matching[0] || null;
}

function pApplyPreviewFont(font) {
  const styleId = 'landing-preview-font';
  let style = document.querySelector(`#${styleId}`);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.append(style);
  }
  const url = pCleanUrl(font?.fontUrl || '');
  style.textContent = url ? `@font-face{font-family:"AuditPreviewBrand";src:url("${url}") format("woff2");font-display:swap;}` : '';
  const family = String(font?.family || '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  return url ? 'AuditPreviewBrand, Georgia, serif' : family ? `"${family}", Georgia, serif` : 'Georgia, serif';
}

function pRenderLandingPreview(brand) {
  const preview = productionFullNodes.landingPreview;
  if (!preview || !brand) return;
  const selectedAssets = pSelectionSet(productionFullBrandIndex);
  const nativeCode = brand.language?.native?.code || 'de';
  const labels = nativeCode === 'de'
    ? { menu: 'Speisekarte', contact: 'Kontakt', visit: 'Besuch planen', hours: 'Öffnungszeiten', address: 'Adresse', allergens: 'Allergene', productPhoto: 'Produktfoto nicht bestätigt', selected: 'Ausgewählte Brand-Assets', suggested: 'Empfohlene Brand-Kandidaten' }
    : nativeCode === 'it'
      ? { menu: 'Menu', contact: 'Contatti', visit: 'Pianifica la visita', hours: 'Orari di apertura', address: 'Indirizzo', allergens: 'Allergeni', productPhoto: 'Foto del prodotto non confermata', selected: 'Asset del brand selezionati', suggested: 'Candidati brand consigliati' }
      : { menu: 'Menu', contact: 'Contact', visit: 'Plan your visit', hours: 'Opening hours', address: 'Address', allergens: 'Allergens', productPhoto: 'Product photo not confirmed', selected: 'Selected brand assets', suggested: 'Recommended brand candidates' };
  const seo = brand.contentAssets?.seoDrafts?.find((draft) => draft.language?.code === nativeCode) || brand.contentAssets?.seoDrafts?.[0];
  const menu = brand.contentAssets?.menuByLanguage?.find((entry) => entry.language?.code === nativeCode) || brand.contentAssets?.menuByLanguage?.[0];
  const logo = pPreviewAsset(brand.assets || [], selectedAssets, 'logo');
  const scene = pPreviewAsset(brand.assets || [], selectedAssets, 'brand-scene');
  const primary = pPreviewColor((brand.colorRoles?.surface || []).map((color) => color.value).find((color) => pPreviewColor(color, '') !== ''), '#9f4131');
  const paper = pPreviewColor((brand.colorRoles?.text || []).map((color) => color.value).find((color) => pPreviewColor(color, '') !== ''), '#fbf5e7');
  const fontFamily = pApplyPreviewFont(brand.typography?.fonts?.[0]);
  const groups = menu?.navigationGroups || [];
  const menuItems = menu?.items || [];
  const assetMode = selectedAssets.size ? labels.selected : labels.suggested;
  const cardMarkup = menuItems.map((item) => {
    const allergens = item.allergens?.length ? item.allergens.join(', ') : item.allergenNote || '';
    const source = item.sourceUrl ? `<a href="${pEscape(item.sourceUrl)}" target="_blank" rel="noreferrer">${item.sourceFormat === 'image-ocr' ? 'Official menu source ↗' : 'Source ↗'}</a>` : '';
    return `<article class="preview-menu-card"><div class="preview-product-placeholder"><span>${pEscape(labels.productPhoto)}</span></div><div class="preview-card-content"><div class="preview-card-title"><div><small>${pEscape(groups.find((group) => group.id === item.productType)?.label || '')}</small><h4>${pEscape(item.name)}</h4></div><strong>${pEscape(item.price)}</strong></div>${item.volumeOrWeight ? `<span class="preview-volume">${pEscape(item.volumeOrWeight)}</span>` : ''}${item.description ? `<p>${pEscape(item.description)}</p>` : ''}${allergens ? `<small>${pEscape(`${labels.allergens}: ${allergens}`)}</small>` : ''}${source}</div></article>`;
  }).join('');
  preview.style.setProperty('--preview-primary', primary);
  preview.style.setProperty('--preview-paper', paper);
  preview.style.setProperty('--preview-font', fontFamily);
  preview.innerHTML = `<article class="preview-shell">
    <div class="preview-status"><span>${pEscape(assetMode)}</span><span>${pEscape(productionFullAudit.template.name)} · structure only</span></div>
    <header class="preview-header"><a class="preview-brand" href="#landing-preview">${logo?.previewUrl ? `<img src="${pEscape(logo.previewUrl)}" alt="${pEscape(logo.label)}" />` : `<strong>${pEscape(pShortBrandName(brand.cafe.name))}</strong>`}</a><nav>${groups.map((group) => `<a href="#preview-menu">${pEscape(group.label)}</a>`).join('')}</nav><a class="preview-language" href="#preview-menu">${pEscape(nativeCode.toUpperCase())} / EN</a></header>
    <section class="preview-hero">${scene?.previewUrl ? `<img class="preview-hero-image" src="${pEscape(scene.previewUrl)}" alt="${pEscape(scene.label)}" />` : ''}<div class="preview-hero-overlay"></div><div class="preview-hero-content"><p>${pEscape(labels.menu)}</p><h3>${pEscape(seo?.h1 || brand.cafe.name)}</h3><div class="preview-hero-meta"><span>${pEscape(brand.contacts?.address || brand.cafe.city)}</span><span>${pEscape(brand.contacts?.hours || '')}</span></div><div class="preview-hero-actions"><a href="#preview-menu" class="preview-button">${pEscape(labels.menu)}</a><a href="#preview-footer" class="preview-button ghost">${pEscape(labels.contact)}</a></div></div></section>
    <section id="preview-menu" class="preview-menu"><div class="preview-menu-heading"><div><p>${pEscape(labels.menu)}</p><h3>${pEscape(pShortBrandName(brand.cafe.name))}</h3></div><span>${menuItems.length} / 12</span></div><div class="preview-menu-tabs">${groups.map((group, index) => `<button class="preview-menu-tab ${index === 0 ? 'active' : ''}" type="button" tabindex="-1">${pEscape(group.label)} <span>${group.count}</span></button>`).join('')}</div><div class="preview-card-grid">${cardMarkup || '<p class="preview-empty">Menu data has not been confirmed yet.</p>'}</div></section>
    <section class="preview-contact-strip"><div><p>${pEscape(labels.visit)}</p><h3>${pEscape(brand.cafe.name)}</h3></div><div><small>${pEscape(labels.address)}</small><strong>${pEscape(brand.contacts?.address || brand.cafe.city)}</strong></div><div><small>${pEscape(labels.hours)}</small><strong>${pEscape(brand.contacts?.hours || '—')}</strong></div><a href="#preview-footer" class="preview-button">${pEscape(labels.contact)}</a></section>
    <footer id="preview-footer" class="preview-footer"><div>${logo?.previewUrl ? `<img src="${pEscape(logo.previewUrl)}" alt="" />` : `<strong>${pEscape(pShortBrandName(brand.cafe.name))}</strong>`}<span>${pEscape([brand.contacts?.phone, brand.contacts?.email].filter(Boolean).join(' · '))}</span></div><div><a href="#preview-menu">${pEscape(labels.menu)}</a><a href="#preview-footer">${pEscape(labels.contact)}</a><span>${pEscape(nativeCode.toUpperCase())} / EN</span></div></footer>
  </article>`;
}

function pRenderBrand() {
  const brand = productionFullAudit?.brands?.[productionFullBrandIndex];
  if (!brand) return;
  pRenderClassicLight(brand);
  productionFullNodes.brandSelect?.replaceChildren(...productionFullAudit.brands.map((item, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${item.cafe.name} · ${item.cafe.city}`;
    option.selected = index === productionFullBrandIndex;
    return option;
  }));
  if (productionFullNodes.brandSummary) {
    productionFullNodes.brandSummary.innerHTML = `<article><p class="eyebrow">официальный источник</p><a href="${pEscape(brand.source.url)}" target="_blank" rel="noreferrer">${pEscape(pHostName(brand.source.url))} ↗</a><small>Получен: ${new Date(brand.source.capturedAt).toLocaleString('ru-RU')}</small></article><article><p class="eyebrow">языки</p><strong>Нативный: ${pEscape(brand.language.native.label)} · лендинг: ${(brand.language.landing || []).map(pEscape).join(', ')}</strong><small>Сайт: ${(brand.language.detected || []).map(pEscape).join(', ')}. Английский добавляется обязательно; без версии сайта — как черновик перевода.</small></article><article><p class="eyebrow">сценарий</p><strong>Только прод-разбор</strong><small>HTML-лендинг не создаётся.</small></article>`;
  }
  pRenderAssetCards(productionFullNodes.brandAssets, (brand.assets || []).filter((asset) => !['menu-source'].includes(asset.kind)).slice(0, 16), productionFullBrandIndex);
  if (productionFullNodes.brandTypography) {
    productionFullNodes.brandTypography.innerHTML = brand.typography?.fonts?.length ? brand.typography.fonts.map((font) => `<article><strong>${pEscape(font.family)}</strong><a href="${pEscape(font.evidenceUrl)}" target="_blank" rel="noreferrer">CSS-источник ↗</a><small>${pEscape(font.source || 'font-family найден в CSS')}</small></article>`).join('') : '<p class="empty-state">В CSS не найдено семейств шрифтов.</p>';
  }
  pRenderColorRole(productionFullNodes.brandTextColors, brand.colorRoles?.text || [], 'В CSS не удалось доказать цвет текста.');
  pRenderColorRole(productionFullNodes.brandSurfaceColors, brand.colorRoles?.surface || [], 'В CSS не удалось доказать цвет фона.');
  const facts = [['Адрес', brand.contacts?.address], ['Телефон', brand.contacts?.phone], ['E-mail', brand.contacts?.email], ['Часы', brand.contacts?.hours], ['Бронирование', brand.contacts?.bookingUrl || (brand.contacts?.walkInOnly ? 'walk-ins only' : '')]];
  if (productionFullNodes.brandFacts) productionFullNodes.brandFacts.innerHTML = facts.map(([label, value]) => `<div><dt>${pEscape(label)}</dt><dd>${pEscape(value || 'не найдено')}</dd></div>`).join('');
  pRenderSeoDrafts(productionFullNodes.brandSeoDrafts, brand.contentAssets?.seoDrafts || [], productionFullBrandIndex);
  pRenderMenuByLanguage(productionFullNodes.brandMenuContent, brand.contentAssets?.menuByLanguage || [], productionFullBrandIndex);
  pRenderLandingPreview(brand);
}

function pRenderValidation() {
  const validation = productionFullAudit?.validation;
  if (!validation) return;
  if (productionFullNodes.auditState) {
    const label = validation.status === 'ready-for-approval' ? 'Данные готовы к согласованию' : validation.status === 'review-required' ? 'Нужно ручное согласование' : 'Сбор заблокирован';
    productionFullNodes.auditState.innerHTML = `<strong>${label}</strong><span>${validation.errors} ошибок · ${validation.warnings} предупреждений</span>`;
  }
  if (productionFullNodes.approvalCount) productionFullNodes.approvalCount.textContent = `${pSelectedApprovalCount()} подтверждённых данных`;
  productionFullNodes.validationList?.replaceChildren(...(validation.checks || []).map((check) => {
    const item = document.createElement('article');
    item.className = `validation-item ${check.status}`;
    item.innerHTML = `<span class="check-dot"></span><div><small>${pEscape(check.scope)}</small><strong>${pEscape(check.label)}</strong><p>${pEscape(check.detail)}</p></div>`;
    return item;
  }));
}

function pRenderAudit() {
  if (!productionFullAudit) return;
  productionFullNodes.auditResults.hidden = false;
  pRenderTemplate();
  pRenderBrand();
  pRenderValidation();
}

async function pRunProductionAudit() {
  const selected = selectedProductionCafes();
  const templateId = productionFullNodes.templateSelect?.value || 'classic-light-1';
  const templateMeta = productionFullTemplateMeta[templateId] || {};
  if (templateMeta.pending) {
    pSetAuditStatus(`Для «${templateMeta.name}» пока нет контракта. Сейчас доступен разбор по Classic Light.`, 'warning');
    return;
  }
  if (!selected.length) {
    pSetAuditStatus('Отметьте хотя бы одно кафе в таблице выше.', 'error');
    return;
  }
  productionFullNodes.runAudit.disabled = true;
  pSetAuditStatus('Фиксирую структуру шаблона; шрифты, цвета, ассеты и меню собираю только с сайта кафе…', 'loading');
  try {
    const response = await fetch('/api/production/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productionIds: selected.map((cafe) => cafe.productionId),
        templateId,
        backgroundId: templateId === 'classic-light-1' ? pSelectedClassicLightBackgroundId() : ''
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Прод-разбор не завершился.');
    productionFullAudit = payload.audit;
    productionFullBrandIndex = 0;
    productionFullApprovals = {};
    await pLoadProductionAuditIndex();
    renderProductionCafeTable();
    pRenderAudit();
    pSetAuditStatus(`Готово: ${productionFullAudit.brands.length} разбор(а) сохранены. Нажмите на название кафе в таблице, чтобы открыть его ассеты.`, productionFullAudit.validation?.warnings ? 'warning' : 'success');
  } catch (error) {
    pSetAuditStatus(error.message || 'Прод-разбор не завершился.', 'error');
  } finally {
    const currentMeta = productionFullTemplateMeta[productionFullNodes.templateSelect?.value || 'classic-light-1'] || {};
    productionFullNodes.runAudit.disabled = !selectedProductionCafes().length || Boolean(currentMeta.pending);
  }
}

async function pDeleteSelectedProductionCafes() {
  const selected = selectedProductionCafes();
  if (!selected.length) {
    pSetAuditStatus('Отметьте хотя бы одно кафе для удаления из прода.', 'error');
    return;
  }
  const confirmation = selected.length === 1
    ? `Удалить «${selected[0].name || 'это кафе'}» из прода и очистить все его сохранённые ассеты?`
    : `Удалить из прода ${selected.length} кафе и очистить все их сохранённые ассеты?`;
  if (!window.confirm(confirmation)) return;

  const button = productionFullNodes.deleteCafes;
  if (button) button.disabled = true;
  pSetAuditStatus('Удаляю кафе из прода и очищаю сохранённые ассеты…', 'loading');
  try {
    const response = await fetch('/api/production', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productionIds: selected.map((cafe) => cafe.productionId) })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось удалить выбранные кафе из прода.');

    const removedIds = new Set((payload.productionIds || selected.map((cafe) => cafe.productionId)).map(String));
    productionSelections = new Set([...productionSelections].filter((id) => !removedIds.has(id)));
    if (productionFullAudit?.brands?.some((brand) => removedIds.has(String(brand?.cafe?.productionId || '')))) {
      productionFullAudit = null;
      productionFullBrandIndex = 0;
      productionFullApprovals = {};
      productionFullNodes.auditResults.hidden = true;
      if (productionFullNodes.classicLightCafeName) {
        productionFullNodes.classicLightCafeName.textContent = '';
        productionFullNodes.classicLightCafeName.hidden = true;
      }
    }
    await loadProductionFull();
    pSetAuditStatus(`Удалено из прода: ${payload.deletedCount}. Удалено сохранённых разборов: ${payload.deletedAuditCount}.`, 'success');
  } catch (error) {
    pSetAuditStatus(error.message || 'Не удалось удалить выбранные кафе из прода.', 'error');
    renderProductionCafeTable();
  }
}

productionFullNodes.cafesBody?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-production-audit-view]');
  if (!button) return;
  pOpenStoredProductionAudit(button.dataset.productionAuditView);
});

productionFullNodes.cafesBody?.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-production-cafe-check]');
  if (!checkbox) return;
  if (checkbox.checked) productionSelections.add(checkbox.dataset.productionCafeCheck);
  else productionSelections.delete(checkbox.dataset.productionCafeCheck);
  pInvalidateAuditForCafeSelection();
  renderProductionCafeTable();
  renderProductionSelectedFull();
});

productionFullNodes.cafeSelectAll?.addEventListener('change', () => {
  const visible = pProductionCafesForCurrentMenu();
  visible.forEach((cafe) => {
    if (productionFullNodes.cafeSelectAll.checked) productionSelections.add(cafe.productionId);
    else productionSelections.delete(cafe.productionId);
  });
  pInvalidateAuditForCafeSelection();
  renderProductionCafeTable();
  renderProductionSelectedFull();
});

productionMenuButtons.forEach((button) => button.addEventListener('click', () => {
  productionMenuFilter = button.dataset.productionMenu;
  renderProductionCafeTable();
}));

document.querySelectorAll('[data-production-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.productionSort;
  productionCafeSort = {
    key,
    direction: productionCafeSort.key === key && productionCafeSort.direction === 'asc' ? 'desc' : 'asc'
  };
  renderProductionCafeTable();
}));

productionFullNodes.runAudit?.addEventListener('click', pRunProductionAudit);
productionFullNodes.deleteCafes?.addEventListener('click', pDeleteSelectedProductionCafes);
productionFullNodes.classicLightPublish?.addEventListener('click', pPublishClassicLight);
productionFullNodes.classicLightSend?.addEventListener('click', pSendClassicLightToSendings);
productionFullNodes.brandSelect?.addEventListener('change', () => {
  productionFullBrandIndex = Number(productionFullNodes.brandSelect.value);
  pRenderBrand();
});
productionFullNodes.templateSelect?.addEventListener('change', () => {
  pUpdateTemplateContext(productionFullNodes.templateSelect.value);
  renderProductionSelectedFull();
  if (productionFullAudit && productionFullAudit.template.id !== productionFullNodes.templateSelect.value) {
    productionFullNodes.auditResults.hidden = true;
    pSetAuditStatus('Прототип изменён. Запустите прод-разбор заново: результаты прошлого шаблона скрыты.', 'warning');
  }
});
productionFullNodes.backgroundSelect?.addEventListener('change', () => {
  void pSaveClassicLightBackground();
});
productionFullNodes.downloadAudit?.addEventListener('click', () => {
  if (!productionFullAudit) return;
  const payload = {
    ...productionFullAudit,
    manualApproval: Object.fromEntries(Object.entries(productionFullApprovals).map(([index, ids]) => [productionFullAudit.brands[Number(index)]?.cafe.name || index, [...ids]]))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prod-package-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});
