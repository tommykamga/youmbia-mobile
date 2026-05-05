/**
 * Ancienne route Accueil : redirection vers l’onglet Chercher (accueil marketplace).
 * Les deep links `/(tabs)/home` restent valides.
 */
import { Redirect } from 'expo-router';

export default function HomeScreen() {
  return <Redirect href="/(tabs)/search" />;
}
