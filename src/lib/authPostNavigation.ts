/**
 * Point d’entrée unique pour la sortie « post-authentification réussie » (mobile).
 *
 * - Toujours `router.replace` (pas de `push`) : évite l’empilement auth → l’utilisateur ne revient pas
 *   sur login / gate après un retour arrière.
 * - Délègue la résolution de la route à `buildPostAuthHref` (redirect + contact vendeur).
 *
 * À utiliser après : Google OAuth, email/mot de passe, signup direct, session déjà présente au montage.
 * Le flux magic link / deep link utilise la même destination via `buildPostAuthHref` dans
 * `handleSupabaseAuthDeepLink` puis `router.replace` dans `app/_layout`.
 */

import type { Href } from 'expo-router';
import { buildPostAuthHref } from '@/lib/authRedirect';

export type AuthRouterReplace = {
  replace: (href: Href) => void;
};

export function replaceAfterSuccessfulAuth(
  router: AuthRouterReplace,
  redirectParam: string | undefined,
  contactParam: string | undefined
): void {
  router.replace(buildPostAuthHref(redirectParam, contactParam));
}
