/**
 * Minimal React Native stub for Node/vitest.
 * Avoids parsing RN Flow syntax (`import typeof`) in unit tests.
 */
export const Platform = {
  OS: 'ios',
  select: <T>(spec: { ios?: T; android?: T; native?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.native ?? spec.default,
};

export default { Platform };
