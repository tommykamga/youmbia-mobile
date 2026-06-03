/**
 * Recadrage carré premium avec zoom (pinch + slider) avant validation.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type AvatarCropModalProps = {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function AvatarCropModal({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const { width: screenW } = useWindowDimensions();
  const cropSize = Math.min(screenW - spacing.xl * 2, 320);

  const zoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const zoomRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const [processing, setProcessing] = useState(false);
  const [zoomUi, setZoomUi] = useState(1);

  const baseScale = useMemo(() => {
    const w = Math.max(1, imageWidth);
    const h = Math.max(1, imageHeight);
    return Math.max(cropSize / w, cropSize / h);
  }, [cropSize, imageWidth, imageHeight]);

  const clampTranslate = useCallback(
    (tx: number, ty: number, currentZoom: number) => {
      const displayW = imageWidth * baseScale * currentZoom;
      const displayH = imageHeight * baseScale * currentZoom;
      const maxX = Math.max(0, (displayW - cropSize) / 2);
      const maxY = Math.max(0, (displayH - cropSize) / 2);
      return {
        x: clamp(tx, -maxX, maxX),
        y: clamp(ty, -maxY, maxY),
      };
    },
    [baseScale, cropSize, imageWidth, imageHeight]
  );

  // Fix typo touchY -> ty in clampTranslate - I made an error. Let me fix when writing.

  const applyTransform = useCallback(
    (nextZoom: number, tx: number, ty: number) => {
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const clamped = clampTranslate(tx, ty, z);
      zoom.value = z;
      translateX.value = clamped.x;
      translateY.value = clamped.y;
      zoomRef.current = z;
      translateRef.current = clamped;
      setZoomUi(z);
    },
    [clampTranslate, zoom, translateX, translateY]
  );

  useEffect(() => {
    if (visible) {
      applyTransform(1, 0, 0);
      setProcessing(false);
    }
  }, [visible, imageUri, applyTransform]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !processing,
        onMoveShouldSetPanResponder: () => !processing,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            pinchStartRef.current = {
              distance: Math.hypot(dx, dy),
              zoom: zoomRef.current,
            };
            panStartRef.current = null;
          } else {
            panStartRef.current = {
              x: touches[0].pageX,
              y: touches[0].pageY,
              tx: translateRef.current.x,
              ty: translateRef.current.y,
            };
            pinchStartRef.current = null;
          }
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2 && pinchStartRef.current) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const distance = Math.hypot(dx, dy);
            const ratio = distance / Math.max(1, pinchStartRef.current.distance);
            applyTransform(pinchStartRef.current.zoom * ratio, translateRef.current.x, translateRef.current.y);
          } else if (touches.length === 1 && panStartRef.current) {
            const dx = touches[0].pageX - panStartRef.current.x;
            const dy = touches[0].pageY - panStartRef.current.y;
            applyTransform(
              zoomRef.current,
              panStartRef.current.tx + dx,
              panStartRef.current.ty + dy
            );
          }
        },
        onPanResponderRelease: () => {
          panStartRef.current = null;
          pinchStartRef.current = null;
        },
      }),
    [applyTransform, processing]
  );

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: zoom.value },
    ],
  }));

  const handleZoomOut = () => applyTransform(zoomRef.current - 0.25, translateRef.current.x, translateRef.current.y);
  const handleZoomIn = () => applyTransform(zoomRef.current + 0.25, translateRef.current.x, translateRef.current.y);

  const handleConfirm = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const z = zoomRef.current;
      const tx = translateRef.current.x;
      const ty = translateRef.current.y;
      const displayW = imageWidth * baseScale * z;
      const displayH = imageHeight * baseScale * z;
      const left = (cropSize - displayW) / 2 + tx;
      const top = (cropSize - displayH) / 2 + ty;
      const scaleFactor = baseScale * z;

      let originX = Math.round(-left / scaleFactor);
      let originY = Math.round(-top / scaleFactor);
      let cropW = Math.round(cropSize / scaleFactor);
      let cropH = Math.round(cropSize / scaleFactor);

      originX = clamp(originX, 0, Math.max(0, imageWidth - 1));
      originY = clamp(originY, 0, Math.max(0, imageHeight - 1));
      cropW = clamp(cropW, 1, imageWidth - originX);
      cropH = clamp(cropH, 1, imageHeight - originY);
      const side = Math.min(cropW, cropH);
      cropW = side;
      cropH = side;

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      onConfirm(result.uri);
    } catch {
      onCancel();
    } finally {
      setProcessing(false);
    }
  };

  const displayW = imageWidth * baseScale;
  const displayH = imageHeight * baseScale;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Recadrer la photo</Text>
          <Text style={styles.subtitle}>Pincez pour zoomer, faites glisser pour repositionner</Text>

          <View style={[styles.cropViewport, { width: cropSize, height: cropSize }]}>
            <View style={styles.cropMask} {...panResponder.panHandlers}>
              <Animated.View
                style={[
                  {
                    width: displayW,
                    height: displayH,
                    position: 'absolute',
                    left: (cropSize - displayW) / 2,
                    top: (cropSize - displayH) / 2,
                  },
                  imageAnimatedStyle,
                ]}
              >
                <ExpoImage source={{ uri: imageUri }} style={{ width: displayW, height: displayH }} contentFit="fill" />
              </Animated.View>
            </View>
            <View pointerEvents="none" style={[styles.cropRing, { width: cropSize, height: cropSize, borderRadius: cropSize / 2 }]} />
          </View>

          <View style={styles.zoomRow}>
            <Pressable onPress={handleZoomOut} style={styles.zoomBtn} disabled={processing || zoomUi <= MIN_ZOOM}>
              <Ionicons name="remove" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.zoomLabel}>{Math.round(zoomUi * 100)}%</Text>
            <Pressable onPress={handleZoomIn} style={styles.zoomBtn} disabled={processing || zoomUi >= MAX_ZOOM}>
              <Ionicons name="add" size={22} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={processing}>
              <Text style={styles.cancelLabel}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={() => void handleConfirm()} disabled={processing}>
              {processing ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.confirmLabel}>Valider</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  cropViewport: {
    overflow: 'hidden',
    borderRadius: 9999,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.lg,
  },
  cropMask: {
    flex: 1,
    overflow: 'hidden',
  },
  cropRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    minWidth: 48,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
  },
  cancelLabel: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  confirmLabel: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.surface,
  },
});
