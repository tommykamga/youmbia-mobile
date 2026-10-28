// Shared identity resolver; build validation remains in qa-build-guard.
const { resolveBuildEnvironment } = require('../scripts/qa-build-guard.cjs');
function getAppVariant(expo, env = process.env) {
  const target = resolveBuildEnvironment(env);
  return { ...target, isDevelopment: target.appEnvironment === 'development' };
}
module.exports = { getAppVariant };
