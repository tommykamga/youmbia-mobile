/**
 * Avatar utilisateur réutilisable — URL signée, cache-busting, initiale fallback.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { resolveSingleAvatarUrl } from '@/lib/avatarImageUrl';
import { getUserDisplayName } from '@/services/profile';
import { colors, fontWeights, typography } from '@/theme';

export type UserAvatarProps = {
  /** Nom pour l'initiale fallback. */
  name?: string | null;
  /** Chemin Storage ou URL http(s) — `profiles.avatar_url`. */
  avatarUrl?: string | null;
  /** Version cache-bust (timestamp dans le chemin ou `avatar_updated_at`). */
  avatarVersion?: string | null;
  /** URL déjà résolue (évite un fetch si fournie par le service). */
  displayUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function UserAvatar({
  name,
  avatarUrl,
  avatarVersion,
  displayUrl: displayUrlProp,
  size = 42,
  style,
}: UserAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState('');

  const raw = String(avatarUrl ?? '').trim();
  const version = String(avatarVersion ?? '').trim();
  const preResolved = String(displayUrlProp ?? '').trim();

  useEffect(() => {
    let cancelled = false;
    if (preResolved) {
      setResolvedUrl(preResolved);
      return;
    }
    if (!raw) {
      setResolvedUrl('');
      return;
    }
    void resolveSingleAvatarUrl(raw, version).then((url) => {
      if (!cancelled) setResolvedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, version, preResolved]);

  const displayUrl = preResolved || resolvedUrl;
  const initial = useMemo(() => {
    const label = getUserDisplayName({ full_name: name }, 'U');
    return label.charAt(0).toUpperCase() || '?';
  }, [name]);

  const radius = size / 2;
  const fontSize = Math.max(12, Math.round(size * 0.38));

  return (
    <View
      style={[
        styles.root,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      {displayUrl ? (
        <ExpoImage
          source={{ uri: displayUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`${raw}:${version}`}
        />
      ) : (
        <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
});
