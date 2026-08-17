const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const state = { csrfToken: '', sites: [] };
const statusNames = { active: 'Активен', paused: 'Остановлен', expired: 'Истёк', archived: 'Удалён' };

function dateTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateValue(value) { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : ''; }

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['content-type'] = 'application/json';
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers['x-ops-csrf'] = state.csrfToken;
  const response = await fetch(url, { ...options, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Не удалось выполнить запрос.');
  return payload;
}

async function copyText(value) {
  const text = String(value || '');
  if (!text) throw new Error('Нет данных для копирования.');
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('Браузер не разрешил копирование.');
  }
}

function filteredSites() {
  const query = $('#site-search').value.trim().toLowerCase();
  const status = $('#status-filter').value;
  return state.sites.filter((site) => (!query || `${site.cafeName} ${site.hostname}`.toLowerCase().includes(query)) && (status === 'all' || site.status === status));
}

function renderMetrics() {
  $('#metric-total').textContent = state.sites.length;
  $('#metric-active').textContent = state.sites.filter((site) => site.status === 'active').length;
  $('#metric-attention').textContent = state.sites.filter((site) => ['paused', 'expired', 'archived'].includes(site.status)).length;
}

function renderSites() {
  const sites = filteredSites();
  $('#registry-message').textContent = sites.length === state.sites.length ? `В реестре: ${sites.length}` : `Показано: ${sites.length} из ${state.sites.length}`;
  $('#sites-table').innerHTML = sites.length ? sites.map((site) => {
    const actions = site.status === 'archived'
      ? `<button class="button secondary" type="button" data-action="restore" data-site-id="${escapeHtml(site.siteId)}">Восстановить</button>`
      : `${site.status === 'active' ? `<button class="button secondary" type="button" data-action="pause" data-site-id="${escapeHtml(site.siteId)}">Остановить</button>` : `<button class="button secondary" type="button" data-action="activate" data-site-id="${escapeHtml(site.siteId)}">Включить</button>`}<button class="button secondary" type="button" data-action="save-expiry" data-site-id="${escapeHtml(site.siteId)}">Сохранить срок</button><button class="button danger" type="button" data-action="archive" data-site-id="${escapeHtml(site.siteId)}">Удалить</button>`;
    const credentials = site.adminUsername
      ? `<div class="admin-credentials"><span>Логин <button class="credential-copy" type="button" data-action="copy-admin-username" data-site-id="${escapeHtml(site.siteId)}" data-copy-value="${escapeHtml(site.adminUsername)}" title="Скопировать логин">${escapeHtml(site.adminUsername)}</button></span><span>Пароль <button class="credential-copy" type="button" data-action="${site.adminPasswordAvailable ? 'copy-admin-password' : 'reset-admin-password'}" data-site-id="${escapeHtml(site.siteId)}" title="${site.adminPasswordAvailable ? 'Скопировать пароль' : 'Создать новый пароль'}">${site.adminPasswordAvailable ? 'Скопировать' : 'Создать новый'}</button></span></div>`
      : '<span class="site-meta">Кабинет ещё не создан</span>';
    return `<tr><td><strong class="site-name">${escapeHtml(site.cafeName || site.hostname)}</strong><a class="site-url" href="${escapeHtml(site.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(site.hostname)}</a><span class="site-meta">${site.cabinetUrl ? `<a href="${escapeHtml(site.cabinetUrl)}" target="_blank" rel="noreferrer">Кабинет кафе ↗</a> · ` : ''}${site.menuItemsCount} поз. · ${escapeHtml(site.subscription || 'trialing')}</span></td><td><span class="status ${escapeHtml(site.status)}">${escapeHtml(statusNames[site.status] || site.status)}</span>${site.countryCode ? `<span class="site-meta">${escapeHtml(site.countryCode)}</span>` : ''}</td><td>${dateTime(site.createdAt)}<span class="site-meta">обновлён ${dateTime(site.updatedAt)}</span></td><td><input class="date-input" data-expiry-for="${escapeHtml(site.siteId)}" type="date" value="${dateValue(site.expiresAt)}" /><span class="date-note">Пусто = без срока</span></td><td>${escapeHtml(site.activeVersion || '—')}<span class="site-meta">версий: ${site.versionsCount}</span></td><td>${credentials}</td><td><div class="row-actions">${actions}</div></td></tr>`;
  }).join('') : '<tr><td class="empty" colspan="7">Нет лендингов с такими условиями.</td></tr>';
}

async function loadSites() {
  $('#registry-message').textContent = 'Загружаем реестр…';
  const payload = await api('/api/ops/sites');
  state.sites = Array.isArray(payload.sites) ? payload.sites : [];
  $('#updated-at').textContent = `Обновлено ${dateTime(new Date().toISOString())}`;
  renderMetrics(); renderSites();
}

async function updateSite(siteId, payload) {
  await api(`/api/ops/sites/${encodeURIComponent(siteId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  await loadSites();
}

async function handleAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const siteId = button.dataset.siteId;
  try {
    if (button.dataset.action === 'copy-admin-username') {
      await copyText(button.dataset.copyValue);
      $('#registry-message').textContent = 'Логин админки скопирован.';
      return;
    }
    if (button.dataset.action === 'copy-admin-password' || button.dataset.action === 'reset-admin-password') {
      const reset = button.dataset.action === 'reset-admin-password';
      if (reset && !window.confirm('Создать новый пароль для этого кабинета? Старый пароль перестанет работать.')) return;
      const suffix = reset ? '/admin-credentials/reset' : '/admin-credentials';
      const payload = await api(`/api/ops/sites/${encodeURIComponent(siteId)}${suffix}`, { method: 'POST', body: '{}' });
      await copyText(payload.credentials?.password);
      $('#registry-message').textContent = reset ? 'Новый пароль создан и скопирован. Старый пароль больше не действует.' : 'Пароль админки скопирован.';
      await loadSites();
      return;
    }
    if (button.dataset.action === 'archive') {
      if (!window.confirm('Удалить лендинг из публикации? Данные сохранятся для восстановления.')) return;
      await api(`/api/ops/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
    } else if (button.dataset.action === 'restore') {
      await api(`/api/ops/sites/${encodeURIComponent(siteId)}/restore`, { method: 'POST', body: '{}' });
    } else {
      const expiry = $(`[data-expiry-for="${CSS.escape(siteId)}"]`)?.value || '';
      if (button.dataset.action === 'pause') await updateSite(siteId, { status: 'paused' });
      else if (button.dataset.action === 'activate') await updateSite(siteId, { status: 'active', expiresAt: expiry || null });
      else await updateSite(siteId, { expiresAt: expiry || null });
      return;
    }
    await loadSites();
  } catch (error) { $('#registry-message').textContent = error.message || 'Не удалось изменить лендинг.'; }
}

async function showApp(session) {
  state.csrfToken = session.csrfToken;
  $('#operator-email').textContent = session.email;
  $('#login-view').hidden = true; $('#app').hidden = false;
  try { await loadSites(); } catch (error) { $('#registry-message').textContent = error.message || 'Не удалось загрузить реестр.'; }
}

async function init() {
  try { await showApp(await api('/api/ops/auth/session')); }
  catch { $('#login-view').hidden = false; }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#login-message').textContent = '';
  try { await showApp(await api('/api/ops/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) })); }
  catch (error) { $('#login-message').textContent = error.message || 'Не удалось войти.'; }
});
$('#refresh-button').addEventListener('click', () => loadSites().catch((error) => { $('#registry-message').textContent = error.message; }));
$('#logout-button').addEventListener('click', async () => { try { await api('/api/ops/auth/logout', { method: 'POST', body: '{}' }); } finally { location.reload(); } });
$('#site-search').addEventListener('input', renderSites); $('#status-filter').addEventListener('change', renderSites); $('#sites-table').addEventListener('click', handleAction);
init();
