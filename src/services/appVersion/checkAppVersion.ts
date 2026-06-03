import {
  getAppVersionStatus,
  getAppVersionPlatform,
  getInstalledAppVersion,
  type AppVersionPlatform,
} from './getAppVersionStatus';

export type AppVersionCheckStatus = 'ok' | 'optional_update' | 'force_update';

export type AppVersionPolicy = {
  status: AppVersionCheckStatus;
  currentVersion: string;
  latestVersion: string;
  minSupportedVersion: string;
  storeUrl: string | null;
  message: string | null;
};

export type AppVersionCheckResult =
  | { kind: 'skip' }
  | { kind: 'policy'; policy: AppVersionPolicy };

export { getAppVersionPlatform, getInstalledAppVersion, type AppVersionPlatform };

/**
 * @deprecated Préférer `getAppVersionStatus()` — conservé pour compatibilité interne.
 */
export async function checkAppVersion(): Promise<AppVersionCheckResult> {
  const platform = getAppVersionPlatform();
  if (!platform) {
    return { kind: 'skip' };
  }

  const status = await getAppVersionStatus();

  if (!status.isUpdateAvailable || !status.latestVersion || !status.minimumSupportedVersion) {
    return { kind: 'skip' };
  }

  const policyStatus: AppVersionCheckStatus = status.isCriticalUpdate
    ? 'force_update'
    : 'optional_update';

  return {
    kind: 'policy',
    policy: {
      status: policyStatus,
      currentVersion: status.currentVersion,
      latestVersion: status.latestVersion,
      minSupportedVersion: status.minimumSupportedVersion,
      storeUrl: status.updateUrl,
      message: status.releaseNotes,
    },
  };
}
