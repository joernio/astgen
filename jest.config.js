module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: { '^.+\\.ts?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
    testRegex: '/test/.+\\.test\\.ts$'
};
