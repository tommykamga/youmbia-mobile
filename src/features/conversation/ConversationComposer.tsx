import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, colors, typography } from '@/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  paddingBottom: number;
};

export function ConversationComposer({
  value,
  onChangeText,
  onSend,
  sending,
  paddingBottom,
}: Props) {
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.container, { paddingBottom }]}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Écrivez un message…"
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={2000}
          editable={!sending}
          accessibilityLabel="Message"
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && styles.sendBtnPressed,
            !canSend && styles.sendBtnDisabled,
          ]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          hitSlop={4}
        >
          <Ionicons name="paper-plane" size={20} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.screenHorizontal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 22,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    ...typography.base,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnDisabled: {
    opacity: 0.45,
    backgroundColor: colors.textMuted,
  },
});
