import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/prepare-google-services.js',
);

function writeGoogleServices(directory: string, packageName = 'com.youmbia.mobile') {
  const source = path.join(directory, 'firebase-config.json');
  writeFileSync(
    source,
    JSON.stringify({
      project_info: { project_id: 'local-validation' },
      client: [
        {
          client_info: {
            mobilesdk_app_id: '1:1234567890:android:localvalidation',
            android_client_info: { package_name: packageName },
          },
          services: {},
        },
      ],
    }),
  );
  return source;
}

function runHook(directory: string, source: string) {
  return execFileSync(process.execPath, [scriptPath], {
    cwd: directory,
    env: {
      ...process.env,
      EAS_BUILD_PLATFORM: 'android',
      GOOGLE_SERVICES_JSON: source,
    },
    encoding: 'utf8',
  });
}

describe('prepare-google-services EAS hook', () => {
  it('leaves an absent native project to Expo Prebuild', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'youmbia-firebase-cng-'));
    const source = writeGoogleServices(directory);

    expect(runHook(directory, source)).toContain('Expo Prebuild will configure');
  });

  it('configures a present native project idempotently', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'youmbia-firebase-native-'));
    const appDirectory = path.join(directory, 'android', 'app');
    mkdirSync(appDirectory, { recursive: true });
    writeFileSync(
      path.join(directory, 'android', 'build.gradle'),
      'buildscript {\n  dependencies {\n    classpath(\'com.android.tools.build:gradle\')\n  }\n}\n',
    );
    writeFileSync(
      path.join(appDirectory, 'build.gradle'),
      'apply plugin: "com.android.application"\napply plugin: "org.jetbrains.kotlin.android"\n',
    );
    const source = writeGoogleServices(directory);

    runHook(directory, source);
    runHook(directory, source);

    const projectGradle = readFileSync(
      path.join(directory, 'android', 'build.gradle'),
      'utf8',
    );
    const appGradle = readFileSync(path.join(appDirectory, 'build.gradle'), 'utf8');

    expect(
      projectGradle.match(/com\.google\.gms:google-services:4\.4\.1/g),
    ).toHaveLength(1);
    expect(appGradle.match(/com\.google\.gms\.google-services/g)).toHaveLength(1);
    expect(readFileSync(path.join(appDirectory, 'google-services.json'), 'utf8')).toBe(
      readFileSync(source, 'utf8'),
    );
  });

  it('fails closed when the Firebase client package does not match', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'youmbia-firebase-package-'));
    const source = writeGoogleServices(directory, 'com.example.wrong');
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      env: {
        ...process.env,
        EAS_BUILD_PLATFORM: 'android',
        GOOGLE_SERVICES_JSON: source,
      },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('has no Android client for com.youmbia.mobile');
  });
});
