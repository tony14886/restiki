const slugMatch = /^\/sites\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/?$/u.exec(window.location.pathname);
const slug = slugMatch?.[1] || '';
const loginCard = document.querySelector('#login-card');
const workspace = document.querySelector('#workspace');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const menuList = document.querySelector('#menu-list');
const publishButton = document.querySelector('#publish');
const publishState = document.querySelector('#publish-state');
const notice = document.querySelector('#notice');
let csrfToken = '';
let currentSite = null;
let dirty = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function setNotice(message, type = '') {
  notice.textContent = message;
  notice.className = `notice ${type}`.trim();
  notice.hidden = !message;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('x-site-admin-csrf', csrfToken);
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить запрос.');
  return payload;
}

function groupItems(items) {
  return items.reduce((groups, item) => {
    const category = item.category || 'Без категории';
    (groups.get(category) || groups.set(category, []).get(category)).push(item);
    return groups;
  }, new Map());
}

function renderMenu() {
  const groups = groupItems(currentSite.menu || []);
  menuList.innerHTML = [...groups.entries()].map(([category, items]) => `<section class="menu-group"><h2>${escapeHtml(category)}</h2>${items.map((item) => `<label class="menu-row"><span class="menu-name">${escapeHtml(item.name)}</span><input data-menu-item="${escapeHtml(item.id)}" value="${escapeHtml(item.price)}" aria-label="Цена: ${escapeHtml(item.name)}" maxlength="40" /></label>`).join('')}</section>`).join('');
}

function showWorkspace() {
  loginCard.hidden = true;
  workspace.hidden = false;
  document.querySelector('#restaurant-name').textContent = currentSite.name;
  document.querySelector('#open-public-site').href = `https://${currentSite.hostname}/`;
  renderMenu();
  dirty = false;
  publishButton.disabled = true;
  publishState.textContent = `Опубликована ${currentSite.activeVersion}`;
}

async function loadSite() {
  const payload = await api(`/api/site-admin/sites/${encodeURIComponent(slug)}`);
  currentSite = payload.site;
  showWorkspace();
}

async function restoreSession() {
  if (!slug) {
    loginCard.hidden = false;
    loginMessage.textContent = 'Некорректная ссылка на кабинет.';
    return;
  }
  try {
    const session = await api(`/api/site-admin/auth/session?slug=${encodeURIComponent(slug)}`);
    csrfToken = session.csrfToken;
    await loadSite();
  } catch {
    loginCard.hidden = false;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const payload = await api('/api/site-admin/auth/login', { method: 'POST', body: JSON.stringify({ slug, username: document.querySelector('#login-username').value, password: document.querySelector('#login-password').value }) });
    csrfToken = payload.csrfToken;
    document.querySelector('#login-password').value = '';
    await loadSite();
  } catch (error) {
    loginMessage.textContent = error.message || 'Не удалось войти.';
  } finally {
    submit.disabled = false;
  }
});

menuList.addEventListener('input', () => {
  dirty = true;
  publishButton.disabled = false;
  publishState.textContent = 'Есть неопубликованные изменения';
  setNotice('');
});

publishButton.addEventListener('click', async () => {
  if (!dirty || !currentSite) return;
  const items = [...menuList.querySelectorAll('[data-menu-item]')].map((input) => ({ id: input.dataset.menuItem, price: input.value.trim() }));
  publishButton.disabled = true;
  publishState.textContent = 'Публикуем…';
  try {
    const payload = await api(`/api/site-admin/sites/${encodeURIComponent(slug)}/prices`, { method: 'PUT', body: JSON.stringify({ baseVersion: currentSite.activeVersion, items }) });
    currentSite = payload.site;
    showWorkspace();
    setNotice('Цены опубликованы. Публичное меню уже обновлено.');
  } catch (error) {
    publishButton.disabled = false;
    publishState.textContent = 'Не удалось опубликовать';
    setNotice(error.message || 'Не удалось опубликовать цены.', 'error');
  }
});

document.querySelector('#logout').addEventListener('click', async () => {
  try { await api('/api/site-admin/auth/logout', { method: 'POST' }); } catch {}
  csrfToken = '';
  currentSite = null;
  workspace.hidden = true;
  loginForm.reset();
  loginCard.hidden = false;
});

restoreSession();
