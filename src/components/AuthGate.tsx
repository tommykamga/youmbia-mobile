import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, spacing, typography, fontWeights, radius, neutral } from '@/theme';
import { Button, Input, HeroMarketplaceGrid } from '@/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type AuthGateContext = 'favorites' | 'messages' | 'sell' | 'account';

interface AuthGateProps {
  context: AuthGateContext;
}

const CONTEXT_CONTENT = {
  favorites: {
    title: 'Sauvegardez vos favoris',
    subtitle: 'Connectez-vous pour retrouver vos annonces préférées sur tous vos appareils.',
  },
  messages: {
    title: 'Contactez les vendeurs',
    subtitle: 'Échangez en toute sécurité et gérez vos achats depuis votre messagerie.',
  },
  sell: {
    title: 'Publiez votre annonce',
    subtitle: 'Connectez-vous pour vendre rapidement et toucher plus d’acheteurs.',
  },
  account: {
    title: 'Accédez à votre espace',
    subtitle: 'Connectez-vous pour gérer votre compte, vos annonces et vos activités.',
  },
};

export function AuthGate({ context }: AuthGateProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const content = CONTEXT_CONTENT[context];

  const handleInputFocus = () => {
    // Petit délai pour laisser le clavier se déployer
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleContinue = () => {
    router.push({
      pathname: '/(auth)/login',
      params: { email, redirect: `/(tabs)/${context}` }
    });
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, spacing.xs),
              paddingBottom: Math.max(insets.bottom, spacing['3xl'])
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Vinted-Style Market Grid */}
          <Animated.View entering={FadeIn.duration(800)}>
            <HeroMarketplaceGrid />
          </Animated.View>

          {/* Texts Section */}
          <View style={styles.textSection}>
            <Animated.Text entering={FadeInDown.delay(200)} style={styles.title}>
              {content.title}
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(300)} style={styles.subtitle}>
              {content.subtitle}
            </Animated.Text>
          </View>

          {/* Refined Email Form */}
          <View style={styles.formSection}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>Adresse e-mail</Text>
            </View>
            <Input
              placeholder="Entrez votre adresse e-mail"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.inputPill}
              containerStyle={styles.inputContainer}
              onFocus={handleInputFocus}
            />
            <Button
              onPress={handleContinue}
              disabled={!email.includes('@')}
              style={styles.buttonPill}
            >
              Continuer
            </Button>
          </View>

          {/* Social Divider */}
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>Ou continuer avec</Text>
            <View style={styles.line} />
          </View>

          {/* Google Login Center */}
          <View style={styles.socialFlow}>
            <Pressable
              style={({ pressed }) => [styles.socialBtn, pressed && styles.socialPressed]}
              onPress={() => router.push({ pathname: '/(auth)/login', params: { provider: 'google', redirect: `/(tabs)/${context}` } })}
            >
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <Text style={styles.socialLabel}>Continuer avec Google</Text>
            </Pressable>
          </View>
        </ScrollView>
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
  },
  scrollContent: {
    flexGrow: 1,
  },
  textSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
    letterSpacing: -1,
  },
  subtitle: {
    ...typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.9,
  },
  formSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  labelContainer: {
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs,
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  inputContainer: {
    marginBottom: spacing.sm,
  },
  inputPill: {
    height: 60,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: neutral[200],
    ...typography.base,
  },
  buttonPill: {
    height: 60,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  dividerText: {
    ...typography.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  socialFlow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 60,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  socialLabel: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  socialPressed: {
    backgroundColor: neutral[50],
    transform: [{ scale: 0.98 }],
  },
});


