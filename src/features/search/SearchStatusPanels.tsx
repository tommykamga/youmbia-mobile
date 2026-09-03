/**
 * Search empty / error panels — presentation only.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EmptyState, Button } from '@/components';
import { colors, spacing } from '@/theme';

export function SearchErrorPanel({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={<Ionicons name="cloud-offline-outline" size={24} color={colors.error} />}
      title="Impossible de charger les résultats"
      message={
        message?.trim()
          ? message
          : 'Vérifiez votre connexion, puis réessayez. Votre recherche n’a pas été perdue.'
      }
      action={
        <View style={styles.emptyAction}>
          <Button variant="secondary" onPress={onRetry}>
            Réessayer
          </Button>
        </View>
      }
      style={styles.centerEdge}
    />
  );
}

export function SearchEmptyPanel({
  query,
  onReset,
}: {
  query: string;
  onReset: () => void;
}) {
  return (
    <EmptyState
      icon={<Ionicons name="search-outline" size={24} color={colors.primary} />}
      title="Aucun résultat"
      message={`Essayez un autre mot-clé ou modifiez vos filtres pour "${query}".`}
      action={
        <View style={styles.emptyAction}>
          <Button variant="secondary" onPress={onReset}>
            Réinitialiser la recherche
          </Button>
        </View>
      }
      style={styles.centerEdge}
    />
  );
}

export function SearchFilteredEmptyPanel({ onReset }: { onReset: () => void }) {
  return (
    <EmptyState
      icon={<Ionicons name="options-outline" size={24} color={colors.primary} />}
      title="Aucun résultat avec ces filtres"
      message="Essayez de réinitialiser ou d’assouplir vos filtres de catégorie, ville ou prix."
      action={
        <View style={styles.emptyAction}>
          <Button variant="secondary" onPress={onReset}>
            Réinitialiser la recherche
          </Button>
        </View>
      }
      style={styles.listEmpty}
    />
  );
}

const styles = StyleSheet.create({
  emptyAction: {
    width: '100%',
    alignItems: 'center',
  },
  centerEdge: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
  },
  listEmpty: {
    marginHorizontal: 0,
    marginTop: spacing.base,
  },
});
