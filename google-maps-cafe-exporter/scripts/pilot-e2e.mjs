import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostname = 'smoke-cafe.menu-on.test';
const landingHost = 'menu-on.test';
const clientHost = 'cabinet.menu-on.test';
const operatorHost = 'ops.menu-on.test';
const siteId = 'site_0123456789abcdef';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, { method = 'GET', pathname, host, headers = {}, json } = {}) {
  return new Promise((resolve, reject) => {
    const body = json === undefined ? '' : JSON.stringify(json);
    const requestHeaders = { host, ...headers };
    if (json !== undefined) requestHeaders['content-type'] ||= 'application/json';
    if (body) requestHeaders['content-length'] = Buffer.byteLength(body);
    const pending = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers: requestHeaders }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let payload = null;
        try { payload = JSON.parse(raw); } catch { /* Non-JSON public assets are expected. */ }
        resolve({ status: response.statusCode, headers: response.headers, raw, payload });
      });
    });
    pending.once('error', reject);
    if (body) pending.write(body);
    pending.end();
  });
}

function sessionCookie(response, cookieName) {
  const cookie = String(response.headers['set-cookie']?.find((entry) => entry.startsWith(`${cookieName}=`)) || '').split(';')[0];
  if (!cookie) throw new Error(`The server did not establish ${cookieName}.`);
  return cookie;
}

function expectStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}: expected ${expected}, received ${response.status}: ${response.raw.slice(0, 300)}`);
  return response;
}

async function waitForHealth(port, child, errorOutput) {
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await request(port, { pathname: '/healthz', host: operatorHost });
      if (response.status === 200) return;
    } catch (error) { lastError = error; }
    if (child.exitCode !== null) throw new Error(`Temporary server exited before becoming healthy: ${errorOutput() || 'no error output'}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Temporary server did not become healthy.');
}

function samplePublishedContent() {
  return {
    localization: { activeLanguage: 'en', nativeLanguage: 'en', languages: [{ code: 'en', label: 'EN' }, { code: 'ru', label: 'RU' }] },
    restaurant: {
      name: 'Smoke Cafe', subtitle: 'Independent smoke test menu', description: 'A complete pilot test artifact.',
      address: { display: 'Minsk, Belarus', country: 'BY' }, phone: { display: '+375 29 000 00 00' }, email: 'cafe@example.test',
      bookingUrl: 'https://booking.example.test', websiteUrl: 'https://example.test',
      openingHours: { schedule: [
        { label: { en: 'Monday' }, value: { en: '09:00–18:00' } },
        { label: { en: 'Tuesday' }, value: { en: '09:00–18:00' } }
      ] }
    },
    map: { directionsUrl: 'https://www.google.com/maps/place/Smoke+Cafe/@53.9000,27.5667,16z' },
    menu: {
      mode: 'regular', categories: [{ id: 'drinks', label: { en: 'Drinks', ru: 'Напитки' }, icon: 'cup' }],
      items: [{
        id: 'coffee', categoryId: 'drinks', translations: { en: { name: 'Coffee', description: 'Fresh coffee' }, ru: { name: 'Кофе', description: 'Свежий кофе' } },
        pricing: { native: { formatted: '€3.50', currency: 'EUR' } }, image: { src: '' }, portion: '250 ml', variants: [], modifiers: [], dietaryTags: [], allergens: {}, allergenStatus: 'verified'
      }]
    }
  };
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'fastmenu-pilot-e2e-'));
const tempData = path.join(tempRoot, 'data');
const tempUploads = path.join(tempRoot, 'uploads');
const port = await freePort();
let child = null;
let errorOutput = '';

try {
  await Promise.all([mkdir(tempData, { recursive: true }), mkdir(tempUploads, { recursive: true })]);
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port), NODE_ENV: 'test', PILOT_MODE: '1',
      FASTMENU_DATA_DIR: tempData, FASTMENU_UPLOADS_DIR: tempUploads,
      PILOT_PUBLIC_HOSTS: 'demo.menu-on.test', PILOT_CLIENT_HOSTS: clientHost, PILOT_OPERATOR_HOSTS: operatorHost,
      PILOT_SITE_DOMAIN: 'menu-on.test', PUBLIC_MENU_ORIGIN: 'https://demo.menu-on.test', PUBLISH_API_TOKEN: 'test-publication-token',
      ADMIN_SESSION_SECRET: 'test-client-session-secret', ADMIN_EMAIL: 'client@example.test', ADMIN_PASSWORD: 'test-client-password',
      OPS_SESSION_SECRET: 'test-operator-session-secret', OPS_EMAIL: 'ops@example.test', OPS_PASSWORD: 'test-operator-password',
      SITE_ADMIN_CREDENTIALS_KEY: 'test-site-admin-credentials-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (chunk) => { errorOutput += chunk; });
  await waitForHealth(port, child, () => errorOutput);

  const salesLanding = await request(port, { pathname: '/', host: landingHost });
  expectStatus(salesLanding, 200, 'Serve sales landing from apex domain');
  if (!salesLanding.raw.includes('Menu-on — современное онлайн-меню для ресторана')) throw new Error('Sales landing did not return its metadata.');
  const salesAsset = await request(port, { pathname: '/landing/landing.js', host: landingHost });
  expectStatus(salesAsset, 200, 'Serve sales landing assets');
  const legalAsset = await request(port, { pathname: '/landing/legal.js', host: landingHost });
  expectStatus(legalAsset, 200, 'Serve legal document application');
  for (const [pathname, marker] of [['/landing/legal-content/terms.md', 'Условия оказания услуг'], ['/landing/legal-content/privacy.md', 'Политика конфиденциальности и использования cookies'], ['/landing/legal-content/dpa.md', 'Соглашение об обработке персональных данных']]) {
    const legalContent = await request(port, { pathname, host: landingHost });
    expectStatus(legalContent, 200, `Serve ${pathname}`);
    if (!legalContent.raw.includes(marker)) throw new Error(`${pathname} did not return approved source content.`);
  }
  for (const [pathname, expectedHeading] of [['/terms', 'Условия оказания услуг'], ['/privacy', 'Политика конфиденциальности'], ['/dpa', 'Соглашение об обработке персональных данных'], ['/legal', 'Юридическая информация']]) {
    const documentPage = await request(port, { pathname, host: landingHost });
    expectStatus(documentPage, 200, `Serve ${pathname} document page from apex domain`);
    if (!documentPage.raw.includes('id="legal-root"') || !legalAsset.raw.includes(expectedHeading)) throw new Error(`${pathname} did not return its document application.`);
  }
  const demoRequest = await request(port, {
    method: 'POST', pathname: '/api/demo-request', host: landingHost,
    json: { websiteUrl: 'https://restaurant.example.test', email: 'owner@restaurant.example.test', source: 'sales-landing', locale: 'ru' }
  });
  expectStatus(demoRequest, 201, 'Accept sales landing demo request');
  const blockedSalesPath = await request(port, { pathname: '/ops.html', host: landingHost });
  expectStatus(blockedSalesPath, 404, 'Keep sales landing hostname isolated');

  const content = samplePublishedContent();
  const contentJson = JSON.stringify(content).replaceAll('</script', '<\\/script');
  const html = `<!doctype html><html lang="en"><body><script id="template-content" type="application/json">${contentJson}</script></body></html>`;
  const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
  const deployment = await request(port, {
    method: 'POST', pathname: '/api/deploy/published-sites', host: clientHost,
    headers: { authorization: 'Bearer test-publication-token' },
    json: {
      hostname, siteId, version: 'v20260811-smoke', html, sha256, expiresAt: null,
      commercial: { countryCode: 'BY', countrySource: 'google_maps' },
      siteAdmin: { username: 'client@example.test', password: 'test-site-password' }
    }
  });
  expectStatus(deployment, 201, 'Deploy test site');
  if (deployment.payload?.site?.hostname !== hostname || deployment.payload?.admin?.url !== `https://${clientHost}/sites/smoke-cafe`) throw new Error('Deployment did not return the expected public and cabinet routes.');

  const publicPage = await request(port, { pathname: '/', host: hostname });
  expectStatus(publicPage, 200, 'Serve public landing');
  if (!publicPage.raw.includes('Smoke Cafe')) throw new Error('Published landing did not contain the artifact content.');
  const cabinetPage = await request(port, { pathname: '/sites/smoke-cafe', host: clientHost });
  expectStatus(cabinetPage, 200, 'Serve client cabinet');
  if (!cabinetPage.raw.includes('window.__FASTMENU_SITE_LOGIN_EMAIL="client@example.test";window.__FASTMENU_SITE_INTERFACE_LANGUAGE="en"')) throw new Error('Client cabinet did not receive its existing login and native interface language.');

  const badLogin = await request(port, { method: 'POST', pathname: '/api/admin/auth/login', host: clientHost, json: { email: 'client@example.test', password: 'wrong', site: 'smoke-cafe' } });
  expectStatus(badLogin, 401, 'Reject bad client login');
  const login = await request(port, { method: 'POST', pathname: '/api/admin/auth/login', host: clientHost, json: { email: 'client@example.test', password: 'test-site-password', site: 'smoke-cafe' } });
  expectStatus(login, 200, 'Client login');
  const clientCookie = sessionCookie(login, 'fastmenu_admin_session');
  const clientCsrf = login.payload?.csrfToken;
  if (!clientCsrf) throw new Error('Client login did not return a CSRF token.');
  const clientHeaders = { cookie: clientCookie, 'x-admin-csrf': clientCsrf };

  const session = await request(port, { pathname: '/api/admin/auth/session?site=smoke-cafe', host: clientHost, headers: { cookie: clientCookie } });
  expectStatus(session, 200, 'Client session');
  const workspaceResponse = await request(port, { pathname: '/api/admin/workspace', host: clientHost, headers: { cookie: clientCookie } });
  expectStatus(workspaceResponse, 200, 'Read client workspace');
  const draft = workspaceResponse.payload?.draft;
  if (!draft?.menuItems?.length || !draft?.openingHours?.length) throw new Error('Imported client workspace was incomplete.');
  if (draft.restaurant?.address !== 'Minsk, Belarus' || draft.restaurant?.mapUrl !== content.map.directionsUrl) throw new Error('Imported client location was not normalized.');

  draft.restaurant.name = 'Smoke Cafe Updated';
  draft.restaurant.address = 'Updated address, Minsk';
  draft.restaurant.mapUrl = 'https://www.google.com/maps/search/?api=1&query=Updated%20address%2C%20Minsk';
  draft.restaurant.phone = '+375 29 111 11 11';
  draft.restaurant.socials = [{ platform: 'instagram', url: 'https://instagram.com/smokecafe' }, { platform: 'facebook', url: 'https://facebook.com/smokecafe' }];
  draft.menuItems[0].name.en = 'Updated coffee';
  draft.menuItems[0].description.en = 'Updated description';
  draft.menuItems[0].price = { amount: 12.5, currency: 'BYN' };
  draft.openingHours[0] = { ...draft.openingHours[0], from: '08:30', to: '22:15', closed: false };
  draft.specialOpeningHours = [{ id: 'holiday', date: '2026-12-31', label: 'Holiday', from: '', to: '', closed: true }];
  draft.temporaryClosure = { closed: false, resumeDate: '', message: '' };
  const saveDraft = await request(port, { method: 'PUT', pathname: '/api/admin/draft', host: clientHost, headers: clientHeaders, json: { draft } });
  expectStatus(saveDraft, 200, 'Save all client draft fields');
  const savedDraft = saveDraft.payload?.draft;
  if (savedDraft?.menuItems?.[0]?.price?.currency !== 'BYN' || savedDraft?.openingHours?.[0]?.from !== '08:30' || savedDraft?.specialOpeningHours?.[0]?.closed !== true || savedDraft?.restaurant?.mapUrl !== draft.restaurant.mapUrl || savedDraft?.restaurant?.socials?.length !== 2) throw new Error('Draft changes were not persisted correctly.');

  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLlmQAAAABJRU5ErkJggg==';
  const upload = await request(port, { method: 'POST', pathname: '/api/admin/assets', host: clientHost, headers: clientHeaders, json: { dataUrl: tinyPng } });
  expectStatus(upload, 201, 'Upload menu image');
  if (!upload.payload?.url?.startsWith(`/uploads/client-admin/${siteId}/`)) throw new Error('Uploaded image URL was not scoped to the client site.');
  const uploadedImage = await request(port, { pathname: upload.payload.url, host: clientHost });
  expectStatus(uploadedImage, 200, 'Read uploaded menu image');

  const qr = await request(port, { method: 'POST', pathname: '/api/admin/qr-codes', host: clientHost, headers: clientHeaders, json: { label: 'Table 1', slug: 'table-1' } });
  expectStatus(qr, 201, 'Create QR code');
  const qrCode = qr.payload?.qrCodes?.find((entry) => entry.slug === 'table-1');
  if (!qrCode?.id) throw new Error('QR code was not returned from the workspace.');
  const qrSvg = await request(port, { pathname: '/api/qr/table-1.svg', host: clientHost, headers: { cookie: clientCookie } });
  expectStatus(qrSvg, 200, 'Render QR code');
  if (!qrSvg.raw.includes('<svg')) throw new Error('QR endpoint did not return SVG content.');
  const qrRedirect = await request(port, { pathname: '/r/table-1', host: hostname });
  if (qrRedirect.status !== 302 || qrRedirect.headers.location !== '/') throw new Error('Public QR route did not redirect to the published menu.');

  const event = await request(port, { method: 'POST', pathname: '/api/events', host: hostname, json: { event: 'page_view', source: 'direct', sessionId: 'visitor-1', deviceType: 'mobile', language: 'en' } });
  expectStatus(event, 202, 'Record public analytics event');
  const analytics = await request(port, { pathname: '/api/admin/analytics?period=30', host: clientHost, headers: { cookie: clientCookie } });
  expectStatus(analytics, 200, 'Read analytics');
  if (analytics.payload?.summary?.visitors < 1 || analytics.payload?.summary?.menuViews < 1) throw new Error('Analytics did not include the public event.');

  const invalidDomain = await request(port, { method: 'PUT', pathname: '/api/admin/domains', host: clientHost, headers: clientHeaders, json: { primary: 'another.menu-on.test' } });
  expectStatus(invalidDomain, 400, 'Reject an unassigned pilot domain');
  const domain = await request(port, { method: 'PUT', pathname: '/api/admin/domains', host: clientHost, headers: clientHeaders, json: { primary: hostname } });
  expectStatus(domain, 200, 'Keep assigned pilot domain');

  const commercial = await request(port, {
    method: 'POST', pathname: '/api/admin/commercial/requests', host: clientHost, headers: clientHeaders,
    json: { company: 'Smoke Cafe LLC', taxId: 'BY-1234567', representative: 'Test owner', email: 'billing@example.test', country: 'BY', authority: true, termsAcknowledged: true }
  });
  expectStatus(commercial, 201, 'Submit commercial request');
  if (commercial.payload?.commercial?.latestRequest?.status !== 'received') throw new Error('Commercial request was not stored.');

  const publish = await request(port, { method: 'POST', pathname: '/api/admin/publish', host: clientHost, headers: clientHeaders, json: {} });
  expectStatus(publish, 200, 'Publish client changes');
  if (publish.payload?.published?.number !== 2) throw new Error('Client publish did not create the expected version.');
  const publicMenu = await request(port, { pathname: '/api/public/menu', host: hostname });
  expectStatus(publicMenu, 200, 'Read published menu data');
  if (publicMenu.payload?.menu?.items?.[0]?.pricing?.native?.formatted?.includes('12.5') !== true || publicMenu.payload?.map?.directionsUrl !== draft.restaurant.mapUrl || publicMenu.payload?.templateOptions?.showMap !== true) throw new Error('Published menu did not preserve the template or saved map.');
  const rollback = await request(port, { method: 'POST', pathname: '/api/admin/rollback/1', host: clientHost, headers: clientHeaders, json: {} });
  expectStatus(rollback, 200, 'Roll back a published version');

  const deleteQr = await request(port, { method: 'DELETE', pathname: `/api/admin/qr-codes/${encodeURIComponent(qrCode.id)}`, host: clientHost, headers: clientHeaders, json: {} });
  expectStatus(deleteQr, 200, 'Delete QR code');

  const unauthenticatedOps = await request(port, { pathname: '/api/ops/sites', host: operatorHost });
  expectStatus(unauthenticatedOps, 401, 'Protect owner registry');
  const opsLogin = await request(port, { method: 'POST', pathname: '/api/ops/auth/login', host: operatorHost, json: { email: 'ops@example.test', password: 'test-operator-password' } });
  expectStatus(opsLogin, 200, 'Owner login');
  const opsCookie = sessionCookie(opsLogin, 'fastmenu_ops_session');
  const opsHeaders = { cookie: opsCookie, 'x-ops-csrf': opsLogin.payload?.csrfToken };
  const registry = await request(port, { pathname: '/api/ops/sites', host: operatorHost, headers: { cookie: opsCookie } });
  expectStatus(registry, 200, 'List owner registry');
  if (!registry.payload?.sites?.some((site) => site.siteId === siteId && site.status === 'active' && site.adminUsername === 'client@example.test' && site.adminPasswordAvailable === true)) throw new Error('Owner registry does not contain the deployed site access summary.');
  const credentials = await request(port, { method: 'POST', pathname: `/api/ops/sites/${siteId}/admin-credentials`, host: operatorHost, headers: opsHeaders, json: {} });
  expectStatus(credentials, 200, 'Read encrypted site admin credentials');
  if (credentials.payload?.credentials?.username !== 'client@example.test' || credentials.payload?.credentials?.password !== 'test-site-password') throw new Error('Owner credentials did not match the provisioned client account.');
  const resetCredentials = await request(port, { method: 'POST', pathname: `/api/ops/sites/${siteId}/admin-credentials/reset`, host: operatorHost, headers: opsHeaders, json: {} });
  expectStatus(resetCredentials, 200, 'Reset site admin credentials');
  if (resetCredentials.payload?.credentials?.username !== 'owner@smoke-cafe' || resetCredentials.payload?.credentials?.password?.length !== 10 || resetCredentials.payload.credentials.password === credentials.payload.credentials.password) throw new Error('Credential reset did not produce the requested compact access data.');
  const resetLogin = await request(port, { method: 'POST', pathname: '/api/admin/auth/login', host: clientHost, json: { email: resetCredentials.payload.credentials.username, password: resetCredentials.payload.credentials.password, site: 'smoke-cafe' } });
  expectStatus(resetLogin, 200, 'Sign in with reset client password');

  const rebuild = await request(port, { method: 'POST', pathname: `/api/ops/sites/${siteId}/rebuild-template`, host: operatorHost, headers: opsHeaders, json: {} });
  expectStatus(rebuild, 200, 'Rebuild published template');
  if (rebuild.payload?.rebuilt !== true || rebuild.payload?.site?.siteId !== siteId) throw new Error('Owner template rebuild did not return the site.');

  const pause = await request(port, { method: 'PATCH', pathname: `/api/ops/sites/${siteId}`, host: operatorHost, headers: opsHeaders, json: { status: 'paused' } });
  expectStatus(pause, 200, 'Pause site');
  expectStatus(await request(port, { pathname: '/', host: hostname }), 404, 'Hide paused public site');
  const resume = await request(port, { method: 'PATCH', pathname: `/api/ops/sites/${siteId}`, host: operatorHost, headers: opsHeaders, json: { status: 'active', expiresAt: null } });
  expectStatus(resume, 200, 'Resume site');
  expectStatus(await request(port, { pathname: '/', host: hostname }), 200, 'Serve resumed public site');
  const archive = await request(port, { method: 'DELETE', pathname: `/api/ops/sites/${siteId}`, host: operatorHost, headers: opsHeaders, json: {} });
  expectStatus(archive, 200, 'Archive site');
  expectStatus(await request(port, { pathname: '/', host: hostname }), 404, 'Hide archived public site');
  const restore = await request(port, { method: 'POST', pathname: `/api/ops/sites/${siteId}/restore`, host: operatorHost, headers: opsHeaders, json: {} });
  expectStatus(restore, 200, 'Restore archived site');
  expectStatus(await request(port, { pathname: '/', host: hostname }), 200, 'Serve restored public site');

  console.log('pilot-e2e=ok; deploy=ok; client-auth=ok; editor=ok; upload=ok; qr=ok; analytics=ok; commercial=ok; publish-rollback=ok; owner-registry=ok');
} finally {
  if (child?.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  await rm(tempRoot, { recursive: true, force: true });
  if (errorOutput && child?.exitCode && child.exitCode !== 0) process.stderr.write(errorOutput);
}
