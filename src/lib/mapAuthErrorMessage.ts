/**
 * Messages d’erreur lisibles pour l’utilisateur (auth email / OTP / Google).
 */

export function mapAuthErrorMessage(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login')) return 'Email ou mot de passe incorrect.';
  if (msg.includes('network') || msg.includes('réseau') || msg.includes('fetch')) {
    return 'Réseau indisponible. Réessayez.';
  }
  if (msg.includes('email')) return 'Vérifiez votre adresse email.';
  if (msg.includes('rate limit')) return 'Trop de tentatives brèves. Veuillez patienter.';
  return error.message || 'Connexion impossible. Réessayez.';
}
