/**
 * Swipe gauche → action destructive « Supprimer ».
 * Sans react-native-gesture-handler : PanResponder + Animated (RN core).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights } from '@/theme';

const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = 48;

type Props = {
  rowId: string;
  openRowId: string | null;
  onOpenRowIdChange: (id: string | null) => void;
  onDeletePress: () => void;
  /** Appelé quand un geste horizontal a bougé (bloque le tap navigation). */
  onHorizontalGesture?: () => void;
  children: React.ReactNode;
};

export function SwipeToDeleteRow({
  rowId,
  openRowId,
  onOpenRowIdChange,
  onDeletePress,
  onHorizontalGesture,
  children,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const dragStartX = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const onHorizontalGestureRef = useRef(onHorizontalGesture);
  onHorizontalGestureRef.current = onHorizontalGesture;

  const animateTo = useCallback(
    (toValue: number, thenOpen: boolean) => {
      setIsOpen(thenOpen);
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    },
    [translateX]
  );

  const close = useCallback(() => {
    animateTo(0, false);
    if (openRowId === rowId) onOpenRowIdChange(null);
  }, [animateTo, onOpenRowIdChange, openRowId, rowId]);

  const open = useCallback(() => {
    onOpenRowIdChange(rowId);
    animateTo(-ACTION_WIDTH, true);
  }, [animateTo, onOpenRowIdChange, rowId]);

  useEffect(() => {
    if (openRowId !== rowId && isOpen) {
      animateTo(0, false);
    }
  }, [openRowId, rowId, isOpen, animateTo]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderGrant: () => {
        translateX.stopAnimation((value) => {
          dragStartX.current = value;
        });
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) > 6) onHorizontalGestureRef.current?.();
        const next = Math.min(0, Math.max(-ACTION_WIDTH, dragStartX.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const current = Math.min(0, Math.max(-ACTION_WIDTH, dragStartX.current + g.dx));
        const shouldOpen = current < -OPEN_THRESHOLD || g.vx < -0.35;
        if (shouldOpen) open();
        else close();
      },
      onPanResponderTerminate: () => {
        translateX.stopAnimation((value) => {
          if (value < -OPEN_THRESHOLD) open();
          else close();
        });
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Supprimer la conversation de votre messagerie"
          onPress={onDeletePress}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={styles.deleteLabel}>Supprimer</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  actions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    backgroundColor: colors.error,
  },
  deleteBtn: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
  },
  deleteBtnPressed: {
    opacity: 0.85,
  },
  deleteLabel: {
    ...typography.xs,
    color: '#fff',
    fontWeight: fontWeights.semibold,
  },
  foreground: {
    backgroundColor: colors.surface,
  },
});
