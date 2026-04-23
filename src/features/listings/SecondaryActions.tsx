import React from 'react';
import { View, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { spacing } from '@/theme';
import { shareListing } from '@/lib/shareListing';
import { getWindowSizeBucket } from '@/lib/responsiveLayout';
import { openSellerPhoneCallRaw, openSellerSmsRaw } from '@/lib/sellerContact';
import type { ListingDetail } from '@/services/listings';

type SecondaryActionsProps = {
  listing: ListingDetail;
  isFavorite: boolean;
  onFavoritePress: () => void;
  sellerPhone?: string | null;
  /** Si défini, remplace l’appel direct (ex. gate auth). */
  onCallPress?: () => void | Promise<void>;
  onSmsPress?: () => void | Promise<void>;
};

const BTN_TEXT_COMPACT = { fontSize: 11 } as const;
const BTN_TEXT_REGULAR = { fontSize: 12 } as const;

export function SecondaryActions({
  listing,
  isFavorite,
  onFavoritePress,
  sellerPhone,
  onCallPress,
  onSmsPress,
}: SecondaryActionsProps) {
  const [sharing, setSharing] = React.useState(false);
  const { width } = useWindowDimensions();
  const bucket = getWindowSizeBucket(width);
  const useGrid = bucket === 'compact';
  const textStyle = useGrid ? BTN_TEXT_COMPACT : BTN_TEXT_REGULAR;

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
    if (onCallPress) {
      await onCallPress();
      return;
    }
    await openSellerPhoneCallRaw(sellerPhone);
  };

  const handleSms = async () => {
    if (onSmsPress) {
      await onSmsPress();
      return;
    }
    await openSellerSmsRaw(sellerPhone);
  };

  const favBtn = (
    <Button
      variant="secondary"
      size="sm"
      onPress={onFavoritePress}
      style={useGrid ? styles.gridBtn : styles.rowBtn}
      textStyle={textStyle}
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
  );

  const shareBtn = (
    <Button
      variant="secondary"
      size="sm"
      onPress={handleShare}
      style={useGrid ? styles.gridBtn : styles.rowBtn}
      textStyle={textStyle}
      loading={sharing}
      leftIcon={<Ionicons name="share-outline" size={18} />}
    >
      Partager
    </Button>
  );

  const callBtn = sellerPhone ? (
    <Button
      variant="secondary"
      size="sm"
      onPress={handleCall}
      style={useGrid ? styles.gridBtn : styles.rowBtn}
      textStyle={textStyle}
      leftIcon={<Ionicons name="call-outline" size={18} />}
    >
      Appeler
    </Button>
  ) : null;

  const smsBtn = sellerPhone ? (
    <Button
      variant="secondary"
      size="sm"
      onPress={handleSms}
      style={useGrid ? styles.gridBtn : styles.rowBtn}
      textStyle={textStyle}
      leftIcon={<Ionicons name="chatbox-ellipses-outline" size={18} />}
    >
      SMS
    </Button>
  ) : null;

  if (useGrid) {
    return (
      <View style={styles.gridWrap}>
        <View style={styles.gridRow}>
          <View style={styles.gridCell}>{favBtn}</View>
          <View style={styles.gridCell}>{shareBtn}</View>
        </View>
        {sellerPhone ? (
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>{callBtn}</View>
            <View style={styles.gridCell}>{smsBtn}</View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.rowWrap}>
      {favBtn}
      {shareBtn}
      {sellerPhone ? (
        <>
          {callBtn}
          {smsBtn}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  rowBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
  },
  gridWrap: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
  },
  gridBtn: {
    minHeight: 44,
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
});
