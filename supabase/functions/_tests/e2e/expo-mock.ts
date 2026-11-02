const envPath = Deno.args[0];
const env = Object.fromEntries((await Deno.readTextFile(envPath)).trim().split('\n').map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
if (env.E2E_PROJECT_ID !== 'youmbia-push-e2e-local') throw new Error('local test identity required');
const sends: unknown[] = [];
const receipts: string[][] = [];
let modes: string[] = [];
let receiptMode = 'ok';
let sequence = 0;
Deno.serve({ hostname: '0.0.0.0', port: 55541 }, async req => {
  if (req.headers.get('x-e2e-secret') !== env.TRANSACTIONAL_PUSH_DISPATCH_SECRET) return new Response(null, { status: 401 });
  const path = new URL(req.url).pathname;
  if (path === '/_state') return Response.json({ sends, receipts });
  if (path === '/_mode') {
    const value = await req.json(); modes = value.modes ?? []; receiptMode = value.receipts ?? 'ok';
    if (value.reset) { sends.length = 0; receipts.length = 0; }
    return Response.json({ ok: true });
  }
  if (path.endsWith('/getReceipts')) {
    const { ids } = await req.json(); receipts.push(ids);
    if (receiptMode === 'missing') return Response.json({ data: {} });
    return Response.json({ data: Object.fromEntries(ids.map((id: string) => [id, receiptMode === 'dnr'
      ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }])) });
  }
  if (!path.endsWith('/send')) return new Response(null, { status: 404 });
  const payload = await req.json(); sends.push(payload);
  const mode = modes.shift() ?? 'ok';
  if (mode === '429' || mode === '500') return new Response('{}', { status: Number(mode) });
  if (mode === 'timeout') {
    await new Promise(resolve => setTimeout(resolve, 12000));
    return Response.json({ data: [{ status: 'ok', id: `late-${++sequence}` }] });
  }
  if (mode === 'malformed') return new Response('invalid json');
  if (mode === 'dnr') return Response.json({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
  if (mode === 'rate') return Response.json({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] });
  return Response.json({ data: [{ status: 'ok', id: `synthetic-ticket-${++sequence}` }] });
});
