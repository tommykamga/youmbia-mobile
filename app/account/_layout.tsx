/**
 * Account stack – sub-screens (listings, profile, settings) with back to dashboard.
 */
import { Stack } from 'expo-router';

export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
