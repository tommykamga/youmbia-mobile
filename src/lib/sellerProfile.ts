import { sanitizeProfileDisplayValue } from '@/services/profile';

function getFirstNonEmptyProfileField(
  profile: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!profile) return '';
  for (const key of keys) {
    const value = profile[key];
    if (typeof value !== 'string') continue;
    const sanitized = sanitizeProfileDisplayValue(value);
    if (sanitized.trim()) return sanitized;
  }
  return '';
}

export function getSellerProfileDisplayName(
  profile: Record<string, unknown> | null | undefined
): string {
  return getFirstNonEmptyProfileField(profile, [
    'display_name',
    'username',
    'pseudo',
    'full_name',
  ]);
}

export function getSellerProfilePhone(
  profile: Record<string, unknown> | null | undefined
): string {
  return getFirstNonEmptyProfileField(profile, [
    'whatsapp_phone',
    'phone_number',
    'phone',
  ]);
}

/** Profil vendeur complet pour publier : nom/pseudo + téléphone renseignés. */
export function isSellerProfileComplete(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return !!getSellerProfileDisplayName(profile).trim() && !!getSellerProfilePhone(profile).trim();
}
