/**
 * Proxy local : /rest/v1/* → PostgREST /* (compatible createClient offline).
 */
const UPSTREAM = Deno.env.get('PGRST_UPSTREAM') ?? 'http://youmbia_postgrest_04c:3000';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.startsWith('/rest/v1')) {
    path = path.slice('/rest/v1'.length) || '/';
  }
  const target = `${UPSTREAM.replace(/\/$/, '')}${path}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete('host');
  return fetch(target, {
    method: req.method,
    headers,
    body: req.body,
    redirect: 'manual',
  });
});
