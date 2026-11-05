import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdateBannerInset } from '@/context/AppUpdateBannerInsetContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { spacing, typography, fontWeights, radius } from '@/theme';
import { MARKETPLACE_TAB_TITLE_PADDING_BOTTOM } from '@/features/account/accountScreen.constants';
import {
  SELL_FLOW_HEADER_TITLE,
  SELL_FLOW_STEPS,
  SELL_FLOW_SURFACE,
  formatSellFlowStepIndicator,
  formatSellFlowStepSubtitle,
  resolveSellFlowStepVisualState,
  sellFlowStepIndex,
  type SellFlowStepId,
} from './sellFlowSteps';

export const SELL_FLOW_HEADER_BACK_MIN_SIZE = 44;

type SellFlowHeaderProps = {
  activeStepId: SellFlowStepId;
  onBackPress: () => void;
  backAccessibilityLabel: string;
};

export function getSellFlowHeaderWrapStyle(topInset: number) {
  return {
    paddingTop: topInset,
    backgroundColor: SELL_FLOW_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: MARKETPLACE_TAB_TITLE_PADDING_BOTTOM + spacing.xs,
  };
}

export function SellFlowHeader({
  activeStepId,
  onBackPress,
  backAccessibilityLabel,
}: SellFlowHeaderProps) {
  const insets = useSafeAreaInsets();
  const appUpdateBannerInset = useAppUpdateBannerInset();
  const topInset = appUpdateBannerInset > 0 ? spacing.xs : insets.top + spacing.xs;

  const activeIndex = sellFlowStepIndex(activeStepId);
  const stepIndicator = formatSellFlowStepIndicator(activeStepId);
  const stepSubtitle = formatSellFlowStepSubtitle(activeStepId);

  const segmentStates = useMemo(
    () =>
      SELL_FLOW_STEPS.map((_, index) => resolveSellFlowStepVisualState(index, activeIndex)),
    [activeIndex]
  );

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]} accessibilityRole="header">
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}
          onPress={onBackPress}
          hitSlop={6}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" accessibilityElementsHidden />
        </Pressable>
        <Text style={styles.mainTitle} numberOfLines={2} maxFontSizeMultiplier={1.35}>
          {SELL_FLOW_HEADER_TITLE}
        </Text>
        <View style={styles.stepBadge} accessibilityLabel={`Étape ${stepIndicator}`}>
          <Text style={styles.stepBadgeText} maxFontSizeMultiplier={1.2}>
            {stepIndicator}
          </Text>
        </View>
      </View>

      <Text style={styles.stepSubtitle} numberOfLines={2} maxFontSizeMultiplier={1.35}>
        {stepSubtitle}
      </Text>

      <View style={styles.segmentRow} accessibilityRole="tablist">
        {SELL_FLOW_STEPS.map((step, index) => {
          const state = segmentStates[index]!;
          const isActive = state === 'active';
          const isDone = state === 'done';
          return (
            <View
              key={step.id}
              style={styles.segmentCol}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${step.label}${isActive ? ', étape en cours' : isDone ? ', terminée' : ''}`}
            >
              <View
                style={[
                  styles.segmentTrack,
                  isDone && styles.segmentTrackDone,
                  isActive && styles.segmentTrackActive,
                  state === 'upcoming' && styles.segmentTrackUpcoming,
                ]}
              />
              <Text
                style={[
                  styles.segmentLabel,
                  isDone && styles.segmentLabelDone,
                  isActive && styles.segmentLabelActive,
                  state === 'upcoming' && styles.segmentLabelUpcoming,
                ]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: SELL_FLOW_SURFACE,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: MARKETPLACE_TAB_TITLE_PADDING_BOTTOM + spacing.xs,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: SELL_FLOW_HEADER_BACK_MIN_SIZE,
  },
  backBtn: {
    minWidth: SELL_FLOW_HEADER_BACK_MIN_SIZE,
    minHeight: SELL_FLOW_HEADER_BACK_MIN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    marginLeft: -spacing.xs,
  },
  backBtnPressed: {
    opacity: 0.85,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  mainTitle: {
    flex: 1,
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  stepBadge: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    ...typography.xs,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  stepSubtitle: {
    ...typography.sm,
    fontWeight: fontWeights.medium,
    color: 'rgba(255,255,255,0.9)',
    marginTop: -2,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  segmentCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  segmentTrack: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  segmentTrackDone: {
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  segmentTrackActive: {
    height: 5,
    backgroundColor: '#FFFFFF',
  },
  segmentTrackUpcoming: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  segmentLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeights.medium,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  segmentLabelDone: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: fontWeights.semibold,
  },
  segmentLabelActive: {
    color: '#FFFFFF',
    fontWeight: fontWeights.bold,
  },
  segmentLabelUpcoming: {
    color: 'rgba(255,255,255,0.48)',
  },
});
