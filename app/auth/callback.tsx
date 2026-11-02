import { MagicLinkEntryScreen } from '@/features/auth/MagicLinkEntryScreen';

/**
 * Destination 307 Web et callback OTP HTTPS.
 * Ne jamais finaliser la session ici : le root layout + dédup auth deep-link s’en chargent.
 */
export default function AuthCallbackEntry() {
  return <MagicLinkEntryScreen />;
}
