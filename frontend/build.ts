import tailwind from "bun-plugin-tailwind";
import { rmSync } from "node:fs";
import { gzipSync } from "node:zlib";

// FE-28 measured 1,270,380 raw and 588,556 gzip bytes in three identical builds; 2% permits small edits without hiding dependency-sized growth.
const bundleBudget = { raw: 1_295_788, gzip: 600_328 };

rmSync("dist", { force: true, recursive: true });

const result = await Bun.build({
  // Without this Bun resolves React's development build, warnings and all, into production.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  entrypoints: ["./index.html"],
  loader: { ".woff2": "file" },
  metafile: true,
  minify: true,
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[dir]/[name].[ext]",
  },
  outdir: "./dist",
  plugins: [tailwind],
  // Go embeds and publicly serves every file under dist, so production ships no sources.
  sourcemap: "none",
  splitting: true,
  target: "browser",
  reactCompiler: true, // Enables automatic memoization
});

const metafile = result.metafile;
if (!result.success || !metafile) process.exit(1);
const outputPaths = new Set(result.outputs.map((output) => output.path));

// ponytail: Bun 1.4.0 inlines every CSS url() as a data URL and ignores loader ".woff2": "file",
// which forces all 13 Fontsource subsets into the render-blocking stylesheet. Extract them back
// out so the browser fetches only the subsets its unicode-range needs. Delete once Bun honours
// the file loader for CSS assets (oven-sh/bun; docs/bundler/html-static.mdx already claims it does).
for (const output of result.outputs.filter((file) => file.path.endsWith(".css"))) {
  const original = await output.text();
  const fonts = new Map<string, string>();
  const extracted = original.replace(
    /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g,
    (_match, base64: string) => {
      const bytes = Buffer.from(base64, "base64");
      const name = `font-${Bun.hash(bytes).toString(36)}.woff2`;
      fonts.set(name, base64);
      return `url(./${name})`;
    },
  );
  if (fonts.size === 0) continue;

  const directory = output.path.slice(0, output.path.lastIndexOf("/"));
  for (const [name, base64] of fonts) {
    const path = `${directory}/${name}`;
    await Bun.write(path, Buffer.from(base64, "base64"));
    outputPaths.add(path);
  }
  await Bun.write(output.path, extracted);
}

let rawBytes = 0;
let gzipBytes = 0;
for (const path of outputPaths) {
  const bytes = await Bun.file(path).bytes();
  rawBytes += bytes.byteLength;
  gzipBytes += gzipSync(bytes).byteLength;
}
if (rawBytes > bundleBudget.raw || gzipBytes > bundleBudget.gzip) {
  throw new Error(`Bundle budget exceeded: ${rawBytes}/${bundleBudget.raw} raw bytes, ${gzipBytes}/${bundleBudget.gzip} gzip bytes`);
}

const outputs = Object.entries(metafile.outputs).sort(([a], [b]) => a.localeCompare(b));
await Bun.write("bundle-analysis.json", JSON.stringify(metafile, null, 2));
await Bun.write(
  "bundle-analysis.md",
  `# Bun bundle analysis\n\n${rawBytes} / ${bundleBudget.raw} raw bytes. ${gzipBytes} / ${bundleBudget.gzip} gzip bytes.\n\n| Output | Bytes |\n| --- | ---: |\n${outputs.map(([path, output]) => `| ${path} | ${output.bytes} |`).join("\n")}\n`,
);
