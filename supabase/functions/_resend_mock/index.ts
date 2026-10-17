/**
 * Faux fournisseur Resend — réseau Docker isolé uniquement.
 * GET /_stats → compteurs ; POST /emails → id mock.
 */
const state = { posts: 0, lastBody: '' };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname.endsWith('/_stats')) {
    return Response.json({ posts: state.posts, lastBody: state.lastBody.slice(0, 500) });
  }
  if (req.method === 'POST' && url.pathname.endsWith('/emails')) {
    state.posts += 1;
    state.lastBody = await req.text();
    return Response.json({ id: `re_mock_${state.posts}` });
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
});
