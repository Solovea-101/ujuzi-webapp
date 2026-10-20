import nextJest from 'next/jest.js';

// next/jest compiles TypeScript with SWC and reads the @/* alias from tsconfig.json.
const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'node',
  // partner-tests/ hits Kazi's live server, so it runs only through `npm run test:partner`.
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  testTimeout: 30_000,
});
