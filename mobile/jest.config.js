/**
 * HYDRAX Mobile — test configuration.
 *
 * `jest-expo/android` rather than the universal `jest-expo` preset: Android is
 * the Phase 1 target, and the universal preset re-runs every test three times
 * (ios / android / web) for no extra signal on this project.
 */
module.exports = {
  preset: 'jest-expo/android',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
};
