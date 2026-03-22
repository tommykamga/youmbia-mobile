/**
 * Path passé à makeRedirectUri pour le lien magique (aligné email / callback Supabase).
 */

export function buildMagicLinkOtpPath(redirect?: string, contact?: string): string | undefined {
  const parts: string[] = [];
  if (redirect) parts.push(`redirect=${encodeURIComponent(redirect)}`);
  if (contact) parts.push(`contact=${encodeURIComponent(contact)}`);
  if (parts.length === 0) return undefined;
  return parts.join('&');
}
