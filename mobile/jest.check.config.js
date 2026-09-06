/**
 * HYDRAX Mobile — configuration for the live backend contract check.
 *
 * A plain Node environment, not the React Native one `npm test` uses: the RN
 * jest preset replaces `fetch` with a stub for hermetic unit tests, which is
 * exactly wrong for a check whose entire job is to make a real request to a
 * real server.
 */
module.exports = {
  preset: 'jest-expo/node',
  testMatch: ['<rootDir>/__checks__/**/*.check.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-constants$': '<rootDir>/__checks__/expo-constants.stub.js',
  },
};
