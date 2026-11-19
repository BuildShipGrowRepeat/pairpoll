import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/", ".astro/", ".wrangler/", "worker-configuration.d.ts", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ["packages/cli/**/*.js"],
    languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly" } },
  },
];
