/**
 * Auth email (mot de passe + lien magique) pour l’écran Auth Gate — réutilise les services existants.
 */

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { makeRedirectUri } from 'expo-auth-session';
import { signIn, signInWithOtp } from '@/services/auth';
import { buildMagicLinkOtpPath } from '@/lib/authOtpRedirectPath';
import { mapAuthErrorMessage } from '@/lib/mapAuthErrorMessage';
import { isPlausibleEmail } from '@/lib/authEmailValidation';
import { buildResetHref } from '@/lib/authRedirect';
import { replaceAfterSuccessfulAuth } from '@/lib/authPostNavigation';

export type UseAuthGateEmailAuthOptions = {
  email: string;
  password: string;
  redirectParam: string;
  contactParam: string | undefined;
  clearMessages: () => void;
  setError: (message: string | null) => void;
  setMagicSuccess: (message: string | null) => void;
  setPasswordLoading: (loading: boolean) => void;
  setMagicLoading: (loading: boolean) => void;
};

export function useAuthGateEmailAuth({
  email,
  password,
  redirectParam,
  contactParam,
  clearMessages,
  setError,
  setMagicSuccess,
  setPasswordLoading,
  setMagicLoading,
}: UseAuthGateEmailAuthOptions) {
  const router = useRouter();

  const resetHrefForEmail = useCallback(
    (emailValue: string) =>
      buildResetHref({
        redirect: redirectParam,
        contact: contactParam,
        email: emailValue.trim() || undefined,
      }),
    [redirectParam, contactParam]
  );

  const handlePasswordSubmit = useCallback(async () => {
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Indiquez votre email et votre mot de passe.');
      return;
    }
    if (!isPlausibleEmail(trimmed)) {
      setError('Indiquez une adresse email valide.');
      return;
    }
    if (!password) {
      setError('Renseignez le mot de passe.');
      return;
    }
    setPasswordLoading(true);
    try {
      const result = await signIn(trimmed, password);
      if (result.ok) {
        replaceAfterSuccessfulAuth(router, redirectParam, contactParam);
      } else {
        setError(mapAuthErrorMessage(result.error));
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
    } finally {
      setPasswordLoading(false);
    }
  }, [
    clearMessages,
    contactParam,
    email,
    password,
    redirectParam,
    router,
    setError,
    setPasswordLoading,
  ]);

  const handleMagicLink = useCallback(async () => {
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Saisissez votre email pour recevoir le lien.');
      return;
    }
    if (!isPlausibleEmail(trimmed)) {
      setError('Indiquez une adresse email valide.');
      return;
    }
    setMagicLoading(true);
    try {
      const redirectTo = makeRedirectUri({
        path: buildMagicLinkOtpPath(redirectParam, contactParam),
      });
      const result = await signInWithOtp(trimmed, redirectTo);
      if (result.ok) {
        setMagicSuccess('Lien envoyé. Ouvrez votre boîte mail pour vous connecter.');
      } else {
        setError(mapAuthErrorMessage(result.error));
      }
    } catch {
      setError('Envoi impossible. Réessayez plus tard.');
    } finally {
      setMagicLoading(false);
    }
  }, [
    clearMessages,
    contactParam,
    email,
    redirectParam,
    setError,
    setMagicLoading,
    setMagicSuccess,
  ]);

  return {
    handlePasswordSubmit,
    handleMagicLink,
    resetHrefForEmail,
  };
}
