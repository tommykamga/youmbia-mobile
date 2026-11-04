import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme';
import { INBOX_LISTING_THUMB_SIZE } from './inboxDisplay';

type InboxListingThumbProps = {
  uri?: string | null;
  /** True pendant la fenêtre avant résolution (placeholder seul, pas de flash). */
  pending?: boolean;
};

export function InboxListingThumb({ uri, pending }: InboxListingThumbProps) {
  const [failed, setFailed] = useState(false);
  const trimmed = uri?.trim() ?? '';
  const showImage = trimmed.length > 0 && !failed;

  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  return (
    <View style={styles.thumb} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showImage ? (
        <Image
          source={{ uri: trimmed }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
        </View>
      )}
      {pending && !showImage ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: INBOX_LISTING_THUMB_SIZE,
    height: INBOX_LISTING_THUMB_SIZE,
    borderRadius: radius.lg,
    marginRight: 0,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
