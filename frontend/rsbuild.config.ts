import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: "./src/index.tsx",
    },
  },
  html: {
    template: "./index.html",
  },
  output: {
    cleanDistPath: true,
    distPath: {
      root: "dist",
      js: "assets",
      jsAsync: "assets",
      css: "assets",
      cssAsync: "assets",
      svg: "assets",
      font: "assets",
      image: "assets",
      media: "assets",
      assets: "assets",
    },
    overrideBrowserslist: [
      "Chrome >= 109",
      "Edge >= 109",
      "Firefox >= 109",
      "Safari >= 16.4",
    ],
    sourceMap: {
      js: false,
      css: false,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
