import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  APP_UPDATE_FOREGROUND_CHECK_MS,
  isOptionalUpdateDismissed,
  readAppUpdateDismiss,
  readAppUpdateLastCheck,
  writeAppUpdateDismiss,
  writeAppUpdateLastCheck,
  type AppUpdateDismissRecord,
} from '@/services/appVersion/appUpdateStorage';
import {
  getAppVersionStatus,
  type AppVersionStatus,
} from '@/services/appVersion/getAppVersionStatus';

export type UseAppUpdateStatusResult = {
  status: AppVersionStatus | null;
  isChecking: boolean;
  shouldShowOptionalBanner: boolean;
  shouldShowCriticalBlock: boolean;
  dismissOptionalUpdate: () => void;
  refresh: () => void;
};

export function useAppUpdateStatus(): UseAppUpdateStatusResult {
  const [status, setStatus] = useState<AppVersionStatus | null>(null);
  const [dismissRecord, setDismissRecord] = useState<AppUpdateDismissRecord | null>(null);
  const [isChecking, setIsChecking] = useState(Platform.OS !== 'web');
  const lastCheckAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const runCheck = useCallback(async (force = false) => {
    if (Platform.OS === 'web') {
      setIsChecking(false);
      return;
    }

    const now = Date.now();
    if (!force && lastCheckAtRef.current > 0 && now - lastCheckAtRef.current < 30_000) {
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsChecking(true);

    try {
      const [cached, dismiss] = await Promise.all([
        readAppUpdateLastCheck(),
        readAppUpdateDismiss(),
      ]);
      setDismissRecord(dismiss);

      if (cached?.status) {
        setStatus(cached.status);
      }

      const next = await getAppVersionStatus();
      lastCheckAtRef.current = Date.now();
      setStatus(next);
      await writeAppUpdateLastCheck(next);
    } finally {
      inFlightRef.current = false;
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void runCheck(true);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const elapsed = Date.now() - lastCheckAtRef.current;
      if (lastCheckAtRef.current === 0 || elapsed >= APP_UPDATE_FOREGROUND_CHECK_MS) {
        void runCheck(true);
      }
    });

    return () => subscription.remove();
  }, [runCheck]);

  const dismissOptionalUpdate = useCallback(() => {
    const latest = status?.latestVersion?.trim();
    if (!latest) return;
    void writeAppUpdateDismiss(latest).then(async () => {
      setDismissRecord(await readAppUpdateDismiss());
    });
  }, [status?.latestVersion]);

  const shouldShowCriticalBlock = Boolean(status?.isCriticalUpdate);

  const shouldShowOptionalBanner =
    Boolean(
      status?.isUpdateAvailable &&
        !status.isCriticalUpdate &&
        status.latestVersion
    ) && !isOptionalUpdateDismissed(dismissRecord, status?.latestVersion ?? null);

  return {
    status,
    isChecking,
    shouldShowOptionalBanner,
    shouldShowCriticalBlock,
    dismissOptionalUpdate,
    refresh: () => void runCheck(true),
  };
}
