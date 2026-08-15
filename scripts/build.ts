import { rm } from "node:fs/promises";

await rm("./dist", { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  external: ["next"],
  format: "esm",
  minify: true,
  outdir: "./dist",
  packages: "external",
  root: "./src",
  sourcemap: "external",
  splitting: false,
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Bun failed to build @hraness/vercel-delivery");
}
