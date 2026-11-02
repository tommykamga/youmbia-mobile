export interface BuildEnvironment {
  appEnvironment: 'development' | 'preview' | 'production';
  isQa: boolean;
  slug: string;
  appName: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  scheme: string;
}

export function resolveBuildEnvironment(env?: Record<string, string | undefined>): BuildEnvironment;
export function validateGoogleServicesFile(
  sourcePath: string,
  env?: Record<string, string | undefined>,
): { projectId: string; packageName: string };
