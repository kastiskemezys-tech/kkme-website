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
    // The private tree is never linted. It is gitignored, so its files are not
    // ours to hold to a lint standard — but the real reason is disclosure:
    // `eslint -f json` prints absolute filePaths for every file it visits, and
    // the private tree's filenames are themselves counterparty-suggestive. A
    // lint report pasted into a PR, an issue or a chat would carry those names
    // even though it carries no file CONTENT. Ignoring the tree removes the
    // paths from the report entirely. See docs/gates.md, NDA gate coverage.
    "docs/_private/**",
  ]),
]);

export default eslintConfig;
