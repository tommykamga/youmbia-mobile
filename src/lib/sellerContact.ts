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

/** Normalise pour wa.me / tel / sms (FR : 0x → 33…). */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return null;
  if (digits.length === 10 && digits.startsWith('0')) return '33' + digits.slice(1);
  if (digits.length === 9) return '33' + digits;
  if (digits.length >= 10) return digits;
  return null;
}

function telUriFromNormalized(digits: string): string {
  return `tel:+${digits.replace(/^\+/, '')}`;
}

function smsUriFromNormalized(digits: string, body?: string): string {
  const base = `sms:+${digits.replace(/^\+/, '')}`;
  if (body && body.trim()) {
    return `${base}?body=${encodeURIComponent(body.trim())}`;
  }
  return base;
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
  const whatsappNumber = normalizePhoneForWhatsApp(raw);
  if (!whatsappNumber) {
    Alert.alert('WhatsApp indisponible', 'Numéro du vendeur non disponible.');
    return false;
  }
  const text = buildWhatsAppMessage(listing);
  const url = `${WHATSAPP_PREFIX}/${whatsappNumber}?text=${encodeURIComponent(text)}`;
  try {
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp.");
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('WhatsApp indisponible', "Impossible d'ouvrir WhatsApp.");
    return false;
  }
}

export async function openSellerPhoneCall(listing: ListingDetail): Promise<boolean> {
  const digits = normalizePhoneForWhatsApp(listing.seller?.phone ?? null);
  if (!digits) {
    Alert.alert('Appel', 'Numéro de téléphone non disponible.');
    return false;
  }
  const telUrl = telUriFromNormalized(digits);
  try {
    const canOpen = await Linking.canOpenURL(telUrl);
    if (canOpen) {
      await Linking.openURL(telUrl);
      return true;
    }
    Alert.alert('Appel', "Impossible d'ouvrir l'application téléphone.");
    return false;
  } catch {
    Alert.alert('Appel', 'Une erreur est survenue.');
    return false;
  }
}

export async function openSellerSms(listing: ListingDetail): Promise<boolean> {
  const digits = normalizePhoneForWhatsApp(listing.seller?.phone ?? null);
  if (!digits) {
    Alert.alert('SMS', 'Numéro de téléphone non disponible.');
    return false;
  }
  const body = buildWhatsAppMessage(listing);
  const smsUrl = smsUriFromNormalized(digits, body);
  try {
    const canOpen = await Linking.canOpenURL(smsUrl);
    if (canOpen) {
      await Linking.openURL(smsUrl);
      return true;
    }
    Alert.alert('SMS', "Impossible d'ouvrir l'application Messages.");
    return false;
  } catch {
    Alert.alert('SMS', 'Une erreur est survenue.');
    return false;
  }
}

export function isSellerContactAction(value: string | undefined): value is SellerContactAction {
  return (
    value === 'whatsapp' ||
    value === 'call' ||
    value === 'sms' ||
    value === 'message'
  );
}
