const appJson = require("./app.json");

const isDevelopment =
  process.env.APP_ENV === "development" ||
  process.env.EXPO_PUBLIC_APP_ENV === "development";

module.exports = {
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
  },
};
