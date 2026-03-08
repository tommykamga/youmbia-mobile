/**
 * Sell / publish listing – stack screen (dedicated route).
 * Form: title, price, city, description, images. On success shows next actions.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Button, Input } from '@/components';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { createListing, uploadListingImages } from '@/services/listings';
import { getSession } from '@/services/auth';

/** Galerie améliorée : jusqu'à 12 photos par annonce. */
const MAX_LISTING_IMAGES = 12;

type PickedImage = { uri: string; base64: string | null };

export default function SellScreen() {
  const router = useRouter();
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        "Autorisez l'accès aux photos pour ajouter des images à votre annonce."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const newImages: PickedImage[] = result.assets.map((a) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, MAX_LISTING_IMAGES));
    setSubmitError(null);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (submitLoading) return;

    const session = await getSession();
    if (!session?.user) {
      router.replace(`/(auth)/login?redirect=${encodeURIComponent('/sell')}` as Href);
      return;
    }

    const price = priceStr.trim() ? Number(priceStr.trim().replace(',', '.')) : NaN;
    if (!title.trim() || title.trim().length < 2) {
      setSubmitError('Titre requis (2 caractères minimum)');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setSubmitError('Prix invalide (doit être supérieur à 0)');
      return;
    }
    if (!city.trim()) {
      setSubmitError('Ville requise');
      return;
    }

    setSubmitLoading(true);
    try {
      const { data, error } = await createListing({
        title: title.trim(),
        price: Math.round(price),
        city: city.trim(),
        description: description.trim() || '',
      });

      if (error) {
        if (error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/sell')}` as Href);
          return;
        }
        setSubmitError(error.message);
        setSubmitLoading(false);
        return;
      }

      const listingId = data!.id;
      const withBase64 = images.filter((img): img is PickedImage & { base64: string } => !!img.base64);
      if (withBase64.length > 0) {
        const uploadResult = await uploadListingImages(
          listingId,
          withBase64.map((img) => ({ base64: img.base64 }))
        );
        if (uploadResult.error) {
          setSubmitError(uploadResult.error.message);
          setSubmitLoading(false);
          return;
        }
      }

      setPublishedId(listingId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur lors de la publication');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (publishedId) {
    /* Sprint 3.2 – post-publish continuity: clear next steps (view listing, publish another, home). */
    return (
      <Screen>
        <View style={styles.successBlock}>
          <Text style={styles.successTitle}>Annonce publiée</Text>
          <Text style={styles.successSubtitle}>
            Votre annonce est en ligne. Vous pouvez la consulter ou en publier une autre.
          </Text>
          <View style={styles.successActions}>
            <Button
              size="lg"
              onPress={() => router.push(`/listing/${publishedId}`)}
              style={styles.successBtn}
            >
              Voir l'annonce
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => {
                setPublishedId(null);
                setTitle('');
                setPriceStr('');
                setCity('');
                setDescription('');
                setImages([]);
              }}
            >
              Publier une autre annonce
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onPress={() => router.replace('/(tabs)/home' as Href)}
              style={styles.successBtn}
            >
              Retour à l'accueil
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoid>
      <Text style={styles.title}>Vendre</Text>
      <Text style={styles.subtitle}>Publiez votre annonce en quelques minutes.</Text>

      <Input
        label="Titre"
        placeholder="Ex. Vélo de ville"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Input
        label="Prix (€)"
        placeholder="0"
        value={priceStr}
        onChangeText={setPriceStr}
        keyboardType={Platform.OS === 'web' ? 'numeric' : 'decimal-pad'}
      />
      <Input
        label="Ville"
        placeholder="Ex. Paris"
        value={city}
        onChangeText={setCity}
      />
      <Input
        label="Description"
        placeholder="Décrivez votre article..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        style={styles.descriptionInput}
      />

      <View style={styles.imagesSection}>
        <Text style={styles.label}>Photos</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbsRow}
        >
          {images.map((img, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} />
              <Button
                size="sm"
                variant="ghost"
                onPress={() => removeImage(i)}
                style={styles.removeThumb}
              >
                ✕
              </Button>
            </View>
          ))}
          {images.length < MAX_LISTING_IMAGES && (
            <Button variant="outline" size="md" onPress={pickImages} style={styles.addPhotoBtn}>
              + Photo
            </Button>
          )}
        </ScrollView>
      </View>

      {submitError ? (
        <Text style={styles.submitError}>{submitError}</Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          size="lg"
          onPress={handleSubmit}
          loading={submitLoading}
          disabled={submitLoading}
        >
          Publier l'annonce
        </Button>
        <Button variant="ghost" onPress={() => router.back()} style={styles.cancel}>
          Annuler
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  successBlock: {
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
  },
  successTitle: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: typography.base.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  successActions: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  successBtn: {
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  imagesSection: {
    marginBottom: spacing.lg,
  },
  thumbsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  removeThumb: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 28,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  addPhotoBtn: {
    alignSelf: 'center',
  },
  submitError: {
    ...typography.sm,
    color: colors.error,
    marginBottom: spacing.base,
  },
  actions: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  cancel: {
    marginTop: spacing.base,
  },
});
