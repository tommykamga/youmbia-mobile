/**
 * Root index: public-first marketplace.
 * All users (authenticated or not) land on the home feed.
 * Protected routes (favorites, messages, account, sell) enforce auth when accessed.
 */

import { Redirect } from 'expo-router';

export default function IndexScreen() {
  return <Redirect href="/(tabs)/search" />;
}
