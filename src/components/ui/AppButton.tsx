/**
 * AppButton — couche fine au-dessus de `Button` avec préréglages YOUMBIA (`ui`).
 * Ne duplique pas la logique press/loading : tout est délégué à `Button`.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button, type ButtonProps } from '../Button';
import { shadows, ui } from '@/theme';

export type AppButtonLayout = 'default' | 'pill52' | 'pillMutedOutline52';

export type AppButtonProps = Omit<ButtonProps, 'size'> & {
  /** `pill52` / `pillMutedOutline52` : CTA type gate / auth (hauteur lisible, coins pill). */
  layout?: AppButtonLayout;
  size?: ButtonProps['size'];
};

const layoutStyle: Record<AppButtonLayout, StyleProp<ViewStyle>> = {
  default: undefined,
  pill52: {
    borderRadius: ui.radius.pill,
    minHeight: 52,
  },
  pillMutedOutline52: {
    borderRadius: ui.radius.pill,
    minHeight: 52,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surfaceSubtle,
    ...shadows.sm,
  },
};

export function AppButton({
  layout = 'default',
  style,
  size = 'lg',
  ...rest
}: AppButtonProps) {
  const preset = layoutStyle[layout];
  return <Button size={size} style={[preset, style]} {...rest} />;
}
