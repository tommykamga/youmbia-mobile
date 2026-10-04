const appJson = require("./app.json");

const isDevelopment =
  process.env.APP_ENV === "development" ||
  process.env.EXPO_PUBLIC_APP_ENV === "development";
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
    bundleIdentifier: isDevelopment
      ? "com.youmbia.mobile.dev"
      : appJson.expo.ios.bundleIdentifier,
  },

  android: {
    ...appJson.expo.android,
    package: isDevelopment
      ? "com.youmbia.mobile.dev"
      : appJson.expo.android.package,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
});
