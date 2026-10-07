import { readFile } from 'node:fs/promises';
import { createHash, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Only our fixed diagnostics may reach the CLI. Never log API bodies or errors.
export class PublishError extends Error {}
const fail = message => { throw new PublishError(message); };
const required = (env, name) => {
  if (typeof env[name] !== 'string' || !env[name].trim()) fail(`Missing ${name}`);
  return env[name].trim();
};
export function enabled(value = '') {
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  fail('Store enable variable must be exactly true, false, or unset');
}
export function configuration(store, env) {
  if (!['chrome', 'edge'].includes(store)) fail('Unknown store');
  if (!enabled(env[`${store.toUpperCase()}_STORE_PUBLISH_ENABLED`])) return null;
  const names = store === 'chrome'
    ? ['CHROME_PUBLISHER_ID', 'CHROME_EXTENSION_ID', 'CHROME_SERVICE_ACCOUNT_JSON']
    : ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'];
  const config = Object.fromEntries(names.map(name => [name, required(env, name)]));
  if (store === 'chrome') {
    if (!/^[a-zA-Z0-9_-]+$/.test(config.CHROME_PUBLISHER_ID)) fail('Invalid CHROME_PUBLISHER_ID');
    if (!/^[a-p]{32}$/.test(config.CHROME_EXTENSION_ID)) fail('Invalid CHROME_EXTENSION_ID');
  } else {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(config.EDGE_PRODUCT_ID)) fail('Invalid EDGE_PRODUCT_ID');
    if (/[\r\n]/.test(config.EDGE_CLIENT_ID + config.EDGE_API_KEY)) fail('Invalid Edge credential format');
  }
  return config;
}
export function assertion(raw, now = Math.floor(Date.now() / 1000)) {
  try {
    const key = JSON.parse(raw);
    if (key.type !== 'service_account' || typeof key.client_email !== 'string' || !key.client_email || !key.private_key) throw Error();
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: key.client_email, scope: 'https://www.googleapis.com/auth/chromewebstore',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`;
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url')}`;
  } catch { fail('Invalid CHROME_SERVICE_ACCOUNT_JSON or RSA private key'); }
}
export function client(fetchImpl = fetch) {
  return async (label, url, options = {}, expected = 200, json = true) => {
    // Includes response-body consumption. Do not follow redirects with credentials.
    const signal = AbortSignal.timeout(120_000);
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal });
      if (!(Array.isArray(expected) ? expected : [expected]).includes(response.status)) fail(`${label}: HTTP ${response.status}`);
      if (!json) { await response.arrayBuffer(); return response; }
      let body;
      try { body = await response.json(); } catch { fail(`${label}: invalid JSON response`); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) fail(`${label}: invalid API response`);
      return body;
    } catch (error) {
      if (error instanceof PublishError) throw error;
      fail(`${label}: network failure, redirect, or timeout`);
    }
  };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function poll(label, read, field, success, progress, { sleep = wait, attempts = 30 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const result = await read();
    if (result[field] === success) return result;
    if (result[field] !== progress) fail(`${label}: failed, missing, or unexpected status; inspect store dashboard`);
    if (i + 1 < attempts) await sleep(10_000);
  }
  fail(`${label}: polling limit exceeded; inspect store dashboard before retrying`);
}
function identity(body, name, id) {
  if (body.name !== name || body.itemId !== id) fail('Chrome response item identity mismatch');
}
export async function chrome(config, zip, version, request, polling) {
  const token = await request('Chrome authentication', 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(config.CHROME_SERVICE_ACCOUNT_JSON) }),
  });
  if (typeof token.access_token !== 'string' || !token.access_token || /[\r\n]/.test(token.access_token) || token.token_type?.toLowerCase() !== 'bearer') fail('Chrome authentication: missing or invalid access token');
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const name = `publishers/${config.CHROME_PUBLISHER_ID}/items/${config.CHROME_EXTENSION_ID}`;
  const root = 'https://chromewebstore.googleapis.com';
  const uploaded = await request('Chrome upload', `${root}/upload/v2/${name}:upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip,
  });
  identity(uploaded, name, config.CHROME_EXTENSION_ID);
  if (uploaded.uploadState === 'IN_PROGRESS') {
    await poll('Chrome upload', async () => {
      const status = await request('Chrome upload status', `${root}/v2/${name}:fetchStatus`, { headers });
      identity(status, name, config.CHROME_EXTENSION_ID);
      return status;
    }, 'lastAsyncUploadState', 'SUCCEEDED', 'IN_PROGRESS', polling);
  } else if (uploaded.uploadState !== 'SUCCEEDED' || uploaded.crxVersion !== version) {
    fail('Chrome upload: unsuccessful state or version mismatch');
  }
  const result = await request('Chrome submission', `${root}/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true }),
  });
  identity(result, name, config.CHROME_EXTENSION_ID);
  if (!['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(result.state)) fail('Chrome submission: unexpected state; inspect store dashboard');
  return result.state;
}
export function operation(response) {
  // Official contract is an operation ID, not an arbitrary URL to follow.
  const id = response.headers.get('location');
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) fail('Edge response: missing or invalid Location operation ID');
  return id;
}
export async function edge(config, zip, version, request, polling) {
  const root = `https://api.addons.microsoftedge.microsoft.com/v1/products/${config.EDGE_PRODUCT_ID}/submissions`;
  const headers = { Authorization: `ApiKey ${config.EDGE_API_KEY}`, 'X-ClientID': config.EDGE_CLIENT_ID };
  const upload = await request('Edge upload', `${root}/draft/package`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip,
  }, 202, false);
  const uploadId = operation(upload);
  const check = (label, url, id) => poll(label, async () => {
    // Live Edge operation polling also returns HTTP 202 while processing.
    const status = await request(label, url, { headers }, [200, 202]);
    if (status.id !== id || status.errorCode || (status.errors && (!Array.isArray(status.errors) || status.errors.length))) fail(`${label}: invalid or failed operation`);
    return status;
  }, 'status', 'Succeeded', 'InProgress', polling);
  await check('Edge upload status', `${root}/draft/package/operations/${uploadId}`, uploadId);
  // REST reference specifies plain text; the overview's JSON example is inconsistent.
  const submitted = await request('Edge submission', root, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' },
    body: `Automated SakuraMeter release ${version}.`,
  }, 202, false);
  const submitId = operation(submitted);
  await check('Edge submission status', `${root}/operations/${submitId}`, submitId);
  return 'Succeeded';
}
export async function run(store, env = process.env, dependencies = {}) {
  const config = configuration(store, env);
  if (!config) return `${store}: skipped (disabled)`;
  const path = required(env, 'ZIP_PATH');
  const version = required(env, 'RELEASE_VERSION');
  const expectedHash = required(env, 'ZIP_SHA256');
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) fail('Invalid ZIP_SHA256');
  let zip;
  try { zip = await readFile(path); } catch { fail('Release ZIP cannot be read'); }
  if (createHash('sha256').update(zip).digest('hex') !== expectedHash) fail('Release ZIP checksum mismatch');
  const request = client(dependencies.fetchImpl);
  const state = await (store === 'chrome' ? chrome : edge)(config, zip, version, request, dependencies.polling);
  return `${store}: submission accepted (${state}); review/certification is separate`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(await run(process.argv[2])); }
  catch (error) {
    console.error(error instanceof PublishError ? error.message : 'Store publishing failed; details suppressed to protect credentials');
    process.exitCode = 1;
  }
}
