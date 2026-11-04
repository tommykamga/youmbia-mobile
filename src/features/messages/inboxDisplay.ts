import { spacing } from '@/theme';

/** Formatage date inbox — sémantique inchangée (Phase A baseline). */

export function formatInboxDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) return 'Hier';
    if (days < 7) {
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      return dayNames[d.getDay()];
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

export function countUnreadConversations(conversations: { unread_count?: number }[]): number {
  return conversations.filter((c) => (c.unread_count ?? 0) > 0).length;
}

export const INBOX_LISTING_THUMB_SIZE = 72;

/** Marge gauche séparateur = padding ligne + miniature + espace contenu (aligné colonne texte). */
export const INBOX_ROW_SEPARATOR_MARGIN_LEFT =
  spacing.base + INBOX_LISTING_THUMB_SIZE + spacing.md;
