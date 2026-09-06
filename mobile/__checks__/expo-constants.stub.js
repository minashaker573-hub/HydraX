/**
 * Stands in for expo-constants during the live backend check, which runs in a
 * plain Node environment with no Expo runtime. The check always passes an
 * explicit `baseUrl`, so the dev-server host this module would otherwise
 * provide is never consulted.
 */
module.exports = { __esModule: true, default: { expoConfig: null } };
