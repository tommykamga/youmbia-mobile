import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, fontWeights } from '@/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>{"Cette page n'existe pas."}</Text>
        <Link href="/(tabs)/home" style={styles.link}>
          <Text style={styles.linkText}>{"Retour à l'accueil"}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: typography.xl.fontSize,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  link: {
    marginTop: 20,
    paddingVertical: 12,
  },
  linkText: {
    fontSize: typography.base.fontSize,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
