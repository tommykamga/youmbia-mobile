import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Skeleton placeholder for a listing card while the feed is loading.
 * No new dependencies; visual only.
 */
export function SkeletonListingCard() {
  return (
    <View style={styles.card}>
      <View style={styles.image} />
      <View style={styles.line} />
      <View style={styles.smallLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  image: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  line: {
    height: 16,
    marginTop: 12,
    borderRadius: 6,
    backgroundColor: '#eee',
  },
  smallLine: {
    height: 12,
    marginTop: 8,
    width: '40%',
    borderRadius: 6,
    backgroundColor: '#eee',
  },
});
