/**
 * Postinstall: ensure expo-modules-core is resolvable from expo-auth-session.
 * Metro / require() may resolve from expo-auth-session/node_modules/; npm hoists
 * expo-modules-core to the root, so we create a symlink when missing.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dir = path.join(root, 'node_modules', 'expo-auth-session', 'node_modules');
const target = path.join(dir, 'expo-modules-core');
const source = path.join(root, 'node_modules', 'expo-modules-core');

if (!fs.existsSync(target) && fs.existsSync(source)) {
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(path.relative(dir, source), target, 'dir');
}
