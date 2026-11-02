const appJson = require("./app.json");
const { resolveBuildEnvironment } = require("./scripts/qa-build-guard.cjs");

module.exports = ({ config }) => {
  const target = resolveBuildEnvironment(process.env);
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

  if (process.env.EAS_BUILD_PLATFORM === "android" && !googleServicesFile) {
    throw new Error(
      "GOOGLE_SERVICES_JSON must be configured as an EAS file variable for Android builds."
    );
  }

  return {
    ...config,
    ...appJson.expo,
    slug: target.slug,
    name: target.appName,
    scheme: target.scheme,
    extra: {
      ...appJson.expo.extra,
      eas: {
        ...appJson.expo.extra.eas,
        projectId: target.easProjectId,
      },
    },
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: target.iosBundleIdentifier,
      associatedDomains: target.isQa ? [] : appJson.expo.ios.associatedDomains,
    },
    android: {
      ...appJson.expo.android,
      package: target.androidPackage,
      intentFilters: target.isQa ? [] : appJson.expo.android.intentFilters,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
