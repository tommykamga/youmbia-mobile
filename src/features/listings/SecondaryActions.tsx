import React from 'react';
import { View, StyleSheet, Alert, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { spacing } from '@/theme';
import { shareListing } from '@/lib/shareListing';
import type { ListingDetail } from '@/services/listings';

type SecondaryActionsProps = {
  listing: ListingDetail;
  isFavorite: boolean;
  onFavoritePress: () => void;
  sellerPhone?: string | null;
};

export function SecondaryActions({
  listing,
  isFavorite,
  onFavoritePress,
  sellerPhone,
}: SecondaryActionsProps) {
  const [sharing, setSharing] = React.useState(false);

  const handleShare = async () => {
    if (sharing || !listing.id) return;
    setSharing(true);
    try {
      const result = await shareListing({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        city: listing.city,
      });
      if (!result.success && result.error) {
        Alert.alert('Partage', result.error);
      }
    } catch {
      Alert.alert('Partage', 'Impossible de partager cette annonce.');
    } finally {
      setSharing(false);
    }
  };

  const handleCall = async () => {
    if (!sellerPhone) {
      Alert.alert('Appel', 'Numéro de téléphone non disponible.');
      return;
    }
    const telUrl = `tel:${sellerPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (canOpen) {
        await Linking.openURL(telUrl);
      } else {
        Alert.alert('Appel', "Impossible d'ouvrir l'application téléphone.");
      }
    } catch {
      Alert.alert('Appel', 'Une erreur est survenue.');
    }
  };

  return (
    <View style={styles.container}>
      <Button
        variant="secondary"
        size="sm"
        onPress={onFavoritePress}
        style={styles.button}
        leftIcon={
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? '#DC2626' : undefined}
          />
        }
      >
        Favoris
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onPress={handleShare}
        style={styles.button}
        loading={sharing}
        leftIcon={<Ionicons name="share-outline" size={18} />}
      >
        Partager
      </Button>

      {sellerPhone ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={handleCall}
          style={styles.button}
          leftIcon={<Ionicons name="call-outline" size={18} />}
        >
          Appeler
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  button: {
    flex: 1,
    minHeight: 44,
  },
});
