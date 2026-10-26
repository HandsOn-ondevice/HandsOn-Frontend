module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '\\.svg$': '<rootDir>/test/svg.js' },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: ['src/design-system/**/*.{ts,tsx}', '!src/design-system/assets/**'],
};
