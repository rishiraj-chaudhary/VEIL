/**
 * Jest runs against native ES modules (the project sets "type": "module"), so
 * transforms are disabled and node is started with --experimental-vm-modules
 * via the npm test script.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Services open Redis sockets and model clients on import; give teardown a
  // moment and report anything that genuinely leaks.
  testTimeout: 15000,
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/middleware/**/*.js',
    'src/utils/**/*.js',
  ],
};
