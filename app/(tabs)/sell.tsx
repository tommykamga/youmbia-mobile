/**
 * Tab entry for "Vendre": redirects to the stack route /sell.
 * The tab bar styles this tab as the center CTA (see _layout.tsx).
 */

import { Redirect } from 'expo-router';

export default function SellTabScreen() {
  return <Redirect href="/sell" />;
}
