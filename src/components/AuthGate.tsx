import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, spacing, typography, fontWeights, radius, neutral } from '@/theme';
import { Button, HeroMarketplaceGrid } from '@/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type AuthGateContext = 'favorites' | 'messages' | 'sell' | 'account' | 'listings';

interface AuthGateProps {
  context: AuthGateContext;
}

const CONTEXT_CONTENT: Record<
  AuthGateContext,
  { title: string; subtitle: string }
> = {
  favorites: {
    title: 'Retrouvez vos coups de cœur',
    subtitle:
      'Connectez-vous pour conserver vos annonces préférées et les retrouver facilement.',
  },
  messages: {
    title: 'Discutez avec les vendeurs',
    subtitle: 'Échangez rapidement et en toute sécurité depuis votre messagerie.',
  },
  sell: {
    title: 'Publiez votre annonce',
    subtitle: 'Connectez-vous pour vendre rapidement et toucher plus d’acheteurs.',
  },
  account: {
    title: 'Gérez votre activité',
    subtitle:
      'Retrouvez vos annonces, vos favoris et vos informations personnelles.',
  },
  listings: {
    title: 'Gérez vos annonces',
    subtitle: 'Connectez-vous pour suivre vos ventes et mettre à jour vos annonces.',
  },
};

export function AuthGate({ context }: AuthGateProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const content = CONTEXT_CONTENT[context];

  const handleContinue = useCallback(() => {
    router.push({
      pathname: '/(auth)/login',
      params: { email, redirect: `/(tabs)/${context}` },
    });
  }, [router, email, context]);

  const onPrimaryPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!showEmail) {
      setShowEmail(true);
      setTimeout(() => emailInputRef.current?.focus(), 160);
      return;
    }
    if (email.includes('@')) {
      handleContinue();
    }
  }, [showEmail, email, handleContinue]);

  const onGooglePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(auth)/login',
      params: { provider: 'google', redirect: `/(tabs)/${context}` },
    });
  }, [context, router]);

  const primaryDisabled = showEmail && !email.includes('@');

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
      >
        <View
          style={[
            styles.carouselSection,
            { paddingTop: Math.max(insets.top, spacing.sm) },
          ]}
        >
          <Animated.View entering={FadeIn.duration(520)} style={styles.carouselInner}>
            <HeroMarketplaceGrid />
          </Animated.View>
        </View>

        <View
          style={[
            styles.contentSection,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <Animated.View
            entering={FadeInDown.duration(480).delay(80)}
            style={styles.textBlock}
          >
            <Text style={styles.title} numberOfLines={2}>
              {content.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={3}>
              {content.subtitle}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(420).delay(140)}
            style={styles.actions}
          >
            {showEmail ? (
              <Animated.View entering={FadeIn.duration(280)} style={styles.emailWrap}>
                <TextInput
                  ref={emailInputRef}
                  placeholder="E-mail"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.emailInput}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (email.includes('@')) {
                      handleContinue();
                    }
                  }}
                  {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                />
              </Animated.View>
            ) : null}

            <Button
              onPress={onPrimaryPress}
              disabled={primaryDisabled}
              style={styles.primaryBtn}
              size="lg"
            >
              Continuer
            </Button>

            <View style={styles.googleWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continuer avec Google"
                style={({ pressed }) => [
                  styles.socialBtn,
                  pressed && styles.socialPressed,
                ]}
                onPress={onGooglePress}
              >
                <Ionicons
                  name="logo-google"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.socialLabel}>Continuer avec Google</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
    minHeight: 0,
  },
  carouselSection: {
    flex: 0.45,
    width: '100%',
    minHeight: 0,
  },
  carouselInner: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.md,
  },
  contentSection: {
    flex: 0.55,
    minHeight: 0,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  textBlock: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: -0.8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  subtitle: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.92,
    paddingHorizontal: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    width: '100%',
  },
  emailWrap: {
    width: '100%',
  },
  emailInput: {
    height: 52,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: neutral[200],
    ...typography.base,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  primaryBtn: {
    borderRadius: radius.full,
    minHeight: 52,
  },
  googleWrap: {
    width: '100%',
    marginTop: spacing.md,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutral[200],
    backgroundColor: neutral[50],
  },
  socialLabel: {
    ...typography.sm,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  socialPressed: {
    backgroundColor: neutral[100],
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
});
