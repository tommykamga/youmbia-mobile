/**
 * Usage examples for YOUMBIA UI primitives.
 * These are reference only – do not render this file in the app.
 *
 * Web design mapping:
 * - Screen  → full page bg (--background / slate-50), safe area = viewport padding
 * - AppHeader → nav bar with back + title (listing detail, account layout)
 * - Button  → components/Button.tsx (primary=youmbia-green, secondary=white border-slate-200)
 * - Input   → HomeHero search input, form fields (rounded-xl border-slate-200)
 * - Card    → ListingCard, annonce/[id] sections (rounded-2xl/3xl border bg-white shadow)
 * - SectionTitle → .heading-subsection, "Détails de l'article" style
 * - EmptyState → "Aucune annonce", "Aucun résultat" centered blocks
 * - LoadingState → loading spinners / future skeletons
 */

import React from 'react';
import { View } from 'react-native';
import {
  Screen,
  AppHeader,
  Button,
  Input,
  Card,
  SectionTitle,
  EmptyState,
  LoadingState,
} from '@/components';

// ——— Screen ———
export function ScreenExample() {
  return (
    <Screen scroll keyboardAvoid>
      <View style={{ paddingVertical: 24 }} />
    </Screen>
  );
}

// ——— AppHeader ———
export function AppHeaderExample() {
  return (
    <AppHeader
      title="Détail annonce"
      showBack
      right={<Button variant="ghost" size="sm">⋯</Button>}
    />
  );
}

// ——— Button ———
export function ButtonExample() {
  return (
    <View style={{ gap: 12 }}>
      <Button onPress={() => {}}>Se connecter</Button>
      <Button variant="secondary">Créer un compte</Button>
      <Button variant="outline" size="sm">Filtres</Button>
      <Button variant="ghost" size="sm">Annuler</Button>
    </View>
  );
}

// ——— Input ———
export function InputExample() {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Input label="Email" placeholder="vous@exemple.com" />
      <Input label="Mot de passe" placeholder="••••••••" error="Champ requis" />
    </View>
  );
}

// ——— Card ———
export function CardExample() {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Card variant="default">
        <View style={{ padding: 16 }} />
      </Card>
      <Card variant="elevated">
        <View style={{ padding: 16 }} />
      </Card>
      <Card variant="subtle">
        <View style={{ padding: 16 }} />
      </Card>
    </View>
  );
}

// ——— SectionTitle ———
export function SectionTitleExample() {
  return (
    <View style={{ padding: 16 }}>
      <SectionTitle title="Détails de l'article" />
      <SectionTitle
        title="Suggestions"
        subtitle="Basé sur vos recherches"
        right={<Button variant="ghost" size="sm">Voir plus</Button>}
      />
    </View>
  );
}

// ——— EmptyState ———
export function EmptyStateExample() {
  return (
    <EmptyState
      title="Aucune annonce"
      message="Il n'y a pas encore d'annonces dans cette catégorie."
      action={<Button variant="primary">Voir toutes les annonces</Button>}
    />
  );
}

// ——— LoadingState ———
export function LoadingStateExample() {
  return (
    <LoadingState message="Chargement…" />
  );
}
