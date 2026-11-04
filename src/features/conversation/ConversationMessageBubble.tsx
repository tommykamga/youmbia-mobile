import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Message } from '@/services/conversations/types';
import { formatMessageTime } from '@/features/conversation/conversationThreadDisplay';
import { spacing, colors, typography, fontWeights } from '@/theme';

type Props = {
  message: Message;
  isMe: boolean;
  showReadStatus: boolean;
  daySeparatorLabel?: string | null;
  extraTopMargin: boolean;
};

export function ConversationMessageBubble({
  message,
  isMe,
  showReadStatus,
  daySeparatorLabel,
  extraTopMargin,
}: Props) {
  const readLabel = message.read_at ? 'Lu' : 'Envoyé';

  return (
    <View style={[styles.block, extraTopMargin && styles.extraTop]}>
      {daySeparatorLabel ? (
        <Text style={styles.daySeparator} accessibilityRole="text">
          {daySeparatorLabel}
        </Text>
      ) : null}
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
        <View style={[styles.bubbleColumn, { alignItems: isMe ? 'flex-end' : 'flex-start' }]}>
          <View
            style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
            accessible
            accessibilityLabel={`${isMe ? 'Vous' : 'Interlocuteur'} : ${message.body}`}
          >
            <Text style={isMe ? styles.bubbleTextMe : styles.bubbleText}>{message.body}</Text>
            <Text
              style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}
              accessibilityLabel={`Envoyé ${formatMessageTime(message.created_at)}`}
            >
              {formatMessageTime(message.created_at)}
            </Text>
          </View>
          {showReadStatus ? (
            <Text style={styles.readStatus} accessibilityLiveRegion="polite">
              {readLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Largeur max colonne bulle (82–85 %). */
export const CONVERSATION_BUBBLE_MAX_WIDTH = '83%' as const;

const styles = StyleSheet.create({
  block: {
    width: '100%',
  },
  extraTop: {
    marginTop: spacing.md,
  },
  daySeparator: {
    alignSelf: 'center',
    ...typography.xs,
    color: colors.textTertiary,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  bubbleWrap: {
    flexDirection: 'row',
    width: '100%',
  },
  bubbleWrapMe: {
    justifyContent: 'flex-end',
  },
  bubbleWrapThem: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: CONVERSATION_BUBBLE_MAX_WIDTH,
  },
  bubble: {
    maxWidth: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: colors.primaryDark,
    borderBottomRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bubbleText: {
    ...typography.base,
    color: colors.text,
    lineHeight: 22,
  },
  bubbleTextMe: {
    ...typography.base,
    color: colors.surface,
    lineHeight: 22,
  },
  bubbleTime: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  bubbleTimeMe: {
    color: colors.primaryLight,
  },
  readStatus: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 4,
    marginRight: 4,
  },
});
