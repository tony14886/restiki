import dns from 'node:dns/promises';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { PDFParse } from 'pdf-parse';
import QRCode from 'qrcode';
import { createWorker } from 'tesseract.js';
import { loadImage } from '@napi-rs/canvas';
import { readLatestReview } from './lib/maps-reviews.mjs';
import { createXlsxBuffer } from './lib/xlsx-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The local operator app is started directly with `npm start`, so load an
// optional untracked .env file without introducing a deployment dependency.
// Docker passes its own environment explicitly and therefore wins over it.
function loadOptionalEnvFile(file) {
  try {
    for (const line of fsSync.readFileSync(file, 'utf8').split(/\r?\n/u)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
      if (!match || process.env[match[1]] !== undefined) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/u, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

loadOptionalEnvFile(path.join(__dirname, '.env'));

const app = express();
const port = Number(process.env.PORT || 3210);
const maxRadiusKm = Number(process.env.MAX_RADIUS_KM || 25);
const maxSearchPages = Number(process.env.MAX_SEARCH_PAGES || 36);
const maxResultsLimit = Number(process.env.MAX_RESULTS || 120);
const dataDirectory = path.resolve(process.env.FASTMENU_DATA_DIR || path.join(__dirname, 'data'));
const arraysFile = path.join(dataDirectory, 'arrays.json');
const scoringsFile = path.join(dataDirectory, 'scorings.json');
const candidatesFile = path.join(dataDirectory, 'candidates.json');
const productionAuditsFile = path.join(dataDirectory, 'production-audits.json');
const sendingsFile = path.join(dataDirectory, 'sendings.json');
const outreachLocalizationsFile = path.resolve(__dirname, '..', 'menu_on_outreach_localizations_v1.md');
const clientAdminFile = path.join(dataDirectory, 'client-admin.json');
const clientAnalyticsFile = path.join(dataDirectory, 'client-analytics.json');
const demoRequestsFile = path.join(dataDirectory, 'demo-requests.json');
const publishedSitesDirectory = path.join(dataDirectory, 'published-sites');
const publishedSitesRegistryFile = path.join(publishedSitesDirectory, 'sites.json');
const publishedSiteAdminDirectory = path.join(publishedSitesDirectory, 'site-admin');
const publishedClientWorkspaceDirectory = path.join(publishedSitesDirectory, 'client-workspaces');
const publishedClientAnalyticsDirectory = path.join(publishedSitesDirectory, 'client-analytics');
const clientUploadsDirectory = path.resolve(process.env.FASTMENU_UPLOADS_DIR || path.join(__dirname, 'public', 'uploads', 'client-admin'));
const classicLightBackgroundDirectory = path.resolve(__dirname, '..', 'fony');
const classicLightBackgroundMimeTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif']
]);
const cityCenterCache = new Map();
const activeExports = new Map();
const pdfMenuTextCache = new Map();
// Each café menu is checked independently three times. A pass includes the
// official home page plus every confirmed menu page/PDF in the bounded queue;
// a browser-rendered pass follows if fewer than twelve usable dishes survive.
const MENU_EXTRACTION_PASSES = 3;
let lastGeocoderRequestAt = 0;
let arraysWriteQueue = Promise.resolve();
let scoringsWriteQueue = Promise.resolve();
let candidatesWriteQueue = Promise.resolve();
let productionAuditsWriteQueue = Promise.resolve();
let sendingsWriteQueue = Promise.resolve();
let clientAdminWriteQueue = Promise.resolve();
let clientAnalyticsWriteQueue = Promise.resolve();
let demoRequestsWriteQueue = Promise.resolve();
let publishedSitesWriteQueue = Promise.resolve();
const clientAdminLoginAttempts = new Map();
const publishedSiteAdminLoginAttempts = new Map();
const operatorLoginAttempts = new Map();
const demoRequestAttempts = new Map();
// Client cabinets are often opened by a cafe team behind one shared IP. Keep
// a modest guard against password guessing, without making a typo lock every
// employee out for a long time.
const publishedSiteAdminLoginFailureLimit = 8;
const publishedSiteAdminLoginFailureWindowMs = 10 * 60_000;
const publishedSiteAdminLoginBlockMs = 5 * 60_000;
const clientAnalyticsRequestRate = new Map();
const clientAdminSessionCookie = 'fastmenu_admin_session';
const publishedSiteAdminSessionCookie = 'fastmenu_site_admin_session';
const operatorSessionCookie = 'fastmenu_ops_session';
const clientAdminSessionSecret = process.env.ADMIN_SESSION_SECRET || 'local-development-secret-change-before-deploy';
const clientAdminPassword = process.env.ADMIN_PASSWORD || 'fastmenu-local';
const clientAdminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const operatorSessionSecret = String(process.env.OPS_SESSION_SECRET || '').trim();
const operatorEmail = String(process.env.OPS_EMAIL || '').trim().toLowerCase();
const operatorPassword = String(process.env.OPS_PASSWORD || '');
const siteAdminCredentialsSecret = String(process.env.SITE_ADMIN_CREDENTIALS_KEY || '').trim();
const siteAdminCredentialsKey = siteAdminCredentialsSecret ? createHash('sha256').update(siteAdminCredentialsSecret).digest() : null;
const commercialSupportEmail = String(process.env.SUPPORT_EMAIL || '').trim().toLowerCase();
const commercialSupportWhatsApp = String(process.env.SUPPORT_WHATSAPP || '').trim();
const commercialPaymentConfigured = Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim() && String(process.env.STRIPE_PRICE_ID || '').trim());
const pilotMode = process.env.PILOT_MODE === '1';
const pilotPublicHosts = new Set(String(process.env.PILOT_PUBLIC_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const pilotClientHosts = new Set(String(process.env.PILOT_CLIENT_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const pilotOperatorHosts = new Set(String(process.env.PILOT_OPERATOR_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const pilotSiteDomain = String(process.env.PILOT_SITE_DOMAIN || process.env.PUBLISH_SITE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/gu, '');
const configuredPublicMenuOrigin = publicOrigin(process.env.PUBLIC_MENU_ORIGIN || '');
const publishApiUrl = String(process.env.PUBLISH_API_URL || '').trim();
const publishApiToken = String(process.env.PUBLISH_API_TOKEN || '').trim();
// Locally encrypt newly provisioned cafe-admin passwords before persisting a
// publication record. An explicit key is preferred; the publish token is a
// safe local fallback because it is already required to publish and is never
// written to the audit data itself.
const publicationCredentialsSecret = String(process.env.LOCAL_PUBLICATION_CREDENTIALS_KEY || publishApiToken || '').trim();
const publicationCredentialsKey = publicationCredentialsSecret
  ? createHash('sha256').update(`fastmenu:publication-credentials:${publicationCredentialsSecret}`).digest()
  : null;
const bindHost = String(process.env.BIND_HOST || '').trim();

if (pilotMode) {
  if (!pilotPublicHosts.size || !pilotClientHosts.size) throw new Error('PILOT_PUBLIC_HOSTS and PILOT_CLIENT_HOSTS must be set when PILOT_MODE=1.');
  if (pilotOperatorHosts.size && !siteAdminCredentialsKey) throw new Error('SITE_ADMIN_CREDENTIALS_KEY must be set when the operator panel is enabled.');
  app.set('trust proxy', 1);
}

function requestHostname(request) {
  return String(request.get('host') || '').trim().toLowerCase().replace(/:\\d+$/, '');
}

function publicOrigin(value) {
  try {
    const origin = new URL(String(value || '').trim()).origin;
    return /^https?:\/\//i.test(origin) ? origin : '';
  } catch {
    return '';
  }
}

function isPilotPublishedHostname(hostname) {
  if (!pilotSiteDomain || !hostname.endsWith(`.${pilotSiteDomain}`)) return false;
  const label = hostname.slice(0, -(pilotSiteDomain.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label);
}

function isPilotLandingHostname(hostname) {
  return Boolean(pilotMode && pilotSiteDomain && (hostname === pilotSiteDomain || hostname === `www.${pilotSiteDomain}`));
}

function pilotAllowsLandingRequest(request) {
  const isRead = ['GET', 'HEAD'].includes(request.method);
  const pathname = request.path;
  return (isRead && (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/og.png' ||
    pathname === '/favicon.ico' ||
    pathname === '/terms' ||
    pathname === '/terms/' ||
    pathname === '/privacy' ||
    pathname === '/privacy/' ||
    pathname === '/dpa' ||
    pathname === '/dpa/' ||
    pathname === '/legal' ||
    pathname === '/legal/' ||
    pathname === '/landing' ||
    pathname.startsWith('/landing/')
  )) || (request.method === 'POST' && pathname === '/api/demo-request');
}

function publishedSiteIsActive(site) {
  if (!site || site.status !== 'active' || !site.activeVersion) return false;
  if (!site.expiresAt) return true;
  const expiresAt = Date.parse(site.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function readPublishedSitesRegistry() {
  try {
    const parsed = JSON.parse(await fs.readFile(publishedSitesRegistryFile, 'utf8'));
    return {
      version: 1,
      sites: Array.isArray(parsed?.sites) ? parsed.sites : []
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, sites: [] };
    throw new Error('Не удалось прочитать реестр опубликованных демо-сайтов.');
  }
}

async function writePublishedSitesRegistry(registry) {
  await fs.mkdir(publishedSitesDirectory, { recursive: true });
  const temporaryFile = `${publishedSitesRegistryFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(registry, null, 2), 'utf8');
  await fs.rename(temporaryFile, publishedSitesRegistryFile);
}

async function updatePublishedSitesRegistry(mutator) {
  const operation = publishedSitesWriteQueue.then(async () => {
    const registry = await readPublishedSitesRegistry();
    const result = await mutator(registry);
    await writePublishedSitesRegistry(registry);
    return result;
  });
  publishedSitesWriteQueue = operation.catch(() => {});
  return operation;
}

function publishedSiteAdminAccountPath(siteId) {
  if (!/^site_[a-f0-9]{16}$/u.test(String(siteId || ''))) throw publishInputError('Invalid siteId.');
  return path.join(publishedSiteAdminDirectory, `${siteId}.json`);
}

function publishedSiteAdminUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+@-]{2,158}$/u.test(username)) throw publishInputError('Invalid site administrator username.');
  return username;
}

function publishedSiteAdminPassword(value) {
  const password = String(value || '');
  if (password.length < 10 || password.length > 160) throw publishInputError('The site administrator password must be 10–160 characters long.');
  return password;
}

function publishedSiteAdminPasswordHash(password, salt) {
  // scrypt is deliberately used instead of a fast hash: these are credentials
  // for individual cafe cabinets, not deployment secrets.
  return scryptSync(password, salt, 64).toString('hex');
}

function publishedSiteAdminEncryptPassword(password) {
  if (!siteAdminCredentialsKey) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', siteAdminCredentialsKey, iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

function publishedSiteAdminDecryptPassword(account) {
  const encrypted = account?.recoverablePassword;
  if (!siteAdminCredentialsKey || !encrypted?.iv || !encrypted?.tag || !encrypted?.ciphertext) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', siteAdminCredentialsKey, Buffer.from(encrypted.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function encryptPublicationPassword(password) {
  if (!publicationCredentialsKey || !password) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', publicationCredentialsKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

function decryptPublicationPassword(encrypted) {
  if (!publicationCredentialsKey || !encrypted?.iv || !encrypted?.tag || !encrypted?.ciphertext) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', publicationCredentialsKey, Buffer.from(encrypted.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function publicationAdminPassword(publication) {
  return decryptPublicationPassword(publication?.adminCredentials?.password);
}

async function readPublishedSiteAdminAccount(siteId) {
  try {
    const account = JSON.parse(await fs.readFile(publishedSiteAdminAccountPath(siteId), 'utf8'));
    if (!account?.siteId || !account?.username || !account?.passwordSalt || !account?.passwordHash) throw new Error('Invalid site administrator account.');
    return account;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writePublishedSiteAdminAccount(account) {
  await fs.mkdir(publishedSiteAdminDirectory, { recursive: true });
  const file = publishedSiteAdminAccountPath(account.siteId);
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(account, null, 2), 'utf8');
  await fs.rename(temporaryFile, file);
}

function publishedSiteAdminGeneratedPassword() {
  // 10 base64url characters carry about 60 bits of entropy: short enough to
  // hand to a cafe, but still resistant to online guessing with rate limits.
  return randomBytes(8).toString('base64url').slice(0, 10);
}

function publishedSiteAdminDefaultUsername(site) {
  const hostname = String(site?.hostname || '').toLowerCase();
  const slug = hostname.endsWith(`.${pilotSiteDomain}`) ? hostname.slice(0, -(pilotSiteDomain.length + 1)) : hostname.split('.')[0];
  return publishedSiteAdminUsername(`owner@${slug}`);
}

async function provisionPublishedSiteAdminAccount(site, credentials) {
  if (!credentials || typeof credentials !== 'object') return { provisioned: false, username: '' };
  const existing = await readPublishedSiteAdminAccount(site.siteId);
  if (existing) return { provisioned: false, username: existing.username };
  const username = publishedSiteAdminUsername(credentials.username);
  const password = publishedSiteAdminPassword(credentials.password);
  const passwordSalt = randomBytes(24).toString('base64url');
  const account = {
    version: 1,
    siteId: site.siteId,
    hostname: site.hostname,
    username,
    passwordSalt,
    passwordHash: publishedSiteAdminPasswordHash(password, passwordSalt),
    recoverablePassword: publishedSiteAdminEncryptPassword(password),
    createdAt: new Date().toISOString()
  };
  const file = publishedSiteAdminAccountPath(site.siteId);
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await fs.mkdir(publishedSiteAdminDirectory, { recursive: true });
  await fs.writeFile(temporaryFile, JSON.stringify(account, null, 2), 'utf8');
  try {
    await fs.rename(temporaryFile, file);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    if (error?.code === 'EEXIST') return { provisioned: false, username: (await readPublishedSiteAdminAccount(site.siteId))?.username || '' };
    throw error;
  }
  return { provisioned: true, username };
}

async function publishedSiteAdminCredentialsForOperator(siteId) {
  await publishedSiteById(siteId);
  const account = await readPublishedSiteAdminAccount(siteId);
  if (!account) throw publishInputError('Кабинет кафе ещё не настроен.', 404);
  const password = publishedSiteAdminDecryptPassword(account);
  if (!password) throw publishInputError('Пароль старого кабинета нельзя безопасно восстановить. Нажмите «Создать новый пароль».', 409);
  return { username: account.username, password };
}

async function resetPublishedSiteAdminCredentials(siteId) {
  const site = await publishedSiteById(siteId);
  const account = await readPublishedSiteAdminAccount(siteId);
  if (!account) throw publishInputError('Кабинет кафе ещё не настроен.', 404);
  if (!siteAdminCredentialsKey) throw publishInputError('Хранилище паролей панели владельца не настроено.', 503);
  const password = publishedSiteAdminGeneratedPassword();
  const passwordSalt = randomBytes(24).toString('base64url');
  const nextAccount = {
    ...account,
    username: publishedSiteAdminDefaultUsername(site),
    passwordSalt,
    passwordHash: publishedSiteAdminPasswordHash(password, passwordSalt),
    recoverablePassword: publishedSiteAdminEncryptPassword(password),
    updatedAt: new Date().toISOString()
  };
  await writePublishedSiteAdminAccount(nextAccount);
  return { username: nextAccount.username, password };
}

function publishedSiteSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(slug)) throw publishInputError('Invalid site slug.');
  return slug;
}

async function publishedSiteBySlug(value) {
  const slug = publishedSiteSlug(value);
  if (!pilotSiteDomain) throw publishInputError('The pilot site domain is not configured.', 503);
  const hostname = `${slug}.${pilotSiteDomain}`;
  const registry = await readPublishedSitesRegistry();
  const site = registry.sites.find((entry) => entry.hostname === hostname);
  if (!publishedSiteIsActive(site)) throw publishInputError('The published site was not found.', 404);
  return { slug, site };
}

function publishedSiteAdminCookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 1000 * 60 * 60 * 12 };
}

function publishedSiteAdminSessionToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', clientAdminSessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function publishedSiteAdminSessionFromRequest(request) {
  const token = clientAdminCookies(request)[publishedSiteAdminSessionCookie] || '';
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', clientAdminSessionSecret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload?.scope !== 'published-site-admin' || !/^site_[a-f0-9]{16}$/u.test(String(payload.siteId || '')) || !payload?.csrf || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function publishedSiteAdminLoginKey(request) {
  const ip = String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 160);
  // A failed login for one cafe must not lock a different cafe that happens to
  // use the same office Wi-Fi or mobile network.
  const slug = String(request.body?.slug || '').trim().toLowerCase().slice(0, 80);
  return `${ip}:${slug || 'unknown'}`;
}

function publishedSiteAdminPasswordsMatch(candidate, account) {
  const actual = Buffer.from(publishedSiteAdminPasswordHash(String(candidate || ''), String(account?.passwordSalt || '')));
  const expected = Buffer.from(String(account?.passwordHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publishedSiteAdminRequireSession(request, response, next) {
  const session = publishedSiteAdminSessionFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Требуется вход в кабинет кафе.', code: 'AUTH_REQUIRED' });
  request.publishedSiteAdminSession = session;
  next();
}

function publishedSiteAdminRequireWrite(request, response, next) {
  const session = request.publishedSiteAdminSession;
  if (!session || String(request.headers['x-site-admin-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена. Обновите страницу и повторите действие.', code: 'CSRF_INVALID' });
  next();
}

function publishedStandaloneContent(html) {
  const match = /<script id="template-content" type="application\/json">([\s\S]*?)<\/script>/iu.exec(String(html || ''));
  if (!match) throw publishInputError('The published page does not contain editable template content.', 422);
  try {
    const content = JSON.parse(match[1]);
    if (!content?.menu || !Array.isArray(content.menu.items)) throw new Error('Invalid menu content.');
    return content;
  } catch {
    throw publishInputError('The published page has invalid editable template content.', 422);
  }
}

function replacePublishedStandaloneContent(html, content) {
  const serialized = JSON.stringify(content).replace(/<\//gu, '<\\/');
  const pattern = /<script id="template-content" type="application\/json">[\s\S]*?<\/script>/iu;
  if (!pattern.test(String(html || ''))) throw publishInputError('The published page could not be updated.', 422);
  return String(html || '').replace(pattern, `<script id="template-content" type="application/json">${serialized}</script>`);
}

function publishedSiteAdminMenu(content) {
  const nativeLanguage = String(content?.localization?.activeLanguage || content?.localization?.nativeLanguage || 'en');
  const categoryNames = new Map((content?.menu?.categories || []).map((category) => [String(category?.id || ''), String(category?.label?.[nativeLanguage] || category?.label?.en || category?.id || '')]));
  return (content?.menu?.items || []).map((item) => ({
    id: String(item?.id || ''),
    category: categoryNames.get(String(item?.categoryId || '')) || '',
    name: String(item?.translations?.[nativeLanguage]?.name || item?.translations?.en?.name || item?.id || ''),
    price: String(item?.pricing?.native?.formatted || '')
  })).filter((item) => item.id && item.name);
}

async function servePublishedSite(request, response, hostname) {
  try {
    const registry = await readPublishedSitesRegistry();
    const site = registry.sites.find((entry) => entry.hostname === hostname);
    if (!publishedSiteIsActive(site)) return response.status(404).type('text/plain').send('Not found');
    if (!/^site_[a-f0-9]{16}$/u.test(String(site.siteId || '')) || !/^v[a-z0-9-]{8,80}$/u.test(String(site.activeVersion || ''))) {
      return response.status(404).type('text/plain').send('Not found');
    }
    const artifactPath = path.join(publishedSitesDirectory, site.siteId, 'versions', site.activeVersion, 'index.html');
    const artifact = await fs.readFile(artifactPath);
    response
      .status(200)
      .type('html')
      // The pilot needs quick iterations. CDN caching is deliberately deferred
      // to the Worker/Cache Rules phase, where versioned immutable assets exist.
      .set('Cache-Control', 'no-store')
      .set('Content-Length', String(artifact.length));
    if (request.method === 'HEAD') return response.end();
    response.send(artifact);
  } catch (error) {
    if (error?.code === 'ENOENT') return response.status(404).type('text/plain').send('Not found');
    response.status(500).type('text/plain').send('Demo site is temporarily unavailable');
  }
}

function publishTokensMatch(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return candidateBuffer.length > 0 && candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function publishAuthorizationToken(request) {
  const match = /^Bearer\s+(.+)$/iu.exec(String(request.get('authorization') || ''));
  return match ? match[1].trim() : '';
}

function pilotAllowsPublicRequest(request) {
  const isRead = ['GET', 'HEAD'].includes(request.method);
  const pathname = request.path;
  return (isRead && (
    pathname === '/healthz' ||
    pathname === '/menu' ||
    pathname === '/favicon.ico' ||
    pathname === '/api/public/menu' ||
    pathname.startsWith('/from/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/templates/classic-light/') ||
    pathname.startsWith('/uploads/client-admin/')
  )) || (request.method === 'POST' && pathname === '/api/events');
}

function pilotAllowsClientRequest(request) {
  const isRead = ['GET', 'HEAD'].includes(request.method);
  const pathname = request.path;
  return (isRead && (
    pathname === '/healthz' ||
    pathname === '/admin.html' ||
    pathname === '/admin.css' ||
    pathname === '/admin.js' ||
    pathname === '/ops.html' ||
    pathname === '/ops.css' ||
    pathname === '/ops.js' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/sites/') ||
    pathname.startsWith('/uploads/client-admin/') ||
    pathname.startsWith('/api/qr/')
  )) || pathname.startsWith('/api/admin/') || pathname.startsWith('/api/ops/') || (request.method === 'POST' && pathname === '/api/deploy/published-sites');
}

function pilotAllowsOperatorRequest(request) {
  const isRead = ['GET', 'HEAD'].includes(request.method);
  const pathname = request.path;
  return (isRead && (
    pathname === '/healthz' ||
    pathname === '/ops.html' ||
    pathname === '/ops.css' ||
    pathname === '/ops.js' ||
    pathname === '/favicon.ico'
  )) || pathname.startsWith('/api/ops/');
}

// A market-validation deployment serves both the menu and its client cabinet
// from one Node process. Keep every parser/export route unreachable before a
// static-file lookup or JSON body parsing can handle it.
app.use((request, response, next) => {
  if (!pilotMode) return next();
  const hostname = requestHostname(request);
  // Container and Tunnel probes do not guarantee a loopback Host header. This
  // endpoint returns no tenant data, so allow it independently of hostname.
  if (['GET', 'HEAD'].includes(request.method) && request.path === '/healthz') return next();
  // The main domain is the public sales site. It is intentionally kept outside
  // the customer wildcard namespace, whose hosts are resolved from the demo
  // registry below.
  if (isPilotLandingHostname(hostname) && pilotAllowsLandingRequest(request)) return next();
  if (['GET', 'HEAD'].includes(request.method) && request.path === '/' && pilotPublicHosts.has(hostname)) return response.redirect(302, '/menu');
  if (['GET', 'HEAD'].includes(request.method) && request.path === '/' && pilotClientHosts.has(hostname)) return response.redirect(302, '/ops.html');
  if (['GET', 'HEAD'].includes(request.method) && request.path === '/' && pilotOperatorHosts.has(hostname)) return response.redirect(302, '/ops.html');
  // Exact public and cabinet hostnames always win over the wildcard site
  // namespace. Otherwise `cabinet.menu-on.com` would be treated as an
  // unpublished customer demo as soon as PILOT_SITE_DOMAIN is configured.
  if (pilotPublicHosts.has(hostname) && pilotAllowsPublicRequest(request)) return next();
  if (pilotClientHosts.has(hostname) && pilotAllowsClientRequest(request)) return next();
  if (pilotOperatorHosts.has(hostname) && pilotAllowsOperatorRequest(request)) return next();
  if (isPilotPublishedHostname(hostname)) {
    if (['GET', 'HEAD'].includes(request.method) && (request.path === '/' || request.path === '/index.html')) {
      void servePublishedSite(request, response, hostname);
      return;
    }
    if (['GET', 'HEAD'].includes(request.method) && (
      request.path === '/api/public/menu' ||
      request.path.startsWith('/r/') ||
      request.path.startsWith('/uploads/client-admin/')
    )) return next();
    if (request.method === 'POST' && request.path === '/api/events') return next();
    return response.status(404).type('text/plain').send('Not found');
  }
  response.status(404).type('text/plain').send('Not found');
});

app.use(express.json({ limit: '4mb' }));
app.get(['/', '/index.html'], (request, response, next) => {
  if (!isPilotLandingHostname(requestHostname(request))) return next();
  response.set('Cache-Control', 'no-store').sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});
app.get(['/terms', '/privacy', '/dpa', '/legal'], (request, response, next) => {
  if (!isPilotLandingHostname(requestHostname(request))) return next();
  response.set('Cache-Control', 'no-store').sendFile(path.join(__dirname, 'public', 'landing', 'legal.html'));
});
app.get('/admin.html', (request, response, next) => {
  if (pilotMode) return response.redirect(302, '/ops.html');
  next();
});

function classicLightBackgroundId(value) {
  const id = String(value || '').trim();
  if (!id || id !== path.basename(id) || id.length > 180) return '';
  return classicLightBackgroundMimeTypes.has(path.extname(id).toLowerCase()) ? id : '';
}

function classicLightBackgroundOption(id) {
  const safeId = classicLightBackgroundId(id);
  if (!safeId) return null;
  return {
    id: safeId,
    label: path.basename(safeId, path.extname(safeId)),
    imageUrl: `/backgrounds/classic-light/${encodeURIComponent(safeId)}`
  };
}

async function listClassicLightBackgrounds() {
  try {
    const entries = await fs.readdir(classicLightBackgroundDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => classicLightBackgroundOption(entry.name))
      .filter(Boolean)
      .sort((left, right) => left.label.localeCompare(right.label, 'ru', { sensitivity: 'base' }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function resolveClassicLightBackground(value) {
  const requestedId = classicLightBackgroundId(value);
  if (!requestedId) return null;
  const available = await listClassicLightBackgrounds();
  return available.find((background) => background.id === requestedId) || null;
}

async function classicLightBackgroundDataUrl(value) {
  const background = await resolveClassicLightBackground(value);
  if (!background) return '';
  const file = path.join(classicLightBackgroundDirectory, background.id);
  const bytes = await fs.readFile(file);
  const mime = classicLightBackgroundMimeTypes.get(path.extname(background.id).toLowerCase());
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

app.use('/uploads/client-admin', express.static(clientUploadsDirectory));
app.use('/backgrounds/classic-light', express.static(classicLightBackgroundDirectory, {
  fallthrough: false,
  maxAge: '1h'
}));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(response, filePath) {
    if (['admin.html', 'admin.css', 'admin.js', 'ops.html', 'ops.css', 'ops.js'].includes(path.basename(filePath))) response.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/healthz', (_request, response) => response.status(200).json({ ok: true, mode: pilotMode ? 'pilot' : 'full' }));

function normalizeDemoRequestWebsite(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) throw new Error('Введите корректную ссылку на сайт ресторана.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Введите корректную ссылку на сайт ресторана.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Введите корректную ссылку на сайт ресторана.');
  }
  return url.href;
}

function normalizeDemoRequestEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new Error('Введите корректный рабочий email.');
  return email;
}

function allowDemoRequest(request) {
  const key = String(request.ip || request.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const attempts = (demoRequestAttempts.get(key) || []).filter((time) => now - time < 15 * 60_000);
  if (attempts.length >= 4) return false;
  attempts.push(now);
  demoRequestAttempts.set(key, attempts);
  return true;
}

async function saveDemoRequest(entry) {
  const operation = demoRequestsWriteQueue.then(async () => {
    let store = { version: 1, requests: [] };
    try {
      const parsed = JSON.parse(await fs.readFile(demoRequestsFile, 'utf8'));
      if (Array.isArray(parsed?.requests)) store.requests = parsed.requests;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    store.requests.push(entry);
    await fs.mkdir(path.dirname(demoRequestsFile), { recursive: true });
    const temporaryFile = `${demoRequestsFile}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(temporaryFile, demoRequestsFile);
  });
  demoRequestsWriteQueue = operation.catch(() => {});
  return operation;
}

app.post('/api/demo-request', async (request, response) => {
  if (pilotMode && !isPilotLandingHostname(requestHostname(request))) return response.status(404).json({ error: 'Not found' });
  try {
    // Honeypot responses deliberately look successful: automated form fillers
    // receive no feedback and never reach the protected request store.
    if (String(request.body?.company || '').trim()) return response.status(202).json({ ok: true });
    if (!allowDemoRequest(request)) return response.status(429).json({ error: 'Слишком много попыток. Попробуйте немного позже.' });
    const websiteUrl = normalizeDemoRequestWebsite(request.body?.websiteUrl);
    const email = normalizeDemoRequestEmail(request.body?.email);
    await saveDemoRequest({
      id: `demo_${randomUUID()}`,
      submittedAt: new Date().toISOString(),
      websiteUrl,
      email,
      source: 'sales-landing',
      locale: 'ru',
      status: 'new'
    });
    response.status(201).json({ ok: true });
  } catch (error) {
    response.status(400).json({ error: error?.message || 'Не удалось принять заявку.' });
  }
});

function clientAdminCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function clientAdminSessionToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', clientAdminSessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function clientAdminSessionFromRequest(request) {
  const token = clientAdminCookies(request)[clientAdminSessionCookie] || '';
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', clientAdminSessionSecret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.tenantId || !payload?.csrf || Number(payload.exp) < Date.now()) return null;
    if (payload.siteId && !/^site_[a-f0-9]{16}$/u.test(String(payload.siteId))) return null;
    return payload;
  } catch {
    return null;
  }
}

function clientAdminCookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 1000 * 60 * 60 * 12 };
}

function clientAdminRequireSession(request, response, next) {
  const session = clientAdminSessionFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Требуется вход в админку.', code: 'AUTH_REQUIRED' });
  request.clientAdminSession = session;
  next();
}

function clientAdminRequireWrite(request, response, next) {
  const session = request.clientAdminSession;
  if (!session) return response.status(401).json({ error: 'Требуется вход в админку.', code: 'AUTH_REQUIRED' });
  if (session.role === 'Viewer') return response.status(403).json({ error: 'Роль Viewer может только просматривать данные.', code: 'ROLE_READ_ONLY' });
  if (String(request.headers['x-admin-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена. Обновите страницу и повторите действие.', code: 'CSRF_INVALID' });
  next();
}

function clientAdminLoginKey(request) {
  return String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 160);
}

function clientAdminPasswordsMatch(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function clientAnalyticsRateAllowed(request) {
  const key = `${String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 120)}:${Math.floor(Date.now() / 60_000)}`;
  const hits = (clientAnalyticsRequestRate.get(key) || 0) + 1;
  clientAnalyticsRequestRate.set(key, hits);
  if (clientAnalyticsRequestRate.size > 2_000) {
    const currentMinute = Math.floor(Date.now() / 60_000);
    for (const knownKey of clientAnalyticsRequestRate.keys()) if (!knownKey.endsWith(`:${currentMinute}`)) clientAnalyticsRequestRate.delete(knownKey);
  }
  return hits <= 180;
}

function clientAnalyticsIsOwnerSession(request, workspace) {
  const session = clientAdminSessionFromRequest(request);
  if (!session || session.tenantId !== workspace.tenant?.id) return false;
  return session.sub === workspace.user?.id;
}

app.post('/api/admin/auth/login', async (request, response) => {
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_SESSION_SECRET || !process.env.ADMIN_PASSWORD)) return response.status(503).json({ error: 'В production должны быть заданы ADMIN_SESSION_SECRET и ADMIN_PASSWORD.' });
  const key = clientAdminLoginKey(request);
  const attempt = clientAdminLoginAttempts.get(key);
  if (attempt?.blockedUntil > Date.now()) return response.status(429).json({ error: 'Слишком много попыток входа. Повторите позже.' });
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const requestedSiteSlug = String(request.body?.site || '').trim();
    let siteId = '';
    let workspace;
    let accepted = false;
    if (requestedSiteSlug) {
      const { site } = await publishedSiteBySlug(requestedSiteSlug);
      const account = await readPublishedSiteAdminAccount(site.siteId);
      workspace = await readClientAdminWorkspace(site.siteId, site);
      siteId = site.siteId;
      accepted = Boolean(account && email === account.username && publishedSiteAdminPasswordsMatch(request.body?.password, account));
    } else {
      workspace = await readClientAdminWorkspace();
      const expectedEmail = clientAdminEmail || String(workspace.user.email || '').trim().toLowerCase();
      accepted = email === expectedEmail && clientAdminPasswordsMatch(request.body?.password, clientAdminPassword);
    }
    if (!accepted) {
      const failures = (attempt?.failures || 0) + 1;
      clientAdminLoginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? Date.now() + 15 * 60_000 : 0 });
      return response.status(401).json({ error: 'Неверный email или пароль.' });
    }
    clientAdminLoginAttempts.delete(key);
    const csrf = randomBytes(24).toString('base64url');
    const session = { sub: workspace.user.id, tenantId: workspace.tenant.id, siteId, role: workspace.user.role || 'Owner', csrf, exp: Date.now() + 12 * 60 * 60_000 };
    response.cookie(clientAdminSessionCookie, clientAdminSessionToken(session), clientAdminCookieOptions());
    response.json({ user: workspace.user, tenant: workspace.tenant, csrfToken: csrf, expiresAt: new Date(session.exp).toISOString() });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось выполнить вход.' });
  }
});

app.post('/api/admin/auth/logout', (request, response) => {
  const session = clientAdminSessionFromRequest(request);
  if (session && String(request.headers['x-admin-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена.' });
  response.clearCookie(clientAdminSessionCookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  response.status(204).end();
});

app.get('/api/admin/auth/session', async (request, response) => {
  const session = clientAdminSessionFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Требуется вход в админку.', code: 'AUTH_REQUIRED' });
  try {
    const requestedSiteSlug = clientAdminText(request.query?.site, 64).toLowerCase();
    if (requestedSiteSlug) {
      const { site } = await publishedSiteBySlug(requestedSiteSlug);
      if (session.siteId !== site.siteId) return response.status(401).json({ error: 'Требуется вход в кабинет конкретного кафе.', code: 'AUTH_REQUIRED' });
    } else if (session.siteId) {
      return response.status(401).json({ error: 'Требуется вход в кабинет конкретного кафе.', code: 'AUTH_REQUIRED' });
    }
    const workspace = await readClientAdminWorkspace(session.siteId);
    if (workspace.tenant.id !== session.tenantId || workspace.user.id !== session.sub) return response.status(401).json({ error: 'Сессия не соответствует рабочему пространству.' });
    response.json({ user: workspace.user, tenant: workspace.tenant, csrfToken: session.csrf, expiresAt: new Date(session.exp).toISOString() });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось проверить сессию.' });
  }
});

app.use('/api/admin', (request, response, next) => request.path.startsWith('/auth/') ? next() : clientAdminRequireSession(request, response, next));
app.use('/api/admin', (request, response, next) => ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.path.startsWith('/auth/') ? next() : clientAdminRequireWrite(request, response, next));

function operatorSessionToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', operatorSessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function operatorSessionFromRequest(request) {
  if (!operatorSessionSecret) return null;
  const token = clientAdminCookies(request)[operatorSessionCookie] || '';
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', operatorSessionSecret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload?.scope !== 'platform-operator' || payload?.sub !== operatorEmail || !payload?.csrf || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function operatorCookieOptions() {
  return { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 1000 * 60 * 60 * 8 };
}

function operatorLoginKey(request) {
  return String(request.ip || request.socket?.remoteAddress || 'unknown').slice(0, 160);
}

function operatorPasswordsMatch(candidate) {
  const actual = Buffer.from(String(candidate || ''));
  const expected = Buffer.from(operatorPassword);
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
}

function operatorRequireSession(request, response, next) {
  const session = operatorSessionFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Требуется вход в панель владельца.', code: 'AUTH_REQUIRED' });
  request.operatorSession = session;
  next();
}

function operatorRequireWrite(request, response, next) {
  const session = request.operatorSession;
  if (!session || String(request.headers['x-ops-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена. Обновите страницу и повторите действие.', code: 'CSRF_INVALID' });
  next();
}

function operatorSiteStatus(site) {
  if (!site || site.status === 'archived' || site.status === 'paused') return site?.status || 'unknown';
  if (site?.expiresAt && Date.parse(site.expiresAt) <= Date.now()) return 'expired';
  return site?.status === 'active' && site?.activeVersion ? 'active' : 'unknown';
}

function operatorSiteSlug(site) {
  const hostname = String(site?.hostname || '').toLowerCase();
  if (!pilotSiteDomain || !hostname.endsWith(`.${pilotSiteDomain}`)) return '';
  return hostname.slice(0, -(pilotSiteDomain.length + 1));
}

async function operatorSiteSummary(site) {
  let workspace = null;
  let adminAccount = null;
  try { workspace = await readPublishedClientWorkspaceIfPresent(site.siteId); } catch { /* A deleted or legacy workspace must not hide its registry record. */ }
  try { adminAccount = await readPublishedSiteAdminAccount(site.siteId); } catch { /* The registry remains usable if an individual account file is missing. */ }
  const snapshot = workspace?.published?.snapshot || workspace?.draft || {};
  const requests = Array.isArray(workspace?.commercial?.requests) ? workspace.commercial.requests : [];
  const cabinetHost = [...pilotClientHosts][0] || '';
  const slug = operatorSiteSlug(site);
  return {
    siteId: site.siteId,
    hostname: site.hostname,
    publicUrl: `https://${site.hostname}/`,
    cabinetUrl: cabinetHost && slug ? `https://${cabinetHost}/sites/${slug}` : '',
    status: operatorSiteStatus(site),
    activeVersion: site.activeVersion || '',
    versionsCount: Array.isArray(site.versions) ? site.versions.length : 0,
    createdAt: site.createdAt || '',
    updatedAt: site.updatedAt || '',
    expiresAt: site.expiresAt || null,
    archivedAt: site.archivedAt || null,
    cafeName: clientAdminText(workspace?.tenant?.name || snapshot?.restaurant?.name || site.hostname, 140),
    menuItemsCount: Array.isArray(snapshot?.menuItems) ? snapshot.menuItems.length : 0,
    subscription: clientAdminText(workspace?.subscription?.status || 'trialing', 30),
    countryCode: clientAdminText(workspace?.commercial?.countryCode || site?.commercial?.countryCode || '', 8),
    requestStatus: clientAdminText(requests[0]?.status || '', 30),
    adminUsername: clientAdminText(adminAccount?.username || '', 160),
    adminPasswordAvailable: Boolean(adminAccount?.recoverablePassword && siteAdminCredentialsKey)
  };
}

async function operatorSitesList() {
  const registry = await readPublishedSitesRegistry();
  const sites = [...registry.sites].sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)));
  return Promise.all(sites.map(operatorSiteSummary));
}

async function operatorUpdateSite(siteId, mutator) {
  if (!/^site_[a-f0-9]{16}$/u.test(String(siteId || ''))) throw new Error('Некорректный идентификатор лендинга.');
  const site = await updatePublishedSitesRegistry(async (registry) => {
    const found = registry.sites.find((entry) => entry.siteId === siteId);
    if (!found) throw new Error('Лендинг не найден.');
    await mutator(found);
    found.updatedAt = new Date().toISOString();
    return found;
  });
  return operatorSiteSummary(site);
}

app.post('/api/ops/auth/login', (request, response) => {
  if (!operatorEmail || !operatorPassword || !operatorSessionSecret) return response.status(503).json({ error: 'Панель владельца ещё не настроена.' });
  const key = operatorLoginKey(request);
  const attempt = operatorLoginAttempts.get(key);
  if (attempt?.blockedUntil > Date.now()) return response.status(429).json({ error: 'Слишком много попыток входа. Повторите позже.' });
  const email = String(request.body?.email || '').trim().toLowerCase();
  if (email !== operatorEmail || !operatorPasswordsMatch(request.body?.password)) {
    const failures = (attempt?.failures || 0) + 1;
    operatorLoginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
    return response.status(401).json({ error: 'Неверный email или пароль.' });
  }
  operatorLoginAttempts.delete(key);
  const csrf = randomBytes(24).toString('base64url');
  const session = { scope: 'platform-operator', sub: operatorEmail, csrf, exp: Date.now() + 8 * 60 * 60 * 1000 };
  response.cookie(operatorSessionCookie, operatorSessionToken(session), operatorCookieOptions());
  response.json({ email: operatorEmail, csrfToken: csrf, expiresAt: new Date(session.exp).toISOString() });
});

app.post('/api/ops/auth/logout', (request, response) => {
  const session = operatorSessionFromRequest(request);
  if (session && String(request.headers['x-ops-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена.' });
  response.clearCookie(operatorSessionCookie, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
  response.status(204).end();
});

app.get('/api/ops/auth/session', operatorRequireSession, (request, response) => {
  response.json({ email: request.operatorSession.sub, csrfToken: request.operatorSession.csrf, expiresAt: new Date(request.operatorSession.exp).toISOString() });
});

app.use('/api/ops', (request, response, next) => request.path.startsWith('/auth/') ? next() : operatorRequireSession(request, response, next));
app.use('/api/ops', (request, response, next) => ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.path.startsWith('/auth/') ? next() : operatorRequireWrite(request, response, next));

app.get('/api/ops/sites', async (_request, response) => {
  try {
    const sites = await operatorSitesList();
    response.set('Cache-Control', 'no-store').json({ sites });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить реестр лендингов.' });
  }
});

app.post('/api/ops/sites/:siteId/admin-credentials', async (request, response) => {
  try {
    const credentials = await publishedSiteAdminCredentialsForOperator(request.params.siteId);
    response.set('Cache-Control', 'no-store').json({ credentials });
  } catch (error) {
    response.status(Number(error?.status) || 500).json({ error: error instanceof Error ? error.message : 'Не удалось получить данные входа.' });
  }
});

app.post('/api/ops/sites/:siteId/admin-credentials/reset', async (request, response) => {
  try {
    const credentials = await resetPublishedSiteAdminCredentials(request.params.siteId);
    response.set('Cache-Control', 'no-store').json({ credentials, reset: true });
  } catch (error) {
    response.status(Number(error?.status) || 500).json({ error: error instanceof Error ? error.message : 'Не удалось создать новый пароль.' });
  }
});

app.patch('/api/ops/sites/:siteId', async (request, response) => {
  try {
    const hasExpiry = Object.hasOwn(request.body || {}, 'expiresAt');
    const expiresAt = hasExpiry ? normalizedPublicationExpiry(request.body.expiresAt) : undefined;
    const status = String(request.body?.status || '').trim().toLowerCase();
    if (status && !['active', 'paused'].includes(status)) throw new Error('Для лендинга доступны только статусы active или paused.');
    const site = await operatorUpdateSite(request.params.siteId, async (entry) => {
      if (status === 'active' && entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now() && expiresAt === undefined) throw new Error('Демо истекло: сначала укажите новый срок или очистите срок действия.');
      if (status) entry.status = status;
      if (hasExpiry) entry.expiresAt = expiresAt;
      if (status === 'active') delete entry.archivedAt;
    });
    response.json({ site });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось изменить лендинг.' });
  }
});

app.delete('/api/ops/sites/:siteId', async (request, response) => {
  try {
    const site = await operatorUpdateSite(request.params.siteId, async (entry) => {
      entry.status = 'archived';
      entry.archivedAt = new Date().toISOString();
    });
    response.json({ site, archived: true });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось удалить лендинг.' });
  }
});

app.post('/api/ops/sites/:siteId/restore', async (request, response) => {
  try {
    const site = await operatorUpdateSite(request.params.siteId, async (entry) => {
      if (!entry.activeVersion) throw new Error('У лендинга нет опубликованной версии для восстановления.');
      entry.status = 'active';
      entry.expiresAt = null;
      delete entry.archivedAt;
    });
    response.json({ site });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось восстановить лендинг.' });
  }
});

app.post('/api/ops/sites/:siteId/rebuild-template', async (request, response) => {
  try {
    const siteId = String(request.params.siteId || '');
    const publishedSite = await updateClientAdminWorkspace(async (workspace) => {
      const result = await publishClientAdminWorkspace(siteId, workspace);
      workspace.auditLog.unshift({ id: randomUUID(), at: new Date().toISOString(), actor: 'Menu-on', action: 'Пересобрал опубликованный шаблон', target: 'Classic Light' });
      return result;
    }, siteId);
    response.json({ site: await operatorSiteSummary(publishedSite), rebuilt: true });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось пересобрать опубликованный шаблон.' });
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function installedChromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);
  for (const executablePath of candidates) {
    try {
      await fs.access(executablePath);
      return executablePath;
    } catch {
      // Try the next standard Chrome location.
    }
  }
  return '';
}

function validateSpreadsheetMatrix(value, maximumRows, maximumColumns) {
  if (!Array.isArray(value) || value.length > maximumRows) return null;
  return value.map((row) => {
    if (!Array.isArray(row) || row.length > maximumColumns) return null;
    return row.map((cell) => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
      if (typeof cell === 'boolean') return cell;
      return String(cell).slice(0, 10_000);
    });
  });
}

function throwIfCancelled(job) {
  if (job?.cancelled) throw new Error('Парсинг остановлен пользователем.');
}

function isBrowserClosedError(error) {
  return /target page, context or browser has been closed|browser has been closed/i.test(String(error?.message || error));
}

async function readArrays() {
  try {
    const parsed = JSON.parse(await fs.readFile(arraysFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('Не удалось прочитать сохранённые массивы.');
  }
}

async function updateArrays(mutator) {
  const operation = arraysWriteQueue.then(async () => {
    const arrays = await readArrays();
    const result = await mutator(arrays);
    await fs.mkdir(path.dirname(arraysFile), { recursive: true });
    await fs.writeFile(arraysFile, JSON.stringify(arrays, null, 2), 'utf8');
    return result;
  });
  arraysWriteQueue = operation.catch(() => {});
  return operation;
}

async function readScorings() {
  try {
    const parsed = JSON.parse(await fs.readFile(scoringsFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('Не удалось прочитать сохранённые результаты скоринга.');
  }
}

async function updateScorings(mutator) {
  const operation = scoringsWriteQueue.then(async () => {
    const scorings = await readScorings();
    const result = await mutator(scorings);
    await fs.mkdir(path.dirname(scoringsFile), { recursive: true });
    await fs.writeFile(scoringsFile, JSON.stringify(scorings, null, 2), 'utf8');
    return result;
  });
  scoringsWriteQueue = operation.catch(() => {});
  return operation;
}

async function readCandidates() {
  try {
    const parsed = JSON.parse(await fs.readFile(candidatesFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('Не удалось прочитать сохранённых кандидатов.');
  }
}

async function updateCandidates(mutator) {
  const operation = candidatesWriteQueue.then(async () => {
    const candidates = await readCandidates();
    const result = await mutator(candidates);
    await fs.mkdir(path.dirname(candidatesFile), { recursive: true });
    await fs.writeFile(candidatesFile, JSON.stringify(candidates, null, 2), 'utf8');
    return result;
  });
  candidatesWriteQueue = operation.catch(() => {});
  return operation;
}

async function readProductionAudits() {
  try {
    const parsed = JSON.parse(await fs.readFile(productionAuditsFile, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.audits) ? parsed.audits : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('Не удалось прочитать сохранённые разборы ассетов.');
  }
}

async function updateProductionAudits(mutator) {
  const operation = productionAuditsWriteQueue.then(async () => {
    const audits = await readProductionAudits();
    const result = await mutator(audits);
    await fs.mkdir(path.dirname(productionAuditsFile), { recursive: true });
    await fs.writeFile(productionAuditsFile, JSON.stringify({ version: 1, audits }, null, 2), 'utf8');
    return result;
  });
  productionAuditsWriteQueue = operation.catch(() => {});
  return operation;
}

async function readSendings() {
  try {
    const parsed = JSON.parse(await fs.readFile(sendingsFile, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.sendings) ? parsed.sendings : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('Не удалось прочитать очередь отправки.');
  }
}

async function updateSendings(mutator) {
  const operation = sendingsWriteQueue.then(async () => {
    const sendings = await readSendings();
    const result = await mutator(sendings);
    await fs.mkdir(path.dirname(sendingsFile), { recursive: true });
    await fs.writeFile(sendingsFile, JSON.stringify({ version: 1, sendings }, null, 2), 'utf8');
    return result;
  });
  sendingsWriteQueue = operation.catch(() => {});
  return operation;
}

// Outreach copy is maintained by the operator in one UTF-8 Markdown file.
// Keep parsing deliberately small and strict: only complete Email + Messenger
// sections can be selected for a cafe.
async function readOutreachLocalizations() {
  try {
    const source = await fs.readFile(outreachLocalizationsFile, 'utf8');
    const templates = {};
    for (const section of source.split(/\r?\n---\s*\r?\n/gu)) {
      const heading = /^#\s+(.+?)\s+\(`([a-z]{2})`\)/mu.exec(section);
      if (!heading) continue;
      const email = /##\s+Email\s*\r?\n\s*\*\*Subject:\*\*\s*(.+?)\s*\r?\n\s*```text\s*\r?\n([\s\S]*?)\r?\n```/mu.exec(section);
      const messenger = /##\s+Messenger\s*\r?\n\s*```text\s*\r?\n([\s\S]*?)\r?\n```/mu.exec(section);
      if (!email || !messenger) continue;
      const code = heading[2].toLowerCase();
      templates[code] = {
        code,
        label: heading[1].trim(),
        email: { subject: email[1].trim(), body: email[2].trim() },
        messenger: { body: messenger[1].trim() }
      };
    }
    return templates;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function outreachText(value, replacements = {}) {
  return String(value || '').replace(/\{\{(restaurant_name|landing_url|admin_url)\}\}/gu, (_match, name) => replacements[name] || '—');
}

function outreachOfferForSending(sending = {}, type, templates = {}) {
  const preferredCode = String(sending.nativeLanguage?.code || 'en').toLowerCase();
  const template = templates[preferredCode] || templates.en || Object.values(templates)[0];
  const source = template?.[type];
  if (!source) {
    return {
      available: false,
      type,
      language: { code: preferredCode, label: sending.nativeLanguage?.label || preferredCode.toUpperCase() },
      subject: '',
      body: ''
    };
  }
  const replacements = {
    restaurant_name: String(sending.cafeName || '').trim() || 'Кафе',
    landing_url: String(sending.landingUrl || '').trim() || '—',
    admin_url: String(sending.adminUrl || '').trim() || '—'
  };
  return {
    available: true,
    type,
    language: { code: template.code, label: template.label },
    fallback: template.code !== preferredCode,
    subject: type === 'email' ? outreachText(source.subject, replacements) : '',
    body: outreachText(source.body, replacements)
  };
}

function decorateSendingWithOffers(sending, templates) {
  return {
    ...sending,
    chatLinks: Array.isArray(sending.chatLinks) && sending.chatLinks.length
      ? sending.chatLinks
      : sendingChatLinksFromSocials(sending.socials),
    offers: {
      email: outreachOfferForSending(sending, 'email', templates),
      messenger: outreachOfferForSending(sending, 'messenger', templates)
    }
  };
}

function arraySummary(item) {
  return {
    id: item.id,
    number: item.number,
    name: item.name,
    city: item.city,
    cardCount: item.cardCount,
    createdAt: item.createdAt,
    score: item.score ?? null,
    scoredAt: item.scoredAt ?? null
  };
}

function scoringSummary(item) {
  return {
    id: item.id,
    number: item.number,
    arrayId: item.arrayId,
    arrayNumber: item.arrayNumber,
    name: item.name,
    city: item.city,
    cardCount: item.cardCount,
    scoredAt: item.scoredAt,
    score: item.score,
    priorityCount: item.priorityCount || 0
  };
}

function hasMenuOnSite(row) {
  return row.siteMenuAnalysis?.menuFound === true || row.metrics?.noSiteMenu === 0;
}

function candidateSummary(item) {
  const rows = item.rows || [];
  return {
    id: item.id,
    number: item.number,
    scoringId: item.scoringId,
    arrayId: item.arrayId,
    arrayNumber: item.arrayNumber,
    name: item.name,
    city: item.city,
    candidateCount: rows.length,
    withMenuCount: rows.filter((row) => row.menuOnSite).length,
    withoutMenuCount: rows.filter((row) => !row.menuOnSite).length,
    productionCount: rows.filter((row) => row.productionSentAt).length,
    selectedAt: item.selectedAt,
    updatedAt: item.updatedAt || item.selectedAt
  };
}

async function saveParsingArray({ city, radiusKm, requestedLimit, scanned, center, rows }) {
  return updateArrays((arrays) => {
    const nextNumber = arrays.reduce((maximum, item) => Math.max(maximum, Number(item.number) || 0), 0) + 1;
    const item = {
      id: randomUUID(),
      number: nextNumber,
      name: `Кафе — ${city}`,
      city,
      radiusKm,
      requestedLimit,
      scanned,
      center,
      cardCount: rows.length,
      createdAt: new Date().toISOString(),
      score: null,
      scoredAt: null,
      scoreDetails: null,
      rows
    };
    arrays.push(item);
    return arraySummary(item);
  });
}

function reviewActivityPoints(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 0;
  if (/(сегодня|вчера|минут|час|today|yesterday|minute|hour)/i.test(text)) return 20;
  const days = text.match(/(\d+)\s*(?:дн|day)/i);
  if (days) return Number(days[1]) <= 7 ? 18 : Number(days[1]) <= 31 ? 14 : 8;
  if (/(недел|week)/i.test(text)) return 14;
  if (/(месяц|month)/i.test(text)) return 8;
  return 3;
}

function reviewNotOlderThanWeek(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (/(сегодня|вчера|минут|час|today|yesterday|minute|hour)/i.test(text)) return true;
  const days = text.match(/(\d+)\s*(?:дн|day)/i);
  if (days) return Number(days[1]) <= 7;
  const weeks = text.match(/(\d+)\s*(?:недел|week)/i);
  if (weeks) return Number(weeks[1]) <= 1;
  return /(неделю|неделя|a week|one week)/i.test(text);
}

function calculateCafeScoring(row) {
  const mapsCardCaptured = row.mapsCardCaptured === true;
  const noMapsMenu = mapsCardCaptured ? !row.mapsMenuUrl : null;
  const mapsSocials = row.mapsSocials || {};
  const siteSocials = row.socials || {};
  const hasMapsSocials = Object.keys(mapsSocials).length > 0;
  const hasSiteSocials = !hasMapsSocials && Object.keys(siteSocials).length > 0;
  const hasMoreThan25Reviews = Number(row.reviewCount) > 25;
  const hasFreshReview = reviewNotOlderThanWeek(row.lastReview);
  const noWebsite = !row.website;
  const mapsEmails = normalizeEmailList(row.mapsEmails || []);
  const siteEmails = normalizeEmailList(row.emails || []);
  const hasMapsEmail = Boolean(mapsEmails.length);
  const hasSiteEmail = !hasMapsEmail && Boolean(siteEmails.length);

  const menuAnalysis = row.siteMenuAnalysis || {};
  const siteChecked = menuAnalysis.status === 'complete';
  const noSiteMenu = siteChecked ? menuAnalysis.menuFound === false : null;
  const oneMenuLanguage = siteChecked && menuAnalysis.menuFound === true && menuAnalysis.menuLanguages?.length === 1;
  const noAllergens = siteChecked && menuAnalysis.menuFound === true && menuAnalysis.hasAllergens === false;
  const noEnglishMenu = siteChecked ? menuAnalysis.hasEnglishMenu === false : null;

  const painScore = (noMapsMenu === true ? 5 : 0) + (noSiteMenu === true ? 15 : 0) + (oneMenuLanguage ? 2 : 0) + (noAllergens ? 1 : 0);
  const commercialScore = (hasMapsSocials ? 10 : 0) + (hasSiteSocials ? 5 : 0) + (hasMoreThan25Reviews ? 3 : 0) + (hasFreshReview ? 7 : 0);
  const touristFit = noEnglishMenu === true ? 10 : 0;
  const demoFeasibility = noWebsite ? 20 : 0;
  const contactability = (hasMapsEmail ? 10 : 0) + (hasSiteEmail ? 10 : 0);
  const score = painScore + commercialScore + touristFit + demoFeasibility + contactability;
  const priorityReasons = [
    ...(noWebsite ? ['Нет URL сайта в Google Maps'] : []),
    ...(noSiteMenu === true ? ['Нет меню на сайте'] : []),
    ...(noEnglishMenu === true ? ['Нет меню на английском'] : [])
  ];

  return {
    score,
    priorityReasons,
    metrics: {
      noMapsMenu: noMapsMenu === null ? null : (noMapsMenu ? 5 : 0),
      noSiteMenu: noSiteMenu === null ? null : (noSiteMenu ? 15 : 0),
      oneMenuLanguage: siteChecked && menuAnalysis.menuFound === true ? (oneMenuLanguage ? 2 : 0) : null,
      noAllergens: siteChecked && menuAnalysis.menuFound === true && menuAnalysis.hasAllergens !== null ? (noAllergens ? 1 : 0) : null,
      painScore,
      mapsSocials: hasMapsSocials ? 10 : 0,
      siteSocials: hasMapsSocials ? 0 : (hasSiteSocials ? 5 : 0),
      moreThan25Reviews: hasMoreThan25Reviews ? 3 : 0,
      freshReview: hasFreshReview ? 7 : 0,
      commercialScore,
      noEnglishMenu: noEnglishMenu === null ? null : (noEnglishMenu ? 10 : 0),
      touristFit,
      noWebsite: noWebsite ? 20 : 0,
      demoFeasibility,
      mapsEmail: hasMapsEmail ? 10 : 0,
      siteEmail: hasMapsEmail ? 0 : (hasSiteEmail ? 10 : 0),
      contactability,
      total: score
    }
  };
}

function scoreCafe(row) {
  return calculateCafeScoring(row).score;
}

function scoreArray(item) {
  const cafeScores = item.rows.map((row) => {
    const scoring = calculateCafeScoring(row);
    return { name: row.name, score: scoring.score, metrics: scoring.metrics, priorityReasons: scoring.priorityReasons };
  });
  const score = cafeScores.length
    ? Math.round(cafeScores.reduce((sum, cafe) => sum + cafe.score, 0) / cafeScores.length)
    : null;
  return {
    score,
    scoredAt: new Date().toISOString(),
    scoreDetails: {
      version: 'website-analysis-v2',
      description: 'Скоринг по карточке Google Maps и сайту: меню, языки, аллергены, e-mail и соцсети.',
      cafes: cafeScores
    }
  };
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = finiteNumberOrNull(value);
  return Number.isSafeInteger(number) ? number : null;
}

function createScoredCafe(row) {
  const scoring = calculateCafeScoring(row);
  const mapsEmails = normalizeEmailList(row.mapsEmails || []);
  const siteEmails = normalizeEmailList(row.emails || []);
  const emails = normalizeEmailList([...mapsEmails, ...siteEmails]);
  const mapsPhones = normalizePhoneList(row.mapsPhones || [], `${row.address || ''} ${row.city || ''}`);
  const sitePhones = normalizePhoneList(row.sitePhones || row.phones || [], `${row.address || ''} ${row.city || ''} ${row.website || ''}`);
  const phones = normalizePhoneList([...mapsPhones, ...sitePhones], `${row.address || ''} ${row.city || ''}`);
  return {
    name: row.name || '',
    address: row.address || '',
    mapsUrl: row.mapsUrl || '',
    website: row.website || '',
    rating: finiteNumberOrNull(row.rating),
    reviewCount: integerOrNull(row.reviewCount),
    socials: row.socials || {},
    emails,
    mapsEmails,
    siteEmails,
    phones,
    mapsPhones,
    sitePhones,
    mapsOpeningHours: row.mapsOpeningHours || [],
    mapsSocials: row.mapsSocials || {},
    siteMenuAnalysis: row.siteMenuAnalysis || null,
    lastReview: row.lastReview || '',
    reviewSort: row.reviewSort || '',
    reviewActivity: reviewActivityPoints(row.lastReview),
    score: scoring.score,
    metrics: scoring.metrics,
    priorityReasons: scoring.priorityReasons,
    priority: scoring.priorityReasons.length > 0,
    priorityCount: scoring.priorityReasons.length
  };
}

function createScoringRecord(item, previous, nextNumber) {
  const rows = item.rows.map(createScoredCafe);
  const score = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
    : null;
  return {
    id: previous?.id || randomUUID(),
    number: previous?.number || nextNumber,
    arrayId: item.id,
    arrayNumber: item.number,
    name: item.name,
    city: item.city,
    cardCount: item.cardCount,
    scoredAt: item.scoredAt || new Date().toISOString(),
    score,
    priorityCount: rows.filter((row) => row.priority).length,
    version: 'website-analysis-v2',
    rows
  };
}

function createCandidateRow(row, candidateNumber) {
  return {
    candidateNumber,
    name: row.name || '',
    address: row.address || '',
    mapsUrl: row.mapsUrl || '',
    website: row.website || '',
    rating: finiteNumberOrNull(row.rating),
    reviewCount: integerOrNull(row.reviewCount),
    socials: row.socials || {},
    emails: normalizeEmailList(row.emails || []),
    phones: normalizePhoneList(row.phones || [], `${row.address || ''} ${row.city || ''}`),
    mapsPhones: normalizePhoneList(row.mapsPhones || [], `${row.address || ''} ${row.city || ''}`),
    sitePhones: normalizePhoneList(row.sitePhones || [], `${row.address || ''} ${row.city || ''} ${row.website || ''}`),
    mapsOpeningHours: row.mapsOpeningHours || [],
    lastReview: row.lastReview || '',
    reviewSort: row.reviewSort || '',
    reviewActivity: row.reviewActivity || 0,
    score: Number(row.score) || 0,
    metrics: row.metrics || {},
    priorityReasons: row.priorityReasons || [],
    priority: Boolean(row.priority),
    priorityCount: Number(row.priorityCount) || 0,
    siteMenuAnalysis: row.siteMenuAnalysis || null,
    menuOnSite: hasMenuOnSite(row),
    productionSentAt: null
  };
}

async function createCandidatesFromScoring(scoringId) {
  const scorings = await readScorings();
  const scoring = scorings.find((entry) => entry.id === scoringId);
  if (!scoring) throw new Error('Результат скоринга не найден.');
  const eligibleRows = (scoring.rows || []).filter((row) => Number(row.score) >= 22);

  return updateCandidates((candidates) => {
    const existingIndex = candidates.findIndex((entry) => entry.scoringId === scoring.id);
    const existing = existingIndex >= 0 ? candidates[existingIndex] : null;
    const nextNumber = candidates.reduce((maximum, entry) => Math.max(maximum, Number(entry.number) || 0), 0) + 1;
    const now = new Date().toISOString();
    const item = {
      id: existing?.id || randomUUID(),
      number: existing?.number || nextNumber,
      scoringId: scoring.id,
      arrayId: scoring.arrayId,
      arrayNumber: scoring.arrayNumber,
      name: scoring.name,
      city: scoring.city,
      selectedAt: now,
      updatedAt: now,
      rows: eligibleRows.map((row, index) => createCandidateRow(row, index + 1))
    };
    if (existingIndex >= 0) candidates[existingIndex] = item;
    else candidates.push(item);
    return candidateSummary(item);
  });
}

async function rescoreArray(arrayId) {
  const sourceArrays = await readArrays();
  const source = sourceArrays.find((entry) => entry.id === arrayId);
  if (!source) throw new Error('Массив не найден.');
  const analyzedRows = await mapWithConcurrency(source.rows, 3, async (row) => ({
    ...row,
    siteMenuAnalysis: await analyzeWebsiteMenu(row.website, row.mapsMenuUrl)
  }));
  const item = await updateArrays((arrays) => {
    const array = arrays.find((entry) => entry.id === arrayId);
    if (!array) throw new Error('Массив не найден.');
    array.rows = analyzedRows;
    Object.assign(array, scoreArray(array));
    return array;
  });
  const scoring = await updateScorings((scorings) => {
    const index = scorings.findIndex((entry) => entry.arrayId === item.id);
    const nextNumber = scorings.reduce((maximum, entry) => Math.max(maximum, Number(entry.number) || 0), 0) + 1;
    const record = createScoringRecord(item, index >= 0 ? scorings[index] : null, nextNumber);
    if (index >= 0) scorings[index] = record;
    else scorings.push(record);
    return scoringSummary(record);
  });
  return { array: arraySummary(item), scoring };
}

async function clearArrayScore(arrayId) {
  return updateArrays((arrays) => {
    const item = arrays.find((entry) => entry.id === arrayId);
    if (item) Object.assign(item, { score: null, scoredAt: null, scoreDetails: null });
    return null;
  });
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  const parts = address.split('.').map(Number);
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Недопустимый адрес сайта');
  }
  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error('Локальные адреса не проверяются');
    return url;
  }
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Непубличный адрес сайта');
  }
  return url;
}

async function fetchPublicHtml(value) {
  let url = await assertPublicUrl(value);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'user-agent': 'CafeLeadExporter/1.0 (+local public-site contact lookup)',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location');
      if (!target) throw new Error('Перенаправление без адреса');
      url = await assertPublicUrl(new URL(target, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Сайт вернул HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) throw new Error('Страница не HTML');
    const reader = response.body?.getReader();
    if (!reader) return { url: url.href, html: '' };
    const chunks = [];
    let size = 0;
    while (size < 1_000_000) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel();
    return { url: url.href, html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error('Слишком много перенаправлений');
}

async function fetchPublicDocument(value, maxBytes = 12_000_000) {
  let url = await assertPublicUrl(value);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'user-agent': 'CafeLeadExporter/1.0 (+menu document extraction)',
        accept: 'application/pdf,text/html,application/xhtml+xml,text/plain,*/*'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location');
      if (!target) throw new Error('Перенаправление без адреса');
      url = await assertPublicUrl(new URL(target, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Документ вернул HTTP ${response.status}`);
    const announcedSize = Number(response.headers.get('content-length') || 0);
    if (announcedSize > maxBytes) throw new Error('Документ слишком большой для разбора');
    const reader = response.body?.getReader();
    if (!reader) return { url: url.href, contentType: response.headers.get('content-type') || '', data: Buffer.alloc(0) };
    const chunks = [];
    let size = 0;
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Документ слишком большой для разбора');
      }
      chunks.push(chunk);
    }
    return {
      url: url.href,
      contentType: response.headers.get('content-type') || '',
      data: Buffer.concat(chunks)
    };
  }
  throw new Error('Слишком много перенаправлений');
}

async function retryPublicFetch(operation, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(350 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchPublicHtmlWithRetries(value, attempts = 3) {
  return retryPublicFetch(() => fetchPublicHtml(value), attempts);
}

async function fetchPublicDocumentWithRetries(value, maxBytes = 12_000_000, attempts = 3) {
  return retryPublicFetch(() => fetchPublicDocument(value, maxBytes), attempts);
}

const SOCIAL_NETWORKS = [
  ['instagram', /(^|\.)instagram\.com$/i],
  ['facebook', /(^|\.)facebook\.com$/i],
  ['vk', /(^|\.)vk\.com$/i],
  ['telegram', /(^|\.)(t\.me|telegram\.me)$/i],
  ['tiktok', /(^|\.)tiktok\.com$/i],
  ['youtube', /(^|\.)youtube\.com$/i],
  ['x', /(^|\.)(x\.com|twitter\.com)$/i],
  ['linkedin', /(^|\.)linkedin\.com$/i]
];

const SOCIAL_SHARE_PATHS = {
  instagram: [/^\/$/, /^\/(p|reel|explore)\//i],
  facebook: [/^\/$/, /^\/(sharer|share|dialog|plugins)\b/i],
  vk: [/^\/$/, /^\/share\.php/i],
  telegram: [/^\/(share|iv)\b/i],
  tiktok: [/^\/$/, /^\/(share|embed)\b/i],
  youtube: [/^\/$/, /^\/embed\//i],
  x: [/^\/$/, /^\/(intent|share)\b/i],
  linkedin: [/^\/$/, /^\/(shareArticle|sharing)\b/i]
};

function cleanPublicUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (/^(www\.)?google\.[a-z.]+$/i.test(url.hostname) && url.pathname === '/url') {
      return cleanPublicUrl(url.searchParams.get('q') || url.searchParams.get('url'));
    }
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|yclid$)/i.test(name)) url.searchParams.delete(name);
    }
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function isLikelyBusinessSocial(network, url) {
  if (!url.pathname || url.pathname === '/') return false;
  return !(SOCIAL_SHARE_PATHS[network] || []).some((pattern) => pattern.test(url.pathname));
}

function normalizeEmail(value) {
  let email = value.trim().replace(/^mailto:/i, '').split('?')[0].replace(/[;,.:]+$/, '').toLowerCase();
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return null;
  // Некоторые сайты склеивают номер телефона с адресом в общем текстовом узле: "6126info@…".
  const cleanedLocalPart = localPart.replace(/^\d{2,}(?=(?:info|sales|hello|contact|office|booking|reservations?|admin|mail|support)(?:[._+-]|$))/i, '');
  email = `${cleanedLocalPart}@${domain}`;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

function normalizeEmailList(values) {
  const emails = new Set();
  for (const value of values || []) {
    const email = normalizeEmail(String(value || ''));
    if (email) emails.add(email);
  }
  return [...emails];
}

function callingCodeForContext(context = '') {
  const text = String(context || '').toLowerCase();
  if (/(?:italy|italia|italien|venezia|venice|roma|milan|milano)/i.test(text)) return '39';
  if (/(?:austria|österreich|wien|vienna|вена)/i.test(text)) return '43';
  if (/(?:germany|deutschland|berlin|munich|münchen)/i.test(text)) return '49';
  if (/(?:france|francia|paris|nice|nizza)/i.test(text)) return '33';
  if (/(?:united kingdom|great britain|london|england)/i.test(text)) return '44';
  if (/(?:czech|česko|praha|prague)/i.test(text)) return '420';
  if (/(?:hungary|magyarország|budapest)/i.test(text)) return '36';
  if (/(?:belarus|беларус|минск|minsk)/i.test(text)) return '375';
  return '';
}

function normalizePhoneCandidate(value, context = '') {
  const display = String(value || '').replace(/^tel:/i, '').replace(/\s+/g, ' ').trim();
  if (!display) return null;
  const compact = display.replace(/[^\d+]/g, '');
  let normalized = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  if (!normalized.startsWith('+')) {
    const code = callingCodeForContext(context);
    if (code && /^0?\d{7,14}$/.test(normalized)) normalized = `+${code}${normalized}`;
  }
  return {
    display,
    normalized: /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : ''
  };
}

function extractPhoneCandidates(value, context = '', includeNational = false) {
  const text = String(value || '');
  const matches = [
    ...text.matchAll(/(?:\+|00)\s*\d(?:[\s()./-]*\d){6,14}/g),
    ...(includeNational ? [...text.matchAll(/(?:phone|telefono|tel\.?|telefon|теле[фf]он)[^\d+]{0,24}((?:\+|00)?\s*\d(?:[\s()./-]*\d){6,14})/gi)].map((match) => [match[1]]) : [])
  ];
  const unique = new Map();
  for (const match of matches) {
    const candidate = normalizePhoneCandidate(match[0], context);
    if (candidate?.normalized && !unique.has(candidate.normalized)) unique.set(candidate.normalized, candidate);
  }
  return [...unique.values()];
}

function normalizePhoneList(values, context = '') {
  const unique = new Map();
  for (const value of values || []) {
    const candidate = typeof value === 'object' && value ? normalizePhoneCandidate(value.display || value.normalized || '', context) : normalizePhoneCandidate(value, context);
    if (candidate?.normalized) unique.set(candidate.normalized, candidate);
  }
  return [...unique.values()];
}

function mapsHoursDayLabel(value) {
  const label = compactProductionText(value);
  return /(?:^|[^\p{L}])(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\u043f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a|\u0432\u0442\u043e\u0440\u043d\u0438\u043a|\u0441\u0440\u0435\u0434\u0430|\u0447\u0435\u0442\u0432\u0435\u0440\u0433|\u043f\u044f\u0442\u043d\u0438\u0446\u0430|\u0441\u0443\u0431\u0431\u043e\u0442\u0430|\u0432\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435|\u043f\u043d\.?|\u0432\u0442\.?|\u0441\u0440\.?|\u0447\u0442\.?|\u043f\u0442\.?|\u0441\u0431\.?|\u0432\u0441\.?)(?=$|[^\p{L}])/iu.test(label) ? label : '';
}

function normalizeMapsHoursRows(rows) {
  const unique = new Set();
  for (const row of rows || []) {
    const day = mapsHoursDayLabel(row?.day || row?.label || '');
    const value = compactProductionText(row?.value || row?.hours || '');
    if (!day || !value) continue;
    const key = `${day}: ${value}`;
    unique.add(key);
  }
  return [...unique];
}

function hasPublishedMapsSchedule(value) {
  const entries = Array.isArray(value) ? value : [];
  return entries.some((entry) => {
    const text = typeof entry === 'string' ? entry : `${entry?.day || entry?.label || ''}: ${entry?.value || entry?.hours || ''}`;
    const separator = text.indexOf(':');
    return separator > 0 && Boolean(mapsHoursDayLabel(text.slice(0, separator))) && Boolean(compactProductionText(text.slice(separator + 1)));
  });
}

async function extractMapsWeeklyHours(page) {
  const hoursButton = page.locator('[data-item-id="oh"]').first();
  if (!await hoursButton.count()) return [];

  const readRowsFrom = async (locator) => locator.evaluateAll((elements) => elements.map((element) => {
    const cells = element.querySelectorAll('td, [role="cell"], [role="gridcell"]');
    const day = (cells[0]?.textContent || '').replace(/\s+/g, ' ').trim();
    const value = (cells[1]?.getAttribute('aria-label') || cells[1]?.textContent || '').replace(/\s+/g, ' ').trim();
    return { day, value };
  })).catch(() => []);
  const readRows = async () => {
    const primaryRows = await readRowsFrom(page.locator('table.eK4R0e').first().locator('tr'));
    // Some Maps variants use an ARIA grid instead of the standard timetable
    // table. Only use that fallback when the primary place timetable is absent;
    // reading every table also mixes in special-service hours (for example,
    // breakfast) as if they were the cafe's main opening hours.
    return primaryRows.length ? primaryRows : readRowsFrom(page.locator('[role="dialog"] [role="row"]'));
  };

  // Maps ships two different hour-panel implementations. A fresh card can
  // ignore the first keyboard activation, while pointer clicks often leave us
  // with only the volatile "open now" string. Retry the panel opening once,
  // then keep only day-labelled timetable rows.
  let rows = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await hoursButton.focus().catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(350 + attempt * 300).catch(() => {});
    await page.locator('table.eK4R0e tr, [role="dialog"] [role="row"]').first()
      .waitFor({ state: 'attached', timeout: 2_500 }).catch(() => {});
    rows = await readRows();
    if (normalizeMapsHoursRows(rows).length) break;
  }
  return normalizeMapsHoursRows(rows);
}

async function extractMapsCardSignals(page) {
  // Google Maps may append contact buttons after a large amount of
  // accessibility/UI markup. A place without a published number remains valid.
  // Open the timetable before waiting for an optional phone control. On some
  // cards the latter appears late, although the weekly hours are already
  // available. This keeps working hours independent from phone rendering.
  await page.locator('[data-item-id="oh"]').first().waitFor({ state: 'attached', timeout: 3_000 }).catch(() => {});
  const weeklyHours = await extractMapsWeeklyHours(page);
  await page.locator('[data-item-id^="phone:"]').first().waitFor({ state: 'attached', timeout: 3_000 }).catch(() => {});
  const anchors = await page.locator('a[href]').evaluateAll((elements) => elements.map((element) => ({
    href: element.getAttribute('href') || '',
    text: (element.textContent || '').trim(),
    ariaLabel: element.getAttribute('aria-label') || '',
    itemId: element.getAttribute('data-item-id') || ''
  })));
  const dataFields = await page.locator('[data-item-id]').evaluateAll((elements) => {
    const fields = elements.map((element) => ({
      itemId: element.getAttribute('data-item-id') || '',
      text: (element.textContent || '').trim(),
      ariaLabel: element.getAttribute('aria-label') || '',
      href: element.getAttribute('href') || ''
    }));
    // Keep the usual bounded sample, plus contact/hours rows regardless of
    // their position in the DOM. Maps renders `phone:tel:…` late on some cards.
    const essential = fields.filter((field) => /(?:phone|telephone|tel:|hours?|opening-hours?|^oh:)/i.test(`${field.itemId} ${field.ariaLabel}`));
    const seen = new Set();
    return [...essential, ...fields.slice(0, 140)].filter((field) => {
      const key = `${field.itemId}\u0000${field.text}\u0000${field.ariaLabel}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const socials = {};
  const mailtoEmails = new Set();
  const mapsPhones = new Map();
  const mapsOpeningHours = [];
  let menuUrl = '';
  for (const anchor of anchors) {
    const descriptor = `${anchor.href} ${anchor.text} ${anchor.ariaLabel} ${anchor.itemId}`;
    if (!menuUrl && /(menu|меню)/i.test(descriptor)) {
      menuUrl = cleanPublicUrl(anchor.href) || anchor.href;
    }
    if (/^mailto:/i.test(anchor.href)) {
      const email = normalizeEmail(anchor.href);
      if (email) mailtoEmails.add(email);
      continue;
    }
    let resolvedHref;
    try { resolvedHref = new URL(anchor.href, page.url()).href; } catch { continue; }
    const cleaned = cleanPublicUrl(resolvedHref);
    if (!cleaned) continue;
    let link;
    try { link = new URL(cleaned); } catch { continue; }
    for (const [network, hostPattern] of SOCIAL_NETWORKS) {
      if (!socials[network] && hostPattern.test(link.hostname) && isLikelyBusinessSocial(network, link)) {
        socials[network] = link.href;
      }
    }
  }
  const textEmails = new Set();
  const cardText = await page.locator('body').innerText().catch(() => '');
  for (const match of cardText.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = normalizeEmail(match[0]);
    if (email) textEmails.add(email);
  }
  for (const field of dataFields) {
    const descriptor = `${field.itemId} ${field.ariaLabel} ${field.text} ${field.href}`;
    if (/(?:phone|telephone|tel:)/i.test(field.itemId) || /(?:phone|телефон|telefono)/i.test(field.ariaLabel)) {
      for (const phone of extractPhoneCandidates(descriptor, cardText, true)) mapsPhones.set(phone.normalized, phone);
    }
    if (/(?:^|:)(?:oh|hours?|opening-hours?)(?:$|:)/i.test(field.itemId) || /(?:открыт|закроется|hours?|orari)/i.test(descriptor)) {
      const value = compactProductionText(field.text || field.ariaLabel);
      if (value && !mapsOpeningHours.includes(value)) mapsOpeningHours.push(value);
    }
  }
  for (const phone of extractPhoneCandidates(cardText, cardText, false)) mapsPhones.set(phone.normalized, phone);
  return {
    mapsCardCaptured: true,
    mapsMenuUrl: menuUrl,
    mapsSocials: socials,
    mapsEmails: [...(mailtoEmails.size ? mailtoEmails : textEmails)].slice(0, 3),
    mapsPhones: [...mapsPhones.values()].slice(0, 3),
    // A day-labelled row is a stable timetable. The old cards only supplied a
    // volatile "open now / closes at" string, which must never be published as
    // opening hours on the generated landing page.
    mapsOpeningHours: weeklyHours.length ? weeklyHours : mapsOpeningHours.slice(0, 4)
  };
}

async function extractSiteContacts(website) {
  if (!website) return { emails: [], socials: {}, phones: [] };
  try {
    const { html } = await fetchPublicHtmlWithRetries(website);
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const mailtoEmails = new Set();
    const textEmails = new Set();
    const phones = new Map();
    const socials = {};
    $('body *').contents().each((_, node) => {
      if (node.type !== 'text') return;
      for (const match of (node.data || '').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
        const email = normalizeEmail(match[0]);
        if (email) textEmails.add(email);
      }
      for (const phone of extractPhoneCandidates(node.data || '', website, true)) phones.set(phone.normalized, phone);
    });
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')?.trim();
      if (!href) return;
      if (/^mailto:/i.test(href)) {
        const email = normalizeEmail(href);
        if (email) mailtoEmails.add(email);
        return;
      }
      if (/^tel:/i.test(href)) {
        const phone = normalizePhoneCandidate(href, website);
        if (phone?.normalized) phones.set(phone.normalized, phone);
        return;
      }
      let resolvedHref;
      try { resolvedHref = new URL(href, website).href; } catch { return; }
      const cleaned = cleanPublicUrl(resolvedHref);
      if (!cleaned) return;
      let link;
      try { link = new URL(cleaned); } catch { return; }
      for (const [network, hostPattern] of SOCIAL_NETWORKS) {
        if (!socials[network] && hostPattern.test(link.hostname) && isLikelyBusinessSocial(network, link)) {
          socials[network] = link.href;
        }
      }
    });
    // Mailto — самый надёжный источник: если он есть, не добавляем склеенный текст страницы.
    const emails = normalizeEmailList([...(mailtoEmails.size ? mailtoEmails : textEmails)]).slice(0, 3);
    for (const phone of extractPhoneCandidates($('body').text(), website, true)) phones.set(phone.normalized, phone);
    return { emails, socials, phones: [...phones.values()].slice(0, 3) };
  } catch {
    return { emails: [], socials: {}, phones: [] };
  }
}

const MENU_LINK_PATTERN = /(menu|menus|men[ùuü]|carte|cartes|carta|carte\s+du|speisekarte|jídelní|meniu|étlap|listino|меню)/i;
const MENU_DOCUMENT_PATTERN = /\.(?:pdf|docx?|odt|rtf|txt)(?:$|[?#])/i;
// Menus are often published as an image inside a button/gallery rather than a
// dedicated HTML or PDF document.  Keep this separate from the link pattern so
// the OCR pass only touches files that have real menu evidence around them.
const MENU_IMAGE_PATTERN = /(menu|menus|men[ùuü]|carte|cartes|carta|speisekarte|speisen|getr[aä]nke|drinks?|food|dessert|breakfast|fr[uü]hst[uü]ck|brunch|meniu|étlap|listino|меню)/i;
const ALLERGEN_PATTERN = /(allerg|alerg|аллерг|gluten|lactose|lakt[oó]z|lactosa|sulfit|szulfit|crustacean|mollusc|sesame|mustard|celery|soya|soy)/i;

function normalizeLanguage(value) {
  const language = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(language) ? language : '';
}

function languageSignals($, pageUrl) {
  const languages = new Set();
  const pageLanguage = normalizeLanguage($('html').attr('lang'));
  if (pageLanguage) languages.add(pageLanguage);
  $('link[hreflang], a[hreflang]').each((_, element) => {
    const language = normalizeLanguage($(element).attr('hreflang'));
    if (language) languages.add(language);
  });
  $('a[href]').each((_, element) => {
    const text = `${$(element).text()} ${$(element).attr('aria-label') || ''}`.toLowerCase();
    const href = $(element).attr('href') || '';
    if (/(^|\W)(english|англий|anglais|ingl[eé]s|inglese)(\W|$)/i.test(text) || /(?:[/?&_-]|^)en(?:[/?&_-]|$)/i.test(href)) languages.add('en');
  });
  if (/(?:[/?&_-]|^)en(?:[/?&_-]|$)/i.test(pageUrl)) languages.add('en');
  return languages;
}

function languageSignalsFromText(value, pageUrl = '') {
  const text = String(value || '');
  const languages = new Set();
  if (/\b(?:english|inglese|anglais|englisch|английск|whipped\s+cream|melted\s+chocolate|ice\s+cream)\b/i.test(text)) languages.add('en');
  if (/\b(?:italiano|italiana|italian|italienisch|panna\s+montata|cioccolato|decorazione)\b/i.test(text)) languages.add('it');
  if (/\b(?:français|francese|french|französisch|chantilly|crème|décoration)\b/i.test(text)) languages.add('fr');
  if (/\b(?:deutsch|tedesco|german|allemand|schlagsahne|geschmolzene|schokolade)\b/i.test(text)) languages.add('de');
  if (/(?:[/?&_-]|^)en(?:[/?&_-]|$)/i.test(pageUrl)) languages.add('en');
  return languages;
}

function isSameSiteUrl(value, siteUrl) {
  try {
    const candidate = new URL(value);
    const site = new URL(siteUrl);
    const candidateHost = candidate.hostname.replace(/^www\./i, '');
    const siteHost = site.hostname.replace(/^www\./i, '');
    return candidate.protocol === site.protocol && candidateHost === siteHost;
  } catch {
    return false;
  }
}

function isPdfDocument(url, contentType = '', data = Buffer.alloc(0)) {
  return /application\/pdf/i.test(contentType) || /\.pdf(?:$|[?#])/i.test(url) || data.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isVenueSpecificMenuPage(value, pageUrl) {
  try {
    const candidate = new URL(value);
    const current = new URL(pageUrl);
    if (!isSameSiteUrl(candidate.href, current.href)) return false;
    const currentParts = current.pathname.split('/').filter(Boolean);
    const candidateParts = candidate.pathname.split('/').filter(Boolean);
    const currentVenue = currentParts.at(-1)?.toLowerCase();
    if (!currentVenue || currentVenue.length < 3 || !candidateParts.map((part) => part.toLowerCase()).includes(currentVenue)) return false;
    // Some hostel / multi-venue sites publish a location's actual food menu
    // under a sibling "bar" or "restaurant" page.  Following only generic
    // /menu links skipped those verified, same-venue pages and their menu JPGs.
    return /\/(?:bar|restaurant|ristorante|cafe|caf[eé]|food|dining)\//i.test(candidate.pathname);
  } catch {
    return false;
  }
}

function menuUrlsFromDocument($, pageUrl, mapsMenuUrl = '') {
  const urls = new Set();
  if (mapsMenuUrl) {
    const cleaned = cleanPublicUrl(mapsMenuUrl);
    if (cleaned) urls.add(cleaned);
  }
  const sources = [
    ['a[href]', 'href'],
    ['iframe[src]', 'src'],
    ['embed[src]', 'src'],
    ['object[data]', 'data'],
    ['[data-url]', 'data-url'],
    ['[data-href]', 'data-href']
  ];
  for (const [selector, attribute] of sources) $(selector).each((_, element) => {
    const href = $(element).attr(attribute)?.trim();
    if (!href) return;
    // Do not inspect the full parent text here. A navigation parent can contain
    // one "menu" link and several unrelated ones; that previously caused
    // catalogues, events and booking pages to be parsed as menu documents.
    // Do not use a generic navigation class (for example `menu-item`) as
    // evidence of a café menu: WordPress adds it to every navigation link.
    // That was causing pages such as “About us” and “Opening hours” to be
    // accepted as menu sources and sometimes turned into false dishes.
    const descriptor = `${href} ${$(element).text()} ${$(element).attr('aria-label') || ''} ${$(element).attr('title') || ''} ${$(element).attr('data-item-id') || ''}`;
    try {
      const resolved = cleanPublicUrl(new URL(href, pageUrl).href);
      if (!resolved) return;
      const looksLikeMenu = MENU_LINK_PATTERN.test(descriptor);
      const isDocument = MENU_DOCUMENT_PATTERN.test(resolved);
      const isSameVenueFoodPage = isVenueSpecificMenuPage(resolved, pageUrl);
      if (looksLikeMenu || (isDocument && isSameSiteUrl(resolved, pageUrl)) || isSameVenueFoodPage) urls.add(resolved);
    } catch {
      // Невалидная ссылка не может быть страницей меню.
    }
  });
  // Keep the complete, verified menu-source set. The extraction queue below
  // is deliberately capped, but applying the cap here made later passes blind
  // to valid linked PDFs and nested menu pages.
  return [...urls].filter(Boolean).slice(0, 24);
}

function menuImageUrlsFromDocument($, pageUrl) {
  const urls = new Set();
  const add = (rawUrl, descriptor = '') => {
    if (!rawUrl || !MENU_IMAGE_PATTERN.test(descriptor)) return;
    try {
      const candidate = new URL(rawUrl, pageUrl);
      // Next.js and similar optimizers often turn a PNG/JPG menu into a WebP
      // response. Tesseract's native decoder does not reliably accept WebP on
      // Windows, while the original asset is explicitly disclosed in `url`.
      const optimizedSource = /\/_next\/image$/i.test(candidate.pathname)
        ? candidate.searchParams.get('url')
        : '';
      const url = cleanPublicUrl(optimizedSource
        ? new URL(optimizedSource, `${candidate.protocol}//${candidate.host}`).href
        : candidate.href);
      if (url) urls.add(url);
    } catch {
      // A malformed image address cannot be a usable menu source.
    }
  };
  $('img, source, [data-src], [data-image], [data-background-image]').each((_, element) => {
    const node = $(element);
    const rawUrl = node.attr('src')
      || node.attr('data-src')
      || node.attr('data-image')
      || node.attr('data-background-image')
      || String(node.attr('srcset') || '').split(',')[0].trim().split(/\s+/)[0];
    const descriptor = [
      rawUrl,
      node.attr('alt'),
      node.attr('aria-label'),
      node.attr('title'),
      node.attr('class'),
      node.attr('id'),
      node.parent().attr('aria-label'),
      node.parent().attr('title'),
      node.parent().attr('class')
    ].filter(Boolean).join(' ');
    add(rawUrl, descriptor);
  });
  // WordPress galleries frequently link the original menu sheet from an <a>
  // while the preview image itself is lazy-loaded later.  Inspecting only img
  // tags missed those official Menu-1.jpg / Menu-2.jpg assets.
  $('a[href]').each((_, element) => {
    const node = $(element);
    const rawUrl = node.attr('href');
    const descriptor = [
      rawUrl,
      node.text(),
      node.attr('aria-label'),
      node.attr('title'),
      node.attr('class'),
      node.find('img').attr('alt'),
      node.find('img').attr('src')
    ].filter(Boolean).join(' ');
    add(rawUrl, descriptor);
  });
  // Prefer explicit menu sheets before broad brunch/event galleries.  A page
  // can contain dozens of photographs; preserving DOM order meant the OCR
  // budget was exhausted before it reached files named Menu-1 / Menu-2.
  const priority = (value) => {
    const source = String(value || '').toLowerCase();
    if (/(?:^|[-_/])menu(?:[-_/.]|$)/.test(source)) return 0;
    if (/menu|carta|carte|speisekarte|listino/.test(source)) return 1;
    if (/food|drink|beverage|brunch|breakfast/.test(source)) return 2;
    return 3;
  };
  return [...urls].sort((left, right) => priority(left) - priority(right)).slice(0, 12);
}

function likelyMenuPaths(pageUrl) {
  try {
    const root = new URL(pageUrl);
    const paths = [
      '/menu/', '/menu', '/menus/', '/food-menu/', '/drinks-menu/',
      '/speisekarte/', '/carta/', '/carte/', '/meniu/', '/listino/',
      '/%D0%BC%D0%B5%D0%BD%D1%8E/', '/%D0%9C%D0%95%D0%9D%D0%AE/'
    ];
    return paths.map((pathname) => cleanPublicUrl(new URL(pathname, root).href)).filter(Boolean);
  } catch {
    return [];
  }
}

function hasInlineMenu($) {
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const hasMenuWord = MENU_LINK_PATTERN.test(text);
  const hasPrices = /(?:\d+(?:[.,]\d{1,2})?\s*(?:€|\$|£|₽|rsd|huf|czk|ft|lei|kr)|(?:€|\$|£|₽)\s*\d+)/i.test(text);
  return hasMenuWord && hasPrices;
}

function menuReadableText($) {
  const blocks = [];
  const seen = new Set();
  $('h1, h2, h3, h4, h5, h6, p, li, dt, dd, td, th, figcaption').each((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    blocks.push(text);
  });
  return (blocks.length ? blocks.join('\n') : $('body').text()).replace(/\s*\n\s*/g, '\n').trim();
}

function extractStructuredHtmlMenuItems($, sourceUrl) {
  const roots = $('.single__item, [data-menu-item], [itemtype*="MenuItem"], .menu-item-card, .product-card, .product-item').toArray();
  // Headings such as "Address" and "Opening hours" are not menu products.
  // Only trust pages that expose an explicit product/card wrapper here; the
  // ordinary text-and-price extractor below still handles simple menu pages.
  const candidates = roots;
  if (!candidates.length) return [];
  const items = [];
  const seen = new Set();
  for (const element of candidates) {
    const $element = $(element);
    const heading = $element.is('h3, h4') ? $element : $element.find('h1, h2, h3, h4, [itemprop="name"], .title, [class*="title"]').first();
    if (!heading.length) continue;
    const clone = heading.clone();
    clone.find('span, small, em, strong, b').remove();
    const name = cleanExtractedMenuName(clone.text());
    if (name.length < 3 || name.length > 90 || !/\p{L}/u.test(name) || /^(?:menu|men[uù]|chi siamo|contatti|privacy|cookie|press)$/i.test(name)) continue;
    const text = compactProductionText($element.text());
    const priceMatch = menuPriceMatches(text)[0];
    const descriptionNode = $element.find('h1 span, h2 span, h3 span, h4 span, p, [class*="description"], [class*="subtitle"]').first();
    const description = cleanExtractedMenuDescription(descriptionNode.text());
    const key = `${name.toLowerCase()}-${priceMatch?.[1] || 'no-price'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sectionText = compactProductionText($element.closest('section, .section__content, article').find('h1, h2, h3').first().text());
    items.push({
      id: `html-menu-${items.length + 1}`,
      name,
      description,
      price: priceMatch ? formatExtractedMenuPrice(priceMatch[0], priceMatch[1]) : '',
      productType: menuProductTypeFromSource(sectionText) || menuProductType(`${sectionText} ${name}`),
      sourceUrl,
      sourceFormat: 'html-structured'
    });
    if (items.length >= 120) break;
  }
  return items;
}

function extractMenuItemsFromDocument(document) {
  if (Array.isArray(document?.items) && document.items.length) return document.items;
  return extractMenuItemsFromText(document?.text, document?.url, document?.format);
}

function menuDocumentSignals(html, url, visibleText = '') {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  // For a client-rendered menu, the browser's visible text retains the visual
  // line breaks between an item and its price. Cheerio's HTML text may flatten
  // a DIV-only app into one unreadable line, so prefer the rendered evidence.
  const text = String(visibleText || '').trim() || menuReadableText($);
  return {
    url,
    format: 'html',
    text,
    items: extractStructuredHtmlMenuItems($, url),
    textAvailable: text.length >= 80,
    languages: [...new Set([...languageSignals($, url), ...languageSignalsFromText(text, url)])],
    hasAllergens: ALLERGEN_PATTERN.test(text)
  };
}

function usablePdfText(value) {
  // Keep PDF line boundaries.  They are the only reliable structure in many
  // text-layer menus: the title, description and price can be three separate
  // lines.  Collapsing every whitespace character here made a real PDF look
  // readable while leaving the item extractor with one 9,000-character line.
  return String(value || '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasMultiColumnOcrSignal(text) {
  return String(text || '').split(/\r?\n/).some((line) => {
    const words = line.match(/\p{L}+/gu) || [];
    const upperWords = words.filter((word) => word.length > 1 && word === word.toUpperCase());
    // Two menu column headings often land on one OCR line. A regular dish
    // title rarely consists of four or more consecutive upper-case words.
    return words.length >= 4 && upperWords.length >= 4 && upperWords.length / words.length >= 0.8;
  });
}

async function ocrPdfPageColumns(tsv, imageBuffer) {
  if (!tsv) return [];
  let image;
  try {
    image = await loadImage(imageBuffer);
  } catch {
    return [];
  }
  if (!image?.width || image.width < 360) return [];
  const words = String(tsv).trim().split(/\r?\n/).slice(1)
    .map((line) => line.split('\t'))
    .filter((parts) => parts[0] === '5' && parts[11])
    .map((parts) => ({
      text: parts[11], x: Number(parts[6]), y: Number(parts[7]), width: Number(parts[8]), height: Number(parts[9])
    }))
    .filter((word) => word.text && Number.isFinite(word.x) && Number.isFinite(word.y));
  if (!words.length) return [];
  // Rebuild reading order from Tesseract's word coordinates. Unlike a second
  // cropped OCR pass this never cuts the first/last letter of a menu title.
  return [
    words.filter((word) => word.x + word.width / 2 < image.width / 2),
    words.filter((word) => word.x + word.width / 2 >= image.width / 2)
  ].map((column) => {
    column.sort((left, right) => left.y - right.y || left.x - right.x);
    const lines = [];
    for (const word of column) {
      const tolerance = Math.max(5, Math.min(word.height || 5, 14) * 0.6);
      let line = lines.findLast((candidate) => Math.abs(candidate.y - word.y) <= tolerance);
      if (!line) {
        line = { y: word.y, words: [] };
        lines.push(line);
      }
      line.words.push(word);
    }
    return lines.sort((left, right) => left.y - right.y)
      .map((line) => line.words.sort((left, right) => left.x - right.x).map((word) => word.text).join(' '))
      .join('\n');
  }).filter(Boolean);
}

async function extractPdfTextWithOcr(buffer) {
  let parser;
  let pages = [];
  try {
    parser = new PDFParse({ data: buffer });
    const screenshots = await parser.getScreenshot({
      first: 14,
      // Menu PDFs are frequently uploaded as photographic scans. The larger
      // render gives the OCR enough detail to distinguish titles and prices.
      scale: 2,
      imageBuffer: true,
      imageDataUrl: false
    });
    pages = screenshots.pages || [];
  } catch {
    // A damaged or unsupported PDF must not interrupt parsing of the café or
    // bring down the whole local API. The ordinary text extraction is tried
    // before this fallback, so returning an empty OCR result is safe here.
    return '';
  } finally {
    await parser?.destroy().catch(() => {});
  }
  if (!pages.length) return '';
  let worker;
  try {
    worker = await createWorker('eng', undefined, {
      logger: () => {},
      // tesseract.js throws from its worker event handler if this is omitted.
      // In particular, an unsupported image inside one PDF used to terminate
      // Node and make every browser request fail with "Failed to fetch".
      errorHandler: () => {}
    });
    const fragments = [];
    for (const page of pages) {
      try {
        const result = await worker.recognize(page.data, {}, { text: true, tsv: true });
        const text = String(result?.data?.text || '').trim();
        if (!text) continue;
        // For a detected two-column layout, rebuild columns from OCR geometry
        // before the full page. That preserves title-price pairings without
        // clipping characters at the column edge.
        if (hasMultiColumnOcrSignal(text)) {
          const columns = await ocrPdfPageColumns(result?.data?.tsv, page.data);
          if (columns.length) {
            fragments.push(...columns);
            continue;
          }
        }
        fragments.push(text);
      } catch {
        // Keep the readable pages when one rendered page cannot be decoded.
      }
    }
    return fragments.join('\n');
  } catch {
    return '';
  } finally {
    await worker?.terminate().catch(() => {});
  }
}

async function extractPdfMenuText(data, cacheKey = '') {
  if (cacheKey && pdfMenuTextCache.has(cacheKey)) return pdfMenuTextCache.get(cacheKey);
  const operation = (async () => {
    const parser = new PDFParse({ data });
    let extracted = '';
    try {
      const result = await parser.getText({ first: 20 });
      extracted = usablePdfText(result.text);
    } finally {
      await parser.destroy().catch(() => {});
    }
    return extracted.length >= 80 ? extracted : extractPdfTextWithOcr(data);
  })();
  if (cacheKey) pdfMenuTextCache.set(cacheKey, operation);
  try {
    return await operation;
  } catch (error) {
    if (cacheKey) pdfMenuTextCache.delete(cacheKey);
    throw error;
  }
}

async function extractMenuImageTexts(urls) {
  // A real menu is often published as a five-to-eight page image gallery.
  // Do not stop at the first four sheets and silently lose the remaining menu.
  const selected = [...new Set((urls || []).filter(Boolean))].slice(0, 8);
  if (!selected.length) return [];
  let worker;
  try {
    worker = await createWorker('eng', undefined, {
      logger: () => {},
      // See the PDF OCR fallback above: worker errors are normal for some
      // externally hosted image formats and must stay local to that image.
      errorHandler: () => {}
    });
    const documents = [];
    for (const url of selected) {
      try {
        const image = await fetchPublicDocumentWithRetries(url, 8_000_000, 2);
        const contentType = String(image.contentType || '').toLowerCase();
        // `tesseract.js` can terminate Node when handed WebP directly. A menu
        // published only as WebP remains a valid source, but is skipped here
        // rather than taking down the entire audit; the rendered-page fallback
        // below can still inspect its surrounding HTML.
        if (!/^image\//i.test(contentType) || /webp/i.test(contentType) || image.data.length < 1_000) continue;
        const result = await worker.recognize(image.data);
        const text = String(result?.data?.text || '').trim();
        if (!text) continue;
        documents.push({
          url: image.url,
          format: 'image-ocr',
          text,
          textAvailable: text.replace(/\s+/g, ' ').trim().length >= 18,
          languages: [...languageSignalsFromText(text, image.url)],
          hasAllergens: ALLERGEN_PATTERN.test(text)
        });
      } catch {
        // One bad menu image must not abort the remaining explicit menu pages.
      }
    }
    return documents;
  } catch {
    return [];
  } finally {
    await worker?.terminate().catch(() => {});
  }
}

async function resolveMenuDownloadWithBrowser(url) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await page.goto(url, { waitUntil: 'commit', timeout: 20_000 }).catch(() => {});
    const download = await downloadPromise;
    return download ? cleanPublicUrl(download.url()) : '';
  } catch {
    return '';
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function fetchRenderedMenuHtml(url, { mobile = false } = {}) {
  let browser;
  try {
    await assertPublicUrl(url);
    browser = await chromium.launch({ headless: true });
    // Some QR-menu providers intentionally expose the menu only in the phone
    // layout. The fallback therefore makes a real mobile pass as well as the
    // normal desktop pass instead of assuming the initial empty shell is data.
    const page = await browser.newPage(mobile
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        }
      : { userAgent: 'CafeLeadExporter/1.0 (+rendered menu extraction)' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    // Give client-side restaurant menus time to hydrate and load their menu
    // records. QR menus backed by Firestore commonly need several seconds.
    await page.waitForTimeout(mobile ? 5_000 : 1_800);
    const html = await page.content();
    const text = await page.locator('body').innerText().catch(() => '');
    return { url: page.url(), html, text };
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function loadWebsiteMenuDocumentsOnce(homepage, mapsMenuUrl = '', knownMenuUrls = []) {
  const root = cheerio.load(homepage.html);
  const inlineMenu = hasInlineMenu(root);
  const rootUrl = cleanPublicUrl(homepage.url);
  // A previous site analysis may already have confirmed an external QR/menu
  // widget. It is just as important as a link found in this HTML response:
  // some home pages expose it only after JavaScript or an expired cookie banner.
  const persistedMenuUrls = (Array.isArray(knownMenuUrls) ? knownMenuUrls : [])
    .map((value) => cleanPublicUrl(value))
    .filter(Boolean);
  const linkedMenuUrls = [...new Set([
    ...menuUrlsFromDocument(root, homepage.url, mapsMenuUrl),
    ...persistedMenuUrls
  ])];
  // Keep image-menu candidates discovered both on the homepage and in every
  // linked menu page. Many cafés put the actual JPEG/PNG sheets only on /menu.
  const menuImageUrls = [...new Set([
    ...menuImageUrlsFromDocument(root, homepage.url),
    ...persistedMenuUrls.filter((url) => /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url) && MENU_IMAGE_PATTERN.test(url))
  ])];
  const queue = [...new Set(linkedMenuUrls)]
    .filter((url) => url !== rootUrl)
    // A first-party PDF is normally the most structured menu source. Handle
    // it before an HTML page so an unrelated page cannot fill the short queue.
    .sort((left, right) => Number(MENU_DOCUMENT_PATTERN.test(right)) - Number(MENU_DOCUMENT_PATTERN.test(left)))
    .slice(0, 20);
  const seen = new Set([rootUrl, ...queue]);
  const documents = [];
  if (inlineMenu) documents.push(menuDocumentSignals(homepage.html, homepage.url));

  for (let index = 0; index < queue.length && index < 20; index += 1) {
    const candidateUrl = queue[index];
    try {
      // Restaurant menus are frequently photographic PDFs. The normal public
      // document limit remains 12 MB, but a verified menu candidate may use a
      // larger 75 MB allowance so it can be OCRed rather than silently skipped.
      const document = await fetchPublicDocumentWithRetries(candidateUrl, 75_000_000, 2);
      if (isPdfDocument(document.url, document.contentType, document.data)) {
        const text = await extractPdfMenuText(document.data, document.url);
        documents.push({
          url: document.url,
          format: 'pdf',
          text,
          textAvailable: text.replace(/\s+/g, ' ').trim().length >= 80,
          languages: [...languageSignalsFromText(text, document.url)],
          hasAllergens: ALLERGEN_PATTERN.test(text)
        });
        continue;
      }
      if (!/html|xhtml/i.test(document.contentType)) continue;
      const html = new TextDecoder().decode(document.data);
      const signals = menuDocumentSignals(html, document.url);
      documents.push(signals);
      const nested = cheerio.load(html);
      for (const nestedUrl of menuUrlsFromDocument(nested, document.url)) {
        if (seen.has(nestedUrl)) continue;
        seen.add(nestedUrl);
        queue.push(nestedUrl);
      }
      for (const nestedImageUrl of menuImageUrlsFromDocument(nested, document.url)) {
        if (!menuImageUrls.includes(nestedImageUrl)) menuImageUrls.push(nestedImageUrl);
      }
    } catch {
      // Некоторые сервисы отдают меню только как скачивание после перехода по ссылке.
      const downloadedUrl = await resolveMenuDownloadWithBrowser(candidateUrl);
      if (downloadedUrl && !seen.has(downloadedUrl)) {
        seen.add(downloadedUrl);
        queue.push(downloadedUrl);
      }
    }
  }
  // OCR is a visual-menu fallback. Keep inspecting explicit menu images until
  // a complete landing set is available, rather than stopping after three
  // partially recovered dishes.
  if (extractedMenuItemCount(documents) < 12 && menuImageUrls.length) {
    documents.push(...await extractMenuImageTexts(menuImageUrls));
  }
  return { inlineMenu, menuUrls: [...new Set([...queue, ...menuImageUrls])], documents };
}

function extractedMenuItemCount(documents) {
  return uniqueMenuItems((documents || []).flatMap((document) => extractMenuItemsFromDocument(document))).length;
}

async function loadWebsiteMenuDocuments(homepage, mapsMenuUrl = '', knownMenuUrls = []) {
  let best = { inlineMenu: false, menuUrls: [], documents: [] };
  let currentHomepage = homepage;
  for (let attempt = 0; attempt < MENU_EXTRACTION_PASSES; attempt += 1) {
    const inspected = await loadWebsiteMenuDocumentsOnce(currentHomepage, mapsMenuUrl, knownMenuUrls);
    const inspectedCount = extractedMenuItemCount(inspected.documents);
    const bestCount = extractedMenuItemCount(best.documents);
    if (inspectedCount > bestCount || (!best.documents.length && inspected.documents.length)) best = inspected;
    if (attempt >= MENU_EXTRACTION_PASSES - 1) continue;
    await sleep(400 * (attempt + 1));
    currentHomepage = await fetchPublicHtmlWithRetries(homepage.url, 2).catch(() => homepage);
  }

  // Browser validation follows the three direct passes: a number of restaurant
  // sites render menu content only after JavaScript runs. Inspect every
  // targeted candidate when the ordinary results are incomplete.
  if (extractedMenuItemCount(best.documents) < 12) {
    const renderedCandidates = [...new Set([
      ...best.menuUrls,
      ...(Array.isArray(knownMenuUrls) ? knownMenuUrls : []),
      ...likelyMenuPaths(homepage.url)
    ])].slice(0, 8);
    for (const candidateUrl of renderedCandidates) {
      // The second variant is deliberate: desktop shell + mobile menu is a
      // common QR-menu pattern. Both documents are kept so an incomplete
      // desktop pass cannot overwrite a complete mobile extraction.
      for (const mobile of [false, true]) {
        if (mobile && extractedMenuItemCount(best.documents) >= 12) break;
        const rendered = await fetchRenderedMenuHtml(candidateUrl, { mobile });
        if (!rendered?.html) continue;
        const document = menuDocumentSignals(rendered.html, rendered.url, rendered.text);
        if (!document.textAvailable) continue;
        best = {
          ...best,
          documents: [...best.documents, document],
          menuUrls: [...new Set([...best.menuUrls, rendered.url])]
        };
      }
    }
  }
  return best.documents.length ? best : await loadWebsiteMenuDocumentsOnce(homepage, mapsMenuUrl, knownMenuUrls);
}

async function analyzeWebsiteMenu(website, mapsMenuUrl = '') {
  if (!website) {
    return {
      status: 'no-website', checkedAt: new Date().toISOString(), menuFound: null,
      menuUrls: [], menuLanguages: [], hasEnglishMenu: null, hasAllergens: null
    };
  }
  try {
    const homepage = await fetchPublicHtmlWithRetries(website);
    const menu = await loadWebsiteMenuDocuments(homepage, mapsMenuUrl);
    const menuFound = menu.inlineMenu || menu.menuUrls.length > 0;
    const documents = menu.documents;
    const languages = new Set(documents.flatMap((document) => document.languages));
    const textAvailable = documents.some((document) => document.textAvailable);
    const hasAllergens = menuFound && textAvailable
      ? documents.some((document) => document.hasAllergens)
      : null;
    const languageList = [...languages].sort();
    return {
      status: 'complete',
      checkedAt: new Date().toISOString(),
      menuFound,
      menuUrls: menu.menuUrls,
      menuLanguages: languageList,
      hasEnglishMenu: menuFound && languageList.length ? languageList.includes('en') : (menuFound ? null : false),
      hasAllergens
    };
  } catch {
    return {
      status: 'unavailable', checkedAt: new Date().toISOString(), menuFound: null,
      menuUrls: [], menuLanguages: [], hasEnglishMenu: null, hasAllergens: null
    };
  }
}

function haversineKm(first, second) {
  const toRad = (value) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(second.lat - first.lat);
  const dLon = toRad(second.lng - first.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(first.lat)) * Math.cos(toRad(second.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointAt(center, northKm, eastKm) {
  return {
    lat: center.lat + northKm / 110.574,
    lng: center.lng + eastKm / (111.320 * Math.cos(center.lat * Math.PI / 180))
  };
}

function gridPoints(center, radiusKm) {
  if (radiusKm <= 2) return [center];
  const targetPoints = Math.min(maxSearchPages, Math.max(9, Math.ceil((radiusKm ** 2) / 2)));
  const cellsPerAxis = Math.max(3, Math.ceil(Math.sqrt(targetPoints)));
  const step = (radiusKm * 2) / (cellsPerAxis - 1);
  const points = [];
  for (let y = -radiusKm; y <= radiusKm + 0.001; y += step) {
    for (let x = -radiusKm; x <= radiusKm + 0.001; x += step) {
      if (Math.hypot(x, y) <= radiusKm + step * 0.45) points.push(pointAt(center, y, x));
    }
  }
  return points.slice(0, maxSearchPages);
}

function coordinatesFromUrl(value) {
  const dataMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) return { lat: Number(dataMatch[1]), lng: Number(dataMatch[2]) };
  const viewportMatch = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return viewportMatch ? { lat: Number(viewportMatch[1]), lng: Number(viewportMatch[2]) } : null;
}

function mapsSearchUrl(query, point, zoom = 14) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${point.lat},${point.lng},${zoom}z?hl=ru`;
}

async function failIfBlocked(page) {
  const text = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  if (/(unusual traffic|unusual activity|необычн.{0,20}(трафик|активност)|captcha|recaptcha)/i.test(text)) {
    throw new Error('Google Maps показал ограничение или CAPTCHA. Подождите и повторите запуск позднее, желательно с меньшим радиусом.');
  }
}

async function waitForMap(page) {
  await page.waitForLoadState('domcontentloaded');
  if (new URL(page.url()).hostname === 'consent.google.com') {
    const rejectCookies = page.getByRole('button', { name: /отклонить все|reject all/i }).first();
    if (await rejectCookies.count()) {
      await rejectCookies.click({ timeout: 5_000, noWaitAfter: true }).catch(() => {});
    }
    const deadline = Date.now() + 120_000;
    while (new URL(page.url()).hostname === 'consent.google.com' && Date.now() < deadline) {
      await page.waitForTimeout(400);
    }
    if (new URL(page.url()).hostname === 'consent.google.com') {
      throw new Error('Не удалось обработать страницу cookie Google. Повторите запуск позднее.');
    }
  }
  await page.waitForTimeout(1_100);
  await failIfBlocked(page);
}

async function getCityCenter(page, city) {
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(city)}?hl=ru`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForMap(page);
  const fromUrl = coordinatesFromUrl(page.url());
  if (fromUrl && Math.abs(fromUrl.lat) > 0.001) return fromUrl;
  throw new Error('Не удалось определить центр города в Google Maps. Уточните название города и страну, например «Минск, Беларусь».');
}

async function geocodeCityCenter(city) {
  const cacheKey = city.toLocaleLowerCase('ru');
  if (cityCenterCache.has(cacheKey)) return cityCenterCache.get(cacheKey);
  const pause = 1_100 - (Date.now() - lastGeocoderRequestAt);
  if (pause > 0) await sleep(pause);
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', city);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('addressdetails', '0');
  const geocodeResponse = await fetch(endpoint, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'user-agent': 'CafeLeadExporter/1.0 (one city-center lookup per export)',
      accept: 'application/json'
    }
  });
  lastGeocoderRequestAt = Date.now();
  if (!geocodeResponse.ok) throw new Error('Не удалось определить центр города. Повторите запрос немного позже.');
  const matches = await geocodeResponse.json();
  const first = matches?.[0];
  const center = first && { lat: Number(first.lat), lng: Number(first.lon) };
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error('Город не найден. Укажите город и страну, например «Будапешт, Венгрия».');
  }
  cityCenterCache.set(cacheKey, center);
  return center;
}

// Google Maps returns a category directly in every search-result card.  A
// search for cafes may still surface a landmark, a square or a hotel that is
// merely close to a restaurant.  Do not infer the business type from its
// name: only an explicit Maps category from the result card is trusted.
const FOOD_VENUE_CATEGORY_PATTERN = /(?:^|[^\p{L}])(?:cafe|caf[eè]|coffee\s*(?:shop|roastery|house)?|coffeehouse|restaurant|ristorante|trattoria|osteria|pizzeria|pizza|bar|pub|bistro|brasserie|diner|grill|steakhouse|fast\s*food|food\s*court|takeaway|take-away|bakery|pastry|patisserie|confectionery|ice\s*cream|gelateria|tea\s*(?:house|room)|cafeteria|cafeter[ií]a|restaurante|helader[ií]a|pasteler[ií]a|boulangerie|p[âa]tisserie|glacier|salon\s+de\s+th[eé]|k[aá]v[eé]z[oó]|[ée]tterem|cukr[aá]szda|p[eé]ks[eé]g|kav[aá]rna|restaurace|cukr[aá]rna|pek[aá]rna|кафе|кофейн(?:я|ая|ый)|кофейная\s+ростерия|ресторан|пиццери[яи]|бар|паб|бистро|столовая|закусочн|фастфуд|быстрое\s+питание|пекарн|кондитер|булочн|морожен|джелатери|чайная|ресторант|кафене|сладкарниц|пекарна)(?=$|[^\p{L}])/iu;
const NON_FOOD_VENUE_CATEGORY_PATTERN = /(?:^|[^\p{L}])(?:historical\s*(?:landmark|place|site)|landmark|monument|square|plaza|piazza|park|garden|museum|gallery|church|cathedral|basilica|mosque|synagogue|temple|tourist\s+attraction|hotel|hostel|apartment|lodging|city\s+hall|government|university|school|library|hospital|pharmacy|bank|atm|parking|bus\s+stop|train\s+station|historic(?:al)?\s+monument|достопримечательност|историческ(?:ий|ая)\s+(?:памятник|место)|площадь|парк|сад|музей|галерея|церковь|собор|базилик|мечеть|синагог|храм|отель|гостиниц|хостел|апартамент|ратуш|университет|школа|библиотек|больниц|аптек|банк|банкомат|парковк|остановк|вокзал)(?=$|[^\p{L}])/iu;

function normalizedMapsPlaceCategory(value) {
  return String(value || '')
    .replace(/[\uE000-\uF8FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[·•|]+$/u, '')
    .trim();
}

function isFoodVenueCategory(value) {
  const category = normalizedMapsPlaceCategory(value);
  return Boolean(category) && FOOD_VENUE_CATEGORY_PATTERN.test(category) && !NON_FOOD_VENUE_CATEGORY_PATTERN.test(category);
}

function isExplicitNonFoodVenueCategory(value) {
  const category = normalizedMapsPlaceCategory(value);
  return Boolean(category) && NON_FOOD_VENUE_CATEGORY_PATTERN.test(category) && !FOOD_VENUE_CATEGORY_PATTERN.test(category);
}

function categoryFromMapsResultCard(cardText, title = '') {
  const normalizedTitle = String(title || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
  const lines = String(cardText || '').split(/\r?\n/u).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) {
    const firstPart = normalizedMapsPlaceCategory(line.split(/[·•|]/u, 1)[0]);
    if (!firstPart || firstPart.toLocaleLowerCase('ru') === normalizedTitle) continue;
    // The actual Maps type line is followed by the dot before the address.
    // Requiring that marker prevents a venue name such as "Cafe Plaza" from
    // being mistaken for its own category.
    if (!/[·•|]/u.test(line)) continue;
    if (isFoodVenueCategory(firstPart) || isExplicitNonFoodVenueCategory(firstPart)) return firstPart;
  }
  return '';
}

async function scrollAndCollectLinks(page) {
  const feed = page.locator('div[role="feed"]').first();
  if (!await feed.count()) return [];
  let stableRounds = 0;
  let previous = 0;
  for (let attempt = 0; attempt < 16 && stableRounds < 3; attempt += 1) {
    const count = await page.locator('a[href*="/maps/place/"]').count();
    if (count === previous) stableRounds += 1;
    else stableRounds = 0;
    previous = count;
    await feed.evaluate((element) => element.scrollBy(0, element.scrollHeight));
    await page.waitForTimeout(850);
    await failIfBlocked(page);
  }
  const links = await page.locator('a[href*="/maps/place/"]').evaluateAll((anchors) => anchors.map((anchor) => {
    const card = anchor.closest('[role="article"]');
    return {
      href: anchor.href,
      title: anchor.getAttribute('aria-label') || anchor.textContent?.trim() || '',
      cardText: card?.textContent?.trim() || ''
    };
  }));
  return links.map((link) => ({
    ...link,
    mapsCategory: categoryFromMapsResultCard(link.cardText, link.title)
  }));
}

async function textOf(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    // Optional Google Maps controls can disappear when another panel is open.
    // Never allow one absent field to consume Playwright's 30-second default.
    const value = await locator.textContent({ timeout: 2_500 }).catch(() => null);
    if (value?.trim()) return value.trim();
  }
  return '';
}

async function hrefOf(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const href = await locator.getAttribute('href', { timeout: 2_500 }).catch(() => null);
    if (href?.trim()) return href.trim();
  }
  return '';
}

function parseRatingAndReviewCount(label) {
  const text = label.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  // The Google Maps star control always starts with the numeric rating, while
  // the text after it is localized. Do not depend on a particular UI language.
  const ratingMatch = text.match(/^\s*([1-5](?:[.,]\d)?)(?=\s*(?:[-–—]|\p{L}))/u)
    || text.match(/([1-5](?:[.,]\d)?)\s*-?\s*(?:звезд|stars?)/i)
    || text.match(/(?:rating|оценка)\s*[:\-]?\s*([1-5](?:[.,]\d)?)/i);
  const countMatch = text.match(/(?:отзыв(?:ов)?|reviews?)\s*[:\-]?\s*([\d\s,.'’]+)/i) || text.match(/([\d][\d\s,.'’]*)\s*(?:отзыв(?:ов)?|reviews?)/i);
  const reviewCount = countMatch ? Number(countMatch[1].replace(/\D/g, '')) : null;
  return {
    rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
    reviewCount: Number.isSafeInteger(reviewCount) ? reviewCount : null
  };
}

async function ratingAndReviewCount(page) {
  const [labels, ratingLabels] = await Promise.all([
    page.locator('[aria-label], button, [role="button"]').evaluateAll((elements) => elements
    .map((element) => `${element.getAttribute('aria-label') || ''} ${(element.textContent || '').trim()}`)
    .filter((label) => /(отзыв|reviews?|звезд|stars?|rating|оценка)/i.test(label))),
    page.locator('[role="img"][aria-label]').evaluateAll((elements) => elements
      .map((element) => element.getAttribute('aria-label') || '')
      .filter(Boolean)
    )
  ]);
  const result = { rating: null, reviewCount: null };
  for (const label of [...ratingLabels, ...labels]) {
    const parsed = parseRatingAndReviewCount(label);
    if (result.rating === null && parsed.rating !== null) result.rating = parsed.rating;
    if (result.reviewCount === null && parsed.reviewCount !== null) result.reviewCount = parsed.reviewCount;
    if (result.rating !== null && result.reviewCount !== null) return result;
  }
  return result;
}

async function mapsPlaceCategory(page) {
  const category = await textOf(page, [
    '[jsaction$=".category"]',
    '[jsaction*=".category"]',
    'button.DkEaL'
  ]);
  return normalizedMapsPlaceCategory(category);
}

async function getPlace(page, candidate, center, radiusKm) {
  await page.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForMap(page);
  const coordinates = coordinatesFromUrl(page.url());
  const distanceKm = coordinates ? haversineKm(center, coordinates) : null;
  if (distanceKm !== null && distanceKm > radiusKm + 0.2) return null;
  const mapsCategory = await mapsPlaceCategory(page) || candidate.mapsCategory || '';
  // This is the second guard.  The search-card filter is the fast path; this
  // detail-card check protects the dataset if Maps changes or partially
  // re-renders a result card while the feed is being scrolled.
  if (!isFoodVenueCategory(mapsCategory)) return null;
  const name = await textOf(page, ['h1.DUwDvf', 'h1']) || candidate.title;
  const address = await textOf(page, ['button[data-item-id="address"]', '[data-item-id="address"]']);
  const website = cleanPublicUrl(await hrefOf(page, ['a[data-item-id="authority"]', 'a[data-item-id="url"]']));
  const ratingData = await ratingAndReviewCount(page);
  const mapsCard = await extractMapsCardSignals(page);
  const review = await readLatestReview(page);
  const contacts = await extractSiteContacts(website);
  return {
    name: name.replace(/\s+/g, ' ').trim(),
    mapsCategory,
    address: address.replace(/^Адрес:\s*/i, '').replace(/\s+/g, ' ').trim(),
    mapsUrl: page.url(),
    website,
    rating: ratingData.rating,
    reviewCount: ratingData.reviewCount,
    ...mapsCard,
    emails: contacts.emails,
    socials: contacts.socials,
    sitePhones: contacts.phones,
    phones: normalizePhoneList([...(mapsCard.mapsPhones || []), ...(contacts.phones || [])], `${address} ${candidate.title || ''}`),
    lastReview: review.date,
    reviewSort: review.date ? 'Сначала новые' : '',
    reviewStatus: review.status,
    distanceKm: distanceKm === null ? '' : Number(distanceKm.toFixed(2))
  };
}

async function enrichProductionCafesFromMaps(cafes) {
  const targets = (cafes || []).filter((cafe) => cafe.mapsUrl && (!cafe.mapsPhones?.length || !cafe.rating || !cafe.reviewCount || !hasPublishedMapsSchedule(cafe.mapsOpeningHours)));
  if (!targets.length) return cafes;
  const enriched = new Map((cafes || []).map((cafe) => [cafe.productionId, cafe]));
  let context;
  try {
    const executablePath = await installedChromeExecutable();
    context = await chromium.launchPersistentContext(path.join(__dirname, '.maps-browser-profile'), {
      // This is a verification pass, not a user interaction flow. Headless
      // mode prevents a Chromium window from interrupting the workspace and
      // reliably lets Maps finish rendering contact fields.
      headless: true,
      locale: 'ru-RU',
      viewport: { width: 1440, height: 1000 },
      ...(executablePath ? { executablePath } : {})
    });
    const page = await context.newPage();
    for (const cafe of targets.slice(0, 6)) {
      try {
        // Enrichment must not keep the saved landing blocked indefinitely.
        // If Maps does not render promptly, a subsequent extraction retries it.
        await page.goto(cafe.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 18_000 });
        await waitForMap(page);
        // Capture fields belonging to the main place panel before opening the
        // hours drawer, which replaces that panel in the Maps DOM.
        const address = await textOf(page, ['button[data-item-id="address"]', '[data-item-id="address"]']);
        // The hours expander changes the Maps pane, so capture rating first and
        // only then open the weekly timetable. Parallel reads can otherwise
        // race against the pane transition and lose one of the fields.
        const rating = await ratingAndReviewCount(page);
        const signals = await extractMapsCardSignals(page);
        const mergedPhones = normalizePhoneList([...(cafe.mapsPhones || []), ...(signals.mapsPhones || [])], `${address || cafe.address || ''} ${cafe.city || ''}`);
        enriched.set(cafe.productionId, {
          ...cafe,
          address: cleanProductionAddress(address || cafe.address),
          mapsPhones: mergedPhones,
          phones: normalizePhoneList([...(cafe.phones || []), ...mergedPhones], `${address || cafe.address || ''} ${cafe.city || ''}`),
          mapsOpeningHours: signals.mapsOpeningHours?.length ? signals.mapsOpeningHours : cafe.mapsOpeningHours || [],
          // A partially rendered Maps card yields 0 here. Never overwrite a
          // previously confirmed rating/review count with that empty value.
          rating: Number(rating.rating) > 0 ? rating.rating : cafe.rating,
          reviewCount: Number(rating.reviewCount) > 0 ? rating.reviewCount : cafe.reviewCount,
          mapsMenuUrl: signals.mapsMenuUrl || cafe.mapsMenuUrl || ''
        });
      } catch {
        // Google Maps может временно ограничить один из запросов: сайт остаётся источником для остальных полей.
      }
    }
  } catch {
    // Глубокое уточнение Maps необязательно для сохранения уже подтверждённых данных сайта.
  } finally {
    // Google Maps can keep background connections alive after the fields have
    // been read. Release the renderer first and bound context shutdown so it
    // can never hold up the API response.
    if (context) {
      // Do not await page.close(): a Maps navigation can keep it pending while
      // it tears down an internal service worker. Context close below is the
      // actual resource cleanup and is itself bounded.
      context.pages().forEach((page) => { void page.close({ runBeforeUnload: false }).catch(() => {}); });
      await Promise.race([
        context.close().catch(() => {}),
        sleep(2_000)
      ]);
    }
  }
  return (cafes || []).map((cafe) => enriched.get(cafe.productionId) || cafe);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  // Preserve the source priority order. A previous push-on-completion approach
  // allowed a fast third-party logo to jump ahead of the café's own (slower)
  // logo and become the selected brand mark.
  const results = new Array(items.length);
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const current = items[currentIndex];
      const value = await mapper(current);
      if (value) results[currentIndex] = value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results.filter(Boolean);
}

app.post('/api/xlsx', (request, response) => {
  const headers = validateSpreadsheetMatrix([request.body?.headers], 1, 60)?.[0];
  const rows = validateSpreadsheetMatrix(request.body?.rows, 1_500, 60);
  const sheetName = String(request.body?.sheetName || 'Отчёт').slice(0, 31);
  if (!headers?.length || !rows) return response.status(400).json({ error: 'Некорректные данные для Excel-отчёта.' });
  const output = createXlsxBuffer({ sheetName, headers, rows });
  response.set({
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': 'attachment; filename="cafe-report.xlsx"',
    'content-length': String(output.length)
  });
  response.send(output);
});

app.get('/api/arrays', async (_request, response) => {
  try {
    const arrays = await readArrays();
    response.json({ arrays: arrays.map(arraySummary) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить массивы.' });
  }
});

app.get('/api/arrays/:id', async (request, response) => {
  try {
    const arrays = await readArrays();
    const item = arrays.find((entry) => entry.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Массив не найден.' });
    response.json({ array: item });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить массив.' });
  }
});

app.post('/api/arrays/:id/score', async (request, response) => {
  try {
    response.json(await rescoreArray(request.params.id));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось выполнить скоринг.' });
  }
});

app.delete('/api/arrays/:id', async (request, response) => {
  try {
    const deleted = await updateArrays((arrays) => {
      const index = arrays.findIndex((entry) => entry.id === request.params.id);
      if (index < 0) throw new Error('Массив не найден.');
      return arrays.splice(index, 1)[0];
    });
    await updateScorings((scorings) => {
      const index = scorings.findIndex((entry) => entry.arrayId === deleted.id);
      if (index >= 0) scorings.splice(index, 1);
      return null;
    });
    response.json({ deleted: arraySummary(deleted) });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось удалить массив.' });
  }
});

app.get('/api/scorings', async (_request, response) => {
  try {
    const scorings = await readScorings();
    response.json({ scorings: scorings.map(scoringSummary) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить результаты скоринга.' });
  }
});

app.get('/api/scorings/:id', async (request, response) => {
  try {
    const scorings = await readScorings();
    const item = scorings.find((entry) => entry.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Результат скоринга не найден.' });
    response.json({ scoring: item });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить результат скоринга.' });
  }
});

app.post('/api/scorings/:id/repeat', async (request, response) => {
  try {
    const scorings = await readScorings();
    const item = scorings.find((entry) => entry.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Результат скоринга не найден.' });
    response.json(await rescoreArray(item.arrayId));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось повторить скоринг.' });
  }
});

app.post('/api/scorings/:id/candidates', async (request, response) => {
  try {
    const candidate = await createCandidatesFromScoring(request.params.id);
    response.json({ candidate });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось сформировать кандидатов.' });
  }
});

app.delete('/api/scorings/:id', async (request, response) => {
  try {
    const deleted = await updateScorings((scorings) => {
      const index = scorings.findIndex((entry) => entry.id === request.params.id);
      if (index < 0) throw new Error('Результат скоринга не найден.');
      return scorings.splice(index, 1)[0];
    });
    await clearArrayScore(deleted.arrayId);
    response.json({ deleted: scoringSummary(deleted) });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось удалить результат скоринга.' });
  }
});

app.get('/api/candidates', async (_request, response) => {
  try {
    const candidates = await readCandidates();
    response.json({ candidates: candidates.map(candidateSummary) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить кандидатов.' });
  }
});

app.get('/api/candidates/:id', async (request, response) => {
  try {
    const candidates = await readCandidates();
    const item = candidates.find((entry) => entry.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Подборка кандидатов не найдена.' });
    response.json({ candidate: item });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить кандидатов.' });
  }
});

app.delete('/api/candidates/:id', async (request, response) => {
  try {
    const deleted = await updateCandidates((candidates) => {
      const index = candidates.findIndex((entry) => entry.id === request.params.id);
      if (index < 0) throw new Error('Подборка кандидатов не найдена.');
      return candidates.splice(index, 1)[0];
    });
    response.json({ deleted: candidateSummary(deleted) });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось удалить подборку кандидатов.' });
  }
});

const PRODUCTION_TEMPLATES = {
  'classic-light-1': {
    id: 'classic-light-1',
    name: 'Шаблон №1 · Classic Light',
    anatomyUrl: '/templates/classic-light/template.anatomy.json',
    mode: 'classic-light',
    structure: {
      note: 'Разбор по контракту Classic Light: импортируются только подтверждённые данные, а статусы и замечания показываются для каждого элемента.',
      slots: [
        { id: '01–09', label: 'Шапка', required: ['restaurant.logo', 'restaurant.name', 'restaurant.address', 'restaurant.phone', 'restaurant.openingHours', 'localization.languages', 'restaurant.bookingUrl'] },
        { id: '10–30', label: 'Навигация и меню', required: ['menu.categories[]', 'menu.items[]', 'pricing.native', 'allergens[]'] },
        { id: '31–39', label: 'Локация и карточка Google Maps', required: ['map.embedUrl', 'location.title', 'location.rating', 'location.reviewsCount', 'location.address', 'location.miniPhoto', 'location.openingHours', 'location.directions'] },
        { id: '40–48', label: 'Футер', required: ['restaurant.email', 'restaurant.websiteUrl', 'restaurant.socials[]', 'restaurant.openingHours'] },
        { id: '49–52', label: 'Legal-полоса', required: ['footer.copyright', 'footer.privacyUrl', 'footer.termsUrl', 'footer.imprintUrl'] }
      ]
    }
  },
  'cinematic-video-2': {
    id: 'cinematic-video-2',
    name: 'Шаблон №2 · Cinematic Video',
    pending: true,
    mode: 'cinematic-video',
    structure: {
      note: 'Каркас Cinematic Video будет добавлен после получения отдельного контракта.',
      slots: []
    }
  }
};

function cleanProductionAddress(value) {
  return String(value || '').replace(/^[^\p{L}\p{N}+]+/u, '').trim();
}

function compactProductionText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveProductionUrl(value, baseUrl) {
  try {
    const resolved = new URL(value, baseUrl).href;
    return cleanPublicUrl(resolved);
  } catch {
    return '';
  }
}

function productionCafeFromRow(row, group) {
  return {
    productionId: `${group.id}:${row.candidateNumber}`,
    candidateId: group.id,
    candidateNumber: row.candidateNumber,
    batchName: group.name,
    batchNumber: group.number,
    city: group.city,
    name: row.name,
    address: cleanProductionAddress(row.address),
    mapsUrl: row.mapsUrl,
    website: row.website,
    socials: row.socials || {},
    emails: row.emails || [],
    phones: normalizePhoneList(row.phones || [], `${row.address || ''} ${group.city || ''}`),
    mapsPhones: normalizePhoneList(row.mapsPhones || [], `${row.address || ''} ${group.city || ''}`),
    sitePhones: normalizePhoneList(row.sitePhones || [], `${row.address || ''} ${group.city || ''} ${row.website || ''}`),
    mapsOpeningHours: row.mapsOpeningHours || [],
    rating: finiteNumberOrNull(row.rating),
    reviewCount: integerOrNull(row.reviewCount),
    score: row.score,
    priority: Boolean(row.priority),
    priorityCount: Number(row.priorityCount) || 0,
    priorityReasons: row.priorityReasons || [],
    menuOnSite: row.menuOnSite,
    siteMenuAnalysis: row.siteMenuAnalysis || null,
    productionSentAt: row.productionSentAt
  };
}

function mapsRatingOrNull(value) {
  const rating = finiteNumberOrNull(value);
  return rating !== null && rating >= 1 && rating <= 5 ? rating : null;
}

function mapsReviewCountOrNull(value) {
  const count = integerOrNull(value);
  return count !== null && count > 0 ? count : null;
}

function mergeProductionSourceFacts(row, sourceRow) {
  const source = sourceRow || {};
  const rating = mapsRatingOrNull(row.rating) ?? mapsRatingOrNull(source.rating);
  const reviewCount = mapsReviewCountOrNull(row.reviewCount) ?? mapsReviewCountOrNull(source.reviewCount);
  return {
    ...source,
    ...row,
    rating,
    reviewCount,
    mapsPhones: row.mapsPhones?.length ? row.mapsPhones : source.mapsPhones || [],
    mapsOpeningHours: row.mapsOpeningHours?.length ? row.mapsOpeningHours : source.mapsOpeningHours || []
  };
}

async function readProductionCafes() {
  const [groups, arrays] = await Promise.all([readCandidates(), readArrays()]);
  const arraysById = new Map(arrays.map((array) => [array.id, array]));
  return groups.flatMap((group) => {
    const sourceRows = arraysById.get(group.arrayId)?.rows || [];
    return (group.rows || [])
      .filter((row) => row.productionSentAt)
      .map((row) => {
        const sourceRow = sourceRows.find((source) => source.mapsUrl && source.mapsUrl === row.mapsUrl)
          || sourceRows.find((source) => source.name === row.name && source.address === row.address);
        return productionCafeFromRow(mergeProductionSourceFacts(row, sourceRow), group);
      });
  });
}

async function fetchPublicText(value, maxBytes = 350_000) {
  let url = await assertPublicUrl(value);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'user-agent': 'CafeLeadExporter/1.0 (+production asset audit)',
        accept: 'text/css,text/plain,text/html,*/*'
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location');
      if (!target) throw new Error('Перенаправление без адреса');
      url = await assertPublicUrl(new URL(target, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) return { url: url.href, text: '' };
    const chunks = [];
    let size = 0;
    while (size < maxBytes) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      chunks.push(chunk);
      size += chunk.byteLength;
    }
    await reader.cancel();
    return { url: url.href, text: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error('Слишком много перенаправлений');
}

const LANDING_LANGUAGE_LABELS = {
  cs: 'Čeština',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hu: 'Magyar',
  it: 'Italiano',
  ru: 'Русский'
};

function inferCafeNativeLanguage(cafe = {}) {
  const countryCode = String(cafe.countryCode || cafe.country || '').trim().toUpperCase();
  const countryLanguages = { AT: 'de', DE: 'de', ES: 'es', PT: 'pt', IT: 'it', CZ: 'cs', HU: 'hu', PL: 'pl', NL: 'nl', FR: 'fr', HR: 'hr', GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en' };
  if (/^[A-Z]{2}$/u.test(countryCode) && countryLanguages[countryCode]) return countryLanguages[countryCode];
  const context = `${cafe.city || ''} ${cafe.address || ''} ${cafe.country || ''}`.toLowerCase();
  const rules = [
    ['it', /italy|italia|italiano|venezia|venice|roma|rome|milano|milan|napoli|florence|firenze|итал|венеци|рим|милан|флоренц/],
    ['de', /austria|österreich|wien|vienna|germany|deutschland|berlin|münchen|munich|австри|герман|вена|гамбург|берлин|мюнхен/],
    ['fr', /france|français|paris|nice|lyon|marseille|франц|париж|ницц|лион|марсел/],
    ['es', /spain|españa|barcelona|madrid|valencia|sevilla|испан|барселон|мадрид|валенси|севил/],
    ['hu', /hungary|magyarország|budapest|венгр|будапешт/],
    ['cs', /czech|česko|česká|praha|prague|чех|праг/],
    ['ru', /belarus|беларус|минск|minsk|russia|росси/],
    ['en', /united kingdom|great britain|london|england|usa|united states|canada|australia|великобрит|лондон|англи/]
  ];
  const inferred = rules.find(([, matcher]) => matcher.test(context))?.[0];
  if (inferred) return inferred;
  const supplementaryRules = [
    ['pt', /portugal|portuguese|lisbon|lisboa|porto/],
    ['pl', /poland|polska|warsaw|warszawa|krakow/],
    ['nl', /netherlands|nederland|amsterdam|rotterdam|the hague|den haag/],
    ['hr', /croatia|hrvatska|zagreb|dubrovnik|split/]
  ];
  return supplementaryRules.find(([, matcher]) => matcher.test(context))?.[0] || '';
}

function createLandingLanguages(cafe = {}, detected = []) {
  const normalized = detected.map((code) => normalizeLanguage(code)).filter(Boolean);
  const native = inferCafeNativeLanguage(cafe) || normalized.find((code) => code !== 'en') || normalized[0] || 'en';
  const languages = [native, 'en', ...normalized].filter((code, index, list) => list.indexOf(code) === index);
  return {
    native: { code: native, label: LANDING_LANGUAGE_LABELS[native] || native.toUpperCase() },
    // `landing` is a language target list, not merely an observation from the source site.
    // English is guaranteed for every landing and native stays first for the switcher.
    landing: languages,
    detected: languages
  };
}

function extractProductionLanguages($, cafe) {
  return createLandingLanguages(cafe, [...languageSignals($, cafe.website || cafe.sourceUrl || '')]);
}

function extractCssLinks($, sourceUrl) {
  const links = new Set();
  $('link[rel~="stylesheet"][href]').each((_, element) => {
    const url = resolveProductionUrl($(element).attr('href'), sourceUrl);
    if (url) links.add(url);
  });
  return [...links].slice(0, 8);
}

function extractFontFamilies(cssText, sourceUrl) {
  const fonts = new Map();
  for (const match of cssText.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
    const families = match[1].split(',').map((item) => item.replace(/["']/g, '').trim()).filter(Boolean);
    for (const family of families) {
      if (/^(serif|sans-serif|monospace|system-ui|inherit|initial|ui-|Arial|Helvetica)$/i.test(family)) continue;
      if (!fonts.has(family)) fonts.set(family, { family, source: 'font-family в CSS', evidenceUrl: sourceUrl });
    }
  }
  for (const match of cssText.matchAll(/font-family\s*:\s*["']?([^;"']+)["']?\s*;/gi)) {
    const family = match[1].trim();
    if (family && !fonts.has(family)) fonts.set(family, { family, source: '@font-face', evidenceUrl: sourceUrl });
  }
  return [...fonts.values()];
}

function extractColors(cssText) {
  const colors = new Map();
  for (const match of cssText.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    const value = match[0].toUpperCase();
    colors.set(value, (colors.get(value) || 0) + 1);
  }
  return [...colors.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 16)
    .map(([value, mentions]) => ({ value, mentions }));
}

function inferColorRoles(colors) {
  return {
    text: colors.slice(0, 8),
    surface: colors.slice(8, 16)
  };
}

function extractProductionAssets($, sourceUrl) {
  const assets = [];
  const seen = new Set();
  const isExcluded = (url, context = '') => /(?:watermark|tripadvisor|tacdn\.com|travelers?.{0,12}choice|certificate.{0,12}excellence|yelp|thefork|tfstatic|opentable|resy|google[-_ ]?maps|facebook[-_ ]?(?:icon|share)|instagram[-_ ]?(?:icon|share)|(?:cookie|consent|cmp)[-_ ]?(?:banner|logo|icon)|(?:badge|award|certificate|reservation)[-_ ]?(?:icon|button|widget))/i.test(`${url} ${context}`);
  const isThirdPartyBrand = (url, context = '') => /(?:\bionos\b|1und1|poweredby|powered[-_ ]?by|wix(?:site)?|squarespace|godaddy)/i.test(`${url} ${context}`);
  const hasLogoMarker = (value = '') => /(?:logo|wordmark|logotype|brandmark|логотип)/i.test(value);
  const add = (asset) => {
    if (!asset.previewUrl || seen.has(asset.previewUrl)) return;
    seen.add(asset.previewUrl);
    assets.push(asset);
  };
  const ogNode = $('meta[property="og:image"], meta[name="twitter:image"]').first();
  const og = ogNode.attr('content');
  const ogAlt = compactProductionText(ogNode.attr('alt') || $('meta[property="og:image:alt"], meta[name="twitter:image:alt"]').first().attr('content') || '');
  const ogUrl = resolveProductionUrl(og, sourceUrl);
  const ogIsLogo = hasLogoMarker(ogAlt);
  if (ogUrl && !isExcluded(ogUrl, `og:image ${ogAlt}`) && !isThirdPartyBrand(ogUrl, ogAlt)) add({ kind: ogIsLogo ? 'logo' : 'brand-scene', label: ogAlt || (ogIsLogo ? 'Logo candidate' : 'Open Graph image'), previewUrl: ogUrl, sourceUrl, recommended: true, evidence: { alt: ogAlt, context: 'og:image' } });
  $('img, source').each((_, element) => {
    const node = $(element);
    const src = node.attr('src')
      || node.attr('data-src')
      || node.attr('data-lazy-src')
      || node.attr('data-original')
      || String(node.attr('srcset') || node.attr('data-srcset') || '').split(',')[0].trim().split(/\s+/)[0];
    const url = resolveProductionUrl(src, sourceUrl);
    if (!url) return;
    const alt = compactProductionText(node.attr('alt') || node.attr('aria-label') || '');
    const parentContext = node.parents().slice(0, 4).map((__, parent) => {
      const current = $(parent);
      return `${current.attr('class') || ''} ${current.attr('id') || ''} ${current.attr('title') || ''} ${current.attr('aria-label') || ''}`;
    }).get().join(' ');
    // `[class*="header"]` matched WordPress' `page-template-elementor_header_footer`
    // on the BODY element, effectively classifying every image as a logo.
    // Restrict the evidence to an actual header/banner container.
    const hasHeaderContext = node.parents('header, [role="banner"], .site-header, #site-header, .elementor-location-header, .ekit-template-content-header').length > 0;
    const hasHomeLink = node.closest('a[href="/"], a[href="./"], a[href$="/index.html"]').length > 0;
    const context = compactProductionText(`${alt} ${node.attr('class') || ''} ${node.attr('id') || ''} ${parentContext}`);
    // Brand marks are commonly placed as an image inside a header/home link
    // without the word "logo" in the image itself (e.g. Café Goldegg and
    // Grunwald). Treat that structural evidence as a logo candidate.
    const isOwnSiteAsset = isSameSiteUrl(url, sourceUrl);
    const isDecorativeOrGalleryAsset = /(?:swiper|carousel|gallery|menu-source|badge|award|certificate|cookie|consent|reservation|booking|thefork|tf-?button|social|icon)/i.test(context);
    const isLogo = hasLogoMarker(context + ' ' + url)
      || (hasHeaderContext && isOwnSiteAsset && !isDecorativeOrGalleryAsset)
      || (hasHomeLink && hasHeaderContext && isOwnSiteAsset && Boolean(alt) && !MENU_IMAGE_PATTERN.test(context));
    if (isThirdPartyBrand(url, context)) return;
    // An award, directory widget or social-service mark is never the café
    // logo, even when the provider happens to place it inside the page header.
    if (isExcluded(url, context)) return;
    add({
      kind: isLogo ? 'logo' : MENU_IMAGE_PATTERN.test(context) ? 'menu-source' : 'image',
      label: alt || (isLogo ? 'Logo candidate' : 'Image candidate'),
      previewUrl: url,
      sourceUrl: url,
      recommended: isLogo || assets.length < 2,
      evidence: { alt, context }
    });
  });
  $('link[rel~="icon"][href], link[rel="apple-touch-icon"][href]').each((_, element) => {
    const url = resolveProductionUrl($(element).attr('href'), sourceUrl);
    if (url) add({ kind: 'site-icon', label: 'Site icon', previewUrl: url, sourceUrl: url, recommended: false, evidence: { context: 'rel icon' } });
  });
  const priority = (asset) => {
    if (asset.kind === 'logo' && /(?:partner|sponsor|powered|ionos|1und1)/i.test(`${asset.label || ''} ${asset.evidence?.alt || ''} ${asset.evidence?.context || ''}`)) return 2;
    if (asset.kind === 'logo' && hasLogoMarker(`${asset.label || ''} ${asset.evidence?.alt || ''} ${asset.evidence?.context || ''}`)) return 0;
    if (asset.kind === 'logo') return 1;
    if (asset.kind === 'brand-scene') return 2;
    // Keep a verified site favicon within the inspection window: it becomes a
    // reviewable fallback only when the site has no separate logo asset.
    if (asset.kind === 'site-icon') return 2.5;
    if (asset.kind === 'image') return 3;
    if (asset.kind === 'menu-source') return 4;
    return 5;
  };
  return assets
    .sort((left, right) => priority(left) - priority(right))
    .slice(0, 24)
    .map((asset, index) => ({ id: `asset-${index + 1}`, ...asset }));
}

function imageDimensions(data, mime = '') {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
  if (!buffer.length) return { width: null, height: null };
  if (/svg/i.test(mime) || buffer.subarray(0, 256).toString('utf8').includes('<svg')) {
    const text = buffer.subarray(0, 80_000).toString('utf8');
    const width = Number((text.match(/\bwidth=["']\s*(\d+(?:\.\d+)?)/i) || [])[1]);
    const height = Number((text.match(/\bheight=["']\s*(\d+(?:\.\d+)?)/i) || [])[1]);
    const viewBox = text.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
    return { width: Number.isFinite(width) ? width : Number(viewBox?.[1]) || null, height: Number.isFinite(height) ? height : Number(viewBox?.[2]) || null };
  }
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buffer.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (chunk === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      if (!length) break;
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

function svgColorLuminance(value = '') {
  const source = String(value || '').trim().toLowerCase();
  const hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
    return (rgb[0] * 0.2126) + (rgb[1] * 0.7152) + (rgb[2] * 0.0722);
  }
  const rgb = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? (Number(rgb[1]) * 0.2126) + (Number(rgb[2]) * 0.7152) + (Number(rgb[3]) * 0.0722) : null;
}

function inspectSvgVisuals(data) {
  const text = Buffer.isBuffer(data) ? data.subarray(0, 160_000).toString('utf8') : String(data || '');
  const colors = [
    ...text.matchAll(/\b(?:fill|stroke)\s*=\s*["']\s*([^"']+)/gi),
    ...text.matchAll(/\b(?:fill|stroke)\s*:\s*([^;}"']+)/gi)
  ]
    .map((match) => String(match[1] || '').trim())
    .filter((value) => value && !/^(?:none|transparent|inherit|currentcolor)$/i.test(value));
  const luminance = colors.map(svgColorLuminance).filter((value) => Number.isFinite(value));
  const lightForeground = luminance.length > 0 && luminance.every((value) => value >= 228);
  return {
    renderable: /<svg\b/i.test(text) && /(?:<path\b|<polygon\b|<rect\b|<circle\b|<text\b|<use\b)/i.test(text),
    lightForeground,
    requiresDarkSurface: lightForeground,
    colorSamples: colors.slice(0, 10)
  };
}

async function validateProductionVisualAsset(data, mime = '', url = '') {
  const sourceMime = String(mime || '').toLowerCase();
  const dimensions = imageDimensions(data, sourceMime);
  const isSvg = /svg/i.test(sourceMime) || Buffer.from(data || '').subarray(0, 512).toString('utf8').includes('<svg');
  if (isSvg) {
    const svg = inspectSvgVisuals(data);
    return {
      ...svg,
      width: dimensions.width,
      height: dimensions.height,
      reason: svg.renderable ? '' : 'SVG не содержит отображаемых графических элементов.'
    };
  }
  if (!/^image\//i.test(sourceMime) && !dimensions.width && !dimensions.height) {
    return { renderable: false, requiresDarkSurface: false, lightForeground: false, width: null, height: null, reason: `Ответ не является изображением (${sourceMime || 'неизвестный тип'}).` };
  }
  try {
    const decoded = await loadImage(data);
    const width = Number(decoded?.width) || dimensions.width || null;
    const height = Number(decoded?.height) || dimensions.height || null;
    return {
      renderable: Boolean(width && height),
      requiresDarkSurface: false,
      lightForeground: false,
      width,
      height,
      reason: width && height ? '' : `Изображение ${url || ''} не удалось декодировать.`
    };
  } catch {
    return {
      renderable: false,
      requiresDarkSurface: false,
      lightForeground: false,
      width: dimensions.width,
      height: dimensions.height,
      reason: `Изображение ${url || ''} не удалось декодировать браузерным форматом.`
    };
  }
}

async function inspectProductionAsset(asset) {
  try {
    const document = await fetchPublicDocument(asset.previewUrl, 4_000_000);
    const mime = String(document.contentType || '').split(';')[0].trim().toLowerCase();
    const visual = await validateProductionVisualAsset(document.data, mime, document.url);
    return {
      ...asset,
      previewUrl: document.url,
      sourceUrl: document.url,
      metadata: {
        mime,
        width: visual.width,
        height: visual.height,
        bytes: document.data.length,
        license: 'needs_review',
        focalPoint: null,
        renderable: visual.renderable,
        requiresDarkSurface: visual.requiresDarkSurface,
        lightForeground: visual.lightForeground,
        validationNote: visual.reason || ''
      }
    };
  } catch (error) {
    return {
      ...asset,
      metadata: {
        mime: '', width: null, height: null, bytes: null, license: 'needs_review', focalPoint: null,
        renderable: false,
        requiresDarkSurface: false,
        lightForeground: false,
        validationNote: `Файл ассета недоступен: ${compactProductionText(error?.message || '') || 'ошибка загрузки'}.`
      }
    };
  }
}

async function inspectProductionAssets(assets) {
  // Logo candidates must never be silently displaced by large galleries.
  // Inspect the full ranked visual window: a real venue photo often comes
  // after header artwork, while the first image can be a widget icon.
  return mapWithConcurrency((assets || []).slice(0, 24), 3, inspectProductionAsset);
}

// Every image that reaches a landing slot is checked again here. DOM placement
// alone is not evidence that a file is a logo or a suitable location photo:
// third-party reservation widgets, awards, tiny icons and menu scans must not
// be promoted into the published landing.
const UNSUITABLE_LANDING_VISUAL_RE = /(?:tripadvisor|travell?er.{0,16}choice|tacdn\.com|thefork|tfstatic|opentable|resy|badge|award|certificate|watermark|cookie|consent|privacy|facebook|instagram|tiktok|whatsapp|menu(?:[-_ ](?:source|scan|pdf|image))|pdf|icon|favicon|button|reservation|booking|sponsor|partner|powered[-_ ]?by)/iu;

function productionAssetEvidence(asset) {
  return classicText([
    asset?.previewUrl,
    asset?.sourceUrl,
    asset?.label,
    asset?.evidence?.alt,
    asset?.evidence?.context
  ].filter(Boolean).join(' '));
}

function isUsableClassicLogoAsset(asset) {
  const metadata = asset?.metadata || {};
  if (!asset || !metadata.renderable || !['logo', 'site-icon'].includes(asset.kind)) return false;
  if (UNSUITABLE_LANDING_VISUAL_RE.test(productionAssetEvidence(asset))) return false;
  const mime = String(metadata.mime || '').toLowerCase();
  const isSvg = /svg/.test(mime) || /\.svg(?:[?#]|$)/i.test(asset.previewUrl || '');
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  if (!isSvg && (width < 80 || height < 28)) return false;
  return isSvg || /^image\/(?:png|jpe?g|webp|gif)$/i.test(mime);
}

function isUsableClassicLocationImage(asset) {
  const metadata = asset?.metadata || {};
  if (!asset || !metadata.renderable || !['image', 'brand-scene'].includes(asset.kind)) return false;
  if (UNSUITABLE_LANDING_VISUAL_RE.test(productionAssetEvidence(asset))) return false;
  const mime = String(metadata.mime || '').toLowerCase();
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  const ratio = width && height ? width / height : 0;
  if (!/^image\/(?:png|jpe?g|webp)$/i.test(mime)) return false;
  if (width < 240 || height < 160 || width * height < 80_000) return false;
  if (ratio < 0.45 || ratio > 2.8) return false;
  return true;
}

function isUsableClassicLocationPhotoValue(photo) {
  if (!photo?.url) return false;
  const width = Number(photo.width) || 0;
  const height = Number(photo.height) || 0;
  const ratio = width && height ? width / height : 0;
  const source = `${photo.url || ''} ${photo.sourceUrl || ''} ${photo.alt || ''}`;
  return /^image\/(?:png|jpe?g|webp)$/i.test(String(photo.mime || ''))
    && width >= 240
    && height >= 160
    && width * height >= 80_000
    && ratio >= 0.45
    && ratio <= 2.8
    && !UNSUITABLE_LANDING_VISUAL_RE.test(source);
}

function extractPhoneFromText(text) {
  const match = compactProductionText(text).match(/(?:\+|00)\d[\d\s()./-]{7,}\d/);
  return match ? match[0].trim() : '';
}

function buildSeoDrafts(cafe, language) {
  const cityDe = /вена|wien|vienna/i.test(cafe.city) ? 'Wien' : cafe.city;
  const cityEn = /вена|wien|vienna/i.test(cafe.city) ? 'Vienna' : cafe.city;
  const baseName = compactProductionText(cafe.name || 'Cafe');
  const drafts = [];
  drafts.push({
    id: 'seo-de',
    language: { code: 'de', label: 'Deutsch' },
    h1: `Menü ${baseName} in ${cityDe}`,
    title: `Menü ${baseName} in ${cityDe}`,
    description: `${baseName} in ${cityDe}: Speisekarte, Öffnungszeiten, Adresse und Kontakt auf einen Blick.`,
    sourceUrl: cafe.website,
    origin: language.detected.includes('de') ? 'official-language' : 'translation-draft',
    inputs: ['name', 'city', 'address']
  });
  drafts.push({
    id: 'seo-en',
    language: { code: 'en', label: 'English' },
    h1: `Menu ${baseName} in ${cityEn}`,
    title: `Menu ${baseName} in ${cityEn}`,
    description: `${baseName} in ${cityEn}: menu, opening hours, address and contact details in one place.`,
    sourceUrl: cafe.website,
    origin: language.detected.includes('en') ? 'official-language' : 'translation-draft',
    inputs: ['name', 'city', 'address']
  });
  return drafts;
}

function menuProductType(name) {
  if (/(espresso|kaffee|coffee|latte|cappuccino|tee|tea|limonade|wein|wine|bier|beer|drink|cola|juice|saft|brew|tonic|\u043a\u043e\u0444\u0435|\u0447\u0430\u0439|\u043a\u043e\u043a\u0442\u0435\u0439\u043b|\u0441\u043e\u043a|\u043d\u0430\u043f\u0438\u0442|\u0432\u043e\u0434\u0430|\u043f\u0438\u0432\u043e|\u0432\u0438\u043d\u043e)/i.test(name)) return 'drinks';
  return 'food';
}

function formatExtractedMenuPrice(matchText, amount) {
  const value = String(amount || '').replace(',', '.');
  if (/\bbyn\b|\bbr\b/i.test(matchText)) return `BYN ${value}`;
  if (/\brub\b/i.test(matchText)) return `RUB ${value}`;
  if (/\bhuf\b|\bft\b/i.test(matchText)) return `HUF ${value}`;
  if (/\bczk\b/i.test(matchText)) return `CZK ${value}`;
  if (/\brsd\b/i.test(matchText)) return `RSD ${value}`;
  if (/\bgbp\b|£/i.test(matchText)) return `GBP ${value}`;
  if (/\busd\b|\$/i.test(matchText)) return `USD ${value}`;
  return `EUR ${value}`;
}

function extractMenuItems($, sourceUrl) {
  const items = [];
  const seen = new Set();
  const candidates = [];
  $('li, article, p, div, section').each((_, element) => {
    const text = compactProductionText($(element).text());
    if (text.length < 8 || text.length > 220 || !/\d{1,2}[,.]\d{1,2}/.test(text)) return;
    candidates.push(text);
  });
  for (const text of candidates) {
    const priceMatch = text.match(/(?:€\s*)?(\d{1,3}[,.]\d{1,2})(?:\s*(?:€|eur|euro|£|\$|ft|huf|czk|rsd|byn|br|rub))?/i);
    if (!priceMatch) continue;
    const before = compactProductionText(text.slice(0, priceMatch.index));
    const after = compactProductionText(text.slice((priceMatch.index || 0) + priceMatch[0].length));
    let name = before.split(/(?:\s{2,}| · | \| )/).pop() || before;
    name = name.replace(/^(speisekarte|menu|menü|price|preis)\s*/i, '').replace(/[\/|–—-]\s*$/, '').trim();
    if (name.length < 3 || name.length > 70) continue;
    const key = `${name.toLowerCase()}-${priceMatch[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const productType = menuProductType(name);
    items.push({
      id: `menu-${items.length + 1}`,
      name,
      description: after.length > 4 && after.length < 90 ? after : '',
      price: formatExtractedMenuPrice(priceMatch[0], priceMatch[1]),
      productType,
      sourceUrl,
      sourceFormat: 'html'
    });
    if (items.length >= 120) break;
  }
  const drinks = items.filter((item) => item.productType === 'drinks').slice(0, 6);
  const food = items.filter((item) => item.productType === 'food').slice(0, 6);
  const picked = [...drinks, ...food];
  const pickedKeys = new Set(picked.map((item) => `${item.name}-${item.price}`));
  for (const item of items) {
    if (picked.length >= 12) break;
    const key = `${item.name}-${item.price}`;
    if (!pickedKeys.has(key)) {
      picked.push(item);
      pickedKeys.add(key);
    }
  }
  return picked.length ? picked : items.slice(0, 12);
}

function cleanExtractedMenuName(value) {
  let name = compactProductionText(value)
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    .replace(/\b0[,.]\d{2,3}l?\b/gi, ' ')
    .replace(/[|]{1,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // OCR menus frequently repeat the category heading before the first item.
  // Start at a recognisable beverage name if one is present, preserving the
  // full source name for regular dishes such as "Pensions Frühstück".
  const productStart = /\b(?:espresso|doppio|macchiato|verl[aä]ngerter|cappuccino|melange|flat\s*white|latte|cold\s*brew|chai|matcha|kurkuma|schokolade|tee|soda|limonade|cola|bier|wein|spritz|tonic|juice|saft|water)\b/i.exec(name);
  if (productStart?.index > 0) name = name.slice(productStart.index);
  return name
    .replace(/\b(?:all\s*day|speisen\s*&\s*snacks|drinks?)\b.*$/i, '')
    .replace(/\s+[A-Z]$/u, '')
    .replace(/(?:\s+[-–—]\s*|\s+)[^\p{L}\d]*$/u, '')
    .trim();
}

function cleanExtractedMenuDescription(value) {
  const text = compactProductionText(value);
  if (text.length < 4 || text.length > 120) return '';
  // Trademark/copyright glyphs in an official product name are valid content,
  // not OCR markers (for example Nutella® on Caffè Napoli's own menu).
  if (/[®©]/.test(text)) return text;
  // A string with several prices, marker remnants or a CSS-like token is not a
  // description and must not be published as one.
  if (/(?:\d+[,.]\d+.*){1,}|[{}<>@®©]|\b(?:wlan|passwort|instagram|facebook)\b/i.test(text)) return '';
  const words = text.match(/\p{L}+/gu) || [];
  const upperWords = words.filter((word) => word.length > 1 && word === word.toUpperCase());
  // Typical OCR garbage such as "HOP OVOP OPO VO OVP" must never become a
  // public dish description. Keep regular title case descriptions intact.
  if (words.length >= 3 && upperWords.length / words.length > 0.75) return '';
  return text;
}

function menuProductTypeFromSource(sourceUrl) {
  const source = String(sourceUrl || '').toLowerCase();
  if (/(?:getr(?:a|ä|ae)nke|drinks?|beverage|\btea\b|wein|wine|cocktail)/i.test(source)) return 'drinks';
  if (/(?:speisen|food|dessert|breakfast|brunch|lunch|dinner|pizza|pasta|kuchen|cake)/i.test(source)) return 'food';
  return '';
}

function menuPriceMatches(value) {
  const text = String(value || '');
  const matches = [];
  const add = (match) => {
    if (!match?.[1] || !Number.isFinite(match.index)) return;
    const key = `${match.index}:${match[1]}`;
    if (matches.some((entry) => entry.key === key)) return;
    matches.push({ key, 0: match[0], 1: match[1], index: match.index });
  };
  // Decimal prices can be written with or without an explicit currency sign.
  for (const match of text.matchAll(/(?:\u20ac\s*)?(\d{1,3}[,.]\d{1,2})(?![\d.,])(?:\s*(?:\u20ac|eur|euro|\u00a3|\$|ft|huf|czk|rsd|byn|br|rub))?/gi)) add(match);
  // Digital menus very often use compact whole-euro labels: "€3", "3€"
  // or "EUR 12". They are prices too; restricting whole numbers to a dash
  // caused an otherwise complete QR menu to appear empty on the landing.
  for (const match of text.matchAll(/(?:\u20ac\s*|\b(?:eur|euro|\u00a3|\$|ft|huf|czk|rsd|byn|br|rub)\s+)(\d{1,3})(?![\d.,])/gi)) add(match);
  for (const match of text.matchAll(/\b(\d{1,3})(?![\d.,])\s*(?:\u20ac|eur|euro|\u00a3|\$|ft|huf|czk|rsd|byn|br|rub)\b/gi)) add(match);
  // Photographic PDFs commonly print whole-euro prices as “— 12”. The former
  // extractor only recognised decimals, so it missed the majority of dishes.
  for (const match of text.matchAll(/(?:^|[\s|])[-–—]\s*(\d{1,3})(?![\d.,]\d)/g)) add(match);
  return matches.sort((left, right) => left.index - right.index);
}

function hasMenuPrice(value) {
  return menuPriceMatches(value).length > 0;
}

function looksLikeMenuIngredientText(value) {
  const text = compactProductionText(value);
  // Scanned menus often place the price at the end of an ingredient line,
  // while the actual dish name sits immediately above it.
  return /[,;]|\b(?:pomodoro|basilico|olio|mozzarella|formaggio|formaggi|crema|salsa|verdure|carne|pesce|uova?|latte|panna|farina|cipolla|aglio|extra\s+virgin|ingredient[si]?|prodott[io]|selezionat[oi]|depending|available|fresh|tomato(?:es)?|cheese|cream|sauce|vegetable|meat|fish|egg|milk)\b/i.test(text);
}

function isGenericMenuHeading(value) {
  const text = compactProductionText(value).replace(/[!?.:]+$/g, '').toLowerCase();
  return /^(?:menu|men[uù]|i\s+classici|le\s+classiche|gli\s+antipasti|antipasti|primi|secondi|contorni|pizze|pizza|dessert|dolci|bevande|drinks?|food|speisen|getr[aä]nke|wine\s*list|carta\s+dei\s+vini)$/.test(text);
}

function isLikelyMenuItemTitle(value) {
  const text = cleanExtractedMenuName(value);
  if (text.length < 3 || text.length > 82 || !/\p{L}/u.test(text) || hasMenuPrice(text)) return false;
  // Portion sizes such as "25 cl" are price-table cells, never dishes.
  if (/^\d{1,3}\s*(?:cl|ml|l|g|kg)\b/i.test(text)) return false;
  // OCR/PDF line recovery may split an ingredient sentence onto a lowercase
  // continuation line (for example "basmati").  A dish title starts with a
  // letter in title case in the source layout.
  if (!/^\p{Lu}/u.test(text)) return false;
  // Reject low-confidence OCR strings made mostly of glyph fragments.  This
  // is intentionally language-agnostic: valid Cyrillic/Latin names remain
  // letters, whereas things like "Af § So 7 7 y" do not become menu dishes.
  if (/[\\[\]{}<>|=§]/u.test(text)) return false;
  const meaningful = text.replace(/[\s\p{P}\p{N}]/gu, '');
  if (!meaningful || meaningful.length / Math.max(text.replace(/\s/g, '').length, 1) < 0.6) return false;
  const titleWords = text.match(/\p{L}+/gu) || [];
  if (titleWords.length >= 3 && titleWords.filter((word) => word.length === 1).length / titleWords.length > 0.45) return false;
  // OCR noise often consists predominantly of one/two-letter fragments
  // (for example "AE Fk Bans of").  Normal Italian/German/English menu
  // titles can contain a short article, but not an entire title made of them.
  if (titleWords.length >= 3 && titleWords.filter((word) => word.length <= 2).length / titleWords.length > 0.55) return false;
  if (isGenericMenuHeading(text) || /[,;:]/.test(text) || looksLikeMenuIngredientText(text)) return false;
  const words = text.match(/\p{L}+/gu) || [];
  if (!words.length || words.length > 9) return false;
  return !/\b(?:aperto|chiuso|closed|open|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
}

function hasUppercaseMenuTitleStyle(value) {
  const words = cleanExtractedMenuName(value).match(/\p{L}+/gu) || [];
  const upperWords = words.filter((word) => word.length > 1 && word === word.toUpperCase());
  return upperWords.length > 0 && upperWords.length / words.length >= 0.75;
}

function precedingMenuTitle(lines, index) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = cleanExtractedMenuName(lines[index - offset] || '');
    if (isLikelyMenuItemTitle(candidate)) return candidate;
  }
  return '';
}

function isMenuSectionOrSiteChrome(value) {
  const text = cleanExtractedMenuName(value).replace(/[!?.:]+$/g, '').trim();
  if (!text) return true;
  const normalized = text.toLowerCase();
  if (/^(?:combo|menu|wine|beer|lunch|dinner|brunch|breakfast|small bites|best bites|burger|pasta and rice|bowl and salads|sides|dessert|drinks|cocktails?|food|all day|main|side|sweet|extra|tutti i giorni|every day|every weekend)$/i.test(normalized) || /^combo(?:lunch|brunch|wine|beer|menu)/i.test(normalized)) return true;
  const words = text.match(/\p{L}+/gu) || [];
  const upperWords = words.filter((word) => word.length > 1 && word === word.toUpperCase());
  // Menu headings are usually printed in all caps, whereas product names in
  // the same PDFs use title case. Do not publish section headings as dishes.
  return words.length >= 2 && upperWords.length / words.length >= 0.9;
}

function extractTitleOnlyMenuItems(lines, sourceUrl, existingItems = []) {
  const items = [];
  const seen = new Set(existingItems.map((item) => String(item.name || '').toLowerCase()));
  const isImageOcrSource = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(String(sourceUrl || ''));
  // A bilingual PDF often prints an Italian (or other native) title followed
  // by its English translation.  Keep the native source value; the landing
  // already creates its own reviewed English copy.  Without this guard both
  // versions were being shown as separate dishes.
  const hasItalianMenuText = lines.filter((line) => /\b(?:con|alla|della|fritta|vegetali|salsa|pomodorini|pane|verdure|patate|piatto|insalata|bocconcini|curry)\b/i.test(line)).length >= 4;
  const isEnglishCopy = (value) => /\b(?:with|and|the|vegan|vegetarian|chicken|baked|fried|stir[- ]fried|salad|rolls|sauce|bites|rice|vegetables|cream|cheese|pasta|potatoes)\b/i.test(value);
  for (let index = 0; index < lines.length; index += 1) {
    const name = cleanExtractedMenuName(lines[index]);
    if (!isLikelyMenuItemTitle(name) || isMenuSectionOrSiteChrome(name)) continue;
    const titleWords = name.match(/\p{L}+/gu) || [];
    // A title-only fallback has no price pairing to validate it. Be stricter
    // for image OCR: two short fragments like "Ce Lo" / "Bo EY" are an OCR
    // artefact, not a confirmed dish title.
    if (isImageOcrSource && titleWords.length >= 2 && titleWords.every((word) => word.length <= 2)) continue;
    if (hasItalianMenuText && isEnglishCopy(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    // Description is accepted only if it is a text line immediately below the
    // title. A separate numeric price column is deliberately not guessed: an
    // unpaired official price is less useful than an incorrect public price.
    const nextLine = lines[index + 1] || '';
    // The next line can be the English title in a bilingual source.  Do not
    // treat it as a native-language description.
    const description = isLikelyMenuItemTitle(nextLine)
      ? ''
      : cleanExtractedMenuDescription(nextLine);
    seen.add(key);
    items.push({
      id: `menu-title-${items.length + 1}`,
      name,
      description,
      price: '',
      productType: menuProductTypeFromSource(sourceUrl) || menuProductType(name),
      sourceUrl,
      sourceFormat: 'title-only'
    });
    if (items.length >= 24) break;
  }
  return items;
}

function extractMenuItemsFromText(value, sourceUrl, sourceFormat = 'document') {
  const lines = String(value || '')
    .split(/\r?\n/)
    .map((line) => compactProductionText(line))
    .filter((line) => line.length >= 3 && line.length <= 180);
  const items = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    const priceMatches = menuPriceMatches(text);
    let priceMatch = priceMatches[0];
    // OCR occasionally places serving size before the actual price, e.g.
    // "Limonade 0.5l 5.8". Prefer the following price token in that form.
    if (priceMatch && priceMatches.length > 1) {
      const afterFirst = text.slice((priceMatch.index || 0) + priceMatch[0].length);
      if (/^[\s\])}]*\d{1,3}[,.]\d{1,2}/.test(afterFirst)) priceMatch = priceMatches[1];
    }
    if (!priceMatch) continue;
    const afterPrice = text.slice((priceMatch.index || 0) + priceMatch[0].length);
    // Do not turn counters such as "4.000 Bücher / 0 Titel lagernd" into
    // €4.00 dishes. This was the direct cause of the bogus "Über" menu item.
    const nearbyText = `${lines[index - 1] || ''} ${text} ${lines[index + 1] || ''}`;
    if (/^[\d.,]/.test(afterPrice)
      || /(?:\b(?:titel|titles?|books?|b[üu]cher|lagernd|in\s+stock|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|chiusi|closed|opening)\b|\b\d{1,2}:\d{2}\b)/i.test(nearbyText)) continue;
    const before = compactProductionText(text.slice(0, priceMatch.index));
    const after = compactProductionText(text.slice((priceMatch.index || 0) + priceMatch[0].length));
    let name = cleanExtractedMenuName(before.replace(/^(?:menu|menù|menü|speisekarte|price|prezzo|preise?)\s*/i, '').replace(/[\/|–—-]\s*$/, '').trim());
    const titleAbove = precedingMenuTitle(lines, index);
    // For image/PDF menus, prefer the compact title above an ingredient
    // sentence such as "Pomodoro, basilico, olio EVO — 11".
    if (titleAbove && (name.length < 3 || name.length > 78 || !/\p{L}/u.test(name)
      || looksLikeMenuIngredientText(name)
      || (hasUppercaseMenuTitleStyle(titleAbove) && !hasUppercaseMenuTitleStyle(name)))) {
      name = titleAbove;
    }
    if (name.length < 3 || name.length > 78 || !/\p{L}/u.test(name)) name = titleAbove;
    if (name.length < 3 || name.length > 78 || !/\p{L}/u.test(name)) continue;
    // A vertical drinks-price column in a PDF can yield rows like "25 cl 3.5".
    // It is a serving size, not a menu position.
    if (/^\d{1,3}\s*(?:cl|ml|l|g|kg)\b/i.test(name)) continue;
    // Never publish a low-confidence OCR fragment as a dish.  Image OCR is
    // useful for real scanned menus, but it also reads decorative banners as
    // strings such as "AE Fk Bans of".  A missing verified dish is preferable
    // to an invented item on the public landing.
    if (sourceFormat === 'image-ocr' && (
      !isLikelyMenuItemTitle(name)
      || isMenuSectionOrSiteChrome(name)
      // A genuine one/two-word dish can be short, but an OCR-only pair such
      // as "Ce Lo" is not enough evidence to put a public menu item online.
      || ((name.match(/\p{L}+/gu) || []).length >= 2 && (name.match(/\p{L}+/gu) || []).every((word) => word.length <= 2))
    )) continue;
    const key = `${name.toLowerCase()}-${priceMatch[1].replace(',', '.')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `menu-${items.length + 1}`,
      name,
      // Once a preceding title was selected, the text before its price is the
      // corresponding ingredient description. The next line often starts the
      // following dish and must not become a description.
      description: cleanExtractedMenuDescription(titleAbove && name === titleAbove ? before : after)
        || cleanExtractedMenuDescription(after)
        || cleanExtractedMenuDescription(lines[index + 1] || ''),
      price: formatExtractedMenuPrice(priceMatch[0], priceMatch[1]),
      // Image menus are frequently separated by category. Their filenames and
      // URLs are more reliable than a partially recognised OCR dish name.
      productType: menuProductTypeFromSource(sourceUrl) || menuProductType(name),
      sourceUrl,
      sourceFormat
    });
    if (items.length >= 120) break;
  }
  // Some official PDFs retain the product names but put prices into a separate
  // visual column. Preserve those confirmed menu positions rather than
  // returning an empty menu simply because the text layer lost its geometry.
  // Do this only for an actual document/scan. Applying the fallback to an
  // ordinary marketing page can turn headings such as "Contacts" and "Hours"
  // into fake dishes when that page has no prices.
  const sourceContainsPrice = lines.some((line) => hasMenuPrice(line));
  if (items.length < 6 && /^(?:pdf|image-ocr)$/i.test(String(sourceFormat || '')) && sourceContainsPrice) {
    items.push(...extractTitleOnlyMenuItems(lines, sourceUrl, items));
  }
  const drinks = items.filter((item) => item.productType === 'drinks').slice(0, 6);
  const food = items.filter((item) => item.productType === 'food').slice(0, 6);
  const picked = [...drinks, ...food];
  const pickedKeys = new Set(picked.map((item) => `${item.name}-${item.price}`));
  for (const item of items) {
    if (picked.length >= 12) break;
    const key = `${item.name}-${item.price}`;
    if (!pickedKeys.has(key)) {
      picked.push(item);
      pickedKeys.add(key);
    }
  }
  return picked.length ? picked : items.slice(0, 12);
}

function uniqueMenuItems(items) {
  const seen = new Set();
  const unique = items.filter((item) => {
    const key = `${item.name || ''}-${item.price || ''}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // A visual menu often has one image per category. Keep the landing balanced
  // instead of allowing the first drinks image to crowd out all food dishes.
  const drinks = unique.filter((item) => item.productType === 'drinks').slice(0, 6);
  const food = unique.filter((item) => item.productType !== 'drinks').slice(0, 6);
  const picked = [...drinks, ...food];
  const pickedKeys = new Set(picked.map((item) => `${item.name || ''}-${item.price || ''}`.toLowerCase()));
  for (const item of unique) {
    if (picked.length >= 12) break;
    const key = `${item.name || ''}-${item.price || ''}`.toLowerCase();
    if (!pickedKeys.has(key)) {
      picked.push(item);
      pickedKeys.add(key);
    }
  }
  return picked.slice(0, 12).map((item, index) => ({ ...item, id: `menu-${index + 1}` }));
}

function buildMenuByLanguage(items, language, sourceUrl) {
  const groups = [
    { id: 'drinks', label: language.native.code === 'de' ? 'Getränke' : 'Drinks', count: items.filter((item) => item.productType === 'drinks').length },
    { id: 'food', label: language.native.code === 'de' ? 'Speisen' : 'Food', count: items.filter((item) => item.productType === 'food').length }
  ].filter((group) => group.count);
  const status = items.length === 12 && groups.length >= 2 ? 'ready' : 'review-required';
  return [
    { language: language.native, sourceUrl, origin: 'official-language', status, navigationGroups: groups, items },
    {
      language: { code: 'en', label: 'English' },
      sourceUrl,
      origin: language.detected.includes('en') ? 'official-language' : 'translation-draft',
      translationFrom: language.native.code,
      status,
      navigationGroups: groups.map((group) => ({ ...group, label: group.id === 'drinks' ? 'Drinks' : 'Food' })),
      items: items.map((item) => ({ ...item, id: `${item.id}-en`, sourceFormat: language.detected.includes('en') ? item.sourceFormat : 'translation-draft' }))
    }
  ];
}

const CLASSIC_FIELD_STATUSES = new Set(['found', 'derived', 'missing', 'needs_review']);

function classicText(value) {
  return compactProductionText(String(value || '').replace(/<[^>]*>/g, ' '));
}

function classicField(value, options = {}) {
  const hasValue = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
  const requestedStatus = CLASSIC_FIELD_STATUSES.has(options.status) ? options.status : '';
  const status = requestedStatus || (hasValue ? 'found' : 'missing');
  const raw = options.raw === undefined ? (typeof value === 'string' ? value : '') : String(options.raw || '');
  return {
    value: value ?? null,
    raw,
    normalized: typeof value === 'string' ? classicText(value) : '',
    status,
    note: options.note || (status === 'missing' ? 'На подтверждённом источнике не найдено.' : ''),
    sourceUrl: options.sourceUrl || '',
    sourceLabel: options.sourceLabel || ''
  };
}

function flattenJsonLd(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenJsonLd(entry, output));
    return output;
  }
  if (value && typeof value === 'object') {
    output.push(value);
    if (value['@graph']) flattenJsonLd(value['@graph'], output);
  }
  return output;
}

function extractJsonLdBusinesses($) {
  const entries = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      flattenJsonLd(JSON.parse(raw), entries);
    } catch {
      // Некорректный JSON-LD не является подтверждённым источником.
    }
  });
  const isBusiness = (entry) => {
    const types = Array.isArray(entry?.['@type']) ? entry['@type'] : [entry?.['@type']];
    return types.some((type) => /Restaurant|FoodEstablishment|CafeOrCoffeeShop|LocalBusiness/i.test(String(type || '')));
  };
  return entries.filter(isBusiness);
}

function firstText(...values) {
  for (const value of values) {
    const text = classicText(value);
    if (text) return text;
  }
  return '';
}

function formatClassicAddress(value) {
  if (!value) return '';
  if (typeof value === 'string') return classicText(value);
  if (typeof value !== 'object') return '';
  return [value.streetAddress, value.postalCode, value.addressLocality, value.addressRegion, value.addressCountry]
    .map(classicText)
    .filter(Boolean)
    .join(', ');
}

// A website often renders the address, the opening hours and the phone number
// in one contact widget. That text is useful as evidence, but it must never be
// copied wholesale into a location field on the landing page.
const CLASSIC_ADDRESS_START_RE = /\b(?:via|viale|piazza|fondamenta|calle|corso|lungarno|borgo|strada|vicolo|largo|street|avenue|road|rue|boulevard|platz|str(?:asse|aße|\.)|ул(?:ица)?\.?|проспект|переулок|набережная)\b/giu;
// `Corso` is deliberately not a break marker: it can be part of `Via del
// Corso`, while `Via` is the true beginning of that address.
const CLASSIC_ADDRESS_BREAK_RE = /\b(?:via|viale|piazza|fondamenta|calle|lungarno|borgo|strada|vicolo|largo|street|avenue|road|rue|boulevard|platz|str(?:asse|aße|\.)|ул(?:ица)?\.?|проспект|переулок|набережная)\b/giu;
const CLASSIC_ADDRESS_NOISE_RE = /\b(?:whats?app|tel(?:ephone|efono)?|phone|mobile|e-?mail|aperti?|chiuso|open(?:ing)?|closed|orari(?:o)?|hours?|tutti\s+i\s+giorni|every\s+day|menu|menù|home|book(?:ing)?|contact(?:s| us)?|prenota(?:zione)?)\b|\b\d{1,2}:\d{2}\b/iu;
const CLASSIC_ADDRESS_STOP_RE = /\b(?:whats?app|tel(?:ephone|efono)?|phone|mobile|e-?mail|aperti?|chiuso|open(?:ing)?|closed|orari(?:o)?|hours?|tutti\s+i\s+giorni|every\s+day|menu|menù|home|book(?:ing)?|contact(?:s| us)?|prenota(?:zione)?)\b|\b\d{1,2}:\d{2}\b/iu;

function trimClassicAddress(value) {
  let text = classicText(value);
  if (!text) return '';
  const stopIndex = text.search(CLASSIC_ADDRESS_STOP_RE);
  if (stopIndex > 0) text = text.slice(0, stopIndex);
  return text
    .replace(/\s*(?:[|;]|[-–—]\s*)+\s*$/u, '')
    .replace(/\s*,\s*$/u, '')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

function isCredibleClassicAddress(value) {
  const text = classicText(value);
  if (!text || text.length < 7 || text.length > 180 || CLASSIC_ADDRESS_NOISE_RE.test(text)) return false;
  const hasStreet = new RegExp(CLASSIC_ADDRESS_START_RE.source, 'iu').test(text);
  const hasHouseNumber = /(?:^|[\s,])\d{1,5}[a-zа-я]?\b/iu.test(text);
  const hasPostcode = /\b\d{4,6}\b/u.test(text);
  return (hasStreet && hasHouseNumber) || (hasPostcode && hasHouseNumber);
}

function extractClassicAddressCandidate(value) {
  const text = classicText(value);
  if (!text) return '';
  const starts = [...text.matchAll(new RegExp(CLASSIC_ADDRESS_START_RE.source, 'giu'))]
    .map((match) => Number(match.index))
    .filter(Number.isFinite);
  const breaks = [...text.matchAll(new RegExp(CLASSIC_ADDRESS_BREAK_RE.source, 'giu'))]
    .map((match) => Number(match.index))
    .filter(Number.isFinite);
  for (const start of starts) {
    const nextAddress = breaks.find((index) => index > start + 4);
    const fragment = text.slice(start, nextAddress ?? start + 190);
    const candidate = trimClassicAddress(fragment);
    if (isCredibleClassicAddress(candidate)) return candidate;
  }
  const cleaned = trimClassicAddress(text);
  return isCredibleClassicAddress(cleaned) ? cleaned : '';
}

function normalizeE164(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s()./-]/g, '');
  const number = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : '';
}

function extractClassicLocalizations($, sourceUrl) {
  const entries = new Map();
  const add = (code, url, label, raw) => {
    const normalizedCode = normalizeLanguage(code);
    const normalizedUrl = resolveProductionUrl(url || sourceUrl, sourceUrl);
    if (!normalizedCode || !normalizedUrl || entries.has(normalizedCode)) return;
    entries.set(normalizedCode, {
      code: normalizedCode,
      label: classicText(label) || normalizedCode.toUpperCase(),
      url: normalizedUrl,
      raw: raw || `${code} ${url || sourceUrl}`
    });
  };
  add($('html').attr('lang'), sourceUrl, $('html').attr('lang'), $('html').attr('lang'));
  $('link[hreflang][href], a[hreflang][href]').each((_, element) => {
    const code = $(element).attr('hreflang');
    if (String(code).toLowerCase() === 'x-default') return;
    add(code, $(element).attr('href'), $(element).text() || code, `${code} ${$(element).attr('href') || ''}`);
  });
  return [...entries.values()];
}

function extractClassicBookingUrl($, sourceUrl) {
  let bookingUrl = '';
  let raw = '';
  $('a[href], button[data-href], [data-booking-url]').each((_, element) => {
    if (bookingUrl) return;
    const candidate = $(element).attr('href') || $(element).attr('data-href') || $(element).attr('data-booking-url') || '';
    const label = classicText(`${$(element).text()} ${$(element).attr('aria-label') || ''} ${$(element).attr('title') || ''}`);
    if (!/(book|booking|reserve|reservation|table|tisch|prenota|réserver)/i.test(label)) return;
    const url = resolveProductionUrl(candidate, sourceUrl);
    if (!url || /^(?:tel:|mailto:|javascript:)/i.test(candidate) || /google\.[^/]+\/maps/i.test(url)) return;
    bookingUrl = url;
    raw = candidate;
  });
  return classicField(bookingUrl, { raw, sourceUrl, note: bookingUrl ? '' : 'На сайте не найдена действующая ссылка бронирования.' });
}

function extractClassicLegalLinks($, sourceUrl) {
  const result = { copyright: '', privacyUrl: '', termsUrl: '', imprintUrl: '' };
  const footer = $('footer').length ? $('footer') : $('body');
  const footerText = classicText(footer.text());
  const copyright = footerText.match(/(?:©|copyright)\s*[^\n|]{0,120}/i)?.[0] || '';
  result.copyright = classicText(copyright);
  footer.find('a[href]').each((_, element) => {
    const label = classicText(`${$(element).text()} ${$(element).attr('aria-label') || ''}`);
    const url = resolveProductionUrl($(element).attr('href'), sourceUrl);
    if (!url) return;
    if (!result.privacyUrl && /privacy|datenschutz|confidentialit|privacidad/i.test(label)) result.privacyUrl = url;
    else if (!result.termsUrl && /terms|conditions|agb|услов|condizioni/i.test(label)) result.termsUrl = url;
    else if (!result.imprintUrl && /impressum|imprint|legal notice|mentions légales/i.test(label)) result.imprintUrl = url;
  });
  return result;
}

function normalizeClassicCopyrightYear(value, restaurantName = '') {
  const currentYear = new Date().getFullYear();
  const source = classicText(value);
  if (source) {
    // Do not perpetuate a year copied from the original restaurant website.
    // A generated landing belongs to the current publication year.
    if (/\b(?:19|20)\d{2}\b/.test(source)) {
      return source.replace(/\b(?:19|20)\d{2}\b/g, String(currentYear));
    }
    return source;
  }
  const name = classicText(restaurantName);
  return `© ${currentYear}${name ? ` ${name}.` : ''}`;
}

function extractClassicSocials($, sourceUrl, jsonLd) {
  const socials = new Map();
  const add = (candidate) => {
    const url = resolveProductionUrl(candidate, sourceUrl);
    if (!url) return;
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    for (const [platform, hostPattern] of SOCIAL_NETWORKS) {
      if (!hostPattern.test(parsed.hostname) || !isLikelyBusinessSocial(platform, parsed)) continue;
      if (!socials.has(platform)) socials.set(platform, { platform, url, icon: platform, sourceUrl });
    }
  };
  $('a[href]').each((_, element) => add($(element).attr('href')));
  for (const candidate of Array.isArray(jsonLd?.sameAs) ? jsonLd.sameAs : []) add(candidate);
  return [...socials.values()];
}

function classicScheduleLabel(value) {
  return classicText(value)
    .replace(/^(?:opening\s+hours?|orari\s+d['’]?apertura|Г¶ffnungszeiten|horaires|\u0440\u0435\u0436\u0438\u043c\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0433\u0440\u0430\u0444\u0438\u043a\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0447\u0430\u0441\u044b\s+\u0440\u0430\u0431\u043e\u0442\u044b)\s*[:\-–—]*/i, '')
    .replace(/[,:;\s]+$/, '')
    .trim();
}

function classicScheduleEntryLabel(value) {
  const normalized = classicScheduleLabel(value);
  const cyrillicDay = String.raw`(?:\u043f\u043d|\u0432\u0442|\u0441\u0440|\u0447\u0442|\u043f\u0442|\u0441\u0431|\u0432\u0441)\.?`;
  const cyrillicRange = new RegExp(`(${cyrillicDay}(?:\\s*(?:-|\u2013|\u2014|\u0434\u043e)\\s*${cyrillicDay})?)`, 'giu');
  const cyrillicMatches = [...normalized.matchAll(cyrillicRange)].map((match) => match[1]).filter(Boolean);
  if (cyrillicMatches.length) return cyrillicMatches.at(-1);
  return normalized;
}

function hasClassicScheduleDayLabel(value) {
  const source = ` ${classicText(value)} `;
  return /(?:^|[^\p{L}])(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lunes|martes|miercoles|jueves|viernes|sabado|domingo|daily|every\s+day|tutti\s+i\s+giorni|tous\s+les\s+jours|\u043f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a|\u0432\u0442\u043e\u0440\u043d\u0438\u043a|\u0441\u0440\u0435\u0434\u0430|\u0447\u0435\u0442\u0432\u0435\u0440\u0433|\u043f\u044f\u0442\u043d\u0438\u0446\u0430|\u0441\u0443\u0431\u0431\u043e\u0442\u0430|\u0432\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435|\u043f\u043d\.?|\u0432\u0442\.?|\u0441\u0440\.?|\u0447\u0442\.?|\u043f\u0442\.?|\u0441\u0431\.?|\u0432\u0441\.?)(?=$|[^\p{L}])/iu.test(source);
}

function extractClassicPublishedSchedule(value) {
  const text = classicText(Array.isArray(value) ? value.join(' | ') : value);
  if (!text) return [];
  const day = String.raw`(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lunes|martes|miercoles|jueves|viernes|sabado|domingo|daily|every\s+day|tutti\s+i\s+giorni|tous\s+les\s+jours|\u043f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a|\u0432\u0442\u043e\u0440\u043d\u0438\u043a|\u0441\u0440\u0435\u0434\u0430|\u0447\u0435\u0442\u0432\u0435\u0440\u0433|\u043f\u044f\u0442\u043d\u0438\u0446\u0430|\u0441\u0443\u0431\u0431\u043e\u0442\u0430|\u0432\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435|\u043f\u043d\.?|\u0432\u0442\.?|\u0441\u0440\.?|\u0447\u0442\.?|\u043f\u0442\.?|\u0441\u0431\.?|\u0432\u0441\.?)`;
  const time = String.raw`\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?`;
  const pattern = new RegExp(`(${day}(?:\\s*(?:-|–|—|to|bis|a|au|al|\u0434\u043e)\\s*${day})?)\\s*[:,-]?\\s*(${time})\\s*(?:-|–|—|to|bis|a|au|al|\u0434\u043e)\\s*(${time})`, 'giu');
  const schedule = [];
  for (const match of text.matchAll(pattern)) {
    const days = classicScheduleEntryLabel(match[1]);
    if (!days || !hasClassicScheduleDayLabel(days)) continue;
    schedule.push({ days, opens: classicText(match[2]), closes: classicText(match[3]), raw: match[0] });
  }
  return schedule.filter((entry, index, entries) => {
    const key = `${entry.days}\u0000${entry.opens}\u0000${entry.closes}`;
    return entries.findIndex((candidate) => `${candidate.days}\u0000${candidate.opens}\u0000${candidate.closes}` === key) === index;
  });
}

function extractClassicOpeningHours($, jsonLd, sourceUrl, cafe) {
  const rawSpecs = jsonLd?.openingHoursSpecification;
  const specs = Array.isArray(rawSpecs) ? rawSpecs : rawSpecs ? [rawSpecs] : [];
  const jsonLdSchedule = specs.map((entry) => {
    const days = Array.isArray(entry.dayOfWeek) ? entry.dayOfWeek : [entry.dayOfWeek];
    const label = classicScheduleLabel(days.map((day) => String(day || '').split('/').pop()).filter(Boolean).join(', '));
    const opens = classicText(entry.opens);
    const closes = classicText(entry.closes);
    return { days: label, opens, closes, raw: JSON.stringify(entry) };
  }).filter((entry) => entry.days && (entry.opens || entry.closes));
  const pageBody = $('body').clone();
  pageBody.find('script, style, noscript, svg, template').remove();
  const pageText = classicText(pageBody.text());
  const directPageSchedule = extractClassicPublishedSchedule(pageText);
  const localizedHoursMarker = pageText.search(/(?:\u0440\u0435\u0436\u0438\u043c\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0433\u0440\u0430\u0444\u0438\u043a\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0447\u0430\u0441\u044b\s+\u0440\u0430\u0431\u043e\u0442\u044b)/i);
  const hoursMarker = pageText.search(/(?:orari\s+d['’]?apertura|opening\s+hours?|öffnungszeiten|horaires|режим\s+работы)/i);
  let hoursText = localizedHoursMarker >= 0
    ? pageText.slice(localizedHoursMarker, localizedHoursMarker + 850)
    : hoursMarker >= 0 ? pageText.slice(hoursMarker, hoursMarker + 850) : '';
  if (!hoursText) {
    const localizedHoursMarker = pageText.search(/(?:\u0440\u0435\u0436\u0438\u043c\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0433\u0440\u0430\u0444\u0438\u043a\s+\u0440\u0430\u0431\u043e\u0442\u044b|\u0447\u0430\u0441\u044b\s+\u0440\u0430\u0431\u043e\u0442\u044b)/i);
    if (localizedHoursMarker >= 0) hoursText = pageText.slice(localizedHoursMarker, localizedHoursMarker + 850);
  }
  const markedPageSchedule = extractClassicPublishedSchedule(hoursText);
  const pageSchedule = directPageSchedule.length ? directPageSchedule : markedPageSchedule;
  const rawJsonHours = Array.isArray(jsonLd?.openingHours) ? jsonLd.openingHours : jsonLd?.openingHours ? [jsonLd.openingHours] : [];
  const jsonLdTextSchedule = extractClassicPublishedSchedule(rawJsonHours);
  const mapsToday = Array.isArray(cafe?.mapsOpeningHours) ? cafe.mapsOpeningHours[0] || '' : '';
  const mapsSchedule = extractClassicScheduleFromText(cafe?.mapsOpeningHours || []);
  const combinedSchedule = pageSchedule.length
    ? pageSchedule
    : jsonLdSchedule.length
      ? jsonLdSchedule
      : jsonLdTextSchedule.length
        ? jsonLdTextSchedule
        : mapsSchedule;
  if (combinedSchedule.length) {
    const sourceKind = pageSchedule.length ? 'page' : jsonLdSchedule.length || jsonLdTextSchedule.length ? 'json-ld' : 'maps';
    return classicField({ status: 'unknown', today: '', schedule: combinedSchedule, timezone: '', checkedAt: new Date().toISOString() }, {
      status: 'needs_review',
      raw: sourceKind === 'page' ? (hoursText || pageText) : sourceKind === 'json-ld' ? JSON.stringify(rawSpecs || rawJsonHours) : mapsToday,
      note: sourceKind === 'page'
        ? 'Режим извлечён из опубликованного текста сайта; проверьте актуальность сезонного расписания.'
        : sourceKind === 'json-ld'
          ? 'Расписание найдено в JSON-LD официального сайта; проверьте актуальность сезонного расписания.'
          : 'На Google Maps найдено расписание; проверьте актуальность перед публикацией.',
      sourceUrl: sourceKind === 'maps' ? cafe?.mapsUrl || '' : sourceUrl,
      sourceLabel: sourceKind === 'page' ? 'Текст официального сайта' : sourceKind === 'json-ld' ? 'JSON-LD' : 'Google Maps'
    });
  }
  return classicField(null, { status: 'missing', note: 'Режим работы на сайте и в сохранённой карточке Google Maps не найден.' });
}

function classicOpeningHoursFromMaps(cafe) {
  const rawValues = Array.isArray(cafe?.mapsOpeningHours) ? cafe.mapsOpeningHours : [];
  const schedule = extractClassicScheduleFromText(rawValues);
  if (!schedule.length) return null;
  return classicField({ status: 'unknown', today: '', schedule, timezone: '', sourceVersion: 2, checkedAt: new Date().toISOString() }, {
    status: 'needs_review',
    raw: rawValues.join(' | '),
    note: 'Расписание извлечено из карточки Google Maps.',
    sourceUrl: cafe?.mapsUrl || '',
    sourceLabel: 'Google Maps'
  });
}

function extractClassicScheduleFromText(values) {
  const source = Array.isArray(values) ? values.join(' | ') : String(values || '');
  const text = classicText(source);
  if (!text) return [];
  const time = String.raw`\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?`;
  const range = new RegExp(`(${time})\\s*(?:-|–|—|to|a|au|al|bis)\\s*(${time})`, 'gi');
  const dayWords = /(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lunes|martes|miercoles|jueves|viernes|sabado|domingo|daily|every\s+day|tutti\s+i\s+giorni|tous\s+les\s+jours)/i;
  const cyrillicDayWords = /(?:\u043f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a|\u0432\u0442\u043e\u0440\u043d\u0438\u043a|\u0441\u0440\u0435\u0434\u0430|\u0447\u0435\u0442\u0432\u0435\u0440\u0433|\u043f\u044f\u0442\u043d\u0438\u0446\u0430|\u0441\u0443\u0431\u0431\u043e\u0442\u0430|\u0432\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435|\u043f\u043d\.?|\u0432\u0442\.?|\u0441\u0440\.?|\u0447\u0442\.?|\u043f\u0442\.?|\u0441\u0431\.?|\u0432\u0441\.?)/i;
  const day = String.raw`(?:${dayWords.source}|${cyrillicDayWords.source})`;
  const result = [];
  for (const match of text.matchAll(range)) {
    const before = text.slice(Math.max(0, (match.index || 0) - 92), match.index || 0).replace(/\s+/g, ' ').trim();
    const label = before.split(/[|.!?]/).pop().trim().slice(-72);
    // A transient "open now / closes at" message without day labels is not a timetable.
    if (!dayWords.test(label) && !cyrillicDayWords.test(label)) continue;
    result.push({ days: classicScheduleEntryLabel(label), opens: classicText(match[1]), closes: classicText(match[2]), raw: match[0] });
  }
  const closedPattern = new RegExp(`(${day}(?:\\s*(?:-|–|—|to|bis|a|au|al|\\u0434\\u043e)\\s*${day})?)\\s*[:,-]?\\s*(closed|geschlossen|ferme|ferm[eé]|chiuso|cerrado|\\u0437\\u0430\\u043a\\u0440\\u044b\\u0442\\u043e)`, 'giu');
  for (const match of text.matchAll(closedPattern)) {
    const days = classicScheduleEntryLabel(match[1]);
    if (!days || !hasClassicScheduleDayLabel(days)) continue;
    result.push({ days, value: classicText(match[2]), raw: match[0] });
  }
  return result.filter((entry, index, entries) => {
    const key = `${entry.days}\u0000${classicScheduleValue(entry)}`;
    return entries.findIndex((candidate) => `${candidate.days}\u0000${classicScheduleValue(candidate)}` === key) === index;
  });
}

function classicScheduleValue(entry) {
  return classicText(entry?.value || [entry?.opens, entry?.closes].filter(Boolean).join('–'))
    .replace(/\s*(?:-|–|—)\s*/g, ' – ')
    .trim();
}

function classicScheduleSummary(openingHours, maxEntries = 3) {
  const rows = Array.isArray(openingHours?.schedule) ? openingHours.schedule : [];
  return rows
    .map((entry) => {
      const label = classicText(entry?.label || entry?.days || '');
      const value = classicScheduleValue(entry);
      return label && value ? `${label}: ${value}` : value || '';
    })
    .filter(Boolean)
    .slice(0, maxEntries)
    .join(' · ');
}

function classicPrice(value) {
  const formatted = classicText(value);
  const numeric = Number((formatted.match(/\d+(?:[.,]\d{1,2})?/) || [''])[0].replace(',', '.'));
  const currency = /€|\beur\b/i.test(formatted) ? 'EUR'
    : /\bbyn\b|\bbr\b/i.test(formatted) ? 'BYN'
      : /\brub\b/i.test(formatted) ? 'RUB'
        : /\bhuf\b|\bft\b/i.test(formatted) ? 'HUF'
          : /\bczk\b/i.test(formatted) ? 'CZK'
            : /\brsd\b/i.test(formatted) ? 'RSD'
              : /\$/i.test(formatted) ? 'USD'
                : /£/i.test(formatted) ? 'GBP' : '';
  return { formatted, value: Number.isFinite(numeric) ? numeric : null, currency };
}

function derivedAllergensForMenuName(name) {
  const text = String(name || '').toLowerCase();
  const allergens = [];
  if (/(cappuccino|latte|flat\s*white|milk|cream|panna|gelato|ice\s*cream|tiramisu|formagg|cheese|choco)/i.test(text)) allergens.push('milk');
  if (/(pizza|pasta|bread|cake|tart|pancake|waffle|croissant|profiterole|flour|pane|pinsa)/i.test(text)) allergens.push('gluten');
  if (/(egg|uova|ovo|omelette|meringue|profiterole)/i.test(text)) allergens.push('eggs');
  if (/(pistach|hazelnut|nocciol|almond|walnut|cashew|nut)/i.test(text)) allergens.push('nuts');
  if (/(soy|soia|soja)/i.test(text)) allergens.push('soy');
  return [...new Set(allergens)];
}

function generatedMenuDescription(name) {
  const normalized = classicText(name).toLowerCase();
  const knownDescriptions = [
    [/(espresso|expresso)/, 'Классический кофе на основе концентрированного эспрессо.'],
    [/(cappuccino|capuccino)/, 'Кофейный напиток на основе эспрессо и вспененного молока.'],
    [/(latte|caff[eè]\s*latte)/, 'Мягкий кофейный напиток на основе эспрессо и молока.'],
    [/(flat\s*white)/, 'Кофейный напиток на основе двойного эспрессо и молока.'],
    [/(americano)/, 'Эспрессо, дополненный горячей водой.'],
    [/(macchiato)/, 'Эспрессо с небольшим количеством молочной пены.'],
    [/(tea|t[eè]|tisana)/, 'Горячий чайный напиток.'],
    [/(water|acqua|soda)/, 'Минеральная вода или безалкогольный напиток.'],
    [/(gelato|ice\s*cream|sorbetto|sorbet)/, 'Десерт на основе мороженого.'],
    [/(waffle|waffel|gaufre)/, 'Вафельный десерт.'],
    [/(tiramisu)/, 'Классический итальянский десерт.']
  ];
  return knownDescriptions.find(([pattern]) => pattern.test(normalized))?.[1] || '';
}

function isLegacyGeneratedMenuDescription(value) {
  return /^Позиция «.+» из меню кафе\.?$/u.test(classicText(value));
}

function classicCategorySpec(categoryId) {
  const key = String(categoryId || '').replace(/^category-/, '').toLowerCase();
  const specs = {
    drinks: { label: 'Drinks', icon: 'mug-hot' },
    coffee: { label: 'Coffee', icon: 'mug-hot' },
    tea: { label: 'Tea', icon: 'mug-hot' },
    food: { label: 'Food', icon: 'utensils' },
    desserts: { label: 'Desserts', icon: 'cake-candles' },
    bakery: { label: 'Bakery', icon: 'wheat-awn' },
    wine: { label: 'Wine', icon: 'wine-glass' },
    seafood: { label: 'Seafood', icon: 'fish' }
  };
  return specs[key] || { label: '', icon: 'utensils' };
}

const CLASSIC_CATEGORY_LABELS = {
  drinks: { en: 'Drinks', de: 'Getränke', it: 'Bevande', fr: 'Boissons', es: 'Bebidas', hu: 'Italok', cs: 'Nápoje', ru: 'Напитки' },
  coffee: { en: 'Coffee', de: 'Kaffee', it: 'Caffè', fr: 'Café', es: 'Café', hu: 'Kávé', cs: 'Káva', ru: 'Кофе' },
  tea: { en: 'Tea', de: 'Tee', it: 'Tè', fr: 'Thé', es: 'Té', hu: 'Tea', cs: 'Čaj', ru: 'Чай' },
  food: { en: 'Food', de: 'Speisen', it: 'Piatti', fr: 'Plats', es: 'Platos', hu: 'Ételek', cs: 'Jídla', ru: 'Блюда' },
  desserts: { en: 'Desserts', de: 'Desserts', it: 'Dolci', fr: 'Desserts', es: 'Postres', hu: 'Desszertek', cs: 'Dezerty', ru: 'Десерты' },
  bakery: { en: 'Bakery', de: 'Backwaren', it: 'Forno', fr: 'Boulangerie', es: 'Panadería', hu: 'Pékség', cs: 'Pekařství', ru: 'Выпечка' },
  wine: { en: 'Wine', de: 'Wein', it: 'Vino', fr: 'Vins', es: 'Vinos', hu: 'Bor', cs: 'Víno', ru: 'Вино' },
  seafood: { en: 'Seafood', de: 'Meeresfrüchte', it: 'Frutti di mare', fr: 'Fruits de mer', es: 'Mariscos', hu: 'Tenger gyümölcsei', cs: 'Mořské plody', ru: 'Морепродукты' }
};

function classicCategoryLabelByLanguage(categoryId, languageCode) {
  const key = String(categoryId || '').replace(/^category-/, '').toLowerCase();
  const code = normalizeLanguage(languageCode) || 'en';
  return CLASSIC_CATEGORY_LABELS[key]?.[code]
    || CLASSIC_CATEGORY_LABELS[key]?.en
    || classicCategorySpec(key).label
    || key
    || 'Menu';
}

function classicScheduleLabelByLanguage(value, languageCode) {
  const label = classicText(value);
  if (normalizeLanguage(languageCode) !== 'en' || !label) return label;
  const replacements = [
    [/\bMontag\b/gi, 'Monday'], [/\bDienstag\b/gi, 'Tuesday'], [/\bMittwoch\b/gi, 'Wednesday'], [/\bDonnerstag\b/gi, 'Thursday'], [/\bFreitag\b/gi, 'Friday'], [/\bSamstag\b/gi, 'Saturday'], [/\bSonntag\b/gi, 'Sunday'],
    [/\bLundi\b/gi, 'Monday'], [/\bMardi\b/gi, 'Tuesday'], [/\bMercredi\b/gi, 'Wednesday'], [/\bJeudi\b/gi, 'Thursday'], [/\bVendredi\b/gi, 'Friday'], [/\bSamedi\b/gi, 'Saturday'], [/\bDimanche\b/gi, 'Sunday'],
    [/\bLuned[iì]\b/gi, 'Monday'], [/\bMarted[iì]\b/gi, 'Tuesday'], [/\bMercoled[iì]\b/gi, 'Wednesday'], [/\bGioved[iì]\b/gi, 'Thursday'], [/\bVenerd[iì]\b/gi, 'Friday'], [/\bSabato\b/gi, 'Saturday'], [/\bDomenica\b/gi, 'Sunday'],
    [/\bLunes\b/gi, 'Monday'], [/\bMartes\b/gi, 'Tuesday'], [/\bMi[eé]rcoles\b/gi, 'Wednesday'], [/\bJueves\b/gi, 'Thursday'], [/\bViernes\b/gi, 'Friday'], [/\bS[aá]bado\b/gi, 'Saturday'], [/\bDomingo\b/gi, 'Sunday'],
    [/\bпн\b/giu, 'Mon'], [/\bвт\b/giu, 'Tue'], [/\bср\b/giu, 'Wed'], [/\bчт\b/giu, 'Thu'], [/\bпт\b/giu, 'Fri'], [/\bсб\b/giu, 'Sat'], [/\bвс\b/giu, 'Sun'],
    [/\bпонедельник\b/giu, 'Monday'], [/\bвторник\b/giu, 'Tuesday'], [/\bсреда\b/giu, 'Wednesday'], [/\bчетверг\b/giu, 'Thursday'], [/\bпятница\b/giu, 'Friday'], [/\bсуббота\b/giu, 'Saturday'], [/\bвоскресенье\b/giu, 'Sunday']
  ];
  // JavaScript's \b word boundary is ASCII-oriented, so Cyrillic day
  // abbreviations need an explicit Unicode-safe delimiter check.
  const russianDays = [
    ['пн', 'Mon'], ['вт', 'Tue'], ['ср', 'Wed'], ['чт', 'Thu'], ['пт', 'Fri'], ['сб', 'Sat'], ['вс', 'Sun'],
    ['понедельник', 'Monday'], ['вторник', 'Tuesday'], ['среда', 'Wednesday'], ['четверг', 'Thursday'],
    ['пятница', 'Friday'], ['суббота', 'Saturday'], ['воскресенье', 'Sunday']
  ];
  const afterLatinTranslations = replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), label);
  return russianDays.reduce(
    (result, [source, translation]) => result.replace(new RegExp(`(^|[^\\p{L}])${source}(?=$|[^\\p{L}])`, 'giu'), `$1${translation}`),
    afterLatinTranslations
  ).replace(/\bbis\b/gi, 'to')
    .replace(/(^|[^\p{L}])до(?=$|[^\p{L}])/giu, '$1to');
}

function localizeClassicScheduleLabel(value, languageCode) {
  const code = normalizeLanguage(languageCode) || 'en';
  const weekdays = [
    { aliases: ['monday', 'montag', 'lundi', 'lunedi', 'lunes', '\u043f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a', '\u043f\u043d'], labels: { en: 'Monday', de: 'Montag', fr: 'Lundi', it: 'Lunedi', es: 'Lunes', ru: '\u041f\u043e\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a' } },
    { aliases: ['tuesday', 'dienstag', 'mardi', 'martedi', 'martes', '\u0432\u0442\u043e\u0440\u043d\u0438\u043a', '\u0432\u0442'], labels: { en: 'Tuesday', de: 'Dienstag', fr: 'Mardi', it: 'Martedi', es: 'Martes', ru: '\u0412\u0442\u043e\u0440\u043d\u0438\u043a' } },
    { aliases: ['wednesday', 'mittwoch', 'mercredi', 'mercoledi', 'miercoles', '\u0441\u0440\u0435\u0434\u0430', '\u0441\u0440'], labels: { en: 'Wednesday', de: 'Mittwoch', fr: 'Mercredi', it: 'Mercoledi', es: 'Miercoles', ru: '\u0421\u0440\u0435\u0434\u0430' } },
    { aliases: ['thursday', 'donnerstag', 'jeudi', 'giovedi', 'jueves', '\u0447\u0435\u0442\u0432\u0435\u0440\u0433', '\u0447\u0442'], labels: { en: 'Thursday', de: 'Donnerstag', fr: 'Jeudi', it: 'Giovedi', es: 'Jueves', ru: '\u0427\u0435\u0442\u0432\u0435\u0440\u0433' } },
    { aliases: ['friday', 'freitag', 'vendredi', 'venerdi', 'viernes', '\u043f\u044f\u0442\u043d\u0438\u0446\u0430', '\u043f\u0442'], labels: { en: 'Friday', de: 'Freitag', fr: 'Vendredi', it: 'Venerdi', es: 'Viernes', ru: '\u041f\u044f\u0442\u043d\u0438\u0446\u0430' } },
    { aliases: ['saturday', 'samstag', 'samedi', 'sabato', 'sabado', '\u0441\u0443\u0431\u0431\u043e\u0442\u0430', '\u0441\u0431'], labels: { en: 'Saturday', de: 'Samstag', fr: 'Samedi', it: 'Sabato', es: 'Sabado', ru: '\u0421\u0443\u0431\u0431\u043e\u0442\u0430' } },
    { aliases: ['sunday', 'sonntag', 'dimanche', 'domenica', 'domingo', '\u0432\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435', '\u0432\u0441'], labels: { en: 'Sunday', de: 'Sonntag', fr: 'Dimanche', it: 'Domenica', es: 'Domingo', ru: '\u0412\u043e\u0441\u043a\u0440\u0435\u0441\u0435\u043d\u044c\u0435' } }
  ];
  let result = classicText(value);
  for (const weekday of weekdays) {
    const aliases = weekday.aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const pattern = new RegExp(`(^|[^\\p{L}])(?:${aliases})(?=$|[^\\p{L}])`, 'giu');
    result = result.replace(pattern, (_match, prefix) => `${prefix}${weekday.labels[code] || weekday.labels.en}`);
  }
  return result;
}

function localizeClassicScheduleValue(entry, languageCode) {
  const code = normalizeLanguage(languageCode) || 'en';
  const labels = { en: 'Closed', de: 'Geschlossen', fr: 'Ferme', it: 'Chiuso', es: 'Cerrado', ru: '\u0417\u0430\u043a\u0440\u044b\u0442\u043e' };
  const raw = classicScheduleValue(entry);
  const closed = /^(?:closed|geschlossen|ferme|ferm[eé]|chiuso|cerrado|\u0437\u0430\u043a\u0440\u044b\u0442\u043e)$/iu;
  return closed.test(raw) ? (labels[code] || labels.en) : raw;
}

const translationDraftCache = new Map();

async function translateDraft(value, sourceLanguage, targetLanguage = 'en') {
  const source = compactProductionText(value);
  const sourceCode = normalizeLanguage(sourceLanguage) || 'auto';
  const targetCode = normalizeLanguage(targetLanguage) || 'en';
  if (!source || sourceCode === targetCode) return source;
  const cacheKey = `${sourceCode}\u0000${targetCode}\u0000${source}`;
  if (translationDraftCache.has(cacheKey)) return translationDraftCache.get(cacheKey);
  const operation = (async () => {
    try {
      const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
      endpoint.searchParams.set('client', 'gtx');
      endpoint.searchParams.set('sl', sourceCode);
      endpoint.searchParams.set('tl', targetCode);
      endpoint.searchParams.set('dt', 't');
      endpoint.searchParams.set('q', source);
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(8_000),
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
      const payload = await response.json();
      const translated = compactProductionText((payload?.[0] || []).map((segment) => segment?.[0] || '').join(''));
      return translated || source;
    } catch {
      // Keep the source text rather than inventing a translation when the external
      // translation service is unavailable. The item's status remains needs_review.
      return source;
    }
  })();
  translationDraftCache.set(cacheKey, operation);
  try {
    return await operation;
  } catch (error) {
    translationDraftCache.delete(cacheKey);
    throw error;
  }
}

function sourceLanguageForAddress(value, fallbackLanguage = '') {
  const text = classicText(value);
  if (/[\u0400-\u04ff]/u.test(text)) return 'ru';
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(text)) return 'auto';
  return normalizeLanguage(fallbackLanguage) || 'auto';
}

async function localizeClassicLightAddresses(classicLight, language) {
  const address = classicTemplateValue(classicLight?.model?.restaurant?.address, null);
  const sourceDisplay = classicText(address?.display);
  if (!sourceDisplay) return classicLight;

  const nativeCode = normalizeLanguage(language?.native?.code) || 'en';
  const codes = [...new Set([nativeCode, 'en', ...(Array.isArray(language?.landing) ? language.landing : [])]
    .map(normalizeLanguage)
    .filter(Boolean))];
  const sourceCode = sourceLanguageForAddress(sourceDisplay, nativeCode);
  const localizedDisplay = { ...(address.localizedDisplay || {}) };
  const missingCodes = codes.filter((code) => !classicText(localizedDisplay[code]));
  // Localisation happens as part of the asset audit. Avoid repeating remote
  // translation calls each time an already prepared landing is opened.
  await mapWithConcurrency(missingCodes, 3, async (code) => {
    localizedDisplay[code] = await translateDraft(sourceDisplay, sourceCode, code) || sourceDisplay;
  });

  address.localizedDisplay = localizedDisplay;
  // The location card deliberately points to the same factual address.  Keep the
  // localized presentation close to that source fact instead of duplicating it.
  const locationAddress = classicTemplateValue(classicLight.model.location?.address, null);
  if (locationAddress && typeof locationAddress === 'object') locationAddress.localizedDisplay = localizedDisplay;
  classicLight.components = buildClassicComponents(classicLight.model);
  return classicLight;
}

async function localizeClassicLightGeneratedNativeDescriptions(classicLight, language) {
  const nativeCode = normalizeLanguage(language?.native?.code) || 'en';
  if (!classicLight?.model?.menu?.items?.length || nativeCode === 'ru' || nativeCode === 'en') return classicLight;
  await mapWithConcurrency(classicLight.model.menu.items, 4, async (item) => {
    const native = item.translations?.[nativeCode];
    const description = classicTemplateText(native?.description);
    const isGeneratedRussianDescription = native?.description?.status === 'derived'
      && !classicTemplateText(native?.description?.raw)
      && /[А-Яа-яЁё]/u.test(description);
    if (!isGeneratedRussianDescription) return item;
    const localized = await translateDraft(description, 'ru', nativeCode);
    if (!localized || localized === description) return item;
    native.description = classicField(localized, {
      sourceUrl: item.sourceUrl || '',
      raw: description,
      status: 'derived',
      note: 'Нативное описание создано автоматически из черновика; подтвердите перед публикацией.'
    });
    return item;
  });
  classicLight.components = buildClassicComponents(classicLight.model);
  return classicLight;
}

async function enrichClassicLightEnglishDrafts(classicLight, language) {
  const nativeCode = normalizeLanguage(language?.native?.code) || 'en';
  if (!classicLight?.model?.menu?.items?.length || nativeCode === 'en') return classicLight;
  await mapWithConcurrency(classicLight.model.menu.items, 4, async (item) => {
    if (item.sourceFormat === 'template') return item;
    const native = item.translations?.[nativeCode] || item.translations?.en || {};
    const sourceName = classicTemplateText(native.name);
    const sourceDescription = classicTemplateText(native.description);
    const [name, description] = await Promise.all([
      translateDraft(sourceName, nativeCode, 'en'),
      sourceDescription ? translateDraft(sourceDescription, nativeCode, 'en') : ''
    ]);
    item.translations ||= {};
    item.translations.en = {
      name: classicField(name || sourceName || null, {
        sourceUrl: item.sourceUrl || '',
        raw: sourceName,
        status: name && name !== sourceName ? 'derived' : sourceName ? 'needs_review' : 'missing',
        note: name && name !== sourceName ? 'Английский черновик создан автоматически; подтвердите перевод.' : 'Английский перевод не получен автоматически; требуется ручная проверка.'
      }),
      description: classicField(description || sourceDescription || null, {
        sourceUrl: item.sourceUrl || '',
        raw: sourceDescription,
        status: description && description !== sourceDescription ? 'derived' : sourceDescription ? 'needs_review' : 'missing',
        note: description && description !== sourceDescription ? 'Английский черновик создан автоматически; подтвердите перевод.' : sourceDescription ? 'Английский перевод не получен автоматически; требуется ручная проверка.' : 'Описание или состав блюда не найден на официальном источнике.'
      })
    };
    return item;
  });
  classicLight.components = buildClassicComponents(classicLight.model);
  return classicLight;
}

function buildClassicMenu(documents, language, useFallback = false) {
  const extracted = uniqueMenuItems(documents.flatMap((document) => extractMenuItemsFromDocument(document)));
  const fallbackMenus = useFallback ? buildFallbackMenu(language) : [];
  const nativeCode = normalizeLanguage(language.native?.code) || 'en';
  const fallbackItems = fallbackMenus.find((entry) => entry.language?.code === nativeCode)?.items || fallbackMenus[0]?.items || [];
  const fallbackEnglishItems = fallbackMenus.find((entry) => entry.language?.code === 'en')?.items || [];
  const fallbackEnglishByBaseId = new Map(fallbackEnglishItems.map((item) => [item.baseId || item.id, item]));
  const rawItems = extracted.length ? extracted : fallbackItems.map((item) => ({
    id: item.id,
    baseId: item.baseId || item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    productType: item.productType,
    sourceUrl: '',
    sourceFormat: 'template',
    allergens: item.allergens || [],
    allergenNote: item.allergenNote || ''
  }));
  const items = rawItems.map((item, index) => {
    const price = classicPrice(item.price);
    const hasSourceDescription = Boolean(item.description) && item.sourceFormat !== 'template';
    const generatedDescription = item.description ? '' : generatedMenuDescription(item.name);
    const description = item.description || generatedDescription;
    const inferredAllergens = item.allergens?.length ? item.allergens : derivedAllergensForMenuName(item.name);
    const isFallbackItem = item.sourceFormat === 'template';
    const translation = {
      name: classicField(item.name, { sourceUrl: item.sourceUrl, raw: item.name, status: isFallbackItem ? 'derived' : 'found', note: isFallbackItem ? 'Шаблонная позиция для кафе без найденного меню.' : '' }),
      description: classicField(description || null, {
        sourceUrl: item.sourceUrl,
        raw: item.description || '',
        status: hasSourceDescription ? 'found' : generatedDescription ? 'derived' : 'missing',
        note: hasSourceDescription ? '' : generatedDescription ? 'Описание сгенерировано по названию блюда; подтвердите перед публикацией.' : 'На сайте не найдено подтверждённое описание или состав блюда.'
      })
    };
    const translations = { [nativeCode]: translation };
    if (nativeCode !== 'en') {
      const englishFallback = isFallbackItem ? fallbackEnglishByBaseId.get(item.baseId || item.id) : null;
      const englishName = englishFallback?.name || item.name;
      const englishDescription = englishFallback?.description || description || null;
      translations.en = {
        name: classicField(englishName, {
          sourceUrl: item.sourceUrl,
          raw: englishName,
          status: 'derived',
          note: isFallbackItem ? 'Стандартная английская версия создана для лендинга без меню на сайте.' : 'Английская копия создана автоматически; подтвердите перевод.'
        }),
        description: classicField(englishDescription, {
          sourceUrl: item.sourceUrl,
          raw: englishFallback?.description || item.description || '',
          status: englishDescription ? 'derived' : 'missing',
          note: englishDescription
            ? isFallbackItem ? 'Стандартная английская версия создана для лендинга без меню на сайте.' : 'Английская копия создана автоматически; подтвердите перевод.'
            : 'Описание или состав блюда не найден на официальном источнике.'
        })
      };
    }
    return {
      id: `menu-item-${index + 1}`,
      categoryId: `category-${item.productType}`,
      sourceUrl: item.sourceUrl,
      sourceFormat: item.sourceFormat,
      status: isFallbackItem || !hasSourceDescription || nativeCode !== 'en' ? 'needs_review' : 'found',
      translations,
      pricing: { native: classicField(price, { sourceUrl: item.sourceUrl, raw: item.price, status: isFallbackItem ? 'derived' : price.formatted && price.currency ? 'found' : 'needs_review', note: isFallbackItem ? 'Шаблонная цена; подтвердите перед публикацией.' : price.currency ? '' : 'Валюта цены не определена.' }) },
      image: classicField(null, { status: 'missing', note: 'Подтверждённое фото блюда не найдено.' }),
      dietaryTags: classicField([], { status: 'missing', note: 'Явные dietary-теги не найдены.' }),
      allergens: {
        items: inferredAllergens,
        allergenStatus: item.allergens?.length && !isFallbackItem ? 'verified' : 'unverified',
        status: item.allergens?.length && !isFallbackItem ? 'found' : 'derived',
        note: item.allergens?.length && !isFallbackItem ? '' : 'Аллергены заполнены автоматически; подтвердите состав перед публикацией.'
      },
      featured: classicField(false, { status: 'missing', note: 'Явный бейдж Chef’s choice / Signature не найден.' })
    };
  });
  const categories = [...new Set(items.map((item) => item.categoryId))].map((id, index) => {
    const spec = classicCategorySpec(id);
    return {
      id,
      label: spec.label || id,
      icon: spec.icon,
      order: index + 1,
      status: 'derived',
      note: 'Категория выведена из названия подтверждённой позиции; при импорте требуется проверить название.',
      itemCount: items.filter((item) => item.categoryId === id).length
    };
  });
  return {
    // Keep concise extraction diagnostics with the audit. This lets us see
    // whether a linked document was actually read, rather than mistaking the
    // presence of a menu URL for a successfully extracted menu.
    documents: documents.map((document) => ({
      url: document.url,
      format: document.format,
      textLength: String(document.text || '').trim().length,
      textPreview: String(document.text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8),
      parsedItemCount: extractMenuItemsFromDocument(document).length,
      parsedItemPreview: extractMenuItemsFromDocument(document).slice(0, 4).map((item) => item.name)
    })),
    categories,
    items,
    status: items.length ? 'needs_review' : 'missing',
    note: items.length ? (extracted.length ? 'Позиции извлечены из страниц и документов меню; категории, автодополнения и переводы требуют проверки.' : 'Использованы стандартные позиции для кафе без найденного меню; подтвердите весь контент перед публикацией.') : 'Подтверждённое меню на сайте не найдено.'
  };
}

function classicComponent(number, section, label, field, value = undefined) {
  const resolvedValue = value === undefined ? field?.value : value;
  return {
    number,
    section,
    label,
    status: field?.status || 'missing',
    value: resolvedValue,
    raw: field?.raw || '',
    normalized: field?.normalized || '',
    note: field?.note || '',
    sourceUrl: field?.sourceUrl || ''
  };
}

function classicNameFromPage($, business, cafe) {
  const isGeneric = (value) => /^(?:home(?:\s+page)?|homepage|welcome|startseite|index)$/i.test(classicText(value));
  const h1 = classicText($('h1').first().text());
  const jsonLdName = classicText(business?.name);
  const title = classicText($('title').first().text()).split(/[|—–-]/)[0].trim();
  const mapsName = classicText(cafe?.name);
  const usableH1 = isGeneric(h1) ? '' : h1;
  const usableTitle = isGeneric(title) ? '' : title;
  // The selected Google Maps place is the canonical identity. Website H1/title
  // can legitimately be a campaign headline, product name or a marketing slogan.
  const name = firstText(mapsName, usableH1, jsonLdName, usableTitle);
  const sourceUrl = mapsName ? cafe.mapsUrl : usableH1 || jsonLdName || usableTitle ? cafe.website : cafe.mapsUrl;
  return classicField(name, {
    sourceUrl,
    raw: mapsName || usableH1 || jsonLdName || usableTitle,
    status: name ? 'found' : 'missing',
    note: mapsName ? 'Название подтверждено карточкой Google Maps.' : name ? '' : 'Название не найдено.'
  });
}

function classicSubtitleFromPage($, sourceUrl, cafeName) {
  const candidates = [];
  $('header p, header h2, [class*="hero" i] p, [class*="hero" i] h2, [class*="intro" i] p, [class*="subtitle" i], .elementor-heading-title').each((_, element) => candidates.push(classicText($(element).text())));
  const value = candidates.find((text) => text.length >= 12 && text.length <= 140 && text.toLowerCase() !== String(cafeName || '').toLowerCase() && !/^(?:home(?:\s+page)?|homepage|welcome|startseite|contatti)$/i.test(text)) || '';
  return classicField(value, {
    sourceUrl,
    raw: value,
    note: value ? '' : 'Короткий оффер в hero/header не найден; описание не сгенерировано.'
  });
}

function classicRestaurantDescription($, business, sourceUrl) {
  const meta = classicText($('meta[name="description"]').first().attr('content'));
  const jsonLd = classicText(business?.description);
  const value = firstText(jsonLd, meta);
  return classicField(value, {
    sourceUrl,
    raw: jsonLd || meta,
    note: value ? 'Описание сохранено для будущих блоков; текущий шаблон его не выводит.' : 'Описание на сайте не найдено.'
  });
}

function classicContactEmail($, sourceUrl) {
  const mailto = [];
  $('a[href^="mailto:" i]').each((_, element) => {
    const email = normalizeEmail($(element).attr('href') || '');
    if (email) mailto.push(email);
  });
  if (mailto.length) return classicField([...new Set(mailto)][0], { sourceUrl, raw: mailto[0] });
  const textMatch = classicText($('body').text()).match(/[A-Z0-9._%+-]+\s*(?:@|\[at\])\s*[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = textMatch ? normalizeEmail(textMatch[0].replace(/\[at\]/i, '@').replace(/\s+/g, '')) : null;
  return classicField(email || '', {
    sourceUrl,
    raw: textMatch?.[0] || '',
    status: email ? 'needs_review' : 'missing',
    note: email ? 'E-mail найден в тексте сайта без mailto-ссылки; проверьте перед импортом.' : 'Подтверждённый e-mail на сайте не найден.'
  });
}

function classicPhone($, business, sourceUrl, cafe) {
  const context = `${cafe?.address || ''} ${cafe?.city || ''} ${sourceUrl}`;
  const fromSite = [];
  $('a[href^="tel:" i]').each((_, element) => fromSite.push($(element).attr('href') || ''));
  if (business?.telephone) fromSite.push(business.telephone);
  fromSite.push(...extractPhoneCandidates($('body').text(), context, true).map((phone) => phone.display));
  const sitePhone = normalizePhoneList(fromSite, context)[0] || null;
  const savedSitePhone = normalizePhoneList([...(cafe?.sitePhones || []), ...(cafe?.phones || [])], context)[0] || null;
  const mapsPhone = normalizePhoneList(cafe?.mapsPhones || [], context)[0] || null;
  const selected = sitePhone || savedSitePhone || mapsPhone;
  const fromMaps = !sitePhone && !savedSitePhone && Boolean(mapsPhone);
  return classicField(selected ? { display: selected.display, normalized: selected.normalized } : null, {
    sourceUrl: fromMaps ? cafe?.mapsUrl || '' : sourceUrl,
    raw: selected?.display || '',
    status: selected?.normalized ? 'found' : selected ? 'needs_review' : 'missing',
    note: selected?.normalized ? (fromMaps ? 'Телефон подтверждён карточкой Google Maps.' : 'Телефон подтверждён официальным сайтом.') : selected ? 'Номер найден, но не может быть безопасно приведён к E.164 без страны.' : 'Телефон на сайте и в сохранённой карточке Google Maps не найден.'
  });
}

function classicAddress($, business, cafe, sourceUrl) {
  const structuredAddress = extractClassicAddressCandidate(formatClassicAddress(business?.address));
  if (structuredAddress) return classicField({ display: structuredAddress, city: classicText(business?.address?.addressLocality), country: classicText(business?.address?.addressCountry), latitude: null, longitude: null }, { sourceUrl, raw: JSON.stringify(business.address), note: 'Адрес подтверждён структурированными данными официального сайта.' });

  // The saved Maps address is a confirmed source and is safer than a mixed
  // contact widget in arbitrary page text.
  const confirmedMapsAddress = extractClassicAddressCandidate(cleanProductionAddress(cafe.address));
  if (confirmedMapsAddress) return classicField({ display: confirmedMapsAddress, city: cafe.city || '', country: '', latitude: null, longitude: null }, {
    sourceUrl: cafe.mapsUrl,
    raw: confirmedMapsAddress,
    status: 'found',
    note: 'Адрес подтверждён карточкой Google Maps.'
  });

  const verifiedPageAddress = extractClassicAddressCandidate($('body').text());
  return classicField(verifiedPageAddress ? { display: verifiedPageAddress, city: cafe.city || '', country: '', latitude: null, longitude: null } : null, {
    sourceUrl,
    raw: verifiedPageAddress,
    status: verifiedPageAddress ? 'needs_review' : 'missing',
    note: verifiedPageAddress ? 'Адрес извлечён из сайта после фильтрации контактов и расписания.' : 'Адрес не найден.'
  });

  // Legacy extraction below is intentionally unreachable. It stays temporarily
  // to preserve source context while saved audits migrate through this function.
  const pageText = classicText($('body').text());
  const italianAddress = pageText.match(/(?:via|viale|piazza|fondamenta|calle|corso)\s+[^.!?]{5,120}?,\s*\d{1,5}\s*,\s*\d{5}\s+[\p{L}][\p{L}\s'’-]{1,50}?(?:\s+[A-Z]{2})?(?=\s+(?:gelateria|news|links|cookie|privacy|social|email)\b|$)/iu)?.[0] || '';
  if (italianAddress) return classicField({ display: classicText(italianAddress), city: cafe.city || '', country: '', latitude: null, longitude: null }, { sourceUrl, raw: italianAddress, note: 'Адрес извлечён из текста официального сайта.' });
  const pageAddress = pageText.match(/(?:via|viale|piazza|fondamenta|calle|corso|street|str(?:asse|aße)|avenue)\s+[^.!?]{5,150}\b\d{4,6}\s+[\p{L}][\p{L}\s'’-]{2,}/iu)?.[0] || '';
  if (pageAddress) return classicField({ display: classicText(pageAddress), city: cafe.city || '', country: '', latitude: null, longitude: null }, { sourceUrl, raw: pageAddress, note: 'Адрес извлечён из текста официального сайта.' });
  const mapsAddress = cleanProductionAddress(cafe.address);
  return classicField(mapsAddress ? { display: mapsAddress, city: cafe.city || '', country: '', latitude: null, longitude: null } : null, {
    sourceUrl: cafe.mapsUrl,
    raw: mapsAddress,
    status: mapsAddress ? 'needs_review' : 'missing',
    note: mapsAddress ? 'Адрес взят из карточки Google Maps; на официальном сайте не подтверждён.' : 'Адрес не найден.'
  });
}

function classicGoogleMapsEmbedUrl({ directionsUrl = '', latitude = null, longitude = null, address = '', name = '' } = {}) {
  const coordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { lat: latitude, lng: longitude }
    : coordinatesFromUrl(String(directionsUrl || ''));
  const query = coordinates
    ? `${coordinates.lat},${coordinates.lng}`
    : classicText([name, address].filter(Boolean).join(', '));
  if (!query) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
}

function classicMap($, cafe, sourceUrl, addressField) {
  let embedUrl = '';
  $('iframe[src]').each((_, element) => {
    if (embedUrl) return;
    const url = resolveProductionUrl($(element).attr('src'), sourceUrl);
    if (/google\.[^/]+\/maps|openstreetmap|mapbox/i.test(url)) embedUrl = url;
  });
  const directionsUrl = cleanPublicUrl(cafe.mapsUrl || '');
  const coordinates = coordinatesFromUrl(directionsUrl);
  const fallbackEmbedUrl = classicGoogleMapsEmbedUrl({
    directionsUrl,
    latitude: coordinates?.lat,
    longitude: coordinates?.lng,
    address: addressField?.value?.display || '',
    name: cafe.name || ''
  });
  const resolvedEmbedUrl = embedUrl || fallbackEmbedUrl;
  const embed = classicField(resolvedEmbedUrl, {
    sourceUrl: embedUrl ? sourceUrl : directionsUrl || sourceUrl,
    raw: resolvedEmbedUrl,
    status: embedUrl ? 'found' : fallbackEmbedUrl ? 'derived' : 'missing',
    note: embedUrl ? '' : fallbackEmbedUrl ? 'Карта сформирована из координат или адреса карточки Google Maps.' : 'Карта и координаты не найдены.'
  });
  const directions = classicField(directionsUrl, {
    sourceUrl: directionsUrl,
    raw: directionsUrl,
    status: directionsUrl ? 'found' : addressField.status === 'found' ? 'derived' : 'missing',
    note: directionsUrl ? 'Ссылка на карточку Google Maps.' : addressField.status === 'found' ? 'Можно сформировать маршрут по подтверждённому адресу.' : 'Нет ссылки для маршрута.'
  });
  return { embedUrl: embed, directionsUrl: directions, latitude: coordinates?.lat ?? null, longitude: coordinates?.lng ?? null };
}

function classicLogoFromAssets(assets) {
  // A favicon, partner badge or a broken SVG is not a safe substitute for a
  // brand mark. Keep the slot empty until a real, renderable logo passes the
  // same validation used for every other landing visual.
  const logo = (assets || []).find(isUsableClassicLogoAsset) || null;
  const metadata = logo?.metadata || {};
  const hasSafeFormat = /svg|png|webp/i.test(metadata.mime || logo?.previewUrl || '');
  const hasUsefulSize = /svg/i.test(metadata.mime || '') || (Number(metadata.width) >= 180 && Number(metadata.height) >= 60);
  const requiresDarkSurface = Boolean(metadata.requiresDarkSurface)
    || /(?:bianco|white|light|inverse|inverted|negative|negativ)/iu.test(productionAssetEvidence(logo));
  return classicField(logo ? {
    url: logo.previewUrl,
    sourceUrl: logo.sourceUrl,
    mime: metadata.mime || '',
    width: metadata.width || null,
    height: metadata.height || null,
    bytes: metadata.bytes || null,
    license: metadata.license || 'needs_review',
    focalPoint: metadata.focalPoint || null,
    presentation: requiresDarkSurface ? 'dark-surface' : 'plain',
    renderingVerified: metadata.renderable === true
  } : null, {
    sourceUrl: logo?.sourceUrl || '',
    raw: logo?.previewUrl || '',
    status: logo ? 'needs_review' : 'missing',
    note: logo
      ? `Найден визуальный кандидат${metadata.mime ? ` (${metadata.mime}${metadata.width ? `, ${metadata.width}×${metadata.height}` : ''})` : ''}. ${metadata.requiresDarkSurface ? 'Светлый SVG будет показан на контрастной подложке.' : ''} ${hasSafeFormat && hasUsefulSize ? 'Права/лицензия и focal point требуют ручной проверки.' : 'Формат или размер не соответствуют рекомендации; требуется ручная проверка.'}`
      : 'Отдельный логотип не найден.'
  });
}

function classicLocationPhotoFromAssets(assets, cafe, sourceUrl) {
  const asset = classicTemplateLocationImage(assets);
  return classicField(asset ? {
    url: asset.previewUrl,
    alt: asset.label || cafe?.name || '',
    sourceUrl: asset.sourceUrl || '',
    mime: asset.metadata?.mime || '',
    width: asset.metadata?.width || null,
    height: asset.metadata?.height || null
  } : null, {
    sourceUrl: asset?.sourceUrl || cafe?.mapsUrl || sourceUrl,
    raw: asset?.previewUrl || '',
    status: asset ? 'needs_review' : 'missing',
    note: asset
      ? 'Мини-фото для карточки локации найдено среди изображений официального сайта; перед публикацией проверьте релевантность.'
      : 'Подтверждённое мини-фото для карточки локации не найдено.'
  });
}

function classicTheme(fonts, colors, sourceUrl) {
  const hasEvidence = Boolean((fonts || []).length || (colors?.text || []).length || (colors?.surface || []).length);
  return classicField({ fonts: fonts || [], colors: colors || { text: [], surface: [] }, radii: [], backgrounds: [] }, {
    sourceUrl,
    status: hasEvidence ? 'needs_review' : 'missing',
    note: hasEvidence ? 'Цвета и шрифты найдены в CSS; лицензия шрифтов и контраст должны быть проверены перед импортом.' : 'Подтверждённые токены темы не найдены.'
  });
}

function buildClassicComponents(model) {
  const menu = model.menu;
  const hasMenuItems = menu.items.length > 0;
  const menuField = classicField(hasMenuItems ? menu.items : null, { status: hasMenuItems ? menu.status : 'missing', note: menu.note });
  const categoryField = classicField(menu.categories.length ? menu.categories : null, { status: menu.categories.length ? 'derived' : 'missing', note: menu.categories.length ? 'Категории сформированы из извлечённых позиций.' : 'Непустые категории не найдены.' });
  const descriptionField = classicField(hasMenuItems ? menu.items.map((item) => item.translations?.[Object.keys(item.translations || {})[0]]?.description?.value).filter(Boolean) : null, { status: hasMenuItems ? 'derived' : 'missing', note: hasMenuItems ? 'Описания с источником сохранены как found; пустые описания дополнены автоматически как derived.' : 'Нет позиций меню.' });
  const allergenValues = menu.items.flatMap((item) => item.allergens?.items || []);
  const allergenField = classicField(allergenValues.length ? allergenValues : hasMenuItems ? 'автоматически заполнено' : null, { status: hasMenuItems ? 'derived' : 'missing', note: hasMenuItems ? 'Аллергены, отсутствующие в источнике, заполнены автоматически и требуют проверки.' : 'Нет позиций меню.' });
  const allField = classicField('All', { status: 'derived', note: 'UI-перевод создаётся шаблоном, а не парсером.' });
  const locationField = classicField(model.map.embedUrl.value || model.restaurant.address.value ? 'location' : null, { status: model.map.embedUrl.value || model.restaurant.address.value ? 'derived' : 'missing', note: 'Контейнер локации отображается только при карте или корректном адресе.' });
  const legalField = classicField([model.footer.copyright.value, model.footer.privacyUrl.value, model.footer.termsUrl.value, model.footer.imprintUrl.value].filter(Boolean), { status: [model.footer.copyright.value, model.footer.privacyUrl.value, model.footer.termsUrl.value, model.footer.imprintUrl.value].some(Boolean) ? 'derived' : 'missing', note: 'Legal-полоса рендерится только при наличии юридического поля.' });
  return [
    classicComponent('01–02', 'Шапка', 'Логотип и брендовый lockup', model.restaurant.logo),
    classicComponent('03', 'Шапка', 'Название кафе', model.restaurant.name),
    classicComponent('04', 'Шапка', 'Подзаголовок', model.restaurant.subtitle),
    classicComponent('05', 'Шапка', 'Адрес', model.restaurant.address),
    classicComponent('06', 'Шапка', 'Телефон', model.restaurant.phone),
    classicComponent('07', 'Шапка', 'Режим работы', model.restaurant.openingHours),
    classicComponent('08', 'Шапка', 'Языки', model.localization.languages),
    classicComponent('09', 'Шапка', 'Бронирование', model.restaurant.bookingUrl),
    classicComponent('10', 'Навигация и меню', 'Контейнер категорий', categoryField),
    classicComponent('11', 'Навигация и меню', 'Кнопка All', allField),
    classicComponent('12–19', 'Навигация и меню', 'Категории меню', categoryField),
    classicComponent('20', 'Навигация и меню', 'Сетка блюд', menuField),
    classicComponent('21', 'Навигация и меню', 'Карточки блюд', menuField),
    classicComponent('22', 'Навигация и меню', 'Фото блюд', classicField(null, { status: 'missing', note: 'Фото блюд отдельно не подтверждены.' })),
    classicComponent('23', 'Навигация и меню', 'Название блюда', menuField),
    classicComponent('24', 'Навигация и меню', 'Диетические маркеры', classicField(null, { status: 'missing', note: 'Явные dietary-теги не найдены.' })),
    classicComponent('25', 'Навигация и меню', 'Базовая цена', menuField),
    classicComponent('26', 'Навигация и меню', 'Конвертация валют', classicField(null, { status: 'missing', note: 'Конвертация не рассчитывалась: нет привязанного курса.' })),
    classicComponent('27', 'Навигация и меню', 'Описание блюда', descriptionField),
    classicComponent('28', 'Навигация и меню', 'Аллергены', allergenField),
    classicComponent('29', 'Навигация и меню', 'Chef special', classicField(null, { status: 'missing', note: 'Явный бейдж Chef’s choice / Signature не найден.' })),
    classicComponent('30', 'Навигация и меню', 'Геометрия карточки', classicField('template', { status: 'derived', note: 'Геометрию задаёт шаблон, а не сайт кафе.' })),
    classicComponent('31', 'Локация', 'Контейнер локации', locationField),
    classicComponent('32', 'Локация', 'Карта', model.map.embedUrl),
    classicComponent('33', 'Карточка Google Maps', 'Название кафе', model.location.title || model.restaurant.name),
    classicComponent('34', 'Карточка Google Maps', 'Рейтинг', model.location.rating || model.restaurant.rating),
    classicComponent('35', 'Карточка Google Maps', 'Количество отзывов', model.location.reviewsCount || model.restaurant.reviewsCount),
    classicComponent('36', 'Карточка Google Maps', 'Адрес', model.location.address || model.restaurant.address),
    classicComponent('37', 'Карточка Google Maps', 'Мини-фото', model.location.miniPhoto),
    classicComponent('38', 'Карточка Google Maps', 'Часы работы', model.location.openingHours || model.restaurant.openingHours),
    classicComponent('39', 'Карточка Google Maps', 'Кнопка Directions', model.location.directions || model.map.directionsUrl),
    classicComponent('40', 'Футер', 'Контейнер футера', classicField('template', { status: 'derived', note: 'Структура футера задаётся шаблоном.' })),
    classicComponent('41', 'Футер', 'Логотип футера', model.restaurant.logo),
    classicComponent('42', 'Футер', 'Заголовок контактов', classicField('Contact us', { status: 'derived', note: 'UI-текст создаётся шаблоном.' })),
    classicComponent('43', 'Футер', 'Телефон', model.restaurant.phone),
    classicComponent('44', 'Футер', 'E-mail', model.restaurant.email),
    classicComponent('45', 'Футер', 'Сайт', model.restaurant.websiteUrl),
    classicComponent('46', 'Футер', 'Соцсети', model.restaurant.socials),
    classicComponent('47', 'Футер', 'Таблица часов', model.restaurant.openingHours),
    classicComponent('48', 'Футер', 'CTA бронирования', model.restaurant.bookingUrl),
    classicComponent('49', 'Legal-полоса', 'Контейнер legal-полосы', legalField),
    classicComponent('50', 'Legal-полоса', 'Copyright', model.footer.copyright),
    classicComponent('51', 'Legal-полоса', 'Privacy Policy', model.footer.privacyUrl),
    classicComponent('52', 'Legal-полоса', 'Terms of Service и Imprint', classicField([model.footer.termsUrl.value, model.footer.imprintUrl.value].filter(Boolean), { status: model.footer.termsUrl.value || model.footer.imprintUrl.value ? 'derived' : 'missing', note: 'Legal-ссылки «Terms of Service» и «Imprint» объединены в один слот компактной legal-полосы.' }))
  ];
}

function buildClassicLightModel({ cafe, $, url, language, business, assets, typography, colors, documents, background = null, useFallbackMenu = false }) {
  const sourceUrl = url || cafe.website || '';
  const address = classicAddress($, business, cafe, sourceUrl);
  const menu = buildClassicMenu(documents, language, useFallbackMenu);
  const legal = extractClassicLegalLinks($, sourceUrl);
  const ratingValue = finiteNumberOrNull(cafe.rating);
  const reviewValue = integerOrNull(cafe.reviewCount);
  const restaurant = {
    logo: classicLogoFromAssets(assets),
    name: classicNameFromPage($, business, cafe),
    subtitle: classicSubtitleFromPage($, sourceUrl, cafe.name),
    description: classicRestaurantDescription($, business, sourceUrl),
    address,
    phone: classicPhone($, business, sourceUrl, cafe),
    openingHours: extractClassicOpeningHours($, business, sourceUrl, cafe),
    bookingUrl: extractClassicBookingUrl($, sourceUrl),
    email: classicContactEmail($, sourceUrl),
    websiteUrl: classicField(sourceUrl, { sourceUrl, raw: sourceUrl, note: sourceUrl ? '' : 'Официальный сайт не указан.' }),
    socials: classicField(extractClassicSocials($, sourceUrl, business), { sourceUrl, note: 'Соцсети из карт и агрегаторов исключены.' }),
    category: classicField(firstText(business?.servesCuisine), { sourceUrl, raw: business?.servesCuisine || '' }),
    priceLevel: classicField(firstText(business?.priceRange), { sourceUrl, raw: business?.priceRange || '' }),
    rating: classicField(ratingValue, { sourceUrl: cafe.mapsUrl, raw: String(ratingValue || ''), note: ratingValue === null ? 'Рейтинг из разрешённого источника не сохранён.' : 'Данные карточки Google Maps.' }),
    reviewsCount: classicField(reviewValue, { sourceUrl: cafe.mapsUrl, raw: String(reviewValue || ''), note: reviewValue === null ? 'Количество отзывов из разрешённого источника не сохранено.' : 'Данные карточки Google Maps.' })
  };
  const map = classicMap($, cafe, sourceUrl, address);
  const miniPhoto = classicLocationPhotoFromAssets(assets, cafe, sourceUrl);
  const model = {
    schema: 'classic-light.import/v1',
    restaurant,
    localization: { languages: classicField(extractClassicLocalizations($, sourceUrl), { sourceUrl, note: 'Только существующие языковые версии из lang/hreflang.' }) },
    menu,
    map,
    location: {
      // Keep every visible part of the Google Maps card as an independent field.
      // This lets the audit distinguish a missing source fact from a present card shell.
      title: restaurant.name,
      rating: restaurant.rating,
      reviewsCount: restaurant.reviewsCount,
      address: restaurant.address,
      miniPhoto,
      openingHours: restaurant.openingHours,
      directions: map.directionsUrl,
      card: classicField({ name: restaurant.name.value, rating: restaurant.rating.value, reviewsCount: restaurant.reviewsCount.value, category: restaurant.category.value, priceLevel: restaurant.priceLevel.value, address: restaurant.address.value, locationImage: miniPhoto.value }, {
        sourceUrl: cafe.mapsUrl || sourceUrl,
        status: restaurant.name.value && restaurant.address.value ? 'derived' : 'needs_review',
        note: 'Карточка локации собрана из отдельных полей; каждое поле проверяется в таблице разбора отдельно.'
      })
    },
    footer: {
      copyright: classicField(normalizeClassicCopyrightYear(legal.copyright, restaurant.name?.value || cafe.name), { sourceUrl, raw: legal.copyright, status: legal.copyright ? 'found' : 'derived', note: 'Год копирайта приводится к текущему году публикации лендинга.' }),
      privacyUrl: classicField(legal.privacyUrl, { sourceUrl, raw: legal.privacyUrl }),
      termsUrl: classicField(legal.termsUrl, { sourceUrl, raw: legal.termsUrl }),
      imprintUrl: classicField(legal.imprintUrl, { sourceUrl, raw: legal.imprintUrl })
    },
    theme: classicTheme(typography.fonts, colors, sourceUrl),
    templateOptions: classicField({
      showMap: Boolean(address.value || cafe.mapsUrl),
      showAllergens: menu.items.some((item) => item.allergens?.items?.length),
      showSocials: Boolean(restaurant.socials.value?.length),
      showBookingButton: Boolean(restaurant.bookingUrl.value),
      showConvertedPrices: false,
      background: background ? classicLightBackgroundOption(background.id) : null
    }, { status: 'derived', note: 'Флаги рекомендованы по доступным данным; пустые секции выключены.' })
  };
  return { model, components: buildClassicComponents(model) };
}

function classicTemplateValue(field, fallback = null) {
  return field && Object.prototype.hasOwnProperty.call(field, 'value') ? field.value : fallback;
}

function classicTemplateText(field, fallback = '') {
  const value = classicTemplateValue(field, fallback);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function classicTemplateLocalizedAddress(value, languages) {
  const address = value && typeof value === 'object' ? value : {};
  const sourceDisplay = classicText(address.display);
  const localized = address.localizedDisplay && typeof address.localizedDisplay === 'object'
    ? address.localizedDisplay
    : {};
  return {
    ...address,
    display: Object.fromEntries((languages || []).map((language) => {
      const code = normalizeLanguage(language?.code) || 'en';
      return [code, classicText(localized[code]) || sourceDisplay];
    }))
  };
}

function classicTemplateLanguages(brand, model) {
  const native = brand?.language?.native || {};
  const nativeCode = normalizeLanguage(native.code) || 'en';
  const detected = Array.isArray(classicTemplateValue(model.localization?.languages, []))
    ? classicTemplateValue(model.localization?.languages, [])
    : [];
  const byCode = new Map();
  for (const language of [{ code: nativeCode, label: native.label || nativeCode.toUpperCase() }, { code: 'en', label: 'EN' }, ...detected]) {
    const code = String(language?.code || '').toLowerCase().trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      code,
      label: String(language?.label || code.toUpperCase()).replace(/^[a-z]{2}-/i, '').toUpperCase()
    });
  }
  return [...byCode.values()];
}

const CLASSIC_TEMPLATE_UI_TRANSLATIONS = {
  en: { bookTable: 'Book a table', all: 'All', directions: 'Directions', open: 'Open', closed: 'Closed', statusUnknown: 'Opening hours unavailable', allergens: 'Allergens', ingredients: 'Ingredients', rating: 'Rating', reviews: 'reviews', contactUs: 'Contact us', followUs: 'Follow us', openingHours: 'Opening hours', website: 'Website', privacyPolicy: 'Privacy policy', termsOfService: 'Terms of service', imprint: 'Imprint', skipToMenu: 'Skip to menu', mapUnavailable: 'Map is not available', photoUnavailable: 'Photo unavailable' },
  de: { bookTable: 'Tisch reservieren', all: 'Alle', directions: 'Route', open: 'Geöffnet', closed: 'Geschlossen', statusUnknown: 'Öffnungszeiten nicht verfügbar', allergens: 'Allergene', ingredients: 'Zutaten', rating: 'Bewertung', reviews: 'Bewertungen', contactUs: 'Kontakt', followUs: 'Folgen', openingHours: 'Öffnungszeiten', website: 'Website', privacyPolicy: 'Datenschutz', termsOfService: 'Nutzungsbedingungen', imprint: 'Impressum', skipToMenu: 'Zum Menü', mapUnavailable: 'Karte nicht verfügbar', photoUnavailable: 'Foto nicht verfügbar' },
  it: { bookTable: 'Prenota un tavolo', all: 'Tutto', directions: 'Indicazioni', open: 'Aperto', closed: 'Chiuso', statusUnknown: 'Orari non disponibili', allergens: 'Allergeni', ingredients: 'Ingredienti', rating: 'Valutazione', reviews: 'recensioni', contactUs: 'Contattaci', followUs: 'Seguici', openingHours: 'Orari di apertura', website: 'Sito web', privacyPolicy: 'Privacy', termsOfService: 'Termini di servizio', imprint: 'Note legali', skipToMenu: 'Vai al menu', mapUnavailable: 'Mappa non disponibile', photoUnavailable: 'Foto non disponibile' },
  fr: { bookTable: 'Réserver une table', all: 'Tout', directions: 'Itinéraire', open: 'Ouvert', closed: 'Fermé', statusUnknown: 'Horaires indisponibles', allergens: 'Allergènes', ingredients: 'Ingrédients', rating: 'Note', reviews: 'avis', contactUs: 'Nous contacter', followUs: 'Nous suivre', openingHours: 'Horaires', website: 'Site web', privacyPolicy: 'Confidentialité', termsOfService: 'Conditions d’utilisation', imprint: 'Mentions légales', skipToMenu: 'Aller au menu', mapUnavailable: 'Carte indisponible', photoUnavailable: 'Photo indisponible' },
  es: { bookTable: 'Reservar mesa', all: 'Todo', directions: 'Cómo llegar', open: 'Abierto', closed: 'Cerrado', statusUnknown: 'Horario no disponible', allergens: 'Alérgenos', ingredients: 'Ingredientes', rating: 'Valoración', reviews: 'reseñas', contactUs: 'Contacto', followUs: 'Síguenos', openingHours: 'Horario', website: 'Sitio web', privacyPolicy: 'Privacidad', termsOfService: 'Términos de servicio', imprint: 'Aviso legal', skipToMenu: 'Ir al menú', mapUnavailable: 'Mapa no disponible', photoUnavailable: 'Foto no disponible' },
  ru: { bookTable: 'Забронировать столик', all: 'Все', directions: 'Маршрут', open: 'Открыто', closed: 'Закрыто', statusUnknown: 'Часы работы недоступны', allergens: 'Аллергены', ingredients: 'Состав', rating: 'Оценка', reviews: 'отзывов', contactUs: 'Контакты', followUs: 'Соцсети', openingHours: 'Часы работы', website: 'Сайт', privacyPolicy: 'Конфиденциальность', termsOfService: 'Условия использования', imprint: 'Реквизиты', skipToMenu: 'К меню', mapUnavailable: 'Карта недоступна', photoUnavailable: 'Фото недоступно' },
  hu: { bookTable: 'Asztalfoglalás', all: 'Összes', directions: 'Útvonal', open: 'Nyitva', closed: 'Zárva', statusUnknown: 'Nyitvatartás nem elérhető', allergens: 'Allergének', ingredients: 'Összetevők', rating: 'Értékelés', reviews: 'értékelés', contactUs: 'Kapcsolat', followUs: 'Kövessen minket', openingHours: 'Nyitvatartás', website: 'Weboldal', privacyPolicy: 'Adatvédelem', termsOfService: 'Felhasználási feltételek', imprint: 'Impresszum', skipToMenu: 'Ugrás a menüre', mapUnavailable: 'A térkép nem érhető el', photoUnavailable: 'A fotó nem érhető el' },
  cs: { bookTable: 'Rezervovat stůl', all: 'Vše', directions: 'Trasa', open: 'Otevřeno', closed: 'Zavřeno', statusUnknown: 'Otevírací doba není k dispozici', allergens: 'Alergeny', ingredients: 'Složení', rating: 'Hodnocení', reviews: 'recenzí', contactUs: 'Kontaktujte nás', followUs: 'Sledujte nás', openingHours: 'Otevírací doba', website: 'Web', privacyPolicy: 'Soukromí', termsOfService: 'Podmínky použití', imprint: 'Tiráž', skipToMenu: 'Přejít na menu', mapUnavailable: 'Mapa není k dispozici', photoUnavailable: 'Fotka není k dispozici' }
};

function classicTemplateTranslations(nativeCode) {
  const native = normalizeLanguage(nativeCode) || 'en';
  return native === 'en'
    ? { en: CLASSIC_TEMPLATE_UI_TRANSLATIONS.en }
    : { en: CLASSIC_TEMPLATE_UI_TRANSLATIONS.en, [native]: CLASSIC_TEMPLATE_UI_TRANSLATIONS[native] || CLASSIC_TEMPLATE_UI_TRANSLATIONS.en };
}

function classicEnglishCategoryLabel(categoryId) {
  const key = String(categoryId || '').replace(/^category-/, '');
  return classicCategorySpec(key).label || key || 'Menu';
}

function classicTemplateLocationImage(assets) {
  return (assets || []).find(isUsableClassicLocationImage) || null;
}

function hydrateStoredClassicLightBrand(brand, cafe) {
  if (!brand?.classicLight?.model || !cafe) return brand;
  const copy = structuredClone(brand);
  const knownLanguageCodes = [
    ...(copy.language?.landing || []),
    ...(copy.language?.detected || []),
    copy.language?.native?.code
  ].filter(Boolean);
  // Historical audits could have silently used EN for a cafe with no website.
  // Recompute native + EN targets from the cafe location when loading them.
  copy.language = createLandingLanguages(cafe, knownLanguageCodes);
  const model = copy.classicLight.model;
  const restaurant = model.restaurant || {};
  model.restaurant = restaurant;
  const locationModel = model.location || {};
  model.location = locationModel;
  const legacyLocation = locationModel.card?.value || {};
  // Revalidate visual slots when loading a saved audit too. Old audits could
  // have selected a favicon, a partner badge or a tiny widget image before the
  // strict visual checks were added.
  restaurant.logo = classicLogoFromAssets(copy.assets || []);
  const confirmedMapsAddress = extractClassicAddressCandidate(cleanProductionAddress(cafe.address));
  if (confirmedMapsAddress) {
    restaurant.address = classicField({
      display: confirmedMapsAddress,
      city: cafe.city || '',
      country: '',
      latitude: null,
      longitude: null
    }, {
      sourceUrl: cafe.mapsUrl || '',
      raw: confirmedMapsAddress,
      status: 'found',
      note: 'Адрес подтверждён карточкой Google Maps и очищен от контактных и служебных фрагментов.'
    });
  }
  const rating = mapsRatingOrNull(cafe.rating);
  const reviewCount = mapsReviewCountOrNull(cafe.reviewCount);
  if (cafe.name) {
    restaurant.name = classicField(cafe.name, {
      sourceUrl: cafe.mapsUrl,
      raw: cafe.name,
      note: 'Название из карточки Google Maps — приоритетный источник для карточки локации.'
    });
  }
  if (mapsRatingOrNull(restaurant.rating?.value) === null && rating !== null) {
    restaurant.rating = classicField(rating, {
      sourceUrl: cafe.mapsUrl,
      raw: String(rating),
      note: 'Рейтинг из сохранённой карточки Google Maps.'
    });
  }
  if (mapsReviewCountOrNull(restaurant.reviewsCount?.value) === null && reviewCount !== null) {
    restaurant.reviewsCount = classicField(reviewCount, {
      sourceUrl: cafe.mapsUrl,
      raw: String(reviewCount),
      note: 'Количество отзывов из сохранённой карточки Google Maps.'
    });
  }
  const sourceUrl = classicTemplateText(restaurant.websiteUrl);
  const discoveredMiniPhoto = classicLocationPhotoFromAssets(copy.assets, cafe, sourceUrl);
  locationModel.title = restaurant.name;
  locationModel.rating = restaurant.rating;
  locationModel.reviewsCount = restaurant.reviewsCount;
  locationModel.address = restaurant.address;
  locationModel.openingHours = restaurant.openingHours;
  locationModel.directions = model.map?.directionsUrl || classicField(cafe.mapsUrl || '', {
    sourceUrl: cafe.mapsUrl || '',
    raw: cafe.mapsUrl || '',
    status: cafe.mapsUrl ? 'found' : 'missing',
    note: cafe.mapsUrl ? 'Ссылка на карточку Google Maps.' : 'Ссылка на маршрут не найдена.'
  });
  if (!isUsableClassicLocationPhotoValue(locationModel.miniPhoto?.value)) {
    locationModel.miniPhoto = discoveredMiniPhoto;
  }
  locationModel.card = classicField({
    name: restaurant.name?.value || cafe.name || legacyLocation.name || '',
    rating: mapsRatingOrNull(restaurant.rating?.value) ?? null,
    reviewsCount: mapsReviewCountOrNull(restaurant.reviewsCount?.value) ?? null,
    category: restaurant.category?.value || legacyLocation.category || '',
    priceLevel: restaurant.priceLevel?.value || legacyLocation.priceLevel || '',
    address: restaurant.address?.value || legacyLocation.address || null,
    locationImage: locationModel.miniPhoto?.value || null
  }, {
    sourceUrl: cafe.mapsUrl || sourceUrl,
    status: restaurant.name?.value && restaurant.address?.value ? 'derived' : 'needs_review',
    note: 'Карточка локации собрана из отдельных полей; каждое поле проверяется в таблице разбора отдельно.'
  });
  (model.menu?.categories || []).forEach((category) => {
    category.icon = category.icon || classicCategorySpec(category.id).icon;
  });
  const nativeCode = normalizeLanguage(copy.language?.native?.code) || 'en';
  const fallbackMenus = buildFallbackMenu(copy.language);
  const fallbackNativeItems = fallbackMenus.find((entry) => entry.language?.code === nativeCode)?.items || [];
  const fallbackEnglishItems = fallbackMenus.find((entry) => entry.language?.code === 'en')?.items || [];
  (model.menu?.items || []).forEach((item, index) => {
    item.translations ||= {};
    const sourceTranslation = item.translations[nativeCode] || item.translations.en || Object.values(item.translations)[0] || {};
    const nativeFallback = fallbackNativeItems[index];
    if (item.sourceFormat === 'template' && nativeFallback) {
      item.translations[nativeCode] = {
        name: classicField(nativeFallback.name, { sourceUrl: '', raw: nativeFallback.name, status: 'derived', note: 'Стандартная нативная версия создана для лендинга без меню на сайте.' }),
        description: classicField(nativeFallback.description, { sourceUrl: '', raw: nativeFallback.description, status: 'derived', note: 'Стандартная нативная версия создана для лендинга без меню на сайте.' })
      };
    } else if (!item.translations[nativeCode]) item.translations[nativeCode] = structuredClone(sourceTranslation);
    if (nativeCode !== 'en' && (item.sourceFormat === 'template' || !item.translations.en)) {
      const fallback = fallbackEnglishItems[index];
      item.translations.en = {
        name: classicField(fallback?.name || sourceTranslation.name?.value || '', {
          sourceUrl: item.sourceUrl || '',
          raw: fallback?.name || sourceTranslation.name?.value || '',
          status: 'derived',
          note: fallback ? 'Стандартная английская версия создана для лендинга без меню на сайте.' : 'Английская копия создана автоматически; подтвердите перевод.'
        }),
        description: classicField(fallback?.description || sourceTranslation.description?.value || null, {
          sourceUrl: item.sourceUrl || '',
          raw: fallback?.description || sourceTranslation.description?.value || '',
          status: fallback?.description || sourceTranslation.description?.value ? 'derived' : 'missing',
          note: fallback ? 'Стандартная английская версия создана для лендинга без меню на сайте.' : 'Английская копия создана автоматически; подтвердите перевод.'
        })
      };
    }
    Object.values(item.translations || {}).forEach((translation) => {
      if (!isLegacyGeneratedMenuDescription(translation?.description?.value)) return;
      translation.description = {
        ...translation.description,
        value: null,
        normalized: '',
        raw: '',
        status: 'missing',
        note: 'На сайте не найдено подтверждённое описание или состав блюда.'
      };
    });
  });
  copy.classicLight.components = buildClassicComponents(model);
  return copy;
}

async function refreshStoredClassicOpeningHours(brand, cafe) {
  if (!brand?.classicLight?.model) return brand;
  const mapsOpeningHours = classicOpeningHoursFromMaps(cafe);
  if (mapsOpeningHours) {
    const copy = structuredClone(brand);
    copy.classicLight.model.restaurant.openingHours = mapsOpeningHours;
    copy.classicLight.model.location ||= {};
    copy.classicLight.model.location.openingHours = mapsOpeningHours;
    copy.classicLight.components = buildClassicComponents(copy.classicLight.model);
    return copy;
  }
  const currentHours = brand?.classicLight?.model?.restaurant?.openingHours?.value;
  if (Array.isArray(currentHours?.schedule) && currentHours.schedule.length && currentHours.schedule.every((entry) => hasClassicScheduleDayLabel(entry?.label || entry?.days))) return brand;
  // A cafe with a Maps card is refreshed from the published Maps timetable.
  // Do not turn a temporary Maps delay into a long website crawl while a saved
  // landing is opening; the next extraction performs the retry.
  if (cafe?.mapsUrl) return brand;
  const sourceUrl = classicTemplateText(brand?.classicLight?.model?.restaurant?.websiteUrl) || cafe?.website || '';
  if (!sourceUrl) return brand;
  try {
    const { url, html } = await fetchPublicHtml(sourceUrl);
    const $ = cheerio.load(html);
    const business = extractJsonLdBusinesses($)[0] || {};
    const openingHours = extractClassicOpeningHours($, business, url, { ...cafe, website: url });
    if (!Array.isArray(openingHours?.value?.schedule) || !openingHours.value.schedule.length) return brand;
    const copy = structuredClone(brand);
    copy.classicLight.model.restaurant.openingHours = openingHours;
    copy.classicLight.model.location ||= {};
    copy.classicLight.model.location.openingHours = openingHours;
    copy.classicLight.components = buildClassicComponents(copy.classicLight.model);
    return copy;
  } catch {
    // The published site may be temporarily unavailable. Keep the saved audit;
    // never substitute an unverified "open now" status for a schedule.
    return brand;
  }
}

function buildClassicLightTemplateContent(brand) {
  const model = brand?.classicLight?.model;
  if (!model) return null;

  const restaurant = model.restaurant || {};
  const map = model.map || {};
  const footer = model.footer || {};
  const menu = model.menu || {};
  const location = model.location || {};
  const nativeLanguage = normalizeLanguage(brand?.language?.native?.code) || 'en';
  const logo = classicTemplateValue(restaurant.logo);
  const address = classicTemplateValue(restaurant.address);
  const phone = classicTemplateValue(restaurant.phone);
  const hours = classicTemplateValue(restaurant.openingHours);
  const options = classicTemplateValue(model.templateOptions, {});
  const locationPhoto = classicTemplateValue(model.location?.miniPhoto);
  const locationAsset = classicTemplateLocationImage(brand.assets);
  const languages = classicTemplateLanguages(brand, model);
  const templateAddress = classicTemplateLocalizedAddress(address, languages);
  const locationAddress = classicTemplateLocalizedAddress(classicTemplateValue(location.address) || address, languages);
  // Keep the schedule as a language-aware value. The template has to render the
  // same confirmed timetable for both the native and English landing versions.
  const templateOpeningHours = {
    status: hours?.status || 'unknown',
    // The template intentionally renders a published timetable only.
    // "Open now" values from Maps are volatile and are not a schedule.
    todayLabel: '',
    schedule: (hours?.schedule || []).map((entry) => {
      const sourceLabel = entry.label || entry.days || '';
      return {
        label: Object.fromEntries(languages.map((language) => [
          language.code,
          localizeClassicScheduleLabel(sourceLabel, language.code)
        ])),
        value: Object.fromEntries(languages.map((language) => [
          language.code,
          localizeClassicScheduleValue(entry, language.code)
        ]))
      };
    }).filter((entry) => Object.values(entry.label).some(Boolean) || entry.value)
  };
  const mapDirectionsUrl = classicTemplateText(map.directionsUrl);
  const mapEmbedUrl = classicTemplateText(map.embedUrl) || classicGoogleMapsEmbedUrl({
    directionsUrl: mapDirectionsUrl,
    latitude: Number.isFinite(map.latitude) ? map.latitude : null,
    longitude: Number.isFinite(map.longitude) ? map.longitude : null,
    address: address?.display || '',
    name: classicTemplateText(restaurant.name)
  });

  const content = {
    template: { id: 'classic-light', version: '1.2.0' },
    restaurant: {
      name: classicTemplateText(restaurant.name),
      subtitle: classicTemplateText(restaurant.subtitle),
      description: classicTemplateText(restaurant.description),
      logo: logo?.url ? {
        src: logo.url,
        alt: classicTemplateText(restaurant.name),
        presentation: logo.presentation === 'dark-surface' ? 'dark-surface' : 'plain',
        renderingVerified: logo.renderingVerified === true
      } : null,
      websiteUrl: classicTemplateText(restaurant.websiteUrl),
      phone: phone?.display ? { display: phone.display, normalized: phone.normalized || '' } : { display: '', normalized: '' },
      email: classicTemplateText(restaurant.email),
      address: address?.display ? templateAddress : { display: '', city: '', country: '', latitude: null, longitude: null },
      openingHours: templateOpeningHours,
      bookingUrl: classicTemplateText(restaurant.bookingUrl),
      rating: classicTemplateValue(restaurant.rating),
      reviewsCount: classicTemplateValue(restaurant.reviewsCount),
      category: classicTemplateText(restaurant.category),
      priceLevel: classicTemplateText(restaurant.priceLevel),
      locationImage: locationPhoto?.url
        ? { src: locationPhoto.url, alt: locationPhoto.alt || classicTemplateText(restaurant.name) }
        : locationAsset?.previewUrl ? { src: locationAsset.previewUrl, alt: locationAsset.label || classicTemplateText(restaurant.name) } : null,
      socials: Array.isArray(classicTemplateValue(restaurant.socials, [])) ? classicTemplateValue(restaurant.socials, []) : []
    },
    localization: {
      nativeLanguage,
      activeLanguage: nativeLanguage,
      languages,
      translations: classicTemplateTranslations(nativeLanguage)
    },
    menu: {
      categories: (menu.categories || []).map((category, index) => ({
        id: category.id,
        label: Object.fromEntries(languages.map((language) => [
          language.code,
          classicCategoryLabelByLanguage(category.id, language.code)
        ])),
        icon: category.icon || classicCategorySpec(category.id).icon,
        order: Number(category.order) || index + 1
      })),
      items: (menu.items || []).map((item) => {
        const translations = Object.fromEntries(Object.entries(item.translations || {}).map(([code, translation]) => [code, {
          name: classicTemplateText(translation?.name),
          description: classicTemplateText(translation?.description)
        }]));
        const image = classicTemplateValue(item.image);
        const nativePrice = classicTemplateValue(item.pricing?.native, {});
        return {
          id: item.id,
          categoryId: item.categoryId,
          translations,
          pricing: { native: nativePrice || {} },
          image: image?.url ? { src: image.url, alt: translations[nativeLanguage]?.name || '', focalPoint: image.focalPoint || '50% 50%' } : null,
          dietaryTags: Array.isArray(classicTemplateValue(item.dietaryTags, [])) ? classicTemplateValue(item.dietaryTags, []) : [],
          allergens: classicAllergenTranslations(
            Array.isArray(item.allergens?.items) ? item.allergens.items : [],
            languages.map((language) => language.code)
          ),
          allergenStatus: item.allergens?.allergenStatus || 'unverified',
          featured: Boolean(classicTemplateValue(item.featured, false))
        };
      })
    },
    map: {
      provider: mapEmbedUrl ? 'google-maps' : '',
      embedUrl: mapEmbedUrl,
      directionsUrl: mapDirectionsUrl,
      latitude: Number.isFinite(map.latitude) ? map.latitude : null,
      longitude: Number.isFinite(map.longitude) ? map.longitude : null,
      markerLabel: classicTemplateText(restaurant.name)
    },
    // The landing consumes these facts independently so the Google Maps card can
    // be reconstructed deterministically rather than from one opaque “card” field.
    locationCard: {
      name: classicTemplateText(location.title) || classicTemplateText(restaurant.name),
      rating: classicTemplateValue(location.rating) ?? classicTemplateValue(restaurant.rating),
      reviewsCount: classicTemplateValue(location.reviewsCount) ?? classicTemplateValue(restaurant.reviewsCount),
      address: locationAddress,
      miniPhoto: locationPhoto?.url ? { src: locationPhoto.url, alt: locationPhoto.alt || classicTemplateText(restaurant.name) } : null,
      openingHours: templateOpeningHours,
      directionsUrl: classicTemplateText(location.directions) || classicTemplateText(map.directionsUrl)
    },
    templateOptions: {
      showIngredients: false,
      showAllergens: Boolean(options?.showAllergens),
      showConvertedPrices: Boolean(options?.showConvertedPrices),
      showMap: Boolean(options?.showMap),
      showSocials: Boolean(options?.showSocials),
      showBookingButton: Boolean(options?.showBookingButton),
      stickyCategories: true,
      menuDensity: 'comfortable',
      background: options?.background?.imageUrl ? classicLightBackgroundOption(options.background.id) : null
    },
    footer: {
      copyright: classicTemplateText(footer.copyright),
      privacyUrl: classicTemplateText(footer.privacyUrl),
      termsUrl: classicTemplateText(footer.termsUrl),
      imprintUrl: classicTemplateText(footer.imprintUrl)
    }
  };
  return content;
}

function escapeStandaloneHtml(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

async function buildClassicLightStandaloneDocument(brand) {
  const content = buildClassicLightTemplateContent(brand);
  if (!content) return null;
  return buildClassicLightStandaloneDocumentFromContent(content);
}

async function buildClassicLightStandaloneDocumentFromContent(content) {
  if (!content || typeof content !== 'object') throw new Error('Classic Light content is required.');
  const templateDirectory = path.join(__dirname, 'public', 'templates', 'classic-light');
  const [css, script] = await Promise.all([
    fs.readFile(path.join(templateDirectory, 'template.css'), 'utf8'),
    fs.readFile(path.join(templateDirectory, 'template.js'), 'utf8')
  ]);
  const resolvedContent = structuredClone({ ...content, __classicLightResolved: true });
  const selectedBackground = resolvedContent.templateOptions?.background;
  if (selectedBackground?.id) {
    const embeddedBackground = await classicLightBackgroundDataUrl(selectedBackground.id);
    if (embeddedBackground) selectedBackground.imageUrl = embeddedBackground;
    else resolvedContent.templateOptions.background = null;
  }
  const language = String(content.localization?.activeLanguage || content.localization?.nativeLanguage || 'en').replace(/[^a-zA-Z-]/gu, '') || 'en';
  const restaurantName = String(content.restaurant?.name || 'Restaurant menu').trim() || 'Restaurant menu';
  const title = `${restaurantName} · Menu`;
  const escapedContent = JSON.stringify(resolvedContent).replace(/<\//gu, '<\\/');
  const escapedCss = css.replace(/<\/style/giu, '<\\/style');
  const escapedScript = script.replace(/<\/script/giu, '<\\/script');
  return `<!doctype html><html lang="${escapeStandaloneHtml(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeStandaloneHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" referrerpolicy="no-referrer"><style>${escapedCss}</style></head><body><a class="skip-link" href="#menu-content"></a><div class="site" data-template="classic-light" data-state="loading"><header class="site-header" data-component="header"></header><main class="site-main-area"><div class="site-main" id="menu-content"><nav class="category-navigation" data-component="category-navigation"></nav><section class="menu-section" data-component="menu-section"></section><section class="location-section" data-component="location-section"></section></div></main><footer class="site-footer" data-component="footer"></footer><div class="legal-bar" data-component="legal-bar"></div></div><script id="template-content" type="application/json">${escapedContent}</script><script>${escapedScript}</script></body></html>`;
}

function buildClassicMenuByLanguage(menu, language) {
  const nativeCode = language.native?.code || 'en';
  const displayMenu = (code, isEnglishCopy) => {
    const items = (menu.items || []).map((item) => {
      const translation = item.translations?.[code] || item.translations?.[nativeCode] || {};
      const category = String(item.categoryId || '').replace(/^category-/, '') || 'food';
      const allergens = classicLocalizedAllergens(item.allergens?.items || [], code);
      return {
        id: `${item.id}-${code}`,
        name: translation.name?.value || '',
        description: translation.description?.value || '',
        price: item.pricing?.native?.value?.formatted || '',
        productType: category,
        sourceUrl: item.sourceUrl || '',
        sourceFormat: item.sourceFormat || '',
        allergens,
        allergenNote: item.allergens?.status === 'found' ? '' : 'Аллергены добавлены автоматически — подтвердите перед публикацией.',
        status: item.status,
        generated: Boolean(isEnglishCopy || translation.name?.status === 'derived' || translation.description?.status === 'derived' || item.allergens?.status === 'derived')
      };
    });
    const categories = (menu.categories || []).map((category) => ({
      id: String(category.id || '').replace(/^category-/, ''),
      label: classicCategoryLabelByLanguage(category.id, code),
      count: Number(category.itemCount) || items.filter((item) => item.productType === String(category.id || '').replace(/^category-/, '')).length
    })).filter((category) => category.count > 0);
    return {
      language: { code, label: code === 'en' ? 'English' : language.native?.label || code.toUpperCase() },
      sourceUrl: menu.documents?.[0]?.url || '',
      origin: isEnglishCopy ? 'translation-draft' : 'classic-light-source',
      status: menu.status === 'found' ? 'ready' : 'review-required',
      disclaimer: 'Автодополненные описания, аллергены и английская версия отмечены как требующие проверки перед публикацией.',
      navigationGroups: categories,
      items
    };
  };
  const menus = [displayMenu(nativeCode, false)];
  if (nativeCode !== 'en') menus.push(displayMenu('en', true));
  return menus;
}

const FALLBACK_MENU_BASE = [
  { id: 'espresso', category: 'drinks', price: '€ 3,20', allergens: [] },
  { id: 'espresso-doppio', category: 'drinks', price: '€ 4,50', allergens: [] },
  { id: 'cappuccino', category: 'drinks', price: '€ 4,90', allergens: ['milk'] },
  { id: 'caffe-latte', category: 'drinks', price: '€ 5,70', allergens: ['milk'] },
  { id: 'flat-white', category: 'drinks', price: '€ 5,70', allergens: ['milk'] },
  { id: 'soda', category: 'drinks', price: '€ 3,80', allergens: [] },
  { id: 'pizza-nocciolata', category: 'desserts', price: '€ 12,90', allergens: ['gluten', 'milk', 'nuts', 'soy'], veganOption: true },
  { id: 'profiteroles', category: 'desserts', price: '€ 6,90', allergens: ['gluten', 'eggs', 'milk', 'soy'] },
  { id: 'limone-ripieno', category: 'desserts', price: '€ 6,90', allergens: [] },
  { id: 'cassata-pistachio', category: 'desserts', price: '€ 6,90', allergens: ['gluten', 'eggs', 'milk', 'nuts'] },
  { id: 'cocco-ripieno', category: 'desserts', price: '€ 6,90', allergens: [] },
  { id: 'tartufo-scuro', category: 'desserts', price: '€ 5,90', allergens: ['milk', 'soy'] }
];

const FALLBACK_MENU_COPY = {
  en: {
    label: 'English', groups: { drinks: 'Drinks', desserts: 'Desserts' }, noAllergens: 'No regulated allergens in the standard recipe',
    disclaimer: 'Typical allergens for the standard recipe. Confirm ingredients and cross-contact risk before publishing.',
    items: {
      espresso: ['Espresso', 'Classic Italian espresso'], 'espresso-doppio': ['Espresso Doppio', 'Double espresso'], cappuccino: ['Cappuccino', 'Classic cappuccino'], 'caffe-latte': ['Caffè Latte', 'Italian-style latte'], 'flat-white': ['Flat White', 'Australian-style coffee'], soda: ['Sparkling Water', 'Sparkling mineral water'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Nutella pizza to share; vegan option available'], profiteroles: ['Profiteroles', 'Classic Italian cream profiteroles'], 'limone-ripieno': ['Limone Ripieno', 'Filled lemon sorbet'], 'cassata-pistachio': ['Cassata al Pistacchio', 'Sicilian pistachio ice-cream cake'], 'cocco-ripieno': ['Cocco Ripieno', 'Filled coconut sorbet'], 'tartufo-scuro': ['Tartufo Scuro', 'Dark-chocolate truffle ice cream']
    }, allergens: { gluten: 'gluten (wheat)', eggs: 'eggs', milk: 'milk', nuts: 'nuts', soy: 'soy' }
  },
  de: {
    label: 'Deutsch', groups: { drinks: 'Getränke', desserts: 'Desserts' }, noAllergens: 'Keine kennzeichnungspflichtigen Allergene im Standardrezept',
    disclaimer: 'Typische Allergene des Standardrezepts. Zutaten und Kreuzkontakt vor der Veröffentlichung bestätigen.',
    items: {
      espresso: ['Espresso', 'Klassischer italienischer Espresso'], 'espresso-doppio': ['Espresso Doppio', 'Doppelter Espresso'], cappuccino: ['Cappuccino', 'Klassischer Cappuccino'], 'caffe-latte': ['Caffè Latte', 'Italienischer Milchkaffee'], 'flat-white': ['Flat White', 'Kaffee nach australischer Art'], soda: ['Sodawasser', 'Kohlensäurehaltiges Mineralwasser'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Nutella-Pizza zum Teilen; vegane Option verfügbar'], profiteroles: ['Profiteroles', 'Klassische italienische Windbeutel mit Creme'], 'limone-ripieno': ['Limone Ripieno', 'Gefülltes Zitronensorbet'], 'cassata-pistachio': ['Cassata al Pistacchio', 'Sizilianische Pistazien-Eistorte'], 'cocco-ripieno': ['Cocco Ripieno', 'Gefülltes Kokos-Sorbet'], 'tartufo-scuro': ['Tartufo Scuro', 'Dunkles Schokoladen-Trüffeleis']
    }, allergens: { gluten: 'Gluten (Weizen)', eggs: 'Eier', milk: 'Milch', nuts: 'Schalenfrüchte', soy: 'Soja' }
  },
  it: {
    label: 'Italiano', groups: { drinks: 'Bevande', desserts: 'Dolci' }, noAllergens: 'Nessun allergene regolamentato nella ricetta standard',
    disclaimer: 'Allergeni tipici della ricetta standard. Confermare ingredienti e rischio di contaminazione prima della pubblicazione.',
    items: {
      espresso: ['Espresso', 'Classico espresso italiano'], 'espresso-doppio': ['Espresso Doppio', 'Doppio espresso'], cappuccino: ['Cappuccino', 'Cappuccino classico'], 'caffe-latte': ['Caffè Latte', 'Latte in stile italiano'], 'flat-white': ['Flat White', 'Caffè in stile australiano'], soda: ['Acqua frizzante', 'Acqua minerale gassata'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Pizza alla Nutella da condividere; disponibile opzione vegana'], profiteroles: ['Profiteroles', 'Classici profiteroles italiani alla crema'], 'limone-ripieno': ['Limone Ripieno', 'Sorbetto al limone ripieno'], 'cassata-pistachio': ['Cassata al Pistacchio', 'Torta gelato siciliana al pistacchio'], 'cocco-ripieno': ['Cocco Ripieno', 'Sorbetto al cocco ripieno'], 'tartufo-scuro': ['Tartufo Scuro', 'Gelato al tartufo di cioccolato fondente']
    }, allergens: { gluten: 'glutine (grano)', eggs: 'uova', milk: 'latte', nuts: 'frutta a guscio', soy: 'soia' }
  },
  fr: {
    label: 'Français', groups: { drinks: 'Boissons', desserts: 'Desserts' }, noAllergens: 'Aucun allergène réglementé dans la recette standard',
    disclaimer: 'Allergènes typiques de la recette standard. Confirmer les ingrédients et le risque de contamination avant publication.',
    items: {
      espresso: ['Espresso', 'Espresso italien classique'], 'espresso-doppio': ['Espresso Doppio', 'Double espresso'], cappuccino: ['Cappuccino', 'Cappuccino classique'], 'caffe-latte': ['Caffè Latte', 'Latte à l’italienne'], 'flat-white': ['Flat White', 'Café de style australien'], soda: ['Eau pétillante', 'Eau minérale gazeuse'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Pizza au Nutella à partager ; option vegan disponible'], profiteroles: ['Profiteroles', 'Profiteroles italiennes classiques à la crème'], 'limone-ripieno': ['Limone Ripieno', 'Sorbet citron fourré'], 'cassata-pistachio': ['Cassata à la pistache', 'Gâteau glacé sicilien à la pistache'], 'cocco-ripieno': ['Cocco Ripieno', 'Sorbet coco fourré'], 'tartufo-scuro': ['Tartufo Scuro', 'Glace truffe au chocolat noir']
    }, allergens: { gluten: 'gluten (blé)', eggs: 'œufs', milk: 'lait', nuts: 'fruits à coque', soy: 'soja' }
  },
  es: {
    label: 'Español', groups: { drinks: 'Bebidas', desserts: 'Postres' }, noAllergens: 'Sin alérgenos regulados en la receta estándar',
    disclaimer: 'Alérgenos típicos de la receta estándar. Confirma ingredientes y riesgo de contaminación antes de publicar.',
    items: {
      espresso: ['Espresso', 'Espresso italiano clásico'], 'espresso-doppio': ['Espresso Doppio', 'Espresso doble'], cappuccino: ['Cappuccino', 'Cappuccino clásico'], 'caffe-latte': ['Caffè Latte', 'Latte al estilo italiano'], 'flat-white': ['Flat White', 'Café al estilo australiano'], soda: ['Agua con gas', 'Agua mineral con gas'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Pizza de Nutella para compartir; opción vegana disponible'], profiteroles: ['Profiteroles', 'Profiteroles italianos clásicos con crema'], 'limone-ripieno': ['Limone Ripieno', 'Sorbete de limón relleno'], 'cassata-pistachio': ['Cassata de pistacho', 'Tarta helada siciliana de pistacho'], 'cocco-ripieno': ['Cocco Ripieno', 'Sorbete de coco relleno'], 'tartufo-scuro': ['Tartufo Scuro', 'Helado trufa de chocolate negro']
    }, allergens: { gluten: 'gluten (trigo)', eggs: 'huevos', milk: 'leche', nuts: 'frutos de cáscara', soy: 'soja' }
  },
  hu: {
    label: 'Magyar', groups: { drinks: 'Italok', desserts: 'Desszertek' }, noAllergens: 'A standard recept nem tartalmaz szabályozott allergént',
    disclaimer: 'A standard recept tipikus allergénjei. Publikálás előtt ellenőrizze az összetevőket és a keresztszennyeződés kockázatát.',
    items: {
      espresso: ['Eszpresszó', 'Klasszikus olasz eszpresszó'], 'espresso-doppio': ['Eszpresszó doppio', 'Dupla eszpresszó'], cappuccino: ['Cappuccino', 'Klasszikus cappuccino'], 'caffe-latte': ['Caffè Latte', 'Olasz stílusú tejeskávé'], 'flat-white': ['Flat White', 'Ausztrál stílusú kávé'], soda: ['Szódavíz', 'Szénsavas ásványvíz'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Nutellás pizza megosztásra; vegán opció is elérhető'], profiteroles: ['Profiterol', 'Klasszikus olasz krémes profiterol'], 'limone-ripieno': ['Limone Ripieno', 'Töltött citromsorbet'], 'cassata-pistachio': ['Pisztáciás cassata', 'Szicíliai pisztáciás fagylalttorta'], 'cocco-ripieno': ['Cocco Ripieno', 'Töltött kókuszsorbet'], 'tartufo-scuro': ['Tartufo Scuro', 'Étcsokoládés szarvasgombafagylalt']
    }, allergens: { gluten: 'glutén (búza)', eggs: 'tojás', milk: 'tej', nuts: 'diófélék', soy: 'szója' }
  },
  cs: {
    label: 'Čeština', groups: { drinks: 'Nápoje', desserts: 'Dezerty' }, noAllergens: 'Standardní recept neobsahuje regulované alergeny',
    disclaimer: 'Typické alergeny standardního receptu. Před zveřejněním ověřte složení a riziko křížové kontaminace.',
    items: {
      espresso: ['Espresso', 'Klasické italské espresso'], 'espresso-doppio': ['Espresso doppio', 'Dvojité espresso'], cappuccino: ['Cappuccino', 'Klasické cappuccino'], 'caffe-latte': ['Caffè Latte', 'Italské latte'], 'flat-white': ['Flat White', 'Káva v australském stylu'], soda: ['Perlivá voda', 'Perlivá minerální voda'],
      'pizza-nocciolata': ['Pizza Nocciolata', 'Nutellová pizza ke sdílení; k dispozici je veganská varianta'], profiteroles: ['Profiteroles', 'Klasické italské profiterolky s krémem'], 'limone-ripieno': ['Limone Ripieno', 'Plněný citronový sorbet'], 'cassata-pistachio': ['Pistáciová cassata', 'Sicilský pistáciový zmrzlinový dort'], 'cocco-ripieno': ['Cocco Ripieno', 'Plněný kokosový sorbet'], 'tartufo-scuro': ['Tartufo Scuro', 'Lanýžová zmrzlina z hořké čokolády']
    }, allergens: { gluten: 'lepek (pšenice)', eggs: 'vejce', milk: 'mléko', nuts: 'skořápkové plody', soy: 'sója' }
  },
  ru: {
    label: 'Русский', groups: { drinks: 'Напитки', desserts: 'Десерты' }, noAllergens: 'Нет обязательных аллергенов в стандартной рецептуре',
    disclaimer: 'Типичные аллергены для стандартной рецептуры. Перед публикацией подтвердите состав и риск перекрёстного контакта.',
    items: {
      espresso: ['Эспрессо', 'Классический итальянский эспрессо'], 'espresso-doppio': ['Эспрессо Доппио', 'Двойной эспрессо'], cappuccino: ['Капучино', 'Классический капучино'], 'caffe-latte': ['Кафе Латте', 'Итальянский латте'], 'flat-white': ['Флэт Уайт', 'Кофе в австралийском стиле'], soda: ['Содовая', 'Газированная минеральная вода'],
      'pizza-nocciolata': ['Пицца Ноччолата', 'Пицца с Нутеллой на двоих; доступна веганская опция'], profiteroles: ['Профитроли', 'Классические итальянские профитроли с кремом'], 'limone-ripieno': ['Лимоне Рипьено', 'Фаршированный лимонный сорбет'], 'cassata-pistachio': ['Кассата Фисташковая', 'Сицилийский торт-мороженое с фисташками'], 'cocco-ripieno': ['Кокко Рипьено', 'Фаршированный кокосовый сорбет'], 'tartufo-scuro': ['Тартуфо Скуро', 'Мороженое-трюфель из тёмного шоколада']
    }, allergens: { gluten: 'глютен (пшеница)', eggs: 'яйца', milk: 'молоко', nuts: 'орехи', soy: 'соя' }
  }
};

function classicAllergenKey(value) {
  const label = classicText(value).toLocaleLowerCase();
  if (!label) return '';
  if (/(?:gluten|wheat|weizen|glutine|bl[eé]|trigo|глютен|пшениц|glut[eé]n|b[uú]za|lepek|pšenic)/iu.test(label)) return 'gluten';
  if (/(?:milk|dairy|lait|latte|milch|молок|молоч|tej|ml[eé]ko)/iu.test(label)) return 'milk';
  if (/(?:eggs?|eier|uova|œufs?|huevos|яиц|яйц|toj[aá]s|vejce)/iu.test(label)) return 'eggs';
  if (/(?:peanuts?|nuts?|frutta\s+a\s+guscio|fruits?\s+[àa]\s+coque|schalenfr[üu]chte|орех|di[oó]f[eé]l[eé]k|skoř[aá]pk)/iu.test(label)) return 'nuts';
  if (/(?:soy|soja|соя|sz[oó]ja|s[oó]ja)/iu.test(label)) return 'soy';
  return '';
}

function classicLocalizedAllergens(values, languageCode) {
  const dictionary = FALLBACK_MENU_COPY[normalizeLanguage(languageCode)]?.allergens || FALLBACK_MENU_COPY.en.allergens;
  return [...new Set((values || []).map((value) => {
    const raw = classicText(value);
    const key = classicAllergenKey(raw);
    return key && dictionary[key] ? dictionary[key] : raw;
  }).filter(Boolean))];
}

function classicAllergenTranslations(values, languageCodes) {
  const codes = [...new Set((languageCodes || []).map(normalizeLanguage).filter(Boolean))];
  return Object.fromEntries(codes.map((code) => [code, classicLocalizedAllergens(values, code)]));
}

function buildFallbackMenu(language) {
  const requestedNativeCode = normalizeLanguage(language?.native?.code);
  const nativeCode = FALLBACK_MENU_COPY[requestedNativeCode] ? requestedNativeCode : 'en';
  const makeLanguageMenu = (code) => {
    const copy = FALLBACK_MENU_COPY[code] || FALLBACK_MENU_COPY.en;
    const items = FALLBACK_MENU_BASE.map((base, index) => {
      const [name, description] = copy.items[base.id];
      const allergenLabels = base.allergens.map((allergen) => copy.allergens[allergen]);
      return {
        id: `fallback-${index + 1}-${code}`,
        baseId: base.id,
        name,
        description,
        price: base.price,
        productType: base.category,
        sourceUrl: '',
        sourceFormat: 'template',
        allergens: allergenLabels,
        allergenNote: allergenLabels.length ? '' : copy.noAllergens,
        veganOption: Boolean(base.veganOption)
      };
    });
    return {
      language: { code, label: copy.label },
      sourceUrl: '',
      origin: 'template-menu',
      status: 'review-required',
      disclaimer: copy.disclaimer,
      navigationGroups: ['drinks', 'desserts'].map((id) => ({ id, label: copy.groups[id], count: items.filter((item) => item.productType === id).length })),
      items
    };
  };
  const menus = [makeLanguageMenu(nativeCode)];
  if (nativeCode !== 'en') menus.push(makeLanguageMenu('en'));
  return menus;
}

async function auditProductionCafe(cafe, template, background = null) {
  if (!cafe.website) {
    // A cafe without a website still receives a native and an English landing target.
    // The native locale is inferred from the location instead of silently defaulting to English.
    const language = createLandingLanguages(cafe);
    const $ = cheerio.load('');
    const assets = [];
    const typography = { fonts: [] };
    const colorRoles = { text: [], surface: [] };
    const classicLight = template?.mode === 'classic-light'
      ? buildClassicLightModel({ cafe, $, url: '', language, business: {}, assets, typography, colors: colorRoles, documents: [], background, useFallbackMenu: true })
      : null;
    return {
      cafe,
      source: { url: '', capturedAt: new Date().toISOString(), status: 'no-website' },
      language,
      typography,
      colorRoles,
      contacts: { address: cafe.address, email: cafe.emails?.[0] || '', phone: classicLight?.model.restaurant.phone.value?.display || '', hours: '', socials: cafe.socials || {} },
      contentAssets: { seoDrafts: [], menuSources: [], menuByLanguage: classicLight ? buildClassicMenuByLanguage(classicLight.model.menu, language) : buildFallbackMenu(language) },
      classicLight,
      assets
    };
  }
  const { url, html } = await fetchPublicHtmlWithRetries(cafe.website);
  const $ = cheerio.load(html);
  const cssLinks = extractCssLinks($, url);
  const cssTexts = [html];
  for (const cssUrl of cssLinks.slice(0, 6)) {
    try {
      const css = await fetchPublicText(cssUrl);
      cssTexts.push(css.text);
    } catch {
      // CSS недоступен — оставляем остальные доказательства.
    }
  }
  const cssText = cssTexts.join('\n');
  const language = extractProductionLanguages($, cafe);
  const bodyText = $('body').text();
  const colors = extractColors(cssText);
  const useFallbackMenu = cafe.menuOnSite !== true;
  const discoveredMenus = useFallbackMenu ? { documents: [] } : await loadWebsiteMenuDocuments(
    { url, html },
    cafe.siteMenuAnalysis?.mapsMenuUrl || '',
    cafe.siteMenuAnalysis?.menuUrls || []
  );
  const menuItems = useFallbackMenu ? [] : uniqueMenuItems([
    ...discoveredMenus.documents.flatMap((document) => extractMenuItemsFromDocument(document))
  ]);
  const menuSourceUrl = menuItems[0]?.sourceUrl || discoveredMenus.documents[0]?.url || url;
  const typography = { fonts: extractFontFamilies(cssText, url).slice(0, 8), cssLinks };
  const colorRoles = inferColorRoles(colors);
  const assets = await inspectProductionAssets(extractProductionAssets($, url));
  const classicLight = template?.mode === 'classic-light'
    ? buildClassicLightModel({ cafe: { ...cafe, website: url }, $, url, language, business: extractJsonLdBusinesses($)[0] || {}, assets, typography, colors: colorRoles, documents: discoveredMenus.documents, background, useFallbackMenu })
    : null;
  if (classicLight) {
    await localizeClassicLightAddresses(classicLight, language);
    await localizeClassicLightGeneratedNativeDescriptions(classicLight, language);
    await enrichClassicLightEnglishDrafts(classicLight, language);
  }
  return {
    cafe: { ...cafe, website: url },
    source: { url, capturedAt: new Date().toISOString(), status: 'ok', title: compactProductionText($('title').first().text()) },
    language,
    typography,
    colorRoles,
    contacts: {
      address: cafe.address,
      email: cafe.emails?.[0] || '',
      phone: classicLight?.model.restaurant.phone.value?.display || extractPhoneFromText(bodyText),
      hours: classicScheduleSummary(classicLight?.model.restaurant.openingHours.value) || '',
      socials: cafe.socials || {}
    },
    contentAssets: {
      seoDrafts: [],
      menuSources: discoveredMenus.documents.map((document) => ({ url: document.url, format: document.format })),
      menuByLanguage: classicLight
        ? buildClassicMenuByLanguage(classicLight.model.menu, language)
        : useFallbackMenu ? buildFallbackMenu(language) : menuItems.length ? buildMenuByLanguage(menuItems, language, menuSourceUrl) : []
    },
    classicLight,
    assets
  };
}

function validateProductionAudit(template, brands) {
  const checks = [
    { scope: 'template', label: 'Шаблон зафиксирован как структура', status: template ? 'ok' : 'error', detail: template?.structure?.note || 'Нет шаблона.' }
  ];
  for (const brand of brands) {
    checks.push({ scope: brand.cafe.name, label: 'Сайт клиента', status: brand.source.status === 'ok' ? 'ok' : 'warning', detail: brand.source.url || 'Нет сайта.' });
    checks.push({ scope: brand.cafe.name, label: 'Ассеты клиента', status: brand.assets.length ? 'ok' : 'warning', detail: `${brand.assets.length} кандидатов ассетов.` });
    checks.push({ scope: brand.cafe.name, label: 'Шрифты и цвета клиента', status: brand.typography.fonts.length || brand.colorRoles.text.length ? 'ok' : 'warning', detail: `${brand.typography.fonts.length} шрифтов · ${brand.colorRoles.text.length + brand.colorRoles.surface.length} цветов.` });
    const nativeMenu = brand.contentAssets.menuByLanguage[0];
    checks.push({ scope: brand.cafe.name, label: 'Меню до 12 позиций', status: nativeMenu?.status === 'ready' ? 'ok' : 'warning', detail: `${nativeMenu?.items?.length || 0} позиций · ${nativeMenu?.navigationGroups?.length || 0} группы.` });
    if (template?.mode === 'classic-light') {
      const components = brand.classicLight?.components || [];
      const statusCounts = components.reduce((result, component) => {
        result[component.status] = (result[component.status] || 0) + 1;
        return result;
      }, {});
      const state = components.length >= 44 && !statusCounts.missing && !statusCounts.needs_review ? 'ok' : 'warning';
      checks.push({
        scope: brand.cafe.name,
        label: 'Classic Light · контракт 01–52',
        status: state,
        detail: `${components.length} компонентов · found: ${statusCounts.found || 0} · derived: ${statusCounts.derived || 0} · needs_review: ${statusCounts.needs_review || 0} · missing: ${statusCounts.missing || 0}.`
      });
    }
  }
  return {
    status: checks.some((check) => check.status === 'error') ? 'blocked' : checks.some((check) => check.status === 'warning') ? 'review-required' : 'ready-for-approval',
    errors: checks.filter((check) => check.status === 'error').length,
    warnings: checks.filter((check) => check.status === 'warning').length,
    checks
  };
}

async function buildProductionAudit({ productionIds = [], templateId = 'classic-light-1', backgroundId = '' }) {
  const template = PRODUCTION_TEMPLATES[templateId] || PRODUCTION_TEMPLATES['classic-light-1'];
  if (template.pending) throw new Error(`Для «${template.name}» ещё не задан каркас. Добавьте контракт шаблона, и тогда разбор станет доступен.`);
  const allCafes = await readProductionCafes();
  const requested = new Set(productionIds);
  const cafes = requested.size ? allCafes.filter((cafe) => requested.has(cafe.productionId)) : allCafes;
  if (!cafes.length) throw new Error('В проде нет выбранных кафе. Сначала отметьте кафе в разделе «Кандидаты» и нажмите «Передать в прод».');
  const background = template?.mode === 'classic-light' ? await resolveClassicLightBackground(backgroundId) : null;
  const enrichedCafes = await enrichProductionCafesFromMaps(cafes.slice(0, 6));
  const brands = [];
  for (const cafe of enrichedCafes) brands.push(await auditProductionCafe(cafe, template, background));
  return {
    id: `prod-${Date.now()}`,
    createdAt: new Date().toISOString(),
    template,
    brands,
    validation: validateProductionAudit(template, brands)
  };
}

function productionAuditSummary(record) {
  return {
    productionId: record.productionId,
    auditedAt: record.auditedAt,
    templateId: record.template?.id || '',
    assetCount: Array.isArray(record.brand?.assets) ? record.brand.assets.length : 0,
    status: record.validation?.status || 'review-required',
    publication: record.publication || null
  };
}

function auditFromStoredProductionRecord(record) {
  const template = PRODUCTION_TEMPLATES[record.template?.id] || record.template;
  const validation = validateProductionAudit(template, [record.brand]);
  return {
    id: record.id,
    createdAt: record.auditedAt,
    template,
    brands: [record.brand],
    validation,
    publication: record.publication || null
  };
}

async function saveProductionAuditRecords(audit) {
  const auditedAt = new Date().toISOString();
  return updateProductionAudits((records) => {
    const saved = [];
    for (const brand of audit.brands || []) {
      const productionId = String(brand?.cafe?.productionId || '');
      if (!productionId) continue;
      const existingIndex = records.findIndex((item) => item.productionId === productionId);
      const existing = existingIndex >= 0 ? records[existingIndex] : null;
      const record = {
        id: existing?.id || randomUUID(),
        productionId,
        auditedAt,
        template: audit.template,
        brand,
        validation: validateProductionAudit(audit.template, [brand]),
        publication: existing?.publication || null
      };
      if (existingIndex >= 0) records.splice(existingIndex, 1, record);
      else records.push(record);
      saved.push(productionAuditSummary(record));
    }
    return saved;
  });
}

function normalizeCafeForFullAudit(cafe) {
  const evidenceText = `${cafe.city || ''} ${cafe.address || ''} ${cafe.name || ''}`;
  const city = /вен|wien|vienna/i.test(evidenceText) ? 'Вена' : cafe.city;
  const country = /австр|austria|österreich/i.test(evidenceText) ? 'Австрия' : cafe.country || '';
  return {
    id: cafe.productionId || cafe.id || cafe.mapsUrl || cafe.website || cafe.name,
    name: cafe.name,
    city,
    country,
    address: cafe.address,
    mapsUrl: cafe.mapsUrl,
    website: cafe.website,
    socials: cafe.socials || {},
    emails: cafe.emails || [],
    selected: true,
    source: 'production'
  };
}

async function buildFullProductionAuditViaReference({ productionIds = [], templateId = 'classic-light-1', backgroundId = '' }) {
  // Анализ ассетов выполняется тем же локальным сервером. Внешний процесс на
  // порту 3211 не требуется: из-за него кнопка «Разложить на ассеты» падала,
  // когда этот отдельный сервис не был запущен.
  return buildProductionAudit({ productionIds, templateId, backgroundId });
}

app.get('/api/production', async (_request, response) => {
  try {
    const cafes = await readProductionCafes();
    response.json({ cafes });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить прод.' });
  }
});

function sendingEmailList(cafe = {}) {
  return [...new Set((cafe.emails || [])
    .map((value) => String(value || '').replace(/^mailto:/i, '').trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)))];
}

function sendingSocialList(cafe = {}) {
  const source = cafe.socials && typeof cafe.socials === 'object' ? cafe.socials : {};
  const seen = new Set();
  const entries = [];
  for (const [network, rawValues] of Object.entries(source)) {
    const key = String(network || 'social').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '');
    for (const value of (Array.isArray(rawValues) ? rawValues : [rawValues])) {
      const url = cleanPublicUrl(String(value || '').trim());
      if (!url || seen.has(url)) continue;
      seen.add(url);
      entries.push({ network: key || 'social', url });
    }
  }
  return entries;
}

function sendingChatLinksFromSocials(socials = []) {
  const chatNetworks = new Set(['facebook', 'instagram', 'messenger', 'telegram', 'tiktok', 'viber', 'vk', 'whatsapp', 'wechat', 'line']);
  const normalized = Array.isArray(socials)
    ? socials.map((entry) => typeof entry === 'string' ? { network: 'social', url: entry } : entry)
    : Object.entries(socials || {}).flatMap(([network, rawValues]) => (Array.isArray(rawValues) ? rawValues : [rawValues])
      .map((url) => ({ network, url })));
  return normalized.filter((entry) => entry?.url && chatNetworks.has(String(entry.network || '').toLowerCase()));
}

function sendingChatLinks(cafe = {}) {
  return sendingChatLinksFromSocials(sendingSocialList(cafe));
}

function sendingPhone(cafe = {}) {
  const candidates = [cafe.mapsPhones, cafe.sitePhones, cafe.phones]
    .flatMap((values) => Array.isArray(values) ? values : []);
  const phone = candidates.find((value) => value && typeof value === 'object' && (value.display || value.normalized));
  if (phone && typeof phone === 'object') return String(phone.display || phone.normalized || '').trim();
  return String(candidates.find(Boolean) || '').replace(/^tel:/i, '').trim();
}

const OUTREACH_LANGUAGE_LABELS = {
  cs: 'Čeština',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hr: 'Hrvatski',
  hu: 'Magyar',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский'
};

function sendingNativeLanguage(cafe = {}, audit = {}) {
  const native = audit?.brand?.language?.native || {};
  const code = String(native.code || inferCafeNativeLanguage(cafe) || 'en').toLowerCase();
  const suppliedLabel = String(native.label || '').trim();
  const label = suppliedLabel && suppliedLabel.toLowerCase() !== code && suppliedLabel !== code.toUpperCase()
    ? suppliedLabel
    : OUTREACH_LANGUAGE_LABELS[code] || LANDING_LANGUAGE_LABELS[code] || code.toUpperCase();
  return { code, label };
}

function sendingFromProduction(cafe, audit, existing = null) {
  const publication = audit?.publication || {};
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    productionId: cafe.productionId,
    cafeName: String(cafe.name || 'Кафе').trim(),
    city: String(cafe.city || '').trim(),
    nativeLanguage: sendingNativeLanguage(cafe, audit),
    landingUrl: cleanPublicUrl(publication.landingUrl || publication.url || ''),
    adminUrl: cleanPublicUrl(publication.adminUrl || publication.admin?.url || ''),
    template: {
      id: String(audit?.template?.id || 'classic-light-1'),
      name: String(audit?.template?.name || 'Шаблон №1 · Classic Light')
    },
    emails: sendingEmailList(cafe),
    socials: sendingSocialList(cafe),
    chatLinks: sendingChatLinks(cafe),
    phone: sendingPhone(cafe),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

app.get('/api/sendings', async (_request, response) => {
  try {
    const [sendings, templates, audits] = await Promise.all([readSendings(), readOutreachLocalizations(), readProductionAudits()]);
    const auditsByProductionId = new Map(audits.map((audit) => [String(audit?.productionId || ''), audit]));
    response.set('Cache-Control', 'no-store');
    response.json({ sendings: sendings
      .slice()
      .sort((first, second) => new Date(second.updatedAt || second.createdAt || 0) - new Date(first.updatedAt || first.createdAt || 0))
      .map((sending) => decorateSendingWithOffers({
        ...sending,
        // Keep plaintext passwords out of sendings.json. They are decrypted
        // only for this local delivery view from the matching audit record.
        adminPassword: publicationAdminPassword(auditsByProductionId.get(String(sending.productionId || ''))?.publication)
      }, templates)) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить очередь отправки.' });
  }
});

app.post('/api/sendings', async (request, response) => {
  try {
    const productionId = String(request.body?.productionId || '').trim();
    if (!productionId) return response.status(400).json({ error: 'Не указано кафе для передачи в отправку.' });
    const [cafes, audits] = await Promise.all([readProductionCafes(), readProductionAudits()]);
    const cafe = cafes.find((item) => item.productionId === productionId);
    if (!cafe) return response.status(404).json({ error: 'Кафе не найдено в разделе «Прод».' });
    const audit = audits.find((item) => item.productionId === productionId);
    if (!audit?.publication?.landingUrl) {
      return response.status(409).json({ error: 'Сначала опубликуйте демо-лендинг: ссылка на лендинг нужна для письма клиенту.' });
    }
    const result = await updateSendings((sendings) => {
      const index = sendings.findIndex((item) => item.productionId === productionId);
      const sending = sendingFromProduction(cafe, audit, index >= 0 ? sendings[index] : null);
      if (index >= 0) sendings.splice(index, 1, sending);
      else sendings.push(sending);
      return { sending, created: index < 0 };
    });
    response.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось передать кафе в отправку.' });
  }
});

app.delete('/api/sendings', async (request, response) => {
  const ids = new Set((Array.isArray(request.body?.ids) ? request.body.ids : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  if (!ids.size) return response.status(400).json({ error: 'Выберите хотя бы одно кафе для удаления из отправки.' });
  try {
    const result = await updateSendings((sendings) => {
      const before = sendings.length;
      for (let index = sendings.length - 1; index >= 0; index -= 1) {
        if (ids.has(String(sendings[index]?.id || ''))) sendings.splice(index, 1);
      }
      return { deletedCount: before - sendings.length, sendings: sendings.slice() };
    });
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось удалить записи из отправки.' });
  }
});

app.get('/api/production/classic-light-backgrounds', async (_request, response) => {
  try {
    response.set('Cache-Control', 'no-store');
    response.json({ backgrounds: await listClassicLightBackgrounds() });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось получить список фонов Classic Light.' });
  }
});

// A background is presentation data, not an extracted asset.  Keep its update
// separate from the asset audit so the operator can try different looks without
// re-crawling the cafe website.
app.patch('/api/production/audits/:productionId/classic-light-background', async (request, response) => {
  try {
    const productionId = String(request.params.productionId || '').trim();
    if (!productionId) return response.status(400).json({ error: 'Не указано кафе для изменения фона.' });

    const requestedBackgroundId = String(request.body?.backgroundId || '').trim();
    const background = requestedBackgroundId ? await resolveClassicLightBackground(requestedBackgroundId) : null;
    if (requestedBackgroundId && !background) {
      return response.status(400).json({ error: 'Выбранный фон Classic Light не найден.' });
    }

    const saved = await updateProductionAudits((records) => {
      const index = records.findIndex((entry) => entry.productionId === productionId);
      if (index < 0) return null;

      const record = records[index];
      if (record?.template?.id !== 'classic-light-1' || !record?.brand?.classicLight?.model) {
        throw publishInputError('Для этого кафе нет сохранённого разбора по шаблону Classic Light.', 409);
      }

      const brand = structuredClone(record.brand);
      const model = brand.classicLight.model;
      const currentOptions = model.templateOptions?.value && typeof model.templateOptions.value === 'object'
        ? model.templateOptions.value
        : {};
      model.templateOptions = classicField({
        ...currentOptions,
        background: background ? classicLightBackgroundOption(background.id) : null
      }, {
        status: 'derived',
        note: background ? 'Фон Classic Light выбран вручную после разбора.' : 'Для Classic Light выбран режим без фонового изображения.',
        sourceLabel: 'Настройки прод-разбора'
      });

      const updated = {
        ...record,
        brand,
        validation: validateProductionAudit(record.template, [brand]),
        backgroundUpdatedAt: new Date().toISOString()
      };
      records[index] = updated;
      return updated;
    });

    if (!saved) return response.status(404).json({ error: 'Сохранённый разбор для этого кафе не найден.' });
    response.set('Cache-Control', 'no-store').json({
      background: background ? classicLightBackgroundOption(background.id) : null,
      savedAt: saved.backgroundUpdatedAt
    });
  } catch (error) {
    response.status(Number(error?.status) || 500).json({ error: error instanceof Error ? error.message : 'Не удалось сохранить фон Classic Light.' });
  }
});

app.delete('/api/production', async (request, response) => {
  const productionIds = new Set((Array.isArray(request.body?.productionIds) ? request.body.productionIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  if (!productionIds.size) return response.status(400).json({ error: 'Выберите хотя бы одно кафе для удаления из прода.' });
  try {
    const removedIds = await updateCandidates((groups) => {
      const removed = [];
      const updatedAt = new Date().toISOString();
      for (const group of groups) {
        let groupChanged = false;
        for (const row of group.rows || []) {
          const productionId = `${group.id}:${row.candidateNumber}`;
          if (!productionIds.has(productionId) || !row.productionSentAt) continue;
          delete row.productionSentAt;
          removed.push(productionId);
          groupChanged = true;
        }
        if (groupChanged) group.updatedAt = updatedAt;
      }
      return removed;
    });
    if (!removedIds.length) return response.status(404).json({ error: 'Выбранные кафе уже отсутствуют в проде.' });

    const removedSet = new Set(removedIds);
    const deletedAuditCount = await updateProductionAudits((audits) => {
      const before = audits.length;
      for (let index = audits.length - 1; index >= 0; index -= 1) {
        if (removedSet.has(String(audits[index]?.productionId || ''))) audits.splice(index, 1);
      }
      return before - audits.length;
    });
    const deletedSendingCount = await updateSendings((sendings) => {
      const before = sendings.length;
      for (let index = sendings.length - 1; index >= 0; index -= 1) {
        if (removedSet.has(String(sendings[index]?.productionId || ''))) sendings.splice(index, 1);
      }
      return before - sendings.length;
    });
    response.json({
      deletedCount: removedIds.length,
      deletedAuditCount,
      deletedSendingCount,
      productionIds: removedIds
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось удалить кафе из прода.' });
  }
});

app.get('/api/production/audits', async (_request, response) => {
  try {
    const [cafes, audits] = await Promise.all([readProductionCafes(), readProductionAudits()]);
    const knownIds = new Set(cafes.map((cafe) => cafe.productionId));
    response.json({ audits: audits.filter((audit) => knownIds.has(audit.productionId)).map(productionAuditSummary) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить статусы разборов.' });
  }
});

function publishInputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizedPublicationExpiry(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw publishInputError('expiresAt must be an ISO date or null.');
  return date.toISOString();
}

async function writePublishedSiteArtifact({ hostname, siteId, version, html, sha256, expiresAt, commercial = null }) {
  const artifactDirectory = path.join(publishedSitesDirectory, siteId, 'versions', version);
  await fs.mkdir(artifactDirectory, { recursive: true });
  const artifactFile = path.join(artifactDirectory, 'index.html');
  const temporaryFile = `${artifactFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, html, 'utf8');
  await fs.rename(temporaryFile, artifactFile);
  return updatePublishedSitesRegistry((registry) => {
    const existing = registry.sites.find((entry) => entry.hostname === hostname);
    if (existing && existing.siteId !== siteId) {
      throw publishInputError('This hostname is already assigned to another site.', 409);
    }
    const now = new Date().toISOString();
    const site = existing || { hostname, siteId, status: 'active', activeVersion: '', expiresAt: null, versions: [], createdAt: now };
    // An owner-controlled pause or archive must not be silently undone by a
    // later content upload. Reactivation is an explicit operator action.
    if (!existing) site.status = 'active';
    site.activeVersion = version;
    site.expiresAt = expiresAt;
    site.updatedAt = now;
    if (commercial && typeof commercial === 'object') site.commercial = commercial;
    site.versions = Array.isArray(site.versions) ? site.versions.filter((entry) => entry.id !== version) : [];
    site.versions.push({ id: version, createdAt: now, sha256, bytes: Buffer.byteLength(html, 'utf8') });
    if (!existing) registry.sites.push(site);
    return site;
  });
}

app.post('/api/deploy/published-sites', async (request, response) => {
  if (!pilotMode) return response.status(404).json({ error: 'Not found' });
  try {
    if (!publishApiToken || !publishTokensMatch(publishAuthorizationToken(request), publishApiToken)) {
      return response.status(401).json({ error: 'Invalid deployment token.' });
    }
    const hostname = String(request.body?.hostname || '').trim().toLowerCase();
    const siteId = String(request.body?.siteId || '').trim();
    const version = String(request.body?.version || '').trim().toLowerCase();
    const html = typeof request.body?.html === 'string' ? request.body.html : '';
    const sha256 = String(request.body?.sha256 || '').trim().toLowerCase();
    const expiresAt = normalizedPublicationExpiry(request.body?.expiresAt);
    if (!isPilotPublishedHostname(hostname) || pilotPublicHosts.has(hostname) || pilotClientHosts.has(hostname)) throw publishInputError('Hostname is outside the configured pilot domain or reserved.');
    if (!/^site_[a-f0-9]{16}$/u.test(siteId)) throw publishInputError('Invalid siteId.');
    if (!/^v[a-z0-9-]{8,80}$/u.test(version)) throw publishInputError('Invalid version.');
    if (!html || html.includes('\u0000') || Buffer.byteLength(html, 'utf8') > 3_500_000) throw publishInputError('The HTML artifact is empty or exceeds 3.5 MB.');
    const calculatedHash = createHash('sha256').update(html, 'utf8').digest('hex');
    if (!/^[a-f0-9]{64}$/u.test(sha256) || !publishTokensMatch(sha256, calculatedHash)) throw publishInputError('Artifact checksum mismatch.');
    const commercial = request.body?.commercial && typeof request.body.commercial === 'object'
      ? clientAdminPublishedCommercialMetadata(request.body.commercial)
      : null;
    const site = await writePublishedSiteArtifact({ hostname, siteId, version, html, sha256, expiresAt, commercial });
    const siteAdmin = await provisionPublishedSiteAdminAccount(site, request.body?.siteAdmin);
    const slug = hostname.slice(0, -(pilotSiteDomain.length + 1));
    response.status(201).json({
      url: `https://${site.hostname}/`,
      site: { hostname: site.hostname, siteId: site.siteId, status: site.status, activeVersion: site.activeVersion, expiresAt: site.expiresAt },
      admin: { url: `https://${[...pilotClientHosts][0] || 'cabinet'}/sites/${slug}`, username: siteAdmin.username, provisioned: siteAdmin.provisioned }
    });
  } catch (error) {
    response.status(Number(error?.status) || 400).json({ error: error instanceof Error ? error.message : 'Could not publish the site.' });
  }
});

function publishedSiteAdminAccessForSlug(slug, session) {
  return publishedSiteBySlug(slug).then(({ slug: normalizedSlug, site }) => {
    if (!session || session.siteId !== site.siteId) throw publishInputError('Эта сессия не имеет доступа к кабинету кафе.', 403);
    return { slug: normalizedSlug, site };
  });
}

async function publishedSiteAdminPage(site) {
  const artifactPath = path.join(publishedSitesDirectory, site.siteId, 'versions', site.activeVersion, 'index.html');
  const html = await fs.readFile(artifactPath, 'utf8');
  const content = publishedStandaloneContent(html);
  return {
    content,
    site: {
      hostname: site.hostname,
      name: String(content?.restaurant?.name || site.hostname),
      activeVersion: site.activeVersion,
      menu: publishedSiteAdminMenu(content)
    },
    html
  };
}

app.get('/sites/:slug', async (request, response) => {
  if (!pilotMode) return response.status(404).type('text/plain').send('Not found');
  try {
    const { site } = await publishedSiteBySlug(request.params.slug);
    const account = await readPublishedSiteAdminAccount(site.siteId);
    if (!account) return response.status(404).type('text/plain').send('Not found');
    const loginEmail = JSON.stringify(account.username).replace(/</gu, '\\u003c');
    const { content } = await publishedSiteAdminPage(site);
    const interfaceLanguage = JSON.stringify(String(content?.localization?.nativeLanguage || content?.localization?.activeLanguage || 'en').trim().toLowerCase().slice(0, 8)).replace(/</gu, '\\u003c');
    const adminPage = await fs.readFile(path.join(__dirname, 'public', 'admin.html'), 'utf8');
    response
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(adminPage.replace('</head>', `<script>window.__FASTMENU_SITE_LOGIN_EMAIL=${loginEmail};window.__FASTMENU_SITE_INTERFACE_LANGUAGE=${interfaceLanguage};</script></head>`));
  } catch {
    response.status(404).type('text/plain').send('Not found');
  }
});

app.post('/api/site-admin/auth/login', async (request, response) => {
  if (!pilotMode) return response.status(404).json({ error: 'Not found' });
  const key = publishedSiteAdminLoginKey(request);
  const attempt = publishedSiteAdminLoginAttempts.get(key);
  if (attempt?.blockedUntil > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((attempt.blockedUntil - Date.now()) / 1000));
    response.set('Retry-After', String(retryAfterSeconds));
    return response.status(429).json({ error: 'Несколько попыток с неверным паролем. Попробуйте снова через 5 минут.' });
  }
  try {
    const { slug, site } = await publishedSiteBySlug(request.body?.slug);
    const account = await readPublishedSiteAdminAccount(site.siteId);
    const username = String(request.body?.username || '').trim().toLowerCase();
    if (!account || username !== account.username || !publishedSiteAdminPasswordsMatch(request.body?.password, account)) {
      const now = Date.now();
      const failures = attempt?.windowStartedAt && now - attempt.windowStartedAt < publishedSiteAdminLoginFailureWindowMs
        ? attempt.failures + 1
        : 1;
      publishedSiteAdminLoginAttempts.set(key, {
        failures,
        windowStartedAt: failures === 1 ? now : attempt.windowStartedAt,
        blockedUntil: failures >= publishedSiteAdminLoginFailureLimit ? now + publishedSiteAdminLoginBlockMs : 0
      });
      return response.status(401).json({ error: 'Неверный логин или пароль.' });
    }
    publishedSiteAdminLoginAttempts.delete(key);
    const csrf = randomBytes(24).toString('base64url');
    const session = { scope: 'published-site-admin', siteId: site.siteId, csrf, exp: Date.now() + 12 * 60 * 60_000 };
    response.cookie(publishedSiteAdminSessionCookie, publishedSiteAdminSessionToken(session), publishedSiteAdminCookieOptions());
    response.json({ slug, username: account.username, csrfToken: csrf, expiresAt: new Date(session.exp).toISOString() });
  } catch (error) {
    response.status(Number(error?.status) || 400).json({ error: error instanceof Error ? error.message : 'Не удалось выполнить вход.' });
  }
});

app.post('/api/site-admin/auth/logout', (request, response) => {
  const session = publishedSiteAdminSessionFromRequest(request);
  if (session && String(request.headers['x-site-admin-csrf'] || '') !== session.csrf) return response.status(403).json({ error: 'Проверка безопасности не пройдена.' });
  response.clearCookie(publishedSiteAdminSessionCookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  response.status(204).end();
});

app.get('/api/site-admin/auth/session', async (request, response) => {
  const session = publishedSiteAdminSessionFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Требуется вход в кабинет кафе.', code: 'AUTH_REQUIRED' });
  try {
    const { slug, site } = await publishedSiteAdminAccessForSlug(request.query.slug, session);
    const account = await readPublishedSiteAdminAccount(site.siteId);
    if (!account) return response.status(401).json({ error: 'Кабинет ещё не настроен.', code: 'AUTH_REQUIRED' });
    response.set('Cache-Control', 'no-store').json({ slug, username: account.username, csrfToken: session.csrf, expiresAt: new Date(session.exp).toISOString() });
  } catch (error) {
    response.status(Number(error?.status) || 401).json({ error: error instanceof Error ? error.message : 'Не удалось проверить сессию.' });
  }
});

app.get('/api/site-admin/sites/:slug', publishedSiteAdminRequireSession, async (request, response) => {
  try {
    const { site } = await publishedSiteAdminAccessForSlug(request.params.slug, request.publishedSiteAdminSession);
    const page = await publishedSiteAdminPage(site);
    response.set('Cache-Control', 'no-store').json({ site: page.site });
  } catch (error) {
    response.status(Number(error?.status) || 404).json({ error: error instanceof Error ? error.message : 'Не удалось открыть опубликованное меню.' });
  }
});

app.put('/api/site-admin/sites/:slug/prices', publishedSiteAdminRequireSession, publishedSiteAdminRequireWrite, async (request, response) => {
  try {
    const { site } = await publishedSiteAdminAccessForSlug(request.params.slug, request.publishedSiteAdminSession);
    const baseVersion = String(request.body?.baseVersion || '');
    if (baseVersion !== site.activeVersion) throw publishInputError('Лендинг уже изменён в другой сессии. Обновите страницу перед публикацией.', 409);
    const updates = Array.isArray(request.body?.items) ? request.body.items : [];
    if (!updates.length || updates.length > 250) throw publishInputError('Передайте от 1 до 250 изменённых позиций.');
    const page = await publishedSiteAdminPage(site);
    const items = new Map((page.content.menu.items || []).map((item) => [String(item?.id || ''), item]));
    for (const update of updates) {
      const item = items.get(String(update?.id || ''));
      const price = String(update?.price || '').trim();
      if (!item) throw publishInputError('В меню найдена неизвестная позиция.');
      if (!price || price.length > 40 || /[<>&\u0000-\u001F]/u.test(price)) throw publishInputError('Цена должна содержать от 1 до 40 безопасных символов.');
      item.pricing ||= {};
      item.pricing.native ||= {};
      item.pricing.native.formatted = price;
    }
    const html = replacePublishedStandaloneContent(page.html, page.content);
    const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
    const version = `v${new Date().toISOString().replace(/[-:.]/gu, '').toLowerCase().replace('z', 'z')}-${sha256.slice(0, 12)}`;
    const published = await writePublishedSiteArtifact({ hostname: site.hostname, siteId: site.siteId, version, html, sha256, expiresAt: site.expiresAt });
    const updatedPage = await publishedSiteAdminPage(published);
    response.json({ site: updatedPage.site, url: `https://${published.hostname}/` });
  } catch (error) {
    response.status(Number(error?.status) || 400).json({ error: error instanceof Error ? error.message : 'Не удалось опубликовать цены.' });
  }
});

async function resolvedClassicLightBrandForProduction(productionId) {
  const [audits, cafes] = await Promise.all([readProductionAudits(), readProductionCafes()]);
  const audit = audits.find((entry) => entry.productionId === productionId);
  if (!audit) throw publishInputError('Для этого кафе ещё нет сохранённого разбора по шаблону Classic Light.', 404);
  const storedCafe = cafes.find((entry) => entry.productionId === productionId);
  const storedRating = mapsRatingOrNull(audit?.brand?.classicLight?.model?.restaurant?.rating?.value);
  const savedHoursValue = audit?.brand?.classicLight?.model?.restaurant?.openingHours?.value || {};
  const savedSchedule = savedHoursValue.schedule || [];
  const hasSavedWeeklySchedule = Array.isArray(savedSchedule)
    && savedSchedule.some((entry) => hasClassicScheduleDayLabel(entry?.label || entry?.days || ''));
  const mapsScheduleNeedsMigration = audit?.brand?.classicLight?.model?.restaurant?.openingHours?.sourceLabel === 'Google Maps'
    && Number(savedHoursValue.sourceVersion || 0) < 2;
  const [cafe] = storedRating === null || !hasSavedWeeklySchedule || mapsScheduleNeedsMigration
    ? await enrichProductionCafesFromMaps(storedCafe ? [storedCafe] : [])
    : [storedCafe];
  const hydratedBrand = await refreshStoredClassicOpeningHours(hydrateStoredClassicLightBrand(audit.brand, cafe), cafe);
  await localizeClassicLightAddresses(hydratedBrand?.classicLight, hydratedBrand?.language);
  if (JSON.stringify(hydratedBrand) !== JSON.stringify(audit.brand)) {
    await updateProductionAudits((records) => {
      const index = records.findIndex((entry) => entry.productionId === audit.productionId);
      if (index >= 0) records[index] = { ...records[index], brand: hydratedBrand };
    });
  }
  if (!buildClassicLightTemplateContent(hydratedBrand)) throw publishInputError('Для этого кафе ещё нет данных Classic Light.', 404);
  return hydratedBrand;
}

app.post('/api/production/audits/:productionId/publish', async (request, response) => {
  if (pilotMode) return response.status(404).json({ error: 'Not found' });
  try {
    const slug = String(request.body?.slug || '').trim().toLowerCase();
    const hostname = `${slug}.${String(process.env.PUBLISH_SITE_DOMAIN || '').trim().toLowerCase()}`;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(slug)) throw publishInputError('Поддомен: строчные латинские буквы, цифры и дефис; от 1 до 63 символов.');
    if (!isPilotPublishedHostname(hostname)) throw publishInputError('Не задан PUBLISH_SITE_DOMAIN для публикации.');
    const target = new URL(publishApiUrl);
    if (target.protocol !== 'https:' || target.username || target.password || !publishApiToken) throw publishInputError('Не задана безопасная конфигурация PUBLISH_API_URL / PUBLISH_API_TOKEN.', 503);
    const brand = await resolvedClassicLightBrandForProduction(request.params.productionId);
    const content = buildClassicLightTemplateContent(brand);
    if (!content) throw publishInputError('Не удалось собрать данные лендинга.', 422);
    const html = await buildClassicLightStandaloneDocumentFromContent(content);
    if (!html) throw publishInputError('Не удалось собрать HTML-артефакт.', 422);
    const commercial = clientAdminPublishedCommercialMetadata({
      ...clientAdminCommercialMetadataFromContent(content),
      countrySource: 'google_maps'
    });
    const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
    const siteId = `site_${createHash('sha256').update(request.params.productionId, 'utf8').digest('hex').slice(0, 16)}`;
    const version = `v${new Date().toISOString().replace(/[-:.]/gu, '').toLowerCase().replace('z', 'z')}-${sha256.slice(0, 12)}`;
    const siteAdmin = {
      username: publishedSiteAdminDefaultUsername({ hostname }),
      password: publishedSiteAdminGeneratedPassword()
    };
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { authorization: `Bearer ${publishApiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ hostname, siteId, version, html, sha256, expiresAt: null, siteAdmin, commercial }),
      signal: AbortSignal.timeout(25_000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw publishInputError(payload.error || `Сервер публикации вернул HTTP ${upstream.status}.`, 502);
    const publication = {
      templateId: 'classic-light-1',
      templateName: 'Шаблон №1 · Classic Light',
      slug,
      hostname,
      landingUrl: cleanPublicUrl(payload.url || `https://${hostname}`),
      adminUrl: cleanPublicUrl(payload.admin?.url || ''),
      siteId,
      publishedAt: new Date().toISOString()
    };
    const publishedAdminCredentials = payload.admin?.url && payload.admin?.provisioned
      ? {
        username: String(payload.admin.username || siteAdmin.username || '').trim(),
        password: encryptPublicationPassword(siteAdmin.password)
      }
      : null;
    await updateProductionAudits((records) => {
      const index = records.findIndex((entry) => entry.productionId === request.params.productionId);
      if (index >= 0) {
        const previousAdminCredentials = records[index]?.publication?.adminCredentials || null;
        records[index] = {
          ...records[index],
          publication: {
            ...publication,
            ...(publishedAdminCredentials || previousAdminCredentials ? { adminCredentials: publishedAdminCredentials || previousAdminCredentials } : {})
          }
        };
      }
    });
    response.status(201).json({
      url: publication.landingUrl,
      site: payload.site,
      publication,
      admin: payload.admin?.url ? {
        url: payload.admin.url,
        username: payload.admin.username,
        password: payload.admin.provisioned ? siteAdmin.password : '',
        provisioned: Boolean(payload.admin.provisioned)
      } : null
    });
  } catch (error) {
    response.status(Number(error?.status) || 500).json({ error: error instanceof Error ? error.message : 'Не удалось опубликовать демо-лендинг.' });
  }
});

app.get('/api/production/audits/:productionId/classic-light-content', async (request, response) => {
  try {
    const [audits, cafes] = await Promise.all([readProductionAudits(), readProductionCafes()]);
    const audit = audits.find((entry) => entry.productionId === request.params.productionId);
    const storedCafe = cafes.find((entry) => entry.productionId === request.params.productionId);
    const storedRating = mapsRatingOrNull(audit?.brand?.classicLight?.model?.restaurant?.rating?.value);
    const savedHoursValue = audit?.brand?.classicLight?.model?.restaurant?.openingHours?.value || {};
    const savedSchedule = savedHoursValue.schedule || [];
    const hasSavedWeeklySchedule = Array.isArray(savedSchedule)
      && savedSchedule.some((entry) => hasClassicScheduleDayLabel(entry?.label || entry?.days || ''));
    const mapsScheduleNeedsMigration = audit?.brand?.classicLight?.model?.restaurant?.openingHours?.sourceLabel === 'Google Maps'
      && Number(savedHoursValue.sourceVersion || 0) < 2;
    const [cafe] = storedRating === null || !hasSavedWeeklySchedule || mapsScheduleNeedsMigration
      ? await enrichProductionCafesFromMaps(storedCafe ? [storedCafe] : [])
      : [storedCafe];
    const hydratedBrand = await refreshStoredClassicOpeningHours(
      hydrateStoredClassicLightBrand(audit?.brand, cafe),
      cafe
    );
    // Migrate saved audits lazily as they are opened, so localised addresses are
    // available for historic records as well as for every new asset extraction.
    await localizeClassicLightAddresses(hydratedBrand?.classicLight, hydratedBrand?.language);
    if (audit && JSON.stringify(hydratedBrand) !== JSON.stringify(audit.brand)) {
      await updateProductionAudits((records) => {
        const index = records.findIndex((entry) => entry.productionId === audit.productionId);
        if (index >= 0) records[index] = { ...records[index], brand: hydratedBrand };
      });
    }
    const content = buildClassicLightTemplateContent(hydratedBrand);
    if (!content) return response.status(404).json({ error: 'Для этого кафе ещё нет разбора по шаблону Classic Light.' });
    response.set('Cache-Control', 'no-store');
    response.json(content);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось подготовить данные для шаблона Classic Light.' });
  }
});

app.get('/api/production/audits/:productionId', async (request, response) => {
  try {
    const [audits, cafes] = await Promise.all([readProductionAudits(), readProductionCafes()]);
    const audit = audits.find((entry) => entry.productionId === request.params.productionId);
    if (!audit) return response.status(404).json({ error: 'Для этого кафе разбор ассетов ещё не выполнен.' });
    const cafe = cafes.find((entry) => entry.productionId === request.params.productionId);
    const hydratedAudit = { ...audit, brand: hydrateStoredClassicLightBrand(audit.brand, cafe) };
    response.json({ audit: auditFromStoredProductionRecord(hydratedAudit), summary: productionAuditSummary(hydratedAudit) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить разбор ассетов.' });
  }
});

app.post('/api/production/audit', async (request, response) => {
  try {
    const productionIds = Array.isArray(request.body?.productionIds) ? request.body.productionIds.map(String) : [];
    const templateId = String(request.body?.templateId || 'classic-light-1');
    const backgroundId = String(request.body?.backgroundId || '').trim();
    const audit = await buildFullProductionAuditViaReference({ productionIds, templateId, backgroundId });
    response.json({ audit, savedAudits: await saveProductionAuditRecords(audit) });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось собрать prod package.' });
  }
});

app.post('/api/candidates/:id/production', async (request, response) => {
  const candidateNumbers = new Set((Array.isArray(request.body?.candidateNumbers) ? request.body.candidateNumbers : [])
    .map((value) => Number(value))
    .filter(Number.isInteger));
  if (!candidateNumbers.size) return response.status(400).json({ error: 'Выберите хотя бы одно кафе для передачи в прод.' });
  try {
    const result = await updateCandidates((candidates) => {
      const item = candidates.find((entry) => entry.id === request.params.id);
      if (!item) throw new Error('Подборка кандидатов не найдена.');
      const sentAt = new Date().toISOString();
      let sentCount = 0;
      for (const row of item.rows || []) {
        if (candidateNumbers.has(row.candidateNumber)) {
          row.productionSentAt = sentAt;
          sentCount += 1;
        }
      }
      if (!sentCount) throw new Error('Выбранные кафе не найдены в подборке.');
      item.updatedAt = sentAt;
      return { candidate: candidateSummary(item), sentCount };
    });
    response.json(result);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось передать кандидатов в прод.' });
  }
});

app.post('/api/export/:jobId/stop', async (request, response) => {
  const job = activeExports.get(request.params.jobId);
  if (!job) return response.status(404).json({ error: 'Активный парсинг не найден.' });
  job.cancelled = true;
  await job.browser?.close().catch(() => {});
  response.json({ stopped: true });
});

app.post('/api/export', async (request, response) => {
  const city = String(request.body?.city || '').trim();
  const radiusKm = Number(request.body?.radiusKm);
  const requestedLimit = Number(request.body?.limit || 60);
  const jobId = String(request.body?.jobId || '').trim();
  if (!city || city.length > 120) return response.status(400).json({ error: 'Введите город (до 120 символов).' });
  if (!Number.isFinite(radiusKm) || radiusKm < 0.3 || radiusKm > maxRadiusKm) {
    return response.status(400).json({ error: `Радиус должен быть от 0,3 до ${maxRadiusKm} км.` });
  }
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) return response.status(400).json({ error: 'Некорректный идентификатор парсинга.' });
  if (activeExports.has(jobId)) return response.status(409).json({ error: 'Этот парсинг уже выполняется.' });
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), maxResultsLimit);
  const job = { cancelled: false, browser: null };
  activeExports.set(jobId, job);
  let browser;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, '.maps-browser-profile'), {
      // Headless-режим Google Maps отдаёт неполные карточки без отзывов.
      // Запускаем обычный Chromium, но сразу свёрнутым: он не перекрывает рабочий экран.
      headless: false,
      args: ['--start-minimized', '--window-position=-32000,-32000'],
      locale: 'ru-RU',
      viewport: { width: 1440, height: 1000 }
    });
    job.browser = browser;
    throwIfCancelled(job);
    const context = browser;
    const center = await geocodeCityCenter(city);
    throwIfCancelled(job);
    const searchPage = await context.newPage();
    const candidates = new Map();
    for (const point of gridPoints(center, radiusKm)) {
      throwIfCancelled(job);
      await searchPage.goto(mapsSearchUrl(`кафе ${city}`, point, radiusKm <= 2 ? 15 : 14), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForMap(searchPage);
      throwIfCancelled(job);
      const links = await scrollAndCollectLinks(searchPage);
      for (const link of links) {
        const key = link.href.replace(/[?&]authuser=\d+/g, '');
        if (!candidates.has(key)) candidates.set(key, link);
      }
      await sleep(650);
      if (candidates.size >= limit * 2) break;
    }
    let skippedNonFood = 0;
    const filteredCandidates = [...candidates.values()]
      .filter((candidate) => {
        if (isFoodVenueCategory(candidate.mapsCategory)) return true;
        skippedNonFood += 1;
        return false;
      })
      .slice(0, limit * 2);
    const detailPage = await context.newPage();
    const rows = await mapWithConcurrency(filteredCandidates, 1, async (candidate) => {
      throwIfCancelled(job);
      try {
        const row = await getPlace(detailPage, candidate, center, radiusKm);
        throwIfCancelled(job);
        return row;
      } catch (error) {
        if (job.cancelled) throw error;
        if (/CAPTCHA|ограничение/i.test(error.message)) throw error;
        return null;
      }
    });
    const deduplicated = new Map();
    for (const row of rows) {
      throwIfCancelled(job);
      if (row.name && !deduplicated.has(row.mapsUrl)) deduplicated.set(row.mapsUrl, row);
      if (deduplicated.size >= limit) break;
    }
    const finalRows = [...deduplicated.values()];
    throwIfCancelled(job);
    const array = await saveParsingArray({
      city,
      radiusKm,
      requestedLimit: limit,
      scanned: candidates.size,
      center,
      rows: finalRows
    });
    await context.close();
    response.json({ center, scanned: candidates.size, eligible: filteredCandidates.length, skippedNonFood, rows: finalRows, array });
  } catch (error) {
    if (job.cancelled) {
      response.status(499).json({ error: 'Парсинг остановлен пользователем.' });
    } else if (isBrowserClosedError(error)) {
      response.status(500).json({ error: 'Фоновый браузер был закрыт. Запустите новый парсинг или используйте кнопку «Стоп». ' });
    } else {
      response.status(500).json({ error: error instanceof Error ? error.message : 'Неизвестная ошибка' });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    activeExports.delete(jobId);
  }
});

function isClearlyLegacyNonFoodRow(row = {}) {
  const storedCategory = normalizedMapsPlaceCategory(row.mapsCategory || row.placeCategory || '');
  if (storedCategory) return !isFoodVenueCategory(storedCategory);
  const name = compactProductionText(row.name || '');
  // Records created before category capture do not have mapsCategory.  Remove
  // only unmistakable landmarks, while preserving a real place whose name
  // contains "Piazza", "Square" etc. together with a food-venue term.
  if (!name || isFoodVenueCategory(name)) return false;
  return /^(?:piazza|square|plaza|площадь|парк|сад|музей|museum|gallery|church|cathedral|basilica|monument|landmark|достопримечательност|историческ(?:ий|ая)\s+(?:памятник|место))/iu.test(name);
}

async function purgeLegacyNonFoodRecords() {
  const affectedArrayIds = new Set();
  const removedProductionIds = new Set();
  let removedRows = 0;
  await updateArrays((arrays) => {
    for (const item of arrays) {
      const before = Array.isArray(item.rows) ? item.rows.length : 0;
      const kept = (item.rows || []).filter((row) => !isClearlyLegacyNonFoodRow(row));
      if (kept.length === before) continue;
      removedRows += before - kept.length;
      affectedArrayIds.add(item.id);
      item.rows = kept;
      item.cardCount = kept.length;
      // Aggregates were calculated with the excluded object, so they must be
      // re-created on the next scoring pass rather than silently reused.
      item.score = null;
      item.scoredAt = null;
      item.scoreDetails = null;
    }
    return null;
  });
  if (!affectedArrayIds.size) return;
  await updateScorings((scorings) => {
    for (let index = scorings.length - 1; index >= 0; index -= 1) {
      if (affectedArrayIds.has(scorings[index].arrayId) || (scorings[index].rows || []).some(isClearlyLegacyNonFoodRow)) scorings.splice(index, 1);
    }
    return null;
  });
  await updateCandidates((candidates) => {
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const item = candidates[index];
      const kept = [];
      for (const row of item.rows || []) {
        if (!isClearlyLegacyNonFoodRow(row)) {
          kept.push(row);
          continue;
        }
        removedProductionIds.add(`${item.id}:${row.candidateNumber}`);
      }
      item.rows = kept;
      if (!kept.length) candidates.splice(index, 1);
    }
    return null;
  });
  if (removedProductionIds.size) {
    await updateProductionAudits((audits) => {
      for (let index = audits.length - 1; index >= 0; index -= 1) {
        if (removedProductionIds.has(audits[index].productionId)) audits.splice(index, 1);
      }
      return null;
    });
  }
  console.log(`Removed ${removedRows} legacy non-food Google Maps record(s).`);
}

const startupMaintenance = pilotMode ? Promise.resolve() : purgeLegacyNonFoodRecords();

void startupMaintenance
  .catch((error) => console.error('Legacy non-food cleanup failed:', error))
  .finally(() => {
    app.listen(port, bindHost || undefined, () => {
      console.log(`Cafe exporter: http://${bindHost || 'localhost'}:${port}`);
    });
  });

function clientAdminCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function clientAdminText(value, maximum = 500) {
  return String(value || '').trim().slice(0, maximum);
}

function clientAdminAddressText(value) {
  let source = value && typeof value === 'object'
    ? (value.display ?? value.value ?? value.address ?? '')
    : value;
  if (source && typeof source === 'object') {
    source = source.en ?? source.it ?? source.ru ?? Object.values(source).find((entry) => typeof entry === 'string') ?? '';
  }
  const address = clientAdminText(source, 260);
  return address === '[object Object]' ? '' : address;
}

function clientAdminId(value, fallback) {
  const normalized = clientAdminText(value, 80).toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function clientAdminMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100_000 ? Math.round(amount * 100) / 100 : 0;
}

// EU Regulation 1169/2011: the 14 regulated allergen groups. The saved value
// is a stable key; labels are resolved for both the admin and public menu.
const CLIENT_ADMIN_ALLERGENS = [
  ['gluten', { en: 'Cereals containing gluten', de: 'Glutenhaltiges Getreide', es: 'Cereales con gluten', pt: 'Cereais com glúten', it: 'Cereali contenenti glutine', cs: 'Obiloviny obsahující lepek', hu: 'Glutént tartalmazó gabonafélék', pl: 'Zboża zawierające gluten', nl: 'Glutenbevattende granen', fr: 'Céréales contenant du gluten', hr: 'Žitarice koje sadrže gluten', ru: 'Злаки, содержащие глютен' }],
  ['crustaceans', { en: 'Crustaceans', de: 'Krebstiere', es: 'Crustáceos', pt: 'Crustáceos', it: 'Crostacei', cs: 'Korýši', hu: 'Rákfélék', pl: 'Skorupiaki', nl: 'Schaaldieren', fr: 'Crustacés', hr: 'Rakovi', ru: 'Ракообразные' }],
  ['eggs', { en: 'Eggs', de: 'Eier', es: 'Huevos', pt: 'Ovos', it: 'Uova', cs: 'Vejce', hu: 'Tojás', pl: 'Jaja', nl: 'Eieren', fr: 'Œufs', hr: 'Jaja', ru: 'Яйца' }],
  ['fish', { en: 'Fish', de: 'Fisch', es: 'Pescado', pt: 'Peixe', it: 'Pesce', cs: 'Ryby', hu: 'Hal', pl: 'Ryby', nl: 'Vis', fr: 'Poissons', hr: 'Riba', ru: 'Рыба' }],
  ['peanuts', { en: 'Peanuts', de: 'Erdnüsse', es: 'Cacahuetes', pt: 'Amendoins', it: 'Arachidi', cs: 'Arašídy', hu: 'Földimogyoró', pl: 'Orzeszki ziemne', nl: "Pinda's", fr: 'Arachides', hr: 'Kikiriki', ru: 'Арахис' }],
  ['soy', { en: 'Soybeans', de: 'Sojabohnen', es: 'Soja', pt: 'Soja', it: 'Soia', cs: 'Sója', hu: 'Szójabab', pl: 'Soja', nl: 'Sojabonen', fr: 'Soja', hr: 'Soja', ru: 'Соя' }],
  ['milk', { en: 'Milk', de: 'Milch', es: 'Leche', pt: 'Leite', it: 'Latte', cs: 'Mléko', hu: 'Tej', pl: 'Mleko', nl: 'Melk', fr: 'Lait', hr: 'Mlijeko', ru: 'Молоко' }],
  ['nuts', { en: 'Nuts', de: 'Schalenfrüchte', es: 'Frutos de cáscara', pt: 'Frutos de casca rija', it: 'Frutta a guscio', cs: 'Skořápkové plody', hu: 'Diófélék', pl: 'Orzechy', nl: 'Noten', fr: 'Fruits à coque', hr: 'Orašasti plodovi', ru: 'Орехи' }],
  ['celery', { en: 'Celery', de: 'Sellerie', es: 'Apio', pt: 'Aipo', it: 'Sedano', cs: 'Celer', hu: 'Zeller', pl: 'Seler', nl: 'Selderij', fr: 'Céleri', hr: 'Celer', ru: 'Сельдерей' }],
  ['mustard', { en: 'Mustard', de: 'Senf', es: 'Mostaza', pt: 'Mostarda', it: 'Senape', cs: 'Hořčice', hu: 'Mustár', pl: 'Gorczyca', nl: 'Mosterd', fr: 'Moutarde', hr: 'Senf', ru: 'Горчица' }],
  ['sesame', { en: 'Sesame seeds', de: 'Sesamsamen', es: 'Semillas de sésamo', pt: 'Sementes de sésamo', it: 'Semi di sesamo', cs: 'Sezamová semínka', hu: 'Szezámmag', pl: 'Nasiona sezamu', nl: 'Sesamzaad', fr: 'Graines de sésame', hr: 'Sjemenke sezama', ru: 'Кунжут' }],
  ['sulphites', { en: 'Sulphur dioxide and sulphites', de: 'Schwefeldioxid und Sulfite', es: 'Dióxido de azufre y sulfitos', pt: 'Dióxido de enxofre e sulfitos', it: 'Anidride solforosa e solfiti', cs: 'Oxid siřičitý a siřičitany', hu: 'Kén-dioxid és szulfitok', pl: 'Dwutlenek siarki i siarczyny', nl: 'Zwaveldioxide en sulfieten', fr: 'Anhydride sulfureux et sulfites', hr: 'Sumporni dioksid i sulfiti', ru: 'Диоксид серы и сульфиты' }],
  ['lupin', { en: 'Lupin', de: 'Lupinen', es: 'Altramuces', pt: 'Tremoço', it: 'Lupini', cs: 'Vlčí bob', hu: 'Csillagfürt', pl: 'Łubin', nl: 'Lupine', fr: 'Lupin', hr: 'Lupin', ru: 'Люпин' }],
  ['molluscs', { en: 'Molluscs', de: 'Weichtiere', es: 'Moluscos', pt: 'Moluscos', it: 'Molluschi', cs: 'Měkkýši', hu: 'Puhatestűek', pl: 'Mięczaki', nl: 'Weekdieren', fr: 'Mollusques', hr: 'Mekušci', ru: 'Моллюски' }]
].map(([id, translations]) => ({ id, translations }));

function clientAdminAllergenNormalized(value) {
  return clientAdminText(value, 160).toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

const CLIENT_ADMIN_ALLERGEN_INDEX = new Map(CLIENT_ADMIN_ALLERGENS.flatMap((entry) => [entry.id, ...Object.values(entry.translations)].map((label) => [clientAdminAllergenNormalized(label), entry.id])));

function clientAdminAllergenId(value) {
  const raw = clientAdminText(value, 160).replace(/^allergen:/i, '');
  return CLIENT_ADMIN_ALLERGEN_INDEX.get(clientAdminAllergenNormalized(raw)) || '';
}

function clientAdminCanonicalAllergen(value) {
  const id = clientAdminAllergenId(value);
  return id ? `allergen:${id}` : clientAdminText(value, 48);
}

function clientAdminAllergenLabel(value, languageCode = 'en') {
  const id = clientAdminAllergenId(value);
  const entry = CLIENT_ADMIN_ALLERGENS.find((candidate) => candidate.id === id);
  return entry?.translations[languageCode] || entry?.translations.en || clientAdminText(value, 48).replace(/^allergen:/i, '');
}

function clientAdminAllergenCatalog() {
  return CLIENT_ADMIN_ALLERGENS.map((entry) => ({ id: entry.id, translations: entry.translations }));
}

const CLIENT_ADMIN_WEEK_DAYS = [
  ['mon', { en: 'Monday', ru: 'Понедельник', it: 'Lunedì', de: 'Montag', es: 'Lunes', pt: 'Segunda-feira', cs: 'Pondělí', hu: 'Hétfő', pl: 'Poniedziałek', nl: 'Maandag', fr: 'Lundi', hr: 'Ponedjeljak' }],
  ['tue', { en: 'Tuesday', ru: 'Вторник', it: 'Martedì', de: 'Dienstag', es: 'Martes', pt: 'Terça-feira', cs: 'Úterý', hu: 'Kedd', pl: 'Wtorek', nl: 'Dinsdag', fr: 'Mardi', hr: 'Utorak' }],
  ['wed', { en: 'Wednesday', ru: 'Среда', it: 'Mercoledì', de: 'Mittwoch', es: 'Miércoles', pt: 'Quarta-feira', cs: 'Středa', hu: 'Szerda', pl: 'Środa', nl: 'Woensdag', fr: 'Mercredi', hr: 'Srijeda' }],
  ['thu', { en: 'Thursday', ru: 'Четверг', it: 'Giovedì', de: 'Donnerstag', es: 'Jueves', pt: 'Quinta-feira', cs: 'Čtvrtek', hu: 'Csütörtök', pl: 'Czwartek', nl: 'Donderdag', fr: 'Jeudi', hr: 'Četvrtak' }],
  ['fri', { en: 'Friday', ru: 'Пятница', it: 'Venerdì', de: 'Freitag', es: 'Viernes', pt: 'Sexta-feira', cs: 'Pátek', hu: 'Péntek', pl: 'Piątek', nl: 'Vrijdag', fr: 'Vendredi', hr: 'Petak' }],
  ['sat', { en: 'Saturday', ru: 'Суббота', it: 'Sabato', de: 'Samstag', es: 'Sábado', pt: 'Sábado', cs: 'Sobota', hu: 'Szombat', pl: 'Sobota', nl: 'Zaterdag', fr: 'Samedi', hr: 'Subota' }],
  ['sun', { en: 'Sunday', ru: 'Воскресенье', it: 'Domenica', de: 'Sonntag', es: 'Domingo', pt: 'Domingo', cs: 'Neděle', hu: 'Vasárnap', pl: 'Niedziela', nl: 'Zondag', fr: 'Dimanche', hr: 'Nedjelja' }]
];

function clientAdminWeekdayLabel(dayId, languageCode = 'en') {
  const labels = CLIENT_ADMIN_WEEK_DAYS.find(([id]) => id === dayId)?.[1];
  return labels?.[languageCode] || labels?.en || '';
}

function clientAdminWeekdayId(entry) {
  const explicit = String(entry?.dayId || '').toLowerCase();
  if (CLIENT_ADMIN_WEEK_DAYS.some(([id]) => id === explicit)) return explicit;
  const value = clientAdminText(entry?.day, 80).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  for (const [id, labels] of CLIENT_ADMIN_WEEK_DAYS) {
    if (Object.values(labels).some((label) => value.includes(String(label).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()))) return id;
  }
  return '';
}

function clientAdminWeeklyHours(entries, prefix, fallbackEntries = []) {
  const source = Array.isArray(entries) ? entries : [];
  const fallback = source[0] || (Array.isArray(fallbackEntries) ? fallbackEntries[0] : null) || null;
  const byDay = new Map();
  for (const entry of source) {
    const dayId = clientAdminWeekdayId(entry);
    if (dayId && !byDay.has(dayId)) byDay.set(dayId, entry);
  }
  return CLIENT_ADMIN_WEEK_DAYS.map(([dayId], index) => {
    const matchedEntry = byDay.get(dayId);
    const entry = matchedEntry || fallback || {};
    return {
      id: matchedEntry ? clientAdminId(matchedEntry.id, `${prefix}-${dayId}`) : `${prefix}-${dayId}`,
      dayId,
      day: clientAdminWeekdayLabel(dayId, 'en'),
      from: /^\d{2}:\d{2}$/.test(String(entry?.from || '')) ? entry.from : '',
      to: /^\d{2}:\d{2}$/.test(String(entry?.to || '')) ? entry.to : '',
      closed: fallback ? Boolean(entry?.closed) : true,
      order: index + 1
    };
  });
}

function sanitizeClientAdminDraft(input, previous = {}) {
  if (!input || typeof input !== 'object') throw new Error('Некорректный черновик.');
  const restaurant = input.restaurant && typeof input.restaurant === 'object' ? input.restaurant : {};
  const previousRestaurant = previous.restaurant || {};
  const sourceLanguages = Array.isArray(input.languages) ? input.languages : previous.languages || [];
  const usedLanguageCodes = new Set();
  const languages = sourceLanguages.slice(0, 16).map((language, index) => ({
    code: clientAdminId(language?.code, `lang-${index + 1}`).slice(0, 10),
    label: clientAdminText(language?.label, 32) || clientAdminId(language?.code, 'EN').toUpperCase()
  })).filter((language) => {
    if (usedLanguageCodes.has(language.code)) return false;
    usedLanguageCodes.add(language.code);
    return true;
  });
  if (!languages.length) languages.push({ code: 'en', label: 'EN' });
  const sourceCategories = Array.isArray(input.categories) ? input.categories : previous.categories || [];
  const categories = sourceCategories.slice(0, 30).map((category, index) => ({
    id: clientAdminId(category?.id, `category-${index + 1}`),
    name: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(category?.name?.[language.code], 80)])),
    icon: clientAdminText(category?.icon, 32) || 'plate',
    order: index + 1
  }));
  const categoryIds = new Set(categories.map((category) => category.id));
  const fallbackCategory = categories[0]?.id || '';
  const sourceItems = Array.isArray(input.menuItems) ? input.menuItems : previous.menuItems || [];
  const menuItems = sourceItems.slice(0, 250).map((item, index) => ({
    id: clientAdminId(item?.id, `menu-item-${index + 1}`),
    categoryId: categoryIds.has(item?.categoryId) ? item.categoryId : fallbackCategory,
    name: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(item?.name?.[language.code], 100)])),
    description: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(item?.description?.[language.code], 400)])),
    price: { amount: clientAdminMoney(item?.price?.amount), currency: clientAdminText(item?.price?.currency, 8) || 'EUR' },
    imageUrl: clientAdminText(item?.imageUrl, 1_000),
    portion: clientAdminText(item?.portion, 80),
    variants: (Array.isArray(item?.variants) ? item.variants : []).slice(0, 12).map((variant, variantIndex) => ({
      id: clientAdminId(variant?.id, `variant-${variantIndex + 1}`),
      name: clientAdminText(variant?.name, 80),
      price: clientAdminMoney(variant?.price)
    })).filter((variant) => variant.name),
    modifiers: (Array.isArray(item?.modifiers) ? item.modifiers : []).slice(0, 12).map((modifier, modifierIndex) => ({
      id: clientAdminId(modifier?.id, `modifier-${modifierIndex + 1}`),
      name: clientAdminText(modifier?.name, 80),
      price: clientAdminMoney(modifier?.price)
    })).filter((modifier) => modifier.name),
    tags: (Array.isArray(item?.tags) ? item.tags : []).slice(0, 8).map((tag) => clientAdminText(tag, 32)).filter(Boolean),
    allergens: [...new Set((Array.isArray(item?.allergens) ? item.allergens : []).slice(0, 16).map(clientAdminCanonicalAllergen).filter(Boolean))],
    allergensConfirmed: Boolean(item?.allergensConfirmed),
    availability: item?.availability === 'unavailable' ? 'unavailable' : 'available',
    visibility: item?.visibility === 'hidden' ? 'hidden' : 'visible',
    featured: Boolean(item?.featured),
    order: index + 1
  }));
  const sourceHours = Array.isArray(input.openingHours) ? input.openingHours : previous.openingHours || [];
  const openingHours = clientAdminWeeklyHours(sourceHours, 'hours', previous.openingHours || []);
  const sourceKitchenHours = Array.isArray(input.kitchenHours) ? input.kitchenHours : previous.kitchenHours || [];
  const kitchenHours = clientAdminWeeklyHours(sourceKitchenHours, 'kitchen-hours', openingHours);
  const sourceSpecialHours = Array.isArray(input.specialOpeningHours) ? input.specialOpeningHours : previous.specialOpeningHours || [];
  const specialOpeningHours = sourceSpecialHours.slice(0, 40).map((entry, index) => ({
    id: clientAdminId(entry?.id, `special-hours-${index + 1}`),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.date || '')) ? entry.date : '',
    label: clientAdminText(entry?.label, 80),
    from: /^\d{2}:\d{2}$/.test(String(entry?.from || '')) ? entry.from : '',
    to: /^\d{2}:\d{2}$/.test(String(entry?.to || '')) ? entry.to : '',
    closed: Boolean(entry?.closed)
  })).filter((entry) => entry.date);
  const sourceClosure = input.temporaryClosure && typeof input.temporaryClosure === 'object' ? input.temporaryClosure : previous.temporaryClosure || {};
  const temporaryClosure = {
    closed: Boolean(sourceClosure.closed),
    resumeDate: /^\d{4}-\d{2}-\d{2}$/.test(String(sourceClosure.resumeDate || '')) ? sourceClosure.resumeDate : '',
    message: clientAdminText(sourceClosure.message, 240)
  };
  const socials = (Array.isArray(restaurant.socials) ? restaurant.socials : previousRestaurant.socials || []).slice(0, 8)
    .map((social) => ({ platform: clientAdminText(social?.platform, 30), url: clientAdminText(social?.url, 1_000) }))
    .filter((social) => social.platform || social.url);
  return {
    id: clientAdminText(input.id || previous.id, 80) || 'draft',
    number: Number.isInteger(previous.number) ? previous.number : 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Владелец ресторана',
    restaurant: {
      name: clientAdminText(restaurant.name ?? previousRestaurant.name, 140),
      subtitle: clientAdminText(restaurant.subtitle ?? previousRestaurant.subtitle, 220),
      description: clientAdminText(restaurant.description ?? previousRestaurant.description, 1_200),
      logoUrl: clientAdminText(restaurant.logoUrl ?? previousRestaurant.logoUrl, 1_000),
      address: clientAdminAddressText(restaurant.address ?? previousRestaurant.address),
      mapUrl: clientAdminText(restaurant.mapUrl ?? previousRestaurant.mapUrl, 1_000),
      phone: clientAdminText(restaurant.phone ?? previousRestaurant.phone, 48),
      email: clientAdminText(restaurant.email ?? previousRestaurant.email, 160),
      websiteUrl: clientAdminText(restaurant.websiteUrl ?? previousRestaurant.websiteUrl, 1_000),
      bookingUrl: clientAdminText(restaurant.bookingUrl ?? previousRestaurant.bookingUrl, 1_000),
      orderUrl: clientAdminText(restaurant.orderUrl ?? previousRestaurant.orderUrl, 1_000),
      socials
    },
    languages,
    menuMode: input.menuMode === 'seasonal' ? 'seasonal' : 'regular',
    openingHours,
    kitchenHours,
    specialOpeningHours,
    temporaryClosure,
    categories,
    menuItems
  };
}

function clientAdminVersionSummary(version) {
  return {
    number: version.number,
    status: version.status || 'published',
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    note: version.note || '',
    itemCount: Array.isArray(version.snapshot?.menuItems) ? version.snapshot.menuItems.length : 0
  };
}

const CLIENT_ADMIN_PUBLIC_TRANSLATIONS = {
  en: {
    bookTable: 'Book a table', all: 'All', directions: 'Directions', open: 'Open', closed: 'Closed', statusUnknown: 'Opening hours unavailable', allergens: 'Allergens', ingredients: 'Ingredients', rating: 'Rating', reviews: 'reviews', contactUs: 'Contact us', followUs: 'Follow us', openingHours: 'Opening hours', website: 'Website', privacyPolicy: 'Privacy policy', termsOfService: 'Terms of service', imprint: 'Imprint', skipToMenu: 'Skip to menu', mapUnavailable: 'Map is not available', photoUnavailable: 'Photo unavailable', tags: { vegetarian: 'Vegetarian', vegan: 'Vegan', spicy: 'Spicy', 'gluten-related': 'Gluten related', 'chef-choice': "Chef's choice", bestseller: 'Bestseller', seasonal: 'Seasonal' }
  },
  it: {
    bookTable: 'Prenota un tavolo', all: 'Tutto', directions: 'Indicazioni', open: 'Aperto', closed: 'Chiuso', statusUnknown: 'Orari non disponibili', allergens: 'Allergeni', ingredients: 'Ingredienti', rating: 'Valutazione', reviews: 'recensioni', contactUs: 'Contatti', followUs: 'Seguici', openingHours: 'Orari di apertura', website: 'Sito web', privacyPolicy: 'Privacy', termsOfService: 'Termini di servizio', imprint: 'Note legali', skipToMenu: 'Vai al menu', mapUnavailable: 'Mappa non disponibile', photoUnavailable: 'Foto non disponibile', tags: { vegetarian: 'Vegetariano', vegan: 'Vegano', spicy: 'Piccante', 'gluten-related': 'Con glutine', 'chef-choice': 'Scelta dello chef', bestseller: 'Piu richiesto', seasonal: 'Stagionale' }
  },
  de: {
    bookTable: 'Tisch reservieren', all: 'Alle', directions: 'Route', open: 'Geoeffnet', closed: 'Geschlossen', statusUnknown: 'Oeffnungszeiten nicht verfuegbar', allergens: 'Allergene', ingredients: 'Zutaten', rating: 'Bewertung', reviews: 'Bewertungen', contactUs: 'Kontakt', followUs: 'Folgen Sie uns', openingHours: 'Oeffnungszeiten', website: 'Webseite', privacyPolicy: 'Datenschutz', termsOfService: 'Nutzungsbedingungen', imprint: 'Impressum', skipToMenu: 'Zum Menue', mapUnavailable: 'Karte nicht verfuegbar', photoUnavailable: 'Foto nicht verfuegbar', tags: { vegetarian: 'Vegetarisch', vegan: 'Vegan', spicy: 'Scharf', 'gluten-related': 'Enthaelt Gluten', 'chef-choice': 'Empfehlung des Chefs', bestseller: 'Bestseller', seasonal: 'Saisonal' }
  },
  es: {
    bookTable: 'Reservar mesa', all: 'Todo', directions: 'Como llegar', open: 'Abierto', closed: 'Cerrado', statusUnknown: 'Horario no disponible', allergens: 'Alergenos', ingredients: 'Ingredientes', rating: 'Valoracion', reviews: 'resenas', contactUs: 'Contacto', followUs: 'Siguenos', openingHours: 'Horario de apertura', website: 'Sitio web', privacyPolicy: 'Privacidad', termsOfService: 'Terminos de servicio', imprint: 'Aviso legal', skipToMenu: 'Ir al menu', mapUnavailable: 'Mapa no disponible', photoUnavailable: 'Foto no disponible', tags: { vegetarian: 'Vegetariano', vegan: 'Vegano', spicy: 'Picante', 'gluten-related': 'Contiene gluten', 'chef-choice': 'Eleccion del chef', bestseller: 'Mas popular', seasonal: 'De temporada' }
  },
  pt: {
    bookTable: 'Reservar uma mesa', all: 'Tudo', directions: 'Rotas', open: 'Aberto', closed: 'Fechado', statusUnknown: 'Horario indisponivel', allergens: 'Alergenios', ingredients: 'Ingredientes', rating: 'Avaliacao', reviews: 'avaliacoes', contactUs: 'Contacte-nos', followUs: 'Siga-nos', openingHours: 'Horario de funcionamento', website: 'Website', privacyPolicy: 'Privacidade', termsOfService: 'Termos de servico', imprint: 'Informacao legal', skipToMenu: 'Ir para o menu', mapUnavailable: 'Mapa indisponivel', photoUnavailable: 'Foto indisponivel', tags: { vegetarian: 'Vegetariano', vegan: 'Vegano', spicy: 'Picante', 'gluten-related': 'Com gluten', 'chef-choice': 'Escolha do chef', bestseller: 'Mais popular', seasonal: 'Sazonal' }
  },
  cs: {
    bookTable: 'Rezervovat stul', all: 'Vse', directions: 'Trasa', open: 'Otevreno', closed: 'Zavreno', statusUnknown: 'Oteviraci doba neni k dispozici', allergens: 'Alergeny', ingredients: 'Slozeni', rating: 'Hodnoceni', reviews: 'recenzi', contactUs: 'Kontakt', followUs: 'Sledujte nas', openingHours: 'Oteviraci doba', website: 'Web', privacyPolicy: 'Ochrana soukromi', termsOfService: 'Podminky sluzby', imprint: 'Pravni informace', skipToMenu: 'Prejit do menu', mapUnavailable: 'Mapa neni k dispozici', photoUnavailable: 'Fotografie neni k dispozici', tags: { vegetarian: 'Vegetarianske', vegan: 'Veganske', spicy: 'Pikantni', 'gluten-related': 'Obsahuje lepek', 'chef-choice': 'Volba sefkuchare', bestseller: 'Nejoblibenejsi', seasonal: 'Sezonni' }
  },
  hu: {
    bookTable: 'Asztalfoglalas', all: 'Osszes', directions: 'Utmutato', open: 'Nyitva', closed: 'Zarva', statusUnknown: 'Nyitvatartas nem erheto el', allergens: 'Allergenek', ingredients: 'Osszetevok', rating: 'Ertekeles', reviews: 'velemeny', contactUs: 'Kapcsolat', followUs: 'Kovessen minket', openingHours: 'Nyitvatartas', website: 'Weboldal', privacyPolicy: 'Adatvedelem', termsOfService: 'Szolgaltatasi feltetelek', imprint: 'Jogi nyilatkozat', skipToMenu: 'Ugras az etlapra', mapUnavailable: 'A terkep nem erheto el', photoUnavailable: 'A foto nem erheto el', tags: { vegetarian: 'Vegetarianus', vegan: 'Vegán', spicy: 'Csipos', 'gluten-related': 'Glutent tartalmaz', 'chef-choice': 'A sef ajanlata', bestseller: 'Nepszeru', seasonal: 'Szezonalis' }
  },
  pl: {
    bookTable: 'Zarezerwuj stolik', all: 'Wszystko', directions: 'Wskazowki', open: 'Otwarte', closed: 'Zamkniete', statusUnknown: 'Godziny otwarcia niedostepne', allergens: 'Alergeny', ingredients: 'Skladniki', rating: 'Ocena', reviews: 'opinii', contactUs: 'Kontakt', followUs: 'Obserwuj nas', openingHours: 'Godziny otwarcia', website: 'Strona internetowa', privacyPolicy: 'Prywatnosc', termsOfService: 'Warunki korzystania', imprint: 'Informacje prawne', skipToMenu: 'Przejdz do menu', mapUnavailable: 'Mapa niedostepna', photoUnavailable: 'Zdjecie niedostepne', tags: { vegetarian: 'Wegetarianskie', vegan: 'Veganskie', spicy: 'Ostre', 'gluten-related': 'Zawiera gluten', 'chef-choice': 'Wybor szefa', bestseller: 'Bestseller', seasonal: 'Sezonowe' }
  },
  nl: {
    bookTable: 'Tafel reserveren', all: 'Alles', directions: 'Route', open: 'Open', closed: 'Gesloten', statusUnknown: 'Openingstijden niet beschikbaar', allergens: 'Allergenen', ingredients: 'Ingredienten', rating: 'Beoordeling', reviews: 'beoordelingen', contactUs: 'Contact', followUs: 'Volg ons', openingHours: 'Openingstijden', website: 'Website', privacyPolicy: 'Privacy', termsOfService: 'Servicevoorwaarden', imprint: 'Colofon', skipToMenu: 'Naar het menu', mapUnavailable: 'Kaart niet beschikbaar', photoUnavailable: 'Foto niet beschikbaar', tags: { vegetarian: 'Vegetarisch', vegan: 'Veganistisch', spicy: 'Pittig', 'gluten-related': 'Bevat gluten', 'chef-choice': 'Keuze van de chef', bestseller: 'Bestseller', seasonal: 'Seizoensgebonden' }
  },
  fr: {
    bookTable: 'Reserver une table', all: 'Tout', directions: 'Itineraire', open: 'Ouvert', closed: 'Ferme', statusUnknown: 'Horaires indisponibles', allergens: 'Allergenes', ingredients: 'Ingredients', rating: 'Note', reviews: 'avis', contactUs: 'Nous contacter', followUs: 'Suivez-nous', openingHours: 'Horaires d ouverture', website: 'Site web', privacyPolicy: 'Confidentialite', termsOfService: 'Conditions de service', imprint: 'Mentions legales', skipToMenu: 'Aller au menu', mapUnavailable: 'Carte indisponible', photoUnavailable: 'Photo indisponible', tags: { vegetarian: 'Vegetarien', vegan: 'Vegetalien', spicy: 'Epice', 'gluten-related': 'Contient du gluten', 'chef-choice': 'Choix du chef', bestseller: 'Le plus populaire', seasonal: 'De saison' }
  },
  hr: {
    bookTable: 'Rezerviraj stol', all: 'Sve', directions: 'Upute', open: 'Otvoreno', closed: 'Zatvoreno', statusUnknown: 'Radno vrijeme nije dostupno', allergens: 'Alergeni', ingredients: 'Sastojci', rating: 'Ocjena', reviews: 'recenzija', contactUs: 'Kontaktirajte nas', followUs: 'Pratite nas', openingHours: 'Radno vrijeme', website: 'Web-stranica', privacyPolicy: 'Privatnost', termsOfService: 'Uvjeti usluge', imprint: 'Pravne informacije', skipToMenu: 'Idi na jelovnik', mapUnavailable: 'Karta nije dostupna', photoUnavailable: 'Fotografija nije dostupna', tags: { vegetarian: 'Vegetarijansko', vegan: 'Vegansko', spicy: 'Ljuto', 'gluten-related': 'Sadrzi gluten', 'chef-choice': 'Izbor sefa', bestseller: 'Najpopularnije', seasonal: 'Sezonsko' }
  }
};

function clientAdminPublicTranslations(languageCode) {
  return clientAdminCopy(CLIENT_ADMIN_PUBLIC_TRANSLATIONS[languageCode] || CLIENT_ADMIN_PUBLIC_TRANSLATIONS.en);
}

function clientAdminPublicIcon(icon) {
  const icons = { sun: 'mug-hot', cup: 'mug-hot', coffee: 'mug-hot', cake: 'cake-candles', fish: 'fish', leaf: 'leaf', plate: 'utensils' };
  return icons[clientAdminText(icon, 32).toLowerCase()] || 'utensils';
}

function clientAdminPublicPrice(price) {
  const currency = clientAdminText(price?.currency, 8).toUpperCase() || 'EUR';
  const amount = clientAdminMoney(price?.amount);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function clientAdminPublicUrl(value) {
  const url = clientAdminText(value, 1_000);
  if (/^\/uploads\/client-admin\/(?:site_[a-f0-9]{16}\/)?[a-z0-9-]+\.(?:png|jpe?g|webp|gif)$/i.test(url)) return url;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:' ? url : '';
  } catch {
    return '';
  }
}

function clientAdminPublishedMenuContent(workspace) {
  const snapshot = workspace.published?.snapshot;
  if (!snapshot) throw new Error('Нет опубликованной версии меню.');
  const languages = (Array.isArray(snapshot.languages) ? snapshot.languages : [])
    .map((language) => ({ code: clientAdminText(language?.code, 8).toLowerCase(), label: clientAdminText(language?.label, 16).toUpperCase() }))
    .filter((language) => /^[a-z]{2,8}$/.test(language.code));
  if (!languages.length) languages.push({ code: 'en', label: 'EN' });
  const nativeLanguage = languages[0].code;
  const restaurant = snapshot.restaurant || {};
  const categories = (Array.isArray(snapshot.categories) ? snapshot.categories : [])
    .map((category, index) => ({
      id: clientAdminId(category?.id, `category-${index + 1}`),
      label: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(category?.name?.[language.code] || category?.name?.en, 80)])),
      icon: clientAdminPublicIcon(category?.icon),
      order: index + 1
    }));
  const categoryIds = new Set(categories.map((category) => category.id));
  const items = (Array.isArray(snapshot.menuItems) ? snapshot.menuItems : [])
    .filter((item) => item?.visibility !== 'hidden' && item?.availability !== 'unavailable' && categoryIds.has(item?.categoryId))
    .map((item) => ({
      id: clientAdminId(item.id, randomUUID()),
      categoryId: item.categoryId,
      image: clientAdminPublicUrl(item.imageUrl) ? { src: item.imageUrl, alt: clientAdminText(item?.name?.[nativeLanguage] || item?.name?.en, 120) } : null,
      translations: Object.fromEntries(languages.map((language) => [language.code, {
        name: clientAdminText(item?.name?.[language.code] || item?.name?.en, 100),
        description: clientAdminText(item?.description?.[language.code] || item?.description?.en, 400)
      }])),
      dietaryTags: (Array.isArray(item.tags) ? item.tags : []).map((tag) => clientAdminText(tag, 32).toLowerCase()).filter(Boolean),
      allergens: Object.fromEntries(languages.map((language) => [
        language.code,
        [...new Set((Array.isArray(item.allergens) ? item.allergens : []).map((allergen) => clientAdminAllergenLabel(allergen, language.code)).filter(Boolean))]
      ])),
      allergenStatus: item.allergensConfirmed ? 'verified' : 'unverified',
      featured: Boolean(item.featured),
      portion: clientAdminText(item.portion, 80),
      variants: (Array.isArray(item.variants) ? item.variants : []).map((variant) => ({ name: clientAdminText(variant?.name, 80), formattedPrice: clientAdminPublicPrice({ amount: variant?.price, currency: item?.price?.currency }) })).filter((variant) => variant.name),
      modifiers: (Array.isArray(item.modifiers) ? item.modifiers : []).map((modifier) => ({ name: clientAdminText(modifier?.name, 80), formattedPrice: clientAdminPublicPrice({ amount: modifier?.price, currency: item?.price?.currency }) })).filter((modifier) => modifier.name),
      pricing: { native: { formatted: clientAdminPublicPrice(item.price), currency: clientAdminText(item?.price?.currency, 8).toUpperCase() || 'EUR' } }
    }));
  const base = workspace.publishedTemplateBase && typeof workspace.publishedTemplateBase === 'object' ? workspace.publishedTemplateBase : null;
  const address = clientAdminAddressText(restaurant.address) || clientAdminAddressText(base?.restaurant?.address);
  const directionsUrl = clientAdminPublicUrl(restaurant.mapUrl) || clientAdminPublicUrl(base?.map?.directionsUrl) || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '');
  const specialToday = (Array.isArray(snapshot.specialOpeningHours) ? snapshot.specialOpeningHours : []).find((entry) => entry?.date === new Date().toISOString().slice(0, 10));
  const closure = snapshot.temporaryClosure || {};
  const openingHours = {
    status: closure.closed || specialToday?.closed ? 'closed' : 'unknown',
    todayLabel: closure.closed ? clientAdminText(closure.message, 240) || 'Temporarily closed' : specialToday?.closed ? 'Closed today' : '',
    schedule: (Array.isArray(snapshot.openingHours) ? snapshot.openingHours : []).map((entry) => ({
      label: Object.fromEntries(languages.map((language) => [language.code, clientAdminWeekdayLabel(entry?.dayId, language.code) || clientAdminText(entry?.day, 40)])),
      value: Object.fromEntries(languages.map((language) => [language.code, entry?.closed ? clientAdminPublicTranslations(language.code).closed : [entry?.from, entry?.to].filter(Boolean).join('–')]))
    })).filter((entry) => Object.values(entry.label).some(Boolean))
  };
  const generated = {
    template: { id: 'classic-light', version: '1.2.0' },
    restaurant: {
      name: clientAdminText(restaurant.name, 140), subtitle: clientAdminText(restaurant.subtitle, 220), description: clientAdminText(restaurant.description, 1_200), logo: clientAdminPublicUrl(restaurant.logoUrl) ? { src: restaurant.logoUrl, alt: clientAdminText(restaurant.name, 140) } : null,
      websiteUrl: clientAdminPublicUrl(restaurant.websiteUrl), phone: { display: clientAdminText(restaurant.phone, 48), normalized: clientAdminText(restaurant.phone, 48).replace(/[^+\d]/g, '') },
      email: clientAdminText(restaurant.email, 160), address: { display: address, city: '', country: '', latitude: null, longitude: null },
      openingHours, bookingUrl: clientAdminPublicUrl(restaurant.bookingUrl), rating: null, reviewsCount: null, category: '', priceLevel: '', locationImage: null,
      socials: (Array.isArray(restaurant.socials) ? restaurant.socials : []).map((social) => ({ platform: clientAdminText(social?.platform, 30).toLowerCase(), url: clientAdminPublicUrl(social?.url) })).filter((social) => social.platform && social.url)
    },
    localization: { nativeLanguage, activeLanguage: nativeLanguage, languages, translations: Object.fromEntries(languages.map((language) => [language.code, clientAdminPublicTranslations(language.code)])) },
    menu: { categories, items, mode: snapshot.menuMode === 'seasonal' ? 'seasonal' : 'regular' },
    map: { provider: '', embedUrl: '', directionsUrl, latitude: null, longitude: null, markerLabel: clientAdminText(restaurant.name, 140) },
    templateOptions: { showIngredients: false, showAllergens: true, showConvertedPrices: false, showMap: Boolean(directionsUrl || clientAdminPublicUrl(base?.map?.embedUrl) || clientAdminPublicUrl(base?.map?.directionsUrl)), showSocials: true, showBookingButton: Boolean(clientAdminPublicUrl(restaurant.bookingUrl)), stickyCategories: true, menuDensity: base?.templateOptions?.menuDensity || 'comfortable' },
    footer: { copyright: `© ${new Date().getFullYear()} ${clientAdminText(restaurant.name, 140)}.`, privacyUrl: '', termsUrl: '', imprintUrl: '' },
    analytics: { tenantId: workspace.tenant.id }
  };
  if (!base) return generated;
  return {
    ...base,
    ...generated,
    restaurant: {
      ...(base.restaurant || {}),
      ...generated.restaurant,
      address: { ...(base.restaurant?.address || {}), ...generated.restaurant.address },
      rating: generated.restaurant.rating ?? base.restaurant?.rating ?? null,
      reviewsCount: generated.restaurant.reviewsCount ?? base.restaurant?.reviewsCount ?? null,
      category: generated.restaurant.category || base.restaurant?.category || '',
      priceLevel: generated.restaurant.priceLevel || base.restaurant?.priceLevel || '',
      locationImage: generated.restaurant.locationImage || base.restaurant?.locationImage || null
    },
    map: { ...(base.map || {}), ...generated.map, embedUrl: generated.map.embedUrl || base.map?.embedUrl || '', directionsUrl: generated.map.directionsUrl || base.map?.directionsUrl || '' },
    templateOptions: { ...(base.templateOptions || {}), ...generated.templateOptions },
    footer: { ...(base.footer || {}), ...generated.footer },
    analytics: { ...(base.analytics || {}), ...generated.analytics }
  };
}

const CLIENT_ADMIN_EU_COUNTRIES = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);
const CLIENT_ADMIN_COUNTRY_NAMES = {
  AT: 'Австрия', BE: 'Бельгия', BG: 'Болгария', BY: 'Беларусь', CY: 'Кипр', CZ: 'Чехия', DE: 'Германия', DK: 'Дания',
  EE: 'Эстония', ES: 'Испания', FI: 'Финляндия', FR: 'Франция', GR: 'Греция', HR: 'Хорватия', HU: 'Венгрия', IE: 'Ирландия',
  IT: 'Италия', KZ: 'Казахстан', LT: 'Литва', LU: 'Люксембург', LV: 'Латвия', MT: 'Мальта', NL: 'Нидерланды', PL: 'Польша',
  PT: 'Португалия', RO: 'Румыния', RU: 'Россия', SE: 'Швеция', SI: 'Словения', SK: 'Словакия', OTHER: 'другая страна'
};
const CLIENT_ADMIN_COUNTRY_ALIASES = [
  ['AT', ['austria', 'osterreich', 'австрия']], ['BE', ['belgium', 'belgie', 'belgique', 'бельгия']], ['BG', ['bulgaria', 'българия', 'болгария']],
  ['BY', ['belarus', 'беларусь']], ['CY', ['cyprus', 'κύπρος', 'кипр']], ['CZ', ['czechia', 'czech republic', 'cesko', 'česko', 'чехия']],
  ['DE', ['germany', 'deutschland', 'германия']], ['DK', ['denmark', 'danmark', 'дания']], ['EE', ['estonia', 'eesti', 'эстония']],
  ['ES', ['spain', 'espana', 'españa', 'испания']], ['FI', ['finland', 'suomi', 'финляндия']], ['FR', ['france', 'франция']],
  ['GR', ['greece', 'ελλάδα', 'ellada', 'греция']], ['HR', ['croatia', 'hrvatska', 'хорватия']], ['HU', ['hungary', 'magyarország', 'венгрия']],
  ['IE', ['ireland', 'éire', 'ирландия']], ['IT', ['italy', 'italia', 'италия']], ['KZ', ['kazakhstan', 'казахстан']],
  ['LT', ['lithuania', 'lietuva', 'литва']], ['LU', ['luxembourg', 'luxemburg', 'люксембург']], ['LV', ['latvia', 'latvija', 'латвия']],
  ['MT', ['malta', 'мальта']], ['NL', ['netherlands', 'nederland', 'holland', 'нидерланды']], ['PL', ['poland', 'polska', 'польша']],
  ['PT', ['portugal', 'португалия']], ['RO', ['romania', 'românia', 'румыния']], ['RU', ['russia', 'россия']],
  ['SE', ['sweden', 'sverige', 'швеция']], ['SI', ['slovenia', 'slovenija', 'словения']], ['SK', ['slovakia', 'slovensko', 'словакия']]
];

function clientAdminCountryCode(value) {
  const raw = clientAdminText(value, 300).toLowerCase();
  if (CLIENT_ADMIN_COUNTRY_NAMES[raw.toUpperCase()] || CLIENT_ADMIN_EU_COUNTRIES.has(raw.toUpperCase())) return raw.toUpperCase();
  for (const [code, aliases] of CLIENT_ADMIN_COUNTRY_ALIASES) if (aliases.some((alias) => raw.includes(alias))) return code;
  return 'OTHER';
}

function clientAdminCommercialMetadataFromContent(content) {
  const address = content?.restaurant?.address || {};
  const countryCandidate = [
    address.country,
    address.display,
    ...Object.values(address.localizedDisplay || {})
  ].filter(Boolean).join(' ');
  const countryCode = clientAdminCountryCode(countryCandidate);
  return {
    countryCode,
    countrySource: countryCode === 'OTHER' ? 'needs_confirmation' : 'google_maps',
    countryDetectedAt: new Date().toISOString()
  };
}

function clientAdminPublishedCommercialMetadata(input) {
  const source = input && typeof input === 'object' ? input : {};
  const countryCode = clientAdminCountryCode(source.countryCode);
  const countrySource = source.countrySource === 'google_maps' && countryCode !== 'OTHER'
    ? 'google_maps'
    : 'needs_confirmation';
  return { countryCode, countrySource, countryDetectedAt: new Date().toISOString() };
}

function clientAdminCommercialWhatsAppUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//iu.test(raw)) return raw;
  const number = raw.replace(/\D/gu, '');
  return number.length >= 8 && number.length <= 16 ? `https://wa.me/${number}` : '';
}

function clientAdminCommercialProfile(workspace, selectedCountry = '') {
  const stored = workspace.commercial && typeof workspace.commercial === 'object' ? workspace.commercial : {};
  const sourceCountry = selectedCountry || stored.countryCode || workspace.publishedTemplateBase?.restaurant?.address?.country || workspace.draft?.restaurant?.address || '';
  const countryCode = clientAdminCountryCode(sourceCountry);
  const countrySource = selectedCountry ? 'customer_confirmation' : stored.countrySource || (countryCode === 'OTHER' ? 'needs_confirmation' : 'imported_address');
  const profile = CLIENT_ADMIN_EU_COUNTRIES.has(countryCode)
    ? { region: 'EU B2B', detail: 'Европейский союз', termsProfile: 'eu-b2b' }
    : countryCode === 'BY'
      ? { region: 'Belarus B2B', detail: 'Беларусь', termsProfile: 'belarus-b2b' }
      : countryCode === 'RU'
        ? { region: 'Russia B2B', detail: 'Россия', termsProfile: 'russia-b2b' }
        : countryCode === 'KZ'
          ? { region: 'Kazakhstan B2B', detail: 'Казахстан', termsProfile: 'kazakhstan-b2b' }
          : { region: 'International B2B', detail: 'Страна требует уточнения', termsProfile: 'international-b2b' };
  const requests = Array.isArray(stored.requests) ? stored.requests : [];
  const latestRequest = requests[0] && typeof requests[0] === 'object' ? { id: clientAdminText(requests[0].id, 80), createdAt: requests[0].createdAt, status: 'received' } : null;
  return {
    countryCode,
    countryName: CLIENT_ADMIN_COUNTRY_NAMES[countryCode] || 'другая страна',
    countrySource,
    ...profile,
    pricing: { setup: 299, monthly: 39, currency: 'EUR', taxNotice: 'до налогов' },
    termsStatus: commercialPaymentConfigured ? 'payment_ready' : 'preparation',
    paymentReady: commercialPaymentConfigured,
    support: { email: commercialSupportEmail, whatsappUrl: clientAdminCommercialWhatsAppUrl(commercialSupportWhatsApp) },
    latestRequest
  };
}

function clientAdminCommercialRequest(input, workspace) {
  const source = input && typeof input === 'object' ? input : {};
  const company = clientAdminText(source.company, 160);
  const taxId = clientAdminText(source.taxId, 80);
  const representative = clientAdminText(source.representative, 120);
  const email = clientAdminText(source.email, 160).toLowerCase();
  const countryCode = clientAdminCountryCode(source.country);
  if (company.length < 2) throw new Error('Укажите название компании или ИП.');
  if (representative.length < 2) throw new Error('Укажите имя представителя.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error('Укажите корректный e-mail для документов.');
  if (!source.authority || !source.termsAcknowledged) throw new Error('Подтвердите полномочия и ознакомление с условиями подключения.');
  const profile = clientAdminCommercialProfile(workspace, countryCode);
  return {
    id: `request_${randomUUID().replace(/-/gu, '').slice(0, 16)}`,
    createdAt: new Date().toISOString(),
    status: 'received',
    company,
    taxId,
    representative,
    email,
    countryCode: profile.countryCode,
    legalProfile: profile.termsProfile,
    plan: 'Full version',
    pricing: profile.pricing,
    acceptanceMethod: 'pre-contract-request'
  };
}

function clientAdminWorkspaceDraftForResponse(workspace) {
  const draft = clientAdminCopy(workspace?.draft || {});
  const restaurant = draft.restaurant && typeof draft.restaurant === 'object' ? draft.restaurant : {};
  const base = workspace?.publishedTemplateBase && typeof workspace.publishedTemplateBase === 'object' ? workspace.publishedTemplateBase : {};
  const address = clientAdminAddressText(restaurant.address) || clientAdminAddressText(base?.restaurant?.address);
  const mapUrl = clientAdminPublicUrl(restaurant.mapUrl) || clientAdminPublicUrl(base?.map?.directionsUrl);
  draft.restaurant = { ...restaurant, address, mapUrl };
  return draft;
}

function clientAdminResponse(workspace) {
  const settings = clientAdminWorkspaceSettings(workspace);
  return {
    tenant: workspace.tenant,
    user: workspace.user,
    // Keep the parsing artifact private, but project its trusted location into
    // the editable draft so an older pilot workspace opens with usable values.
    draft: clientAdminWorkspaceDraftForResponse(workspace),
    published: clientAdminVersionSummary(workspace.published),
    versions: (workspace.versions || []).map(clientAdminVersionSummary),
    auditLog: (workspace.auditLog || []).slice(0, 20),
    domains: settings.domains,
    qrCodes: settings.qrCodes,
    allergenCatalog: clientAdminAllergenCatalog(),
    subscription: settings.subscription,
    tenantUsers: settings.tenantUsers,
    commercial: clientAdminCommercialProfile(workspace),
    publicMenuOrigin: clientAdminPublicOrigin(workspace)
  };
}

function clientAdminPublicOrigin(workspace) {
  if (workspace?.publishedSiteId) {
    const domain = clientAdminWorkspaceSettings(workspace).domains.primary;
    return domain ? `https://${domain}` : '';
  }
  if (configuredPublicMenuOrigin) return configuredPublicMenuOrigin;
  const primaryDomain = clientAdminWorkspaceSettings(workspace).domains.primary;
  return primaryDomain ? `https://${primaryDomain}` : '';
}

function clientAdminWorkspaceSettings(workspace) {
  const defaultDomain = clientAdminText(workspace.tenant?.domain, 180).toLowerCase();
  const domains = workspace.domains && typeof workspace.domains === 'object' ? workspace.domains : {};
  const qrCodes = Array.isArray(workspace.qrCodes) ? workspace.qrCodes : [];
  const tenantUsers = Array.isArray(workspace.tenantUsers) ? workspace.tenantUsers : [workspace.user];
  return {
    domains: {
      primary: clientAdminText(domains.primary || defaultDomain, 180).toLowerCase(),
      verified: Boolean(domains.verified),
      customDomains: (Array.isArray(domains.customDomains) ? domains.customDomains : []).slice(0, 10).map((domain) => clientAdminText(domain, 180).toLowerCase()).filter(Boolean)
    },
    qrCodes: qrCodes.slice(0, 100).map((code) => ({ id: clientAdminId(code?.id, randomUUID()), label: clientAdminText(code?.label, 80), slug: clientAdminId(code?.slug, 'menu'), active: code?.active !== false, createdAt: code?.createdAt || new Date().toISOString() })),
    subscription: {
      plan: clientAdminText(workspace.subscription?.plan || workspace.tenant?.plan || 'Professional', 40),
      status: ['active', 'trialing', 'past_due', 'cancelled'].includes(workspace.subscription?.status) ? workspace.subscription.status : 'active',
      renewsAt: /^\d{4}-\d{2}-\d{2}$/.test(String(workspace.subscription?.renewsAt || '')) ? workspace.subscription.renewsAt : ''
    },
    tenantUsers: tenantUsers.slice(0, 20).map((user, index) => ({ id: clientAdminId(user?.id, `user-${index + 1}`), name: clientAdminText(user?.name, 100), email: clientAdminText(user?.email, 160).toLowerCase(), role: ['Owner', 'Manager', 'Viewer'].includes(user?.role) ? user.role : 'Viewer' }))
  };
}

function clientAdminWorkspaceFile(siteId) {
  if (!/^site_[a-f0-9]{16}$/u.test(String(siteId || ''))) throw new Error('Invalid published site workspace.');
  return path.join(publishedClientWorkspaceDirectory, `${siteId}.json`);
}

function clientAnalyticsFileForSite(siteId = '') {
  if (!siteId) return clientAnalyticsFile;
  if (!/^site_[a-f0-9]{16}$/u.test(String(siteId))) throw new Error('Invalid published site analytics workspace.');
  return path.join(publishedClientAnalyticsDirectory, `${siteId}.json`);
}

function clientAdminPriceFromPublished(value) {
  const text = clientAdminText(value, 40);
  const currency = text.includes('€') ? 'EUR' : text.includes('$') ? 'USD' : text.includes('£') ? 'GBP' : 'EUR';
  const matches = [...text.matchAll(/\d+(?:[.,]\d{1,2})?/gu)];
  const rawAmount = matches.at(-1)?.[0] || '0';
  return { amount: clientAdminMoney(rawAmount.replace(',', '.')), currency };
}

function clientAdminWorkspaceFromPublishedContent(site, content, account) {
  const now = new Date().toISOString();
  const nativeLanguage = clientAdminText(content?.localization?.nativeLanguage || content?.localization?.activeLanguage || 'en', 8).toLowerCase() || 'en';
  const languages = (Array.isArray(content?.localization?.languages) ? content.localization.languages : [])
    .map((language, index) => ({ code: clientAdminText(language?.code, 8).toLowerCase(), label: clientAdminText(language?.label, 16).toUpperCase() || `LANG ${index + 1}` }))
    .filter((language) => /^[a-z]{2,8}$/u.test(language.code));
  if (!languages.length) languages.push({ code: nativeLanguage, label: nativeLanguage.toUpperCase() });
  if (!languages.some((language) => language.code === nativeLanguage)) languages.unshift({ code: nativeLanguage, label: nativeLanguage.toUpperCase() });
  const categories = (Array.isArray(content?.menu?.categories) ? content.menu.categories : []).map((category, index) => ({
    id: clientAdminId(category?.id, `category-${index + 1}`),
    name: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(category?.label?.[language.code] || category?.label?.en || category?.id, 80)])),
    icon: clientAdminText(category?.icon, 32) || 'plate', order: index + 1
  }));
  const categoryIds = new Set(categories.map((category) => category.id));
  const fallbackCategory = categories[0]?.id || '';
  const menuItems = (Array.isArray(content?.menu?.items) ? content.menu.items : []).map((item, index) => ({
    id: clientAdminId(item?.id, `menu-item-${index + 1}`), categoryId: categoryIds.has(item?.categoryId) ? item.categoryId : fallbackCategory,
    name: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(item?.translations?.[language.code]?.name || item?.translations?.[nativeLanguage]?.name || item?.translations?.en?.name, 100)])),
    description: Object.fromEntries(languages.map((language) => [language.code, clientAdminText(item?.translations?.[language.code]?.description || item?.translations?.[nativeLanguage]?.description || item?.translations?.en?.description, 400)])),
    price: clientAdminPriceFromPublished(item?.pricing?.native?.formatted), imageUrl: clientAdminPublicUrl(item?.image?.src), portion: clientAdminText(item?.portion, 80),
    variants: (Array.isArray(item?.variants) ? item.variants : []).map((variant, variantIndex) => ({ id: `variant-${variantIndex + 1}`, name: clientAdminText(variant?.name, 80), price: clientAdminPriceFromPublished(variant?.formattedPrice).amount })).filter((variant) => variant.name),
    modifiers: (Array.isArray(item?.modifiers) ? item.modifiers : []).map((modifier, modifierIndex) => ({ id: `modifier-${modifierIndex + 1}`, name: clientAdminText(modifier?.name, 80), price: clientAdminPriceFromPublished(modifier?.formattedPrice).amount })).filter((modifier) => modifier.name),
    tags: (Array.isArray(item?.dietaryTags) ? item.dietaryTags : []).map((tag) => clientAdminText(tag, 32)).filter(Boolean), allergens: [...new Set(Object.values(item?.allergens || {}).flat().map(clientAdminCanonicalAllergen).filter(Boolean))],
    allergensConfirmed: item?.allergenStatus === 'verified', availability: 'available', visibility: 'visible', featured: Boolean(item?.featured), order: index + 1
  }));
  const closingWords = /\b(?:closed|chiuso|geschlossen|cerrado|fechado|закрыто)\b/iu;
  const importedOpeningHours = (Array.isArray(content?.restaurant?.openingHours?.schedule) ? content.restaurant.openingHours.schedule : []).map((entry, index) => {
    const value = clientAdminText(entry?.value?.[nativeLanguage] || entry?.value?.en, 80);
    const times = value.match(/\b\d{2}:\d{2}\b/gu) || [];
    return { id: `hours-${index + 1}`, day: clientAdminText(entry?.label?.[nativeLanguage] || entry?.label?.en, 40), from: times[0] || '', to: times[1] || '', closed: closingWords.test(value) };
  });
  const openingHours = clientAdminWeeklyHours(importedOpeningHours, 'hours');
  const restaurant = content?.restaurant || {};
  const owner = { id: `owner-${site.siteId.slice(-8)}`, name: 'Владелец ресторана', role: 'Owner', email: account?.username || `owner@${site.hostname}` };
  const snapshot = {
    id: 'published-1', number: 1, updatedAt: now, updatedBy: owner.name,
    restaurant: { name: clientAdminText(restaurant.name, 140), subtitle: clientAdminText(restaurant.subtitle, 220), description: clientAdminText(restaurant.description, 1200), logoUrl: clientAdminPublicUrl(restaurant?.logo?.src), address: clientAdminAddressText(restaurant?.address), mapUrl: clientAdminPublicUrl(content?.map?.directionsUrl), phone: clientAdminText(restaurant?.phone?.display, 48), email: clientAdminText(restaurant.email, 160), websiteUrl: clientAdminPublicUrl(restaurant.websiteUrl), bookingUrl: clientAdminPublicUrl(restaurant.bookingUrl), orderUrl: '', socials: (Array.isArray(restaurant.socials) ? restaurant.socials : []).map((social) => ({ platform: clientAdminText(social?.platform, 30), url: clientAdminPublicUrl(social?.url) })).filter((social) => social.platform && social.url) },
    languages, menuMode: content?.menu?.mode === 'seasonal' ? 'seasonal' : 'regular', openingHours, kitchenHours: [], specialOpeningHours: [], temporaryClosure: { closed: false, resumeDate: '', message: '' }, categories, menuItems
  };
  const published = { number: 1, status: 'published', createdAt: now, createdBy: owner.name, note: 'Imported published menu', snapshot };
  const commercial = site?.commercial && typeof site.commercial === 'object'
    ? clientAdminPublishedCommercialMetadata(site.commercial)
    : clientAdminCommercialMetadataFromContent(content);
  return { version: 1, publishedSiteId: site.siteId, publishedTemplateBase: clientAdminCopy(content), commercial, tenant: { id: `tenant-${site.siteId.slice(-12)}`, name: snapshot.restaurant.name || site.hostname, plan: 'Pilot', domain: site.hostname }, user: owner, draft: { ...clientAdminCopy(snapshot), id: 'draft-2', number: 2 }, published, versions: [published], auditLog: [{ id: randomUUID(), at: now, actor: owner.name, action: 'Imported published menu', target: site.hostname }], domains: { primary: site.hostname, verified: true, customDomains: [] }, qrCodes: [], subscription: { plan: 'Pilot', status: 'trialing', renewsAt: '' }, tenantUsers: [owner] };
}

async function publishedSiteById(siteId) {
  const registry = await readPublishedSitesRegistry();
  const site = registry.sites.find((entry) => entry.siteId === siteId);
  if (!publishedSiteIsActive(site)) throw new Error('Published site workspace was not found.');
  return site;
}

async function readPublishedClientWorkspace(siteId, siteHint = null) {
  const file = clientAdminWorkspaceFile(siteId);
  try {
    const workspace = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!workspace?.publishedSiteId || !workspace?.tenant || !workspace?.user || !workspace?.draft || !workspace?.published) throw new Error('Published site workspace is invalid.');
    return workspace;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const site = siteHint || await publishedSiteById(siteId);
  const account = await readPublishedSiteAdminAccount(site.siteId);
  const artifactPath = path.join(publishedSitesDirectory, site.siteId, 'versions', site.activeVersion, 'index.html');
  const content = publishedStandaloneContent(await fs.readFile(artifactPath, 'utf8'));
  const workspace = clientAdminWorkspaceFromPublishedContent(site, content, account);
  await fs.mkdir(publishedClientWorkspaceDirectory, { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(workspace, null, 2), 'utf8');
  await fs.rename(temporaryFile, file);
  return workspace;
}

async function readPublishedClientWorkspaceIfPresent(siteId) {
  try {
    const workspace = JSON.parse(await fs.readFile(clientAdminWorkspaceFile(siteId), 'utf8'));
    if (!workspace?.publishedSiteId || !workspace?.tenant || !workspace?.draft || !workspace?.published) return null;
    return workspace;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readClientAnalytics(siteId = '') {
  try {
    const parsed = JSON.parse(await fs.readFile(clientAnalyticsFileForSite(siteId), 'utf8'));
    return { events: Array.isArray(parsed?.events) ? parsed.events : [] };
  } catch (error) {
    if (error?.code === 'ENOENT') return { events: [] };
    throw error;
  }
}

async function appendClientAnalyticsEvent(event, siteId = '') {
  const operation = clientAnalyticsWriteQueue.then(async () => {
    const analytics = await readClientAnalytics(siteId);
    analytics.events.push(event);
    if (analytics.events.length > 50_000) analytics.events.splice(0, analytics.events.length - 50_000);
    const file = clientAnalyticsFileForSite(siteId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(analytics, null, 2), 'utf8');
  });
  clientAnalyticsWriteQueue = operation.catch(() => {});
  return operation;
}

const clientAnalyticsEventNames = new Set(['page_view', 'session_start', 'language_change', 'category_view', 'menu_item_view', 'menu_search', 'filter_used', 'booking_click', 'call_click', 'directions_click', 'order_click', 'social_click', 'qr_scan']);

function clientAnalyticsEvent(input, workspace, fallback = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const timestamp = new Date(source.timestamp || Date.now());
  const validTimestamp = Number.isFinite(timestamp.getTime()) && timestamp.getTime() <= Date.now() + 86_400_000 ? timestamp : new Date();
  const event = clientAdminText(source.event, 48);
  if (!clientAnalyticsEventNames.has(event)) throw new Error('Неподдерживаемый тип события.');
  return {
    id: randomUUID(),
    tenantId: workspace.tenant.id,
    event,
    sessionId: clientAdminText(source.sessionId || fallback.sessionId || randomUUID(), 100),
    language: clientAdminText(source.language, 12).toLowerCase(),
    categoryId: clientAdminId(source.categoryId, ''),
    itemId: clientAdminId(source.itemId, ''),
    source: clientAdminText(source.source || fallback.source || 'direct', 80).toLowerCase(),
    deviceType: ['mobile', 'tablet', 'desktop'].includes(source.deviceType) ? source.deviceType : 'desktop',
    at: validTimestamp.toISOString()
  };
}

function clientAnalyticsSummary(events, workspace, days = 30) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const filtered = events.filter((event) => event.tenantId === workspace.tenant.id && new Date(event.at).getTime() >= start.getTime());
  const count = (name) => filtered.filter((event) => event.event === name).length;
  const dimension = (field) => Object.entries(filtered.reduce((result, event) => {
    const key = clientAdminText(event[field], 100) || 'direct';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {})).map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value);
  const itemNames = new Map((workspace.published?.snapshot?.menuItems || []).map((item) => [item.id, item.name?.en || Object.values(item.name || {})[0] || item.id]));
  const daily = Array.from({ length: days }, (_value, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const dayEvents = filtered.filter((event) => event.at.slice(0, 10) === key);
    return { date: key, visitors: new Set(dayEvents.map((event) => event.sessionId)).size, pageViews: dayEvents.filter((event) => event.event === 'page_view').length, conversions: dayEvents.filter((event) => ['booking_click', 'call_click', 'directions_click', 'order_click'].includes(event.event)).length };
  });
  return {
    period: days,
    summary: { visitors: new Set(filtered.map((event) => event.sessionId)).size, sessions: new Set(filtered.map((event) => event.sessionId)).size, menuViews: count('page_view'), bookingClicks: count('booking_click'), callClicks: count('call_click'), directionsClicks: count('directions_click'), orderClicks: count('order_click') },
    daily,
    sources: dimension('source'),
    devices: dimension('deviceType'),
    languages: dimension('language').filter((entry) => entry.label !== 'direct'),
    categories: dimension('categoryId').filter((entry) => entry.label !== 'direct'),
    items: dimension('itemId').filter((entry) => entry.label !== 'direct').map((entry) => ({ ...entry, label: itemNames.get(entry.label) || entry.label }))
  };
}

async function readClientAdminWorkspace(siteId = '', siteHint = null) {
  if (siteId) return readPublishedClientWorkspace(siteId, siteHint);
  const workspace = JSON.parse(await fs.readFile(clientAdminFile, 'utf8'));
  if (!workspace?.tenant || !workspace?.user || !workspace?.draft || !workspace?.published) throw new Error('Файл данных клиентской админки повреждён.');
  return workspace;
}

async function updateClientAdminWorkspace(mutator, siteId = '') {
  const operation = clientAdminWriteQueue.then(async () => {
    const workspace = await readClientAdminWorkspace(siteId);
    const result = await mutator(workspace);
    const file = siteId ? clientAdminWorkspaceFile(siteId) : clientAdminFile;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporaryFile = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(workspace, null, 2), 'utf8');
    await fs.rename(temporaryFile, file);
    return result;
  });
  clientAdminWriteQueue = operation.catch(() => {});
  return operation;
}

function clientAdminSiteIdFromRequest(request) {
  return String(request?.clientAdminSession?.siteId || '');
}

async function clientAdminWorkspaceFromPublicRequest(request) {
  const hostname = requestHostname(request);
  if (isPilotPublishedHostname(hostname)) {
    const registry = await readPublishedSitesRegistry();
    const site = registry.sites.find((entry) => entry.hostname === hostname);
    if (!publishedSiteIsActive(site)) throw new Error('Published site workspace was not found.');
    return { workspace: await readClientAdminWorkspace(site.siteId, site), siteId: site.siteId };
  }
  return { workspace: await readClientAdminWorkspace(), siteId: '' };
}

async function publishClientAdminWorkspace(siteId, workspace) {
  if (!siteId) return null;
  const site = await publishedSiteById(siteId);
  const content = clientAdminPublishedMenuContent(workspace);
  const html = await buildClassicLightStandaloneDocumentFromContent(content);
  const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
  const version = `v${new Date().toISOString().replace(/[-:.]/gu, '').toLowerCase().replace('z', 'z')}-${sha256.slice(0, 12)}`;
  return writePublishedSiteArtifact({ hostname: site.hostname, siteId: site.siteId, version, html, sha256, expiresAt: site.expiresAt, commercial: site.commercial });
}

app.get('/api/admin/workspace', async (request, response) => {
  try {
    response.set('Cache-Control', 'no-store');
    response.json(clientAdminResponse(await readClientAdminWorkspace(clientAdminSiteIdFromRequest(request))));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось открыть рабочее пространство.' });
  }
});

app.post('/api/admin/commercial/requests', async (request, response) => {
  try {
    if (request.clientAdminSession?.role !== 'Owner') return response.status(403).json({ error: 'Заявку на подключение может оформить только владелец кабинета.' });
    const result = await updateClientAdminWorkspace((workspace) => {
      const requestEntry = clientAdminCommercialRequest(request.body, workspace);
      const commercial = workspace.commercial && typeof workspace.commercial === 'object' ? workspace.commercial : {};
      const requests = Array.isArray(commercial.requests) ? commercial.requests : [];
      workspace.commercial = { ...commercial, countryCode: requestEntry.countryCode, requests: [requestEntry, ...requests].slice(0, 20) };
      workspace.auditLog.unshift({ id: randomUUID(), at: requestEntry.createdAt, actor: workspace.user.name, action: 'Оставлена заявка на подключение', target: requestEntry.company });
      return clientAdminResponse(workspace);
    }, clientAdminSiteIdFromRequest(request));
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось создать заявку на подключение.' });
  }
});

app.get('/api/admin/analytics', async (request, response) => {
  try {
    const requestedPeriod = Number(request.query.period);
    const period = [7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 30;
    const siteId = clientAdminSiteIdFromRequest(request);
    const [workspace, analytics] = await Promise.all([readClientAdminWorkspace(siteId), readClientAnalytics(siteId)]);
    response.set('Cache-Control', 'no-store');
    response.json(clientAnalyticsSummary(analytics.events, workspace, period));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Не удалось построить аналитику.' });
  }
});

app.put('/api/admin/domains', async (request, response) => {
  try {
    const siteId = clientAdminSiteIdFromRequest(request);
    const value = clientAdminText(request.body?.primary, 180).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
    if (siteId) {
      const site = await publishedSiteById(siteId);
      if (value !== site.hostname) throw new Error('В пилотном режиме домен закреплён за кафе. Для смены домена обратитесь к команде Menu-on.');
    }
    const result = await updateClientAdminWorkspace((workspace) => {
      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)) throw new Error('Введите корректное доменное имя, например menu.example.com.');
      const settings = clientAdminWorkspaceSettings(workspace);
      workspace.domains = { ...settings.domains, primary: value, verified: Boolean(siteId) };
      workspace.tenant.domain = value;
      workspace.auditLog.unshift({ id: randomUUID(), at: new Date().toISOString(), actor: workspace.user.name, action: 'Изменила домен меню', target: value });
      return clientAdminResponse(workspace);
    }, siteId);
    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось сохранить домен.' });
  }
});

app.post('/api/admin/qr-codes', async (request, response) => {
  try {
    const result = await updateClientAdminWorkspace((workspace) => {
      const settings = clientAdminWorkspaceSettings(workspace);
      const label = clientAdminText(request.body?.label, 80);
      const slug = clientAdminId(request.body?.slug || label, 'menu');
      if (!label) throw new Error('Укажите название QR-кода.');
      if (settings.qrCodes.some((code) => code.slug === slug)) throw new Error('Такой QR-идентификатор уже существует.');
      workspace.qrCodes = [...settings.qrCodes, { id: randomUUID(), label, slug, active: true, createdAt: new Date().toISOString() }];
      workspace.auditLog.unshift({ id: randomUUID(), at: new Date().toISOString(), actor: workspace.user.name, action: 'Создала QR-ссылку', target: label });
      return clientAdminResponse(workspace);
    }, clientAdminSiteIdFromRequest(request));
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось создать QR-ссылку.' });
  }
});

app.delete('/api/admin/qr-codes/:id', async (request, response) => {
  try {
    const result = await updateClientAdminWorkspace((workspace) => {
      const settings = clientAdminWorkspaceSettings(workspace);
      const nextCodes = settings.qrCodes.filter((code) => code.id !== request.params.id);
      if (nextCodes.length === settings.qrCodes.length) throw new Error('QR-ссылка не найдена.');
      workspace.qrCodes = nextCodes;
      workspace.auditLog.unshift({ id: randomUUID(), at: new Date().toISOString(), actor: workspace.user.name, action: 'Удалилa QR-ссылку', target: request.params.id });
      return clientAdminResponse(workspace);
    }, clientAdminSiteIdFromRequest(request));
    response.json(result);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось удалить QR-ссылку.' });
  }
});

app.post('/api/admin/assets', async (request, response) => {
  try {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/i.exec(String(request.body?.dataUrl || ''));
    if (!match) throw new Error('Поддерживаются только изображения PNG, JPEG, WebP или GIF.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 2_500_000) throw new Error('Размер изображения должен быть не больше 2,5 МБ.');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1].toLowerCase()];
    const fileName = `${randomUUID()}.${extension}`;
    const siteId = clientAdminSiteIdFromRequest(request);
    const directory = siteId ? path.join(clientUploadsDirectory, siteId) : clientUploadsDirectory;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, fileName), bytes);
    response.status(201).json({ url: `/uploads/client-admin/${siteId ? `${siteId}/` : ''}${fileName}` });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось загрузить изображение.' });
  }
});

app.get('/api/public/menu', async (request, response) => {
  try {
    const { workspace } = await clientAdminWorkspaceFromPublicRequest(request);
    response.set('Cache-Control', 'no-store');
    response.json(clientAdminPublishedMenuContent(workspace));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Опубликованное меню не найдено.' });
  }
});

app.post('/api/events', async (request, response) => {
  if (!clientAnalyticsRateAllowed(request)) return response.status(429).json({ error: 'Too many events.' });
  try {
    const { workspace, siteId } = await clientAdminWorkspaceFromPublicRequest(request);
    // Public-menu requests made in an authenticated owner's browser carry this
    // signed cookie. They are excluded before events reach analytics storage.
    if (clientAnalyticsIsOwnerSession(request, workspace)) return response.status(202).json({ accepted: false, ignored: 'owner_session' });
    const event = clientAnalyticsEvent(request.body, workspace);
    await appendClientAnalyticsEvent(event, siteId);
    response.status(202).json({ accepted: true });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Событие не принято.' });
  }
});

app.get('/menu', (request, response) => {
  const params = new URLSearchParams({ content: '/api/public/menu' });
  const source = clientAdminText(request.query.source, 80).toLowerCase();
  if (source) params.set('source', source);
  response.redirect(302, `/templates/classic-light/template.html?${params.toString()}`);
});

app.get('/from/:source', (request, response) => {
  const source = clientAdminId(request.params.source, 'direct');
  const knownSources = new Set(['google', 'google-business-profile', 'instagram', 'facebook', 'website']);
  const normalizedSource = source === 'google' || source === 'google-business-profile' ? 'google_business_profile' : knownSources.has(source) ? source : 'direct';
  response.redirect(302, `/menu?source=${encodeURIComponent(normalizedSource)}`);
});

app.get('/api/qr/:slug.svg', async (request, response) => {
  try {
    const session = clientAdminSessionFromRequest(request);
    if (!session) return response.status(401).send('Authentication required');
    const workspace = await readClientAdminWorkspace(session.siteId);
    const code = clientAdminWorkspaceSettings(workspace).qrCodes.find((entry) => entry.slug === clientAdminId(request.params.slug, '') && entry.active);
    if (!code) return response.status(404).send('QR link not found');
    const requestHost = clientAdminText(request.get('host'), 180);
    const isLocalHost = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(requestHost);
    const origin = clientAdminPublicOrigin(workspace) || (isLocalHost ? `${request.protocol}://${requestHost}` : '');
    if (!origin) return response.status(409).send('Public menu domain is not configured');
    const svg = await QRCode.toString(`${origin}/r/${encodeURIComponent(code.slug)}`, { type: 'svg', margin: 1, color: { dark: '#173B28', light: '#FFFFFF' } });
    response.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  } catch {
    response.status(500).send('QR code is temporarily unavailable');
  }
});

app.get('/r/:slug', async (request, response) => {
  try {
    const { workspace, siteId } = await clientAdminWorkspaceFromPublicRequest(request);
    const code = clientAdminWorkspaceSettings(workspace).qrCodes.find((entry) => entry.slug === clientAdminId(request.params.slug, '') && entry.active);
    if (!code) return response.status(404).send('QR link not found');
    await appendClientAnalyticsEvent(clientAnalyticsEvent({ event: 'qr_scan', source: `qr:${code.slug}`, sessionId: randomUUID(), deviceType: 'mobile' }, workspace), siteId);
    response.redirect(302, siteId ? '/' : `/menu?source=${encodeURIComponent(`qr:${code.slug}`)}`);
  } catch {
  }
});

app.put('/api/admin/draft', async (request, response) => {
  try {
    const result = await updateClientAdminWorkspace((workspace) => {
      workspace.draft = sanitizeClientAdminDraft(request.body?.draft, workspace.draft);
      workspace.auditLog.unshift({ id: randomUUID(), at: workspace.draft.updatedAt, actor: workspace.user.name, action: 'Сохранила черновик', target: `Версия v${workspace.draft.number}` });
      return clientAdminResponse(workspace);
    }, clientAdminSiteIdFromRequest(request));
    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось сохранить черновик.' });
  }
});

app.post('/api/admin/publish', async (request, response) => {
  try {
    const siteId = clientAdminSiteIdFromRequest(request);
    const result = await updateClientAdminWorkspace(async (workspace) => {
      const currentDraft = workspace.draft;
      if (!currentDraft.restaurant?.name) throw new Error('Добавьте название ресторана перед публикацией.');
      if (!currentDraft.categories?.length || !currentDraft.menuItems?.length) throw new Error('Для публикации нужна хотя бы одна категория и одна позиция меню.');
      const createdAt = new Date().toISOString();
      const snapshot = clientAdminCopy(currentDraft);
      const published = { number: currentDraft.number, status: 'published', createdAt, createdBy: workspace.user.name, note: 'Published menu', snapshot };
      workspace.published = published;
      workspace.versions = [published, ...(workspace.versions || []).filter((version) => version.number !== published.number)].slice(0, 20);
      workspace.draft = { ...clientAdminCopy(snapshot), id: `draft-${published.number + 1}`, number: published.number + 1, updatedAt: createdAt, updatedBy: workspace.user.name };
      await publishClientAdminWorkspace(siteId, workspace);
      workspace.auditLog.unshift({ id: randomUUID(), at: createdAt, actor: workspace.user.name, action: `Опубликовала версию v${published.number}`, target: 'Публичное меню' });
      return clientAdminResponse(workspace);
    }, siteId);
    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось опубликовать меню.' });
  }
});

app.post('/api/admin/rollback/:number', async (request, response) => {
  const versionNumber = Number(request.params.number);
  if (!Number.isInteger(versionNumber)) return response.status(400).json({ error: 'Некорректная версия для отката.' });
  try {
    const siteId = clientAdminSiteIdFromRequest(request);
    const result = await updateClientAdminWorkspace(async (workspace) => {
      const target = (workspace.versions || []).find((version) => version.number === versionNumber);
      if (!target?.snapshot) throw new Error('Версия для отката не найдена.');
      const nextNumber = Math.max(workspace.draft.number, workspace.published.number, ...(workspace.versions || []).map((version) => version.number)) + 1;
      const createdAt = new Date().toISOString();
      const snapshot = { ...clientAdminCopy(target.snapshot), id: `rollback-${nextNumber}`, number: nextNumber, updatedAt: createdAt, updatedBy: workspace.user.name };
      const published = { number: nextNumber, status: 'published', createdAt, createdBy: workspace.user.name, note: `Rollback of v${versionNumber}`, snapshot };
      workspace.published = published;
      workspace.versions = [published, ...(workspace.versions || [])].slice(0, 20);
      workspace.draft = { ...clientAdminCopy(snapshot), id: `draft-${nextNumber + 1}`, number: nextNumber + 1 };
      await publishClientAdminWorkspace(siteId, workspace);
      workspace.auditLog.unshift({ id: randomUUID(), at: createdAt, actor: workspace.user.name, action: `Откатила меню к v${versionNumber}`, target: `Опубликована новая v${nextNumber}` });
      return clientAdminResponse(workspace);
    }, siteId);
    response.json(result);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Не удалось выполнить откат.' });
  }
});
