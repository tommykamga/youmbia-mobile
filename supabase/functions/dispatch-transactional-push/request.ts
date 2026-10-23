export function authorized(request: Request, secret: string | undefined): boolean {
  const supplied = request.headers.get('x-transactional-push-secret') ?? '';
  if (!secret || secret.length < 32 || supplied.length !== secret.length) return false;
  let difference = 0;
  for (let i = 0; i < secret.length; i++) difference |= supplied.charCodeAt(i) ^ secret.charCodeAt(i);
  return difference === 0;
}

/** Testable HTTP boundary. The body is only a wake-up signal, never a delivery definition. */
export async function handleDispatchRequest(
  req: Request, secret: string | undefined, enabled: boolean,
  run: () => Promise<Response>,
): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!authorized(req, secret)) return new Response(null, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!enabled) return Response.json({ skipped: 'disabled' });
  return run();
}
