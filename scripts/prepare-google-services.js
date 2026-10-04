/**
 * EAS file variables resolve to temporary file paths. When an android/ project
 * is included in the build archive, EAS skips Expo Prebuild, so we must perform
 * the native Google Services setup that the Expo config plugin would normally do.
 */
const fs = require('fs');
const path = require('path');

const EXPECTED_ANDROID_PACKAGE = 'com.youmbia.mobile';
const GOOGLE_SERVICES_CLASSPATH =
  "classpath('com.google.gms:google-services:4.4.1')";
const GOOGLE_SERVICES_APPLY_PLUGIN =
  'apply plugin: "com.google.gms.google-services"';

function validateGoogleServices(source) {
  let config;

  try {
    config = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICES_JSON is not valid JSON.');
  }

  const hasExpectedClient =
    Array.isArray(config.client) &&
    config.client.some(
      (client) =>
        client?.client_info?.android_client_info?.package_name ===
        EXPECTED_ANDROID_PACKAGE,
    );

  if (!hasExpectedClient) {
    throw new Error(
      `GOOGLE_SERVICES_JSON has no Android client for ${EXPECTED_ANDROID_PACKAGE}.`,
    );
  }
}

function updateGradleFile(filePath, marker, addition, description) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(addition)) {
    return;
  }

  if (!source.includes(marker)) {
    throw new Error(
      `Unable to configure ${description}: expected Gradle marker missing.`,
    );
  }

  fs.writeFileSync(
    filePath,
    source.replace(marker, `${marker}\n${addition}`),
    'utf8',
  );
}

function main() {
  if (process.env.EAS_BUILD_PLATFORM !== 'android') {
    return;
  }

  const sourcePath = process.env.GOOGLE_SERVICES_JSON?.trim();
  if (!sourcePath) {
    throw new Error(
      'GOOGLE_SERVICES_JSON must be configured as an EAS file variable for Android builds.',
    );
  }

  const source = path.resolve(sourcePath);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error('GOOGLE_SERVICES_JSON does not point to a readable file.');
  }

  validateGoogleServices(source);

  const androidDirectory = path.join(process.cwd(), 'android');
  if (!fs.existsSync(androidDirectory)) {
    console.log(
      '[firebase] Native Android project absent; Expo Prebuild will configure Google Services.',
    );
    return;
  }

  const projectGradle = path.join(androidDirectory, 'build.gradle');
  const appGradle = path.join(androidDirectory, 'app', 'build.gradle');
  if (!fs.existsSync(projectGradle) || !fs.existsSync(appGradle)) {
    throw new Error(
      'Native Android project is incomplete: expected Gradle files are missing.',
    );
  }

  updateGradleFile(
    projectGradle,
    '  dependencies {',
    `    ${GOOGLE_SERVICES_CLASSPATH}`,
    'the Google Services buildscript dependency',
  );
  updateGradleFile(
    appGradle,
    'apply plugin: "com.android.application"',
    GOOGLE_SERVICES_APPLY_PLUGIN,
    'the Google Services app plugin',
  );

  const destination = path.join(androidDirectory, 'app', 'google-services.json');
  if (source !== destination) {
    fs.copyFileSync(source, destination);
  }

  console.log(
    `[firebase] Android configuration prepared for ${EXPECTED_ANDROID_PACKAGE}.`,
  );
}

main();
