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
    // Generated build artefacts, not source. `coverage/` in particular is Istanbul's
    // HTML reporter output, which ships its own `eslint-disable` header that this
    // config then reports as unused — a warning about a file nobody wrote. It only
    // appeared after `npm test -- --coverage` had been run, so `npm run lint` gave a
    // different answer locally than in CI, where lint runs before the test step.
    "coverage/**",
    ".next-*/**",
  ]),
]);

export default eslintConfig;
