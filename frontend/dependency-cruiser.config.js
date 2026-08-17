/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      comment: "Keep the frontend dependency graph acyclic.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-feature-internals",
      severity: "error",
      comment:
        "Features may consume another feature only through an explicit public entry point.",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/(?!$1/)",
        pathNot: "^src/features/[^/]+/(?:index|keys|creation)\\.ts$",
      },
    },
    {
      name: "no-unresolved-dependencies",
      severity: "error",
      comment: "All imports must resolve through the project TypeScript configuration.",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src",
    tsConfig: { fileName: "tsconfig.app.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
