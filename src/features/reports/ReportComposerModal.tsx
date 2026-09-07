import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Input } from '@/components';
import {
  REPORT_COMMENT_MAX_LENGTH,
  REPORT_REASON_LABELS,
  type ReportReasonCode,
  type ReportTargetType,
  getReportReasonsForTarget,
} from '@/constants/reportReasons';
import { colors, fontWeights, radius, spacing, typography } from '@/theme';

export type ReportComposerModalProps = {
  visible: boolean;
  targetType: ReportTargetType;
  title: string;
  loading: boolean;
  reason: ReportReasonCode | null;
  comment: string;
  onChangeReason: (reason: ReportReasonCode | null) => void;
  onChangeComment: (comment: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function ReportComposerModal({
  visible,
  targetType,
  title,
  loading,
  reason,
  comment,
  onChangeReason,
  onChangeComment,
  onCancel,
  onSubmit,
}: ReportComposerModalProps) {
  const reasons = useMemo(() => getReportReasonsForTarget(targetType), [targetType]);
  const showComment = reason === 'other';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => {
          if (!loading) onCancel();
        }}
      >
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Choisissez un motif</Text>
          <ScrollView
            style={styles.reasons}
            contentContainerStyle={styles.reasonsContent}
            keyboardShouldPersistTaps="handled"
          >
            {reasons.map((code) => (
              <Pressable
                key={code}
                style={({ pressed }) => [
                  styles.reasonOption,
                  reason === code && styles.reasonOptionSelected,
                  pressed && styles.reasonOptionPressed,
                ]}
                onPress={() => onChangeReason(reason === code ? null : code)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.reasonOptionText,
                    reason === code && styles.reasonOptionTextSelected,
                  ]}
                >
                  {REPORT_REASON_LABELS[code]}
                </Text>
              </Pressable>
            ))}
            {showComment ? (
              <Input
                label="Commentaire (facultatif)"
                value={comment}
                onChangeText={onChangeComment}
                placeholder="Précisez sans citer de messages privés"
                multiline
                maxLength={REPORT_COMMENT_MAX_LENGTH}
                editable={!loading}
                containerStyle={styles.comment}
              />
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button variant="ghost" onPress={onCancel} disabled={loading}>
              Annuler
            </Button>
            <Button onPress={onSubmit} loading={loading} disabled={loading || !reason}>
              Envoyer le signalement
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.base,
  },
  reasons: {
    flexGrow: 0,
    flexShrink: 1,
  },
  reasonsContent: {
    paddingBottom: spacing.sm,
  },
  reasonOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reasonOptionPressed: {
    opacity: 0.9,
  },
  reasonOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '40',
  },
  reasonOptionText: {
    ...typography.base,
    color: colors.text,
  },
  reasonOptionTextSelected: {
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  comment: {
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
