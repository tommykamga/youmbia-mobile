// One source of truth for Expo config and the Firebase pre-install validator.
function getAppVariant(expo, env = process.env) {
  const isDevelopment =
    env.APP_ENV === 'development' || env.EXPO_PUBLIC_APP_ENV === 'development';
  return {
    isDevelopment,
    androidPackage: isDevelopment ? 'com.youmbia.mobile.dev' : expo.android.package,
    iosBundleIdentifier: isDevelopment ? 'com.youmbia.mobile.dev' : expo.ios.bundleIdentifier,
  };
}

module.exports = { getAppVariant };
