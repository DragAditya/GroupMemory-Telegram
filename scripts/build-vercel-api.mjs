import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel-entry.ts"],
  outfile: "api/[...path].mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
});
