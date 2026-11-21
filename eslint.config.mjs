import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design references (prototype HTML/JS), not app code:
    "docs/**",
  ]),
  // The admin QA suite is plain CommonJS run by Node (it is preloaded with `node --require`): require() is how it loads.
  {
    files: ["e2e/admin/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
]);

export default eslintConfig;
