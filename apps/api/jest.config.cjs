/** @type {import('jest').Config} */
module.exports = { moduleFileExtensions: ['js', 'json', 'ts'], rootDir: '.', testRegex: '.*\\.spec\\.ts$', transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }] }, setupFiles: ['<rootDir>/test/setup-env.ts'], setupFilesAfterEnv: ['<rootDir>/test/assert-integration-database.ts'] };
