/**
 * Contact vendeur (WhatsApp, appel, SMS) — logique partagée pour la fiche annonce.
 * Mobile-only ; aucune dépendance au web.
 */

import { Alert, Linking } from 'react-native';
import { formatPrice } from '@/lib/format';
import { getPublicListingUrl } from '@/lib/shareListing';
import type { ListingDetail } from '@/services/listings';

export type SellerContactAction = 'whatsapp' | 'call' | 'sms' | 'message';

const WHATSAPP_PREFIX = 'https://wa.me';

type NormalizedContactPhone = {
  /** dialable for tel:/sms: digits and optional leading + (only if present in source) */
  dialable: string;
  /** digits only for wa.me and whatsapp:// (no leading +) */
  waDigits: string;
};

/**
 * Normalisation du numéro pour actions externes.
 * - supprime espaces/tirets/parenthèses
 * - conserve un éventuel '+' en tête uniquement s'il existait déjà
 */
function normalizePhoneForContact(raw: string | null | undefined): NormalizedContactPhone | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 3) return null;

  const dialable = hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
  return { dialable, waDigits: digitsOnly };
}

/** Normalise pour wa.me / whatsapp:// (digits only). */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  return normalizePhoneForContact(raw)?.waDigits ?? null;
}

function buildWhatsAppMessage(listing: ListingDetail): string {
  const title = String(listing.title ?? '').trim() || 'Annonce YOUMBIA';
  const price =
    typeof listing.price === 'number' && Number.isFinite(listing.price)
      ? formatPrice(listing.price)
      : null;
  const publicListingUrl = getPublicListingUrl(listing.id);
  const parts = [
    `Bonjour, je vous contacte au sujet de votre annonce YOUMBIA : ${title}.`,
    price ? `Prix : ${price}.` : null,
    publicListingUrl,
  ].filter(Boolean);
  return parts.join('\n');
}

export async function openWhatsAppForListing(listing: ListingDetail): Promise<boolean> {
  const raw = listing.seller?.phone ?? null;
  const phone = normalizePhoneForContact(raw);
  if (!phone) {
    Alert.alert('WhatsApp indisponible', 'Numéro du vendeur non disponible.');
    return false;
  }
  const text = buildWhatsAppMessage(listing);
  const encoded = encodeURIComponent(text);
  const appUrl = `whatsapp://send?phone=${phone.waDigits}&text=${encoded}`;
  const webUrl = `${WHATSAPP_PREFIX}/${phone.waDigits}?text=${encoded}`;

  try {
    await Linking.openURL(appUrl);
    return true;
  } catch (e) {
    if (__DEV__) console.debug('[sellerContact] WhatsApp app open failed, fallback to wa.me', e);
  }

  try {
    await Linking.openURL(webUrl);
    return true;
  } catch (e) {
    if (__DEV__) console.debug('[sellerContact] WhatsApp web open failed', e);
    Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp.");
    return false;
  }
}

export async function openSellerPhoneCallRaw(rawPhone: string | null | undefined): Promise<boolean> {
  const phone = normalizePhoneForContact(rawPhone);
  if (!phone) {
    Alert.alert('Appel', 'Numéro de téléphone non disponible.');
    return false;
  }
  const telUrl = `tel:${phone.dialable}`;
  try {
    await Linking.openURL(telUrl);
    return true;
  } catch (e) {
    if (__DEV__) console.debug('[sellerContact] tel open failed', e);
    Alert.alert('Appel', "Impossible d'ouvrir l'application téléphone.");
    return false;
  }
}

export async function openSellerPhoneCall(listing: ListingDetail): Promise<boolean> {
  return openSellerPhoneCallRaw(listing.seller?.phone ?? null);
}

export async function openSellerSmsRaw(
  rawPhone: string | null | undefined,
  body?: string
): Promise<boolean> {
  const phone = normalizePhoneForContact(rawPhone);
  if (!phone) {
    Alert.alert('SMS', 'Numéro de téléphone non disponible.');
    return false;
  }
  const smsUrl = body
    ? `sms:${phone.dialable}?body=${encodeURIComponent(body.trim())}`
    : `sms:${phone.dialable}`;
  try {
    await Linking.openURL(smsUrl);
    return true;
  } catch (e) {
    if (__DEV__) console.debug('[sellerContact] sms open failed', e);
    Alert.alert('SMS', "Impossible d'ouvrir l'application Messages.");
    return false;
  }
}

export async function openSellerSms(listing: ListingDetail): Promise<boolean> {
  const body = buildWhatsAppMessage(listing);
  return openSellerSmsRaw(listing.seller?.phone ?? null, body);
}

export function isSellerContactAction(value: string | undefined): value is SellerContactAction {
  return (
    value === 'whatsapp' ||
    value === 'call' ||
    value === 'sms' ||
    value === 'message'
  );
}
