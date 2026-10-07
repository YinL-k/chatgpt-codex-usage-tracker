import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { enabled, configuration, assertion, client, chrome, edge, operation, poll, run } from '../.github/scripts/store-publish.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const credential = JSON.stringify({ type: 'service_account', client_email: 'test@example.invalid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const chromeConfig = { CHROME_PUBLISHER_ID: 'publisher', CHROME_EXTENSION_ID: 'a'.repeat(32), CHROME_SERVICE_ACCOUNT_JSON: credential };
const edgeConfig = { EDGE_PRODUCT_ID: '11111111-2222-3333-4444-555555555555', EDGE_CLIENT_ID: 'client', EDGE_API_KEY: 'secret-sentinel' };
const name = `publishers/publisher/items/${chromeConfig.CHROME_EXTENSION_ID}`;
const identity = { name, itemId: chromeConfig.CHROME_EXTENSION_ID };
const version = '3.6.0.63';
const zip = Buffer.from('mock ZIP bytes');
const op = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const polling = { sleep: async () => {}, attempts: 3 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const accepted = () => new Response(null, { status: 202, headers: { location: op } });
function sequence(responses, inspect = () => {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const i = calls.length;
    calls.push({ url, ...options });
    inspect(url, options, i);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(responses.length, 'unexpected network call');
    const result = responses.shift();
    if (result instanceof Error) throw result;
    return result;
  };
  return { request: client(fetchImpl), calls, fetchImpl };
}
const token = () => json({ access_token: 'token-sentinel', token_type: 'Bearer' });
const uploaded = state => json({ ...identity, uploadState: state, crxVersion: version });
const submitted = state => json({ ...identity, state });

test('gates: only explicit true enables, misspellings fail', async () => {
  for (const value of [undefined, '', 'false']) assert.equal(enabled(value), false);
  assert.equal(enabled('true'), true);
  for (const value of ['TRUE', ' true', '1', 'yes']) assert.throws(() => enabled(value));
  for (const store of ['chrome', 'edge']) {
    assert.match(await run(store, {}, { fetchImpl: () => assert.fail('network on skip') }), /skipped/);
    assert.throws(() => configuration(store, { [`${store.toUpperCase()}_STORE_PUBLISH_ENABLED`]: 'true' }), /Missing/);
  }
});
test('every required setting fails individually before network', () => {
  for (const [store, config] of [['chrome', chromeConfig], ['edge', edgeConfig]]) {
    for (const key of Object.keys(config)) {
      const env = { ...config, [`${store.toUpperCase()}_STORE_PUBLISH_ENABLED`]: 'true', [key]: ' ' };
      assert.throws(() => configuration(store, env), new RegExp(key));
    }
  }
});
test('service account JWT signature, audience, scope and lifetime', () => {
  const jwt = assertion(credential, 1000);
  const [header, body, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), {
    iss: 'test@example.invalid', scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token', iat: 1000, exp: 4600,
  });
  assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url')), true);
  for (const raw of ['secret-sentinel', '{}', '{"private_key":"secret-sentinel"}']) {
    assert.throws(() => assertion(raw), error => !error.message.includes('secret-sentinel'));
  }
});
for (const asynchronous of [false, true]) test(`Chrome ${asynchronous ? 'async' : 'sync'} upload and submit contract`, async () => {
  const responses = [token(), uploaded(asynchronous ? 'IN_PROGRESS' : 'SUCCEEDED')];
  if (asynchronous) responses.push(json({ ...identity, lastAsyncUploadState: 'IN_PROGRESS' }), json({ ...identity, lastAsyncUploadState: 'SUCCEEDED' }));
  responses.push(submitted('PENDING_REVIEW'));
  const { request, calls } = sequence(responses);
  assert.equal(await chrome(chromeConfig, zip, version, request, polling), 'PENDING_REVIEW');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(calls[1].url, `https://chromewebstore.googleapis.com/upload/v2/${name}:upload`);
  assert.equal(calls[1].body, zip);
  assert.equal(calls[1].headers.Authorization, 'Bearer token-sentinel');
  assert.equal(calls.at(-1).url, `https://chromewebstore.googleapis.com/v2/${name}:publish`);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true });
  if (asynchronous) assert.equal(calls[2].url, `https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`);
});
for (const state of ['FAILED', 'NOT_FOUND', 'UPLOAD_STATE_UNSPECIFIED', 'UPLOAD_IN_PROGRESS', '', null]) test(`Chrome upload rejects ${state}`, async () => {
  const { request, calls } = sequence([token(), uploaded(state)]);
  await assert.rejects(chrome(chromeConfig, zip, version, request, polling));
  assert.equal(calls.length, 2);
});
for (const state of ['STAGED', 'REJECTED', 'CANCELLED', 'ITEM_STATE_UNSPECIFIED', '', null]) test(`Chrome submission rejects ${state}`, async () => {
  await assert.rejects(chrome(chromeConfig, zip, version, sequence([token(), uploaded('SUCCEEDED'), submitted(state)]).request, polling));
});
for (const state of ['PUBLISHED', 'PUBLISHED_TO_TESTERS']) test(`Chrome accepts ${state}`, async () => {
  assert.equal(await chrome(chromeConfig, zip, version, sequence([token(), uploaded('SUCCEEDED'), submitted(state)]).request, polling), state);
});
test('Chrome fails wrong uploaded version, wrong item and invalid token', async () => {
  for (const response of [json({ ...identity, uploadState: 'SUCCEEDED', crxVersion: '0.1' }), json({ ...identity, itemId: 'wrong', uploadState: 'SUCCEEDED', crxVersion: version })]) {
    await assert.rejects(chrome(chromeConfig, zip, version, sequence([token(), response]).request, polling));
  }
  await assert.rejects(chrome(chromeConfig, zip, version, sequence([json({})]).request, polling), /token/);
});
test('Edge uploads exact bytes, polls, then submits plain-text notes', async () => {
  const status = value => json({ id: op, status: value, errors: null, errorCode: '' });
  const { request, calls } = sequence([accepted(), status('InProgress'), status('Succeeded'), accepted(), status('InProgress'), status('Succeeded')]);
  assert.equal(await edge(edgeConfig, zip, version, request, polling), 'Succeeded');
  const root = `https://api.addons.microsoftedge.microsoft.com/v1/products/${edgeConfig.EDGE_PRODUCT_ID}/submissions`;
  assert.equal(calls[0].url, `${root}/draft/package`);
  assert.equal(calls[0].body, zip);
  assert.equal(calls[0].headers.Authorization, 'ApiKey secret-sentinel');
  assert.equal(calls[0].headers['X-ClientID'], 'client');
  assert.equal(calls[1].url, `${root}/draft/package/operations/${op}`);
  assert.equal(calls[3].url, root);
  assert.equal(calls[3].headers['Content-Type'], 'text/plain');
  assert.equal(calls[3].body, `Automated SakuraMeter release ${version}.`);
  assert.equal(calls[4].url, `${root}/operations/${op}`);
});
for (const state of ['Failed', 'Unknown', '', null]) test(`Edge rejects ${state} before submission`, async () => {
  const { request, calls } = sequence([accepted(), json({ id: op, status: state })]);
  await assert.rejects(edge(edgeConfig, zip, version, request, polling));
  assert.equal(calls.length, 2);
});
test('Edge publish failure, missing operation ID, errors and identity mismatch fail', async () => {
  await assert.rejects(edge(edgeConfig, zip, version, sequence([accepted(), json({ id: op, status: 'Succeeded' }), accepted(), json({ id: op, status: 'Failed' })]).request, polling));
  for (const body of [{ id: 'wrong', status: 'Succeeded' }, { id: op, status: 'Succeeded', errorCode: 'secret-sentinel' }, { id: op, status: 'Succeeded', errors: ['secret-sentinel'] }]) {
    await assert.rejects(edge(edgeConfig, zip, version, sequence([accepted(), json(body)]).request, polling));
  }
  for (const location of ['', 'https://evil.invalid/operation', '../escape']) {
    assert.throws(() => operation(new Response(null, { headers: { location } })));
  }
});
test('bounded polling never turns timeout into success', async () => {
  let count = 0;
  await assert.rejects(poll('Test', async () => { count++; return { status: 'InProgress' }; }, 'status', 'Succeeded', 'InProgress', polling), /limit/);
  assert.equal(count, 3);
});
for (const status of [202, 301, 400, 401, 403, 429, 500]) test(`HTTP ${status} fails without response leaks`, async () => {
  await assert.rejects(sequence([json({ secret: 'secret-sentinel' }, status)]).request('Test', 'https://example.invalid'), error => error.message === `Test: HTTP ${status}`);
});
test('invalid JSON, API error and network errors never expose payloads', async () => {
  for (const response of [new Response('secret-sentinel'), json(null), json([]), json({ error: 'secret-sentinel' }), new Error('secret-sentinel')]) {
    await assert.rejects(sequence([response]).request('Test', 'https://example.invalid'), error => !error.message.includes('secret-sentinel'));
  }
});
test('checksum mismatch and missing ZIP stop before network', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'store-publish-test-'));
  try {
    const path = join(dir, 'release.zip');
    const env = { ...edgeConfig, EDGE_STORE_PUBLISH_ENABLED: 'true', RELEASE_VERSION: version, ZIP_PATH: path, ZIP_SHA256: '0'.repeat(64) };
    const dependencies = { fetchImpl: () => assert.fail('network before validation') };
    await assert.rejects(run('edge', env, dependencies), /cannot be read/);
    await writeFile(path, zip);
    await assert.rejects(run('edge', env, dependencies), /checksum/);
    env.ZIP_SHA256 = createHash('sha256').update(zip).digest('hex');
    const mock = sequence([accepted(), json({ id: op, status: 'Succeeded' }), accepted(), json({ id: op, status: 'Succeeded' })]);
    assert.match(await run('edge', env, { fetchImpl: mock.fetchImpl, polling }), /submission accepted/);
    assert.deepEqual(mock.calls[0].body, zip);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI missing credentials exits nonzero and never prints their values', () => {
  const result = spawnSync(process.execPath, ['.github/scripts/store-publish.mjs', 'edge'], {
    env: { EDGE_STORE_PUBLISH_ENABLED: 'true', EDGE_PRODUCT_ID: 'secret-sentinel' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-sentinel/);
});
test('workflow builds once; all destinations share build artifact and hash; stores wait for release', async () => {
  const workflow = await readFile('.github/workflows/release.yml', 'utf8');
  assert.equal((workflow.match(/release-package.py build/g) || []).length, 1);
  assert.match(workflow, /needs: \[build, github-release\]/);
  assert.equal((workflow.match(/name: \$\{\{ needs.build.outputs.artifact_name \}\}/g) || []).length, 2);
  assert.equal((workflow.match(/release-package.py verify/g) || []).length, 2);
  assert.doesNotMatch(workflow, /continue-on-error|workflow_dispatch|staging/);
  assert.match(workflow, /fail-fast: false/);
});

test('Chrome async upload failure and exhaustion never submit', async () => {
  for (const states of [['FAILED'], ['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS']]) {
    const { request, calls } = sequence([token(), uploaded('IN_PROGRESS'), ...states.map(state => json({ ...identity, lastAsyncUploadState: state }))]);
    await assert.rejects(chrome(chromeConfig, zip, version, request, polling));
    assert.ok(calls.every(call => !call.url.endsWith(':publish')));
  }
});
test('HTTP rejection at every Chrome stage fails with no extra mutation', async () => {
  const good = () => [token(), uploaded('IN_PROGRESS'), json({ ...identity, lastAsyncUploadState: 'SUCCEEDED' }), submitted('PENDING_REVIEW')];
  for (let stage = 0; stage < 4; stage++) {
    const responses = good().slice(0, stage);
    responses.push(json({ error: 'secret-sentinel' }, 403));
    const { request, calls } = sequence(responses);
    await assert.rejects(chrome(chromeConfig, zip, version, request, polling), /HTTP 403/);
    assert.equal(calls.length, stage + 1);
  }
});
test('HTTP rejection at every Edge stage fails with no extra mutation', async () => {
  const good = () => [accepted(), json({ id: op, status: 'Succeeded' }), accepted(), json({ id: op, status: 'Succeeded' })];
  for (let stage = 0; stage < 4; stage++) {
    const responses = good().slice(0, stage);
    responses.push(json({ error: 'secret-sentinel' }, 401));
    const { request, calls } = sequence(responses);
    await assert.rejects(edge(edgeConfig, zip, version, request, polling), /HTTP 401/);
    assert.equal(calls.length, stage + 1);
  }
});
test('Edge upload polling exhaustion never submits', async () => {
  const { request, calls } = sequence([accepted(), ...Array.from({ length: 3 }, () => json({ id: op, status: 'InProgress' }))]);
  await assert.rejects(edge(edgeConfig, zip, version, request, polling), /limit/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
});

test('Edge operation polling accepts JSON HTTP 202 without treating it as success', async () => {
  const pending = () => new Response(JSON.stringify({ id: op, status: 'InProgress' }), {status: 202});
  const done = () => json({ id: op, status: 'Succeeded' });
  const { request, calls } = sequence([accepted(), pending(), done(), accepted(), pending(), done()]);
  assert.equal(await edge(edgeConfig, zip, version, request, polling), 'Succeeded');
  assert.equal(calls.length, 6);
  const failed = sequence([accepted(), new Response(JSON.stringify({id: op, status:'Failed'}), {status:202})]);
  await assert.rejects(edge(edgeConfig, zip, version, failed.request, polling));
  assert.equal(failed.calls.length, 2);
});
