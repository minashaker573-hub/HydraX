/**
 * HYDRAX Mobile — Babel.
 *
 * `babel-preset-expo` is what Metro and Jest both use to transform the app and
 * React Native's own (Flow-typed) internals. Expo's dev server supplies this
 * preset implicitly; Jest does not, so the file has to exist for the test run.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
