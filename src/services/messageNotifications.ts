import 'expo-sqlite/localStorage/install';

import { getSession } from '@/services/auth';
import { getConversations, type Conversation } from '@/services/conversations';
import {
  getPushPermissionStatus,
  initializeNotifications,
  reserveNotificationDispatch,
} from '@/services/notifications';

const MESSAGE_NOTIFICATION_STATE_KEY = 'youmbia.messageNotifications.v1';
const MESSAGE_NOTIFICATION_COOLDOWN_MS = 15000;

type MessageNotificationSnapshot = {
  userId: string;
  unreadByConversation: Record<string, number>;
};

let syncInFlight = false;

function readSnapshot(): MessageNotificationSnapshot | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGE_NOTIFICATION_STATE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MessageNotificationSnapshot> | null;
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.unreadByConversation !== 'object') {
      return null;
    }
    return {
      userId: parsed.userId,
      unreadByConversation: parsed.unreadByConversation as Record<string, number>,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: MessageNotificationSnapshot): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MESSAGE_NOTIFICATION_STATE_KEY, JSON.stringify(snapshot));
    }
  } catch {}
}

async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

function buildUnreadMap(conversations: Conversation[]): Record<string, number> {
  return conversations.reduce<Record<string, number>>((acc, conversation) => {
    acc[conversation.id] = Math.max(0, conversation.unread_count ?? 0);
    return acc;
  }, {});
}

function buildNotificationBody(name: string | null | undefined): string {
  const safeName = String(name ?? '').trim();
  return safeName ? `${safeName} vous a écrit` : 'Vous avez reçu un nouveau message';
}

function isConversationAlreadyOpen(currentPath: string | null | undefined, conversationId: string): boolean {
  const safePath = String(currentPath ?? '').trim();
  return safePath === `/conversation/${conversationId}`;
}

async function scheduleNewMessageNotification(conversation: Conversation): Promise<void> {
  initializeNotifications();
  const Notifications = await import('expo-notifications');
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nouveau message',
      body: buildNotificationBody(conversation.other_party_name),
      data: {
        conversationId: conversation.id,
        href: `/conversation/${conversation.id}`,
        type: 'new_message',
      },
    },
    trigger: null,
  });
}

export async function syncNewMessageNotifications(
  currentPath: string | null | undefined
): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const result = await getConversations();
    if (result.error || !result.data) return;

    const conversations = result.data;
    const previousSnapshot = readSnapshot();
    const previousUnread =
      previousSnapshot?.userId === userId ? previousSnapshot.unreadByConversation : {};
    const nextUnread = buildUnreadMap(conversations);

    if (previousSnapshot?.userId !== userId) {
      writeSnapshot({
        userId,
        unreadByConversation: nextUnread,
      });
      return;
    }

    const permissionStatus = await getPushPermissionStatus();
    const canNotify = permissionStatus === 'granted';

    const newestConversation = conversations.find((conversation) => {
      const currentUnread = Math.max(0, conversation.unread_count ?? 0);
      const previousCount = Math.max(0, previousUnread[conversation.id] ?? 0);
      if (currentUnread <= previousCount) return false;
      if (isConversationAlreadyOpen(currentPath, conversation.id)) return false;
      return true;
    });

    const notificationKey = newestConversation ? `message:${newestConversation.id}` : '';

    if (
      canNotify &&
      newestConversation &&
      reserveNotificationDispatch(notificationKey, MESSAGE_NOTIFICATION_COOLDOWN_MS)
    ) {
      await scheduleNewMessageNotification(newestConversation).catch(() => {});
    }

    writeSnapshot({
      userId,
      unreadByConversation: nextUnread,
    });
  } finally {
    syncInFlight = false;
  }
}

export async function syncMessageNotificationSnapshot(conversations: Conversation[]): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  writeSnapshot({
    userId,
    unreadByConversation: buildUnreadMap(conversations),
  });
}

export async function markConversationNotificationAsRead(conversationId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId || !conversationId.trim()) return;

  const existing = readSnapshot();
  const nextUnread =
    existing?.userId === userId ? { ...existing.unreadByConversation } : {};

  nextUnread[conversationId.trim()] = 0;
  writeSnapshot({
    userId,
    unreadByConversation: nextUnread,
  });
}
