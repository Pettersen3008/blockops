import path from "node:path";
import eslint from "@eslint/js";
import query from "@tanstack/eslint-plugin-query";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sourceSuffixPattern = /(?:\.d\.ts|\.test\.tsx?|\.tsx?)$/;

const kebabCaseFiles = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      invalid: "Source file and directory names must use kebab-case: {{path}}",
    },
  },
  create(context) {
    return {
      Program(node) {
        const relativePath = path.relative(context.cwd, context.filename);
        const segments = relativePath.split(path.sep);
        const fileName = segments.pop();
        const fileStem = fileName.replace(sourceSuffixPattern, "");
        if ([...segments, fileStem].some((segment) => !kebabCasePattern.test(segment))) {
          context.report({ node, messageId: "invalid", data: { path: relativePath } });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  ...query.configs["flat/recommended"],
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      blockops: {
        rules: { "kebab-case-files": kebabCaseFiles },
      },
    },
    rules: {
      "blockops/kebab-case-files": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "ExportAllDeclaration", message: "Use explicit named exports." },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/features/**/*-{query,schema}.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "react", message: "Query and schema modules must stay React-free." }] },
      ],
    },
  },
  {
    files: ["src/**/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/lib/api/api", message: "Components receive data through feature hooks." }] },
      ],
    },
  },
);
