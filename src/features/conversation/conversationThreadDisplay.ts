/** Formatage horaire fil — sémantique inchangée (baseline route). */

export function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Hier ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return (
      d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
      ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return '';
  }
}

export function formatMessageDaySeparator(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Aujourd'hui";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export function isSameCalendarDay(a: string, b: string): boolean {
  try {
    return new Date(a).toDateString() === new Date(b).toDateString();
  } catch {
    return false;
  }
}

export function getThreadErrorMessage(message: string, fallback: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('non connecté') || msg.includes('jwt') || msg.includes('auth')) return 'Connexion requise';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) return 'Réseau indisponible';
  return fallback;
}
