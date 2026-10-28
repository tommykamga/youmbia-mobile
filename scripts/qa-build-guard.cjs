const fs = require("node:fs");
const path = require("node:path");

const PRODUCTION_SUPABASE_PROJECT_REF = "ainzxommczlyjhymuwgu";
const PRODUCTION_EAS_PROJECT_ID = require("../app.json").expo.extra.eas.projectId;
const APP_IDENTITIES = {
  development: {
    appName: "YOUMBIA Dev",
    slug: "youmbia-mobile-qa",
    androidPackage: "com.youmbia.mobile.dev",
    iosBundleIdentifier: "com.youmbia.mobile.dev",
    scheme: "youmbiamobile-dev",
  },
  preview: {
    appName: "YOUMBIA QA",
    slug: "youmbia-mobile-qa",
    androidPackage: "com.youmbia.mobile.dev",
    iosBundleIdentifier: "com.youmbia.mobile.dev",
    scheme: "youmbiamobile-qa",
  },
  production: {
    appName: "YOUMBIA",
    slug: "youmbia-mobile",
    androidPackage: "com.youmbia.mobile",
    iosBundleIdentifier: "com.youmbia.mobile",
    scheme: "youmbiamobile",
    easProjectId: PRODUCTION_EAS_PROJECT_ID,
  },
};

function required(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`Required QA build variable ${name} is missing.`);
  return value;
}

function resolveBuildEnvironment(env = process.env) {
  const appEnv = String(env.APP_ENV ?? "").trim().toLowerCase();
  const publicAppEnv = String(env.EXPO_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  const easProfile = String(env.EAS_BUILD_PROFILE ?? "").trim();
  const configuredProfile = String(env.YOUMBIA_EAS_BUILD_PROFILE ?? "").trim();
  if (easProfile && configuredProfile && easProfile !== configuredProfile) {
    throw new Error("Selected EAS profile does not match the configured build target.");
  }
  const profile = easProfile || configuredProfile;
  const isEasBuild = Boolean(profile || env.EAS_BUILD === "true" || env.EAS_BUILD_PLATFORM);

  if (appEnv && publicAppEnv && appEnv !== publicAppEnv) {
    throw new Error("APP_ENV and EXPO_PUBLIC_APP_ENV must match.");
  }

  const selectedEnv = appEnv || publicAppEnv || "production";
  if (!Object.hasOwn(APP_IDENTITIES, selectedEnv)) {
    if (isEasBuild || appEnv || publicAppEnv) {
      throw new Error("APP_ENV must be development, preview, or production.");
    }
  }

  if (profile) {
    if (!Object.hasOwn(APP_IDENTITIES, profile)) {
      throw new Error(`Unsupported EAS build profile ${profile}.`);
    }
    if (profile !== selectedEnv) {
      throw new Error("EAS build profile and APP_ENV must select the same environment.");
    }
  }

  const targetEnv = Object.hasOwn(APP_IDENTITIES, selectedEnv) ? selectedEnv : "production";
  const identity = APP_IDENTITIES[targetEnv];
  const isQa = targetEnv === "development" || targetEnv === "preview";

  if (!isQa) {
    return { appEnvironment: targetEnv, isQa, ...identity };
  }

  const qaEasProjectId = required(env, "YOUMBIA_EAS_PROJECT_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(qaEasProjectId)) {
    throw new Error("YOUMBIA_EAS_PROJECT_ID must be a valid QA EAS project UUID.");
  }
  if (qaEasProjectId === PRODUCTION_EAS_PROJECT_ID) {
    throw new Error("QA builds must use an EAS project separate from production.");
  }

  required(env, "APP_ENV");
  required(env, "EXPO_PUBLIC_APP_ENV");
  const projectRef = required(env, "EXPO_PUBLIC_SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("EXPO_PUBLIC_SUPABASE_PROJECT_REF must be a 20-character Supabase project ref.");
  }
  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("QA builds cannot target the production Supabase project.");
  }

  const supabaseUrl = required(env, "EXPO_PUBLIC_SUPABASE_URL");
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== `${projectRef}.supabase.co` ||
    parsedUrl.port ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("QA Supabase URL must match EXPO_PUBLIC_SUPABASE_PROJECT_REF over HTTPS.");
  }

  required(env, "EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (isEasBuild && required(env, "QA_PUSH_CREDENTIALS_VERIFIED") !== "true") {
    throw new Error("Set QA_PUSH_CREDENTIALS_VERIFIED=true only after FCM and APNs credentials are verified.");
  }

  if (env.EAS_BUILD_PLATFORM === "android") {
    required(env, "GOOGLE_SERVICES_JSON");
    const qaFirebaseProjectId = required(env, "QA_FIREBASE_PROJECT_ID");
    const productionFirebaseProjectId = required(env, "YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID");
    if (qaFirebaseProjectId === productionFirebaseProjectId) {
      throw new Error("QA and production Firebase projects must be different.");
    }
  }

  return { appEnvironment: targetEnv, isQa, easProjectId: qaEasProjectId, ...identity };
}

function validateGoogleServicesFile(sourcePath, env = process.env) {
  const target = resolveBuildEnvironment(env);
  const resolvedPath = path.resolve(String(sourcePath ?? "").trim());
  if (!sourcePath || !fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error("GOOGLE_SERVICES_JSON does not point to a readable file.");
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch {
    throw new Error("GOOGLE_SERVICES_JSON is not valid JSON.");
  }

  const projectId = String(config.project_info?.project_id ?? "");
  const hasExpectedClient = Array.isArray(config.client) && config.client.some(
    (client) => client?.client_info?.android_client_info?.package_name === target.androidPackage
  );
  if (!hasExpectedClient) {
    throw new Error(`GOOGLE_SERVICES_JSON has no Android client for ${target.androidPackage}.`);
  }

  if (target.isQa && projectId !== String(env.QA_FIREBASE_PROJECT_ID ?? "").trim()) {
    throw new Error("GOOGLE_SERVICES_JSON project does not match QA_FIREBASE_PROJECT_ID.");
  }
  if (
    target.isQa &&
    projectId === String(env.YOUMBIA_PRODUCTION_FIREBASE_PROJECT_ID ?? "").trim()
  ) {
    throw new Error("QA builds cannot use the production Firebase project.");
  }
  return { projectId, packageName: target.androidPackage };
}

module.exports = {
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_EAS_PROJECT_ID,
  resolveBuildEnvironment,
  validateGoogleServicesFile,
};
