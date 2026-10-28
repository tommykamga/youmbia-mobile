/**
 * Postinstall: ensure expo-modules-core is resolvable from expo-auth-session.
 * Metro / require() may resolve from expo-auth-session/node_modules/; npm hoists
 * expo-modules-core to the root, so we link it when missing.
 *
 * Windows directory symlinks require elevated privileges or Developer Mode;
 * a junction can be created as a normal user, including on company PCs.
 * Junction targets must be absolute on Windows.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dir = path.join(root, 'node_modules', 'expo-auth-session', 'node_modules');
const target = path.join(dir, 'expo-modules-core');
const source = path.join(root, 'node_modules', 'expo-modules-core');

if (!fs.existsSync(target) && fs.existsSync(source)) {
  fs.mkdirSync(dir, { recursive: true });
  const windows = process.platform === 'win32';
  fs.symlinkSync(
    windows ? source : path.relative(dir, source),
    target,
    windows ? 'junction' : 'dir'
  );
}
