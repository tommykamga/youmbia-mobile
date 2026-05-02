/**
 * Contenu contextuel de l’Auth Gate mobile (textes + route de retour post-auth).
 * Aucune logique UI — données uniquement.
 */

/** Contextes d’entrée supportés par l’Auth Gate. */
export type AuthGateContextId = 'favorites' | 'sell' | 'messages' | 'account' | 'listings';

/** Libellés CTA mutualisés (Google / email). */
export const AUTH_GATE_SHARED_CTA_LABELS = {
  primaryGoogle: 'Continuer avec Google',
  secondaryEmail: 'Continuer avec email',
} as const;

export type AuthGateSharedCtaLabels = typeof AUTH_GATE_SHARED_CTA_LABELS;

/**
 * Configuration affichable pour un contexte donné.
 * `successHref` : route Expo Router cible après authentification réussie (intention utilisateur).
 */
export type AuthGateContextConfig = {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  /** Destination logique post-succès (chemin app). */
  successHref: string;
};

const FALLBACK_CONTEXT: AuthGateContextId = 'account';

function withSharedCtas(
  partial: Pick<AuthGateContextConfig, 'title' | 'subtitle' | 'successHref'>
): AuthGateContextConfig {
  return {
    ...partial,
    primaryCtaLabel: AUTH_GATE_SHARED_CTA_LABELS.primaryGoogle,
    secondaryCtaLabel: AUTH_GATE_SHARED_CTA_LABELS.secondaryEmail,
  };
}

/**
 * Configuration par contexte d’entrée.
 * Les CTA reprennent les libellés mutualisés.
 */
export const AUTH_GATE_CONTEXT_CONFIG: Record<AuthGateContextId, AuthGateContextConfig> = {
  favorites: withSharedCtas({
    title: 'Vos coups de cœur, toujours à portée',
    subtitle: 'Enregistrez vos annonces préférées et retrouvez-les en un instant.',
    successHref: '/(tabs)/favorites',
  }),
  sell: withSharedCtas({
    title: 'Publiez en toute confiance',
    subtitle: 'Diffusez votre annonce et suivez vos échanges depuis votre espace.',
    successHref: '/sell',
  }),
  messages: withSharedCtas({
    title: 'Échangez en direct',
    subtitle: 'Messagerie simple et sécurisée entre acheteurs et vendeurs.',
    successHref: '/(tabs)/messages',
  }),
  account: withSharedCtas({
    title: 'Votre espace personnel',
    subtitle: 'Compte, annonces et réglages — tout centralisé pour vous.',
    successHref: '/(tabs)/account',
  }),
  listings: withSharedCtas({
    title: 'Gérez vos annonces',
    subtitle: 'Connecte-toi pour suivre tes ventes et mettre à jour tes annonces.',
    successHref: '/account/listings',
  }),
};

/** Configuration utilisée si le contexte est absent ou inconnu. */
export const AUTH_GATE_FALLBACK_CONFIG: AuthGateContextConfig =
  AUTH_GATE_CONTEXT_CONFIG[FALLBACK_CONTEXT];

/**
 * Retourne la config pour un contexte, avec repli sûr sur `account`.
 */
export function getAuthGateContextConfig(
  context: AuthGateContextId | string | null | undefined
): AuthGateContextConfig {
  if (!context || typeof context !== 'string') {
    return AUTH_GATE_FALLBACK_CONFIG;
  }
  const id = context.trim() as AuthGateContextId;
  if (id in AUTH_GATE_CONTEXT_CONFIG) {
    return AUTH_GATE_CONTEXT_CONFIG[id];
  }
  return AUTH_GATE_FALLBACK_CONFIG;
}
