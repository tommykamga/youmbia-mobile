// Local-only Expo Push HTTP simulator. It has no outbound network client.
import fs from 'node:fs';
import http from 'node:http';

const envPath = process.argv[2];
if (!envPath) throw new Error('Pass the mode-0600 local E2E env file');
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split('\n').map((line) => {
  const at = line.indexOf('=');
  return [line.slice(0, at), line.slice(at + 1)];
}));
if (env.E2E_PROJECT_ID !== 'youmbia-push-e2e-local') throw new Error('isolated project identity required');

const sends = [];
const receipts = [];
let modes = [];
let receiptMode = 'ok';
let sequence = 0;

const server = http.createServer(async (request, response) => {
  const json = (status, value) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  if (request.headers['x-e2e-secret'] !== env.TRANSACTIONAL_PUSH_DISPATCH_SECRET) return json(401, {});

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* malformed body remains empty */ }
  const path = new URL(request.url, 'http://127.0.0.1').pathname;

  if (path === '/_state') return json(200, { sends, receipts });
  if (path === '/_mode') {
    modes = body.modes ?? [];
    receiptMode = body.receipts ?? 'ok';
    if (body.reset) { sends.length = 0; receipts.length = 0; }
    return json(200, { ok: true });
  }
  if (path.endsWith('/getReceipts')) {
    receipts.push(body.ids);
    if (receiptMode === 'missing') return json(200, { data: {} });
    return json(200, { data: Object.fromEntries((body.ids ?? []).map((id) => [id,
      receiptMode === 'dnr'
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok' },
    ])) });
  }
  if (!path.endsWith('/send')) return json(404, {});
  sends.push(body);
  const mode = modes.shift() ?? 'ok';
  if (mode === '429' || mode === '500') return json(Number(mode), {});
  if (mode === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    return json(200, { data: [{ status: 'ok', id: `late-${++sequence}` }] });
  }
  if (mode === 'malformed') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end('invalid json');
  }
  if (mode === 'dnr') return json(200, { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
  if (mode === 'rate') return json(200, { data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] });
  return json(200, { data: [{ status: 'ok', id: `synthetic-ticket-${++sequence}` }] });
});

server.listen(55541, '0.0.0.0', () => console.log('Local Expo transport mock listening on port 55541'));
