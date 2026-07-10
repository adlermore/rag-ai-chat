/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    // @rag/shared — ESM-пакет с exports-only-import; в jest (CJS) резолвим из исходников.
    "^@rag/shared$": "<rootDir>/../../../packages/shared/src/index.ts",
    // Снять .js-суффиксы с относительных импортов, чтобы ts-jest брал .ts.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "CommonJS", experimentalDecorators: true, emitDecoratorMetadata: true } },
    ],
  },
};
