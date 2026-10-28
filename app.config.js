const appJson = require("./app.json");

const { getAppVariant } = require("./config/app-variant");
const { isDevelopment, androidPackage, iosBundleIdentifier } = getAppVariant(appJson.expo);
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

if (process.env.EAS_BUILD_PLATFORM === "android" && !googleServicesFile) {
  throw new Error(
    "GOOGLE_SERVICES_JSON must be configured as an EAS file variable for Android builds."
  );
}

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,

  name: isDevelopment ? "YOUMBIA Dev" : appJson.expo.name,

  ios: {
    ...appJson.expo.ios,
    bundleIdentifier: iosBundleIdentifier,
  },

  android: {
    ...appJson.expo.android,
    package: androidPackage,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
});
