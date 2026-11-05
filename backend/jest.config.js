import { createDefaultEsmPreset } from 'ts-jest';

export default {
  // Source maps keep coverage line numbers pointing at the .ts source (tsconfig disables them for builds).
  ...createDefaultEsmPreset({ tsconfig: { sourceMap: true } }),
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  // Source files import each other with '.js' extensions (ESM); map them back to the .ts files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'text-summary'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    "<rootDir>/src/avatar/exportAvatar.ts",
    // Scripts run by hand to inspect or try out the garment models; the server never loads them.
    "<rootDir>/src/garment/imgToGlb/inspectMeshes.ts",
    "<rootDir>/src/garment/imgToGlb/testApplySolidColor.ts",
    "<rootDir>/src/garment/imgToGlb/testProcessGarment.ts",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/src/avatar/exportAvatar.ts",
  ],
};
