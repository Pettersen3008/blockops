import tailwind from "bun-plugin-tailwind";
import { rmSync } from "node:fs";

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
    await Bun.write(`${directory}/${name}`, Buffer.from(base64, "base64"));
  }
  await Bun.write(output.path, extracted);
}

const outputs = Object.entries(metafile.outputs).sort(([a], [b]) => a.localeCompare(b));
await Bun.write("bundle-analysis.json", JSON.stringify(metafile, null, 2));
await Bun.write(
  "bundle-analysis.md",
  `# Bun bundle analysis\n\n| Output | Bytes |\n| --- | ---: |\n${outputs.map(([path, output]) => `| ${path} | ${output.bytes} |`).join("\n")}\n`,
);
