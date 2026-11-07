import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { resolveGridInnerWidthForLayout } from './homeFeedGridScrollAnchor';

export function useMeasuredGridInnerWidth(fallbackInnerWidth: number) {
  const [measuredInnerWidth, setMeasuredInnerWidth] = useState<number | null>(null);

  const onGridRowLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (!Number.isFinite(width) || width <= 0) return;
    setMeasuredInnerWidth((prev) => (prev != null && Math.abs(prev - width) < 0.5 ? prev : width));
  }, []);

  const gridInnerWidthForLayout = resolveGridInnerWidthForLayout(
    measuredInnerWidth,
    fallbackInnerWidth
  );

  return { measuredInnerWidth, gridInnerWidthForLayout, onGridRowLayout };
}
