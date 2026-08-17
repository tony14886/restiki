import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function request(port, { method = 'GET', pathname, host, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const requestHeaders = { host, ...headers };
    if (body) requestHeaders['content-length'] = Buffer.byteLength(body);
    const pending = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers: requestHeaders }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    pending.once('error', reject);
    if (body) pending.write(body);
    pending.end();
  });
}

async function waitForHealth(port) {
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await request(port, { pathname: '/healthz', host: 'ops.menu-on.test' });
      if (response.status === 200) return;
    } catch (error) { lastError = error; }
    if (child.exitCode !== null) throw new Error(`Temporary server exited before becoming healthy: ${errorOutput || 'no error output'}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Temporary server did not become healthy.');
}

const port = await freePort();
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port), NODE_ENV: 'test', PILOT_MODE: '1',
    PILOT_PUBLIC_HOSTS: 'demo.menu-on.test', PILOT_CLIENT_HOSTS: 'cabinet.menu-on.test', PILOT_OPERATOR_HOSTS: 'ops.menu-on.test',
    PILOT_SITE_DOMAIN: 'menu-on.test', PUBLIC_MENU_ORIGIN: 'https://demo.menu-on.test', PUBLISH_API_TOKEN: 'test-publication-token',
    ADMIN_SESSION_SECRET: 'test-client-session-secret', ADMIN_EMAIL: 'client@example.test', ADMIN_PASSWORD: 'test-client-password',
    OPS_SESSION_SECRET: 'test-operator-session-secret', OPS_EMAIL: 'ops@example.test', OPS_PASSWORD: 'test-operator-password',
    SITE_ADMIN_CREDENTIALS_KEY: 'test-site-admin-credentials-key'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let errorOutput = '';
child.stderr.on('data', (chunk) => { errorOutput += chunk; });

try {
  await waitForHealth(port);
  const unauthenticated = await request(port, { pathname: '/api/ops/sites', host: 'ops.menu-on.test' });
  if (unauthenticated.status !== 401) throw new Error(`Expected 401, received ${unauthenticated.status}.`);

  const login = await request(port, {
    method: 'POST', pathname: '/api/ops/auth/login', host: 'ops.menu-on.test',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ops@example.test', password: 'test-operator-password' })
  });
  const sessionCookie = String(login.headers['set-cookie']?.[0] || '').split(';')[0];
  if (login.status !== 200 || !sessionCookie.startsWith('fastmenu_ops_session=')) throw new Error('Operator login did not establish a session.');

  const session = await request(port, { pathname: '/api/ops/auth/session', host: 'ops.menu-on.test', headers: { cookie: sessionCookie } });
  const sessionPayload = JSON.parse(session.body);
  if (session.status !== 200 || sessionPayload.email !== 'ops@example.test' || !sessionPayload.csrfToken) throw new Error('Operator session check failed.');

  const sites = await request(port, { pathname: '/api/ops/sites', host: 'ops.menu-on.test', headers: { cookie: sessionCookie } });
  const sitesPayload = JSON.parse(sites.body);
  if (sites.status !== 200 || !Array.isArray(sitesPayload.sites)) throw new Error('Operator registry did not return a sites array.');

  const redirect = await request(port, { pathname: '/admin.html', host: 'cabinet.menu-on.test' });
  if (redirect.status !== 302 || redirect.headers.location !== '/ops.html') throw new Error('Base admin URL does not redirect to the owner panel.');

  const operatorPage = await request(port, { pathname: '/ops.html', host: 'ops.menu-on.test' });
  if (operatorPage.status !== 200 || !operatorPage.body.includes('id="sites-table"')) throw new Error('Operator page is not available on the operator host.');

  console.log('ops-auth=ok; ops-registry=ok; unauthenticated=401; base-admin-redirect=ok; operator-host=ok');
} finally {
  if (child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  if (errorOutput && child.exitCode && child.exitCode !== 0) process.stderr.write(errorOutput);
}
