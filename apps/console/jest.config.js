module.exports = {
    preset: "ts-jest",
    roots: ["<rootDir>/src"],
    testRegex: ".*\\.spec\\.ts$",
    collectCoverageFrom: ["<rootDir>/src/domain/**/*.ts"],
    coverageThreshold: {
        "./src/domain/": {
            branches: 100,
        },
    },
};
