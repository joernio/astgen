module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {'^.+\\.ts?$': 'ts-jest'},
    testRegex: '/test/.*\\.(test|spec)?\\.(ts|tsx)$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
