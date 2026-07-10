/* Минимальный ESLint для apps/api (TS strict). */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, jest: true },
  ignorePatterns: ["dist", "node_modules", "*.cjs"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
  },
};
